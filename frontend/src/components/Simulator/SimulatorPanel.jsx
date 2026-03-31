import React, { useState, useEffect } from 'react';

const API = import.meta.env.VITE_API_URL || 'http://localhost:4000';

const styles = {
  panel: {
    background: '#1A1A2E',
    borderRadius: '12px',
    padding: '16px 20px',
    border: '1px solid #2d2d44',
  },
  title: { fontSize: '14px', fontWeight: '700', color: '#e2e8f0', marginBottom: '14px', display: 'flex', alignItems: 'center', gap: '8px' },
  row: { display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' },
  label: { fontSize: '11px', color: '#718096', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.5px', minWidth: '50px' },
  btn: {
    border: 'none', borderRadius: '6px', padding: '6px 14px',
    fontSize: '13px', fontWeight: '600', cursor: 'pointer',
    transition: 'all 0.15s',
  },
  speedBtn: {
    border: '1px solid #2d2d44', borderRadius: '6px', padding: '5px 12px',
    fontSize: '13px', fontWeight: '600', cursor: 'pointer', background: '#0D0D1A',
    color: '#718096', transition: 'all 0.15s',
  },
  status: { fontSize: '12px', color: '#718096', marginTop: '10px', display: 'flex', alignItems: 'center', gap: '6px' },
  dot: { width: '8px', height: '8px', borderRadius: '50%', flexShrink: 0 },
};

export default function SimulatorPanel() {
  const [status, setStatus] = useState({ paused: false, speed: 1, interval_ms: 2000 });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetch(`${API}/api/simulator/status`)
      .then(r => r.json())
      .then(setStatus)
      .catch(() => {});
  }, []);

  async function control(action, extra = {}) {
    setLoading(true);
    try {
      const r = await fetch(`${API}/api/simulator/control`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, ...extra }),
      });
      const s = await r.json();
      setStatus(s);
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  }

  const isRunning = !status.paused;

  return (
    <div style={styles.panel}>
      <div style={styles.title}>
        <span>⚙️</span> Simulator Control
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {/* Play/Pause */}
        <div style={styles.row}>
          <span style={styles.label}>State</span>
          <button
            style={{
              ...styles.btn,
              background: isRunning ? '#fc818133' : '#68d39133',
              color: isRunning ? '#fc8181' : '#68d391',
              border: `1px solid ${isRunning ? '#fc818155' : '#68d39155'}`,
            }}
            onClick={() => control(isRunning ? 'pause' : 'resume')}
            disabled={loading}
          >
            {isRunning ? '⏸ Pause' : '▶ Resume'}
          </button>
        </div>

        {/* Speed */}
        <div style={styles.row}>
          <span style={styles.label}>Speed</span>
          {[1, 5, 10].map(s => (
            <button
              key={s}
              style={{
                ...styles.speedBtn,
                background: status.speed === s ? '#9f7aea33' : '#0D0D1A',
                color: status.speed === s ? '#9f7aea' : '#718096',
                border: `1px solid ${status.speed === s ? '#9f7aea55' : '#2d2d44'}`,
              }}
              onClick={() => control('speed', { speed: s })}
              disabled={loading}
            >
              {s}×
            </button>
          ))}
        </div>

        {/* Reset */}
        <div style={styles.row}>
          <span style={styles.label}>Reset</span>
          <button
            style={{ ...styles.btn, background: '#4a556833', color: '#a0aec0', border: '1px solid #4a5568' }}
            onClick={() => control('reset')}
            disabled={loading}
          >
            ↺ Reset
          </button>
        </div>
      </div>

      <div style={styles.status}>
        <div style={{ ...styles.dot, background: isRunning ? '#68d391' : '#fc8181', animation: isRunning ? 'pulse 1.5s infinite' : 'none' }} />
        <span style={{ color: isRunning ? '#68d391' : '#fc8181' }}>
          {isRunning ? 'Running' : 'Paused'}
        </span>
        <span style={{ color: '#4a5568' }}>·</span>
        <span>Speed {status.speed}× · {status.interval_ms}ms interval</span>
      </div>
    </div>
  );
}
