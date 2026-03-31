const express = require('express');
const router = express.Router();
const db = require('../db');

// GET /api/dashboard - live occupancy + revenue for all gyms
router.get('/', async (req, res) => {
  try {
    const { rows } = await db.query(`
      SELECT
        g.id,
        g.name,
        g.city,
        g.capacity,
        g.status,
        COUNT(c.id) FILTER (WHERE c.checked_out_at IS NULL) AS current_occupancy,
        COALESCE(SUM(p.amount) FILTER (WHERE p.payment_date >= NOW() - INTERVAL '24 hours'), 0) AS revenue_today,
        COALESCE(SUM(p.amount) FILTER (WHERE p.payment_date >= DATE_TRUNC('month', NOW())), 0) AS revenue_month,
        COUNT(DISTINCT m.id) AS total_members
      FROM gyms g
      LEFT JOIN checkins c ON c.gym_id = g.id AND c.checked_in_at >= NOW() - INTERVAL '12 hours'
      LEFT JOIN payments p ON p.gym_id = g.id
      LEFT JOIN members m ON m.gym_id = g.id
      GROUP BY g.id
      ORDER BY g.name
    `);
    res.json(rows);
  } catch (err) {
    console.error('dashboard error:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/dashboard/activity-feed - last 50 events across all gyms
router.get('/activity-feed', async (req, res) => {
  try {
    const { rows } = await db.query(`
      SELECT
        c.id,
        g.name AS gym_name,
        m.name AS member_name,
        m.plan_type,
        c.checked_in_at,
        c.checked_out_at,
        CASE WHEN c.checked_out_at IS NULL THEN 'check_in' ELSE 'check_out' END AS event_type
      FROM checkins c
      JOIN members m ON m.id = c.member_id
      JOIN gyms g ON g.id = c.gym_id
      ORDER BY c.checked_in_at DESC
      LIMIT 50
    `);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/dashboard/gym/:id - single gym detail
router.get('/gym/:id', async (req, res) => {
  try {
    const { rows } = await db.query(`
      SELECT
        g.*,
        COUNT(c.id) FILTER (WHERE c.checked_out_at IS NULL) AS current_occupancy,
        COALESCE(SUM(p.amount) FILTER (WHERE p.payment_date >= DATE_TRUNC('day', NOW())), 0) AS revenue_today
      FROM gyms g
      LEFT JOIN checkins c ON c.gym_id = g.id AND c.checked_in_at >= NOW() - INTERVAL '12 hours'
      LEFT JOIN payments p ON p.gym_id = g.id
      WHERE g.id = $1
      GROUP BY g.id
    `, [req.params.id]);

    if (!rows[0]) return res.status(404).json({ error: 'Gym not found' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
