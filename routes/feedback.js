const express = require('express');
const pool = require('../db/pool');
const { requireAuth, requireFunction } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth, requireFunction('feedback'));

router.get('/', async (req, res) => {
  const { rows } = await pool.query('SELECT * FROM feedback ORDER BY id DESC');
  res.json(rows);
});

router.get('/summary', async (req, res) => {
  const { rows } = await pool.query(`
    SELECT
      ROUND(AVG(overall_rating) FILTER (WHERE overall_rating > 0), 2) AS overall_avg,
      ROUND(AVG(food_rating) FILTER (WHERE food_rating > 0), 2) AS food_avg,
      ROUND(AVG(service_rating) FILTER (WHERE service_rating > 0), 2) AS service_avg,
      COUNT(*) FILTER (WHERE status = 'new') AS new_count,
      COUNT(*) AS total_count
    FROM feedback
  `);
  res.json(rows[0]);
});

router.put('/:id/review', async (req, res) => {
  const { rows } = await pool.query(
    `UPDATE feedback SET status='reviewed' WHERE id=$1 RETURNING *`,
    [req.params.id]
  );
  if (!rows[0]) return res.status(404).json({ error: 'Feedback not found' });
  res.json(rows[0]);
});

router.delete('/:id', async (req, res) => {
  await pool.query('DELETE FROM feedback WHERE id=$1', [req.params.id]);
  res.status(204).end();
});

module.exports = router;
