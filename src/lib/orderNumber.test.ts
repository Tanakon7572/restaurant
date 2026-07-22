import { it, expect } from 'vitest'
import { assignDailyNumbers, bangkokDayKey, bangkokDayStart } from './orderNumber'

it('assigns orders to the Bangkok day across the UTC-evening boundary', () => {
  // 16:30Z = 23:30 Bangkok (still the 21st); 17:30Z = 00:30 Bangkok (the 22nd)
  expect(bangkokDayKey(new Date('2026-07-21T16:30:00Z'))).toBe('2026-07-21')
  expect(bangkokDayKey(new Date('2026-07-21T17:30:00Z'))).toBe('2026-07-22')
})

it('numbers orders per Bangkok day by id, restarting at 1 each day', () => {
  const orders = [
    { id: 10, createdAt: '2026-07-21T04:00:00Z' }, // 11:00 BKK, 21st
    { id: 11, createdAt: '2026-07-21T05:00:00Z' }, // 21st
    { id: 12, createdAt: '2026-07-21T18:00:00Z' }, // 01:00 BKK, 22nd
    { id: 13, createdAt: '2026-07-21T19:00:00Z' }, // 22nd
  ]
  const map = assignDailyNumbers(orders)
  expect(map.get(10)).toBe(1)
  expect(map.get(11)).toBe(2)
  expect(map.get(12)).toBe(1) // new day resets the count
  expect(map.get(13)).toBe(2)
})

it('ranks by id, not insertion order', () => {
  const map = assignDailyNumbers([
    { id: 30, createdAt: '2026-07-21T04:00:00Z' },
    { id: 20, createdAt: '2026-07-21T05:00:00Z' },
  ])
  expect(map.get(20)).toBe(1)
  expect(map.get(30)).toBe(2)
})

it('bangkokDayStart returns the UTC instant of local midnight', () => {
  const start = bangkokDayStart(new Date('2026-07-21T18:00:00Z')) // 01:00 BKK, 22nd
  expect(start.toISOString()).toBe('2026-07-21T17:00:00.000Z')    // 00:00 BKK, 22nd
})
