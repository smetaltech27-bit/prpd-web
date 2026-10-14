import { describe, expect, it } from 'vitest'
import type { MaterialItem } from '../../types/domain'
import { buildSettingsMasterWorkbook, settingsMasterExportFileName } from './masterExport'

const row: MaterialItem = {
  id: 'master-1', itemFg: 'FG<&001', partName: 'PART & NAME', spec: 'SPEC-A', drawingNo: 'DWG-1',
  orderCode: 'RM-001', vendor: 'VENDOR A', materialType: 'STEEL', dimension: '10 × 20 mm',
  unitPrice: 1250.5, usage: 3, comment: 'ตรวจสอบ', isActive: false,
}

describe('Settings master Excel export', () => {
  it('matches the displayed Raw Material table and preserves numeric cells', () => {
    const workbook = buildSettingsMasterWorkbook([row], 'raw')
    const headers = ['ITEM FG', 'PART', 'SPEC', 'DWG NO.', 'VENDOR', 'TYPE', 'DIMENSION', 'PRICE', 'USAGE', 'COMMENT', 'สถานะ']
    let previous = -1
    headers.forEach((header) => {
      const index = workbook.indexOf(`>${header}</Data>`)
      expect(index).toBeGreaterThan(previous)
      previous = index
    })
    expect(workbook).not.toContain('CODE RM</Data>')
    expect(workbook).toContain('FG&lt;&amp;001')
    expect(workbook).toContain('PART &amp; NAME')
    expect(workbook).toContain('<Data ss:Type="Number">1250.5</Data>')
    expect(workbook).toContain('<Data ss:Type="Number">3</Data>')
    expect(workbook).toContain('ปิดใช้งาน')
  })

  it('uses Code RM as the first Equipment column and displays blank values like the table', () => {
    const workbook = buildSettingsMasterWorkbook([{ ...row, partName: '', comment: undefined, isActive: true }], 'equipment')
    expect(workbook).toContain('<Data ss:Type="String">CODE RM</Data>')
    expect(workbook).not.toContain('ITEM FG</Data>')
    expect(workbook).toContain('<Data ss:Type="String">RM-001</Data>')
    expect(workbook).toContain('<Data ss:Type="String">—</Data>')
    expect(workbook).toContain('ใช้งานอยู่')
  })

  it('uses the Bangkok calendar date in downloaded file names', () => {
    const afterBangkokMidnight = Date.parse('2026-10-14T17:30:00.000Z')
    expect(settingsMasterExportFileName('raw', afterBangkokMidnight)).toBe('Settings-Raw-Material-2026-10-15.xls')
    expect(settingsMasterExportFileName('equipment', afterBangkokMidnight)).toBe('Settings-Factory-Supply-Equipment-2026-10-15.xls')
  })
})
