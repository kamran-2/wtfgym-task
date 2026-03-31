import React, { useState } from 'react';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const HOURS = Array.from({ length: 18 }, (_, i) => i + 5); // 5am - 10pm

function getColor(val, max) {
  if (!val || max === 0) return '#0D0D1A';
  const ratio = val / max;
  if (ratio > 0.8) return '#9f1239';
  if (ratio > 0.6) return '#dc2626';
  if (ratio > 0.4) return '#f97316';
  if (ratio > 0.2) return '#eab308';
  if (ratio > 0.05) return '#16a34a';
  return '#1e3a2f';
}

const styles = {
  container: { background: '#1A1A2E', borderRadius: '12px', padding: '20px', border: '1px solid #2d2d44' },
  title: { fontSize: '15px', fontWeight: '600', color: '#e2e8f0', marginBottom: '16px' },
  grid: { overflowX: 'auto' },
  table: { borderCollapse: 'collapse', width: '100%', minWidth: '600px' },
  th: { fontSize: '11px', color: '#718096', padding: '4px 6px', textAlign: 'center', fontWeight: '500' },
  dayTh: { fontSize: '11px', color: '#718096', padding: '4px 8px', textAlign: 'right', fontWeight: '500', whiteSpace: 'nowrap' },
  cell: { width: '32px', height: '28px', borderRadius: '3px', cursor: 'default', transition: 'transform 0.1s' },
  legend: { display: 'flex', gap: '8px', alignItems: 'center', marginTop: '12px', fontSize: '11px', color: '#718096' },
  legendCell: { width: '16px', height: '16px', borderRadius: '2px' },
  select: { background: '#0D0D1A', color: '#e2e8f0', border: '1px solid #2d2d44', borderRadius: '6px', padding: '4px 8px', fontSize: '12px', marginBottom: '12px' },
};

export default function PeakHourHeatmap({ data, gyms }) {
  const [selectedGym, setSelectedGym] = useState('all');

  const filtered = selectedGym === 'all' ? data : data.filter(d => String(d.gym_id) === selectedGym);

  // Build lookup map
  const map = {};
  let maxVal = 0;
  for (const row of filtered) {
    const key = `${row.day_of_week}-${row.hour_of_day}`;
    map[key] = (map[key] || 0) + parseInt(row.checkin_count);
    if (map[key] > maxVal) maxVal = map[key];
  }

  return (
    <div style={styles.container}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
        <div style={styles.title}>7-Day Peak Hour Heatmap</div>
        <select style={styles.select} value={selectedGym} onChange={e => setSelectedGym(e.target.value)}>
          <option value="all">All Gyms</option>
          {gyms.map(g => <option key={g.id} value={String(g.id)}>{g.name}</option>)}
        </select>
      </div>
      <div style={styles.grid}>
        <table style={styles.table}>
          <thead>
            <tr>
              <th style={styles.dayTh}></th>
              {HOURS.map(h => (
                <th key={h} style={styles.th}>{h === 12 ? '12p' : h > 12 ? `${h-12}p` : `${h}a`}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {DAYS.map((day, dow) => (
              <tr key={day}>
                <td style={styles.dayTh}>{day}</td>
                {HOURS.map(h => {
                  const val = map[`${dow}-${h}`] || 0;
                  return (
                    <td key={h} style={{ padding: '2px' }}>
                      <div
                        title={`${day} ${h}:00 — ${val} check-ins`}
                        style={{ ...styles.cell, background: getColor(val, maxVal) }}
                      />
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div style={styles.legend}>
        <span>Low</span>
        {['#1e3a2f','#16a34a','#eab308','#f97316','#dc2626','#9f1239'].map(c => (
          <div key={c} style={{ ...styles.legendCell, background: c }} />
        ))}
        <span>High</span>
      </div>
    </div>
  );
}
