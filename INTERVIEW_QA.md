# WTF LivePulse — Technical Interview Q&A

All answers are based on the actual implementation in this project.

---

## PostgreSQL & Database

### Q1. Why use a BRIN index on `checked_in_at` instead of a B-Tree?

**Answer:**
BRIN (Block Range Index) is ideal for naturally ordered, append-only columns like timestamps. The `checkins` table is insert-only — new events always have the latest timestamps — so rows are physically stored in roughly time order on disk.

- A B-Tree index on 270,000 rows would consume significant memory and needs to be updated on every insert.
- A BRIN index stores only the **min/max value per disk block range**, making it tiny (a few KB vs several MB for B-Tree).
- For range queries like `WHERE checked_in_at >= NOW() - INTERVAL '7 days'`, BRIN skips entire block ranges that fall outside the range — almost as fast as B-Tree for this access pattern.

```sql
CREATE INDEX idx_checkins_checkedin_brin ON checkins USING BRIN (checked_in_at);
```

**Trade-off:** BRIN is useless for point lookups or unsorted data. Never use it on a column like `member_id`.

---

### Q2. What is a partial index? Why does `idx_checkins_open WHERE checked_out_at IS NULL` help?

**Answer:**
A partial index only indexes rows that satisfy a `WHERE` condition. Instead of indexing all 270,000 check-in rows, this index only covers the few hundred rows where `checked_out_at IS NULL` (currently active check-ins).

```sql
CREATE INDEX idx_checkins_open ON checkins (gym_id, checked_in_at)
WHERE checked_out_at IS NULL;
```

**Why it helps:**
- Counting current occupancy (`SELECT COUNT(*) WHERE checked_out_at IS NULL`) hits only this tiny index — microseconds vs scanning 270k rows.
- The index shrinks as members check out (rows no longer match the partial condition).
- Writes are faster because most inserts (check-outs) don't update this index at all.

In the dashboard query, the LATERAL subquery uses this index:
```sql
LEFT JOIN LATERAL (
  SELECT COUNT(*) AS current_occupancy
  FROM checkins c
  WHERE c.gym_id = g.id AND c.checked_out_at IS NULL
) occ ON TRUE
```

---

### Q3. What does `CONCURRENTLY` do in `REFRESH MATERIALIZED VIEW CONCURRENTLY` and why does it need a unique index?

**Answer:**
Without `CONCURRENTLY`, PostgreSQL locks the materialized view during refresh — all reads are blocked until the refresh completes. This would freeze the heatmap and revenue charts for users.

`CONCURRENTLY` builds the new data in a temporary table, then swaps it in using row-level diffs — the view remains readable throughout.

**Why it needs a unique index:**
To compute the diff (which rows to add/delete/update), PostgreSQL needs to uniquely identify each row. Without a unique index it cannot perform row-level comparison.

```sql
CREATE UNIQUE INDEX idx_peak_hour_heatmap
ON peak_hour_heatmap (gym_id, day_of_week, hour_of_day);
```

**Trade-off:** `CONCURRENTLY` is slower than a plain refresh because it does extra work. For a 270k-row source it's still fast enough to run hourly.

---

### Q4. Why use `LATERAL` in the dashboard query instead of a regular JOIN?

**Answer:**
The original query joined all 270,000 checkins rows per gym to count open ones — and filtered with `checked_in_at >= NOW() - INTERVAL '12 hours'`. This caused a bug: seeded open check-ins older than 12 hours showed as 0 occupancy.

`LATERAL` allows the subquery to **reference columns from the outer query** (`g.id`), acting like a correlated subquery but with the full power of a `SELECT`:

```sql
LEFT JOIN LATERAL (
  SELECT COUNT(*) AS current_occupancy
  FROM checkins c
  WHERE c.gym_id = g.id AND c.checked_out_at IS NULL
) occ ON TRUE
```

**Benefits:**
- No time restriction — counts ALL open check-ins regardless of age (correct definition of "currently in the gym").
- Uses the `idx_checkins_open` partial index efficiently — only scans the few hundred open rows.
- Separates occupancy logic from the revenue/member aggregations, making the query cleaner and correct.

---

### Q5. What's the difference between `COUNT(*)` and `COUNT(id)`?

