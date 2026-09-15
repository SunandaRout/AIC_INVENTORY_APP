/**
 * Receipts.gs
 * Receivable is DERIVED (opening_balance + sales - receipts, see
 * vw_customer_receivables) rather than stored, so a new receipt just
 * needs to be inserted — the outstanding balance recalculates itself
 * on the next read. No separate "update balance" step needed.
 */

function listReceipts(token, filters) {
  requirePermission_(token, 'receipts');
  filters = filters || {};
  const range = resolveDateRange_(filters.datePreset || 'this_year', filters.from, filters.to);
  return db_query(
    `SELECT r.*, c.customer_name FROM receipts r
     JOIN customers c ON c.customer_id = r.customer_id
     WHERE r.receipt_date BETWEEN ? AND ? ORDER BY r.receipt_date DESC LIMIT 500`,
    [range.from, range.to]
  );
}

const PAYMENT_METHODS = ['Cash', 'Bank Transfer', 'UPI', 'Card', 'Cheque', 'Other'];

function createReceipt(token, receipt) {
  const session = requirePermission_(token, 'receipts');
  validateRequired_(receipt, ['customerId', 'receiptDate', 'amount']);
  validatePositive_(receipt.amount, 'Amount');
  if (!PAYMENT_METHODS.includes(receipt.paymentMethod)) throw new Error('Invalid payment method.');

  const receiptId = nextId_('RCT', 'receipts', 'receipt_id');
  db_execute(
    `INSERT INTO receipts (receipt_id, customer_id, receipt_date, amount, payment_method, reference_number, notes)
     VALUES (?,?,?,?,?,?,?)`,
    [receiptId, receipt.customerId, receipt.receiptDate, receipt.amount, receipt.paymentMethod,
     receipt.referenceNumber || null, receipt.notes || null]
  );
  logAudit_(session.userId, 'RECEIPT_CREATED', 'receipts', receiptId, { amount: receipt.amount });
  return { receiptId };
}
