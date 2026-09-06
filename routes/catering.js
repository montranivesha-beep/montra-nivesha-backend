const express = require('express');
const pool = require('../db/pool');
const { requireAuth, requireFunction } = require('../middleware/auth');
const { checkEventConflict } = require('../db/availability');

const router = express.Router();
router.use(requireAuth, requireFunction('catering'));

const TAX_RATE = 0.10;
const SERVICE_RATE = 0.10;

function billBreakdown(subtotal) {
  const net = subtotal / ((1 + SERVICE_RATE) * (1 + TAX_RATE));
  const service = net * SERVICE_RATE;
  const vat = subtotal - net - service;
  return { subtotal, net, service, vat, total: subtotal };
}

// ----- Venues -----
router.get('/venues', async (req, res) => {
  res.json((await pool.query('SELECT * FROM venues ORDER BY id')).rows);
});
router.post('/venues', async (req, res) => {
  const { name, capacity, rental_fee } = req.body || {};
  const { rows } = await pool.query(
    'INSERT INTO venues (name, capacity, rental_fee) VALUES ($1,$2,$3) RETURNING *',
    [name, capacity, rental_fee]
  );
  res.status(201).json(rows[0]);
});
router.put('/venues/:id', async (req, res) => {
  const { name, capacity, rental_fee } = req.body || {};
  const { rows } = await pool.query(
    `UPDATE venues SET name=COALESCE($1,name), capacity=COALESCE($2,capacity),
       rental_fee=COALESCE($3,rental_fee) WHERE id=$4 RETURNING *`,
    [name, capacity, rental_fee, req.params.id]
  );
  if (!rows[0]) return res.status(404).json({ error: 'Venue not found' });
  res.json(rows[0]);
});
router.delete('/venues/:id', async (req, res) => {
  const { rows } = await pool.query(
    `SELECT 1 FROM events WHERE venue_id=$1 AND status<>'Cancelled' LIMIT 1`,
    [req.params.id]
  );
  if (rows[0]) return res.status(409).json({ error: 'This venue has active events booked.' });
  await pool.query('DELETE FROM venues WHERE id=$1', [req.params.id]);
  res.status(204).end();
});

// ----- Catering packages -----
router.get('/packages', async (req, res) => {
  res.json((await pool.query('SELECT * FROM catering_packages ORDER BY id')).rows);
});
router.post('/packages', async (req, res) => {
  const { name, price_per_guest, cost_per_guest, description } = req.body || {};
  const { rows } = await pool.query(
    'INSERT INTO catering_packages (name, price_per_guest, cost_per_guest, description) VALUES ($1,$2,$3,$4) RETURNING *',
    [name, price_per_guest, cost_per_guest || 0, description || null]
  );
  res.status(201).json(rows[0]);
});
router.put('/packages/:id', async (req, res) => {
  const { name, price_per_guest, cost_per_guest, description } = req.body || {};
  const { rows } = await pool.query(
    `UPDATE catering_packages SET name=COALESCE($1,name), price_per_guest=COALESCE($2,price_per_guest),
       cost_per_guest=COALESCE($3,cost_per_guest), description=COALESCE($4,description) WHERE id=$5 RETURNING *`,
    [name, price_per_guest, cost_per_guest, description, req.params.id]
  );
  if (!rows[0]) return res.status(404).json({ error: 'Package not found' });
  res.json(rows[0]);
});
router.delete('/packages/:id', async (req, res) => {
  await pool.query('DELETE FROM catering_packages WHERE id=$1', [req.params.id]);
  res.status(204).end();
});

// ----- Additional services -----
router.get('/services', async (req, res) => {
  res.json((await pool.query('SELECT * FROM additional_services ORDER BY id')).rows);
});
router.post('/services', async (req, res) => {
  const { name, rate, cost, description } = req.body || {};
  const { rows } = await pool.query(
    'INSERT INTO additional_services (name, rate, cost, description) VALUES ($1,$2,$3,$4) RETURNING *',
    [name, rate, cost || 0, description || null]
  );
  res.status(201).json(rows[0]);
});
router.put('/services/:id', async (req, res) => {
  const { name, rate, cost, description } = req.body || {};
  const { rows } = await pool.query(
    `UPDATE additional_services SET name=COALESCE($1,name), rate=COALESCE($2,rate),
       cost=COALESCE($3,cost), description=COALESCE($4,description) WHERE id=$5 RETURNING *`,
    [name, rate, cost, description, req.params.id]
  );
  if (!rows[0]) return res.status(404).json({ error: 'Service not found' });
  res.json(rows[0]);
});
router.delete('/services/:id', async (req, res) => {
  await pool.query('DELETE FROM additional_services WHERE id=$1', [req.params.id]);
  res.status(204).end();
});

