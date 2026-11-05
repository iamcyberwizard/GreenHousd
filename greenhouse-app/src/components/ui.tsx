import { useEffect, useState, type ReactNode, type RefObject } from 'react'
import { canShareFiles, exportJpg, exportPdf, shareJpg } from '../exporter'

export function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [onClose])

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" role="dialog" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>{title}</h2>
          <button className="btn ghost icon" onClick={onClose} aria-label="ปิด">✕</button>
        </div>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  )
}

/** PDF / JPG / share buttons for a rendered document node. */
export function ExportBar({ target, filename }: { target: RefObject<HTMLDivElement | null>; filename: string }) {
  const [busy, setBusy] = useState<string | null>(null)
  const run = (kind: string, fn: (n: HTMLElement, f: string) => Promise<unknown>) => async () => {
    if (!target.current) return
    setBusy(kind)
    try {
      await fn(target.current, filename)
    } finally {
      setBusy(null)
    }
  }
  return (
    <div className="export-bar">
      <button className="btn" disabled={!!busy} onClick={run('pdf', exportPdf)}>
        {busy === 'pdf' ? 'กำลังสร้าง…' : 'ดาวน์โหลด PDF'}
      </button>
      <button className="btn" disabled={!!busy} onClick={run('jpg', exportJpg)}>
        {busy === 'jpg' ? 'กำลังสร้าง…' : 'ดาวน์โหลด JPG'}
      </button>
      {canShareFiles() && (
        <button className="btn primary" disabled={!!busy} onClick={run('share', shareJpg)}>
          {busy === 'share' ? 'กำลังสร้าง…' : 'แชร์รูปภาพ'}
        </button>
      )}
    </div>
  )
}

export function NumberField({
  label,
  value,
  onChange,
  step = 'any',
  suffix,
}: {
  label: string
  value: number
  onChange: (n: number) => void
  step?: string
  suffix?: string
}) {
  return (
    <label className="field">
      <span>{label}</span>
      <div className="input-wrap">
        <input
          type="number"
          inputMode="decimal"
          step={step}
          value={Number.isFinite(value) ? value : ''}
          onChange={(e) => onChange(e.target.value === '' ? 0 : Number(e.target.value))}
          onFocus={(e) => e.target.select()}
        />
        {suffix && <em>{suffix}</em>}
      </div>
    </label>
  )
}
