const express = require('express');
const pool = require('../db/pool');
const { requireAuth, requireFunction } = require('../middleware/auth');
const { checkReservationConflict, checkSectionHours } = require('../db/availability');

const router = express.Router();
router.use(requireAuth, requireFunction('reservations'));

router.get('/', async (req, res) => {
  const { rows } = await pool.query('SELECT * FROM reservations ORDER BY date, time');
  res.json(rows);
});

router.post('/', async (req, res) => {
  const { name, party, table_id, date, time, duration, phone, occasion, note } = req.body || {};
  if (!name || !party || !table_id || !date || !time) {
    return res.status(400).json({ error: 'name, party, table_id, date, time are required' });
  }
  const dur = duration || 90;
  if (await checkReservationConflict(table_id, date, time, dur, null)) {
    return res.status(409).json({ error: 'This table already has a reservation that overlaps this time.' });
  }
  const hoursError = await checkSectionHours(table_id, time, dur);
  if (hoursError) return res.status(409).json({ error: hoursError });

  const { rows } = await pool.query(
    `INSERT INTO reservations (name, party, table_id, date, time, duration, phone, occasion, note, source)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'staff') RETURNING *`,
    [name, party, table_id, date, time, dur, phone || null, occasion || null, note || null]
  );
  if (date === new Date().toISOString().slice(0, 10)) {
    await pool.query(`UPDATE tables SET status='reserved' WHERE id=$1`, [table_id]);
  }
  res.status(201).json(rows[0]);
});

router.put('/:id/cancel', async (req, res) => {
  const { rows } = await pool.query(
    `UPDATE reservations SET status='cancelled' WHERE id=$1 RETURNING *`,
    [req.params.id]
  );
  const r = rows[0];
  if (!r) return res.status(404).json({ error: 'Reservation not found' });
  await pool.query(`UPDATE tables SET status='available' WHERE id=$1 AND status='reserved'`, [r.table_id]);
  res.json(r);
});

router.get('/waitlist', async (req, res) => {
  const { rows } = await pool.query('SELECT * FROM waitlist ORDER BY created_at DESC');
  res.json(rows);
});

module.exports = router;
