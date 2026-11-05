import { useCallback, useEffect, useRef, useState } from 'react'
import { api, type Bill, type Settings } from '../api'
import { BillDoc } from '../components/BillDoc'
import { ExtrasEditor } from '../components/ExtrasEditor'
import { SummaryDoc } from '../components/SummaryDoc'
import { ExportBar, Modal, NumberField } from '../components/ui'
import { currentMonth, money, plain, thaiMonth } from '../format'

const shiftMonth = (month: string, delta: number) => {
  const [y, m] = month.split('-').map(Number)
  const d = new Date(y, m - 1 + delta, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

/** Same totals the server computes, so edits preview instantly. */
const recalc = (b: Bill): Bill => {
  const units = Math.max(0, b.meter_curr - b.meter_prev)
  const electric = Math.round(units * b.electric_rate * 100) / 100
  const extras = b.extras.reduce((t, x) => t + x.amount, 0)
  return { ...b, units, electric, total: b.rent + b.water + electric + extras }
}

export function BillsPage({ settings }: { settings: Settings }) {
  const [month, setMonth] = useState(currentMonth)
  const [bills, setBills] = useState<Bill[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [editing, setEditing] = useState<Bill | null>(null)
  const [showSummary, setShowSummary] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      setBills(await api.getBills(month))
      setError('')
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }, [month])

  useEffect(() => {
    load()
  }, [load, settings])

  const replace = (b: Bill) => setBills((list) => list.map((x) => (x.room_id === b.room_id ? b : x)))

  const quickSave = async (bill: Bill, meterCurr: number) => {
    if (bill.saved && meterCurr === bill.meter_curr) return
    try {
      replace(await api.saveBill({ ...bill, meter_curr: meterCurr }))
      setError('')
    } catch (e) {
      setError((e as Error).message)
    }
  }

  const saved = bills.filter((b) => b.saved)
  const total = saved.reduce((t, b) => t + b.total, 0)
  const paid = saved.filter((b) => b.paid).reduce((t, b) => t + b.total, 0)

  return (
    <section>
      <div className="toolbar">
        <div className="month-nav">
          <button className="btn ghost icon" onClick={() => setMonth(shiftMonth(month, -1))} aria-label="เดือนก่อน">‹</button>
          <strong>{thaiMonth(month)}</strong>
          <button className="btn ghost icon" onClick={() => setMonth(shiftMonth(month, 1))} aria-label="เดือนถัดไป">›</button>
        </div>
        <button className="btn primary" disabled={!saved.length} onClick={() => setShowSummary(true)}>
          ตารางสรุปเดือนนี้
        </button>
      </div>

      <div className="stats">
        <div><span>บันทึกแล้ว</span><strong>{saved.length}/{bills.length} ห้อง</strong></div>
        <div><span>ยอดรวม</span><strong>{money(total)}</strong></div>
        <div><span>ชำระแล้ว</span><strong>{money(paid)}</strong></div>
        <div><span>ค้างชำระ</span><strong>{money(total - paid)}</strong></div>
      </div>

      {error && <div className="alert">{error}</div>}

      {!loading && bills.length === 0 && (
        <div className="empty">ยังไม่มีห้องพัก — เพิ่มห้องได้ที่เมนู “ห้องพัก”</div>
      )}

      <div className="bill-list">
        {bills.length > 0 && (
          <div className="bill-row bill-row-head">
            <span>ห้อง</span>
            <span>มิเตอร์ก่อน</span>
            <span>มิเตอร์ล่าสุด</span>
            <span className="num">หน่วย</span>
            <span className="num">รวม (บาท)</span>
            <span>สถานะ</span>
            <span />
          </div>
        )}
        {bills.map((b) => (
          <BillRow key={`${month}-${b.room_id}-${b.saved}-${b.meter_curr}`} bill={b} onQuickSave={quickSave} onOpen={() => setEditing(b)} />
        ))}
      </div>

      {editing && (
        <BillEditor
          bill={editing}
          settings={settings}
          onClose={() => setEditing(null)}
          onSaved={(b) => {
            replace(b)
            setEditing(b)
          }}
          onDeleted={() => {
            setEditing(null)
            load()
          }}
        />
      )}

      {showSummary && (
        <SummaryModal
          bills={saved}
          unsaved={bills.length - saved.length}
          month={month}
          settings={settings}
          onClose={() => setShowSummary(false)}
        />
      )}
    </section>
  )
}

function BillRow({
  bill,
  onQuickSave,
  onOpen,
}: {
  bill: Bill
  onQuickSave: (b: Bill, meter: number) => void
  onOpen: () => void
}) {
  const [meter, setMeter] = useState(bill.saved ? String(bill.meter_curr) : '')

  const value = meter === '' ? bill.meter_prev : Number(meter)
  const preview = recalc({ ...bill, meter_curr: value })
  const invalid = meter !== '' && value < bill.meter_prev

  const commit = () => {
    if (meter === '' || invalid) return
    onQuickSave(bill, value)
  }

  return (
    <div className={`bill-row ${bill.saved ? '' : 'draft'}`}>
      <div className="room-cell">
        <strong>{bill.room_number}</strong>
        {bill.tenant && <small>{bill.tenant}</small>}
      </div>
      <div className="cell" data-label="มิเตอร์ก่อน">{plain(bill.meter_prev)}</div>
      <div className="cell" data-label="มิเตอร์ล่าสุด">
        <input
          className={invalid ? 'invalid' : ''}
          type="number"
          inputMode="decimal"
          placeholder="กรอกเลขมิเตอร์"
          value={meter}
          onChange={(e) => setMeter(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
        />
      </div>
      <div className="cell num" data-label="หน่วย">{plain(preview.units)}</div>
      <div className="cell num" data-label="รวม">{money(preview.total)}</div>
      <div className="cell" data-label="สถานะ">
        <span className={`chip ${bill.paid ? 'ok' : bill.saved ? 'wait' : ''}`}>
          {bill.paid ? 'ชำระแล้ว' : bill.saved ? 'รอชำระ' : 'ยังไม่บันทึก'}
        </span>
      </div>
      <div className="cell actions">
        <button className="btn" onClick={onOpen}>ออกบิล</button>
      </div>
    </div>
  )
}

function BillEditor({
  bill,
  settings,
  onClose,
  onSaved,
  onDeleted,
}: {
  bill: Bill
  settings: Settings
  onClose: () => void
  onSaved: (b: Bill) => void
  onDeleted: () => void
}) {
  const [draft, setDraft] = useState(bill)
  const [dirty, setDirty] = useState(!bill.saved)
  const [error, setError] = useState('')
  const docRef = useRef<HTMLDivElement>(null)
  const set = <K extends keyof Bill>(k: K, v: Bill[K]) => {
    setDraft((d) => recalc({ ...d, [k]: v }))
    setDirty(true)
  }

  const save = async () => {
    try {
      const b = await api.saveBill(draft)
      setDraft(b)
      setDirty(false)
      setError('')
      onSaved(b)
    } catch (e) {
      setError((e as Error).message)
    }
  }

  const remove = async () => {
    if (!draft.id || !confirm(`ลบบิลห้อง ${draft.room_number} เดือนนี้?`)) return
    await api.deleteBill(draft.id)
    onDeleted()
  }

  return (
    <Modal title={`บิลห้อง ${bill.room_number} · ${thaiMonth(bill.month)}`} onClose={onClose}>
      <div className="editor">
        <div className="editor-form">
          <div className="grid2">
            <NumberField label="มิเตอร์ครั้งก่อน" value={draft.meter_prev} onChange={(v) => set('meter_prev', v)} />
            <NumberField label="มิเตอร์ครั้งนี้" value={draft.meter_curr} onChange={(v) => set('meter_curr', v)} />
            <NumberField label="ค่าไฟต่อหน่วย" suffix="บาท" value={draft.electric_rate} onChange={(v) => set('electric_rate', v)} />
            <NumberField label="ค่าน้ำ" suffix="บาท" value={draft.water} onChange={(v) => set('water', v)} />
            <NumberField label="ค่าเช่าห้อง" suffix="บาท" value={draft.rent} onChange={(v) => set('rent', v)} />
          </div>
          <ExtrasEditor label="ค่าใช้จ่ายเพิ่มเติม" value={draft.extras} onChange={(v) => set('extras', v)} />
          <label className="check">
            <input type="checkbox" checked={draft.paid} onChange={(e) => set('paid', e.target.checked)} />
            ชำระเงินแล้ว
          </label>
          {(draft.electric_rate !== settings.electricRate || draft.water !== settings.waterFlat) && (
            <button
              className="link"
              onClick={() => {
                setDraft((d) => recalc({ ...d, electric_rate: settings.electricRate, water: settings.waterFlat }))
                setDirty(true)
              }}
            >
              ใช้อัตราปัจจุบัน (ไฟ {plain(settings.electricRate)} / น้ำ {plain(settings.waterFlat)})
            </button>
          )}
          {settings.extraCharges.length > 0 && JSON.stringify(draft.extras) !== JSON.stringify(settings.extraCharges) && (
            <button className="link" onClick={() => set('extras', settings.extraCharges)}>
              ใช้รายการค่าใช้จ่ายประจำจากหน้าตั้งค่า
            </button>
          )}
          {error && <div className="alert">{error}</div>}
          <div className="row-actions">
            <button className="btn primary" onClick={save} disabled={!dirty}>
              {dirty ? 'บันทึก' : 'บันทึกแล้ว ✓'}
            </button>
            {draft.id && (
              <button className="btn danger ghost" onClick={remove}>ลบบิล</button>
            )}
          </div>
        </div>

        <div className="editor-preview">
          <div className="doc-scroll">
            <BillDoc ref={docRef} bill={draft} settings={settings} />
          </div>
          {dirty && <p className="hint">ยังไม่ได้บันทึกการแก้ไข</p>}
          <ExportBar target={docRef} filename={`บิล-ห้อง${draft.room_number}-${draft.month}`} />
        </div>
      </div>
    </Modal>
  )
}

function SummaryModal({
  bills,
  unsaved,
  month,
  settings,
  onClose,
}: {
  bills: Bill[]
  unsaved: number
  month: string
  settings: Settings
  onClose: () => void
}) {
  const docRef = useRef<HTMLDivElement>(null)
  return (
    <Modal title={`ตารางสรุป · ${thaiMonth(month)}`} onClose={onClose}>
      {unsaved > 0 && <div className="alert">มี {unsaved} ห้องที่ยังไม่บันทึกเลขมิเตอร์ จึงไม่อยู่ในตาราง</div>}
      <div className="doc-scroll">
        <SummaryDoc ref={docRef} bills={bills} month={month} settings={settings} />
      </div>
      <ExportBar target={docRef} filename={`สรุปค่าเช่า-${month}`} />
    </Modal>
  )
}
