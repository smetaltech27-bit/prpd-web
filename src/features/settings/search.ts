import type { MaterialItem } from '../../types/domain'

export function matchesMasterSearch(item: MaterialItem, query: string, vendor = '') {
  const keyword = query.trim().toLocaleLowerCase()
  const matchesKeyword = !keyword || [item.itemFg, item.partName, item.spec, item.drawingNo, item.vendor, item.materialType, item.dimension]
    .some((value) => value.toLocaleLowerCase().includes(keyword))
  return matchesKeyword && (!vendor || item.vendor === vendor)
}

export function sortVendorNames(names: string[]) {
  return [...new Set(names.map((name) => name.trim()).filter(Boolean))]
    .sort((left, right) => left.localeCompare(right, ['th', 'en'], { sensitivity: 'base', numeric: true }))
}
