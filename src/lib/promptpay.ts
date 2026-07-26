/**
 * PromptPay QR payload (EMVCo merchant-presented QR).
 *
 * The string this returns is what goes inside the QR image — every Thai
 * banking app reads it. No network call and no third-party library is
 * involved, so the till keeps working when the internet is down.
 */

// EMVCo fields are length-prefixed: two-digit tag, two-digit length, value.
function tlv(tag: string, value: string): string {
  return tag + String(value.length).padStart(2, '0') + value
}

/**
 * Normalise a PromptPay id to its 13-digit QR form.
 *  - mobile 0812345678        → 0066812345678  (tag 01)
 *  - national/tax id 13 digits → as-is          (tag 02)
 * Returns null when the input is neither, so callers can hide the QR rather
 * than print one that no app will scan.
 */
export function normalizePromptPayId(raw: string): { tag: '01' | '02'; value: string } | null {
  const digits = raw.replace(/\D/g, '')
  if (digits.length === 13) return { tag: '02', value: digits }
  // Accept 0812345678, 66812345678 and +66812345678 alike.
  const local = digits.startsWith('66') ? digits.slice(2) : digits.replace(/^0/, '')
  if (local.length === 9) return { tag: '01', value: `0066${local}` }
  return null
}

// CRC-16/CCITT-FALSE — the checksum EMVCo specifies for tag 63.
export function crc16(input: string): string {
  let crc = 0xffff
  for (let i = 0; i < input.length; i++) {
    crc ^= input.charCodeAt(i) << 8
    for (let bit = 0; bit < 8; bit++) {
      crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, '0')
}

/**
 * Build the payload. Passing an amount makes the QR single-use ("dynamic"),
 * which is what a bill wants — the customer cannot pay the wrong figure.
 */
export function promptPayPayload(id: string, amount?: number): string | null {
  const target = normalizePromptPayId(id)
  if (!target) return null

  const hasAmount = typeof amount === 'number' && isFinite(amount) && amount > 0
  const merchant = tlv('00', 'A000000677010111') + tlv(target.tag, target.value)

  const body =
    tlv('00', '01') +
    tlv('01', hasAmount ? '12' : '11') +
    tlv('29', merchant) +
    tlv('53', '764') +
    (hasAmount ? tlv('54', amount.toFixed(2)) : '') +
    tlv('58', 'TH')

  // The checksum covers the payload including tag 63 and its length.
  const withCrcTag = `${body}6304`
  return withCrcTag + crc16(withCrcTag)
}
