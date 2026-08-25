import { describe, expect, it } from 'vitest'
import { buildPrPages, groupItemsByVendor, paginateVendorItems, planVendorPrs, PR_ITEMS_PER_PAGE } from './pagination'
import { formatPrNumber } from './prNumber'
import type { PrLineItem } from './types'

function items(count: number, vendor = 'Vendor A'): PrLineItem[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `${vendor}-${index}`,
    itemFg: `FG-${index + 1}`,
    namePart: `Part ${index + 1}`,
    vendor,
    quantity: 1,
  }))
}

describe('paginateVendorItems', () => {
  it.each([
    [0, 0, []], [1, 1, [1]], [11, 1, [11]], [12, 1, [12]],
    [13, 2, [12, 1]], [23, 2, [12, 11]], [24, 2, [12, 12]], [25, 3, [12, 12, 1]],
  ] as const)('paginates %i rows into %i page(s)', (count, expectedPages, counts) => {
    const pages = paginateVendorItems('Vendor A', items(count))
    expect(pages).toHaveLength(expectedPages)
    expect(pages.map((page) => page.actualItemCount)).toEqual(counts)
    pages.forEach((page) => expect(page.rows).toHaveLength(PR_ITEMS_PER_PAGE))
  })

  it('shows continuation before the last page and signatures only on the last page', () => {
    const pages = paginateVendorItems('Vendor A', items(25))
    expect(pages.map((page) => page.continuation)).toEqual([true, true, false])
    expect(pages.map((page) => page.showSignatures)).toEqual([false, false, true])
    expect(pages.map((page) => `${page.pageNumber}/${page.totalPages}`)).toEqual(['1/3', '2/3', '3/3'])
  })
})

describe('vendor grouping', () => {
  it('keeps one PR page set per vendor in insertion order', () => {
    const mixed = [...items(2, 'Vendor B'), ...items(13, 'Vendor A'), ...items(1, 'Vendor B')]
    const groups = groupItemsByVendor(mixed)
    expect(groups.map((group) => [group.vendor, group.items.length])).toEqual([['Vendor B', 3], ['Vendor A', 13]])
    expect(buildPrPages(mixed).map((page) => page.vendor)).toEqual(['Vendor B', 'Vendor A', 'Vendor A'])
  })

  it('plans one sequential PR number per unique vendor', () => {
    const plans = planVendorPrs([...items(13, 'Vendor A'), ...items(1, 'Vendor B')], 8, { date: new Date(2026, 7, 1) })
    expect(plans.map((plan) => [plan.vendor, plan.prNumber, plan.pages.length])).toEqual([
      ['Vendor A', 'PR-2608-0008', 2],
      ['Vendor B', 'PR-2608-0009', 1],
    ])
  })
})

describe('formatPrNumber', () => {
  it('defaults to PR-YYMM-NNNN', () => {
    expect(formatPrNumber(7, { date: new Date(2026, 7, 1) })).toBe('PR-2608-0007')
  })

  it('supports display-format configuration', () => {
    expect(formatPrNumber(42, { prefix: '', separator: '/', sequenceLength: 5, date: new Date(2026, 0, 1) })).toBe('2601/00042')
  })
})
