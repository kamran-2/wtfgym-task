import React from 'react';

const styles = {
  card: {
    background: '#1A1A2E',
    borderRadius: '12px',
    padding: '16px',
    border: '1px solid #2d2d44',
    transition: 'border-color 0.3s',
  },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' },
  gymName: { fontSize: '15px', fontWeight: '600', color: '#e2e8f0' },
  city: { fontSize: '12px', color: '#718096', marginTop: '2px' },
  badge: { padding: '3px 8px', borderRadius: '20px', fontSize: '11px', fontWeight: '600' },
  barContainer: { background: '#0D0D1A', borderRadius: '6px', height: '8px', overflow: 'hidden', marginBottom: '10px' },
  bar: { height: '100%', borderRadius: '6px', transition: 'width 0.5s ease' },
  stats: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  stat: { textAlign: 'center' },
  statVal: { fontSize: '18px', fontWeight: '700' },
  statLabel: { fontSize: '11px', color: '#718096', marginTop: '2px' },
  revenue: { textAlign: 'right' },
  revenueVal: { fontSize: '16px', fontWeight: '700', color: '#68d391' },
  revenueLabel: { fontSize: '11px', color: '#718096' },
};

function getOccupancyColor(pct) {
  if (pct > 85) return '#fc8181';  // red
  if (pct >= 60) return '#fbbf24'; // yellow
  return '#68d391';                // green
}

export default function OccupancyCard({ gym, liveData }) {
  const occupancy = liveData?.current_occupancy ?? parseInt(gym.current_occupancy ?? 0);
  const capacity = parseInt(gym.capacity);
  const pct = Math.min((occupancy / capacity) * 100, 100);
  const color = getOccupancyColor(pct);

  const revenueToday = parseFloat(liveData?.revenue_today ?? gym.revenue_today ?? 0);
  const statusColor = color;

  return (
    <div style={{ ...styles.card, borderColor: pct > 85 ? '#fc8181' : '#2d2d44' }}>
      <div style={styles.header}>
        <div>
          <div style={styles.gymName}>{gym.name}</div>
          <div style={styles.city}>{gym.city}</div>
        </div>
        <span style={{ ...styles.badge, background: `${statusColor}22`, color: statusColor }}>
          {pct > 85 ? '🔴 HIGH' : pct >= 60 ? '🟡 BUSY' : '🟢 ACTIVE'}
        </span>
      </div>

      <div style={styles.barContainer}>
        <div style={{ ...styles.bar, width: `${pct}%`, background: color }} />
      </div>

      <div style={styles.stats}>
        <div style={styles.stat}>
          <div style={{ ...styles.statVal, color }}>{occupancy}</div>
          <div style={styles.statLabel}>Current</div>
        </div>
        <div style={styles.stat}>
          <div style={{ ...styles.statVal, color: '#e2e8f0' }}>{capacity}</div>
          <div style={styles.statLabel}>Capacity</div>
        </div>
        <div style={styles.stat}>
          <div style={{ ...styles.statVal, color }}>{pct.toFixed(0)}%</div>
          <div style={styles.statLabel}>Occupied</div>
        </div>
        <div style={styles.revenue}>
          <div style={styles.revenueVal}>₹{revenueToday.toLocaleString('en-IN')}</div>
          <div style={styles.revenueLabel}>Today's Revenue</div>
        </div>
      </div>
    </div>
  );
}
