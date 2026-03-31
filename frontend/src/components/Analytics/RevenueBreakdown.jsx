import React, { useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';

const PLAN_COLORS = { Monthly: '#63b3ed', Quarterly: '#9f7aea', Annual: '#68d391' };

const styles = {
  container: { background: '#1A1A2E', borderRadius: '12px', padding: '20px', border: '1px solid #2d2d44' },
  title: { fontSize: '15px', fontWeight: '600', color: '#e2e8f0', marginBottom: '16px' },
  select: { background: '#0D0D1A', color: '#e2e8f0', border: '1px solid #2d2d44', borderRadius: '6px', padding: '4px 8px', fontSize: '12px' },
  tabs: { display: 'flex', gap: '8px', marginBottom: '16px' },
  tab: { padding: '6px 14px', borderRadius: '6px', border: 'none', cursor: 'pointer', fontSize: '13px', transition: 'all 0.2s' },
  customTooltip: { background: '#1A1A2E', border: '1px solid #2d2d44', borderRadius: '8px', padding: '10px 14px' },
};

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={styles.customTooltip}>
      <div style={{ fontSize: '12px', color: '#718096', marginBottom: '6px' }}>{label}</div>
      {payload.map(p => (
        <div key={p.name} style={{ fontSize: '13px', color: p.fill, marginBottom: '2px' }}>
          {p.name}: ₹{parseFloat(p.value).toLocaleString('en-IN')}
        </div>
      ))}
    </div>
  );
};

function toLocalDate(d) {
  return d.toISOString().split('T')[0];
}

export default function RevenueBreakdown({ data, gyms }) {
  const [view, setView] = useState('bar');
  const [selectedGym, setSelectedGym] = useState('all');
  const today = toLocalDate(new Date());
  const thirtyDaysAgo = toLocalDate(new Date(Date.now() - 29 * 86400000));
  const [fromDate, setFromDate] = useState(thirtyDaysAgo);
  const [toDate, setToDate] = useState(today);

  const filtered = data.filter(d => {
    if (selectedGym !== 'all' && String(d.gym_id) !== selectedGym) return false;
    const rd = d.revenue_date ? d.revenue_date.split('T')[0] : null;
    if (rd && fromDate && rd < fromDate) return false;
    if (rd && toDate && rd > toDate) return false;
    return true;
  });

  // Aggregate by gym + plan_type
  const gymPlanMap = {};
  for (const row of filtered) {
    const key = row.gym_name || `Gym ${row.gym_id}`;
    if (!gymPlanMap[key]) gymPlanMap[key] = { name: key, Monthly: 0, Quarterly: 0, Annual: 0 };
    gymPlanMap[key][row.plan_type] = (gymPlanMap[key][row.plan_type] || 0) + parseFloat(row.total_revenue);
  }
  const barData = Object.values(gymPlanMap);

  // Pie data: total by plan
  const pieMap = { Monthly: 0, Quarterly: 0, Annual: 0 };
  for (const row of filtered) {
    pieMap[row.plan_type] = (pieMap[row.plan_type] || 0) + parseFloat(row.total_revenue);
  }
  const pieData = Object.entries(pieMap).map(([name, value]) => ({ name, value }));

  return (
    <div style={styles.container}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', flexWrap: 'wrap', gap: '8px' }}>
        <div style={styles.title}>Revenue by Plan</div>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
          <input type="date" style={styles.select} value={fromDate} max={toDate} onChange={e => setFromDate(e.target.value)} />
          <span style={{ color: '#718096', fontSize: '12px' }}>to</span>
          <input type="date" style={styles.select} value={toDate} min={fromDate} max={today} onChange={e => setToDate(e.target.value)} />
          <select style={styles.select} value={selectedGym} onChange={e => setSelectedGym(e.target.value)}>
            <option value="all">All Gyms</option>
            {gyms.map(g => <option key={g.id} value={String(g.id)}>{g.name}</option>)}
          </select>
          <div style={styles.tabs}>
            {['bar', 'pie'].map(v => (
              <button
                key={v}
                onClick={() => setView(v)}
                style={{ ...styles.tab, background: view === v ? '#4a5568' : '#2d2d44', color: view === v ? '#e2e8f0' : '#718096' }}
              >
                {v === 'bar' ? '📊 Bar' : '🥧 Pie'}
              </button>
            ))}
          </div>
        </div>
      </div>

      {view === 'bar' ? (
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={barData} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#2d2d44" />
            <XAxis dataKey="name" tick={{ fill: '#718096', fontSize: 11 }} />
            <YAxis tick={{ fill: '#718096', fontSize: 11 }} tickFormatter={v => `₹${(v/1000).toFixed(0)}k`} />
            <Tooltip content={<CustomTooltip />} />
            <Legend wrapperStyle={{ fontSize: '12px' }} />
            <Bar dataKey="Monthly" fill={PLAN_COLORS.Monthly} radius={[3,3,0,0]} />
            <Bar dataKey="Quarterly" fill={PLAN_COLORS.Quarterly} radius={[3,3,0,0]} />
            <Bar dataKey="Annual" fill={PLAN_COLORS.Annual} radius={[3,3,0,0]} />
          </BarChart>
        </ResponsiveContainer>
      ) : (
        <div style={{ display: 'flex', justifyContent: 'center' }}>
          <ResponsiveContainer width="100%" height={280}>
            <PieChart>
              <Pie data={pieData} cx="50%" cy="50%" outerRadius={100} dataKey="value" label={({ name, percent }) => `${name} ${(percent*100).toFixed(0)}%`}>
                {pieData.map((entry, i) => <Cell key={entry.name} fill={PLAN_COLORS[entry.name] || '#a0aec0'} />)}
              </Pie>
              <Tooltip formatter={(v) => `₹${parseFloat(v).toLocaleString('en-IN')}`} contentStyle={{ background: '#1A1A2E', border: '1px solid #2d2d44', borderRadius: '8px' }} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
