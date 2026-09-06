const express = require('express');
const pool = require('../db/pool');
const { requireAuth, requireFunction } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth, requireFunction('cityledger'));

router.get('/accounts', async (req, res) => {
  res.json((await pool.query('SELECT * FROM city_ledger_accounts ORDER BY id')).rows);
});

router.post('/accounts', async (req, res) => {
  const { name, contact, credit_limit } = req.body || {};
  const { rows } = await pool.query(
    'INSERT INTO city_ledger_accounts (name, contact, credit_limit) VALUES ($1,$2,$3) RETURNING *',
    [name, contact || null, credit_limit || 0]
  );
  res.status(201).json(rows[0]);
});

router.put('/accounts/:id', async (req, res) => {
  const { name, contact, credit_limit } = req.body || {};
  const { rows } = await pool.query(
    `UPDATE city_ledger_accounts SET name=COALESCE($1,name), contact=COALESCE($2,contact),
       credit_limit=COALESCE($3,credit_limit) WHERE id=$4 RETURNING *`,
    [name, contact, credit_limit, req.params.id]
  );
  if (!rows[0]) return res.status(404).json({ error: 'Account not found' });
  res.json(rows[0]);
});

router.get('/accounts/:id/statement', async (req, res) => {
  const { rows } = await pool.query(
    'SELECT * FROM city_ledger_transactions WHERE account_id=$1 ORDER BY created_at',
    [req.params.id]
  );
  res.json(rows);
});

router.post('/accounts/:id/settle', async (req, res) => {
  await pool.query('BEGIN');
  try {
    const { rows } = await pool.query('SELECT * FROM city_ledger_accounts WHERE id=$1 FOR UPDATE', [req.params.id]);
    const acct = rows[0];
    if (!acct) throw Object.assign(new Error('Account not found'), { status: 404 });
    await pool.query(
      `INSERT INTO city_ledger_transactions (account_id, order_ref, amount, note) VALUES ($1,'settlement',$2,'Account settled')`,
      [acct.id, -acct.balance]
    );
    await pool.query('UPDATE city_ledger_accounts SET balance=0 WHERE id=$1', [acct.id]);
    await pool.query('COMMIT');
    res.json({ ...acct, balance: 0 });
  } catch (err) {
    await pool.query('ROLLBACK');
    if (err.status) return res.status(err.status).json({ error: err.message });
    throw err;
  }
});

router.get('/room-folios', async (req, res) => {
  const { rows } = await pool.query(
    `SELECT room_id, COALESCE(SUM(amount) FILTER (WHERE NOT settled), 0) AS balance,
            COUNT(*) FILTER (WHERE NOT settled) AS open_charges
     FROM room_folio_charges GROUP BY room_id HAVING SUM(amount) FILTER (WHERE NOT settled) > 0`
  );
  res.json(rows);
});

router.get('/room-folios/:roomId/charges', async (req, res) => {
  const { rows } = await pool.query(
    'SELECT * FROM room_folio_charges WHERE room_id=$1 AND NOT settled ORDER BY created_at',
    [req.params.roomId]
  );
  res.json(rows);
});

router.post('/room-folios/:roomId/settle', async (req, res) => {
  await pool.query(
    'UPDATE room_folio_charges SET settled=TRUE WHERE room_id=$1 AND NOT settled',
    [req.params.roomId]
  );
  res.status(204).end();
});

module.exports = router;
