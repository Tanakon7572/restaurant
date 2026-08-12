import { describe, it, expect } from 'vitest'
import { itemLines, type SlipItem } from './slipLines'

const plain: SlipItem = { itemName: 'ข้าวผัดกุ้ง', quantity: 2, price: 120 }

describe('itemLines', () => {
  it('emits one row per item with an extended price', () => {
    expect(itemLines([plain], true)).toEqual([
      { qty: '2×', name: 'ข้าวผัดกุ้ง', price: '240.00', indent: false },
    ])
  })

  it('drops the price column for kitchen tickets', () => {
    expect(itemLines([plain], false)).toEqual([
      { qty: '2×', name: 'ข้าวผัดกุ้ง', price: '', indent: false },
    ])
  })

  it('names a deleted menu item rather than printing a blank', () => {
    const gone: SlipItem = { itemName: '', quantity: 1, price: 50 }
    expect(itemLines([gone], true)[0].name).toBe('(ลบแล้ว)')
  })

  it('indents each chosen option under its item, priceless', () => {
    const withOption: SlipItem = {
      itemName: 'ชาเย็น', quantity: 1, price: 55,
      options: [{ groupName: 'ความหวาน', choiceName: 'หวานน้อย', priceDelta: 0 }],
    }
    expect(itemLines([withOption], true)).toEqual([
      { qty: '1×', name: 'ชาเย็น', price: '55.00', indent: false },
      { qty: '', name: '• หวานน้อย', price: '', indent: true },
    ])
  })

  it('prices each set part and reconciles when the parts do not sum to the set', () => {
    // Set sells for 150; parts are worth 100 + 80 = 180 on their own.
    const set: SlipItem = {
      itemName: 'เซ็ตคู่รัก', quantity: 1, price: 150,
      options: [
        { groupName: 'จานหลัก', choiceName: 'สเต๊กหมู', priceDelta: 0, unitPrice: 100 },
        { groupName: 'จานรอง', choiceName: 'สลัด', priceDelta: 0, unitPrice: 80 },
      ],
    }
    expect(itemLines([set], true)).toEqual([
      { qty: '1×', name: 'เซ็ตคู่รัก', price: '150.00', indent: false },
      { qty: '', name: '• สเต๊กหมู', price: '100.00', indent: true },
      { qty: '', name: '• สลัด', price: '80.00', indent: true },
      { qty: '', name: 'ราคาเซ็ต', price: '150.00', indent: true },
    ])
  })

  it('omits the reconciliation row when the parts already sum to the set price', () => {
    const set: SlipItem = {
      itemName: 'เซ็ตเดี่ยว', quantity: 1, price: 100,
      options: [{ groupName: 'จานหลัก', choiceName: 'ข้าวหมูกรอบ', priceDelta: 0, unitPrice: 100 }],
    }
    expect(itemLines([set], true).some(l => l.name === 'ราคาเซ็ต')).toBe(false)
  })

  it('carries a line note as its own indented row', () => {
    const noted: SlipItem = { itemName: 'ต้มยำ', quantity: 1, price: 90, note: 'ไม่ใส่ผักชี' }
    expect(itemLines([noted], true)[1]).toEqual({
      qty: '', name: '** ไม่ใส่ผักชี', price: '', indent: true,
    })
  })
})
