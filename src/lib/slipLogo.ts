'use client'

/**
 * Pictures, turned into something a thermal head can actually print.
 *
 * The head prints a dot or leaves paper: there is no grey. Sending it a
 * colour image and hoping means the printer's own conversion decides, and it
 * decides badly — mid-tones become noise. So the conversion happens here,
 * once, where the result can be looked at.
 *
 * Artwork with flat black shapes survives this well. Photographs do not, and
 * nothing here can change that; the settings screen says so.
 */

// 58mm of paper is 384 dots. A logo at half that reads as a mark without
// eating the roll a busy shop pays for.
const LOGO_DOTS_58 = 192
const LOGO_DOTS_80 = 288

// A payment QR is different: every module has to survive the threshold and
// then be found by a phone camera, so it gets nearly the whole width.
const PAY_QR_DOTS_58 = 320
const PAY_QR_DOTS_80 = 440

// Below this the pixel is dark enough to burn. Logos and QR codes are flat
// black on white, so a single threshold beats dithering, which turns crisp
// edges into stipple — and stipple is what stops a QR scanning.
const INK_THRESHOLD = 0.62

const cache = new Map<string, string | null>()

/**
 * Returns a base64 PNG — black and white only, already sized in printer dots
 * — or null when the image cannot be read.
 *
 * Cached per URL and size: a slip is printed far more often than a logo
 * changes, and every checkout would otherwise redraw the same canvas.
 */
export async function imageForPrinting(url: string, dots: number): Promise<string | null> {
  if (!url) return null
  const key = `${url}@${dots}`
  const hit = cache.get(key)
  if (hit !== undefined) return hit

  const result = await convert(url, dots).catch(() => null)
  cache.set(key, result)
  return result
}

export function logoDots(widthMm: number): number {
  return widthMm >= 80 ? LOGO_DOTS_80 : LOGO_DOTS_58
}

export function payQrDots(widthMm: number): number {
  return widthMm >= 80 ? PAY_QR_DOTS_80 : PAY_QR_DOTS_58
}

async function convert(url: string, dots: number): Promise<string | null> {
  const img = await loadImage(url)
  const w = Math.min(dots, img.naturalWidth || dots)
  const h = Math.max(1, Math.round((img.naturalHeight / img.naturalWidth) * w))

  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  if (!ctx) return null

  // A transparent PNG would otherwise pick up whatever the canvas started as.
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, w, h)
  ctx.drawImage(img, 0, 0, w, h)

  const data = ctx.getImageData(0, 0, w, h)
  const px = data.data
  for (let i = 0; i < px.length; i += 4) {
    // Rec. 601 luma: green carries most of what the eye reads as brightness.
    const lum = (px[i] * 0.299 + px[i + 1] * 0.587 + px[i + 2] * 0.114) / 255
    const ink = lum < INK_THRESHOLD ? 0 : 255
    px[i] = px[i + 1] = px[i + 2] = ink
    px[i + 3] = 255
  }
  ctx.putImageData(data, 0, 0)

  return canvas.toDataURL('image/png').replace(/^data:image\/png;base64,/, '')
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    // Reading pixels back off the canvas is blocked without this, and the
    // images are served from Supabase rather than our own origin.
    img.crossOrigin = 'anonymous'
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('image failed to load'))
    img.src = url
  })
}
