/**
 * Sales.gs
 */

function listSales(token, filters) {
  requirePermission_(token, 'sales');
  filters = filters || {};
  const range = resolveDateRange_(filters.datePreset || 'this_year', filters.from, filters.to);
  return db_query(
    `SELECT s.*, c.customer_name FROM sales s
     JOIN customers c ON c.customer_id = s.customer_id
     WHERE s.sale_date BETWEEN ? AND ?
     ORDER BY s.sale_date DESC LIMIT 500`,
    [range.from, range.to]
  );
}

/**
 * Create a sale with multiple line items.
 * @param {Object} sale {customerId, saleDate, invoiceNumber, locationId, discount, tax, items:[{productId, quantity, unitPrice, discount, tax}]}
 */
function createSale(token, sale) {
  const session = requirePermission_(token, 'sales');
  validateRequired_(sale, ['customerId', 'saleDate', 'items']);
  if (!sale.items || sale.items.length === 0) throw new Error('At least one line item is required.');

  const cfg = getConfig_();
  const allowNegativeStock = (PropertiesService.getScriptProperties().getProperty('ALLOW_NEGATIVE_INVENTORY') === 'true');

  // Compute totals and validate stock server-side (never trust client totals)
  let subtotal = 0;
  sale.items.forEach(item => {
    validatePositive_(item.quantity, 'Quantity');
    validateNonNegative_(item.unitPrice, 'Unit price');
    item.totalAmount = round2_(item.quantity * item.unitPrice - (item.discount || 0) + (item.tax || 0));
    subtotal += item.totalAmount;

    if (!allowNegativeStock) {
      const stockRows = db_query(
        'SELECT current_stock FROM inventory WHERE product_id = ? AND location_id = ?',
        [item.productId, sale.locationId]
      );
      const available = stockRows.length ? stockRows[0].current_stock : 0;
      if (available < item.quantity) {
        throw new Error(`Insufficient stock for product ${item.productId}: available ${available}, requested ${item.quantity}`);
      }
    }
  });
  const grandTotal = round2_(subtotal - (sale.discount || 0) + (sale.tax || 0));
  const saleId = nextId_('SAL', 'sales', 'sale_id');

  db_transaction((tx) => {
    tx.execute(
      `INSERT INTO sales (sale_id, customer_id, sale_date, invoice_number, discount, tax, total_amount, payment_status, location_id)
       VALUES (?,?,?,?,?,?,?,?,?)`,
      [saleId, sale.customerId, sale.saleDate, sale.invoiceNumber || null,
       sale.discount || 0, sale.tax || 0, grandTotal, sale.paymentStatus || 'Unpaid', sale.locationId]
    );
    sale.items.forEach((item, i) => {
      const itemId = saleId + '-I' + (i + 1);
      tx.execute(
        `INSERT INTO sale_items (sale_item_id, sale_id, product_id, quantity, unit_price, discount, tax, total_amount)
         VALUES (?,?,?,?,?,?,?,?)`,
        [itemId, saleId, item.productId, item.quantity, item.unitPrice, item.discount || 0, item.tax || 0, item.totalAmount]
      );
      // reduce inventory
      tx.execute(
        `UPDATE inventory SET current_stock = current_stock - ?, updated_at = NOW()
         WHERE product_id = ? AND location_id = ?`,
        [item.quantity, item.productId, sale.locationId]
      );
    });
    return true;
  });

  logAudit_(session.userId, 'SALE_CREATED', 'sales', saleId, { total: grandTotal });
  CacheService.getScriptCache().removeAll(['dash_']); // best-effort; see note below
  return { saleId, totalAmount: grandTotal };
}

function round2_(n) { return Math.round(n * 100) / 100; }
