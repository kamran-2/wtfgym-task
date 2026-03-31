import React, { useState, useEffect } from 'react';
import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from 'recharts';

const API = import.meta.env.VITE_API_URL || 'http://localhost:4000';

const COLORS = { New: '#63b3ed', Renewal: '#9f7aea' };

const styles = {
  container: { background: '#1A1A2E', borderRadius: '12px', padding: '20px', border: '1px solid #2d2d44' },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' },
  title: { fontSize: '15px', fontWeight: '600', color: '#e2e8f0' },
  select: { background: '#0D0D1A', color: '#e2e8f0', border: '1px solid #2d2d44', borderRadius: '6px', padding: '4px 8px', fontSize: '12px' },
  stats: { display: 'flex', gap: '16px', justifyContent: 'center', marginTop: '12px' },
  stat: { textAlign: 'center', padding: '10px 16px', borderRadius: '8px', background: '#0D0D1A' },
  statVal: { fontSize: '20px', fontWeight: '700' },
  statLabel: { fontSize: '11px', color: '#718096', marginTop: '2px' },
  tooltip: { background: '#1A1A2E', border: '1px solid #2d2d44', borderRadius: '8px', padding: '10px 14px' },
};

const CustomTooltip = ({ active, payload }) => {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div style={styles.tooltip}>
      <div style={{ fontWeight: '600', color: COLORS[d.name] || '#e2e8f0', marginBottom: '4px' }}>{d.name}</div>
      <div style={{ fontSize: '12px', color: '#a0aec0' }}>Count: {d.count}</div>
      <div style={{ fontSize: '12px', color: '#a0aec0' }}>Revenue: ₹{parseFloat(d.revenue || 0).toLocaleString('en-IN')}</div>
    </div>
  );
};

export default function NewVsRenewal({ gymId = 'all', gyms = [] }) {
  const [data, setData] = useState([]);
  const [days, setDays] = useState(30);

  useEffect(() => {
    const params = new URLSearchParams({ days });
    if (gymId && gymId !== 'all') params.set('gym_id', gymId);
    fetch(`${API}/api/analytics/new-vs-renewal?${params}`)
      .then(r => r.json())
      .then(d => {
        setData([
          { name: 'New',     value: parseInt(d.new_count || 0),     count: parseInt(d.new_count || 0),     revenue: parseFloat(d.new_revenue || 0) },
          { name: 'Renewal', value: parseInt(d.renewal_count || 0), count: parseInt(d.renewal_count || 0), revenue: parseFloat(d.renewal_revenue || 0) },
        ]);
      })
      .catch(() => setData([]));
  }, [gymId, days]);

  const total = data.reduce((s, d) => s + d.count, 0);

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <div style={styles.title}>New vs Renewal</div>
        <select style={styles.select} value={days} onChange={e => setDays(Number(e.target.value))}>
          <option value={7}>Last 7 days</option>
          <option value={30}>Last 30 days</option>
          <option value={90}>Last 90 days</option>
        </select>
      </div>

      {total === 0 ? (
        <div style={{ textAlign: 'center', color: '#4a5568', padding: '40px', fontSize: '13px' }}>No data</div>
      ) : (
        <>
          <ResponsiveContainer width="100%" height={200}>
            <PieChart>
              <Pie data={data} cx="50%" cy="50%" innerRadius={55} outerRadius={85} dataKey="value"
                label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                labelLine={false}>
                {data.map(d => <Cell key={d.name} fill={COLORS[d.name] || '#a0aec0'} />)}
              </Pie>
              <Tooltip content={<CustomTooltip />} />
            </PieChart>
          </ResponsiveContainer>

          <div style={styles.stats}>
            {data.map(d => (
              <div key={d.name} style={{ ...styles.stat, borderTop: `3px solid ${COLORS[d.name]}` }}>
                <div style={{ ...styles.statVal, color: COLORS[d.name] }}>{d.count}</div>
                <div style={styles.statLabel}>{d.name}</div>
                <div style={{ fontSize: '11px', color: '#9f7aea', marginTop: '2px' }}>₹{Math.round(d.revenue).toLocaleString('en-IN')}</div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
