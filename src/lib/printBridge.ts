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

type NativePrinter = { print(job: string): void }

declare global {
  interface Window {
    SunmiPrinter?: NativePrinter
  }
}

export function hasNativePrinter(): boolean {
  return typeof window !== 'undefined' && typeof window.SunmiPrinter?.print === 'function'
}

export function printSlipJob(job: PrintJob, html: () => string): void {
  if (hasNativePrinter()) {
    try {
      window.SunmiPrinter!.print(JSON.stringify(job))
      return
    } catch (err) {
      // A dead printer service must not cost the cashier the slip: fall through
      // to the dialog rather than swallowing the print.
      console.error('native print failed, falling back to the browser dialog', err)
    }
  }
  printSlip(html(), job.widthMm)
}