**Answer:**
- `COUNT(*)` counts all rows including those with NULL values in any column.
- `COUNT(id)` counts only rows where `id` is NOT NULL.

For a primary key (`id SERIAL`), both are identical since primary keys are never NULL. But for optional columns like `checked_out_at`, use `COUNT(*)` to count all rows, or `COUNT(checked_out_at)` if you only want rows where checkout exists.

In this project we use:
```sql
COUNT(c.id) FILTER (WHERE c.checked_out_at IS NULL) AS current_occupancy
```
The `FILTER` clause is more expressive than a `CASE WHEN` and is optimized by PostgreSQL.

---

### Q6. Explain the anomaly alert deduplication logic.

**Answer:**
The anomaly engine runs every 30 seconds. Without deduplication, a gym at 95% capacity for 10 minutes would insert 20 identical alerts. The fix uses `INSERT ... SELECT WHERE NOT EXISTS`:

```sql
INSERT INTO alerts (type, severity, gym_id, gym_name, message, value, threshold)
SELECT $1::varchar, $2::varchar, $3::int, $4::varchar, $5::text, $6::numeric, $7::numeric
WHERE NOT EXISTS (
  SELECT 1 FROM alerts
  WHERE type = $1::varchar AND gym_id = $3::int AND resolved = FALSE
    AND detected_at > NOW() - INTERVAL '5 minutes'
)
```

**Logic:** Only insert a new alert if there is no unresolved alert of the same type for the same gym within the last 5 minutes. The insert is atomic — no race conditions.

**Auto-resolve:** Stale alerts are resolved before each detection run:
```sql
UPDATE alerts SET resolved = TRUE, resolved_at = NOW()
WHERE resolved = FALSE AND detected_at < NOW() - INTERVAL '5 minutes'
```

So if a gym drops below 90% capacity, its alert resolves itself in the next 30s cycle.

---

### Q7. Why did occupancy show 0 and how was it fixed?

**Answer:**
**Root cause:** The dashboard query had a time filter on the checkins JOIN:
```sql
LEFT JOIN checkins c ON c.gym_id = g.id AND c.checked_in_at >= NOW() - INTERVAL '12 hours'
```

This filtered out ALL check-ins older than 12 hours — including the 280 open check-ins seeded for Bandra West at 5 AM. If you viewed the dashboard the next day, those check-ins were ~24 hours old and excluded.

**Fix:** Replaced the JOIN + time filter with a `LATERAL` subquery that counts `checked_out_at IS NULL` with no time restriction:
```sql
LEFT JOIN LATERAL (
  SELECT COUNT(*) AS current_occupancy
  FROM checkins c
  WHERE c.gym_id = g.id AND c.checked_out_at IS NULL
) occ ON TRUE
```

An open check-in means the person is **currently** in the gym — there is no valid reason to filter by check-in time.

---

### Q8. Why does explicit type casting (`$1::varchar`) fix the PostgreSQL "inconsistent types" error?

**Answer:**
PostgreSQL infers parameter types from context. In the query:
```sql
INSERT INTO alerts (...) SELECT $1, ...
WHERE NOT EXISTS (SELECT 1 FROM alerts WHERE type = $1 ...)
```

`$1` appears in two contexts:
1. In the `SELECT` list — PostgreSQL infers it from the column definition (`VARCHAR`)
2. In the `WHERE` clause — PostgreSQL infers it independently from the comparison

When both inferences differ (`text` vs `character varying`), PostgreSQL throws "inconsistent types deduced for parameter $1."

**Fix:** Explicit casts tell PostgreSQL exactly what type each parameter is:
```sql
SELECT $1::varchar, $2::varchar, $3::int, $4::varchar, $5::text, $6::numeric, $7::numeric
WHERE NOT EXISTS (... WHERE type = $1::varchar AND gym_id = $3::int ...)
```

---

## WebSockets & Real-Time

### Q9. How does the server broadcast to all connected clients? What happens when a client disconnects mid-broadcast?

**Answer:**
The server maintains a `Set` of active WebSocket connections:
```js
const clients = new Set();
wss.on('connection', (ws) => {
  clients.add(ws);
  ws.on('close', () => clients.delete(ws));
  ws.on('error', () => clients.delete(ws));
});
```

