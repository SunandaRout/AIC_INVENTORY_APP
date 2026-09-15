/**
 * Inventory.gs
 */

function listInventory(token, opts) {
  requirePermission_(token, 'inventory');
  opts = opts || {};
  const page = opts.page || 1;
  const pageSize = opts.pageSize || 25;
  const offset = (page - 1) * pageSize;

  const where = [];
  const params = [];
  if (opts.search) {
    where.push('(p.product_name LIKE ? OR p.sku LIKE ?)');
    params.push(`%${opts.search}%`, `%${opts.search}%`);
  }
  if (opts.categoryId) { where.push('p.category_id = ?'); params.push(opts.categoryId); }
  if (opts.locationId) { where.push('i.location_id = ?'); params.push(opts.locationId); }
  if (opts.status) { where.push('vw.stock_status = ?'); params.push(opts.status); }
  const whereClause = where.length ? 'WHERE ' + where.join(' AND ') : '';

  const rows = db_query(
    `SELECT vw.* FROM vw_inventory_status vw
     JOIN inventory i ON i.inventory_id = vw.inventory_id
     JOIN products p ON p.product_id = vw.product_id
     ${whereClause}
     ORDER BY vw.product_name
     LIMIT ? OFFSET ?`,
    [...params, pageSize, offset]
  );
  const countRow = db_query(
    `SELECT COUNT(*) AS n FROM vw_inventory_status vw
     JOIN inventory i ON i.inventory_id = vw.inventory_id
     JOIN products p ON p.product_id = vw.product_id
     ${whereClause}`,
    params
  )[0];

  return { rows, total: countRow.n, page, pageSize };
}

function adjustStock(token, productId, locationId, delta, reason) {
  const session = requirePermission_(token, 'inventory');
  validateRequired_({ productId, locationId, delta }, ['productId', 'locationId', 'delta']);
  db_execute(
    'UPDATE inventory SET current_stock = current_stock + ?, updated_at = NOW() WHERE product_id = ? AND location_id = ?',
    [delta, productId, locationId]
  );
  logAudit_(session.userId, 'INVENTORY_ADJUSTED', 'inventory', productId, { locationId, delta, reason });
  return { ok: true };
}

function createProduct(token, product) {
  const session = requirePermission_(token, 'inventory');
  validateRequired_(product, ['sku', 'productName', 'categoryId', 'purchasePrice', 'salePrice']);
  validateNonNegative_(product.purchasePrice, 'Purchase price');
  validateNonNegative_(product.salePrice, 'Sale price');
  const dup = db_query('SELECT product_id FROM products WHERE sku = ?', [product.sku]);
  if (dup.length) throw new Error(`SKU "${product.sku}" already exists.`);

  const productId = nextId_('PRD', 'products', 'product_id');
  db_execute(
    `INSERT INTO products (product_id, sku, product_name, category_id, brand, unit, purchase_price, sale_price, reorder_level, supplier_id, status)
     VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
    [productId, product.sku, product.productName, product.categoryId, product.brand || null, product.unit || 'pcs',
     product.purchasePrice, product.salePrice, product.reorderLevel || 0, product.supplierId || null, 'Active']
  );
  logAudit_(session.userId, 'PRODUCT_CREATED', 'products', productId);
  return { productId };
}

function updateProduct(token, productId, changes) {
  const session = requirePermission_(token, 'inventory');
  const allowed = ['product_name', 'category_id', 'brand', 'unit', 'purchase_price', 'sale_price', 'reorder_level', 'supplier_id', 'status'];
  const setCols = Object.keys(changes).filter(k => allowed.includes(k));
  if (!setCols.length) return { ok: true };
  const setClause = setCols.map(c => `${c} = ?`).join(', ');
  db_execute(`UPDATE products SET ${setClause}, updated_at = NOW() WHERE product_id = ?`,
    [...setCols.map(c => changes[c]), productId]);
  logAudit_(session.userId, 'PRODUCT_UPDATED', 'products', productId, changes);
  return { ok: true };
}

function deleteProduct(token, productId) {
  const session = requirePermission_(token, 'inventory');
  db_execute('UPDATE products SET status = "Inactive" WHERE product_id = ?', [productId]); // soft delete
  logAudit_(session.userId, 'PRODUCT_DELETED', 'products', productId);
  return { ok: true };
}

function exportInventoryCsv(token, opts) {
  const data = listInventory(token, Object.assign({}, opts, { page: 1, pageSize: 100000 }));
  if (!data.rows.length) return '';
  const headers = Object.keys(data.rows[0]);
  const lines = [headers.join(',')];
  data.rows.forEach(r => lines.push(headers.map(h => csvEscape_(r[h])).join(',')));
  return lines.join('\n');
}

function csvEscape_(v) {
  if (v === null || v === undefined) return '';
  const s = String(v);
  return /[,"\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}
