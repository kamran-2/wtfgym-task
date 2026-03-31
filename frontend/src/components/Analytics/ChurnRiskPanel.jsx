import React from 'react';

const styles = {
  container: { background: '#1A1A2E', borderRadius: '12px', border: '1px solid #2d2d44', overflow: 'hidden' },
  header: { padding: '14px 16px', borderBottom: '1px solid #2d2d44', display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  title: { fontSize: '15px', fontWeight: '600', color: '#e2e8f0' },
  count: { background: '#fc818122', color: '#fc8181', borderRadius: '20px', padding: '2px 10px', fontSize: '12px', fontWeight: '600' },
  table: { width: '100%', borderCollapse: 'collapse' },
  th: { padding: '10px 14px', textAlign: 'left', fontSize: '11px', color: '#718096', fontWeight: '500', borderBottom: '1px solid #2d2d44', background: '#15152a' },
  td: { padding: '10px 14px', fontSize: '13px', color: '#e2e8f0', borderBottom: '1px solid #1e1e35' },
  planBadge: { padding: '2px 8px', borderRadius: '20px', fontSize: '11px', fontWeight: '600' },
  risk: { padding: '2px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: '600' },
  empty: { textAlign: 'center', padding: '40px', color: '#4a5568', fontSize: '13px' },
};

const PLAN_COLORS = { Monthly: '#63b3ed22', Quarterly: '#9f7aea22', Annual: '#68d39122' };
const PLAN_TEXT = { Monthly: '#63b3ed', Quarterly: '#9f7aea', Annual: '#68d391' };

function getRiskLevel(days) {
  if (days >= 60) return { label: 'CRITICAL', color: '#fc8181', bg: '#fc818122' };
  return { label: 'HIGH', color: '#f6ad55', bg: '#f6ad5522' };
}

function formatLastSeen(ts) {
  if (!ts) return 'Never';
  const diff = Date.now() - new Date(ts).getTime();
  const days = Math.floor(diff / 86400000);
  return `${days}d ago`;
}

export default function ChurnRiskPanel({ members }) {
  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <span style={styles.title}>Churn Risk Members</span>
        <span style={styles.count}>{members.length} at risk</span>
      </div>
      {members.length === 0 ? (
        <div style={styles.empty}>No high-risk members detected</div>
      ) : (
        <div style={{ maxHeight: '320px', overflowY: 'auto' }}>
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>Member</th>
                <th style={styles.th}>Gym</th>
                <th style={styles.th}>Plan</th>
                <th style={styles.th}>Last Seen</th>
                <th style={styles.th}>Risk</th>
              </tr>
            </thead>
            <tbody>
              {members.slice(0, 100).map(m => {
                const days = parseFloat(m.days_inactive || 99);
                const risk = getRiskLevel(days);
                return (
                  <tr key={m.id}>
                    <td style={styles.td}>{m.name}</td>
                    <td style={{ ...styles.td, color: '#718096' }}>{m.gym_name}</td>
                    <td style={styles.td}>
                      <span style={{ ...styles.planBadge, background: PLAN_COLORS[m.plan_type], color: PLAN_TEXT[m.plan_type] }}>
                        {m.plan_type}
                      </span>
                    </td>
                    <td style={{ ...styles.td, color: '#718096' }}>{formatLastSeen(m.last_checkin_at)}</td>
                    <td style={styles.td}>
                      <span style={{ ...styles.risk, background: risk.bg, color: risk.color }}>{risk.label}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
