const db = require('../db');

const PLAN_PRICES = { Monthly: 1499, Quarterly: 3999, Annual: 11999 };
const BASE_INTERVAL_MS = 2000; // 1x speed

class DataSimulator {
  constructor(broadcast) {
    this.broadcast = broadcast;
    this.interval = null;
    this.gymCache = [];
    this.memberCache = [];
    this.loaded = false;
    this.paused = false;
    this.speed = 1; // 1x | 5x | 10x
  }

  _intervalMs() { return Math.round(BASE_INTERVAL_MS / this.speed); }

  async loadCache() {
    const { rows: gyms } = await db.query(
      'SELECT id, name, capacity FROM gyms WHERE status = $1', ['active']
    );
    const { rows: members } = await db.query(
      'SELECT id, gym_id, plan_type FROM members WHERE is_active = TRUE ORDER BY RANDOM() LIMIT 500'
    );
    this.gymCache   = gyms;
    this.memberCache = members;
    this.loaded = true;
  }

  start() {
    console.log('⚡ Data simulator started (2s interval, 1x speed)');
    this.loadCache().then(() => {
      this.interval = setInterval(() => this.tick(), this._intervalMs());
    });
  }

  stop() {
    if (this.interval) clearInterval(this.interval);
  }

  pause() {
    this.paused = true;
    console.log('⏸  Simulator paused');
  }

  resume() {
    this.paused = false;
    console.log('▶️  Simulator resumed');
  }

  setSpeed(speed) {
    const valid = [1, 5, 10];
    this.speed = valid.includes(speed) ? speed : 1;
    // Restart interval with new speed
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = setInterval(() => this.tick(), this._intervalMs());
    }
    console.log(`⚡ Simulator speed set to ${this.speed}x`);
  }

  reset() {
    this.speed  = 1;
    this.paused = false;
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = setInterval(() => this.tick(), this._intervalMs());
    }
    console.log('🔄 Simulator reset to 1x');
  }

  getStatus() {
    return { paused: this.paused, speed: this.speed, interval_ms: this._intervalMs() };
  }

  async tick() {
    if (!this.loaded || this.gymCache.length === 0 || this.paused) return;

    try {
      const events = [];
      const eventCount = Math.floor(Math.random() * 3) + 1;

      for (let i = 0; i < eventCount; i++) {
        const r = Math.random();
        const eventType = r < 0.55 ? 'check_in' : r < 0.80 ? 'check_out' : 'payment';

        if (eventType === 'check_in') {
          const member = this.memberCache[Math.floor(Math.random() * this.memberCache.length)];
          const { rows } = await db.query(
            `INSERT INTO checkins (member_id, gym_id, checked_in_at)
             VALUES ($1, $2, NOW())
             RETURNING id, member_id, gym_id, checked_in_at`,
            [member.id, member.gym_id]
          );
          await db.query('UPDATE members SET last_checkin_at = NOW() WHERE id = $1', [member.id]);

          const gym = this.gymCache.find(g => g.id === member.gym_id);
          events.push({
            type: 'CHECK_IN',
            checkin_id: rows[0].id,
            member_id:  member.id,
            gym_id:     member.gym_id,
            gym_name:   gym?.name || 'Unknown',
            plan_type:  member.plan_type,
            timestamp:  rows[0].checked_in_at,
          });

        } else if (eventType === 'check_out') {
          const { rows } = await db.query(`
            UPDATE checkins SET checked_out_at = NOW()
            WHERE id = (
              SELECT id FROM checkins
              WHERE checked_out_at IS NULL
              ORDER BY RANDOM() LIMIT 1
            )
            RETURNING id, member_id, gym_id, checked_out_at
          `);
          if (rows.length > 0) {
            const gym = this.gymCache.find(g => g.id === rows[0].gym_id);
            events.push({
              type:       'CHECK_OUT',
              checkin_id: rows[0].id,
              member_id:  rows[0].member_id,
              gym_id:     rows[0].gym_id,
              gym_name:   gym?.name || 'Unknown',
              timestamp:  rows[0].checked_out_at,
            });
          }

        } else {
          const member = this.memberCache[Math.floor(Math.random() * this.memberCache.length)];
          const amount = PLAN_PRICES[member.plan_type];
          const { rows } = await db.query(
            `INSERT INTO payments (member_id, gym_id, amount, plan_type, payment_date, renewal_type)
             VALUES ($1, $2, $3, $4, NOW(), 'Renewal')
             RETURNING id, gym_id, amount, plan_type, payment_date`,
            [member.id, member.gym_id, amount, member.plan_type]
          );
          const gym = this.gymCache.find(g => g.id === member.gym_id);
          events.push({
            type:       'PAYMENT',
            payment_id: rows[0].id,
            member_id:  member.id,
            gym_id:     member.gym_id,
            gym_name:   gym?.name || 'Unknown',
            plan_type:  rows[0].plan_type,
            amount:     rows[0].amount,
            timestamp:  rows[0].payment_date,
          });
        }
      }

      if (events.length > 0) {
        const gymIds = [...new Set(events.map(e => e.gym_id))];
        const { rows: occupancy } = await db.query(`
          SELECT g.id, g.name, g.capacity,
                 COUNT(c.id) AS current_occupancy,
                 ROUND(COUNT(c.id)::NUMERIC / g.capacity * 100, 1) AS occupancy_pct
          FROM gyms g
          LEFT JOIN checkins c ON c.gym_id = g.id AND c.checked_out_at IS NULL
          WHERE g.id = ANY($1)
          GROUP BY g.id
        `, [gymIds]);

        this.broadcast({ type: 'LIVE_EVENT', data: { events, occupancy, timestamp: new Date().toISOString() } });
      }
    } catch (err) {
      console.error('Simulator error:', err.message);
    }
  }
}

module.exports = DataSimulator;
