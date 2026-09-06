const express = require('express');
const pool = require('../db/pool');
const { requireAuth, requireFunction } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth, requireFunction('reports'));

function rangeFor(period, { date, month, year }) {
  if (period === 'daily') return { from: date, to: date };
  if (period === 'monthly') {
    const [y, m] = month.split('-').map(Number);
    const to = new Date(y, m, 0).toISOString().slice(0, 10);
    return { from: `${month}-01`, to };
  }
  if (period === 'yearly') return { from: `${year}-01-01`, to: `${year}-12-31` };
  throw Object.assign(new Error('period must be daily, monthly, or yearly'), { status: 400 });
}

async function restaurantTotals(from, to) {
  const { rows } = await pool.query(
    `SELECT COUNT(DISTINCT o.id) AS orders,
            COALESCE(SUM(oi.qty * mi.price), 0) AS revenue,
            COALESCE(SUM(oi.qty * mi.cost), 0) AS food_cost
     FROM orders o
     JOIN order_items oi ON oi.order_id = o.id
     JOIN menu_items mi ON mi.id = oi.menu_item_id
     WHERE o.status = 'paid' AND o.paid_at::date BETWEEN $1 AND $2`,
    [from, to]
  );
  return { orders: Number(rows[0].orders), revenue: Number(rows[0].revenue), foodCost: Number(rows[0].food_cost) };
}

async function eventsTotals(from, to) {
  const { rows } = await pool.query(
    `SELECT e.id, e.guest_count, e.venue_rate, e.package_rate, v.rental_fee, p.price_per_guest,
            COALESCE(x.total, 0) AS extras_total
     FROM events e
     JOIN venues v ON v.id = e.venue_id
     JOIN catering_packages p ON p.id = e.package_id
     LEFT JOIN (
       SELECT event_id, SUM(es.qty * s.rate) AS total
       FROM event_extra_services es JOIN additional_services s ON s.id = es.service_id
       GROUP BY event_id
     ) x ON x.event_id = e.id
     WHERE e.invoice_status = 'Paid' AND e.date BETWEEN $1 AND $2`,
    [from, to]
  );
  let revenue = 0;
  rows.forEach((r) => {
    const rental = r.venue_rate != null ? Number(r.venue_rate) : Number(r.rental_fee);
    const price = r.package_rate != null ? Number(r.package_rate) : Number(r.price_per_guest);
    revenue += rental + price * r.guest_count + Number(r.extras_total);
  });
  return { revenue, count: rows.length };
}

router.get('/', async (req, res) => {
  const { period, date, month, year } = req.query;
  let range;
  try {
    range = rangeFor(period, { date, month, year });
  } catch (err) {
    return res.status(err.status || 400).json({ error: err.message });
  }
  const rest = await restaurantTotals(range.from, range.to);
  const ev = await eventsTotals(range.from, range.to);
  res.json({
    period, from: range.from, to: range.to,
    restaurantRevenue: rest.revenue,
    eventsRevenue: ev.revenue,
    revenue: rest.revenue + ev.revenue,
    foodCost: rest.foodCost,
    orders: rest.orders,
    eventsCount: ev.count,
  });
});

router.get('/receivables', async (req, res) => {
  const { rows: roomRows } = await pool.query(
    `SELECT COALESCE(SUM(amount),0) AS total, COUNT(DISTINCT room_id) AS room_count
     FROM room_folio_charges WHERE NOT settled`
  );
  const { rows: ledgerRows } = await pool.query(
    `SELECT COALESCE(SUM(balance),0) AS total, COUNT(*) FILTER (WHERE balance > 0.001) AS account_count
     FROM city_ledger_accounts`
  );
  res.json({
    roomTotal: Number(roomRows[0].total),
    roomCount: Number(roomRows[0].room_count),
    ledgerTotal: Number(ledgerRows[0].total),
    ledgerCount: Number(ledgerRows[0].account_count),
    total: Number(roomRows[0].total) + Number(ledgerRows[0].total),
  });
});

module.exports = router;
