import express from 'express'
import { DatabaseSync } from 'node:sqlite'
import { existsSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const dataDir = join(root, 'data')
if (!existsSync(dataDir)) mkdirSync(dataDir)

const db = new DatabaseSync(join(dataDir, 'greenhouse.db'))
db.exec(`
  PRAGMA foreign_keys = ON;
  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS rooms (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    number TEXT NOT NULL UNIQUE,
    tenant TEXT NOT NULL DEFAULT '',
    rent REAL NOT NULL DEFAULT 0,
    meter_start REAL NOT NULL DEFAULT 0
  );
  CREATE TABLE IF NOT EXISTS bills (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    room_id INTEGER NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
    month TEXT NOT NULL,
    meter_prev REAL NOT NULL,
    meter_curr REAL NOT NULL,
    electric_rate REAL NOT NULL,
    water REAL NOT NULL,
    rent REAL NOT NULL,
    extras TEXT NOT NULL DEFAULT '[]',
    paid INTEGER NOT NULL DEFAULT 0,
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE (room_id, month)
  );
`)

// Migrate the old single "other" charge into the extras list.
const billColumns = db.prepare('PRAGMA table_info(bills)').all().map((c) => c.name)
if (!billColumns.includes('extras')) {
  db.exec(`ALTER TABLE bills ADD COLUMN extras TEXT NOT NULL DEFAULT '[]'`)
  if (billColumns.includes('other')) {
    db.exec(`UPDATE bills SET extras = json_array(json_object(
      'name', CASE WHEN other_note = '' THEN 'อื่น ๆ' ELSE other_note END, 'amount', other))
      WHERE other <> 0`)
  }
}

const DEFAULT_SETTINGS = {
  dormName: 'Green House',
  address: '',
  phone: '',
  paymentInfo: '',
  electricRate: '8',
  waterFlat: '100',
  dueDay: '5',
  extraCharges: '[]',
}
const insertDefault = db.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)')
for (const [k, v] of Object.entries(DEFAULT_SETTINGS)) insertDefault.run(k, v)

function getSettings() {
  const rows = db.prepare('SELECT key, value FROM settings').all()
  const s = Object.fromEntries(rows.map((r) => [r.key, r.value]))
  return {
    dormName: s.dormName,
    address: s.address,
    phone: s.phone,
    paymentInfo: s.paymentInfo,
    electricRate: Number(s.electricRate),
    waterFlat: Number(s.waterFlat),
    dueDay: Number(s.dueDay),
    extraCharges: parseExtras(s.extraCharges),
  }
}

/** Cleans a list of {name, amount} line items; blank rows are dropped. */
function sanitizeExtras(list) {
  if (!Array.isArray(list)) return []
  return list
    .map((x) => ({ name: String(x?.name ?? '').trim(), amount: num(x?.amount) }))
    .filter((x) => x.name || x.amount)
    .map((x) => ({ name: x.name || 'อื่น ๆ', amount: x.amount }))
}

function parseExtras(json) {
  try {
    return sanitizeExtras(JSON.parse(json))
  } catch {
    return []
  }
}

const num = (v, fallback = 0) => {
  const n = Number(v)
  return Number.isFinite(n) ? n : fallback
}
const isMonth = (m) => typeof m === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(m)

function withTotals({ other: _o, other_note: _n, ...b }) {
  const extras = typeof b.extras === 'string' ? parseExtras(b.extras) : b.extras
  const units = Math.max(0, b.meter_curr - b.meter_prev)
  const electric = Math.round(units * b.electric_rate * 100) / 100
  const extrasTotal = extras.reduce((t, x) => t + x.amount, 0)
  return { ...b, extras, paid: !!b.paid, units, electric, total: b.rent + b.water + electric + extrasTotal }
}

// Last recorded meter for a room before the given month, or the room's starting meter.
function previousMeter(roomId, month) {
  const row = db
    .prepare('SELECT meter_curr FROM bills WHERE room_id = ? AND month < ? ORDER BY month DESC LIMIT 1')
    .get(roomId, month)
  if (row) return row.meter_curr
  return db.prepare('SELECT meter_start FROM rooms WHERE id = ?').get(roomId)?.meter_start ?? 0
}

const app = express()
app.use(express.json())

// ---------- settings ----------
app.get('/api/settings', (_req, res) => res.json(getSettings()))

app.put('/api/settings', (req, res) => {
  const body = req.body ?? {}
  const upsert = db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
  for (const key of Object.keys(DEFAULT_SETTINGS)) {
    if (body[key] === undefined) continue
    if (key === 'extraCharges') {
      upsert.run(key, JSON.stringify(sanitizeExtras(body[key])))
      continue
    }
    const numeric = ['electricRate', 'waterFlat', 'dueDay'].includes(key)
    if (numeric && (!Number.isFinite(Number(body[key])) || Number(body[key]) < 0)) {
      return res.status(400).json({ error: `ค่า ${key} ไม่ถูกต้อง` })
    }
    upsert.run(key, String(body[key]).trim())
  }
  res.json(getSettings())
})

// ---------- rooms ----------
app.get('/api/rooms', (_req, res) => {
  res.json(db.prepare('SELECT * FROM rooms ORDER BY number COLLATE NOCASE').all())
})

