const jwt = require('jsonwebtoken');
const pool = require('../db/pool');

function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Missing bearer token' });
  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

// Checks the live role_permissions table (mirrors the app's editable
// Roles & Permissions screen) rather than a hardcoded list, so permission
// changes made through the API take effect immediately.
function requireFunction(fnId) {
  return async (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Not authenticated' });
    const { rows } = await pool.query(
      'SELECT 1 FROM role_permissions WHERE role = $1 AND function = $2',
      [req.user.role, fnId]
    );
    if (rows.length === 0) {
      return res.status(403).json({ error: `Role "${req.user.role}" cannot access "${fnId}"` });
    }
    next();
  };
}

module.exports = { requireAuth, requireFunction };
