export const THAI_MONTHS = [
  'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
  'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม',
]

export const money = (n: number) =>
  n.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export const plain = (n: number) => n.toLocaleString('th-TH', { maximumFractionDigits: 2 })

export const currentMonth = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

/** "2026-10" → "ตุลาคม 2569" */
export const thaiMonth = (month: string) => {
  const [y, m] = month.split('-').map(Number)
  return `${THAI_MONTHS[m - 1]} ${y + 543}`
}

/** Due date: the given day of the month after the billing month. */
export const dueDate = (month: string, day: number) => {
  const [y, m] = month.split('-').map(Number)
  const next = new Date(y, m, 1)
  const last = new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate()
  return `${Math.min(day, last)} ${THAI_MONTHS[next.getMonth()]} ${next.getFullYear() + 543}`
}

export const today = () => {
  const d = new Date()
  return `${d.getDate()} ${THAI_MONTHS[d.getMonth()]} ${d.getFullYear() + 543}`
}
