const express = require('express');
const router = express.Router();
const db = require('../db');

// GET /api/analytics/heatmap?gym_id=1
router.get('/heatmap', async (req, res) => {
  try {
    const { gym_id } = req.query;
    let query = `
      SELECT h.gym_id, h.day_of_week, h.hour_of_day, h.checkin_count,
             g.name AS gym_name
      FROM peak_hour_heatmap h
      JOIN gyms g ON g.id = h.gym_id
    `;
    const params = [];
    if (gym_id) { query += ' WHERE h.gym_id = $1'; params.push(gym_id); }
    query += ' ORDER BY h.gym_id, h.day_of_week, h.hour_of_day';
    const { rows } = await db.query(query, params);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/analytics/revenue?gym_id=1&from=2025-01-01&to=2025-01-31
router.get('/revenue', async (req, res) => {
  try {
    const { gym_id, from, to } = req.query;
    const params = [];
    let where = [];

    if (gym_id)  { params.push(gym_id); where.push(`r.gym_id = $${params.length}`); }
    if (from)    { params.push(from);   where.push(`r.revenue_date >= $${params.length}`); }
    if (to)      { params.push(to);     where.push(`r.revenue_date <= $${params.length}`); }

    const whereClause = where.length ? 'WHERE ' + where.join(' AND ') : '';

    const { rows } = await db.query(`
      SELECT r.gym_id, r.plan_type, r.total_revenue, r.payment_count,
             r.revenue_date, g.name AS gym_name
      FROM revenue_breakdown_30d r
      JOIN gyms g ON g.id = r.gym_id
      ${whereClause}
      ORDER BY r.gym_id, r.revenue_date DESC
    `, params);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/analytics/churn-risk?gym_id=1
// A-03: members who haven't checked in for 45+ days (High: 45-60d, Critical: 60+d)
router.get('/churn-risk', async (req, res) => {
  try {
    const { gym_id } = req.query;
    const params = [];
    let gymFilter = '';
    if (gym_id) { params.push(gym_id); gymFilter = `AND m.gym_id = $${params.length}`; }

    const { rows } = await db.query(`
      SELECT
        m.id,
        m.name,
        m.plan_type,
        m.member_type,
        m.last_checkin_at,
        g.name AS gym_name,
        g.id   AS gym_id,
        EXTRACT(EPOCH FROM (NOW() - m.last_checkin_at)) / 86400 AS days_inactive,
        CASE
          WHEN EXTRACT(EPOCH FROM (NOW() - m.last_checkin_at)) / 86400 >= 60 THEN 'Critical'
          WHEN EXTRACT(EPOCH FROM (NOW() - m.last_checkin_at)) / 86400 >= 45 THEN 'High'
          ELSE 'High'
        END AS risk_level
      FROM members m
      JOIN gyms g ON g.id = m.gym_id
      WHERE m.is_active = TRUE
        ${gymFilter}
        AND (m.last_checkin_at < NOW() - INTERVAL '45 days' OR m.last_checkin_at IS NULL)
      ORDER BY m.last_checkin_at ASC NULLS FIRST
      LIMIT 200
    `, params);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/analytics/new-vs-renewal?gym_id=1&days=30
// A-04: new joiners vs renewals over last N days
router.get('/new-vs-renewal', async (req, res) => {
  try {
    const days = parseInt(req.query.days) || 30;
    const { gym_id } = req.query;
    const params = [days];
    let gymFilter = '';
    if (gym_id) { params.push(gym_id); gymFilter = `AND p.gym_id = $${params.length}`; }

    const { rows } = await db.query(`
      SELECT
        SUM(CASE WHEN p.renewal_type = 'New'     THEN 1 ELSE 0 END) AS new_count,
        SUM(CASE WHEN p.renewal_type = 'Renewal' THEN 1 ELSE 0 END) AS renewal_count,
        SUM(CASE WHEN p.renewal_type = 'New'     THEN p.amount ELSE 0 END) AS new_revenue,
        SUM(CASE WHEN p.renewal_type = 'Renewal' THEN p.amount ELSE 0 END) AS renewal_revenue
      FROM payments p
      WHERE p.payment_date >= NOW() - ($1 || ' days')::INTERVAL
      ${gymFilter}
    `, params);
    res.json(rows[0] || { new_count: 0, renewal_count: 0, new_revenue: 0, renewal_revenue: 0 });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/analytics/cross-gym-revenue?days=30
// A-05: all 10 gyms ranked by revenue, queryable via GROUP BY with indexing
router.get('/cross-gym-revenue', async (req, res) => {
  try {
    const days = parseInt(req.query.days) || 30;
    const { rows } = await db.query(`
      SELECT
        g.id AS gym_id,
        g.name AS gym_name,
        g.city,
        g.capacity,
        COALESCE(SUM(p.amount), 0) AS total_revenue,
        COUNT(p.id) AS payment_count
      FROM gyms g
      LEFT JOIN payments p ON p.gym_id = g.id
        AND p.payment_date >= NOW() - ($1 || ' days')::INTERVAL
      GROUP BY g.id
      ORDER BY total_revenue DESC
    `, [days]);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
