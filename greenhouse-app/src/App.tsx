import { useEffect, useState } from 'react'
import { api, type Settings } from './api'
import { BillsPage } from './pages/BillsPage'
import { RoomsPage } from './pages/RoomsPage'
import { SettingsPage } from './pages/SettingsPage'

const TABS = [
  { id: 'bills', label: 'บิลค่าเช่า' },
  { id: 'rooms', label: 'ห้องพัก' },
  { id: 'settings', label: 'ตั้งค่า' },
] as const
type Tab = (typeof TABS)[number]['id']

const tabFromHash = (): Tab => {
  const h = location.hash.slice(1)
  return TABS.some((t) => t.id === h) ? (h as Tab) : 'bills'
}

export default function App() {
  const [tab, setTab] = useState<Tab>(tabFromHash)
  const [settings, setSettings] = useState<Settings | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    api.getSettings().then(setSettings).catch((e) => setError(e.message))
    const onHash = () => setTab(tabFromHash())
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="leaf" aria-hidden>●</span> {settings?.dormName ?? 'Green House'}
        </div>
        <nav className="tabs">
          {TABS.map((t) => (
            <a key={t.id} href={`#${t.id}`} className={tab === t.id ? 'active' : ''}>
              {t.label}
            </a>
          ))}
        </nav>
      </header>

      <main>
        {error && <div className="alert">เชื่อมต่อเซิร์ฟเวอร์ไม่ได้: {error}</div>}
        {settings && tab === 'bills' && <BillsPage settings={settings} />}
        {tab === 'rooms' && <RoomsPage />}
        {settings && tab === 'settings' && <SettingsPage settings={settings} onSaved={setSettings} />}
      </main>
    </div>
  )
}
