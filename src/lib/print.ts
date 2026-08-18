/**
 * Printing for thermal receipt printers, driven through the browser's own
 * print dialog. The document is written into a hidden iframe rather than the
 * page, so no `@media print` rule has to fight the POS layout and nothing the
 * cashier is looking at moves.
 */

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}

export function baht(n: number): string {
  return n.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

// Shared stylesheet for every slip. Monospace keeps the price column aligned
// on printers that ignore fractional character widths.
export function slipStyles(widthMm: number): string {
  return `
    @page { size: ${widthMm}mm auto; margin: 0; }
    * { box-sizing: border-box; }
    body {
      margin: 0; padding: 3mm;
      width: ${widthMm}mm;
      font-family: "TH Sarabun New", "IBM Plex Sans Thai", "Tahoma", monospace;
      font-size: ${widthMm >= 80 ? 12 : 11}px;
      line-height: 1.35; color: #000; background: #fff;
      -webkit-print-color-adjust: exact; print-color-adjust: exact;
    }
    .logo {
      display: block; margin: 0 auto 1mm;
      width: ${widthMm >= 80 ? 38 : 26}mm; max-width: 70%; height: auto;
      filter: grayscale(1) contrast(3);
    }
    .payqr {
      display: block; margin: 1.5mm auto; width: ${widthMm >= 80 ? 54 : 40}mm;
      max-width: 92%; height: auto; filter: grayscale(1) contrast(3);
    }
    .c { text-align: center; }
    .r { text-align: right; }
    .b { font-weight: 700; }
    .lg { font-size: ${widthMm >= 80 ? 16 : 14}px; }
    .xl { font-size: ${widthMm >= 80 ? 20 : 17}px; }
    .rule { border-top: 1px dashed #000; margin: 4px 0; }
    .row { display: flex; justify-content: space-between; gap: 6px; }
    .row > span:last-child { white-space: nowrap; }
    .opt { padding-left: 8px; font-size: 0.88em; }
    table { width: 100%; border-collapse: collapse; }
    td { vertical-align: top; padding: 1px 0; }
    td.q { width: 22px; }
    td.p { text-align: right; white-space: nowrap; }
    .qr { margin: 6px auto 2px; width: 40mm; }
    .qr svg { width: 100%; height: auto; display: block; }
  `
}

/**
 * Render `html` into a hidden iframe and open the print dialog on it.
 *
 * The iframe is kept alive until printing finishes — removing it while the
 * dialog is open cancels the job in Chrome and Safari alike.
 */
export function printSlip(html: string, widthMm = 58): void {
  const frame = document.createElement('iframe')
  frame.setAttribute('aria-hidden', 'true')
  Object.assign(frame.style, {
    position: 'fixed', right: '0', bottom: '0',
    width: '0', height: '0', border: '0', visibility: 'hidden',
  })
  document.body.appendChild(frame)

  const doc = frame.contentDocument
  const win = frame.contentWindow
  if (!doc || !win) { frame.remove(); return }

  doc.open()
  doc.write(
    `<!doctype html><html lang="th"><head><meta charset="utf-8">` +
    `<style>${slipStyles(widthMm)}</style></head><body>${html}</body></html>`,
  )
  doc.close()

  let cleaned = false
  const cleanup = () => {
    if (cleaned) return
    cleaned = true
    frame.remove()
  }
  win.addEventListener('afterprint', cleanup)

  const run = () => {
    win.focus()
    win.print()
    // Safari never fires afterprint from an iframe; sweep up regardless.
    setTimeout(cleanup, 60_000)
  }

  // Images and web fonts must be laid out before the dialog opens or the slip
  // prints half-empty.
  if (doc.readyState === 'complete') run()
  else win.addEventListener('load', run)
}
