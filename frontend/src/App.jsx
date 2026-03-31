import React, { useState, useEffect, useCallback, useRef } from 'react';
import OccupancyCard from './components/Dashboard/OccupancyCard';
import RevenueTicker from './components/Dashboard/RevenueTicker';
import ActivityFeed from './components/Dashboard/ActivityFeed';
import PeakHourHeatmap from './components/Analytics/PeakHourHeatmap';
import RevenueBreakdown from './components/Analytics/RevenueBreakdown';
import ChurnRiskPanel from './components/Analytics/ChurnRiskPanel';
import AnomalyAlerts from './components/Anomalies/AnomalyAlerts';
import { useWebSocket } from './hooks/useWebSocket';

const API = import.meta.env.VITE_API_URL || 'http://localhost:4000';

// ─── Sidebar nav items matching spec exactly ──────────────────────────────────
const NAV_ITEMS = [
  { id: 'live-monitor', label: 'Live Monitor',  icon: '⚡' },
  { id: 'analytics',    label: 'Analytics',     icon: '📊' },
  { id: 'anomaly-logs', label: 'Anomaly Logs',  icon: '🚨' },
];

// ─── Styles ───────────────────────────────────────────────────────────────────
const S = {
  app: { display: 'flex', minHeight: '100vh', background: '#0D0D1A', color: '#e2e8f0' },

  // Sidebar
  sidebar: {
    width: '220px',
    flexShrink: 0,
    background: '#1A1A2E',
    borderRight: '1px solid #2d2d44',
    display: 'flex',
    flexDirection: 'column',
    position: 'fixed',
    top: 0,
    left: 0,
    height: '100vh',
    zIndex: 100,
  },
  sidebarLogo: {
    padding: '20px 20px 16px',
    borderBottom: '1px solid #2d2d44',
  },
  logoText: { fontSize: '16px', fontWeight: '800', color: '#9f7aea', letterSpacing: '1px' },
  logoSub: { fontSize: '11px', color: '#4a5568', marginTop: '3px' },
  navList: { flex: 1, padding: '12px 10px', display: 'flex', flexDirection: 'column', gap: '4px' },
  navItem: {
    display: 'flex', alignItems: 'center', gap: '10px',
    padding: '10px 12px', borderRadius: '8px', cursor: 'pointer',
    border: 'none', background: 'transparent', width: '100%',
    textAlign: 'left', fontSize: '14px', fontWeight: '500',
    transition: 'all 0.15s',
  },
  navIcon: { fontSize: '16px', flexShrink: 0, width: '20px', textAlign: 'center' },
  navBadge: {
    marginLeft: 'auto', background: '#fc818133', color: '#fc8181',
    borderRadius: '12px', padding: '1px 7px', fontSize: '11px', fontWeight: '700',
  },
  sidebarFooter: {
    padding: '14px 16px', borderTop: '1px solid #2d2d44',
    display: 'flex', alignItems: 'center', gap: '8px',
  },
  wsDot: { width: '8px', height: '8px', borderRadius: '50%', flexShrink: 0 },
  wsLabel: { fontSize: '12px' },

  // Main content
  main: { marginLeft: '220px', flex: 1, display: 'flex', flexDirection: 'column', minHeight: '100vh' },
  topbar: {
    background: '#1A1A2E', borderBottom: '1px solid #2d2d44',
    padding: '14px 24px', display: 'flex', alignItems: 'center',
    justifyContent: 'space-between', position: 'sticky', top: 0, zIndex: 50,
  },
  pageTitle: { fontSize: '17px', fontWeight: '700', color: '#e2e8f0' },
  pageDesc: { fontSize: '12px', color: '#718096', marginTop: '1px' },
  refreshBtn: {
    background: '#2d2d44', border: '1px solid #4a5568', color: '#a0aec0',
    borderRadius: '6px', padding: '6px 12px', fontSize: '12px', cursor: 'pointer',
    display: 'flex', alignItems: 'center', gap: '6px',
  },
  content: { padding: '24px', flex: 1 },
  section: { marginBottom: '26px' },
  sectionLabel: { fontSize: '12px', fontWeight: '600', color: '#718096', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '12px' },
  grid4: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '14px' },
  twoCol: { display: 'grid', gridTemplateColumns: '1fr 340px', gap: '20px' },

  // Loading screen
  loading: { display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', background: '#0D0D1A' },
  loadingBox: { textAlign: 'center' },
};

// ─── Page meta ────────────────────────────────────────────────────────────────
const PAGE_META = {
  'live-monitor': { title: 'Live Monitor', desc: 'Real-time occupancy, revenue, and activity across all 10 gyms' },
  'analytics':    { title: 'Analytics',    desc: '7-day peak hour heatmap, 30-day revenue breakdown, churn risk' },
  'anomaly-logs': { title: 'Anomaly Logs', desc: 'Active and historical anomaly detections — refreshed every 30s' },
};

