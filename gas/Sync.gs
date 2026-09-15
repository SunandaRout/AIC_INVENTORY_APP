/**
 * Sync.gs
 * Google Sheets is the operational entry point; SQL is the analytics
 * source of truth. Each syncXToSQL() function is idempotent — it
 * detects new vs. changed rows by ID and upserts, so re-running is
 * always safe. It never deletes rows on the SQL side; deletions are a
 * deliberate admin action, not an automatic sync side-effect.
 */

function syncAllToSQL() {
  const results = {};
  results.categories = syncCategoriesToSQL();
  results.suppliers = syncSuppliersToSQL();
  results.customers = syncCustomersToSQL();
  results.products = syncProductsToSQL();
  results.inventory = syncInventoryToSQL();
  results.purchases = syncPurchasesToSQL();
  results.sales = syncSalesToSQL();
  results.receipts = syncReceiptsToSQL();
  results.payments = syncPaymentsToSQL();
  PropertiesService.getScriptProperties().setProperty('LAST_SYNC_AT', new Date().toISOString());
  return results;
}

function syncCategoriesToSQL() {
  return syncSheetToTable_('Categories', 'categories', 'category_id', [
    'category_id', 'category_name', 'description', 'status'
  ]);
}

function syncSuppliersToSQL() {
  return syncSheetToTable_('Suppliers', 'suppliers', 'supplier_id', [
    'supplier_id','supplier_name','phone','email','address','city','state','country',
    'gst_number','opening_balance','status'
  ]);
}

function syncCustomersToSQL() {
  return syncSheetToTable_('Customers', 'customers', 'customer_id', [
    'customer_id','customer_name','phone','email','address','city','state','country',
    'gst_number','credit_limit','opening_balance','status'
  ]);
}

function syncProductsToSQL() {
  validateNoDuplicateSku_();
  return syncSheetToTable_('Products', 'products', 'product_id', [
    'product_id','sku','product_name','category_id','brand','unit',
    'purchase_price','sale_price','reorder_level','supplier_id','status'
  ]);
}

function syncInventoryToSQL() {
  const sheet = SpreadsheetApp.openById(getConfig_().sheetId).getSheetByName('Inventory');
  const data = sheet.getDataRange().getValues();
  const header = data.shift();
  const idx = (name) => header.indexOf(name);
  let inserted = 0, updated = 0, failed = 0;
  const errors = [];

  data.forEach((row) => {
    try {
      const productId = row[idx('product_id')];
      const locationCode = lookupLocationIdByName_(row[idx('location')] || row[idx('warehouse')]);
      if (!productId || !locationCode) { failed++; return; }

      const existing = db_query(
        'SELECT inventory_id FROM inventory WHERE product_id = ? AND location_id = ?',
        [productId, locationCode]
      );
      const params = [
        productId, locationCode,
        row[idx('opening_stock')] || 0,
        row[idx('current_stock')] || 0,
        row[idx('reorder_level')] || 0,
      ];
      if (existing.length) {
        db_execute(
          `UPDATE inventory SET opening_stock=?, current_stock=?, reorder_level=?, updated_at=NOW()
           WHERE product_id=? AND location_id=?`,
          [params[2], params[3], params[4], productId, locationCode]
        );
        updated++;
      } else {
        db_execute(
          `INSERT INTO inventory (inventory_id, product_id, location_id, opening_stock, current_stock, reorder_level)
           VALUES (?,?,?,?,?,?)`,
          [row[idx('inventory_id')] || Utilities.getUuid(), productId, locationCode, params[2], params[3], params[4]]
        );
        inserted++;
      }
    } catch (e) {
      failed++;
      errors.push(e.message);
    }
  });

  return logSyncResult_('Inventory', inserted, updated, failed, errors);
}

function syncPurchasesToSQL() {
  return syncTransactionToTable_('Purchases', 'purchases', 'purchase_id', {
    supplier_id: 'supplier_id', purchase_date: 'purchase_date', invoice_number: 'invoice_number',
    discount: 'discount', tax: 'tax', total_amount: 'total_amount',
    payment_status: 'payment_status', location_id: 'location_id'
  });
}

function syncSalesToSQL() {
  return syncTransactionToTable_('Sales', 'sales', 'sale_id', {
    customer_id: 'customer_id', sale_date: 'sale_date', invoice_number: 'invoice_number',
    discount: 'discount', tax: 'tax', total_amount: 'total_amount',
    payment_status: 'payment_status', location_id: 'location_id'
  });
}

function syncReceiptsToSQL() {
  return syncSheetToTable_('Receipts', 'receipts', 'receipt_id', [
    'receipt_id','customer_id','receipt_date','amount','payment_method','reference_number','notes'
  ]);
}

function syncPaymentsToSQL() {
  return syncSheetToTable_('Payments', 'payments', 'payment_id', [
    'payment_id','supplier_id','payment_date','amount','payment_method','reference_number','notes'
  ]);
}

