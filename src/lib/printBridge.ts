/**
 * One entry point for printing, two possible destinations.
 *
 * On a Sunmi handheld the wrapper app injects `window.SunmiPrinter`, and the
 * job goes straight to the built-in head — no dialog, no paper-size guessing.
 * Everywhere else (a desktop browser at the back office, a tablet on a
 * network printer) nothing changes: the existing hidden-iframe dialog runs.
 *
 * The HTML is passed as a thunk so the fallback markup is never built on the
 * handheld, where it would be thrown away.
 */

import { printSlip } from './print'
import type { PrintJob } from './printJob'

// The wrapper answers a JSON status: {code, name, label, canPrint}. `canPrint`
// means the slip came out.
//
// Two older shapes still have to be understood, because an APK in the field
// updates on the shop's schedule and not ours: builds that answered the bare
// string 'ok' | 'no-printer' | 'error', and the first build, which returned
// undefined because it had no way to report a failure at all. Undefined is
// read as success — assuming failure there would cry wolf on every sale.
type NativePrinter = { print(job: string): string | void }

function nativeSucceeded(result: string | void): boolean {
  if (result === undefined || result === 'ok') return true
  try {
    const status = JSON.parse(result) as { canPrint?: boolean; label?: string }
    if (status.canPrint) return true
    // The device raises its own alert naming the cause; logging keeps it in
    // remote console traces too.
    console.warn('printer refused the slip:', status.label ?? result)
    return false
  } catch {
    console.warn('printer refused the slip:', result)
    return false
  }
}

declare global {
  interface Window {
    SunmiPrinter?: NativePrinter
  }
}

export function hasNativePrinter(): boolean {
  return typeof window !== 'undefined' && typeof window.SunmiPrinter?.print === 'function'
}

export type PrintOutcome = 'native' | 'dialog'

/**
 * Returns how the slip was actually printed, so a caller can tell the cashier
 * when it did not go to the head. A receipt that silently failed looks exactly
 * like one that worked, and the shop finds out when the customer asks.
 */
export function printSlipJob(job: PrintJob, html: () => string): PrintOutcome {
  if (hasNativePrinter()) {
    try {
      if (nativeSucceeded(window.SunmiPrinter!.print(JSON.stringify(job)))) return 'native'
    } catch (err) {
      // A dead printer service must not cost the cashier the slip: fall through
      // to the dialog rather than swallowing the print.
      console.error('native print failed, falling back to the browser dialog', err)
    }
  }
  printSlip(html(), job.widthMm)
  return 'dialog'
}