The `broadcast` function iterates the set and checks `readyState`:
```js
function broadcast(payload) {
  const msg = JSON.stringify(payload);
  for (const client of clients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(msg);
    }
  }
}
```

**If a client disconnects mid-broadcast:** The `readyState` check (`=== WebSocket.OPEN`) prevents sending to a closed socket. Even if `send()` throws, it only affects that one client — the loop continues. The `close` event handler removes it from the Set for future broadcasts.

---

### Q10. Why use the `ws` library over Socket.IO for this project?

**Answer:**
| Feature | `ws` | Socket.IO |
|---|---|---|
| Protocol | Raw WebSocket | WebSocket + HTTP polling fallback |
| Bundle size | ~50 KB | ~200 KB |
| Auto-reconnect | Manual (implemented in `useWebSocket.js`) | Built-in |
| Rooms/namespaces | Manual | Built-in |

For this project, raw `ws` is the right choice:
- All clients are modern browsers — no need for HTTP polling fallback.
- We only have one channel (broadcast to all) — no need for rooms.
- The frontend implements its own reconnect logic (`setTimeout(connect, 3000)`).
- Smaller dependency, easier to reason about.

Socket.IO would be justified if you needed namespaces (e.g., per-gym channels) or needed to support legacy browsers.

---

### Q11. How does the frontend auto-reconnect on WebSocket disconnect?

**Answer:**
The `useWebSocket` hook in `hooks/useWebSocket.js`:
```js
ws.onclose = () => {
  reconnectRef.current = setTimeout(connect, 3000); // retry after 3s
};
ws.onerror = () => ws.close(); // triggers onclose → retry
```

Key design decisions:
- Uses `useRef` for the WS instance and reconnect timer — avoids stale closures and doesn't trigger re-renders.
- `onMessageRef.current = onMessage` pattern: keeps the callback reference fresh without re-subscribing the WebSocket on every render.
- Cleanup in `useEffect` return clears the timeout and closes the socket on component unmount — prevents memory leaks.

---

## Node.js / Backend

### Q12. The anomaly engine runs every 30s. What happens if the DB query takes longer than 30s?

**Answer:**
In the current implementation, if a `run()` call takes longer than 30s, `setInterval` fires the next call while the previous one is still running — two concurrent DB operations on the same tables. For read-heavy queries like anomaly detection this is generally safe (no writes conflict), but it wastes connections.

**Production fix:** Replace `setInterval` with a recursive `setTimeout` that only schedules the next run after the current one completes:

```js
async run() {
  try {
    // ... detection logic
  } finally {
    this.interval = setTimeout(() => this.run(), 30000);
  }
}
start() { this.run(); }
```

This guarantees at most one concurrent run regardless of query duration.

---

### Q13. Why does `simulatorRoutes` use a factory function pattern?

**Answer:**
The simulator instance is created in `index.js` and needs to be shared with the route handler. A plain exported router has no way to receive a live object reference.

```js
// routes/simulator.js
module.exports = function simulatorRoutes(simulator) {
  const router = express.Router();
  router.post('/control', (req, res) => {
    // can access the live simulator instance
    simulator.pause();
    res.json(simulator.getStatus());
  });
  return router;
};

// index.js
const simulator = new DataSimulator(broadcast);
app.use('/api/simulator', simulatorRoutes(simulator)); // inject the instance
```

This is **dependency injection** at the module level. The alternative (a global singleton or `require`-ing the instance) would create circular dependencies or make testing harder.

---

### Q14. How does graceful shutdown work?

**Answer:**
```js
process.on('SIGTERM', () => {
  anomalyEngine.stop();  // clearInterval on the 30s detection loop
  simulator.stop();      // clearInterval on the 2s event generator
  clearInterval(matviewInterval); // stop the hourly matview refresh
  server.close();        // stop accepting new HTTP/WS connections
});
```

`SIGTERM` is sent by Docker when `docker compose down` is run. Without this handler:
- Intervals keep running after the process receives SIGTERM
- In-flight DB queries may be cut off mid-transaction
- Node.js would exit with an error code

`server.close()` stops new connections but allows existing WebSocket clients to finish their current message. The DB pool (`pg`) closes automatically when the process exits.

