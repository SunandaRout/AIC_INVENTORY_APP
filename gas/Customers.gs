/**
 * Customers.gs
 */

function listCustomers(token, opts) {
  requirePermission_(token, 'customers');
  opts = opts || {};
  const where = []; const params = [];
  if (opts.search) { where.push('customer_name LIKE ?'); params.push(`%${opts.search}%`); }
  const whereClause = where.length ? 'WHERE ' + where.join(' AND ') : '';
  return db_query(`SELECT * FROM customers ${whereClause} ORDER BY customer_name LIMIT 500`, params);
}

function getCustomerDetails(token, customerId) {
  requirePermission_(token, 'customers');
  const customer = db_query('SELECT * FROM customers WHERE customer_id = ?', [customerId])[0];
  const salesHistory = db_query('SELECT * FROM sales WHERE customer_id = ? ORDER BY sale_date DESC LIMIT 100', [customerId]);
  const receiptHistory = db_query('SELECT * FROM receipts WHERE customer_id = ? ORDER BY receipt_date DESC LIMIT 100', [customerId]);
  const outstanding = db_query('SELECT outstanding_balance FROM vw_customer_receivables WHERE customer_id = ?', [customerId]);
  return {
    customer, salesHistory, receiptHistory,
    outstandingReceivable: outstanding.length ? outstanding[0].outstanding_balance : 0,
    creditAvailable: customer ? customer.credit_limit - (outstanding.length ? outstanding[0].outstanding_balance : 0) : 0,
  };
}

function createCustomer(token, customer) {
  const session = requirePermission_(token, 'customers');
  validateRequired_(customer, ['customerName']);
  if (customer.email) validateEmail_(customer.email);
  const customerId = nextId_('CUS', 'customers', 'customer_id');
  db_execute(
    `INSERT INTO customers (customer_id, customer_name, phone, email, address, city, state, country, gst_number, credit_limit, opening_balance, status)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
    [customerId, customer.customerName, customer.phone || null, customer.email || null, customer.address || null,
     customer.city || null, customer.state || null, customer.country || null, customer.gstNumber || null,
     customer.creditLimit || 0, customer.openingBalance || 0, 'Active']
  );
  logAudit_(session.userId, 'CUSTOMER_CREATED', 'customers', customerId);
  return { customerId };
}

function updateCustomer(token, customerId, changes) {
  const session = requirePermission_(token, 'customers');
  const allowed = ['customer_name','phone','email','address','city','state','country','gst_number','credit_limit','status'];
  const setCols = Object.keys(changes).filter(k => allowed.includes(k));
  if (!setCols.length) return { ok: true };
  db_execute(`UPDATE customers SET ${setCols.map(c => c + ' = ?').join(', ')} WHERE customer_id = ?`,
    [...setCols.map(c => changes[c]), customerId]);
  logAudit_(session.userId, 'CUSTOMER_UPDATED', 'customers', customerId, changes);
  return { ok: true };
}

function deleteCustomer(token, customerId) {
  const session = requirePermission_(token, 'customers');
  db_execute('UPDATE customers SET status = "Inactive" WHERE customer_id = ?', [customerId]);
  logAudit_(session.userId, 'CUSTOMER_DELETED', 'customers', customerId);
  return { ok: true };
}
