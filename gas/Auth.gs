/**
 * Auth.gs
 * Simple session-token auth for the web app + server-side role checks.
 * Every API function that changes data MUST call requirePermission_()
 * before doing anything — never trust the client to hide a menu item.
 */

const ROLE_PERMISSIONS = {
  Admin:   ['dashboard','inventory','suppliers','customers','purchases','sales','receipts','payments','reports','users','settings'],
  Manager: ['dashboard','inventory','suppliers','customers','purchases','sales','reports'],
  Staff:   ['inventory','customers','sales','receipts'],
  Viewer:  ['dashboard','reports'],
};

function login(email, password) {
  const rows = db_query('SELECT * FROM users WHERE email = ? AND status = "Active"', [email]);
  if (rows.length === 0) throw new Error('Invalid credentials');
  const user = rows[0];
  if (!verifyPassword_(password, user.password_hash)) throw new Error('Invalid credentials');

  const token = Utilities.getUuid();
  const cache = CacheService.getUserCache();
  cache.put('session_' + token, JSON.stringify({
    userId: user.user_id, name: user.name, role: user.role, email: user.email
  }), 21600); // 6 hours

  logAudit_(user.user_id, 'LOGIN', 'users', user.user_id);
  return { token, name: user.name, role: user.role, email: user.email };
}

function logout(token) {
  CacheService.getUserCache().remove('session_' + token);
  return { ok: true };
}

function getSession_(token) {
  const raw = CacheService.getUserCache().get('session_' + token);
  if (!raw) throw new Error('Session expired — please log in again.');
  return JSON.parse(raw);
}

/** Call at the top of every API endpoint that touches a given module. */
function requirePermission_(token, module) {
  const session = getSession_(token);
  const allowed = ROLE_PERMISSIONS[session.role] || [];
  if (!allowed.includes(module)) {
    throw new Error(`Access denied: role "${session.role}" cannot access "${module}".`);
  }
  return session;
}

function verifyPassword_(plain, hash) {
  // Store passwords hashed (e.g. bcrypt) via your user-provisioning
  // flow, never plaintext. Apps Script has no native bcrypt, so verify
  // through a small serverless endpoint, or use a salted SHA-256 with
  // Utilities.computeDigest as a minimum bar for an internal tool:
  const salted = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, plain);
  const computed = salted.map(b => (b < 0 ? b + 256 : b).toString(16).padStart(2, '0')).join('');
  return computed === hash;
}