---

## React / Frontend

### Q15. Why use `useRef` for `activitiesRef` instead of putting it directly in state?

**Answer:**
The WebSocket `onmessage` handler is a closure created once. If `activities` was only in state, the handler would capture a stale reference to the initial empty array — every WS event would reset the feed to just the new events, losing history.

```js
const activitiesRef = useRef([]);

// Inside the WS handler (stable reference, never stale):
activitiesRef.current = [...newItems, ...activitiesRef.current].slice(0, 100);
setActivities([...activitiesRef.current]); // triggers re-render with full list
```

`useRef` gives a mutable container whose `.current` is always the latest value — no stale closure problem. We still call `setActivities` to trigger a re-render, but we read from the ref to get the up-to-date accumulated list.

---

### Q16. What is `useCallback` doing on `handleWsMessage`?

**Answer:**
```js
const handleWsMessage = useCallback((msg) => {
  // ... state updates
}, []);
```

`useCallback` with `[]` dependency array memoizes the function — it returns the **same function reference** on every render. This matters because `handleWsMessage` is passed to `useWebSocket`, which passes it to `onMessageRef.current`.

Without `useCallback`, a new function is created on every render. While this doesn't break functionality (because of the ref pattern), it's a best practice signal to React (and React DevTools) that this callback is intentionally stable.

---

### Q17. How does the gym selector filter propagate to all widgets without prop drilling?

**Answer:**
The `selectedGym` state lives in `App.jsx` (the top-level component). All filtering happens at the `App.jsx` level before passing data down:

```js
const filteredGyms = selectedGym === 'all'
  ? displayGyms
  : displayGyms.filter(g => String(g.id) === selectedGym);

const filteredActivities = selectedGym === 'all'
  ? activities
  : activities.filter(a => String(a.gym_id) === selectedGym || ...);
```

Components that fetch their own data (`NewVsRenewal`, `CrossGymRevenue`) receive `gymId` as a prop and use `useEffect([gymId])` to refetch when it changes.

For analytics data already loaded in `App.jsx` (heatmap, revenue), filtering is done inline before passing as props:
```jsx
<PeakHourHeatmap
  data={selectedGym === 'all' ? heatmapData : heatmapData.filter(d => String(d.gym_id) === selectedGym)}
/>
```

A Context API or state management library (Redux/Zustand) would be appropriate if the component tree were deeper.

---

### Q18. Why does `NewVsRenewal` fetch its own data instead of receiving it from `App.jsx`?

**Answer:**
`NewVsRenewal` has its own **time range selector** (7d / 30d / 90d). If `App.jsx` owned the data, every time range change would require a callback chain up to the parent and a re-fetch at the top level — adding complexity with no benefit.

Since the component controls its own filter state, it's cleaner to colocate the data fetching:
```js
const [days, setDays] = useState(30);
useEffect(() => {
  fetch(`/api/analytics/new-vs-renewal?days=${days}&gym_id=${gymId}`)
    .then(...)
}, [gymId, days]); // refetches when either changes
```

This is the **"colocation of state and data"** principle — state that only one component cares about should live in that component.

---

## System Design

### Q19. How would you scale this to 100,000 concurrent WebSocket clients?

**Answer:**
The current implementation keeps all connections in a single Node.js `Set`. One process handles all broadcasts — at ~100k clients, a single broadcast call would block the event loop.

**Scaling approach:**

1. **Horizontal scaling with Redis Pub/Sub:**
   - Multiple Node.js instances each handle a subset of WS connections
   - When the simulator fires an event, it publishes to a Redis channel
   - Each instance subscribes and broadcasts only to its own connected clients

2. **Sticky sessions** at the load balancer (nginx) — a client must reconnect to the same instance for the WS handshake.

3. **Worker threads** for the broadcast loop to avoid blocking the main event loop.

4. **PostgreSQL → change data capture:** Replace the simulator polling with PostgreSQL `LISTEN/NOTIFY` so events are pushed from the DB rather than polled.

---

### Q20. The materialized views refresh hourly. A user complains the heatmap is stale — what are your options?

**Answer:**

