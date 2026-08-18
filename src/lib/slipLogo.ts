'use client'

/**
 * The shop's logo, turned into something a thermal head can actually print.
 *
 * The head prints a dot or leaves paper: there is no grey. Sending it a
 * colour logo and hoping means the printer's own conversion decides, and it
 * decides badly — mid-tones become noise. So the conversion happens here,
 * once, where the result can be looked at.
 *
 * Artwork with flat black shapes survives this well. Photographs do not, and
 * nothing here can change that; the settings screen says so.
 */

// 58mm paper is 384 dots wide. Half of it reads as a mark at the head of a
// slip without eating the paper a busy shop pays for.
const LOGO_DOTS = 192

// Below this the pixel is dark enough to burn. Logos are usually flat black
// on white, so a single threshold beats dithering, which turns crisp edges
// into stipple.
const INK_THRESHOLD = 0.62

const cache = new Map<string, string | null>()

/**
 * Returns a base64 PNG — one bit per pixel in effect, already sized in
 * printer dots — or null when the image cannot be read.
 *
 * Cached per URL: a slip is printed far more often than a logo changes, and
 * every checkout would otherwise redraw the same canvas.
 */
export async function logoForPrinting(url: string, widthMm = 58): Promise<string | null> {
  if (!url) return null
  const key = `${url}@${widthMm}`
  const hit = cache.get(key)
  if (hit !== undefined) return hit

  const result = await convert(url, widthMm).catch(() => null)
  cache.set(key, result)
  return result
}

async function convert(url: string, widthMm: number): Promise<string | null> {
  const img = await loadImage(url)
  const maxDots = widthMm >= 80 ? 288 : LOGO_DOTS
  const w = Math.min(maxDots, img.naturalWidth || maxDots)
  const h = Math.max(1, Math.round((img.naturalHeight / img.naturalWidth) * w))

  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  if (!ctx) return null

  // A transparent PNG over black paper would invert; put it on white first.
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
    // logo is served from Supabase rather than our own origin.
    img.crossOrigin = 'anonymous'
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('logo failed to load'))
    img.src = url
  })
}
