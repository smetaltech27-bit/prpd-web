import { DOCUMENT_LABELS, DOCUMENT_TYPES } from './types'
import type { DocumentSearchResult, DocumentType, ProductionDocument } from './types'

export function normalizeItemFg(value: string): string {
  return value.trim().toLocaleUpperCase()
}

function newestFirst(a: ProductionDocument, b: ProductionDocument): number {
  return (b.updatedAt ?? '').localeCompare(a.updatedAt ?? '')
}

export function searchDocuments(
  documents: readonly ProductionDocument[],
  itemFg: string,
  types: readonly DocumentType[] = DOCUMENT_TYPES,
): DocumentSearchResult[] {
  const target = normalizeItemFg(itemFg)
  const matches = target
    ? documents.filter((document) => normalizeItemFg(document.itemFg) === target).sort(newestFirst)
    : []

  return types.map((type) => {
    const document = matches.find((candidate) => candidate.type === type) ?? null
    return {
      type,
      label: DOCUMENT_LABELS[type],
      status: document ? 'found' : 'missing',
      document,
    }
  })
}

export function suggestItemFg(
  documents: readonly ProductionDocument[],
  query: string,
  limit = 8,
): string[] {
  const target = normalizeItemFg(query)
  if (!target) return []
  return [...new Set(documents
    .map((document) => normalizeItemFg(document.itemFg))
    .filter((itemFg) => itemFg.includes(target)))]
    .slice(0, limit)
}

