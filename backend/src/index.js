const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const cors = require('cors');
const db = require('./db');

const dashboardRoutes = require('./routes/dashboard');
const analyticsRoutes = require('./routes/analytics');
const anomalyRoutes = require('./routes/anomalies');
const AnomalyEngine = require('./services/anomalyEngine');
const DataSimulator = require('./services/simulator');

const app = express();
const server = http.createServer(app);

// WebSocket server
const wss = new WebSocket.Server({ server, path: '/ws' });

const clients = new Set();

wss.on('connection', (ws, req) => {
  clients.add(ws);
  console.log(`WS client connected. Total: ${clients.size}`);

  ws.on('close', () => {
    clients.delete(ws);
    console.log(`WS client disconnected. Total: ${clients.size}`);
  });

  ws.on('error', () => clients.delete(ws));

  // Send welcome ping
  ws.send(JSON.stringify({ type: 'CONNECTED', message: 'WTF LivePulse connected' }));
});

function broadcast(payload) {
  const msg = JSON.stringify(payload);
  for (const client of clients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(msg);
    }
  }
}

// Middleware
app.use(cors({ origin: '*' }));
app.use(express.json());

// Routes
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/anomalies', anomalyRoutes);

app.get('/health', (req, res) => res.json({ status: 'ok', timestamp: new Date().toISOString() }));

// Hourly materialized view refresh
async function refreshMatViews() {
  try {
    await db.query('REFRESH MATERIALIZED VIEW CONCURRENTLY peak_hour_heatmap');
    await db.query('REFRESH MATERIALIZED VIEW CONCURRENTLY revenue_breakdown_30d');
    console.log('🔄 Materialized views refreshed');
    broadcast({ type: 'MATVIEW_REFRESHED', timestamp: new Date().toISOString() });
  } catch (err) {
    console.error('Matview refresh error:', err.message);
  }
}
const matviewInterval = setInterval(refreshMatViews, 60 * 60 * 1000); // every 1 hour

// On-demand refresh endpoint
app.post('/api/analytics/refresh', async (req, res) => {
  await refreshMatViews();
  res.json({ refreshed: true, timestamp: new Date().toISOString() });
});

// Start services
const anomalyEngine = new AnomalyEngine(broadcast);
const simulator = new DataSimulator(broadcast);

anomalyEngine.start();
simulator.start();

const PORT = process.env.PORT || 4000;
server.listen(PORT, () => {
  console.log(`🚀 WTF LivePulse backend running on port ${PORT}`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  anomalyEngine.stop();
  simulator.stop();
  clearInterval(matviewInterval);
  server.close();
});
