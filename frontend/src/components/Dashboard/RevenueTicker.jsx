import { useState, useEffect } from 'react';

const styles = {
  container: {
    background: '#1A1A2E',
    borderRadius: '12px',
    padding: '16px 20px',
    border: '1px solid #2d2d44',
  },
  label: { fontSize: '12px', color: '#718096', marginBottom: '4px' },
  value: { fontSize: '24px', fontWeight: '700', color: '#68d391', fontVariantNumeric: 'tabular-nums' },
  flash: { animation: 'flash 0.5s ease' },
};

export default function RevenueTicker({ gyms }) {
  const [prevTotal, setPrevTotal] = useState(0);
  const [flashing, setFlashing] = useState(false);

  const totalToday = gyms.reduce((sum, g) => sum + parseFloat(g.revenue_today || 0), 0);
  const totalMonth = gyms.reduce((sum, g) => sum + parseFloat(g.revenue_month || 0), 0);

  useEffect(() => {
    if (totalToday !== prevTotal) {
      setFlashing(true);
      setTimeout(() => setFlashing(false), 500);
      setPrevTotal(totalToday);
    }
  }, [totalToday, prevTotal]);

  const topGym = gyms.reduce((top, g) => {
    return parseFloat(g.revenue_today || 0) > parseFloat(top.revenue_today || 0) ? g : top;
  }, gyms[0] || {});

  return (
    <div style={styles.container}>
      <style>{`
        @keyframes flash { 0%{opacity:1} 50%{opacity:0.4} 100%{opacity:1} }
      `}</style>
      <div className="revenue-ticker">
        <div className="revenue-ticker-item">
          <div style={styles.label}>Total Revenue Today</div>
          <div style={{ ...styles.value, ...(flashing ? styles.flash : {}) }}>
            ₹{totalToday.toLocaleString('en-IN')}
          </div>
        </div>

        <div className="ticker-divider" />

        <div className="revenue-ticker-item">
          <div style={styles.label}>This Month</div>
          <div style={{ ...styles.value, color: '#63b3ed' }}>
            ₹{totalMonth.toLocaleString('en-IN')}
          </div>
        </div>

        <div className="ticker-divider" />

        <div className="revenue-ticker-item">
          <div style={styles.label}>Top Earning Gym</div>
          <div style={{ fontSize: '18px', fontWeight: '700', color: '#f6ad55' }}>
            {topGym?.name?.replace('WTF Gyms — ', '') || '—'}
          </div>
          <div style={{ fontSize: '12px', color: '#718096' }}>
            ₹{parseFloat(topGym?.revenue_today || 0).toLocaleString('en-IN')}
          </div>
        </div>

        <div className="ticker-divider" />

        <div className="revenue-ticker-item">
          <div style={styles.label}>Active Gyms</div>
          <div style={{ ...styles.value, color: '#9f7aea' }}>
            {gyms.filter(g => g.status === 'active').length}/{gyms.length}
          </div>
        </div>
      </div>
    </div>
  );
}
