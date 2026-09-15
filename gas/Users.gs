/**
 * Users.gs — Admin-only user management.
 */

function listUsers(token) {
  requirePermission_(token, 'users');
  return db_query('SELECT user_id, name, email, role, status, created_at FROM users ORDER BY name', []);
}

function createUser(token, user) {
  const session = requirePermission_(token, 'users');
  validateRequired_(user, ['name', 'email', 'role', 'tempPassword']);
  validateEmail_(user.email);
  if (!['Admin', 'Manager', 'Staff', 'Viewer'].includes(user.role)) throw new Error('Invalid role.');

  const userId = nextId_('USR', 'users', 'user_id');
  const hash = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, user.tempPassword)
    .map(b => (b < 0 ? b + 256 : b).toString(16).padStart(2, '0')).join('');
  db_execute(
    'INSERT INTO users (user_id, name, email, password_hash, role, status) VALUES (?,?,?,?,?,?)',
    [userId, user.name, user.email, hash, user.role, 'Active']
  );
  logAudit_(session.userId, 'USER_CREATED', 'users', userId);
  return { userId };
}

function updateUser(token, userId, changes) {
  const session = requirePermission_(token, 'users');
  const allowed = ['name', 'role', 'status'];
  const setCols = Object.keys(changes).filter(k => allowed.includes(k));
  if (!setCols.length) return { ok: true };
  db_execute(`UPDATE users SET ${setCols.map(c => c + ' = ?').join(', ')} WHERE user_id = ?`,
    [...setCols.map(c => changes[c]), userId]);
  logAudit_(session.userId, 'USER_UPDATED', 'users', userId, changes);
  return { ok: true };
}

function deleteUser(token, userId) {
  const session = requirePermission_(token, 'users');
  db_execute('UPDATE users SET status = "Inactive" WHERE user_id = ?', [userId]);
  logAudit_(session.userId, 'USER_DELETED', 'users', userId);
  return { ok: true };
}
