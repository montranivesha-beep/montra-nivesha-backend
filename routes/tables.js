const express = require('express');
const pool = require('../db/pool');
const { requireAuth, requireFunction } = require('../middleware/auth');

const router = express.Router();

// Sections and tables are readable by anyone signed in with floor-plan-ish
// access; the guest-facing app talks to a separate public router (see server.js).
router.use(requireAuth);

router.get('/sections', async (req, res) => {
  const { rows } = await pool.query('SELECT * FROM sections ORDER BY id');
  res.json(rows);
});

router.put('/sections/:id', requireFunction('floorplan'), async (req, res) => {
  const { name, description, open_time, close_time } = req.body || {};
  const { rows } = await pool.query(
    `UPDATE sections SET name=COALESCE($1,name), description=COALESCE($2,description),
       open_time=COALESCE($3,open_time), close_time=COALESCE($4,close_time)
     WHERE id=$5 RETURNING *`,
    [name, description, open_time, close_time, req.params.id]
  );
  if (!rows[0]) return res.status(404).json({ error: 'Section not found' });
  res.json(rows[0]);
});

router.get('/tables', async (req, res) => {
  const { rows } = await pool.query('SELECT * FROM tables ORDER BY id');
  res.json(rows);
});

router.post('/tables', requireFunction('floorplan'), async (req, res) => {
  const { id, section_id, capacity } = req.body || {};
  if (!id || !section_id || !capacity) {
    return res.status(400).json({ error: 'id, section_id, capacity are required' });
  }
  const { rows } = await pool.query(
    'INSERT INTO tables (id, section_id, capacity) VALUES ($1,$2,$3) RETURNING *',
    [id, section_id, capacity]
  );
  res.status(201).json(rows[0]);
});

router.put('/tables/:id', requireFunction('floorplan'), async (req, res) => {
  const { section_id, capacity, status, new_id } = req.body || {};
  if (new_id && new_id !== req.params.id) {
    await pool.query('UPDATE tables SET id=$1 WHERE id=$2', [new_id, req.params.id]);
    await pool.query('UPDATE orders SET target_id=$1 WHERE target_type=\'table\' AND target_id=$2', [new_id, req.params.id]);
    await pool.query('UPDATE reservations SET table_id=$1 WHERE table_id=$2', [new_id, req.params.id]);
  }
  const idNow = new_id || req.params.id;
  const { rows } = await pool.query(
    `UPDATE tables SET section_id=COALESCE($1,section_id), capacity=COALESCE($2,capacity),
       status=COALESCE($3,status) WHERE id=$4 RETURNING *`,
    [section_id, capacity, status, idNow]
  );
  if (!rows[0]) return res.status(404).json({ error: 'Table not found' });
  res.json(rows[0]);
});

router.delete('/tables/:id', requireFunction('floorplan'), async (req, res) => {
  await pool.query('DELETE FROM tables WHERE id = $1', [req.params.id]);
  res.status(204).end();
});

router.get('/rooms', async (req, res) => {
  const { rows } = await pool.query('SELECT * FROM rooms ORDER BY id');
  res.json(rows);
});

router.post('/rooms', requireFunction('qr'), async (req, res) => {
  const { id } = req.body || {};
  if (!id) return res.status(400).json({ error: 'id is required' });
  await pool.query('INSERT INTO rooms (id) VALUES ($1) ON CONFLICT DO NOTHING', [id]);
  res.status(201).json({ id });
});

router.put('/rooms/:id', requireFunction('qr'), async (req, res) => {
  const { new_id } = req.body || {};
  if (!new_id) return res.status(400).json({ error: 'new_id is required' });
  await pool.query('UPDATE rooms SET id=$1 WHERE id=$2', [new_id, req.params.id]);
  res.json({ id: new_id });
});

router.delete('/rooms/:id', requireFunction('qr'), async (req, res) => {
  await pool.query('DELETE FROM rooms WHERE id = $1', [req.params.id]);
  res.status(204).end();
});

module.exports = router;
