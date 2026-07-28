export type Candidate = { id: number; name: string; price: number }

export type TokenMatch = {
  token: string
  match: Candidate | null
  // How it was found, so the preview can flag the shakier ones for a human.
  how: 'exact' | 'prefix' | 'loose' | 'partial' | null
}

/**
 * Split a menu name that already reads as a set — "วนิลลา+ฝอยทอง+มาร์ชเมลโล่" —
 * into its parts. Both the plain and the spaced form appear in real menus, so
 * separators are taken loosely.
 */
export function parseSetName(name: string): string[] {
  return name
    .split(/[+＋]/)
    .map(t => t.trim())
    .filter(Boolean)
}

// Whitespace and the zero-width characters that survive copy-paste.
function normalize(s: string): string {
  return s.replace(/[\s​-‍﻿]/g, '').toLowerCase()
}

/**
 * Strip Thai vowels and tone marks. Menus spell the same ingredient several
 * ways — วนิลลา / วานิลลา, มาร์ชเมลโล่ / มาร์ชเมลโลว์ — and the consonant skeleton
 * is what survives those differences.
 */
function loose(s: string): string {
  return normalize(s).replace(/[ะ-ฺ็-๎]/g, '')
}

// Words that describe the base rather than name it, so a filling written
// bare still finds the crust it belongs to.
const PREFIXES = ['แป้ง']

function stripPrefix(s: string): string {
  const n = normalize(s)
  for (const p of PREFIXES) {
    if (n.startsWith(normalize(p)) && n.length > normalize(p).length) {
      return n.slice(normalize(p).length)
    }
  }
  return n
}

/**
 * Find the menu item a token refers to, trying progressively looser rules and
 * reporting which one hit. Anything below `exact` is worth a human glance,
 * which is why the caller shows a preview rather than converting outright.
 */
export function matchToken(token: string, candidates: Candidate[]): TokenMatch {
  const t = normalize(token)
  const exact = candidates.find(c => normalize(c.name) === t)
  if (exact) return { token, match: exact, how: 'exact' }

  const tp = stripPrefix(token)
  const byPrefix = candidates.find(c => stripPrefix(c.name) === tp)
  if (byPrefix) return { token, match: byPrefix, how: 'prefix' }

  const tl = loose(stripPrefix(token))
  if (tl.length > 0) {
    const byLoose = candidates.find(c => loose(stripPrefix(c.name)) === tl)
    if (byLoose) return { token, match: byLoose, how: 'loose' }

    // Last resort: one name contains the other. Guarded by a length floor so
    // a two-letter token can't latch onto half the menu, and taken only when
    // exactly one candidate qualifies — several means it's a guess.
    if (tl.length >= 3) {
      const hits = candidates.filter(c => {
        const cl = loose(stripPrefix(c.name))
        return cl.length >= 3 && (cl.includes(tl) || tl.includes(cl))
      })
      if (hits.length === 1) return { token, match: hits[0], how: 'partial' }
    }
  }

  return { token, match: null, how: null }
}

export type SetPlan = {
  itemId: number
  name: string
  parts: TokenMatch[]
  // Every token resolved — only these are safe to convert unattended.
  complete: boolean
}

/**
 * Work out what each "a+b+c" item would become as a set, without changing
 * anything. Items whose name has no separator are left out: they are ordinary
 * menu items, not sets written longhand.
 */
export function planConversion(
  items: { id: number; name: string }[],
  candidates: Candidate[],
): SetPlan[] {
  const plans: SetPlan[] = []
  for (const item of items) {
    const tokens = parseSetName(item.name)
    if (tokens.length < 2) continue
    // An item can't be a part of itself, and no set may contain another set.
    const pool = candidates.filter(c => c.id !== item.id && parseSetName(c.name).length < 2)
    const parts = tokens.map(t => matchToken(t, pool))
    plans.push({
      itemId: item.id,
      name: item.name,
      parts,
      complete: parts.every(p => p.match !== null),
    })
  }
  return plans
}
