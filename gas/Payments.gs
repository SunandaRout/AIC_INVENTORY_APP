/**
 * Payments.gs
 * Mirror of Receipts.gs for the supplier side. Payable is derived
 * (see vw_supplier_payables), so inserting a payment is enough.
 */

function listPayments(token, filters) {
  requirePermission_(token, 'payments');
  filters = filters || {};
  const range = resolveDateRange_(filters.datePreset || 'this_year', filters.from, filters.to);
  return db_query(
    `SELECT p.*, s.supplier_name FROM payments p
     JOIN suppliers s ON s.supplier_id = p.supplier_id
     WHERE p.payment_date BETWEEN ? AND ? ORDER BY p.payment_date DESC LIMIT 500`,
    [range.from, range.to]
  );
}

function createPayment(token, payment) {
  const session = requirePermission_(token, 'payments');
  validateRequired_(payment, ['supplierId', 'paymentDate', 'amount']);
  validatePositive_(payment.amount, 'Amount');
  if (!PAYMENT_METHODS.includes(payment.paymentMethod)) throw new Error('Invalid payment method.');

  const paymentId = nextId_('PAY', 'payments', 'payment_id');
  db_execute(
    `INSERT INTO payments (payment_id, supplier_id, payment_date, amount, payment_method, reference_number, notes)
     VALUES (?,?,?,?,?,?,?)`,
    [paymentId, payment.supplierId, payment.paymentDate, payment.amount, payment.paymentMethod,
     payment.referenceNumber || null, payment.notes || null]
  );
  logAudit_(session.userId, 'PAYMENT_CREATED', 'payments', paymentId, { amount: payment.amount });
  return { paymentId };
}
