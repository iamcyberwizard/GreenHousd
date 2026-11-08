type Extra = { name: string; amount: number }

type BillRow = {
  id: number | null
  room_id: number
  month: string
  meter_prev: number
  meter_curr: number
  electric_rate: number
  water: number
  rent: number
  extras: string | Extra[]
  paid: number | boolean
}

/** APP_PASSWORD is an optional secret (`wrangler secret put APP_PASSWORD`). */
type AppEnv = Env & { APP_PASSWORD?: string }

type RoomRow = { id: number; number: string; tenant: string; rent: number; meter_start: number }

const SETTING_KEYS = ['dormName', 'address', 'phone', 'paymentInfo', 'electricRate', 'waterFlat', 'dueDay', 'extraCharges']
const NUMERIC_KEYS = ['electricRate', 'waterFlat', 'dueDay']

class HttpError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

const json = (data: unknown, status = 200) => Response.json(data, { status })

const num = (v: unknown, fallback = 0) => {
  const n = Number(v)
  return v !== null && v !== '' && Number.isFinite(n) ? n : fallback
}
const isMonth = (m: unknown): m is string => typeof m === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(m)

/** Cleans a list of {name, amount} line items; blank rows are dropped. */
function sanitizeExtras(list: unknown): Extra[] {
  if (!Array.isArray(list)) return []
  return list
    .map((x) => ({ name: String(x?.name ?? '').trim(), amount: num(x?.amount) }))
    .filter((x) => x.name || x.amount)
    .map((x) => ({ name: x.name || 'อื่น ๆ', amount: x.amount }))
}

function parseExtras(value: string | Extra[]) {
  if (Array.isArray(value)) return sanitizeExtras(value)
  try {
    return sanitizeExtras(JSON.parse(value))
  } catch {
    return []
  }
}

function withTotals(b: BillRow) {
  const extras = parseExtras(b.extras)
  const units = Math.max(0, b.meter_curr - b.meter_prev)
  const electric = Math.round(units * b.electric_rate * 100) / 100
  const extrasTotal = extras.reduce((t, x) => t + x.amount, 0)
  return { ...b, extras, paid: !!b.paid, units, electric, total: b.rent + b.water + electric + extrasTotal }
}

async function getSettings(db: D1Database) {
  const { results } = await db.prepare('SELECT key, value FROM settings').all<{ key: string; value: string }>()
  const s = Object.fromEntries(results.map((r) => [r.key, r.value]))
  return {
    dormName: s.dormName ?? 'Green House',
    address: s.address ?? '',
    phone: s.phone ?? '',
    paymentInfo: s.paymentInfo ?? '',
    electricRate: num(s.electricRate, 8),
    waterFlat: num(s.waterFlat, 100),
    dueDay: num(s.dueDay, 5),
    extraCharges: parseExtras(s.extraCharges ?? '[]'),
  }
}

// Last recorded meter for a room before the given month, or the room's starting meter.
async function previousMeter(db: D1Database, roomId: number, month: string) {
  const row = await db
    .prepare('SELECT meter_curr FROM bills WHERE room_id = ? AND month < ? ORDER BY month DESC LIMIT 1')
    .bind(roomId, month)
    .first<{ meter_curr: number }>()
  if (row) return row.meter_curr
  const room = await db.prepare('SELECT meter_start FROM rooms WHERE id = ?').bind(roomId).first<{ meter_start: number }>()
  return room?.meter_start ?? 0
}

async function readBody(req: Request): Promise<Record<string, unknown>> {
  try {
    const body = await req.json()
    return body && typeof body === 'object' ? (body as Record<string, unknown>) : {}
  } catch {
    return {}
  }
}

const isUniqueViolation = (e: unknown) => String((e as Error)?.message).includes('UNIQUE')

