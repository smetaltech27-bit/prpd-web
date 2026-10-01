import { describe, expect, it } from 'vitest'
import type { MaterialItem } from '../types/domain'
import { matchesMasterSearch, sortVendorNames } from '../features/settings/search'

const item: MaterialItem = {
  id: '1',
  itemFg: 'TM4207A',
  partName: 'ARMA',
  spec: 'AL400',
  drawingNo: 'MT524685A',
  orderCode: 'RM-0042',
  vendor: 'วิริกิจกรรม 207',
  materialType: 'BRASS BAR',
  dimension: '20mm x 60mm',
  unitPrice: 5250,
  usage: 75,
  comment: '',
}

describe('Settings search helpers', () => {
  it('searches across master-data fields and applies an exact vendor filter', () => {
    expect(matchesMasterSearch(item, 'mt524')).toBe(true)
    expect(matchesMasterSearch(item, 'brass')).toBe(true)
    expect(matchesMasterSearch(item, 'arma', 'วิริกิจกรรม 207')).toBe(true)
    expect(matchesMasterSearch(item, 'arma', 'JSR ENTECH 104')).toBe(false)
  })

  it('searches partial Code RM and preserves the vendor filter', () => {
    expect(matchesMasterSearch(item, ' rm-004 ')).toBe(true)
    expect(matchesMasterSearch(item, 'RM-0042', item.vendor)).toBe(true)
    expect(matchesMasterSearch(item, 'RM-0042', 'OTHER VENDOR')).toBe(false)
    expect(matchesMasterSearch({ ...item, orderCode: '' }, 'RM-0042')).toBe(false)
  })

  it('trims, deduplicates, and sorts vendor names alphabetically', () => {
    expect(sortVendorNames(['Zeta', ' Alpha ', 'Beta', 'Alpha'])).toEqual(['Alpha', 'Beta', 'Zeta'])
  })
})
