# WTF LivePulse — Multi-Gym Intelligence Dashboard

A real-time multi-gym operations dashboard with live WebSocket updates, anomaly detection, and a built-in data simulator. Covers 10 WTF Gym locations across India.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18, Vite, Recharts, dark theme (`#0D0D1A`) |
| Backend | Node.js 20, Express, `ws` (WebSockets) |
| Database | PostgreSQL 15 — BRIN, Partial & Composite indexes, Materialized Views |
| Infrastructure | Docker Compose — single-command startup |

---

## Quick Start

**Prerequisites:** Docker Desktop running.

```bash
git clone <repo-url>
cd wtfgym-task
docker compose up --build
```

| Service | URL |
|---|---|
| Dashboard | http://localhost:5173 |
| API | http://localhost:4000 |
| Health check | http://localhost:4000/health |

The seed script runs automatically on first startup and populates ~270,000 check-ins, 5,000 members, and 3 pre-built anomaly scenarios. It is **idempotent** — safe to re-run.

To reset all data:
```bash
docker compose down -v
docker compose up --build
```

---

## Project Structure

```
wtfgym-task/
├── docker-compose.yml
├── backend/
│   └── src/
│       ├── index.js              # Express app + WebSocket server
│       ├── db/
│       │   ├── index.js          # pg Pool
│       │   ├── schema.sql        # Tables, indexes, materialized views
│       │   └── seed.js           # Idempotent seed (~270k check-ins)
│       ├── routes/
│       │   ├── dashboard.js      # /api/dashboard
│       │   ├── analytics.js      # /api/analytics/*
│       │   ├── anomalies.js      # /api/anomalies
│       │   └── simulator.js      # /api/simulator/control
│       └── services/
│           ├── anomalyEngine.js  # 30s background anomaly detection
│           └── simulator.js      # Live event generator (check-ins/payments)
└── frontend/
    └── src/
        ├── App.jsx               # Layout, routing, WebSocket, gym selector
        ├── index.css             # Responsive CSS (mobile/tablet/desktop)
        ├── hooks/
        │   └── useWebSocket.js   # Auto-reconnecting WS hook
        └── components/
            ├── Dashboard/
            │   ├── SummaryBar.jsx       # All-gym aggregates
            │   ├── OccupancyCard.jsx    # Per-gym occupancy with color thresholds
            │   ├── RevenueTicker.jsx    # Live revenue ticker
            │   └── ActivityFeed.jsx     # Last 20 live events
            ├── Analytics/
            │   ├── PeakHourHeatmap.jsx  # 7-day heatmap (materialized view)
            │   ├── RevenueBreakdown.jsx # 30-day revenue by plan + date filter
            │   ├── ChurnRiskPanel.jsx   # Members inactive 45+ days
            │   ├── NewVsRenewal.jsx     # New vs renewal donut chart
            │   └── CrossGymRevenue.jsx  # All gyms ranked by revenue
            ├── Anomalies/
            │   └── AnomalyAlerts.jsx    # Active anomaly list
            └── Simulator/
                └── SimulatorPanel.jsx   # Speed & pause controls
```

---

## Features

### Live Monitor
- **Summary Bar** — total occupancy, revenue today, active anomalies, active gyms
- **Occupancy Cards** — per-gym with color thresholds: `<60%` green · `60–85%` yellow · `>85%` red
- **Revenue Ticker** — live-flashing total revenue, this month, top gym
- **Activity Feed** — last 20 check-in/checkout/payment events, auto-scrolling

### Analytics
- **Peak Hour Heatmap** — 7-day check-in density by hour and day of week (backed by materialized view)
- **Revenue Breakdown** — 30-day revenue by plan type (bar + pie), with `from`/`to` date filter
- **New vs Renewal** — donut chart showing member acquisition split
- **Cross-Gym Revenue** — all 10 gyms ranked by revenue (7/30/90-day selectable)
- **Churn Risk Panel** — members inactive 45+ days: `HIGH` (45–60d) and `CRITICAL` (60+d)