// ---------- settings ----------
async function putSettings(db: D1Database, body: Record<string, unknown>) {
  const stmts: D1PreparedStatement[] = []
  const upsert = 'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'
  for (const key of SETTING_KEYS) {
    if (body[key] === undefined) continue
    let value: string
    if (key === 'extraCharges') value = JSON.stringify(sanitizeExtras(body[key]))
    else if (NUMERIC_KEYS.includes(key)) {
      const n = Number(body[key])
      if (!Number.isFinite(n) || n < 0) throw new HttpError(400, `ค่า ${key} ไม่ถูกต้อง`)
      value = String(n)
    } else value = String(body[key]).trim()
    stmts.push(db.prepare(upsert).bind(key, value))
  }
  if (stmts.length) await db.batch(stmts)
  return getSettings(db)
}

// ---------- rooms ----------
function roomFields(body: Record<string, unknown>) {
  const number = String(body.number ?? '').trim()
  if (!number) throw new HttpError(400, 'กรุณาระบุเลขห้อง')
  return [number, String(body.tenant ?? '').trim(), num(body.rent), num(body.meter_start)] as const
}

async function saveRoom(db: D1Database, body: Record<string, unknown>, id?: number) {
  const fields = roomFields(body)
  try {
    if (id) {
      await db.prepare('UPDATE rooms SET number = ?, tenant = ?, rent = ?, meter_start = ? WHERE id = ?').bind(...fields, id).run()
      return await db.prepare('SELECT * FROM rooms WHERE id = ?').bind(id).first<RoomRow>()
    }
    return await db
      .prepare('INSERT INTO rooms (number, tenant, rent, meter_start) VALUES (?, ?, ?, ?) RETURNING *')
      .bind(...fields)
      .first<RoomRow>()
  } catch (e) {
    if (isUniqueViolation(e)) throw new HttpError(409, 'มีเลขห้องนี้อยู่แล้ว')
    throw e
  }
}

// ---------- bills ----------
// Every room for the month: saved bill if one exists, otherwise a draft prefilled
// with the previous meter reading and current rates.
async function listBills(db: D1Database, month: string) {
  const s = await getSettings(db)
  const [{ results: rooms }, { results: bills }, { results: latest }] = await db.batch([
    db.prepare('SELECT * FROM rooms ORDER BY number COLLATE NOCASE'),
    db.prepare('SELECT * FROM bills WHERE month = ?').bind(month),
    // Most recent meter reading before this month for each room.
    db
      .prepare(
        `SELECT b.room_id, b.meter_curr FROM bills b
         WHERE b.month = (SELECT MAX(month) FROM bills WHERE room_id = b.room_id AND month < ?)`,
      )
      .bind(month),
  ])
  const billByRoom = new Map((bills as BillRow[]).map((b) => [b.room_id, b]))
  const prevByRoom = new Map((latest as { room_id: number; meter_curr: number }[]).map((r) => [r.room_id, r.meter_curr]))

  return (rooms as RoomRow[]).map((room) => {
    const bill = billByRoom.get(room.id)
    const meta = { room_number: room.number, tenant: room.tenant }
    if (bill) return { ...withTotals(bill), saved: true, ...meta }
    const prev = prevByRoom.get(room.id) ?? room.meter_start
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
      ...meta,
    }
  })
}