app.post('/api/rooms', (req, res) => {
  const { number, tenant = '', rent = 0, meter_start = 0 } = req.body ?? {}
  if (!String(number ?? '').trim()) return res.status(400).json({ error: 'กรุณาระบุเลขห้อง' })
  try {
    const r = db
      .prepare('INSERT INTO rooms (number, tenant, rent, meter_start) VALUES (?, ?, ?, ?)')
      .run(String(number).trim(), String(tenant).trim(), num(rent), num(meter_start))
    res.status(201).json(db.prepare('SELECT * FROM rooms WHERE id = ?').get(r.lastInsertRowid))
  } catch (e) {
    if (!String(e.message).includes('UNIQUE')) throw e
    res.status(409).json({ error: 'มีเลขห้องนี้อยู่แล้ว' })
  }
})

app.put('/api/rooms/:id', (req, res) => {
  const { number, tenant = '', rent = 0, meter_start = 0 } = req.body ?? {}
  if (!String(number ?? '').trim()) return res.status(400).json({ error: 'กรุณาระบุเลขห้อง' })
  try {
    db.prepare('UPDATE rooms SET number = ?, tenant = ?, rent = ?, meter_start = ? WHERE id = ?').run(
      String(number).trim(),
      String(tenant).trim(),
      num(rent),
      num(meter_start),
      req.params.id,
    )
    res.json(db.prepare('SELECT * FROM rooms WHERE id = ?').get(req.params.id))
  } catch (e) {
    if (!String(e.message).includes('UNIQUE')) throw e
    res.status(409).json({ error: 'มีเลขห้องนี้อยู่แล้ว' })
  }
})

app.delete('/api/rooms/:id', (req, res) => {
  db.prepare('DELETE FROM rooms WHERE id = ?').run(req.params.id)
  res.status(204).end()
})

// ---------- bills ----------
// Every room for the month: saved bill if one exists, otherwise a draft prefilled
// with the previous meter reading and current rates.
app.get('/api/bills', (req, res) => {
  const { month } = req.query
  if (!isMonth(month)) return res.status(400).json({ error: 'month ต้องอยู่ในรูปแบบ YYYY-MM' })
  const s = getSettings()
  const rooms = db.prepare('SELECT * FROM rooms ORDER BY number COLLATE NOCASE').all()
  const getBill = db.prepare('SELECT * FROM bills WHERE room_id = ? AND month = ?')
  res.json(
    rooms.map((room) => {
      const bill = getBill.get(room.id, month)
      if (bill) return { ...withTotals(bill), saved: true, room_number: room.number, tenant: room.tenant }
      const prev = previousMeter(room.id, month)
      return {
        ...withTotals({
          id: null,
          room_id: room.id,
          month,
          meter_prev: prev,
          meter_curr: prev,
          electric_rate: s.electricRate,
          water: s.waterFlat,
          rent: room.rent,
          extras: s.extraCharges,
          paid: 0,
        }),
        saved: false,
        room_number: room.number,
        tenant: room.tenant,
      }
    }),
  )
})

app.put('/api/bills', (req, res) => {
  const b = req.body ?? {}
  if (!isMonth(b.month)) return res.status(400).json({ error: 'month ไม่ถูกต้อง' })
  const room = db.prepare('SELECT * FROM rooms WHERE id = ?').get(b.room_id)
  if (!room) return res.status(404).json({ error: 'ไม่พบห้อง' })
  const s = getSettings()
  const meterPrev = num(b.meter_prev, previousMeter(room.id, b.month))
  const meterCurr = num(b.meter_curr, meterPrev)
  if (meterCurr < meterPrev) return res.status(400).json({ error: `ห้อง ${room.number}: เลขมิเตอร์ครั้งนี้น้อยกว่าครั้งก่อน` })
  db.prepare(
    `INSERT INTO bills (room_id, month, meter_prev, meter_curr, electric_rate, water, rent, extras, paid, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
     ON CONFLICT(room_id, month) DO UPDATE SET
       meter_prev = excluded.meter_prev, meter_curr = excluded.meter_curr,
       electric_rate = excluded.electric_rate, water = excluded.water, rent = excluded.rent,
       extras = excluded.extras, paid = excluded.paid,
       updated_at = excluded.updated_at`,
  ).run(
    room.id,
    b.month,
    meterPrev,
    meterCurr,
    num(b.electric_rate, s.electricRate),
    num(b.water, s.waterFlat),
    num(b.rent, room.rent),
    JSON.stringify(b.extras === undefined ? s.extraCharges : sanitizeExtras(b.extras)),
    b.paid ? 1 : 0,
  )
  const saved = db.prepare('SELECT * FROM bills WHERE room_id = ? AND month = ?').get(room.id, b.month)
  res.json({ ...withTotals(saved), saved: true, room_number: room.number, tenant: room.tenant })
})

app.delete('/api/bills/:id', (req, res) => {
  db.prepare('DELETE FROM bills WHERE id = ?').run(req.params.id)
  res.status(204).end()
})

// ---------- static frontend (production) ----------
const dist = join(root, 'dist')
if (existsSync(dist)) {
  app.use(express.static(dist))
  app.get(/^(?!\/api).*/, (_req, res) => res.sendFile(join(dist, 'index.html')))
}

const port = Number(process.env.PORT ?? 3001)
app.listen(port, '0.0.0.0', () => console.log(`Green House server: http://localhost:${port}`))
