/**
 * WTF LivePulse — Idempotent Seed Script
 * Targets: 10 gyms, 5,000 members, ~270k check-ins, 6,000+ payments
 * Anomalies: Bandra Capacity Breach, Velachery Zero Check-ins, Salt Lake Revenue Drop
 */

const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgres://wtfgym:wtfgym_secret@localhost:5432/wtfgym',
});

// ─── GYM MASTER DATA ─────────────────────────────────────────────────────────
const GYMS = [
  { name: 'WTF Gyms — Lajpat Nagar',    city: 'New Delhi',  capacity: 220, openHour: 5,  closeHour: 22 },
  { name: 'WTF Gyms — Connaught Place',  city: 'New Delhi',  capacity: 180, openHour: 6,  closeHour: 22 },
  { name: 'WTF Gyms — Bandra West',      city: 'Mumbai',     capacity: 300, openHour: 5,  closeHour: 23 },
  { name: 'WTF Gyms — Powai',            city: 'Mumbai',     capacity: 250, openHour: 5,  closeHour: 22 },
  { name: 'WTF Gyms — Indiranagar',      city: 'Bengaluru',  capacity: 200, openHour: 5,  closeHour: 22 },
  { name: 'WTF Gyms — Koramangala',      city: 'Bengaluru',  capacity: 180, openHour: 6,  closeHour: 22 },
  { name: 'WTF Gyms — Banjara Hills',    city: 'Hyderabad',  capacity: 160, openHour: 6,  closeHour: 22 },
  { name: 'WTF Gyms — Sector 18 Noida', city: 'Noida',      capacity: 140, openHour: 6,  closeHour: 21 },
  { name: 'WTF Gyms — Salt Lake',        city: 'Kolkata',    capacity: 120, openHour: 6,  closeHour: 21 },
  { name: 'WTF Gyms — Velachery',        city: 'Chennai',    capacity: 110, openHour: 6,  closeHour: 21 },
];

// Member distribution (sums to 1.0 = 5,000)
const GYM_DISTRIBUTION = {
  'WTF Gyms — Bandra West':        0.15,  // 750
  'WTF Gyms — Lajpat Nagar':       0.13,  // 650
  'WTF Gyms — Powai':               0.12,  // 600
  'WTF Gyms — Connaught Place':     0.10,  // 500
  'WTF Gyms — Indiranagar':         0.10,  // 500
  'WTF Gyms — Koramangala':         0.10,  // 500
  'WTF Gyms — Sector 18 Noida':     0.10,  // 500
  'WTF Gyms — Banjara Hills':       0.08,  // 400
  'WTF Gyms — Salt Lake':           0.07,  // 350
  'WTF Gyms — Velachery':           0.05,  // 250
};

const TOTAL_MEMBERS = 5000;
const DAYS_HISTORY  = 90;

// Base check-in rate per member per open hour.
// Calibrated at 0.13 → ~270k total check-ins over 90 days.
const BASE_RATE = 0.13;

// ─── HOUR MULTIPLIERS ─────────────────────────────────────────────────────────
const HOUR_MULT = {
  0:0, 1:0, 2:0, 3:0, 4:0,
  5:0.15, 6:0.50,
  7:1.00, 8:1.00, 9:1.00,                // Morning peak 07:00-09:59
  10:0.70, 11:0.60, 12:0.50, 13:0.50, 14:0.40, 15:0.40, 16:0.60,
  17:0.90, 18:0.90, 19:0.90, 20:0.90,    // Evening peak 17:00-20:59
  21:0.40, 22:0.15, 23:0,
};

// Day-of-week multipliers (0=Sun, 1=Mon … 6=Sat)
const DAY_MULT = { 0:0.45, 1:1.00, 2:0.90, 3:0.85, 4:0.85, 5:0.80, 6:0.65 };

const PLAN_PRICES = { Monthly: 1499, Quarterly: 3999, Annual: 11999 };

