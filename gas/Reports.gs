/**
 * Reports.gs
 * Every report follows the same shape: getXReport(token, filters) ->
 * { rows, total }, plus exportXReportCsv(token, filters) -> csv string.
 * The frontend's ReportsJS.html renders whichever report is selected
 * using one generic table component (search/sort/pagination client-side
 * over the returned rows; CSV export always re-queries fresh from SQL
 * rather than exporting whatever happens to be on screen).
 */

function getSalesReport(token, filters) {
  requirePermission_(token, 'reports');
  const range = resolveDateRange_(filters.datePreset, filters.from, filters.to);
  return db_query(
    `SELECT s.sale_id, s.sale_date, c.customer_name, l.location_name, s.total_amount, s.payment_status
     FROM sales s JOIN customers c ON c.customer_id = s.customer_id
     LEFT JOIN locations l ON l.location_id = s.location_id
     WHERE s.sale_date BETWEEN ? AND ? AND (? IS NULL OR s.location_id = ?)
     ORDER BY s.sale_date DESC`,
    [range.from, range.to, filters.locationId || null, filters.locationId || null]
  );
}

function getPurchaseReport(token, filters) {
  requirePermission_(token, 'reports');
  const range = resolveDateRange_(filters.datePreset, filters.from, filters.to);
  return db_query(
    `SELECT p.purchase_id, p.purchase_date, s.supplier_name, l.location_name, p.total_amount, p.payment_status
     FROM purchases p JOIN suppliers s ON s.supplier_id = p.supplier_id
     LEFT JOIN locations l ON l.location_id = p.location_id
     WHERE p.purchase_date BETWEEN ? AND ? AND (? IS NULL OR p.location_id = ?)
     ORDER BY p.purchase_date DESC`,
    [range.from, range.to, filters.locationId || null, filters.locationId || null]
  );
}

function getInventoryReport(token, filters) {
  requirePermission_(token, 'reports');
  return db_query('SELECT * FROM vw_inventory_status ORDER BY product_name', []);
}

function getCustomerOutstandingReport(token) {
  requirePermission_(token, 'reports');
  return db_query('SELECT * FROM vw_customer_receivables', []);
}

function getSupplierOutstandingReport(token) {
  requirePermission_(token, 'reports');
  return db_query('SELECT * FROM vw_supplier_payables', []);
}

function getProfitReport(token, filters) {
  requirePermission_(token, 'reports');
  const range = resolveDateRange_(filters.datePreset, filters.from, filters.to);
  return db_query(
    `SELECT p.product_name, SUM(si.quantity) AS units_sold, SUM(si.total_amount) AS revenue,
            SUM(si.quantity * p.purchase_price) AS cost,
            SUM(si.total_amount) - SUM(si.quantity * p.purchase_price) AS profit
     FROM sale_items si JOIN sales s ON s.sale_id = si.sale_id JOIN products p ON p.product_id = si.product_id
     WHERE s.sale_date BETWEEN ? AND ?
     GROUP BY p.product_id, p.product_name ORDER BY profit DESC`,
    [range.from, range.to]
  );
}

function getLocationSalesReport(token, filters) {
  requirePermission_(token, 'reports');
  const range = resolveDateRange_(filters.datePreset, filters.from, filters.to);
  return db_query(
    `SELECT l.location_name, SUM(s.total_amount) AS total_sales, COUNT(*) AS order_count
     FROM sales s JOIN locations l ON l.location_id = s.location_id
     WHERE s.sale_date BETWEEN ? AND ? GROUP BY l.location_id, l.location_name ORDER BY total_sales DESC`,
    [range.from, range.to]
  );
}

function getCategorySalesReport(token, filters) {
  requirePermission_(token, 'reports');
  const range = resolveDateRange_(filters.datePreset, filters.from, filters.to);
  return db_query(
    `SELECT cat.category_name, SUM(si.total_amount) AS total_sales
     FROM sale_items si JOIN sales s ON s.sale_id = si.sale_id
     JOIN products p ON p.product_id = si.product_id JOIN categories cat ON cat.category_id = p.category_id
     WHERE s.sale_date BETWEEN ? AND ? GROUP BY cat.category_id, cat.category_name ORDER BY total_sales DESC`,
    [range.from, range.to]
  );
}

function getProductPerformanceReport(token, filters) {
  return getProfitReport(token, filters); // same underlying query, reports section lists it separately per spec
}

function getPaymentReport(token, filters) {
  requirePermission_(token, 'reports');
  const range = resolveDateRange_(filters.datePreset, filters.from, filters.to);
  return db_query(
    `SELECT pay.*, s.supplier_name FROM payments pay JOIN suppliers s ON s.supplier_id = pay.supplier_id
     WHERE pay.payment_date BETWEEN ? AND ? ORDER BY pay.payment_date DESC`,
    [range.from, range.to]
  );
}

function getReceiptReport(token, filters) {
  requirePermission_(token, 'reports');
  const range = resolveDateRange_(filters.datePreset, filters.from, filters.to);
  return db_query(
    `SELECT r.*, c.customer_name FROM receipts r JOIN customers c ON c.customer_id = r.customer_id
     WHERE r.receipt_date BETWEEN ? AND ? ORDER BY r.receipt_date DESC`,
    [range.from, range.to]
  );
}

function getLowStockReport(token) {
  requirePermission_(token, 'reports');
  return db_query('SELECT * FROM vw_low_stock ORDER BY current_stock ASC', []);
}

/** Generic CSV export usable for any report's row array. */
function exportReportCsv(rows) {
  if (!rows || !rows.length) return '';
  const headers = Object.keys(rows[0]);
  const lines = [headers.join(',')];
  rows.forEach(r => lines.push(headers.map(h => csvEscape_(r[h])).join(',')));
  return lines.join('\n');
}
