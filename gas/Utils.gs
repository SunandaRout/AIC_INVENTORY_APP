/**
 * Utils.gs — shared helpers used across every module.
 */

function nextId_(prefix, table, idColumn) {
  const rows = db_query(`SELECT ${idColumn} FROM ${table} ORDER BY ${idColumn} DESC LIMIT 1`, []);
  if (rows.length === 0) return prefix + '001';
  const last = rows[0][idColumn];
  const num = parseInt(last.replace(prefix, ''), 10) + 1;
  return prefix + String(num).padStart(3, '0');
}

function logAudit_(userId, action, tableName, recordId, details) {
  db_execute(
    'INSERT INTO audit_logs (user_id, action, table_name, record_id, details) VALUES (?,?,?,?,?)',
    [userId, action, tableName, recordId, details ? JSON.stringify(details) : null]
  );
}

/** Turns a UI date-range preset into concrete { from, to } SQL date strings. */
function resolveDateRange_(preset, customFrom, customTo) {
  const today = new Date();
  const fmt = (d) => Utilities.formatDate(d, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  const startOf = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

  switch (preset) {
    case 'today': return { from: fmt(today), to: fmt(today) };
    case 'yesterday': {
      const y = new Date(today); y.setDate(y.getDate() - 1);
      return { from: fmt(y), to: fmt(y) };
    }
    case 'this_week': {
      const s = new Date(today); s.setDate(s.getDate() - s.getDay());
      return { from: fmt(s), to: fmt(today) };
    }
    case 'this_month': {
      const s = new Date(today.getFullYear(), today.getMonth(), 1);
      return { from: fmt(s), to: fmt(today) };
    }
    case 'last_month': {
      const s = new Date(today.getFullYear(), today.getMonth() - 1, 1);
      const e = new Date(today.getFullYear(), today.getMonth(), 0);
      return { from: fmt(s), to: fmt(e) };
    }
    case 'this_quarter': {
      const q = Math.floor(today.getMonth() / 3);
      const s = new Date(today.getFullYear(), q * 3, 1);
      return { from: fmt(s), to: fmt(today) };
    }
    case 'this_year': {
      const s = new Date(today.getFullYear(), 0, 1);
      return { from: fmt(s), to: fmt(today) };
    }
    case 'custom': return { from: customFrom, to: customTo };
    default: return { from: '1970-01-01', to: fmt(today) };
  }
}

function validateRequired_(obj, fields) {
  const missing = fields.filter(f => obj[f] === undefined || obj[f] === null || obj[f] === '');
  if (missing.length) throw new Error('Missing required field(s): ' + missing.join(', '));
}

function validatePositive_(value, fieldName) {
  if (typeof value !== 'number' || value <= 0) {
    throw new Error(`${fieldName} must be greater than 0.`);
  }
}

function validateNonNegative_(value, fieldName) {
  if (typeof value !== 'number' || value < 0) {
    throw new Error(`${fieldName} cannot be negative.`);
  }
}

function validateEmail_(email) {
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!re.test(email)) throw new Error('Invalid email address: ' + email);
}

function jsonResponse_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