// ─── NAME POOL ───────────────────────────────────────────────────────────────
const FIRST = [
  'Aarav','Vivaan','Aditya','Vihaan','Arjun','Sai','Reyansh','Ayaan','Krishna','Ishaan',
  'Shaurya','Atharv','Advik','Pranav','Dhruv','Kabir','Ritvik','Aaryan','Darsh','Veer',
  'Priya','Ananya','Pooja','Deepika','Sneha','Kavya','Meera','Nisha','Riya','Divya',
  'Neha','Shweta','Sunita','Preeti','Rekha','Geeta','Sita','Usha','Lata','Asha',
  'Rahul','Rohit','Amit','Vikram','Suresh','Rajesh','Mahesh','Ramesh','Dinesh','Ganesh',
  'Kiran','Tarun','Varun','Arun','Nikhil','Rohan','Mohit','Gaurav','Sachin','Sanjay',
  'Anjali','Pallavi','Swati','Madhuri','Revathi','Lakshmi','Radha','Geetha','Sudha','Uma',
  'Harish','Girish','Manish','Rajiv','Sunil','Anil','Kapil','Lalit','Navin','Pravin',
];
const LAST = [
  'Sharma','Verma','Gupta','Singh','Kumar','Patel','Joshi','Mehta','Shah','Nair',
  'Reddy','Rao','Pillai','Iyer','Menon','Krishnan','Venkat','Subramaniam','Naidu','Rajan',
  'Chatterjee','Banerjee','Mukherjee','Das','Bose','Sen','Roy','Ghosh','Dey','Chakraborty',
  'Mishra','Tiwari','Pandey','Dubey','Shukla','Srivastava','Tripathi','Yadav','Chauhan','Rajput',
  'Agarwal','Mittal','Jain','Oswal','Khandelwal','Goyal','Bansal','Garg','Singhal','Bhatt',
  'Malhotra','Kapoor','Khanna','Arora','Bhatia','Chopra','Sahni','Walia','Sethi','Anand',
];

function ri(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }
function randName() { return `${FIRST[ri(0,FIRST.length-1)]} ${LAST[ri(0,LAST.length-1)]}`; }
function randPhone() {
  const prefixes = ['98','97','96','95','94','93','90','89','88','87','86','85'];
  return `+91${prefixes[ri(0,prefixes.length-1)]}${String(ri(0,99999999)).padStart(8,'0')}`;
}

