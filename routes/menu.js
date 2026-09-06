const express = require('express');
const pool = require('../db/pool');
const { requireAuth, requireFunction } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

router.get('/', async (req, res) => {
  const { section } = req.query; // optional: filter for a table's section context
  const { rows } = await pool.query('SELECT * FROM menu_items ORDER BY id');
  const items = section
    ? rows.filter((m) => !m.section_id || m.section_id === section)
    : rows;
  res.json(items);
});

router.get('/categories', async (req, res) => {
  const { rows } = await pool.query('SELECT * FROM menu_categories ORDER BY sort_order');
  res.json(rows);
});

router.put('/categories/reorder', requireFunction('menu'), async (req, res) => {
  const { order } = req.body || {}; // array of category names in desired order
  if (!Array.isArray(order)) return res.status(400).json({ error: 'order must be an array' });
  await pool.query('BEGIN');
  try {
    for (let i = 0; i < order.length; i++) {
      await pool.query('UPDATE menu_categories SET sort_order=$1 WHERE name=$2', [i, order[i]]);
    }
    await pool.query('COMMIT');
  } catch (err) {
    await pool.query('ROLLBACK');
    throw err;
  }
  res.status(204).end();
});

router.post('/', requireFunction('menu'), async (req, res) => {
  const { name, category, price, cost, section_id, modifiers, image } = req.body || {};
  if (!name || !category || price == null) {
    return res.status(400).json({ error: 'name, category, price are required' });
  }
  await pool.query(
    `INSERT INTO menu_categories (name) VALUES ($1) ON CONFLICT DO NOTHING`,
    [category]
  );
  const { rows } = await pool.query(
    `INSERT INTO menu_items (name, category, price, cost, section_id, modifiers, image)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
    [name, category, price, cost || 0, section_id || null, modifiers || null, image || null]
  );
  res.status(201).json(rows[0]);
});

router.put('/:id', requireFunction('menu'), async (req, res) => {
  const { name, category, price, cost, section_id, modifiers, image, clear_image } = req.body || {};
  if (category) {
    await pool.query(`INSERT INTO menu_categories (name) VALUES ($1) ON CONFLICT DO NOTHING`, [category]);
  }
  const { rows } = await pool.query(
    `UPDATE menu_items SET
       name=COALESCE($1,name), category=COALESCE($2,category), price=COALESCE($3,price),
       cost=COALESCE($4,cost), section_id=$5, modifiers=COALESCE($6,modifiers),
       image = CASE WHEN $7 THEN NULL WHEN $8::text IS NOT NULL THEN $8 ELSE image END
     WHERE id=$9 RETURNING *`,
    [name, category, price, cost, section_id ?? null, modifiers, !!clear_image, image, req.params.id]
  );
  if (!rows[0]) return res.status(404).json({ error: 'Menu item not found' });
  res.json(rows[0]);
});

router.delete('/:id', requireFunction('menu'), async (req, res) => {
  await pool.query('DELETE FROM menu_items WHERE id = $1', [req.params.id]);
  res.status(204).end();
});

module.exports = router;
