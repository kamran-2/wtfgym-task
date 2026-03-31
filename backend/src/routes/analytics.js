const express = require('express');
const router = express.Router();
const db = require('../db');

// GET /api/analytics/heatmap?gym_id=1
router.get('/heatmap', async (req, res) => {
  try {
    const { gym_id } = req.query;
    let query = `
      SELECT gym_id, day_of_week, hour_of_day, checkin_count,
             g.name AS gym_name
      FROM peak_hour_heatmap h
      JOIN gyms g ON g.id = h.gym_id
    `;
    const params = [];
    if (gym_id) {
      query += ' WHERE h.gym_id = $1';
      params.push(gym_id);
    }
    query += ' ORDER BY gym_id, day_of_week, hour_of_day';
    const { rows } = await db.query(query, params);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/analytics/revenue?gym_id=1
router.get('/revenue', async (req, res) => {
  try {
    const { gym_id } = req.query;
    let query = `
      SELECT r.gym_id, r.plan_type, r.total_revenue, r.payment_count,
             r.revenue_date, g.name AS gym_name
      FROM revenue_breakdown_30d r
      JOIN gyms g ON g.id = r.gym_id
    `;
    const params = [];
    if (gym_id) {
      query += ' WHERE r.gym_id = $1';
      params.push(gym_id);
    }
    query += ' ORDER BY r.gym_id, r.revenue_date DESC';
    const { rows } = await db.query(query, params);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/analytics/churn-risk - members who haven't checked in for 14+ days
router.get('/churn-risk', async (req, res) => {
  try {
    const { rows } = await db.query(`
      SELECT
        m.id,
        m.name,
        m.plan_type,
        m.member_type,
        m.last_checkin_at,
        g.name AS gym_name,
        g.id AS gym_id,
        EXTRACT(EPOCH FROM (NOW() - m.last_checkin_at)) / 86400 AS days_inactive
      FROM members m
      JOIN gyms g ON g.id = m.gym_id
      WHERE m.is_active = TRUE
        AND (m.last_checkin_at < NOW() - INTERVAL '14 days' OR m.last_checkin_at IS NULL)
      ORDER BY m.last_checkin_at ASC NULLS FIRST
      LIMIT 100
    `);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/analytics/peak-hours-live - last 7 days live (fallback if mat view empty)
router.get('/peak-hours-live', async (req, res) => {
  try {
    const { gym_id } = req.query;
    const params = gym_id ? [gym_id] : [];
    const gymFilter = gym_id ? 'AND gym_id = $1' : '';
    const { rows } = await db.query(`
      SELECT
        gym_id,
        EXTRACT(DOW FROM checked_in_at)::INT AS day_of_week,
        EXTRACT(HOUR FROM checked_in_at)::INT AS hour_of_day,
        COUNT(*) AS checkin_count
      FROM checkins
      WHERE checked_in_at >= NOW() - INTERVAL '7 days'
      ${gymFilter}
      GROUP BY gym_id, day_of_week, hour_of_day
      ORDER BY gym_id, day_of_week, hour_of_day
    `, params);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
