import React, { useRef, useEffect } from 'react';

const EVENT_ICONS = { check_in: '🏋️', check_out: '🚪', CHECK_IN: '🏋️', CHECK_OUT: '🚪', PAYMENT: '💳' };
const EVENT_COLORS = { check_in: '#68d391', check_out: '#fc8181', CHECK_IN: '#68d391', CHECK_OUT: '#fc8181', PAYMENT: '#f6ad55' };

const styles = {
  container: {
    background: '#1A1A2E',
    borderRadius: '12px',
    border: '1px solid #2d2d44',
    display: 'flex',
    flexDirection: 'column',
    height: '400px',
    overflow: 'hidden',
  },
  header: { padding: '14px 16px', borderBottom: '1px solid #2d2d44', display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  title: { fontSize: '14px', fontWeight: '600', color: '#e2e8f0' },
  liveIndicator: { display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: '#68d391' },
  dot: { width: '8px', height: '8px', borderRadius: '50%', background: '#68d391', animation: 'pulse 1.5s infinite' },
  list: { overflowY: 'auto', flex: 1, padding: '8px' },
  item: { display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 10px', borderRadius: '8px', marginBottom: '4px', transition: 'background 0.2s' },
  icon: { fontSize: '16px', flexShrink: 0 },
  info: { flex: 1, minWidth: 0 },
  name: { fontSize: '13px', fontWeight: '500', color: '#e2e8f0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  detail: { fontSize: '11px', color: '#718096', marginTop: '1px' },
  time: { fontSize: '11px', color: '#4a5568', flexShrink: 0 },
};

function formatTime(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  return d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

export default function ActivityFeed({ activities }) {
  const listRef = useRef(null);

  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = 0;
    }
  }, [activities.length]);

  return (
    <div style={styles.container}>
      <style>{`
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.3} }
        @keyframes slideIn { from{opacity:0;transform:translateY(-8px)} to{opacity:1;transform:translateY(0)} }
      `}</style>
      <div style={styles.header}>
        <span style={styles.title}>Live Activity Feed</span>
        <span style={styles.liveIndicator}>
          <span style={styles.dot} /> LIVE
        </span>
      </div>
      <div ref={listRef} style={styles.list}>
        {activities.slice(0, 20).map((item, idx) => {
          const evtType = item.event_type || item.type;
          const color = EVENT_COLORS[evtType] || '#a0aec0';
          const icon = EVENT_ICONS[evtType] || '⚡';
          const isNew = idx === 0;
          return (
            <div
              key={item.id || item.checkin_id || item.payment_id || idx}
              style={{ ...styles.item, background: isNew ? '#1e2040' : 'transparent', animation: isNew ? 'slideIn 0.3s ease' : 'none' }}
            >
              <span style={styles.icon}>{icon}</span>
              <div style={styles.info}>
                <div style={styles.name}>{item.member_name || `Member #${item.member_id}`}</div>
                <div style={styles.detail}>
                  <span style={{ color }}>{evtType?.replace('_', ' ')}</span>
                  {' · '}{item.gym_name}
                  {item.plan_type && <span style={{ color: '#9f7aea' }}> · {item.plan_type}</span>}
                  {item.amount && <span style={{ color: '#f6ad55' }}> · ₹{parseFloat(item.amount).toLocaleString('en-IN')}</span>}
                </div>
              </div>
              <div style={styles.time}>
                {formatTime(item.checked_in_at || item.timestamp)}
              </div>
            </div>
          );
        })}
        {activities.length === 0 && (
          <div style={{ textAlign: 'center', color: '#4a5568', padding: '40px 0', fontSize: '13px' }}>
            Waiting for activity...
          </div>
        )}
      </div>
    </div>
  );
}