| Option | Trade-off |
|---|---|
| **On-demand refresh button** (already implemented) | User-triggered; calls `POST /api/analytics/refresh` |
| **Shorten refresh interval** (e.g., every 5 min) | More DB load; `CONCURRENTLY` avoids blocking reads |
| **Incremental view** using `pg_cron` + partial refresh | Complex; only refreshes changed rows |
| **Replace matview with a real-time query** | Slower query; no caching benefit |
| **Event-driven refresh** via `LISTEN/NOTIFY` | Refresh triggered when new check-ins arrive; best UX |

For this scale (270k rows, 10 gyms), refreshing every 5 minutes is perfectly safe. For millions of rows, an event-driven approach with `LISTEN/NOTIFY` and debouncing (refresh at most once per minute) is the production solution.

---

### Q21. Walk me through how a check-in event flows from simulator to UI.

**Answer:**

```
1. simulator.tick() fires every 2s
      ↓
2. INSERT INTO checkins (member_id, gym_id, checked_in_at) → PostgreSQL
   UPDATE members SET last_checkin_at = NOW()
      ↓
3. SELECT current occupancy for affected gym_ids (uses idx_checkins_open)
      ↓
4. broadcast({ type: 'LIVE_EVENT', data: { events, occupancy } })
      ↓
5. WebSocket server iterates clients Set, sends JSON string to each OPEN client
      ↓
6. Browser receives message → ws.onmessage fires
      ↓
7. useWebSocket hook calls onMessageRef.current(parsedData)
      ↓
8. handleWsMessage in App.jsx:
   - Updates liveOccupancy state (per gym_id)
   - Prepends new events to activitiesRef, slices to 100
   - Calls setActivities() → React re-render
      ↓
9. displayGyms recomputes: gym.current_occupancy merged with liveOccupancy override
      ↓
10. OccupancyCard re-renders with new occupancy % and color threshold
    ActivityFeed re-renders showing the new event at top
```

Total latency from DB insert to UI update: **~50–200ms** depending on Node.js event loop and network.

---

## Docker / DevOps

### Q22. Why does the backend have a volume mount but the frontend doesn't?

**Answer:**
```yaml
backend:
  volumes:
    - ./backend:/app      # ← source files mounted live
    - /app/node_modules   # ← anonymous volume prevents host override

frontend:
  # no volume mount — built at image build time
```

The backend runs `node src/index.js` directly — with the volume mount, any file change on the host is immediately visible inside the container without rebuilding the image (just restart the container).

The frontend is a **Vite production build** — `npm run build` runs at `docker build` time and outputs static HTML/JS/CSS to `/usr/share/nginx/html`. The running container is just Nginx serving static files. There are no source files to mount — code changes require `docker compose build frontend`.

**For development**, you'd add a separate `dev` service with the Vite dev server and a volume mount for hot-module replacement.

---

### Q23. How does the seed script prevent running twice? (Idempotency)

**Answer:**
```js
const { rows: ex } = await client.query('SELECT COUNT(*) FROM gyms');
if (parseInt(ex[0].count) >= 10) {
  console.log('✅ Already seeded — skipping.');
  await client.query('ROLLBACK');
  return;
}
```

On every container start, `node src/db/seed.js` runs before `node src/index.js`. If the gyms table already has 10 rows, the script exits immediately — no data is re-inserted. This is safe because:
- The check is inside a transaction — no partial state
- `ON CONFLICT (name) DO UPDATE` on gyms handles upserts if the check somehow fails
- The entire seed wraps in `BEGIN/COMMIT` — any failure rolls back completely

---

### Q24. How does the backend container know the DB is ready before starting?

**Answer:**
```yaml
backend:
  depends_on:
    postgres:
      condition: service_healthy

postgres:
  healthcheck:
    test: ["CMD-SHELL", "pg_isready -U wtfgym -d wtfgym"]
    interval: 5s
    timeout: 5s
    retries: 10
```

`pg_isready` checks if PostgreSQL is accepting connections. Docker won't start the backend until `pg_isready` returns success — prevents the `ECONNREFUSED` error that happens when Node.js tries to connect before Postgres finishes initializing.

`depends_on: condition: service_healthy` is Docker Compose v3 syntax. Without `condition: service_healthy`, `depends_on` only waits for the container to **start**, not for Postgres to be **ready** — a common source of race condition bugs.