// ----- Business sources -----
router.get('/business-sources', async (req, res) => {
  res.json((await pool.query('SELECT * FROM business_sources ORDER BY id')).rows);
});
router.post('/business-sources', async (req, res) => {
  const { name } = req.body || {};
  try {
    const { rows } = await pool.query('INSERT INTO business_sources (name) VALUES ($1) RETURNING *', [name]);
    res.status(201).json(rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'That source already exists' });
    throw err;
  }
});
router.delete('/business-sources/:id', async (req, res) => {
  await pool.query('DELETE FROM business_sources WHERE id=$1', [req.params.id]);
  res.status(204).end();
});

// ----- Events -----
async function loadEvent(id) {
  const { rows } = await pool.query('SELECT * FROM events WHERE id=$1', [id]);
  const ev = rows[0];
  if (!ev) return null;
  const { rows: venueRows } = await pool.query('SELECT * FROM venues WHERE id=$1', [ev.venue_id]);
  const { rows: pkgRows } = await pool.query('SELECT * FROM catering_packages WHERE id=$1', [ev.package_id]);
  const { rows: extraRows } = await pool.query(
    `SELECT es.*, s.name, s.rate FROM event_extra_services es
     JOIN additional_services s ON s.id = es.service_id WHERE es.event_id=$1`,
    [id]
  );
  const venue = venueRows[0], pkg = pkgRows[0];
  const rentalRate = ev.venue_rate != null ? Number(ev.venue_rate) : Number(venue?.rental_fee || 0);
  const priceRate = ev.package_rate != null ? Number(ev.package_rate) : Number(pkg?.price_per_guest || 0);
  const catering = priceRate * ev.guest_count;
  const rental = rentalRate;
  const extras = extraRows.reduce((s, e) => s + Number(e.rate) * e.qty, 0);
  const subtotal = catering + rental + extras;
  return { ...ev, venue, package: pkg, extra_services: extraRows, bill: billBreakdown(subtotal) };
}

router.get('/events', async (req, res) => {
  const { rows } = await pool.query('SELECT id FROM events ORDER BY date, start_time');
  res.json(await Promise.all(rows.map((r) => loadEvent(r.id))));
});

router.get('/events/:id', async (req, res) => {
  const ev = await loadEvent(req.params.id);
  if (!ev) return res.status(404).json({ error: 'Event not found' });
  res.json(ev);
});

router.post('/events', async (req, res) => {
  const b = req.body || {};
  if (!b.name || !b.venue_id || !b.date || !b.start_time || !b.end_time || !b.package_id || !b.guest_count) {
    return res.status(400).json({ error: 'name, venue_id, date, start_time, end_time, package_id, guest_count are required' });
  }
  if (await checkEventConflict(b.venue_id, b.date, b.start_time, b.end_time, null)) {
    return res.status(409).json({ error: 'This venue already has an event that overlaps this time.' });
  }
  await pool.query('BEGIN');
  try {
    const { rows } = await pool.query(
      `INSERT INTO events (name, client, phone, business_source, travel_agency, voucher_number,
         venue_id, date, start_time, end_time, guest_count, package_id, venue_rate, package_rate, deposit, note)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16) RETURNING *`,
      [b.name, b.client || null, b.phone || null, b.business_source || 'Direct / Walk-in', b.travel_agency || null,
       b.voucher_number || null, b.venue_id, b.date, b.start_time, b.end_time, b.guest_count, b.package_id,
       b.venue_rate ?? null, b.package_rate ?? null, b.deposit || 0, b.note || null]
    );
    const event = rows[0];
    for (const es of (b.extra_services || [])) {
      await pool.query(
        'INSERT INTO event_extra_services (event_id, service_id, qty) VALUES ($1,$2,$3)',
        [event.id, es.service_id, es.qty]
      );
    }
    await pool.query('COMMIT');
    res.status(201).json(await loadEvent(event.id));
  } catch (err) {
    await pool.query('ROLLBACK');
    throw err;
  }
});

