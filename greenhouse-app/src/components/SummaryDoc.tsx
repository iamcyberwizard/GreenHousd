import { forwardRef } from 'react'
import type { Bill, Settings } from '../api'
import { dueDate, money, plain, thaiMonth } from '../format'

type Props = { bills: Bill[]; month: string; settings: Settings }

const MAX_EXTRA_COLUMNS = 3

/** Columns for extra charges: one per name, with any overflow folded into "อื่น ๆ". */
function extraColumns(bills: Bill[]) {
  const names = [...new Set(bills.flatMap((b) => b.extras.map((x) => x.name)))]
  if (names.length <= MAX_EXTRA_COLUMNS) return { named: names, rest: false }
  return { named: names.slice(0, MAX_EXTRA_COLUMNS - 1), rest: true }
}

/** One table with every room for the month — handy to post in a group chat as a single image. */
export const SummaryDoc = forwardRef<HTMLDivElement, Props>(({ bills, month, settings }, ref) => {
  const sum = bills.reduce((t, b) => t + b.total, 0)
  const cols = extraColumns(bills)
  const amountFor = (b: Bill, name: string) =>
    b.extras.filter((x) => x.name === name).reduce((t, x) => t + x.amount, 0)
  const restFor = (b: Bill) =>
    b.extras.filter((x) => !cols.named.includes(x.name)).reduce((t, x) => t + x.amount, 0)
  const cell = (n: number) => (n ? money(n) : '-')
  return (
    <div className="doc doc-wide" ref={ref}>
      <header className="doc-head">
        <div>
          <div className="doc-brand">{settings.dormName}</div>
          <div className="doc-muted">
            ค่าไฟหน่วยละ {plain(settings.electricRate)} บาท · ค่าน้ำเหมา {plain(settings.waterFlat)} บาท
          </div>
        </div>
        <div className="doc-title">
          <div>แจ้งค่าเช่า</div>
          <div className="doc-muted">ประจำเดือน {thaiMonth(month)}</div>
        </div>
      </header>

      <table className="doc-table doc-summary">
        <thead>
          <tr>
            <th>ห้อง</th>
            <th className="num">มิเตอร์ก่อน</th>
            <th className="num">มิเตอร์หลัง</th>
            <th className="num">หน่วย</th>
            <th className="num">ค่าไฟ</th>
            <th className="num">ค่าน้ำ</th>
            <th className="num">ค่าห้อง</th>
            {cols.named.map((n) => (
              <th key={n} className="num">{n}</th>
            ))}
            {cols.rest && <th className="num">อื่น ๆ</th>}
            <th className="num">รวม</th>
          </tr>
        </thead>
        <tbody>
          {bills.map((b) => (
            <tr key={b.room_id}>
              <td><strong>{b.room_number}</strong></td>
              <td className="num">{plain(b.meter_prev)}</td>
              <td className="num">{plain(b.meter_curr)}</td>
              <td className="num">{plain(b.units)}</td>
              <td className="num">{money(b.electric)}</td>
              <td className="num">{money(b.water)}</td>
              <td className="num">{money(b.rent)}</td>
              {cols.named.map((n) => (
                <td key={n} className="num">{cell(amountFor(b, n))}</td>
              ))}
              {cols.rest && <td className="num">{cell(restFor(b))}</td>}
              <td className="num"><strong>{money(b.total)}</strong></td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td colSpan={7 + cols.named.length + (cols.rest ? 1 : 0)}>รวมทุกห้อง</td>
            <td className="num">{money(sum)}</td>
          </tr>
        </tfoot>
      </table>

      <footer className="doc-foot">
        <div>
          กรุณาชำระภายในวันที่ <strong>{dueDate(month, settings.dueDay)}</strong>
        </div>
        {settings.paymentInfo && <div className="doc-pay">{settings.paymentInfo}</div>}
      </footer>
    </div>
  )
})