### Anomaly Detection (every 30s)
| Type | Trigger | Severity |
|---|---|---|
| `CAPACITY_BREACH` | Occupancy > 90% of capacity | HIGH |
| `ZERO_CHECKINS` | 0 active check-ins for 2+ hours during operating hours | MEDIUM |
| `REVENUE_DROP` | Today's revenue < 70% of same day last week | HIGH |

All anomalies are **persisted** to the `alerts` table with deduplication (5-minute window) and auto-resolved after 5 minutes.

### Simulator Control
- **Pause / Resume** live event generation
- **Speed** multiplier: `1×` (2s) · `5×` (400ms) · `10×` (200ms)
- **Reset** to default state

---

## API Reference

### Dashboard
| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/dashboard` | All gyms with live occupancy + revenue |
| `GET` | `/api/dashboard/activity-feed` | Last 50 events |

### Analytics
| Method | Endpoint | Query Params | Description |
|---|---|---|---|
| `GET` | `/api/analytics/heatmap` | `gym_id` | 7-day peak hour heatmap |
| `GET` | `/api/analytics/revenue` | `gym_id`, `from`, `to` | 30-day revenue by plan |
| `GET` | `/api/analytics/churn-risk` | `gym_id` | Members inactive 45+ days |
| `GET` | `/api/analytics/new-vs-renewal` | `gym_id`, `days` | New vs renewal split |
| `GET` | `/api/analytics/cross-gym-revenue` | `days` | All gyms ranked by revenue |
| `POST` | `/api/analytics/refresh` | — | Force-refresh materialized views |

### Anomalies
| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/anomalies` | Active anomalies (unresolved) |

### Simulator
| Method | Endpoint | Body | Description |
|---|---|---|---|
| `GET` | `/api/simulator/status` | — | Current speed/paused state |
| `POST` | `/api/simulator/control` | `{ action, speed }` | `pause` · `resume` · `speed` · `reset` |

---

## Database Schema

```
gyms          — 10 gym locations with capacity and operating hours
members       — 5,000 members with plan type and activity tracking
checkins      — ~270,000 rows; BRIN index on checked_in_at
payments      — 5,000+ rows; composite index on (gym_id, payment_date)
alerts        — persisted anomaly detections with auto-resolve

Materialized Views (refreshed hourly):
  peak_hour_heatmap      — 7-day check-in count by gym/day/hour
  revenue_breakdown_30d  — 30-day revenue by gym/plan/day
```

---

## Seed Data Highlights

- **10 gyms** — Lajpat Nagar, Connaught Place, Bandra West, Powai, Indiranagar, Koramangala, Banjara Hills, Sector 18 Noida, Salt Lake, Velachery
- **~270,000 check-ins** over 90 days with realistic morning (07–10) and evening (17–21) peaks
- **85% active** members, 15% inactive; 230 pre-seeded churn-risk members
- **Pre-built anomaly scenarios:**
  - Bandra West: 280 open check-ins → Capacity Breach alert
  - Velachery: last activity 3h ago, no open check-ins → Zero Check-ins alert
  - Salt Lake: ₹23,998 revenue 7 days ago vs ₹1,499 today → Revenue Drop alert

---

## Responsive Design

| Breakpoint | Layout |
|---|---|
| Desktop `>1024px` | Fixed sidebar, 2-column content, 4-column occupancy grid |
| Tablet `640–1023px` | Sidebar visible, single-column content |
| Mobile `<640px` | Hamburger menu, full-screen sidebar overlay, stacked layout |

---

## WebSocket Events

```json
{ "type": "CONNECTED" }
{ "type": "LIVE_EVENT",       "data": { "events": [...], "occupancy": [...] } }
{ "type": "ANOMALIES_UPDATE", "data": { "anomalies": [...], "checked_at": "..." } }
{ "type": "MATVIEW_REFRESHED","timestamp": "..." }
```

Connect at `ws://localhost:4000/ws`.
