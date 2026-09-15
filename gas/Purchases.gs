/**
 * Purchases.gs
 */

function listPurchases(token, filters) {
  requirePermission_(token, 'purchases');
  filters = filters || {};
  const range = resolveDateRange_(filters.datePreset || 'this_year', filters.from, filters.to);
  return db_query(
    `SELECT p.*, s.supplier_name FROM purchases p
     JOIN suppliers s ON s.supplier_id = p.supplier_id
     WHERE p.purchase_date BETWEEN ? AND ?
     ORDER BY p.purchase_date DESC LIMIT 500`,
    [range.from, range.to]
  );
}

/**
 * @param {Object} purchase {supplierId, purchaseDate, invoiceNumber, locationId, discount, tax, items:[{productId, quantity, unitPrice, discount, tax}]}
 */
function createPurchase(token, purchase) {
  const session = requirePermission_(token, 'purchases');
  validateRequired_(purchase, ['supplierId', 'purchaseDate', 'items']);
  if (!purchase.items || purchase.items.length === 0) throw new Error('At least one line item is required.');

  let subtotal = 0;
  purchase.items.forEach(item => {
    validatePositive_(item.quantity, 'Quantity');
    validateNonNegative_(item.unitPrice, 'Unit price');
    item.totalAmount = round2_(item.quantity * item.unitPrice - (item.discount || 0) + (item.tax || 0));
    subtotal += item.totalAmount;
  });
  const grandTotal = round2_(subtotal - (purchase.discount || 0) + (purchase.tax || 0));
  const purchaseId = nextId_('PUR', 'purchases', 'purchase_id');

  db_transaction((tx) => {
    tx.execute(
      `INSERT INTO purchases (purchase_id, supplier_id, purchase_date, invoice_number, discount, tax, total_amount, payment_status, location_id)
       VALUES (?,?,?,?,?,?,?,?,?)`,
      [purchaseId, purchase.supplierId, purchase.purchaseDate, purchase.invoiceNumber || null,
       purchase.discount || 0, purchase.tax || 0, grandTotal, purchase.paymentStatus || 'Unpaid', purchase.locationId]
    );
    purchase.items.forEach((item, i) => {
      const itemId = purchaseId + '-I' + (i + 1);
      tx.execute(
        `INSERT INTO purchase_items (purchase_item_id, purchase_id, product_id, quantity, unit_price, discount, tax, total_amount)
         VALUES (?,?,?,?,?,?,?,?)`,
        [itemId, purchaseId, item.productId, item.quantity, item.unitPrice, item.discount || 0, item.tax || 0, item.totalAmount]
      );
      // increase inventory (upsert row if it doesn't exist for this product/location yet)
      const existing = db_query(
        'SELECT inventory_id FROM inventory WHERE product_id = ? AND location_id = ?',
        [item.productId, purchase.locationId]
      );
      if (existing.length) {
        tx.execute(
          `UPDATE inventory SET current_stock = current_stock + ?, updated_at = NOW()
           WHERE product_id = ? AND location_id = ?`,
          [item.quantity, item.productId, purchase.locationId]
        );
      } else {
        tx.execute(
          `INSERT INTO inventory (inventory_id, product_id, location_id, opening_stock, current_stock, reorder_level)
           VALUES (?,?,?,?,?,?)`,
          [Utilities.getUuid(), item.productId, purchase.locationId, 0, item.quantity, 0]
        );
      }
    });
    return true;
  });

  logAudit_(session.userId, 'PURCHASE_CREATED', 'purchases', purchaseId, { total: grandTotal });
  return { purchaseId, totalAmount: grandTotal };
}
