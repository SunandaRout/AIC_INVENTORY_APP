/**
 * Dashboard.gs
 * getDashboardData() is the ONLY call the dashboard page makes. It
 * returns everything the UI needs in one payload (see section 19 of
 * the spec) so we don't fire 10 separate queries per filter change.
 * Results are cached for 60s per unique filter combination.
 */

function getDashboardData(token, filters) {
  requirePermission_(token, 'dashboard');
  filters = filters || {};
  const range = resolveDateRange_(filters.datePreset || 'this_year', filters.from, filters.to);
  const locationId = filters.locationId || null;
  const categoryId = filters.categoryId || null;

  const cacheKey = 'dash_' + JSON.stringify({ range, locationId, categoryId });
  const cache = CacheService.getScriptCache();
  const cached = cache.get(cacheKey);
  if (cached) return JSON.parse(cached);

  const kpis = getKpis_(range, locationId);
  const salesTrend = db_query(
    `SELECT DATE_FORMAT(sale_date, '%Y-%m') AS month, SUM(total_amount) AS sales
     FROM sales WHERE sale_date BETWEEN ? AND ? AND (? IS NULL OR location_id = ?)
     GROUP BY month ORDER BY month`,
    [range.from, range.to, locationId, locationId]
  );

  const topCustomers = db_query(
    `SELECT c.customer_name AS name, SUM(s.total_amount) AS value
     FROM sales s JOIN customers c ON c.customer_id = s.customer_id
     WHERE s.sale_date BETWEEN ? AND ? AND (? IS NULL OR s.location_id = ?)
     GROUP BY c.customer_id, c.customer_name ORDER BY value DESC LIMIT 10`,
    [range.from, range.to, locationId, locationId]
  );

  const purchaseByLocation = db_query(
    `SELECT l.location_name AS name, SUM(p.total_amount) AS value
     FROM purchases p JOIN locations l ON l.location_id = p.location_id
     WHERE p.purchase_date BETWEEN ? AND ?
     GROUP BY l.location_id, l.location_name ORDER BY value DESC`,
    [range.from, range.to]
  );

  const salesByLocation = db_query(
    `SELECT l.location_name AS name, SUM(s.total_amount) AS value
     FROM sales s JOIN locations l ON l.location_id = s.location_id
     WHERE s.sale_date BETWEEN ? AND ?
     GROUP BY l.location_id, l.location_name ORDER BY value DESC`,
    [range.from, range.to]
  );

  const salesByCategory = db_query(
    `SELECT cat.category_name AS name, SUM(si.total_amount) AS value
     FROM sale_items si JOIN sales s ON s.sale_id = si.sale_id
     JOIN products p ON p.product_id = si.product_id
     JOIN categories cat ON cat.category_id = p.category_id
     WHERE s.sale_date BETWEEN ? AND ? AND (? IS NULL OR s.location_id = ?)
     GROUP BY cat.category_id, cat.category_name ORDER BY value DESC`,
    [range.from, range.to, locationId, locationId]
  );

  const salesByCity = db_query(
    `SELECT l.city AS name, SUM(s.total_amount) AS value
     FROM sales s JOIN locations l ON l.location_id = s.location_id
     WHERE s.sale_date BETWEEN ? AND ?
     GROUP BY l.city ORDER BY value DESC`,
    [range.from, range.to]
  );

  const topProducts = db_query(
    `SELECT p.product_name AS name, SUM(si.total_amount) AS value
     FROM sale_items si JOIN sales s ON s.sale_id = si.sale_id
     JOIN products p ON p.product_id = si.product_id
     WHERE s.sale_date BETWEEN ? AND ? AND (? IS NULL OR (? IS NULL OR p.category_id = ?))
     GROUP BY p.product_id, p.product_name ORDER BY value DESC LIMIT 10`,
    [range.from, range.to, categoryId, categoryId, categoryId]
  );

  const inventoryStatus = db_query(
    `SELECT product_name AS product, current_stock AS stock, reorder_level AS reorder
     FROM vw_inventory_status ORDER BY current_stock ASC LIMIT 15`, []
  );

  const paymentCollection = db_query('SELECT * FROM vw_payment_collection', [])[0] || {};

  const result = {
    kpis, salesTrend, topCustomers, purchaseByLocation, salesByLocation,
    salesByCategory, salesByCity, topProducts, inventoryStatus, paymentCollection,
    resolvedRange: range,
  };

  cache.put(cacheKey, JSON.stringify(result), 60);
  return result;
}

function getKpis_(range, locationId) {
  const totals = db_query(
    `SELECT
       (SELECT COALESCE(SUM(total_amount),0) FROM sales WHERE sale_date BETWEEN ? AND ? AND (? IS NULL OR location_id = ?)) AS total_sales,
       (SELECT COALESCE(SUM(total_amount),0) FROM purchases WHERE purchase_date BETWEEN ? AND ? AND (? IS NULL OR location_id = ?)) AS total_purchases`,
    [range.from, range.to, locationId, locationId, range.from, range.to, locationId, locationId]
  )[0];

  const cogs = db_query(
    `SELECT COALESCE(SUM(si.quantity * p.purchase_price),0) AS cogs
     FROM sale_items si JOIN sales s ON s.sale_id = si.sale_id
     JOIN products p ON p.product_id = si.product_id
     WHERE s.sale_date BETWEEN ? AND ? AND (? IS NULL OR s.location_id = ?)`,
    [range.from, range.to, locationId, locationId]
  )[0].cogs;

  const summary = db_query('SELECT * FROM vw_dashboard_summary', [])[0] || {};

  return {
    totalSales: totals.total_sales,
    totalPurchases: totals.total_purchases,
    netProfit: totals.total_sales - cogs,
    totalReceivable: summary.total_receivable || 0,   // as-of-today balance, not range-filtered
    totalPayable: summary.total_payable || 0,          // as-of-today balance, not range-filtered
    topSalesLocation: summary.top_sales_location || '',
  };
}
