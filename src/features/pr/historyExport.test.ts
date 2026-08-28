import { describe, expect, it } from 'vitest'
import type { PrHistoryLine } from '../../services/prpdRepository'
import { buildHistoryWorkbook } from './historyExport'

const row: PrHistoryLine = {
  lineId: 'line-1', prId: 'pr-1', prNumber: 'PR-2608-0001', requestKind: 'raw_material',
  requestDate: '2026-08-28', vendorName: 'บริษัท & คู่ค้า', itemFg: 'TM<4207A', codeOrderRm: '912737',
  namePart: 'CLAMPING PLATE', materialType: 'SS400', spec: 'MM3', fgQty: 2, quantity: 3,
  unitPrice: 4400, dueDate: '2026-08-29', comment: 'ทดสอบ',
}

describe('history Excel export', () => {
  it('exports every displayed raw-material column and escapes spreadsheet XML', () => {
    const workbook = buildHistoryWorkbook([row], 'raw_material')
    expect(workbook).toContain('<Data ss:Type="String">Item FG</Data>')
    expect(workbook).toContain('<Data ss:Type="String">จำนวนผลิต</Data>')
    expect(workbook).toContain('บริษัท &amp; คู่ค้า')
    expect(workbook).toContain('TM&lt;4207A')
    expect(workbook).toContain('<Data ss:Type="Number">4400</Data>')
  })

  it('matches the equipment table by omitting raw-material-only columns', () => {
    const workbook = buildHistoryWorkbook([{ ...row, requestKind: 'factory_supply' }], 'factory_supply')
    expect(workbook).not.toContain('<Data ss:Type="String">Item FG</Data>')
    expect(workbook).not.toContain('<Data ss:Type="String">จำนวนผลิต</Data>')
    expect(workbook).toContain('<Data ss:Type="String">Code RM</Data>')
  })
})
