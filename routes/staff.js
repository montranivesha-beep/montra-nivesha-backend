const express = require('express');
const bcrypt = require('bcryptjs');
const pool = require('../db/pool');
const { requireAuth, requireFunction } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth, requireFunction('users'));

router.get('/', async (req, res) => {
  const { rows } = await pool.query(
    'SELECT id, name, username, role, shift, created_at FROM staff ORDER BY id'
  );
  res.json(rows);
});

router.post('/', async (req, res) => {
  const { name, username, password, role, shift } = req.body || {};
  if (!name || !username || !password || !role) {
    return res.status(400).json({ error: 'name, username, password, role are required' });
  }
  const hash = await bcrypt.hash(password, 10);
  try {
    const { rows } = await pool.query(
      `INSERT INTO staff (name, username, password_hash, role, shift)
       VALUES ($1,$2,$3,$4,$5) RETURNING id, name, username, role, shift`,
      [name, username, hash, role, shift || null]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Username already in use' });
    throw err;
  }
});

// ----- Role permissions -----
// IMPORTANT: these must be declared before the generic '/:id' routes below,
// otherwise Express matches '/:id' first and treats "permissions" as an id.
router.get('/permissions/all', async (req, res) => {
  const { rows } = await pool.query('SELECT role, function FROM role_permissions');
  const byRole = {};
  rows.forEach((r) => { (byRole[r.role] = byRole[r.role] || []).push(r.function); });
  res.json(byRole);
});

router.put('/permissions', async (req, res) => {
  const { role, function: fn, granted } = req.body || {};
  if (!role || !fn || typeof granted !== 'boolean') {
    return res.status(400).json({ error: 'role, function, granted(boolean) are required' });
  }
  if (role === 'admin') {
    return res.status(400).json({ error: 'Admin always has full access and cannot be changed' });
  }
  if (granted) {
    await pool.query(
      `INSERT INTO role_permissions (role, function) VALUES ($1,$2)
       ON CONFLICT DO NOTHING`,
      [role, fn]
    );
  } else {
    await pool.query('DELETE FROM role_permissions WHERE role = $1 AND function = $2', [role, fn]);
  }
  res.status(204).end();
});

router.put('/:id', async (req, res) => {
  const { name, username, password, role, shift } = req.body || {};
  const fields = [];
  const values = [];
  let i = 1;
  if (name !== undefined) { fields.push(`name = $${i++}`); values.push(name); }
  if (username !== undefined) { fields.push(`username = $${i++}`); values.push(username); }
  if (role !== undefined) { fields.push(`role = $${i++}`); values.push(role); }
  if (shift !== undefined) { fields.push(`shift = $${i++}`); values.push(shift); }
  if (password) { fields.push(`password_hash = $${i++}`); values.push(await bcrypt.hash(password, 10)); }
  if (fields.length === 0) return res.status(400).json({ error: 'No fields to update' });
  values.push(req.params.id);
  const { rows } = await pool.query(
    `UPDATE staff SET ${fields.join(', ')} WHERE id = $${i} RETURNING id, name, username, role, shift`,
    values
  );
  if (!rows[0]) return res.status(404).json({ error: 'Staff account not found' });
  res.json(rows[0]);
});

router.delete('/:id', async (req, res) => {
  if (Number(req.params.id) === req.user.id) {
    return res.status(400).json({ error: 'Cannot delete your own account' });
  }
  await pool.query('DELETE FROM staff WHERE id = $1', [req.params.id]);
  res.status(204).end();
});

module.exports = router;
