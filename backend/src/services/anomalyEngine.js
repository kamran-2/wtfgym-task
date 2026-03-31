const db = require('../db');

class AnomalyEngine {
  constructor(broadcast) {
    this.broadcast = broadcast;
    this.interval = null;
    this.lastAnomalies = [];
  }

  start() {
    console.log('🔍 Anomaly engine started (30s interval)');
    this.run();
    this.interval = setInterval(() => this.run(), 30000);
  }

  stop() {
    if (this.interval) clearInterval(this.interval);
  }

  async run() {
    try {
      const anomalies = [];

      // 1. Capacity breach >90%
      const { rows: cap } = await db.query(`
        SELECT g.id AS gym_id, g.name AS gym_name, g.capacity,
               COUNT(c.id) AS open_checkins,
               ROUND(COUNT(c.id)::NUMERIC / g.capacity * 100, 1) AS occupancy_pct
        FROM gyms g
        LEFT JOIN checkins c ON c.gym_id = g.id AND c.checked_out_at IS NULL
        GROUP BY g.id
        HAVING COUNT(c.id)::NUMERIC / g.capacity > 0.9
      `);
      for (const r of cap) {
        anomalies.push({
          type: 'CAPACITY_BREACH', severity: 'HIGH',
          gym_id: r.gym_id, gym_name: r.gym_name,
          message: `${r.gym_name} at ${r.occupancy_pct}% capacity (${r.open_checkins}/${r.capacity})`,
          value: parseFloat(r.occupancy_pct), threshold: 90,
          detected_at: new Date().toISOString(),
        });
      }

      // 2. Zero check-ins >2h
      const { rows: zero } = await db.query(`
        SELECT g.id AS gym_id, g.name AS gym_name,
               MAX(c.checked_in_at) AS last_activity,
               EXTRACT(EPOCH FROM (NOW() - MAX(c.checked_in_at))) / 3600 AS hours_idle,
               COUNT(c2.id) AS open_checkins
        FROM gyms g
        LEFT JOIN checkins c ON c.gym_id = g.id
        LEFT JOIN checkins c2 ON c2.gym_id = g.id AND c2.checked_out_at IS NULL
        GROUP BY g.id
        HAVING COUNT(c2.id) = 0
           AND (MAX(c.checked_in_at) IS NULL OR MAX(c.checked_in_at) < NOW() - INTERVAL '2 hours')
      `);
      for (const r of zero) {
        const h = r.hours_idle ? parseFloat(r.hours_idle).toFixed(1) : '?';
        anomalies.push({
          type: 'ZERO_CHECKINS', severity: 'MEDIUM',
          gym_id: r.gym_id, gym_name: r.gym_name,
          message: `${r.gym_name}: 0 active check-ins. Last activity ${h}h ago`,
          value: 0, threshold: 1, detected_at: new Date().toISOString(),
        });
      }

      // 3. Revenue drop >30% vs last week
      const { rows: rev } = await db.query(`
        WITH t AS (
          SELECT gym_id, COALESCE(SUM(amount),0) AS amount
          FROM payments WHERE payment_date >= DATE_TRUNC('day', NOW()) GROUP BY gym_id
        ),
        l AS (
          SELECT gym_id, COALESCE(SUM(amount),0) AS amount
          FROM payments
          WHERE payment_date >= DATE_TRUNC('day', NOW()) - INTERVAL '7 days'
            AND payment_date <  DATE_TRUNC('day', NOW()) - INTERVAL '6 days'
          GROUP BY gym_id
        )
        SELECT g.id AS gym_id, g.name AS gym_name,
               COALESCE(t.amount,0) AS today,
               COALESCE(l.amount,0) AS last_week,
               CASE WHEN COALESCE(l.amount,0)>0
                    THEN ROUND((1 - COALESCE(t.amount,0)/l.amount)*100,1)
                    ELSE 0 END AS drop_pct
        FROM gyms g LEFT JOIN t ON t.gym_id=g.id LEFT JOIN l ON l.gym_id=g.id
        WHERE COALESCE(l.amount,0)>0 AND COALESCE(t.amount,0) < l.amount*0.7
        ORDER BY drop_pct DESC
      `);
      for (const r of rev) {
        anomalies.push({
          type: 'REVENUE_DROP', severity: 'HIGH',
          gym_id: r.gym_id, gym_name: r.gym_name,
          message: `${r.gym_name} revenue ₹${Math.round(r.today)} vs ₹${Math.round(r.last_week)} last week (${r.drop_pct}% drop)`,
          value: parseFloat(r.drop_pct), threshold: 30,
          today_revenue: parseFloat(r.today),
          lastweek_revenue: parseFloat(r.last_week),
          detected_at: new Date().toISOString(),
        });
      }

      // ── Persist to alerts table ──────────────────────────────────────────────
      // Resolve stale open alerts older than 5 minutes that aren't detected this run
      await db.query(`
        UPDATE alerts SET resolved = TRUE, resolved_at = NOW()
        WHERE resolved = FALSE AND detected_at < NOW() - INTERVAL '5 minutes'
      `);

      // Insert each anomaly (deduplicate: skip if same gym+type open alert exists within 5m)
      for (const a of anomalies) {
        await db.query(`
          INSERT INTO alerts (type, severity, gym_id, gym_name, message, value, threshold)
          SELECT $1::varchar, $2::varchar, $3::int, $4::varchar, $5::text, $6::numeric, $7::numeric
          WHERE NOT EXISTS (
            SELECT 1 FROM alerts
            WHERE type = $1::varchar AND gym_id = $3::int AND resolved = FALSE
              AND detected_at > NOW() - INTERVAL '5 minutes'
          )
        `, [a.type, a.severity, a.gym_id, a.gym_name, a.message, a.value, a.threshold]);
      }

      this.broadcast({ type: 'ANOMALIES_UPDATE', data: { anomalies, checked_at: new Date().toISOString() } });
    } catch (err) {
      console.error('Anomaly engine error:', err.message);
    }
  }
}

module.exports = AnomalyEngine;
