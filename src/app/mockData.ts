import type { DocumentRecord, HistoryRecord, MaterialItem } from '../types/domain'

export const rawMaterials: MaterialItem[] = [
  { id: 'rm-1', itemFg: 'TM4207A', partName: 'ARM A', spec: 'AL400', drawingNo: 'MT524685A', orderCode: '912612', vendor: 'วิรัชวิศวกรรม 207', materialType: 'BRASS BAR', dimension: '20 × 60 × 1000 mm', unitPrice: 5250, usage: 75 },
  { id: 'rm-2', itemFg: '222984C', partName: 'ARM B', spec: 'AQ325L', drawingNo: 'MT402422C', orderCode: '912700', vendor: 'โตจิน 183', materialType: 'BRASS BAR', dimension: '19.05 × 101.6 × 1000 mm', unitPrice: 6400, usage: 66 },
  { id: 'rm-3', itemFg: '222240A', partName: 'ATC BASE (0LA)', spec: 'AD55L', drawingNo: 'MT515373A', orderCode: '912651', vendor: 'วิรัชวิศวกรรม 207', materialType: 'SS400', dimension: '20 × 305 × 370 mm', unitPrice: 850, usage: 1 },
  { id: 'rm-4', itemFg: '11273TA', partName: 'ARM BLOCK-R (TA)', spec: 'VZ300L', drawingNo: 'MT508199AA', orderCode: '—', vendor: 'นวนครพลาสติก 078', materialType: 'POM (BLACK)', dimension: '30 × 30 × 135 mm', unitPrice: 120, usage: 1 },
]

export const equipmentItems: MaterialItem[] = [
  { id: 'eq-1', itemFg: 'FAC-001', partName: 'Cutting Oil', spec: '20L', drawingNo: '—', orderCode: 'FS-1001', vendor: 'Factory Supply A', materialType: 'CONSUMABLE', dimension: '20 Litre', unitPrice: 1850, usage: 1 },
  { id: 'eq-2', itemFg: 'FAC-002', partName: 'Safety Gloves', spec: 'Size L', drawingNo: '—', orderCode: 'FS-1002', vendor: 'Safety Partner', materialType: 'PPE', dimension: '12 pairs / box', unitPrice: 780, usage: 2 },
  { id: 'eq-3', itemFg: 'FAC-003', partName: 'Grinding Wheel', spec: '4 inch', drawingNo: '—', orderCode: 'FS-1003', vendor: 'Factory Supply A', materialType: 'TOOLING', dimension: '100 × 6 × 16 mm', unitPrice: 55, usage: 20 },
]

export const documents: DocumentRecord[] = [
  { id: 'doc-1', itemFg: 'TM4207A', partName: 'ARM A', drawingNo: 'MT524685A', drawing: true, inprocess: true, qc: true },
  { id: 'doc-2', itemFg: '222984C', partName: 'ARM B', drawingNo: 'MT402422C', drawing: true, inprocess: false, qc: true },
  { id: 'doc-3', itemFg: '222240A', partName: 'ATC BASE (0LA)', drawingNo: 'MT515373A', drawing: true, inprocess: true, qc: false },
]

export const historyRecords: HistoryRecord[] = [
  { prNumber: 'PR-2608-0108', date: '24 Aug 2026', vendor: 'วิรัชวิศวกรรม 207', category: 'Raw Material', items: 8, amount: 26450, status: 'Printed' },
  { prNumber: 'PR-2608-0107', date: '24 Aug 2026', vendor: 'Factory Supply A', category: 'Equipment', items: 3, amount: 9250, status: 'Created' },
  { prNumber: 'PR-2608-0106', date: '23 Aug 2026', vendor: 'นวนครพลาสติก 078', category: 'Raw Material', items: 14, amount: 16800, status: 'Printed' },
  { prNumber: 'PR-2608-0105', date: '22 Aug 2026', vendor: 'โตจิน 183', category: 'Raw Material', items: 5, amount: 32000, status: 'Cancelled' },
]
