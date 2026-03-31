import React from 'react';

const TYPE_CONFIG = {
  CAPACITY_BREACH: { icon: '🔴', label: 'Capacity Breach', color: '#fc8181', bg: '#fc818115' },
  ZERO_CHECKINS:   { icon: '⚠️', label: 'Zero Check-ins',  color: '#f6ad55', bg: '#f6ad5515' },
  REVENUE_DROP:    { icon: '📉', label: 'Revenue Drop',     color: '#9f7aea', bg: '#9f7aea15' },
};

const SEVERITY_COLORS = { HIGH: '#fc8181', MEDIUM: '#f6ad55', LOW: '#68d391' };

const styles = {
  container: { display: 'flex', flexDirection: 'column', gap: '10px' },
  alert: { borderRadius: '10px', padding: '14px 16px', border: '1px solid', display: 'flex', gap: '12px', alignItems: 'flex-start' },
  icon: { fontSize: '20px', flexShrink: 0 },
  body: { flex: 1 },
  topRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' },
  typeLabel: { fontSize: '12px', fontWeight: '700', letterSpacing: '0.5px' },
  severity: { padding: '2px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: '700' },
  message: { fontSize: '13px', color: '#e2e8f0', lineHeight: '1.4' },
  time: { fontSize: '11px', color: '#718096', marginTop: '4px' },
  empty: {
    background: '#1A1A2E', borderRadius: '12px', padding: '40px', textAlign: 'center',
    border: '1px solid #2d2d44', color: '#4a5568', fontSize: '14px',
  },
  pulse: { animation: 'anomalyPulse 2s infinite' },
};

function formatTime(ts) {
  return new Date(ts).toLocaleTimeString('en-IN');
}

export default function AnomalyAlerts({ anomalies, lastChecked }) {
  if (!anomalies || anomalies.length === 0) {
    return (
      <div style={styles.empty}>
        <div style={{ fontSize: '32px', marginBottom: '8px' }}>✅</div>
        <div>No anomalies detected</div>
        {lastChecked && <div style={{ fontSize: '11px', marginTop: '6px', color: '#718096' }}>Last checked: {formatTime(lastChecked)}</div>}
      </div>
    );
  }

  return (
    <div style={styles.container}>
      <style>{`
        @keyframes anomalyPulse { 0%,100%{opacity:1} 50%{opacity:0.6} }
      `}</style>
      {anomalies.map((a, i) => {
        const cfg = TYPE_CONFIG[a.type] || { icon: '⚡', label: a.type, color: '#a0aec0', bg: '#a0aec010' };
        const sevColor = SEVERITY_COLORS[a.severity] || '#a0aec0';
        return (
          <div
            key={i}
            style={{
              ...styles.alert,
              background: cfg.bg,
              borderColor: cfg.color + '44',
              ...(a.severity === 'HIGH' ? styles.pulse : {}),
            }}
          >
            <span style={styles.icon}>{cfg.icon}</span>
            <div style={styles.body}>
              <div style={styles.topRow}>
                <span style={{ ...styles.typeLabel, color: cfg.color }}>{cfg.label}</span>
                <span style={{ ...styles.severity, background: `${sevColor}22`, color: sevColor }}>
                  {a.severity}
                </span>
              </div>
              <div style={styles.message}>{a.message}</div>
              <div style={styles.time}>Detected at {formatTime(a.detected_at)}</div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
