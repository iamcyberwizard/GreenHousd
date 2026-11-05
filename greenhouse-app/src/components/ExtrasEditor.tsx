import type { Extra } from '../api'

const SUGGESTIONS = ['ค่าส่วนกลาง', 'ค่าขยะ', 'ค่าอินเทอร์เน็ต', 'ค่าที่จอดรถ', 'ค่าซ่อมแซม', 'ค่าปรับชำระล่าช้า']

/** Editable list of named charges (name + amount), any number of rows. */
export function ExtrasEditor({
  label,
  value,
  onChange,
}: {
  label: string
  value: Extra[]
  onChange: (list: Extra[]) => void
}) {
  const update = (i: number, patch: Partial<Extra>) => onChange(value.map((x, j) => (j === i ? { ...x, ...patch } : x)))

  return (
    <div className="extras">
      <span className="extras-label">{label}</span>
      {value.map((x, i) => (
        <div className="extra-row" key={i}>
          <input
            list="extra-suggestions"
            placeholder="ชื่อรายการ เช่น ค่าส่วนกลาง"
            value={x.name}
            onChange={(e) => update(i, { name: e.target.value })}
          />
          <div className="input-wrap">
            <input
              type="number"
              inputMode="decimal"
              step="any"
              placeholder="0"
              value={x.amount || ''}
              onChange={(e) => update(i, { amount: e.target.value === '' ? 0 : Number(e.target.value) })}
              onFocus={(e) => e.target.select()}
            />
            <em>บาท</em>
          </div>
          <button
            type="button"
            className="btn ghost icon"
            aria-label={`ลบ ${x.name}`}
            onClick={() => onChange(value.filter((_, j) => j !== i))}
          >
            ✕
          </button>
        </div>
      ))}
      <button type="button" className="link" onClick={() => onChange([...value, { name: '', amount: 0 }])}>
        + เพิ่มรายการ
      </button>
      <datalist id="extra-suggestions">
        {SUGGESTIONS.map((s) => (
          <option key={s} value={s} />
        ))}
      </datalist>
    </div>
  )
}
