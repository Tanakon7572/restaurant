import { it, expect } from 'vitest'
import { stillTracking } from './orderTracking'

// 07:00 Bangkok on the 21st
const now = new Date('2026-07-21T00:00:00Z')

it('keeps showing an unpaid order from today', () => {
  expect(stillTracking({ paid: false, createdAt: '2026-07-20T23:00:00Z' }, now)).toBe(true)
})

it('stops showing an order once the bill is settled', () => {
  expect(stillTracking({ paid: true, createdAt: '2026-07-20T23:00:00Z' }, now)).toBe(false)
})

it('stops showing an unpaid order left over from a previous day', () => {
  expect(stillTracking({ paid: false, createdAt: '2026-07-19T10:00:00Z' }, now)).toBe(false)
})

it('counts a late-night order as belonging to the Bangkok day it was taken on', () => {
  // 18:00Z on the 20th is 01:00 on the 21st in Bangkok — same day as `now`.
  expect(stillTracking({ paid: false, createdAt: '2026-07-20T18:00:00Z' }, now)).toBe(true)
  // 16:00Z on the 20th is 23:00 on the 20th — the previous day.
  expect(stillTracking({ paid: false, createdAt: '2026-07-20T16:00:00Z' }, now)).toBe(false)
})

it('keeps an order with no timestamp rather than dropping it on a guess', () => {
  expect(stillTracking({ paid: false }, now)).toBe(true)
})
