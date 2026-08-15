'use client'

import { useEffect, useState } from 'react'

/**
 * How many customer requests are waiting for someone to say yes, and a sound
 * the moment another one lands.
 *
 * `awaiting` is the only status a customer can create — a QR order sits there
 * until staff confirm it. `pending` is what staff make themselves at the till,
 * so it is rarely zero during service and a badge counting it would be lit all
 * day, which is the same as no badge at all.
 *
 * One poller for the whole page, not one per component. The desktop rail
 * renders the mobile bar inside itself, so a hook that polled on its own would
 * run twice and ring twice for a single order.
 */

const POLL_MS = 15_000
const MUTE_KEY = 'pos.orderChime.muted'

const muteListeners = new Set<() => void>()

export function chimeMuted(): boolean {
  if (typeof localStorage === 'undefined') return false
  return localStorage.getItem(MUTE_KEY) === '1'
}

export function setChimeMuted(muted: boolean) {
  localStorage.setItem(MUTE_KEY, muted ? '1' : '0')
  muteListeners.forEach(fn => fn())
}

/**
 * For `useSyncExternalStore`. The setting lives in localStorage, which does
 * not exist during the server render, so React has to be told when to read it
 * rather than being handed a value at render time.
 */
export function subscribeChimeMuted(fn: () => void): () => void {
  muteListeners.add(fn)
  return () => { muteListeners.delete(fn) }
}

/**
 * Two short rising notes, synthesised rather than loaded.
 *
 * A sound file would be one more asset to bundle into the APK and keep in step
 * with the deployment; an oscillator is a few lines and needs no network at
 * all, which matters on a handheld carried to the back of a shop.
 */
export function playChime() {
  const Ctor = window.AudioContext ?? (window as unknown as {
    webkitAudioContext?: typeof AudioContext
  }).webkitAudioContext
  if (!Ctor) return

  try {
    const ctx = new Ctor()
    const at = ctx.currentTime
    // Two notes a fifth apart read as a signal rather than an error tone, and
    // carry across a kitchen without being shrill.
    ;[
      { freq: 880, start: 0 },
      { freq: 1318.5, start: 0.14 },
    ].forEach(({ freq, start }) => {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'sine'
      osc.frequency.value = freq
      // Starting and stopping a sine wave at full amplitude clicks.
      gain.gain.setValueAtTime(0, at + start)
      gain.gain.linearRampToValueAtTime(0.22, at + start + 0.02)
      gain.gain.exponentialRampToValueAtTime(0.0001, at + start + 0.32)
      osc.connect(gain).connect(ctx.destination)
      osc.start(at + start)
      osc.stop(at + start + 0.34)
    })
    // Audio contexts are a limited resource; a shift's worth of orders would
    // exhaust them if each one leaked.
    setTimeout(() => { void ctx.close() }, 800)
  } catch {
    // A device that refuses audio still gets the badge.
  }
}

// — the single shared poller —

let count = 0
// Nothing rings on the first answer: opening the till with three requests
// already queued is not three new arrivals.
let known: number | null = null
let timer: ReturnType<typeof setInterval> | null = null
const listeners = new Set<(n: number) => void>()

async function poll() {
  try {
    const res = await fetch('/api/orders/incoming', { cache: 'no-store' })
    if (!res.ok) return
    const data = await res.json() as { awaiting?: number }
    const next = typeof data.awaiting === 'number' ? data.awaiting : 0

    const previous = known
    known = next
    if (next !== count) {
      count = next
      listeners.forEach(fn => fn(count))
    }
    // Only a rise means a new request. A drop is staff confirming one.
    if (previous !== null && next > previous && !chimeMuted()) playChime()
  } catch {
    // Offline is normal on a handheld; the next tick tries again.
  }
}

function onVisible() {
  if (document.visibilityState === 'visible') void poll()
}

function subscribe(fn: (n: number) => void): () => void {
  listeners.add(fn)
  if (listeners.size === 1) {
    void poll()
    timer = setInterval(poll, POLL_MS)
    // A backgrounded tab stops its timers, so the count can be minutes stale
    // by the time someone looks at it again.
    document.addEventListener('visibilitychange', onVisible)
  }
  return () => {
    listeners.delete(fn)
    if (listeners.size === 0) {
      if (timer) clearInterval(timer)
      timer = null
      document.removeEventListener('visibilitychange', onVisible)
      // The next mount is a fresh page for the staff too, so it should not
      // ring for requests that were already on screen before.
      known = null
    }
  }
}

export function useIncomingOrders(): number {
  const [n, setN] = useState(count)
  useEffect(() => subscribe(setN), [])
  return n
}
