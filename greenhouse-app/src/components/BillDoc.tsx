import { forwardRef } from 'react'
import type { Bill, Settings } from '../api'
import { dueDate, money, plain, thaiMonth, today } from '../format'

type Props = { bill: Bill; settings: Settings }

/** Printable bill for one room. Fixed width so PDF/JPG output looks the same on every device. */
export const BillDoc = forwardRef<HTMLDivElement, Props>(({ bill, settings }, ref) => (
  <div className="doc" ref={ref}>
    <header className="doc-head">
      <div>
        <div className="doc-brand">{settings.dormName}</div>
        {settings.address && <div className="doc-muted">{settings.address}</div>}
        {settings.phone && <div className="doc-muted">โทร {settings.phone}</div>}
      </div>
      <div className="doc-title">
        <div>ใบแจ้งค่าเช่า</div>
        <div className="doc-muted">ออกวันที่ {today()}</div>
      </div>
    </header>

    <div className="doc-meta">
      <div><span>ห้อง</span><strong>{bill.room_number}</strong></div>
      <div><span>ผู้เช่า</span><strong>{bill.tenant || '-'}</strong></div>
      <div><span>ประจำเดือน</span><strong>{thaiMonth(bill.month)}</strong></div>
    </div>

    <table className="doc-table">
      <thead>
        <tr>
          <th>รายการ</th>
          <th>รายละเอียด</th>
          <th className="num">จำนวนเงิน (บาท)</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td>ค่าเช่าห้อง</td>
          <td className="doc-muted">รายเดือน</td>
          <td className="num">{money(bill.rent)}</td>
        </tr>
        <tr>
          <td>ค่าไฟฟ้า</td>
          <td>
            <div className="doc-meter">
              มิเตอร์ {plain(bill.meter_prev)} → {plain(bill.meter_curr)}
            </div>
            <div className="doc-muted">
              {plain(bill.units)} หน่วย × {plain(bill.electric_rate)} บาท
            </div>
          </td>
          <td className="num">{money(bill.electric)}</td>
        </tr>
        <tr>
          <td>ค่าน้ำ</td>
          <td className="doc-muted">เหมาจ่ายรายเดือน</td>
          <td className="num">{money(bill.water)}</td>
        </tr>
        {bill.extras.map((x, i) => (
          <tr key={i}>
            <td>{x.name}</td>
            <td className="doc-muted" />
            <td className="num">{money(x.amount)}</td>
          </tr>
        ))}
      </tbody>
      <tfoot>
        <tr>
          <td colSpan={2}>รวมทั้งสิ้น</td>
          <td className="num">{money(bill.total)}</td>
        </tr>
      </tfoot>
    </table>

    <footer className="doc-foot">
      <div>
        กรุณาชำระภายในวันที่ <strong>{dueDate(bill.month, settings.dueDay)}</strong>
      </div>
      {settings.paymentInfo && <div className="doc-pay">{settings.paymentInfo}</div>}
      {bill.paid && <div className="doc-stamp">ชำระแล้ว</div>}
    </footer>
  </div>
))
