export type MenuKey =
  | 'raw-material'
  | 'equipment'
  | 'work-order'
  | 'drawing'
  | 'inprocess'
  | 'qc'
  | 'history'
  | 'settings'

export interface MaterialItem {
  id: string
  itemFg: string
  partName: string
  spec: string
  drawingNo: string
  orderCode: string
  vendor: string
  materialType: string
  dimension: string
  unitPrice: number
  usage: number
  comment?: string
  isActive?: boolean
}

export interface DocumentRecord {
  id: string
  itemFg: string
  partName: string
  drawingNo: string
  drawing: boolean
  inprocess: boolean
  qc: boolean
}

export type DocumentKind = 'drawing' | 'inprocess' | 'qc'

export interface HistoryRecord {
  prNumber: string
  date: string
  vendor: string
  category: 'Raw Material' | 'Equipment'
  items: number
  amount: number
  status: 'Created' | 'Printed' | 'Cancelled'
}
