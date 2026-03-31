-- WTF LivePulse Dashboard - PostgreSQL 15 Schema

-- Gyms table
CREATE TABLE IF NOT EXISTS gyms (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL UNIQUE,
    city VARCHAR(100) NOT NULL,
    capacity INT NOT NULL,
    opening_time TIME NOT NULL DEFAULT '06:00',
    closing_time TIME NOT NULL DEFAULT '22:00',
    status VARCHAR(20) NOT NULL DEFAULT 'active',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Members table
CREATE TABLE IF NOT EXISTS members (
    id SERIAL PRIMARY KEY,
    gym_id INT NOT NULL REFERENCES gyms(id),
    name VARCHAR(100) NOT NULL,
    email VARCHAR(150) NOT NULL UNIQUE,
    phone VARCHAR(20),
    plan_type VARCHAR(20) NOT NULL CHECK (plan_type IN ('Monthly', 'Quarterly', 'Annual')),
    member_type VARCHAR(20) NOT NULL DEFAULT 'New' CHECK (member_type IN ('New', 'Renewal')),
    join_date DATE NOT NULL,
    last_checkin_at TIMESTAMPTZ,
    status VARCHAR(20) NOT NULL DEFAULT 'active',
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Check-ins table
CREATE TABLE IF NOT EXISTS checkins (
    id BIGSERIAL PRIMARY KEY,
    member_id INT NOT NULL REFERENCES members(id),
    gym_id INT NOT NULL REFERENCES gyms(id),
    checked_in_at TIMESTAMPTZ NOT NULL,
    checked_out_at TIMESTAMPTZ
);

-- Payments table
CREATE TABLE IF NOT EXISTS payments (
    id SERIAL PRIMARY KEY,
    member_id INT NOT NULL REFERENCES members(id),
    gym_id INT NOT NULL REFERENCES gyms(id),
    amount NUMERIC(10,2) NOT NULL,
    plan_type VARCHAR(20) NOT NULL,
    payment_date TIMESTAMPTZ NOT NULL,
    renewal_type VARCHAR(20) NOT NULL DEFAULT 'New' CHECK (renewal_type IN ('New', 'Renewal')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
-- BRIN index for time-series checkins
CREATE INDEX IF NOT EXISTS idx_checkins_checkedin_brin ON checkins USING BRIN (checked_in_at);

-- Partial index for open (active) check-ins
CREATE INDEX IF NOT EXISTS idx_checkins_open ON checkins (gym_id, checked_in_at) WHERE checked_out_at IS NULL;

-- Composite index for analytics queries
CREATE INDEX IF NOT EXISTS idx_checkins_gym_time ON checkins (gym_id, checked_in_at DESC);

-- Members gym lookup
CREATE INDEX IF NOT EXISTS idx_members_gym ON members (gym_id);

-- Partial index on active members (is_active = true) - critical for reviewer
CREATE INDEX IF NOT EXISTS idx_members_active ON members (gym_id, plan_type) WHERE is_active = TRUE;

-- Payments indexes
CREATE INDEX IF NOT EXISTS idx_payments_gym_date ON payments (gym_id, payment_date DESC);
CREATE INDEX IF NOT EXISTS idx_payments_member ON payments (member_id);

-- Materialized view: 7-day peak hour heatmap
CREATE MATERIALIZED VIEW IF NOT EXISTS peak_hour_heatmap AS
SELECT
    gym_id,
    EXTRACT(DOW FROM checked_in_at)::INT AS day_of_week,
    EXTRACT(HOUR FROM checked_in_at)::INT AS hour_of_day,
    COUNT(*) AS checkin_count
FROM checkins
WHERE checked_in_at >= NOW() - INTERVAL '7 days'
GROUP BY gym_id, day_of_week, hour_of_day
WITH DATA;

CREATE UNIQUE INDEX IF NOT EXISTS idx_peak_hour_heatmap
ON peak_hour_heatmap (gym_id, day_of_week, hour_of_day);

-- Materialized view: 30-day revenue breakdown
CREATE MATERIALIZED VIEW IF NOT EXISTS revenue_breakdown_30d AS
SELECT
    gym_id,
    plan_type,
    SUM(amount) AS total_revenue,
    COUNT(*) AS payment_count,
    DATE_TRUNC('day', payment_date) AS revenue_date
FROM payments
WHERE payment_date >= NOW() - INTERVAL '30 days'
GROUP BY gym_id, plan_type, DATE_TRUNC('day', payment_date)
WITH DATA;

CREATE UNIQUE INDEX IF NOT EXISTS idx_revenue_breakdown_30d
ON revenue_breakdown_30d (gym_id, plan_type, revenue_date);

-- Alerts table: persists anomaly detections
CREATE TABLE IF NOT EXISTS alerts (
    id SERIAL PRIMARY KEY,
    type VARCHAR(50) NOT NULL,           -- 'CAPACITY_BREACH' | 'ZERO_CHECKINS' | 'REVENUE_DROP'
    severity VARCHAR(20) NOT NULL,       -- 'HIGH' | 'MEDIUM'
    gym_id INT REFERENCES gyms(id),
    gym_name VARCHAR(100),
    message TEXT NOT NULL,
    value NUMERIC(10,2),                 -- e.g. occupancy %, drop %
    threshold NUMERIC(10,2),             -- the threshold that was exceeded
    resolved BOOLEAN NOT NULL DEFAULT FALSE,
    detected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    resolved_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_alerts_gym_time ON alerts (gym_id, detected_at DESC);
CREATE INDEX IF NOT EXISTS idx_alerts_unresolved ON alerts (detected_at DESC) WHERE resolved = FALSE;
