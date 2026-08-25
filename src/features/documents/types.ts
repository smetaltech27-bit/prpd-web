import type { PrintOrientation } from '../../lib/print'

export const DOCUMENT_TYPES = ['drawing', 'inprocess', 'qc'] as const
export type DocumentType = (typeof DOCUMENT_TYPES)[number]

export const DOCUMENT_LABELS: Record<DocumentType, string> = {
  drawing: 'Drawing',
  inprocess: 'Inprocess Check Sheet',
  qc: 'QC Check Sheet',
}

export interface ProductionDocument {
  id: string
  itemFg: string
  type: DocumentType
  imageUrl: string
  partName?: string
  drawingNo?: string
  pixelWidth?: number
  pixelHeight?: number
  updatedAt?: string
}

export interface DocumentSearchResult {
  type: DocumentType
  label: string
  status: 'found' | 'missing'
  document: ProductionDocument | null
}

export interface ImageDimensions {
  width: number
  height: number
}

export function getDocumentOrientation(
  document: Pick<ProductionDocument, 'pixelWidth' | 'pixelHeight'>,
  measured?: ImageDimensions,
): PrintOrientation {
  const width = measured?.width ?? document.pixelWidth ?? 0
  const height = measured?.height ?? document.pixelHeight ?? 0
  return width > height ? 'landscape' : 'portrait'
}