/** Generic upsert: sheet row -> SQL table, matched by a single ID column. */
function syncSheetToTable_(sheetName, tableName, idField, columns) {
  const started = new Date();
  const sheet = SpreadsheetApp.openById(getConfig_().sheetId).getSheetByName(sheetName);
  const data = sheet.getDataRange().getValues();
  const header = data.shift();
  const idx = (name) => header.indexOf(name);

  let inserted = 0, updated = 0, failed = 0;
  const errors = [];

  data.forEach((row) => {
    try {
      const id = row[idx(idField)];
      if (!id) { failed++; errors.push('Row missing ' + idField); return; }
      const values = columns.map(c => row[idx(c)]);
      const existing = db_query(`SELECT ${idField} FROM ${tableName} WHERE ${idField} = ?`, [id]);
      if (existing.length) {
        const setClause = columns.filter(c => c !== idField).map(c => `${c} = ?`).join(', ');
        const updateVals = columns.filter(c => c !== idField).map(c => row[idx(c)]);
        db_execute(`UPDATE ${tableName} SET ${setClause} WHERE ${idField} = ?`, [...updateVals, id]);
        updated++;
      } else {
        const placeholders = columns.map(() => '?').join(',');
        db_execute(`INSERT INTO ${tableName} (${columns.join(',')}) VALUES (${placeholders})`, values);
        inserted++;
      }
    } catch (e) {
      failed++;
      errors.push(e.message);
    }
  });

  return logSyncResult_(sheetName, inserted, updated, failed, errors, started);
}

/** Transaction sheets (Purchases/Sales) sync the header row only — line items are written directly via the app's own Purchases.gs/Sales.gs, not synced from Sheets, to avoid double-booking inventory. */
function syncTransactionToTable_(sheetName, tableName, idField, fieldMap) {
  const started = new Date();
  const sheet = SpreadsheetApp.openById(getConfig_().sheetId).getSheetByName(sheetName);
  const data = sheet.getDataRange().getValues();
  const header = data.shift();
  const idx = (name) => header.indexOf(name);
  const sqlCols = Object.keys(fieldMap);

  let inserted = 0, updated = 0, failed = 0;
  const errors = [];

  data.forEach((row) => {
    try {
      const id = row[idx(idField)];
      if (!id) { failed++; return; }
      const values = sqlCols.map(sqlCol => row[idx(fieldMap[sqlCol])]);
      const existing = db_query(`SELECT ${idField} FROM ${tableName} WHERE ${idField} = ?`, [id]);
      if (existing.length) {
        const setClause = sqlCols.map(c => `${c} = ?`).join(', ');
        db_execute(`UPDATE ${tableName} SET ${setClause} WHERE ${idField} = ?`, [...values, id]);
        updated++;
      } else {
        const placeholders = sqlCols.map(() => '?').join(',');
        db_execute(`INSERT INTO ${tableName} (${idField}, ${sqlCols.join(',')}) VALUES (?, ${placeholders})`, [id, ...values]);
        inserted++;
      }
    } catch (e) {
      failed++;
      errors.push(e.message);
    }
  });

  return logSyncResult_(sheetName, inserted, updated, failed, errors, started);
}

function logSyncResult_(sheetName, inserted, updated, failed, errors, startedAt) {
  const finished = new Date();
  const status = failed === 0 ? 'SUCCESS' : (inserted + updated > 0 ? 'PARTIAL' : 'FAILED');
  db_execute(
    `INSERT INTO sync_log (sheet_name, started_at, finished_at, rows_inserted, rows_updated, rows_failed, status, error_details)
     VALUES (?,?,?,?,?,?,?,?)`,
    [sheetName, startedAt || new Date(), finished, inserted, updated, failed, status, errors.join(' | ').slice(0, 2000)]
  );
  return { sheetName, inserted, updated, failed, status, errors: errors.slice(0, 20) };
}

function getLastSyncStatus() {
  return db_query('SELECT * FROM sync_log ORDER BY sync_id DESC LIMIT 20', []);
}

function validateNoDuplicateSku_() {
  const sheet = SpreadsheetApp.openById(getConfig_().sheetId).getSheetByName('Products');
  const data = sheet.getDataRange().getValues();
  const header = data.shift();
  const skuIdx = header.indexOf('sku');
  const seen = new Set();
  data.forEach((row, i) => {
    const sku = row[skuIdx];
    if (seen.has(sku)) throw new Error(`Duplicate SKU "${sku}" found in Products sheet at row ${i + 2}`);
    seen.add(sku);
  });
}

function lookupLocationIdByName_(name) {
  if (!name) return null;
  const rows = db_query('SELECT location_id FROM locations WHERE location_name = ? LIMIT 1', [name]);
  return rows.length ? rows[0].location_id : null;
}

/**
 * Pulls current SQL state back into a "SQL Mirror" sheet tab for
 * reference/debugging. Does not overwrite the operational entry tabs.
 */
function syncSQLToGoogleSheets() {
  const ss = SpreadsheetApp.openById(getConfig_().sheetId);
  const mirror = ss.getSheetByName('SQL_Mirror_Inventory') || ss.insertSheet('SQL_Mirror_Inventory');
  mirror.clear();
  const rows = db_query('SELECT * FROM vw_inventory_status', []);
  if (rows.length === 0) return { rows: 0 };
  const headers = Object.keys(rows[0]);
  mirror.appendRow(headers);
  rows.forEach(r => mirror.appendRow(headers.map(h => r[h])));
  return { rows: rows.length };
}
