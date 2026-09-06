const express = require('express');
const pool = require('../db/pool');
const { checkReservationConflict, checkSectionHours, timeToMin } = require('../db/availability');

const router = express.Router();

// ----- Booking portal -----
router.get('/sections', async (req, res) => {
  res.json((await pool.query('SELECT * FROM sections ORDER BY id')).rows);
});

router.post('/availability', async (req, res) => {
  const { date, time, party, duration } = req.body || {};
  if (!date || !time || !party) return res.status(400).json({ error: 'date, time, party are required' });
  const dur = duration || 90;
  const { rows: tables } = await pool.query(
    `SELECT t.*, s.name AS section_name, s.open_time, s.close_time FROM tables t
     JOIN sections s ON s.id = t.section_id WHERE t.capacity >= $1 ORDER BY t.capacity`,
    [party]
  );
  const available = [];
  for (const t of tables) {
    if (t.open_time) {
      const openM = timeToMin(t.open_time), closeM = timeToMin(t.close_time);
      const startM = timeToMin(time), endM = startM + Number(dur);
      if (!(startM >= openM && endM <= closeM)) continue;
    }
    if (await checkReservationConflict(t.id, date, time, dur, null)) continue;
    available.push(t);
  }
  res.json(available);
});

router.post('/reservations', async (req, res) => {
  const { name, phone, party, table_id, date, time, occasion, note } = req.body || {};
  if (!name || !phone || !party || !table_id || !date || !time) {
    return res.status(400).json({ error: 'name, phone, party, table_id, date, time are required' });
  }
  const duration = 90;
  if (await checkReservationConflict(table_id, date, time, duration, null)) {
    return res.status(409).json({ error: 'Sorry, that table was just booked by someone else. Please pick another.' });
  }
  const hoursError = await checkSectionHours(table_id, time, duration);
  if (hoursError) return res.status(409).json({ error: hoursError });

  const { rows } = await pool.query(
    `INSERT INTO reservations (name, party, table_id, date, time, duration, phone, occasion, note, source)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'guest') RETURNING *`,
    [name, party, table_id, date, time, duration, phone, occasion || null, note || null]
  );
  if (date === new Date().toISOString().slice(0, 10)) {
    await pool.query(`UPDATE tables SET status='reserved' WHERE id=$1`, [table_id]);
  }
  res.status(201).json(rows[0]);
});

router.get('/reservations', async (req, res) => {
  const { phone } = req.query;
  if (!phone) return res.status(400).json({ error: 'phone query param is required' });
  const { rows } = await pool.query(
    'SELECT * FROM reservations WHERE phone = $1 ORDER BY date DESC, time DESC',
    [phone]
  );
  res.json(rows);
});

router.put('/reservations/:id/cancel', async (req, res) => {
  const { phone } = req.body || {};
  const { rows } = await pool.query('SELECT * FROM reservations WHERE id=$1', [req.params.id]);
  const r = rows[0];
  if (!r) return res.status(404).json({ error: 'Reservation not found' });
  if (phone && r.phone !== phone) return res.status(403).json({ error: 'Phone number does not match this booking' });
  await pool.query(`UPDATE reservations SET status='cancelled' WHERE id=$1`, [r.id]);
  await pool.query(`UPDATE tables SET status='available' WHERE id=$1 AND status='reserved'`, [r.table_id]);
  res.status(204).end();
});

router.post('/waitlist', async (req, res) => {
  const { name, phone, party, date, time } = req.body || {};
  if (!name || !phone || !party || !date || !time) {
    return res.status(400).json({ error: 'name, phone, party, date, time are required' });
  }
  const { rows } = await pool.query(
    'INSERT INTO waitlist (name, phone, party, date, time) VALUES ($1,$2,$3,$4,$5) RETURNING *',
    [name, phone, party, date, time]
  );
  res.status(201).json(rows[0]);
});

// ----- QR ordering -----
router.get('/menu', async (req, res) => {
  const { table } = req.query;
  const { rows } = await pool.query('SELECT * FROM menu_items ORDER BY id');
  if (!table) return res.json(rows.filter((m) => !m.section_id));
  const { rows: tableRows } = await pool.query('SELECT section_id FROM tables WHERE id=$1', [table]);
  const sectionId = tableRows[0]?.section_id;
  res.json(rows.filter((m) => !m.section_id || m.section_id === sectionId));
});

router.get('/categories', async (req, res) => {
  res.json((await pool.query('SELECT * FROM menu_categories ORDER BY sort_order')).rows);
});

router.post('/orders', async (req, res) => {
  const { target_type, target_id, items, note } = req.body || {};
  if (!['table', 'room'].includes(target_type) || !target_id || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'target_type(table|room), target_id, items[] are required' });
  }
  await pool.query('BEGIN');
  try {
    const { rows } = await pool.query(
      `INSERT INTO orders (target_type, target_id, note) VALUES ($1,$2,$3) RETURNING *`,
      [target_type, target_id, note || null]
    );
    const order = rows[0];
    for (let i = 0; i < items.length; i++) {
      const it = items[i]; // guest-chosen serving sequence preserved via sort_order
      await pool.query(
        `INSERT INTO order_items (order_id, menu_item_id, qty, course, sort_order) VALUES ($1,$2,$3,'Main',$4)`,
        [order.id, it.menu_item_id, it.qty, i]
      );
    }
    if (target_type === 'table') {
      await pool.query(`UPDATE tables SET status='occupied' WHERE id=$1`, [target_id]);
    }
    await pool.query('COMMIT');
    res.status(201).json(order);
  } catch (err) {
    await pool.query('ROLLBACK');
    throw err;
  }
});

// ----- Feedback -----
router.post('/feedback', async (req, res) => {
  const { name, contact, visit_type, ref, overall_rating, food_rating, service_rating, comment } = req.body || {};
  if (!overall_rating) return res.status(400).json({ error: 'overall_rating is required' });
  const { rows } = await pool.query(
    `INSERT INTO feedback (name, contact, visit_type, ref, overall_rating, food_rating, service_rating, comment)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
    [name || 'Anonymous guest', contact || null, visit_type || null, ref || null,
     overall_rating, food_rating || null, service_rating || null, comment || null]
  );
  res.status(201).json(rows[0]);
});

module.exports = router;
