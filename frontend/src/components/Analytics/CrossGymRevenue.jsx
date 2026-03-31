import React, { useState, useEffect } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';

const API = import.meta.env.VITE_API_URL || 'http://localhost:4000';

const BAR_COLOR = '#9f7aea';

const styles = {
  container: { background: '#1A1A2E', borderRadius: '12px', padding: '20px', border: '1px solid #2d2d44' },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' },
  title: { fontSize: '15px', fontWeight: '600', color: '#e2e8f0' },
  select: { background: '#0D0D1A', color: '#e2e8f0', border: '1px solid #2d2d44', borderRadius: '6px', padding: '4px 8px', fontSize: '12px' },
  tooltip: { background: '#1A1A2E', border: '1px solid #2d2d44', borderRadius: '8px', padding: '10px 14px' },
};

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={styles.tooltip}>
      <div style={{ fontSize: '12px', color: '#718096', marginBottom: '4px' }}>{label}</div>
      <div style={{ fontSize: '14px', fontWeight: '600', color: '#9f7aea' }}>
        ₹{parseFloat(payload[0].value).toLocaleString('en-IN')}
      </div>
      {payload[0].payload.payment_count && (
        <div style={{ fontSize: '11px', color: '#718096', marginTop: '2px' }}>
          {payload[0].payload.payment_count} payments
        </div>
      )}
    </div>
  );
};

function shortName(name) {
  return name.replace('WTF Gyms — ', '').replace('WTF Gym — ', '');
}

export default function CrossGymRevenue() {
  const [data, setData] = useState([]);
  const [days, setDays] = useState(30);

  useEffect(() => {
    fetch(`${API}/api/analytics/cross-gym-revenue?days=${days}`)
      .then(r => r.json())
      .then(rows => setData(Array.isArray(rows) ? rows : []))
      .catch(() => setData([]));
  }, [days]);

  const chartData = data.map(r => ({
    name: shortName(r.gym_name),
    revenue: parseFloat(r.total_revenue || 0),
    payment_count: parseInt(r.payment_count || 0),
  }));

  const maxRev = Math.max(...chartData.map(d => d.revenue), 1);

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <div style={styles.title}>Revenue by Gym</div>
        <select style={styles.select} value={days} onChange={e => setDays(Number(e.target.value))}>
          <option value={7}>Last 7 days</option>
          <option value={30}>Last 30 days</option>
          <option value={90}>Last 90 days</option>
        </select>
      </div>

      {chartData.length === 0 ? (
        <div style={{ textAlign: 'center', color: '#4a5568', padding: '40px', fontSize: '13px' }}>No data</div>
      ) : (
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={chartData} layout="vertical" margin={{ top: 0, right: 60, left: 10, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#2d2d44" horizontal={false} />
            <XAxis type="number" tick={{ fill: '#718096', fontSize: 11 }} tickFormatter={v => `₹${(v/1000).toFixed(0)}k`} />
            <YAxis type="category" dataKey="name" tick={{ fill: '#a0aec0', fontSize: 11 }} width={100} />
            <Tooltip content={<CustomTooltip />} />
            <Bar dataKey="revenue" radius={[0, 4, 4, 0]}>
              {chartData.map((entry, i) => (
                <Cell key={i} fill={entry.revenue >= maxRev * 0.8 ? '#68d391' : entry.revenue >= maxRev * 0.5 ? BAR_COLOR : '#4a5568'} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
