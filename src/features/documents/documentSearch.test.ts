import { describe, expect, it } from 'vitest'
import { searchDocuments, suggestItemFg } from './documentSearch'
import { getDocumentOrientation } from './types'
import type { ProductionDocument } from './types'

const documents: ProductionDocument[] = [
  { id: 'd1', itemFg: 'TM4207A', type: 'drawing', imageUrl: '/drawing.jpg', pixelWidth: 1600, pixelHeight: 900, updatedAt: '2026-08-01' },
  { id: 'i1', itemFg: 'TM4207A', type: 'inprocess', imageUrl: '/inprocess.jpg', updatedAt: '2026-08-02' },
  { id: 'd2-old', itemFg: 'tm4207a', type: 'drawing', imageUrl: '/old.jpg', updatedAt: '2025-01-01' },
  { id: 'q1', itemFg: 'TM9999Z', type: 'qc', imageUrl: '/qc.jpg' },
]

describe('document search', () => {
  it('matches Item FG case-insensitively and reports missing document types', () => {
    const results = searchDocuments(documents, ' tm4207a ')
    expect(results.map((result) => [result.type, result.status])).toEqual([
      ['drawing', 'found'], ['inprocess', 'found'], ['qc', 'missing'],
    ])
    expect(results[0].document?.id).toBe('d1')
  })

  it('can search a dedicated print menu', () => {
    expect(searchDocuments(documents, 'TM9999Z', ['qc'])).toMatchObject([
      { type: 'qc', status: 'found', document: { id: 'q1' } },
    ])
  })

  it('suggests unique Item FG values', () => {
    expect(suggestItemFg(documents, 'tm')).toEqual(['TM4207A', 'TM9999Z'])
  })
})

describe('document orientation', () => {
  it('uses stored dimensions and defaults unknown documents to portrait', () => {
    expect(getDocumentOrientation(documents[0])).toBe('landscape')
    expect(getDocumentOrientation(documents[1])).toBe('portrait')
  })

  it('prefers dimensions measured from the loaded image', () => {
    expect(getDocumentOrientation(documents[0], { width: 800, height: 1200 })).toBe('portrait')
  })
})
