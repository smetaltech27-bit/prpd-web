import { describe, expect, it } from 'vitest'
import { calculateOrderQuantity, createRawMaterialLines } from './legacyFlow'

describe('legacy raw-material flow', () => {
  it('calculates order quantity with the legacy ceil(production / usage) rule', () => {
    expect(calculateOrderQuantity(131, 75)).toBe(2)
    expect(calculateOrderQuantity(75, 75)).toBe(1)
    expect(calculateOrderQuantity(5, 0)).toBe(5)
  })

  it('keeps every matching vendor row', () => {
    const base = { itemFg: 'TM4207A', partName: 'ARM A', spec: 'AL400', drawingNo: 'MT1', orderCode: '912612', materialType: 'BRASS', dimension: '', unitPrice: 100, usage: 75 }
    const lines = createRawMaterialLines([
      { ...base, id: '1', vendor: 'Vendor A' },
      { ...base, id: '2', vendor: 'Vendor B' },
    ], 150, '2026-08-30', (item) => item.id)
    expect(lines).toHaveLength(2)
    expect(lines.map((line) => line.vendor)).toEqual(['Vendor A', 'Vendor B'])
    expect(lines.map((line) => line.quantity)).toEqual([2, 2])
  })
})
