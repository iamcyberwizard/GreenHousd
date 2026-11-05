async function capture(node: HTMLElement) {
  await document.fonts.ready
  const { toCanvas } = await import('html-to-image')
  return toCanvas(node, { pixelRatio: 2, backgroundColor: '#ffffff', cacheBust: true, style: { margin: '0' } })
}

function download(href: string, filename: string) {
  const a = document.createElement('a')
  a.href = href
  a.download = filename
  a.click()
}

export async function exportJpg(node: HTMLElement, filename: string) {
  const canvas = await capture(node)
  download(canvas.toDataURL('image/jpeg', 0.92), `${filename}.jpg`)
}

export async function exportPdf(node: HTMLElement, filename: string) {
  const [canvas, { jsPDF }] = await Promise.all([capture(node), import('jspdf')])
  const img = canvas.toDataURL('image/jpeg', 0.95)
  const margin = 10
  const width = 210 - margin * 2
  const height = (canvas.height / canvas.width) * width
  // A4 when it fits, otherwise one tall page so a long summary table is never cut.
  const pageHeight = Math.max(297, height + margin * 2)
  const pdf = new jsPDF({ unit: 'mm', format: [210, pageHeight] })
  pdf.addImage(img, 'JPEG', margin, margin, width, height)
  pdf.save(`${filename}.pdf`)
}

/** Share as an image via the OS share sheet (e.g. LINE on mobile). Returns false if unsupported. */
export async function shareJpg(node: HTMLElement, filename: string) {
  const canvas = await capture(node)
  const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/jpeg', 0.92))
  if (!blob) return false
  const file = new File([blob], `${filename}.jpg`, { type: 'image/jpeg' })
  if (!navigator.canShare?.({ files: [file] })) return false
  try {
    await navigator.share({ files: [file], title: filename })
  } catch {
    // user cancelled the share sheet
  }
  return true
}

export const canShareFiles = () =>
  typeof navigator.canShare === 'function' &&
  navigator.canShare({ files: [new File([''], 'x.jpg', { type: 'image/jpeg' })] })
