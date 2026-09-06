const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('../db/pool');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

router.post('/login', async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) {
    return res.status(400).json({ error: 'username and password are required' });
  }
  const { rows } = await pool.query('SELECT * FROM staff WHERE username = $1', [username]);
  const user = rows[0];
  if (!user) return res.status(401).json({ error: 'Incorrect username or password.' });

  const ok = await bcrypt.compare(password, user.password_hash);
  if (!ok) return res.status(401).json({ error: 'Incorrect username or password.' });

  const { rows: permRows } = await pool.query(
    'SELECT function FROM role_permissions WHERE role = $1',
    [user.role]
  );

  const token = jwt.sign(
    { id: user.id, username: user.username, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: '12h' }
  );

  res.json({
    token,
    user: { id: user.id, name: user.name, username: user.username, role: user.role, shift: user.shift },
    permissions: permRows.map((r) => r.function),
  });
});

router.get('/me', requireAuth, async (req, res) => {
  const { rows } = await pool.query(
    'SELECT id, name, username, role, shift FROM staff WHERE id = $1',
    [req.user.id]
  );
  if (!rows[0]) return res.status(404).json({ error: 'User not found' });
  res.json(rows[0]);
});

router.put('/me', requireAuth, async (req, res) => {
  const { name, username, password } = req.body || {};
  if (!name || !username) return res.status(400).json({ error: 'name and username are required' });
  const fields = ['name = $1', 'username = $2'];
  const values = [name, username];
  let i = 3;
  if (password) { fields.push(`password_hash = $${i++}`); values.push(await bcrypt.hash(password, 10)); }
  values.push(req.user.id);
  try {
    const { rows } = await pool.query(
      `UPDATE staff SET ${fields.join(', ')} WHERE id = $${i} RETURNING id, name, username, role, shift`,
      values
    );
    res.json(rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Username already in use' });
    throw err;
  }
});

module.exports = router;