async function saveBill(db: D1Database, b: Record<string, unknown>) {
  if (!isMonth(b.month)) throw new HttpError(400, 'month ไม่ถูกต้อง')
  const room = await db.prepare('SELECT * FROM rooms WHERE id = ?').bind(num(b.room_id)).first<RoomRow>()
  if (!room) throw new HttpError(404, 'ไม่พบห้อง')
  const s = await getSettings(db)
  const meterPrev = num(b.meter_prev, await previousMeter(db, room.id, b.month))
  const meterCurr = num(b.meter_curr, meterPrev)
  if (meterCurr < meterPrev) throw new HttpError(400, `ห้อง ${room.number}: เลขมิเตอร์ครั้งนี้น้อยกว่าครั้งก่อน`)
  const saved = await db
    .prepare(
      `INSERT INTO bills (room_id, month, meter_prev, meter_curr, electric_rate, water, rent, extras, paid, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
       ON CONFLICT(room_id, month) DO UPDATE SET
         meter_prev = excluded.meter_prev, meter_curr = excluded.meter_curr,
         electric_rate = excluded.electric_rate, water = excluded.water, rent = excluded.rent,
         extras = excluded.extras, paid = excluded.paid, updated_at = excluded.updated_at
       RETURNING *`,
    )
    .bind(
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
    .first<BillRow>()
  return { ...withTotals(saved!), saved: true, room_number: room.number, tenant: room.tenant }
}

// ---------- routing ----------
async function handleApi(req: Request, db: D1Database, path: string): Promise<Response> {
  const method = req.method
  const [, resource, rawId] = path.split('/') // "/rooms/3" → ["", "rooms", "3"]
  const id = rawId ? Number(rawId) : undefined

  if (resource === 'settings' && !rawId) {
    if (method === 'GET') return json(await getSettings(db))
    if (method === 'PUT') return json(await putSettings(db, await readBody(req)))
  }

  if (resource === 'rooms') {
    if (!rawId && method === 'GET') {
      const { results } = await db.prepare('SELECT * FROM rooms ORDER BY number COLLATE NOCASE').all<RoomRow>()
      return json(results)
    }
    if (!rawId && method === 'POST') return json(await saveRoom(db, await readBody(req)), 201)
    if (id && method === 'PUT') return json(await saveRoom(db, await readBody(req), id))
    if (id && method === 'DELETE') {
      await db.prepare('DELETE FROM rooms WHERE id = ?').bind(id).run()
      return new Response(null, { status: 204 })
    }
  }

  if (resource === 'bills') {
    if (!rawId && method === 'GET') {
      const month = new URL(req.url).searchParams.get('month')
      if (!isMonth(month)) throw new HttpError(400, 'month ต้องอยู่ในรูปแบบ YYYY-MM')
      return json(await listBills(db, month))
    }
    if (!rawId && method === 'PUT') return json(await saveBill(db, await readBody(req)))
    if (id && method === 'DELETE') {
      await db.prepare('DELETE FROM bills WHERE id = ?').bind(id).run()
      return new Response(null, { status: 204 })
    }
  }

  throw new HttpError(404, 'ไม่พบ API นี้')
}

/** When the APP_PASSWORD secret is set, the whole site asks for it (any username). */
function isAuthorized(req: Request, password: string | undefined) {
  if (!password) return true
  const header = req.headers.get('Authorization') ?? ''
  if (!header.startsWith('Basic ')) return false
  let decoded = ''
  try {
    decoded = new TextDecoder().decode(Uint8Array.from(atob(header.slice(6)), (c) => c.charCodeAt(0)))
  } catch {
    return false
  }
  const given = new TextEncoder().encode(decoded.slice(decoded.indexOf(':') + 1))
  const expected = new TextEncoder().encode(password)
  return given.byteLength === expected.byteLength && crypto.subtle.timingSafeEqual(given, expected)
}

export default {
  async fetch(req, env) {
    if (!isAuthorized(req, env.APP_PASSWORD)) {
      return new Response('ต้องใส่รหัสผ่าน', {
        status: 401,
        headers: { 'WWW-Authenticate': 'Basic realm="Green House", charset="UTF-8"' },
      })
    }

    const url = new URL(req.url)
    if (!url.pathname.startsWith('/api/')) return env.ASSETS.fetch(req)

    try {
      return await handleApi(req, env.DB, url.pathname.slice(4))
    } catch (e) {
      if (e instanceof HttpError) return json({ error: e.message }, e.status)
      console.error(e)
      return json({ error: 'เกิดข้อผิดพลาดในเซิร์ฟเวอร์' }, 500)
    }
  },
} satisfies ExportedHandler<AppEnv>
