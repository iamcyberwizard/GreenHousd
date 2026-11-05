import { useState } from 'react'
import { api, type Settings } from '../api'
import { ExtrasEditor } from '../components/ExtrasEditor'
import { NumberField } from '../components/ui'

export function SettingsPage({ settings, onSaved }: { settings: Settings; onSaved: (s: Settings) => void }) {
  const [form, setForm] = useState(settings)
  const [status, setStatus] = useState('')
  const set = <K extends keyof Settings>(k: K, v: Settings[K]) => {
    setForm({ ...form, [k]: v })
    setStatus('')
  }

  const save = async () => {
    try {
      const saved = await api.saveSettings(form)
      setForm(saved)
      onSaved(saved)
      setStatus('บันทึกแล้ว ✓')
    } catch (e) {
      setStatus((e as Error).message)
    }
  }

  return (
    <section className="narrow">
      <div className="toolbar">
        <h1>ตั้งค่า</h1>
      </div>
      <form
        className="editor-form panel"
        onSubmit={(e) => {
          e.preventDefault()
          save()
        }}
      >
        <h3>อัตราค่าบริการ</h3>
        <div className="grid2">
          <NumberField label="ค่าไฟฟ้าต่อหน่วย" suffix="บาท" value={form.electricRate} onChange={(v) => set('electricRate', v)} />
          <NumberField label="ค่าน้ำเหมาต่อเดือน" suffix="บาท" value={form.waterFlat} onChange={(v) => set('waterFlat', v)} />
          <NumberField label="ชำระภายในวันที่ (ของเดือนถัดไป)" step="1" value={form.dueDay} onChange={(v) => set('dueDay', v)} />
        </div>
        <ExtrasEditor
          label="ค่าใช้จ่ายเพิ่มเติมประจำเดือน (ใส่ในบิลใหม่ทุกห้องอัตโนมัติ)"
          value={form.extraCharges}
          onChange={(v) => set('extraCharges', v)}
        />
        <p className="hint">อัตราและรายการใหม่ใช้กับบิลที่ยังไม่บันทึก บิลที่บันทึกแล้วจะเก็บค่าเดิมไว้ (แก้ไขรายบิลได้)</p>

        <h3>ข้อมูลบนบิล</h3>
        <label className="field">
          <span>ชื่อหอพัก</span>
          <input value={form.dormName} onChange={(e) => set('dormName', e.target.value)} />
        </label>
        <label className="field">
          <span>ที่อยู่</span>
          <input value={form.address} onChange={(e) => set('address', e.target.value)} />
        </label>
        <label className="field">
          <span>เบอร์โทร</span>
          <input type="tel" value={form.phone} onChange={(e) => set('phone', e.target.value)} />
        </label>
        <label className="field">
          <span>ช่องทางชำระเงิน</span>
          <textarea
            rows={3}
            placeholder="เช่น ธนาคารกสิกรไทย 123-4-56789-0 ชื่อบัญชี ..."
            value={form.paymentInfo}
            onChange={(e) => set('paymentInfo', e.target.value)}
          />
        </label>

        <div className="row-actions">
          <button className="btn primary" type="submit">บันทึกการตั้งค่า</button>
          {status && <span className="muted">{status}</span>}
        </div>
      </form>
    </section>
  )
}
