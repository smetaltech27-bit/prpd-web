import { formatPrNumber } from './prNumber'
import type { PrNumberOptions } from './prNumber'
import type { PrLineItem, PrPage, PrVendorGroup, PrVendorPlan } from './types'

export const PR_ITEMS_PER_PAGE = 16

function normalizedVendor(vendor: string): string {
  const value = vendor.trim()
  return value || 'UNASSIGNED VENDOR'
}

/** Groups rows by vendor while preserving vendor and row insertion order. */
export function groupItemsByVendor(items: readonly PrLineItem[]): PrVendorGroup[] {
  const groups = new Map<string, PrVendorGroup>()

  items.forEach((item) => {
    const vendor = normalizedVendor(item.vendor)
    const existing = groups.get(vendor)
    if (existing) {
      existing.items.push(item)
      return
    }
    groups.set(vendor, { vendor, items: [item] })
  })

  return [...groups.values()]
}

/**
 * Creates fixed 16-row A4 pages. Empty input intentionally yields no page, so
 * callers cannot print an empty PR by accident.
 */
export function paginateVendorItems<T>(
  vendor: string,
  items: readonly T[],
  itemsPerPage = PR_ITEMS_PER_PAGE,
): PrPage<T>[] {
  if (!Number.isInteger(itemsPerPage) || itemsPerPage < 1) {
    throw new RangeError('itemsPerPage must be a positive integer')
  }
  if (items.length === 0) return []

  const totalPages = Math.ceil(items.length / itemsPerPage)
  return Array.from({ length: totalPages }, (_, pageIndex) => {
    const start = pageIndex * itemsPerPage
    const pageItems = items.slice(start, start + itemsPerPage)
    const emptyRows = Array.from<null>({ length: itemsPerPage - pageItems.length }).fill(null)
    const isFinalPage = pageIndex === totalPages - 1

    return {
      vendor,
      pageNumber: pageIndex + 1,
      totalPages,
      rows: [...pageItems, ...emptyRows],
      actualItemCount: pageItems.length,
      isFinalPage,
      showSignatures: isFinalPage,
      continuation: !isFinalPage,
    }
  })
}

export function buildPrPages(items: readonly PrLineItem[]): PrPage<PrLineItem>[] {
  return groupItemsByVendor(items).flatMap(({ vendor, items: vendorItems }) =>
    paginateVendorItems(vendor, vendorItems),
  )
}

/** Produces deterministic preview plans; the backend remains responsible for atomic number allocation. */
export function planVendorPrs(
  items: readonly PrLineItem[],
  startingSequence: number,
  numberOptions: PrNumberOptions = {},
): PrVendorPlan[] {
  return groupItemsByVendor(items).map((group, index) => ({
    ...group,
    prNumber: formatPrNumber(startingSequence + index, numberOptions),
    pages: paginateVendorItems(group.vendor, group.items),
  }))
}