router.put('/events/:id', async (req, res) => {
  const b = req.body || {};
  if (b.venue_id && b.date && b.start_time && b.end_time) {
    if (await checkEventConflict(b.venue_id, b.date, b.start_time, b.end_time, req.params.id)) {
      return res.status(409).json({ error: 'This venue already has an event that overlaps this time.' });
    }
  }
  await pool.query('BEGIN');
  try {
    const { rows } = await pool.query(
      `UPDATE events SET
         name=COALESCE($1,name), client=COALESCE($2,client), phone=COALESCE($3,phone),
         business_source=COALESCE($4,business_source), travel_agency=COALESCE($5,travel_agency),
         voucher_number=COALESCE($6,voucher_number), venue_id=COALESCE($7,venue_id), date=COALESCE($8,date),
         start_time=COALESCE($9,start_time), end_time=COALESCE($10,end_time), guest_count=COALESCE($11,guest_count),
         package_id=COALESCE($12,package_id), venue_rate=$13, package_rate=$14,
         deposit=COALESCE($15,deposit), note=COALESCE($16,note), status=COALESCE($17,status)
       WHERE id=$18 RETURNING *`,
      [b.name, b.client, b.phone, b.business_source, b.travel_agency, b.voucher_number, b.venue_id, b.date,
       b.start_time, b.end_time, b.guest_count, b.package_id, b.venue_rate ?? null, b.package_rate ?? null,
       b.deposit, b.note, b.status, req.params.id]
    );
    if (!rows[0]) throw Object.assign(new Error('Event not found'), { status: 404 });
    if (b.extra_services) {
      await pool.query('DELETE FROM event_extra_services WHERE event_id=$1', [req.params.id]);
      for (const es of b.extra_services) {
        await pool.query(
          'INSERT INTO event_extra_services (event_id, service_id, qty) VALUES ($1,$2,$3)',
          [req.params.id, es.service_id, es.qty]
        );
      }
    }
    await pool.query('COMMIT');
    res.json(await loadEvent(req.params.id));
  } catch (err) {
    await pool.query('ROLLBACK');
    if (err.status) return res.status(err.status).json({ error: err.message });
    throw err;
  }
});

router.put('/events/:id/status', async (req, res) => {
  const { status } = req.body || {};
  if (!['Inquiry', 'Confirmed', 'Completed', 'Cancelled'].includes(status)) {
    return res.status(400).json({ error: 'Invalid status' });
  }
  const { rows } = await pool.query('UPDATE events SET status=$1 WHERE id=$2 RETURNING *', [status, req.params.id]);
  if (!rows[0]) return res.status(404).json({ error: 'Event not found' });
  res.json(rows[0]);
});

router.post('/events/:id/settle', async (req, res) => {
  const { method, room_id, ledger_account_id } = req.body || {};
  const ev = await loadEvent(req.params.id);
  if (!ev) return res.status(404).json({ error: 'Event not found' });
  if (ev.invoice_status === 'Paid') return res.status(400).json({ error: 'Already settled' });
  const balanceDue = Math.max(0, ev.bill.total - Number(ev.deposit || 0));

  await pool.query('BEGIN');
  try {
    if (method === 'room') {
      await pool.query(
        'INSERT INTO room_folio_charges (room_id, order_ref, amount) VALUES ($1,$2,$3)',
        [room_id, `event:${ev.id}`, balanceDue]
      );
      await pool.query(
        `UPDATE events SET invoice_status='Paid', settlement_type='room', settlement_room_id=$1 WHERE id=$2`,
        [room_id, ev.id]
      );
    } else if (method === 'ledger') {
      await pool.query(
        'INSERT INTO city_ledger_transactions (account_id, order_ref, amount) VALUES ($1,$2,$3)',
        [ledger_account_id, `event:${ev.id}`, balanceDue]
      );
      await pool.query('UPDATE city_ledger_accounts SET balance = balance + $1 WHERE id=$2', [balanceDue, ledger_account_id]);
      await pool.query(
        `UPDATE events SET invoice_status='Paid', settlement_type='ledger', settlement_ledger_account_id=$1 WHERE id=$2`,
        [ledger_account_id, ev.id]
      );
    } else {
      await pool.query(`UPDATE events SET invoice_status='Paid', settlement_type='cash' WHERE id=$1`, [ev.id]);
    }
    await pool.query('COMMIT');
    res.json(await loadEvent(ev.id));
  } catch (err) {
    await pool.query('ROLLBACK');
    throw err;
  }
});

module.exports = router;
