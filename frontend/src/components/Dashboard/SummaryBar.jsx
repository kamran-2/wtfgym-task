const styles = {
  card: {
    background: '#1A1A2E',
    borderRadius: '10px',
    padding: '14px 18px',
    border: '1px solid #2d2d44',
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
  },
  label: { fontSize: '11px', color: '#718096', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.5px' },
  value: { fontSize: '22px', fontWeight: '800' },
  sub: { fontSize: '11px', color: '#4a5568' },
};

export default function SummaryBar({ gyms, anomalies }) {
  const totalCheckedIn = gyms.reduce((s, g) => s + parseInt(g.current_occupancy || 0), 0);
  const totalCapacity  = gyms.reduce((s, g) => s + parseInt(g.capacity || 0), 0);
  const totalRevenue   = gyms.reduce((s, g) => s + parseFloat(g.revenue_today || 0), 0);
  const activeAnomalies = (anomalies || []).length;
  const overallPct = totalCapacity > 0 ? ((totalCheckedIn / totalCapacity) * 100).toFixed(0) : 0;

  const occColor = overallPct > 85 ? '#fc8181' : overallPct >= 60 ? '#fbbf24' : '#68d391';

  return (
    <div className="summary-bar">
      <div style={styles.card}>
        <div style={styles.label}>Live Occupancy</div>
        <div style={{ ...styles.value, color: occColor }}>{totalCheckedIn.toLocaleString('en-IN')}</div>
        <div style={styles.sub}>{overallPct}% of {totalCapacity.toLocaleString('en-IN')} capacity</div>
      </div>
      <div style={styles.card}>
        <div style={styles.label}>Revenue Today</div>
        <div style={{ ...styles.value, color: '#68d391' }}>₹{Math.round(totalRevenue).toLocaleString('en-IN')}</div>
        <div style={styles.sub}>across {gyms.length} gyms</div>
      </div>
      <div style={styles.card}>
        <div style={styles.label}>Active Anomalies</div>
        <div style={{ ...styles.value, color: activeAnomalies > 0 ? '#fc8181' : '#68d391' }}>{activeAnomalies}</div>
        <div style={styles.sub}>{activeAnomalies > 0 ? 'requires attention' : 'all clear'}</div>
      </div>
      <div style={styles.card}>
        <div style={styles.label}>Active Gyms</div>
        <div style={{ ...styles.value, color: '#9f7aea' }}>{gyms.filter(g => g.status === 'active').length}</div>
        <div style={styles.sub}>of {gyms.length} total</div>
      </div>
    </div>
  );
}
