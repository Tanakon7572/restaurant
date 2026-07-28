import { it, expect } from 'vitest'
import { parseSetName, matchToken, planConversion, type Candidate } from './setNameMatch'

const pool: Candidate[] = [
  { id: 1, name: 'แป้งวานิลลา', price: 40 },
  { id: 2, name: 'ฝอยทอง', price: 10 },
  { id: 3, name: 'มาร์ชเมลโลว์', price: 5 },
  { id: 4, name: 'กล้วย', price: 10 },
  { id: 5, name: 'นูเทลล่า', price: 15 },
  { id: 6, name: 'แป้งชาเขียว', price: 45 },
]

it('splits a set-style name on its separators', () => {
  expect(parseSetName('วนิลลา+ฝอยทอง+มาร์ชเมลโล่'))
    .toEqual(['วนิลลา', 'ฝอยทอง', 'มาร์ชเมลโล่'])
  expect(parseSetName('นูเทลล่า + กล้วย')).toEqual(['นูเทลล่า', 'กล้วย'])
})

it('leaves an ordinary name as a single token', () => {
  expect(parseSetName('ผักโขม')).toEqual(['ผักโขม'])
})

it('matches a name written exactly', () => {
  const m = matchToken('ฝอยทอง', pool)
  expect(m.match?.id).toBe(2)
  expect(m.how).toBe('exact')
})

it('matches a crust written without its แป้ง prefix', () => {
  const m = matchToken('ชาเขียว', pool)
  expect(m.match?.id).toBe(6)
  expect(m.how).toBe('prefix')
})

it('matches across Thai spelling variants', () => {
  // วนิลลา vs วานิลลา — the missing sara-a is the whole difference.
  const m = matchToken('วนิลลา', pool)
  expect(m.match?.id).toBe(1)
  expect(m.how).toBe('loose')
})

it('matches a name that differs by a trailing letter', () => {
  // มาร์ชเมลโล่ vs มาร์ชเมลโลว์
  const m = matchToken('มาร์ชเมลโล่', pool)
  expect(m.match?.id).toBe(3)
  expect(m.how).toBe('partial')
})

it('reports no match rather than guessing', () => {
  const m = matchToken('ทุเรียน', pool)
  expect(m.match).toBeNull()
  expect(m.how).toBeNull()
})

it('refuses a partial match when several candidates would fit', () => {
  const ambiguous: Candidate[] = [
    { id: 10, name: 'ชาเขียวมัทฉะ', price: 20 },
    { id: 11, name: 'ชาเขียวนม', price: 25 },
  ]
  expect(matchToken('ชาเขียว', ambiguous).match).toBeNull()
})

it('plans every multi-part item and flags the incomplete ones', () => {
  const plans = planConversion(
    [
      { id: 100, name: 'วนิลลา+ฝอยทอง' },
      { id: 101, name: 'นูเทลล่า+ทุเรียน' },
      { id: 102, name: 'ผักโขม' },
    ],
    pool,
  )
  expect(plans.map(p => p.itemId)).toEqual([100, 101])
  expect(plans[0].complete).toBe(true)
  expect(plans[1].complete).toBe(false)
  expect(plans[1].parts[1].match).toBeNull()
})

it('never makes an item a part of itself', () => {
  const withSelf = [...pool, { id: 100, name: 'ฝอยทอง+ฝอยทอง', price: 20 }]
  const plans = planConversion([{ id: 100, name: 'ฝอยทอง+ฝอยทอง' }], withSelf)
  expect(plans[0].parts.every(p => p.match?.id !== 100)).toBe(true)
})

it('never nests one set inside another', () => {
  // A candidate whose own name has separators is a set, not an ingredient.
  const withSet = [...pool, { id: 200, name: 'กล้วย+อัลมอนด์', price: 30 }]
  const plans = planConversion([{ id: 300, name: 'นูเทลล่า+กล้วย' }], withSet)
  expect(plans[0].parts.every(p => p.match?.id !== 200)).toBe(true)
  expect(plans[0].complete).toBe(true)
})