export default function App() {
  const [activePage, setActivePage] = useState('live-monitor');
  const [wsConnected, setWsConnected] = useState(false);

  const [gyms, setGyms]             = useState([]);
  const [activities, setActivities] = useState([]);
  const [liveOccupancy, setLiveOccupancy] = useState({});
  const [heatmapData, setHeatmapData]     = useState([]);
  const [revenueData, setRevenueData]     = useState([]);
  const [churnData, setChurnData]         = useState([]);
  const [anomalies, setAnomalies]         = useState([]);
  const [anomalyTime, setAnomalyTime]     = useState(null);
  const [loading, setLoading]             = useState(true);
  const [refreshing, setRefreshing]       = useState(false);

  const activitiesRef = useRef([]);

  // Initial data load
  useEffect(() => {
    async function fetchAll() {
      try {
        const [gymRes, feedRes, heatRes, revRes, churnRes, anomRes] = await Promise.all([
          fetch(`${API}/api/dashboard`),
          fetch(`${API}/api/dashboard/activity-feed`),
          fetch(`${API}/api/analytics/heatmap`),
          fetch(`${API}/api/analytics/revenue`),
          fetch(`${API}/api/analytics/churn-risk`),
          fetch(`${API}/api/anomalies`),
        ]);
        const [gymData, feedData, heatData, revData, churnD, anomData] = await Promise.all([
          gymRes.json(), feedRes.json(), heatRes.json(), revRes.json(), churnRes.json(), anomRes.json(),
        ]);
        setGyms(Array.isArray(gymData) ? gymData : []);
        activitiesRef.current = Array.isArray(feedData) ? feedData : [];
        setActivities(activitiesRef.current);
        setHeatmapData(Array.isArray(heatData) ? heatData : []);
        setRevenueData(Array.isArray(revData) ? revData : []);
        setChurnData(Array.isArray(churnD) ? churnD : []);
        setAnomalies(anomData?.anomalies || []);
        setAnomalyTime(anomData?.checked_at);
        setLoading(false);
      } catch (err) {
        console.error('Fetch error:', err);
        setLoading(false);
      }
    }
    fetchAll();
  }, []);

  // WebSocket
  const handleWsMessage = useCallback((msg) => {
    if (msg.type === 'CONNECTED') { setWsConnected(true); return; }

    if (msg.type === 'LIVE_EVENT') {
      const { events, occupancy } = msg.data;
      if (occupancy) {
        const occ = {};
        for (const o of occupancy) occ[o.id] = o;
        setLiveOccupancy(prev => ({ ...prev, ...occ }));
      }
      if (events?.length) {
        const items = events.map(e => ({
          id: e.checkin_id || e.payment_id || Math.random(),
          member_name: `Member #${e.member_id}`,
          gym_name: e.gym_name,
          plan_type: e.plan_type,
          event_type: e.type,
          type: e.type,
          amount: e.amount,
          checked_in_at: e.timestamp,
          timestamp: e.timestamp,
        }));
        activitiesRef.current = [...items, ...activitiesRef.current].slice(0, 100);
        setActivities([...activitiesRef.current]);
      }
    }

    if (msg.type === 'ANOMALIES_UPDATE') {
      setAnomalies(msg.data.anomalies || []);
      setAnomalyTime(msg.data.checked_at);
    }
  }, []);

  useWebSocket(handleWsMessage);

  // On-demand refresh
  async function handleRefresh() {
    setRefreshing(true);
    try {
      await fetch(`${API}/api/analytics/refresh`, { method: 'POST' });
      const [heatRes, revRes] = await Promise.all([
        fetch(`${API}/api/analytics/heatmap`),
        fetch(`${API}/api/analytics/revenue`),
      ]);
      setHeatmapData(await heatRes.json());
      setRevenueData(await revRes.json());
    } catch (err) {
      console.error('Refresh error:', err);
    }
    setRefreshing(false);
  }

  const displayGyms = gyms.map(g => ({
    ...g,
    current_occupancy: liveOccupancy[g.id]?.current_occupancy ?? g.current_occupancy,
  }));

  const meta = PAGE_META[activePage];

  if (loading) {
    return (
      <div style={S.loading}>
        <div style={S.loadingBox}>
          <div style={{ fontSize: '40px', marginBottom: '16px' }}>⚡</div>
          <div style={{ fontSize: '18px', color: '#9f7aea', fontWeight: '600' }}>WTF LivePulse</div>
          <div style={{ fontSize: '13px', color: '#718096', marginTop: '8px' }}>Loading dashboard...</div>
        </div>
      </div>
    );
  }

  return (
    <div style={S.app}>
      <style>{`
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.3} }
        @keyframes spin { to { transform: rotate(360deg); } }
        * { box-sizing: border-box; }
      `}</style>

      {/* ── LEFT SIDEBAR ── */}
      <aside style={S.sidebar}>
        <div style={S.sidebarLogo}>
          <div style={S.logoText}>WTF LivePulse</div>
          <div style={S.logoSub}>Multi-Gym Intelligence</div>
        </div>

        <nav style={S.navList}>
          {NAV_ITEMS.map(item => {
            const active = activePage === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setActivePage(item.id)}
                style={{
                  ...S.navItem,
                  background: active ? '#9f7aea22' : 'transparent',
                  color: active ? '#9f7aea' : '#a0aec0',
                  borderLeft: active ? '3px solid #9f7aea' : '3px solid transparent',
                }}
              >
                <span style={S.navIcon}>{item.icon}</span>
                <span>{item.label}</span>
                {item.id === 'anomaly-logs' && anomalies.length > 0 && (
                  <span style={S.navBadge}>{anomalies.length}</span>
                )}
              </button>
            );
          })}
        </nav>

        <div style={S.sidebarFooter}>
          <div style={{ ...S.wsDot, background: wsConnected ? '#68d391' : '#fc8181', animation: wsConnected ? 'pulse 1.5s infinite' : 'none' }} />
          <span style={{ ...S.wsLabel, color: wsConnected ? '#68d391' : '#fc8181' }}>
            {wsConnected ? 'Live Connected' : 'Reconnecting...'}
          </span>
        </div>
      </aside>

      {/* ── MAIN AREA ── */}
      <div style={S.main}>
        {/* Topbar */}
        <div style={S.topbar}>
          <div>
            <div style={S.pageTitle}>{meta.title}</div>
            <div style={S.pageDesc}>{meta.desc}</div>
          </div>
          {activePage === 'analytics' && (
            <button style={S.refreshBtn} onClick={handleRefresh} disabled={refreshing}>
              <span style={{ display: 'inline-block', animation: refreshing ? 'spin 1s linear infinite' : 'none' }}>↻</span>
              {refreshing ? 'Refreshing...' : 'Refresh Views'}
            </button>
          )}
          {activePage === 'anomaly-logs' && anomalyTime && (
            <div style={{ fontSize: '12px', color: '#718096' }}>
              Last scan: {new Date(anomalyTime).toLocaleTimeString('en-IN')} · auto every 30s
            </div>
          )}
        </div>

        {/* Page content */}
        <main style={S.content}>

          {/* ── LIVE MONITOR ── */}
          {activePage === 'live-monitor' && (
            <>
              <div style={S.section}>
                <div style={S.sectionLabel}>Revenue Overview</div>
                <RevenueTicker gyms={displayGyms} />
              </div>

              <div style={S.twoCol}>
                <div>
                  <div style={S.sectionLabel}>Live Occupancy — {displayGyms.length} Gyms</div>
                  <div style={S.grid4}>
                    {displayGyms.map(gym => (
                      <OccupancyCard key={gym.id} gym={gym} liveData={liveOccupancy[gym.id]} />
                    ))}
                  </div>
                </div>
                <div>
                  <div style={S.sectionLabel}>Activity Feed</div>
                  <ActivityFeed activities={activities} />
                </div>
              </div>
            </>
          )}

          {/* ── ANALYTICS ── */}
          {activePage === 'analytics' && (
            <>
              <div style={S.section}>
                <div style={S.sectionLabel}>Peak Hour Heatmap (7 Days)</div>
                <PeakHourHeatmap data={heatmapData} gyms={gyms} />
              </div>
              <div style={S.section}>
                <div style={S.sectionLabel}>Revenue Breakdown (30 Days)</div>
                <RevenueBreakdown data={revenueData} gyms={gyms} />
              </div>
              <div style={S.section}>
                <div style={S.sectionLabel}>Churn Risk Panel (&gt;14 days inactive)</div>
                <ChurnRiskPanel members={churnData} />
              </div>
            </>
          )}

          {/* ── ANOMALY LOGS ── */}
          {activePage === 'anomaly-logs' && (
            <>
              {anomalies.length > 0 && (
                <div style={{ ...S.section, background: '#fc818108', borderRadius: '10px', padding: '14px 16px', border: '1px solid #fc818122', marginBottom: '20px' }}>
                  <div style={{ fontSize: '13px', fontWeight: '600', color: '#fc8181', marginBottom: '4px' }}>
                    {anomalies.length} Active Anomaly{anomalies.length !== 1 ? 'ies' : ''} Detected
                  </div>
                  <div style={{ fontSize: '12px', color: '#718096' }}>
                    Alerts are persisted to the database and auto-refreshed every 30 seconds.
                  </div>
                </div>
              )}
              <AnomalyAlerts anomalies={anomalies} lastChecked={anomalyTime} />
            </>
          )}

        </main>
      </div>
    </div>
  );
}
