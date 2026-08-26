export type PrKind = 'raw-material' | 'equipment'

export interface PrCatalogItem {
  id: string
  itemFg: string
  namePart: string
  spec?: string
  drawingNo?: string
  codeOrder?: string
  vendor: string
  materialType?: string
  dimension?: string
  unitPrice?: number
  usage?: number
  comment?: string
}

export interface PrLineItem extends PrCatalogItem {
  lineId: string
  quantity: number
  fgQuantity?: number
  dueDate?: string
}

export interface PrVendorGroup {
  vendor: string
  items: PrLineItem[]
}

export interface PrVendorPlan extends PrVendorGroup {
  prNumber: string
  pages: PrPage<PrLineItem>[]
}

export interface PrPage<T> {
  vendor: string
  pageNumber: number
  totalPages: number
  rows: Array<T | null>
  actualItemCount: number
  isFinalPage: boolean
  showSignatures: boolean
  continuation: boolean
}

export interface PrDraft {
  kind: PrKind
  prNumber: string
  requestDate: string
  requestedBy: string
  items: PrLineItem[]
}
