/**
 * Suppliers.gs
 */

function listSuppliers(token, opts) {
  requirePermission_(token, 'suppliers');
  opts = opts || {};
  const where = []; const params = [];
  if (opts.search) { where.push('supplier_name LIKE ?'); params.push(`%${opts.search}%`); }
  const whereClause = where.length ? 'WHERE ' + where.join(' AND ') : '';
  return db_query(`SELECT * FROM suppliers ${whereClause} ORDER BY supplier_name LIMIT 500`, params);
}

function getSupplierDetails(token, supplierId) {
  requirePermission_(token, 'suppliers');
  const supplier = db_query('SELECT * FROM suppliers WHERE supplier_id = ?', [supplierId])[0];
  const purchaseHistory = db_query('SELECT * FROM purchases WHERE supplier_id = ? ORDER BY purchase_date DESC LIMIT 100', [supplierId]);
  const paymentHistory = db_query('SELECT * FROM payments WHERE supplier_id = ? ORDER BY payment_date DESC LIMIT 100', [supplierId]);
  const outstanding = db_query('SELECT outstanding_balance FROM vw_supplier_payables WHERE supplier_id = ?', [supplierId]);
  return {
    supplier, purchaseHistory, paymentHistory,
    outstandingPayable: outstanding.length ? outstanding[0].outstanding_balance : 0,
  };
}

function createSupplier(token, supplier) {
  const session = requirePermission_(token, 'suppliers');
  validateRequired_(supplier, ['supplierName']);
  if (supplier.email) validateEmail_(supplier.email);
  const supplierId = nextId_('SUP', 'suppliers', 'supplier_id');
  db_execute(
    `INSERT INTO suppliers (supplier_id, supplier_name, phone, email, address, city, state, country, gst_number, opening_balance, status)
     VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
    [supplierId, supplier.supplierName, supplier.phone || null, supplier.email || null, supplier.address || null,
     supplier.city || null, supplier.state || null, supplier.country || null, supplier.gstNumber || null,
     supplier.openingBalance || 0, 'Active']
  );
  logAudit_(session.userId, 'SUPPLIER_CREATED', 'suppliers', supplierId);
  return { supplierId };
}

function updateSupplier(token, supplierId, changes) {
  const session = requirePermission_(token, 'suppliers');
  const allowed = ['supplier_name','phone','email','address','city','state','country','gst_number','status'];
  const setCols = Object.keys(changes).filter(k => allowed.includes(k));
  if (!setCols.length) return { ok: true };
  db_execute(`UPDATE suppliers SET ${setCols.map(c => c + ' = ?').join(', ')} WHERE supplier_id = ?`,
    [...setCols.map(c => changes[c]), supplierId]);
  logAudit_(session.userId, 'SUPPLIER_UPDATED', 'suppliers', supplierId, changes);
  return { ok: true };
}

function deleteSupplier(token, supplierId) {
  const session = requirePermission_(token, 'suppliers');
  db_execute('UPDATE suppliers SET status = "Inactive" WHERE supplier_id = ?', [supplierId]);
  logAudit_(session.userId, 'SUPPLIER_DELETED', 'suppliers', supplierId);
  return { ok: true };
}
