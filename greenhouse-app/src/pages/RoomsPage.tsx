import { useEffect, useState } from 'react'
import { api, type Room } from '../api'
import { Modal, NumberField } from '../components/ui'
import { money, plain } from '../format'

const EMPTY: Room = { id: 0, number: '', tenant: '', rent: 0, meter_start: 0 }

export function RoomsPage() {
  const [rooms, setRooms] = useState<Room[]>([])
  const [editing, setEditing] = useState<Room | null>(null)
  const [error, setError] = useState('')

  const load = () => api.getRooms().then(setRooms).catch((e) => setError(e.message))
  useEffect(() => {
    load()
  }, [])

  const save = async () => {
    if (!editing) return
    try {
      if (editing.id) await api.updateRoom(editing)
      else await api.createRoom(editing)
      setEditing(null)
      setError('')
      load()
    } catch (e) {
      setError((e as Error).message)
    }
  }

  const remove = async (r: Room) => {
    if (!confirm(`ลบห้อง ${r.number}? บิลทั้งหมดของห้องนี้จะถูกลบด้วย`)) return
    await api.deleteRoom(r.id)
    setEditing(null)
    load()
  }

  return (
    <section>
      <div className="toolbar">
        <h1>ห้องพัก <small>{rooms.length} ห้อง</small></h1>
        <button className="btn primary" onClick={() => setEditing({ ...EMPTY })}>+ เพิ่มห้อง</button>
      </div>

      {rooms.length === 0 && <div className="empty">ยังไม่มีห้องพัก กด “เพิ่มห้อง” เพื่อเริ่มต้น</div>}

      <div className="cards">
        {rooms.map((r) => (
          <button key={r.id} className="card" onClick={() => setEditing({ ...r })}>
            <div className="card-top">
              <strong>{r.number}</strong>
              <span>{money(r.rent)} บาท</span>
            </div>
            <div className="muted">{r.tenant || 'ห้องว่าง / ไม่ระบุผู้เช่า'}</div>
            <div className="muted small">มิเตอร์เริ่มต้น {plain(r.meter_start)}</div>
          </button>
        ))}
      </div>

      {editing && (
        <Modal title={editing.id ? `แก้ไขห้อง ${editing.number}` : 'เพิ่มห้องพัก'} onClose={() => setEditing(null)}>
          <form
            className="editor-form"
            onSubmit={(e) => {
              e.preventDefault()
              save()
            }}
          >
            <label className="field">
              <span>เลขห้อง</span>
              <input autoFocus required value={editing.number} onChange={(e) => setEditing({ ...editing, number: e.target.value })} />
            </label>
            <label className="field">
              <span>ชื่อผู้เช่า</span>
              <input value={editing.tenant} onChange={(e) => setEditing({ ...editing, tenant: e.target.value })} />
            </label>
            <div className="grid2">
              <NumberField label="ค่าเช่าต่อเดือน" suffix="บาท" value={editing.rent} onChange={(v) => setEditing({ ...editing, rent: v })} />
              <NumberField label="เลขมิเตอร์ไฟเริ่มต้น" value={editing.meter_start} onChange={(v) => setEditing({ ...editing, meter_start: v })} />
            </div>
            <p className="hint">เลขมิเตอร์เริ่มต้นใช้เป็น “มิเตอร์ครั้งก่อน” ของบิลเดือนแรก หลังจากนั้นระบบจะใช้เลขจากบิลเดือนก่อนหน้าอัตโนมัติ</p>
            {error && <div className="alert">{error}</div>}
            <div className="row-actions">
              <button className="btn primary" type="submit">บันทึก</button>
              {editing.id > 0 && (
                <button className="btn danger ghost" type="button" onClick={() => remove(editing)}>ลบห้อง</button>
              )}
            </div>
          </form>
        </Modal>
      )}
    </section>
  )
}
