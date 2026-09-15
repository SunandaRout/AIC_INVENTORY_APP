/**
 * Database.gs
 * Thin adapter over Apps Script's built-in Jdbc service (works with
 * Cloud SQL, and any MySQL/PostgreSQL reachable on the public internet
 * or via Cloud SQL proxy) OR a REST API adapter if your database is
 * not directly reachable from Apps Script (common for managed DBs
 * that only accept private-network connections).
 *
 * Everything else in the project calls db_query() / db_execute() —
 * nothing outside this file should know which adapter is active.
 */

function getConnection_() {
  const cfg = getConfig_();
  if (cfg.dbType === 'api') {
    return null; // API adapter doesn't hold a persistent connection
  }
  let url;
  if (cfg.dbType === 'postgres') {
    url = `jdbc:postgresql://${cfg.dbHost}:${cfg.dbPort}/${cfg.dbName}`;
  } else {
    // MySQL / Cloud SQL MySQL
    url = `jdbc:mysql://${cfg.dbHost}:${cfg.dbPort}/${cfg.dbName}?useSSL=true`;
  }
  return Jdbc.getConnection(url, cfg.dbUser, cfg.dbPassword);
}

/**
 * Run a SELECT and return an array of plain objects (one per row).
 * @param {string} sql       Parameterised SQL, using ? placeholders.
 * @param {Array}  params    Values for each placeholder, in order.
 */
function db_query(sql, params) {
  const cfg = getConfig_();
  params = params || [];

  if (cfg.dbType === 'api') {
    return apiAdapterQuery_(sql, params);
  }

  const conn = getConnection_();
  try {
    const stmt = conn.prepareStatement(sql);
    params.forEach((p, i) => bindParam_(stmt, i + 1, p));
    const rs = stmt.executeQuery();
    const meta = rs.getMetaData();
    const colCount = meta.getColumnCount();
    const rows = [];
    while (rs.next()) {
      const row = {};
      for (let c = 1; c <= colCount; c++) {
        row[meta.getColumnLabel(c)] = rs.getObject(c);
      }
      rows.push(row);
    }
    rs.close();
    stmt.close();
    return rows;
  } finally {
    conn.close();
  }
}

/**
 * Run an INSERT/UPDATE/DELETE. Returns affected row count.
 */
function db_execute(sql, params) {
  const cfg = getConfig_();
  params = params || [];

  if (cfg.dbType === 'api') {
    return apiAdapterExecute_(sql, params);
  }

  const conn = getConnection_();
  try {
    const stmt = conn.prepareStatement(sql);
    params.forEach((p, i) => bindParam_(stmt, i + 1, p));
    const count = stmt.executeUpdate();
    stmt.close();
    return count;
  } finally {
    conn.close();
  }
}

/** Run several statements as one transaction. `fn` receives a conn-like helper. */
function db_transaction(fn) {
  const cfg = getConfig_();
  if (cfg.dbType === 'api') {
    // The API adapter is expected to expose its own /transaction endpoint;
    // see apiAdapterExecute_ notes below for the contract to implement server-side.
    return fn({ execute: (sql, params) => apiAdapterExecute_(sql, params, true) });
  }
  const conn = getConnection_();
  try {
    conn.setAutoCommit(false);
    const helper = {
      execute: (sql, params) => {
        const stmt = conn.prepareStatement(sql);
        (params || []).forEach((p, i) => bindParam_(stmt, i + 1, p));
        const n = stmt.executeUpdate();
        stmt.close();
        return n;
      }
    };
    const result = fn(helper);
    conn.commit();
    return result;
  } catch (e) {
    conn.rollback();
    throw e;
  } finally {
    conn.setAutoCommit(true);
    conn.close();
  }
}

function bindParam_(stmt, idx, value) {
  if (value === null || value === undefined) stmt.setNull(idx, 0);
  else if (typeof value === 'number') stmt.setDouble(idx, value);
  else if (typeof value === 'boolean') stmt.setBoolean(idx, value);
  else if (value instanceof Date) stmt.setDate(idx, Jdbc.newSqlDate(value));
  else stmt.setString(idx, String(value));
}

/**
 * REST-API adapter — use this when Apps Script can't reach your SQL
 * server directly (typical for managed Postgres/MySQL behind a VPC).
 * Stand up a small authenticated API (Cloud Run / Lambda / etc.) in
 * front of the database that accepts { sql, params } and returns
 * { rows: [...] } for queries or { affected: N } for writes, then
 * point SQL_API_URL at it. Protect it with a bearer token stored in
 * DB_PASSWORD (reused as the API token in this mode).
 */
function apiAdapterQuery_(sql, params) {
  const cfg = getConfig_();
  const res = UrlFetchApp.fetch(cfg.sqlApiUrl + '/query', {
    method: 'post',
    contentType: 'application/json',
    headers: { Authorization: 'Bearer ' + cfg.dbPassword },
    payload: JSON.stringify({ sql, params }),
    muteHttpExceptions: true
  });
  if (res.getResponseCode() >= 300) throw new Error('SQL API error: ' + res.getContentText());
  return JSON.parse(res.getContentText()).rows;
}

function apiAdapterExecute_(sql, params, isTx) {
  const cfg = getConfig_();
  const res = UrlFetchApp.fetch(cfg.sqlApiUrl + (isTx ? '/tx-execute' : '/execute'), {
    method: 'post',
    contentType: 'application/json',
    headers: { Authorization: 'Bearer ' + cfg.dbPassword },
    payload: JSON.stringify({ sql, params }),
    muteHttpExceptions: true
  });
  if (res.getResponseCode() >= 300) throw new Error('SQL API error: ' + res.getContentText());
  return JSON.parse(res.getContentText()).affected;
}

/** Used by the Settings page "Database Status" indicator. */
function testDatabaseConnection() {
  try {
    db_query('SELECT 1 AS ok', []);
    return { connected: true, checkedAt: new Date().toISOString() };
  } catch (e) {
    return { connected: false, error: e.message, checkedAt: new Date().toISOString() };
  }
}

/** Used by the Settings page "Google Sheets Status" indicator. */
function testSheetsConnection() {
  try {
    const cfg = getConfig_();
    const ss = SpreadsheetApp.openById(cfg.sheetId);
    return { connected: true, sheetName: ss.getName(), checkedAt: new Date().toISOString() };
  } catch (e) {
    return { connected: false, error: e.message, checkedAt: new Date().toISOString() };
  }
}