// ─── MAIN SEED ────────────────────────────────────────────────────────────────
async function seed() {
  const client = await pool.connect();
  const t0 = Date.now();
  console.log('🌱 Starting WTF LivePulse seed...');

  try {
    await client.query('BEGIN');

    // ── 0. Idempotency check ──────────────────────────────────────────────────
    const { rows: ex } = await client.query('SELECT COUNT(*) FROM gyms');
    if (parseInt(ex[0].count) >= 10) {
      console.log('✅ Already seeded — skipping.');
      await client.query('ROLLBACK');
      return;
    }

    // ── 1. Gyms ───────────────────────────────────────────────────────────────
    console.log('📍 Inserting gyms...');
    const gymMap = {}; // name → { id, openHour, closeHour, capacity }
    for (const g of GYMS) {
      const open  = `${String(g.openHour).padStart(2,'0')}:00`;
      const close = `${String(g.closeHour).padStart(2,'0')}:00`;
      const { rows } = await client.query(
        `INSERT INTO gyms (name, city, capacity, opening_time, closing_time, status)
         VALUES ($1,$2,$3,$4,$5,'active')
         ON CONFLICT (name) DO UPDATE SET capacity=EXCLUDED.capacity
         RETURNING id`,
        [g.name, g.city, g.capacity, open, close]
      );
      gymMap[g.name] = { id: rows[0].id, openHour: g.openHour, closeHour: g.closeHour, capacity: g.capacity };
    }
    console.log(`   ✓ ${GYMS.length} gyms`);

    // ── 2. Members ────────────────────────────────────────────────────────────
    console.log('👥 Generating 5,000 members...');
    const membersByGym = {}; // gymId → [memberId, ...]
    const mPlan = {};        // memberId → plan_type
    const mType = {};        // memberId → member_type
    const mJoin = {};        // memberId → join Date
    const emailSet = new Set();
    const memberRows = [];
    const now = new Date();

    for (const [gymName, pct] of Object.entries(GYM_DISTRIBUTION)) {
      const count = Math.round(TOTAL_MEMBERS * pct);
      const gymId = gymMap[gymName].id;
      membersByGym[gymId] = [];

      // Plan pool: 50% Monthly, 30% Quarterly, 20% Annual
      const planPool = [];
      const moCnt = Math.round(count * 0.50);
      const quCnt = Math.round(count * 0.30);
      const anCnt = count - moCnt - quCnt;
      for (let i=0;i<moCnt;i++) planPool.push('Monthly');
      for (let i=0;i<quCnt;i++) planPool.push('Quarterly');
      for (let i=0;i<anCnt;i++) planPool.push('Annual');
      for (let i=planPool.length-1;i>0;i--) {
        const j=ri(0,i); [planPool[i],planPool[j]]=[planPool[j],planPool[i]];
      }

      for (let i=0; i<count; i++) {
        const mtype   = i < Math.round(count * 0.80) ? 'New' : 'Renewal';
        const plan    = planPool[i % planPool.length];
        const daysBack = ri(1, DAYS_HISTORY);
        const joinDate = new Date(now);
        joinDate.setDate(joinDate.getDate() - daysBack);

        let email, attempts = 0;
        do {
          const slug = randName().toLowerCase().replace(/\s+/g,'.') + ri(10,9999);
          email = `${slug}@wtfgym.in`;
          attempts++;
        } while (emailSet.has(email) && attempts < 20);
        emailSet.add(email);

        memberRows.push([gymId, randName(), email, randPhone(), plan, mtype, joinDate.toISOString().split('T')[0]]);
      }
    }

    // Batch insert members (200 per query)
    const allMemberIds = [];
    for (let i=0; i<memberRows.length; i+=200) {
      const batch = memberRows.slice(i, i+200);
      const ph = batch.map((_,idx) => {
        const b = idx*7;
        return `($${b+1},$${b+2},$${b+3},$${b+4},$${b+5},$${b+6},$${b+7})`;
      }).join(',');
      const { rows } = await client.query(
        `INSERT INTO members (gym_id,name,email,phone,plan_type,member_type,join_date)
         VALUES ${ph} RETURNING id,gym_id,plan_type,member_type,join_date`,
        batch.flat()
      );
      rows.forEach(r => {
        allMemberIds.push(r.id);
        if (!membersByGym[r.gym_id]) membersByGym[r.gym_id] = [];
        membersByGym[r.gym_id].push(r.id);
        mPlan[r.id] = r.plan_type;
        mType[r.id] = r.member_type;
        mJoin[r.id] = new Date(r.join_date);
      });
    }
    console.log(`   ✓ ${allMemberIds.length} members`);

    // ── 2a. 15% inactive members ──────────────────────────────────────────────
    const inactiveCount = Math.round(TOTAL_MEMBERS * 0.15); // 750
    const shuffled = [...allMemberIds].sort(() => Math.random() - 0.5);
    const inactiveIds = shuffled.slice(0, inactiveCount);
    await client.query(`UPDATE members SET is_active=FALSE WHERE id = ANY($1)`, [inactiveIds]);
    const inactiveSet = new Set(inactiveIds);
    console.log(`   ✓ ${inactiveCount} marked inactive (15%)`);

    // ── 3. Check-ins (~270k) ──────────────────────────────────────────────────
    console.log('🏋️  Generating ~270,000 check-ins over 90 days...');
    const checkinBatch = [];
    const memberLastCheckin = {};

    // All historical check-ins have checked_out (45–90 min stay)
    function addHistory(memberId, gymId, date, hour) {
      if (mJoin[memberId] && new Date(date) < mJoin[memberId]) return;
      const ci = new Date(date);
      ci.setHours(hour, ri(0,59), ri(0,59), 0);
      const co = new Date(ci.getTime() + ri(45,90) * 60000);
      checkinBatch.push([memberId, gymId, ci.toISOString(), co.toISOString()]);
      if (!memberLastCheckin[memberId] || ci > memberLastCheckin[memberId]) {
        memberLastCheckin[memberId] = ci;
      }
    }

    // Normal gyms (all except Bandra & Velachery)
    const normalGymNames = Object.keys(gymMap).filter(
      n => n !== 'WTF Gyms — Bandra West' && n !== 'WTF Gyms — Velachery'
    );

    for (const gymName of normalGymNames) {
      const { id: gymId, openHour, closeHour } = gymMap[gymName];
      const members = membersByGym[gymId] || [];

      for (let dayOff = DAYS_HISTORY; dayOff >= 1; dayOff--) {
        const date = new Date(now);
        date.setDate(date.getDate() - dayOff);
        const dayM = DAY_MULT[date.getDay()];

        for (let h = openHour; h < closeHour; h++) {
          const hourM = HOUR_MULT[h] || 0;
          if (!hourM) continue;
          const base = Math.round(members.length * BASE_RATE * hourM * dayM);
          if (!base) continue;
          const actual = ri(Math.max(0, base-2), base+2);
          for (let k=0; k<actual; k++) {
            addHistory(members[ri(0, members.length-1)], gymId, date, h);
          }
        }
      }
    }

    // ── ANOMALY 1: Bandra West — 280 open check-ins (93.3% capacity) ──────────
    console.log('   ⚠️  Seeding Bandra West capacity breach...');
    const bandraId = gymMap['WTF Gyms — Bandra West'].id;
    const { openHour: bOpen, closeHour: bClose } = gymMap['WTF Gyms — Bandra West'];
    const bandraMembers = membersByGym[bandraId] || [];

    // 89 days normal history
    for (let dayOff = DAYS_HISTORY; dayOff >= 2; dayOff--) {
      const date = new Date(now); date.setDate(date.getDate() - dayOff);
      const dayM = DAY_MULT[date.getDay()];
      for (let h = bOpen; h < bClose; h++) {
        const hourM = HOUR_MULT[h] || 0; if (!hourM) continue;
        const base = Math.round(bandraMembers.length * BASE_RATE * hourM * dayM);
        if (!base) continue;
        for (let k=0; k<ri(Math.max(0,base-2), base+2); k++) {
          addHistory(bandraMembers[ri(0,bandraMembers.length-1)], bandraId, date, h);
        }
      }
    }
    // Today: 280 open check-ins (NULL checkout) → 280/300 = 93.3% > 90%
    const bandraStart = new Date(now);
    bandraStart.setHours(bOpen, 0, 0, 0);
    for (let i=0; i<280; i++) {
      const mid = bandraMembers[i % bandraMembers.length];
      const ci  = new Date(bandraStart.getTime() + i * 8000);
      checkinBatch.push([mid, bandraId, ci.toISOString(), null]);
      if (!memberLastCheckin[mid] || ci > memberLastCheckin[mid]) memberLastCheckin[mid] = ci;
    }

    // ── ANOMALY 2: Velachery — 0 open, last activity >2h ago ──────────────────
    console.log('   ⚠️  Seeding Velachery zero check-ins...');
    const velId = gymMap['WTF Gyms — Velachery'].id;
    const { openHour: vOpen, closeHour: vClose } = gymMap['WTF Gyms — Velachery'];
    const velMembers = membersByGym[velId] || [];

    for (let dayOff = DAYS_HISTORY; dayOff >= 1; dayOff--) {
      const date = new Date(now); date.setDate(date.getDate() - dayOff);
      const dayM = DAY_MULT[date.getDay()];
      for (let h = vOpen; h < vClose; h++) {
        const hourM = HOUR_MULT[h] || 0; if (!hourM) continue;
        const base = Math.round(velMembers.length * BASE_RATE * hourM * dayM);
        if (!base) continue;
        for (let k=0; k<ri(Math.max(0,base-1), base+1); k++) {
          addHistory(velMembers[ri(0,velMembers.length-1)], velId, date, h);
        }
      }
    }
    // Last check-in: 3 hours ago, with checkout (no open check-ins today)
    const velLastTime = new Date(now.getTime() - 3*60*60*1000);
    checkinBatch.push([
      velMembers[0], velId,
      velLastTime.toISOString(),
      new Date(velLastTime.getTime() + 50*60000).toISOString()
    ]);
    if (!memberLastCheckin[velMembers[0]] || velLastTime > memberLastCheckin[velMembers[0]]) {
      memberLastCheckin[velMembers[0]] = velLastTime;
    }

    // Batch-insert all check-ins
    console.log(`   Inserting ${checkinBatch.length} check-ins...`);
    for (let i=0; i<checkinBatch.length; i+=1000) {
      const batch = checkinBatch.slice(i, i+1000);
      const ph = batch.map((_,idx) => {
        const b=idx*4; return `($${b+1},$${b+2},$${b+3},$${b+4})`;
      }).join(',');
      await client.query(
        `INSERT INTO checkins (member_id,gym_id,checked_in_at,checked_out_at) VALUES ${ph}`,
        batch.flat()
      );
    }
    console.log(`   ✓ ${checkinBatch.length} check-ins`);

    // ── 3a. Sync member last_checkin_at ───────────────────────────────────────
    console.log('🔄 Syncing last_checkin_at...');
    const lcEntries = Object.entries(memberLastCheckin);
    for (let i=0; i<lcEntries.length; i+=500) {
      const batch = lcEntries.slice(i, i+500);
      for (const [mid, ts] of batch) {
        await client.query('UPDATE members SET last_checkin_at=$1 WHERE id=$2', [ts.toISOString(), mid]);
      }
    }
    console.log(`   ✓ ${lcEntries.length} members updated`);

    // ── 3b. Churn segment: 230 active members with old last_checkin_at ─────────
    console.log('📉 Seeding churn segment (230 active members)...');
    const activePool = allMemberIds.filter(id => !inactiveSet.has(id));
    // Pick 230 from active pool (skip first gym's members to keep anomaly gyms clean)
    const churnCandidates = activePool.slice(100, 330);

    for (let i=0; i<150; i++) {                       // 150 High Risk: 45-89 days
      const daysAgo = ri(45, 89);
      const ts = new Date(now.getTime() - daysAgo*86400000);
      await client.query('UPDATE members SET last_checkin_at=$1 WHERE id=$2', [ts.toISOString(), churnCandidates[i]]);
    }
    for (let i=150; i<230; i++) {                      // 80 Critical Risk: 90-120 days
      const daysAgo = ri(90, 120);
      const ts = new Date(now.getTime() - daysAgo*86400000);
      await client.query('UPDATE members SET last_checkin_at=$1 WHERE id=$2', [ts.toISOString(), churnCandidates[i]]);
    }
    console.log('   ✓ 150 High Risk (45-89d) + 80 Critical (90-120d)');

    // ── 4. Payments ───────────────────────────────────────────────────────────
    console.log('💳 Generating payments...');
    const payBatch = [];
    const saltId = gymMap['WTF Gyms — Salt Lake'].id;

    // Build gymId lookup
    const memberGymId = {};
    for (const [gid, mids] of Object.entries(membersByGym)) {
      for (const mid of mids) memberGymId[mid] = parseInt(gid);
    }

    for (const mid of allMemberIds) {
      const plan   = mPlan[mid];
      const mtype  = mType[mid];
      const gymId  = memberGymId[mid];
      const amount = PLAN_PRICES[plan];
      if (!gymId || gymId === saltId) continue; // Salt Lake handled separately

      const payDate = new Date(mJoin[mid]);
      payDate.setDate(payDate.getDate() + ri(0,2));
      payBatch.push([mid, gymId, amount, plan, payDate.toISOString(), 'New']);

      if (mtype === 'Renewal') {
        const renewDate = new Date(payDate);
        renewDate.setDate(renewDate.getDate() - ri(30,90));
        payBatch.push([mid, gymId, amount, plan, renewDate.toISOString(), 'Renewal']);
      }
    }

    // ── ANOMALY 3: Salt Lake — ≥₹15,000 seven days ago, ≤₹3,000 today ────────
    console.log('   ⚠️  Seeding Salt Lake revenue drop...');
    const saltMembers = membersByGym[saltId] || [];

    // Normal payments for Salt Lake members
    for (const mid of saltMembers) {
      const plan = mPlan[mid]; const mtype = mType[mid];
      const payDate = new Date(mJoin[mid]); payDate.setDate(payDate.getDate() + ri(0,2));
      payBatch.push([mid, saltId, PLAN_PRICES[plan], plan, payDate.toISOString(), 'New']);
      if (mtype === 'Renewal') {
        const rd = new Date(payDate); rd.setDate(rd.getDate() - ri(30,90));
        payBatch.push([mid, saltId, PLAN_PRICES[plan], plan, rd.toISOString(), 'Renewal']);
      }
    }

    // 7 days ago: 2× Annual = ₹23,998 (≥₹15,000 threshold)
    const d7 = new Date(now); d7.setDate(d7.getDate()-7); d7.setHours(10,30,0,0);
    payBatch.push([saltMembers[0],                        saltId, 11999, 'Annual', d7.toISOString(), 'Renewal']);
    const d7b = new Date(d7); d7b.setHours(14,0,0,0);
    payBatch.push([saltMembers[1 % saltMembers.length],   saltId, 11999, 'Annual', d7b.toISOString(), 'Renewal']);

    // Today: 1× Monthly = ₹1,499 (≤₹3,000 threshold)
    const dToday = new Date(now); dToday.setHours(9,15,0,0);
    payBatch.push([saltMembers[2 % saltMembers.length],   saltId,  1499, 'Monthly', dToday.toISOString(), 'New']);

    // Batch-insert payments
    for (let i=0; i<payBatch.length; i+=500) {
      const batch = payBatch.slice(i, i+500);
      const ph = batch.map((_,idx) => {
        const b=idx*6; return `($${b+1},$${b+2},$${b+3},$${b+4},$${b+5},$${b+6})`;
      }).join(',');
      await client.query(
        `INSERT INTO payments (member_id,gym_id,amount,plan_type,payment_date,renewal_type) VALUES ${ph}`,
        batch.flat()
      );
    }
    console.log(`   ✓ ${payBatch.length} payments`);

    await client.query('COMMIT');

    // ── 5. Refresh materialized views ─────────────────────────────────────────
    console.log('🔄 Refreshing materialized views...');
    await pool.query('REFRESH MATERIALIZED VIEW CONCURRENTLY peak_hour_heatmap');
    await pool.query('REFRESH MATERIALIZED VIEW CONCURRENTLY revenue_breakdown_30d');
    console.log('   ✓ Views refreshed');

    const elapsed = ((Date.now()-t0)/1000).toFixed(1);
    console.log(`\n✅ Seed complete in ${elapsed}s`);
    console.log(`   Gyms:${GYMS.length} | Members:${allMemberIds.length} | Check-ins:${checkinBatch.length} | Payments:${payBatch.length}`);

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Seed failed:', err.message);
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

seed().catch(err => { console.error(err); process.exit(1); });
