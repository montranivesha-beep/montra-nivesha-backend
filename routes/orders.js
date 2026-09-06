const express = require('express');
const pool = require('../db/pool');
const { requireAuth, requireFunction } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth, requireFunction('orders'));

const TAX_RATE = 0.10;
const SERVICE_RATE = 0.10;
const STAGES = ['New', 'Preparing', 'Ready', 'Served'];

// Prices are VAT & service inclusive; back the components out for display only.
function billBreakdown(subtotal) {
  const net = subtotal / ((1 + SERVICE_RATE) * (1 + TAX_RATE));
  const service = net * SERVICE_RATE;
  const vat = subtotal - net - service;
  return { subtotal, net, service, vat, total: subtotal };
}

async function loadOrder(id) {
  const { rows: orderRows } = await pool.query('SELECT * FROM orders WHERE id=$1', [id]);
  const order = orderRows[0];
  if (!order) return null;
  const { rows: items } = await pool.query(
    `SELECT oi.*, mi.name, mi.price, mi.cost
     FROM order_items oi JOIN menu_items mi ON mi.id = oi.menu_item_id
     WHERE oi.order_id = $1 ORDER BY oi.sort_order, oi.id`,
    [id]
  );
  const subtotal = items.reduce((s, it) => s + Number(it.price) * it.qty, 0);
  return { ...order, items, bill: billBreakdown(subtotal) };
}

router.get('/', async (req, res) => {
  const { status } = req.query;
  const { rows } = await pool.query(
    status ? 'SELECT id FROM orders WHERE status=$1 ORDER BY created_at' : 'SELECT id FROM orders ORDER BY created_at',
    status ? [status] : []
  );
  const orders = await Promise.all(rows.map((r) => loadOrder(r.id)));
  res.json(orders);
});

router.get('/:id', async (req, res) => {
  const order = await loadOrder(req.params.id);
  if (!order) return res.status(404).json({ error: 'Order not found' });
  res.json(order);
});

router.post('/', async (req, res) => {
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
      const it = items[i];
      await pool.query(
        `INSERT INTO order_items (order_id, menu_item_id, qty, course, sort_order)
         VALUES ($1,$2,$3,$4,$5)`,
        [order.id, it.menu_item_id, it.qty, it.course || 'Main', i]
      );
    }
    if (target_type === 'table') {
      await pool.query(`UPDATE tables SET status='occupied' WHERE id=$1`, [target_id]);
    }
    await pool.query('COMMIT');
    res.status(201).json(await loadOrder(order.id));
  } catch (err) {
    await pool.query('ROLLBACK');
    throw err;
  }
});

// Replace items on an open order (the "Add items" flow)
router.put('/:id/items', async (req, res) => {
  const { items, note } = req.body || {};
  if (!Array.isArray(items)) return res.status(400).json({ error: 'items[] is required' });
  await pool.query('BEGIN');
  try {
    await pool.query('DELETE FROM order_items WHERE order_id=$1', [req.params.id]);
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      await pool.query(
        `INSERT INTO order_items (order_id, menu_item_id, qty, course, sort_order)
         VALUES ($1,$2,$3,$4,$5)`,
        [req.params.id, it.menu_item_id, it.qty, it.course || 'Main', i]
      );
    }
    if (note !== undefined) {
      await pool.query('UPDATE orders SET note=$1 WHERE id=$2', [note || null, req.params.id]);
    }
    await pool.query('COMMIT');
    res.json(await loadOrder(req.params.id));
  } catch (err) {
    await pool.query('ROLLBACK');
    throw err;
  }
});

router.put('/:id/status', async (req, res) => {
  const { status } = req.body || {};
  if (!STAGES.includes(status)) return res.status(400).json({ error: `status must be one of ${STAGES.join(', ')}` });
  const { rows } = await pool.query('UPDATE orders SET status=$1 WHERE id=$2 RETURNING *', [status, req.params.id]);
  if (!rows[0]) return res.status(404).json({ error: 'Order not found' });
  res.json(rows[0]);
});

router.put('/:id/note', async (req, res) => {
  const { note } = req.body || {};
  const { rows } = await pool.query('UPDATE orders SET note=$1 WHERE id=$2 RETURNING *', [note || null, req.params.id]);
  if (!rows[0]) return res.status(404).json({ error: 'Order not found' });
  res.json(rows[0]);
});

// Settle: cash | room | ledger — mirrors the invoice modal's settlement options.
router.post('/:id/settle', async (req, res) => {
  const { method, room_id, ledger_account_id } = req.body || {};
  const order = await loadOrder(req.params.id);
  if (!order) return res.status(404).json({ error: 'Order not found' });
  if (order.status === 'paid') return res.status(400).json({ error: 'Order already settled' });

  const total = order.bill.total;
  await pool.query('BEGIN');
  try {
    if (method === 'room') {
      if (!room_id) throw Object.assign(new Error('room_id is required'), { status: 400 });
      await pool.query(
        `INSERT INTO room_folio_charges (room_id, order_ref, amount) VALUES ($1,$2,$3)`,
        [room_id, `order:${order.id}`, total]
      );
      await pool.query(
        `UPDATE orders SET status='paid', paid_at=now(), settlement_type='room', settlement_room_id=$1 WHERE id=$2`,
        [room_id, order.id]
      );
    } else if (method === 'ledger') {
      if (!ledger_account_id) throw Object.assign(new Error('ledger_account_id is required'), { status: 400 });
      await pool.query(
        `INSERT INTO city_ledger_transactions (account_id, order_ref, amount) VALUES ($1,$2,$3)`,
        [ledger_account_id, `order:${order.id}`, total]
      );
      await pool.query(`UPDATE city_ledger_accounts SET balance = balance + $1 WHERE id=$2`, [total, ledger_account_id]);
      await pool.query(
        `UPDATE orders SET status='paid', paid_at=now(), settlement_type='ledger', settlement_ledger_account_id=$1 WHERE id=$2`,
        [ledger_account_id, order.id]
      );
    } else {
      await pool.query(`UPDATE orders SET status='paid', paid_at=now(), settlement_type='cash' WHERE id=$1`, [order.id]);
    }
    if (order.target_type === 'table') {
      await pool.query(`UPDATE tables SET status='cleaning' WHERE id=$1`, [order.target_id]);
    }
    await pool.query('COMMIT');
    res.json(await loadOrder(order.id));
  } catch (err) {
    await pool.query('ROLLBACK');
    if (err.status) return res.status(err.status).json({ error: err.message });
    throw err;
  }
});

module.exports = router;
