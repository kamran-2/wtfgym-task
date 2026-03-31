const express = require('express');
const router = express.Router();
const db = require('../db');

// GET /api/anomalies - current anomalies
router.get('/', async (req, res) => {
  try {
    const anomalies = [];

    // 1. Capacity Breach: gyms with >90% occupancy
    const { rows: capacityRows } = await db.query(`
      SELECT
        g.id AS gym_id,
        g.name AS gym_name,
        g.capacity,
        COUNT(c.id) AS open_checkins,
        ROUND(COUNT(c.id)::NUMERIC / g.capacity * 100, 1) AS occupancy_pct
      FROM gyms g
      LEFT JOIN checkins c ON c.gym_id = g.id AND c.checked_out_at IS NULL
      GROUP BY g.id
      HAVING COUNT(c.id)::NUMERIC / g.capacity > 0.9
      ORDER BY occupancy_pct DESC
    `);
    for (const row of capacityRows) {
      anomalies.push({
        type: 'CAPACITY_BREACH',
        severity: 'HIGH',
        gym_id: row.gym_id,
        gym_name: row.gym_name,
        message: `${row.gym_name} at ${row.occupancy_pct}% capacity (${row.open_checkins}/${row.capacity})`,
        value: parseFloat(row.occupancy_pct),
        threshold: 90,
        detected_at: new Date().toISOString(),
      });
    }

    // 2. Zero Check-ins: gyms with no active check-ins and last activity >2h ago
    const { rows: zeroRows } = await db.query(`
      SELECT
        g.id AS gym_id,
        g.name AS gym_name,
        MAX(c.checked_in_at) AS last_activity,
        EXTRACT(EPOCH FROM (NOW() - MAX(c.checked_in_at))) / 3600 AS hours_since_activity,
        COUNT(c2.id) AS open_checkins
      FROM gyms g
      LEFT JOIN checkins c ON c.gym_id = g.id
      LEFT JOIN checkins c2 ON c2.gym_id = g.id AND c2.checked_out_at IS NULL
      GROUP BY g.id
      HAVING COUNT(c2.id) = 0
         AND (MAX(c.checked_in_at) IS NULL OR MAX(c.checked_in_at) < NOW() - INTERVAL '2 hours')
      ORDER BY last_activity ASC
    `);
    for (const row of zeroRows) {
      const hoursAgo = row.hours_since_activity ? parseFloat(row.hours_since_activity).toFixed(1) : 'N/A';
      anomalies.push({
        type: 'ZERO_CHECKINS',
        severity: 'MEDIUM',
        gym_id: row.gym_id,
        gym_name: row.gym_name,
        message: `${row.gym_name} has 0 active check-ins. Last activity ${hoursAgo}h ago`,
        value: 0,
        threshold: 1,
        detected_at: new Date().toISOString(),
      });
    }

    // 3. Revenue Drop: >30% drop vs same day last week
    const { rows: revenueRows } = await db.query(`
      WITH today_rev AS (
        SELECT gym_id, SUM(amount) AS amount
        FROM payments
        WHERE payment_date >= DATE_TRUNC('day', NOW())
        GROUP BY gym_id
      ),
      lastweek_rev AS (
        SELECT gym_id, SUM(amount) AS amount
        FROM payments
        WHERE payment_date >= DATE_TRUNC('day', NOW()) - INTERVAL '7 days'
          AND payment_date < DATE_TRUNC('day', NOW()) - INTERVAL '6 days'
        GROUP BY gym_id
      )
      SELECT
        g.id AS gym_id,
        g.name AS gym_name,
        COALESCE(t.amount, 0) AS today_revenue,
        COALESCE(l.amount, 0) AS lastweek_revenue,
        CASE
          WHEN COALESCE(l.amount, 0) > 0
          THEN ROUND((1 - COALESCE(t.amount, 0) / l.amount) * 100, 1)
          ELSE 0
        END AS drop_pct
      FROM gyms g
      LEFT JOIN today_rev t ON t.gym_id = g.id
      LEFT JOIN lastweek_rev l ON l.gym_id = g.id
      WHERE COALESCE(l.amount, 0) > 0
        AND COALESCE(t.amount, 0) < l.amount * 0.7
      ORDER BY drop_pct DESC
    `);
    for (const row of revenueRows) {
      anomalies.push({
        type: 'REVENUE_DROP',
        severity: 'HIGH',
        gym_id: row.gym_id,
        gym_name: row.gym_name,
        message: `${row.gym_name} revenue dropped ${row.drop_pct}% vs last week (₹${Math.round(row.today_revenue)} vs ₹${Math.round(row.lastweek_revenue)})`,
        value: parseFloat(row.drop_pct),
        threshold: 30,
        today_revenue: parseFloat(row.today_revenue),
        lastweek_revenue: parseFloat(row.lastweek_revenue),
        detected_at: new Date().toISOString(),
      });
    }

    res.json({ anomalies, count: anomalies.length, checked_at: new Date().toISOString() });
  } catch (err) {
    console.error('anomalies error:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/anomalies/history - persisted alert log from DB
router.get('/history', async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 50, 200);
    const { rows } = await db.query(`
      SELECT id, type, severity, gym_id, gym_name, message, value, threshold,
             resolved, detected_at, resolved_at
      FROM alerts
      ORDER BY detected_at DESC
      LIMIT $1
    `, [limit]);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
