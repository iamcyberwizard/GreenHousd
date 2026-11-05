export type Extra = { name: string; amount: number }

export type Settings = {
  dormName: string
  address: string
  phone: string
  paymentInfo: string
  electricRate: number
  waterFlat: number
  dueDay: number
  /** Recurring charges (e.g. ค่าส่วนกลาง) prefilled into every new bill. */
  extraCharges: Extra[]
}

export type Room = {
  id: number
  number: string
  tenant: string
  rent: number
  meter_start: number
}

export type Bill = {
  id: number | null
  room_id: number
  room_number: string
  tenant: string
  month: string
  meter_prev: number
  meter_curr: number
  electric_rate: number
  water: number
  rent: number
  extras: Extra[]
  paid: boolean
  saved: boolean
  units: number
  electric: number
  total: number
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  })
  if (!res.ok) {
    const body = await res.json().catch(() => null)
    throw new Error(body?.error ?? `เกิดข้อผิดพลาด (${res.status})`)
  }
  return res.status === 204 ? (undefined as T) : res.json()
}

export const api = {
  getSettings: () => request<Settings>('/settings'),
  saveSettings: (s: Partial<Settings>) => request<Settings>('/settings', { method: 'PUT', body: JSON.stringify(s) }),

  getRooms: () => request<Room[]>('/rooms'),
  createRoom: (r: Omit<Room, 'id'>) => request<Room>('/rooms', { method: 'POST', body: JSON.stringify(r) }),
  updateRoom: (r: Room) => request<Room>(`/rooms/${r.id}`, { method: 'PUT', body: JSON.stringify(r) }),
  deleteRoom: (id: number) => request<void>(`/rooms/${id}`, { method: 'DELETE' }),

  getBills: (month: string) => request<Bill[]>(`/bills?month=${month}`),
  saveBill: (b: Partial<Bill>) => request<Bill>('/bills', { method: 'PUT', body: JSON.stringify(b) }),
  deleteBill: (id: number) => request<void>(`/bills/${id}`, { method: 'DELETE' }),
}
