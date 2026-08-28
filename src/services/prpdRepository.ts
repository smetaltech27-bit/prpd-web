import type { MaterialItem } from '../types/domain'
import { settingsSupabase, supabase } from '../lib/supabase'
import {
  createImmutableDocumentPath,
  uploadPrivateDocument,
  type PrivateDocumentLocation,
} from './documentStorage'

type MasterTable = 'raw_materials' | 'factory_supplies'

interface MasterRow {
  id: string
  name_part: string
  spec: string | null
  dwg_no: string | null
  item_fg: string | null
  code_order_rm: string | null
  material_type?: string | null
  supply_type?: string | null
  dimension: string | null
  unit_price: number | null
  usage_qty: number | null
  comment: string | null
  is_active: boolean
  vendors: { name: string } | Array<{ name: string }> | null
}

export interface CreatePrInput {
  kind: 'raw_material' | 'factory_supply'
  requestDate: string
  dueDate?: string
  requesterName?: string
  headerComment?: string
  items: Array<{
    sourceId: string
    quantity: number
    fgQty?: number
    unitPrice?: number
    dueDate?: string
    comment?: string
    vendorName?: string
    namePart?: string
    spec?: string
  }>
}

export interface CreatedPr {
  id: string
  pr_number: string
  vendor_id: string
  vendor_name: string
  line_count: number
}

export interface UpdatePrDraftsInput {
  kind: CreatePrInput['kind']
  dueDate?: string
  drafts: Array<{
    id: string
    items: CreatePrInput['items']
  }>
}

export interface PrHistoryLine {
  lineId: string
  prId: string
  prNumber: string
  requestKind: 'raw_material' | 'factory_supply'
  requestDate: string
  vendorName: string
  itemFg: string
  codeOrderRm: string
  namePart: string
  materialType: string
  spec: string
  fgQty: number | null
  quantity: number
  unitPrice: number
  dueDate: string
  comment: string
}

interface PrHistoryRpcRow {
  line_id: string
  pr_id: string
  pr_number: string
  request_kind: 'raw_material' | 'factory_supply'
  request_date: string
  vendor_name: string
  item_fg: string | null
  code_order_rm: string | null
  name_part: string
  material_or_supply_type: string | null
  spec: string | null
  fg_qty: number | null
  quantity: number
  unit_price: number | null
  due_date: string | null
  comment: string | null
}

export interface PrHistoryFilters {
  kind: 'raw_material' | 'factory_supply'
  requestDate?: string
  prNumber?: string
  vendor?: string
  itemFg?: string
  codeOrderRm?: string
}

export interface DeletePrHistoryResult {
  deletedRequests: number
  deletedLines: number
}

interface DeletePrHistoryRpcRow {
  deleted_requests: number
  deleted_lines: number
}

export interface ActiveDocumentAsset extends PrivateDocumentLocation {
  id: string
  itemFg: string
  type: 'drawing' | 'inprocess' | 'qc'
  filename: string
  mimeType: string
  sizeBytes: number
  version: number
  updatedAt: string
  partName: string
  drawingNo: string
}

export type DocumentAssetType = 'drawing' | 'inprocess' | 'qc'
export type DocumentUploadStatus = 'uploading' | 'uploaded'

export interface CreateProductionItemInput {
  itemFg: string
  partName: string
  drawingNo: string
  model: string
  files: Record<DocumentAssetType, File>
}

interface ProductionItemRpcRow {
  id: string
  item_fg: string
  name_part: string
  drawing_no: string
  model: string
  source: 'production' | 'raw_material'
}

interface DocumentAssetRow {
  id: string
  item_fg: string
  document_type: DocumentAssetType
  version: number
  storage_provider?: 'supabase' | 'r2' | null
  storage_bucket: string
  storage_path: string
  original_filename: string
  mime_type?: string | null
  size_bytes?: number | null
  updated_at?: string | null
  part_name?: string | null
  drawing_no?: string | null
}

function mapDocumentAsset(row: DocumentAssetRow): ActiveDocumentAsset {
  return {
    id: row.id,
    itemFg: row.item_fg,
    type: row.document_type,
    version: Number(row.version),
    storageProvider: row.storage_provider === 'r2' ? 'r2' : 'supabase',
    bucket: row.storage_bucket,
    path: row.storage_path,
    filename: row.original_filename,
    mimeType: row.mime_type ?? 'application/octet-stream',
    sizeBytes: Number(row.size_bytes ?? 0),
    updatedAt: row.updated_at ?? '',
    partName: row.part_name ?? '',
    drawingNo: row.drawing_no ?? '',
  }
}

function getVendorName(value: MasterRow['vendors']): string {
  if (Array.isArray(value)) return value[0]?.name ?? ''
  return value?.name ?? ''
}

function mapMasterRow(row: MasterRow): MaterialItem {
  return {
    id: row.id,
    itemFg: row.item_fg ?? '',
    partName: row.name_part,
    spec: row.spec ?? '',
    drawingNo: row.dwg_no ?? '',
    orderCode: row.code_order_rm ?? '',
    vendor: getVendorName(row.vendors),
    materialType: row.material_type ?? row.supply_type ?? '',
    dimension: row.dimension ?? '',
    unitPrice: Number(row.unit_price ?? 0),
    usage: Number(row.usage_qty ?? 1),
    comment: row.comment ?? '',
    isActive: row.is_active,
  }
}

async function listMaster(table: MasterTable, itemFg?: string, includeInactive = false): Promise<MaterialItem[]> {
  const client = includeInactive ? settingsSupabase : supabase
  if (!client) return []
  const typeColumn = table === 'raw_materials' ? 'material_type' : 'supply_type'
  let query = client
    .from(table)
    .select(`id,name_part,spec,dwg_no,item_fg,code_order_rm,${typeColumn},dimension,unit_price,usage_qty,comment,is_active,vendors(name)`)
    .order('name_part')
  if (!includeInactive) query = query.eq('is_active', true)
  if (itemFg?.trim()) query = query.ilike('item_fg', itemFg.trim())
  const { data, error } = await query
  if (error) throw error
  return ((data ?? []) as unknown as MasterRow[]).map(mapMasterRow)
}

export function listRawMaterials(itemFg?: string, includeInactive = false): Promise<MaterialItem[]> {
  return listMaster('raw_materials', itemFg, includeInactive)
}

export function listFactorySupplies(includeInactive = false): Promise<MaterialItem[]> {
  return listMaster('factory_supplies', undefined, includeInactive)
}

export async function listVendorNames(): Promise<string[]> {
  if (!supabase) return []
  const { data, error } = await supabase
    .from('vendors')
    .select('name')
    .eq('is_active', true)
    .order('name')
  if (error) throw error
  return (data ?? [])
    .map((vendor) => vendor.name?.trim() ?? '')
    .filter(Boolean)
}

function mapPrItem(item: CreatePrInput['items'][number]) {
  return {
    source_id: item.sourceId,
    quantity: item.quantity,
    fg_qty: item.fgQty ?? null,
    unit_price: item.unitPrice ?? null,
    due_date: item.dueDate ?? null,
    comment: item.comment ?? null,
    vendor_name: item.vendorName ?? null,
    name_part: item.namePart ?? null,
    spec: item.spec ?? null,
  }
}

function createPrRpcArgs(input: CreatePrInput) {
  return {
    p_request_kind: input.kind,
    p_items: input.items.map(mapPrItem),
    p_request_date: input.requestDate,
    p_due_date: input.dueDate ?? null,
    p_requester_name: input.requesterName ?? null,
    p_header_comment: input.headerComment ?? null,
  }
}

export async function createPurchaseRequests(input: CreatePrInput): Promise<CreatedPr[]> {
  if (!supabase) throw new Error('Supabase is not configured')
  const { data, error } = await supabase.rpc('create_purchase_requests', createPrRpcArgs(input))
  if (error) throw error
  return (data ?? []) as CreatedPr[]
}

export async function reservePurchaseRequestsForPrint(input: CreatePrInput): Promise<CreatedPr[]> {
  if (!supabase) throw new Error('Supabase is not configured')
  const { data, error } = await supabase.rpc('reserve_purchase_requests_for_print', createPrRpcArgs(input))
  if (error) throw error
  return (data ?? []) as CreatedPr[]
}

export async function updatePurchaseRequestDraftsForPrint(input: UpdatePrDraftsInput): Promise<CreatedPr[]> {
  if (!supabase) throw new Error('Supabase is not configured')
  const { data, error } = await supabase.rpc('update_purchase_request_drafts_for_print', {
    p_request_kind: input.kind,
    p_drafts: input.drafts.map((draft) => ({ id: draft.id, items: draft.items.map(mapPrItem) })),
    p_due_date: input.dueDate ?? null,
  })
  if (error) throw error
  return (data ?? []) as CreatedPr[]
}

export async function confirmPurchaseRequestsPrinted(prIds: string[]): Promise<number> {
  if (!supabase) throw new Error('Supabase is not configured')
  const { data, error } = await supabase.rpc('confirm_purchase_requests_printed', { p_pr_ids: prIds })
  if (error) throw error
  return Number(data ?? 0)
}

export async function discardPurchaseRequestDrafts(prIds: string[]): Promise<number> {
  if (!supabase) throw new Error('Supabase is not configured')
  const { data, error } = await supabase.rpc('discard_purchase_request_drafts', { p_pr_ids: prIds })
  if (error) throw error
  return Number(data ?? 0)
}

export async function searchPrHistory(filters: PrHistoryFilters): Promise<PrHistoryLine[]> {
  if (!supabase) return []
  const { data, error } = await supabase.rpc('search_pr_history', {
    p_request_kind: filters.kind,
    p_request_date: filters.requestDate || null,
    p_pr_number: filters.prNumber?.trim() || null,
    p_vendor: filters.vendor?.trim() || null,
    p_item_fg: filters.itemFg?.trim() || null,
    p_code_order_rm: filters.codeOrderRm?.trim() || null,
  })
  if (error) throw error
  return ((data ?? []) as PrHistoryRpcRow[]).map((row) => ({
    lineId: row.line_id,
    prId: row.pr_id,
    prNumber: row.pr_number,
    requestKind: row.request_kind,
    requestDate: row.request_date,
    vendorName: row.vendor_name,
    itemFg: row.item_fg ?? '',
    codeOrderRm: row.code_order_rm ?? '',
    namePart: row.name_part,
    materialType: row.material_or_supply_type ?? '',
    spec: row.spec ?? '',
    fgQty: row.fg_qty == null ? null : Number(row.fg_qty),
    quantity: Number(row.quantity),
    unitPrice: Number(row.unit_price ?? 0),
    dueDate: row.due_date ?? '',
    comment: row.comment ?? '',
  }))
}

export async function deletePurchaseRequestHistory(prIds: string[]): Promise<DeletePrHistoryResult> {
  if (!settingsSupabase) throw new Error('Supabase is not configured')
  const uniquePrIds = [...new Set(prIds.filter(Boolean))]
  if (!uniquePrIds.length) return { deletedRequests: 0, deletedLines: 0 }
  const { data, error } = await settingsSupabase.rpc('delete_purchase_request_history', { p_pr_ids: uniquePrIds })
  if (error) throw error
  const row = ((data ?? []) as DeletePrHistoryRpcRow[])[0]
  return {
    deletedRequests: Number(row?.deleted_requests ?? 0),
    deletedLines: Number(row?.deleted_lines ?? 0),
  }
}

export async function findActiveDocuments(itemFg: string): Promise<ActiveDocumentAsset[]> {
  if (!supabase) return []
  const normalizedItemFg = itemFg.trim()
  if (!normalizedItemFg) return []
  const { data, error } = await supabase
    .from('document_assets')
    .select('id,item_fg,document_type,version,storage_provider,storage_bucket,storage_path,original_filename,mime_type,size_bytes,updated_at')
    .ilike('item_fg', normalizedItemFg)
    .eq('is_active', true)
  if (error) throw error
  return ((data ?? []) as DocumentAssetRow[]).map(mapDocumentAsset)
}

export async function searchActiveDocuments(
  query: string,
  documentType: DocumentAssetType,
  limit = 30,
): Promise<ActiveDocumentAsset[]> {
  if (!supabase || !query.trim()) return []
  const { data, error } = await supabase.rpc('search_document_assets', {
    p_query: query.trim(),
    p_document_type: documentType,
    p_limit: limit,
  })
  if (error) throw error
  return ((data ?? []) as DocumentAssetRow[]).map(mapDocumentAsset)
}

function mapProductionItem(row: ProductionItemRpcRow): MaterialItem {
  return {
    id: row.id,
    itemFg: row.item_fg,
    partName: row.name_part,
    spec: row.model,
    drawingNo: row.drawing_no,
    orderCode: '',
    vendor: '',
    materialType: '',
    dimension: '',
    unitPrice: 0,
    usage: 1,
    comment: row.source,
  }
}

export async function searchProductionItems(query: string, limit = 50): Promise<MaterialItem[]> {
  if (!supabase || !query.trim()) return []
  const { data, error } = await supabase.rpc('search_production_items', {
    p_query: query.trim(),
    p_limit: limit,
  })
  if (error) throw error
  return ((data ?? []) as ProductionItemRpcRow[]).map(mapProductionItem)
}

function normalizeVendorName(name: string): string {
  return name.trim().replace(/\s+/g, ' ').toLocaleLowerCase()
}

async function getOrCreateVendor(name: string): Promise<string> {
  if (!settingsSupabase) throw new Error('Settings access is not configured')
  const normalized = normalizeVendorName(name)
  const { data: existing, error: findError } = await settingsSupabase
    .from('vendors')
    .select('id')
    .eq('normalized_name', normalized)
    .maybeSingle()
  if (findError) throw findError
  if (existing) return existing.id
  const { data: created, error: createError } = await settingsSupabase
    .from('vendors')
    .insert({ name: name.trim() })
    .select('id')
    .single()
  if (createError) throw createError
  return created.id
}

export async function saveMasterItem(kind: 'raw' | 'equipment', item: MaterialItem): Promise<string> {
  if (!settingsSupabase) throw new Error('Settings access is not configured')
  if (!item.partName.trim() || !item.vendor.trim()) throw new Error('Part name and vendor are required')
  if (kind === 'raw' && !item.itemFg.trim()) throw new Error('Item FG is required for raw material')
  if (!Number.isFinite(item.unitPrice) || item.unitPrice < 0) throw new Error('Unit price cannot be negative')
  if (!Number.isFinite(item.usage) || item.usage <= 0) throw new Error('Usage must be greater than zero')
  const vendorId = await getOrCreateVendor(item.vendor)
  const table = (kind === 'raw' ? 'raw_materials' : 'factory_supplies') as string
  const record = {
    name_part: item.partName.trim(),
    spec: item.spec || null,
    dwg_no: item.drawingNo || null,
    item_fg: item.itemFg || null,
    code_order_rm: item.orderCode || null,
    vendor_id: vendorId,
    dimension: item.dimension || null,
    unit_price: item.unitPrice,
    usage_qty: item.usage,
    comment: item.comment || null,
    ...(kind === 'raw' ? { material_type: item.materialType } : { supply_type: item.materialType }),
  }

  if (item.id && !item.id.startsWith('new-')) {
    const { error } = await settingsSupabase.from(table).update(record as never).eq('id', item.id)
    if (error) throw error
    return item.id
  }

  const { data, error } = await settingsSupabase.from(table).insert(record as never).select('id').single()
  if (error) throw error
  return data.id
}

export async function deactivateMasterItem(kind: 'raw' | 'equipment', id: string): Promise<void> {
  return setMasterItemActive(kind, id, false)
}

export async function setMasterItemActive(kind: 'raw' | 'equipment', id: string, isActive: boolean): Promise<void> {
  if (!settingsSupabase) throw new Error('Settings access is not configured')
  const table = (kind === 'raw' ? 'raw_materials' : 'factory_supplies') as string
  const { error } = await settingsSupabase.from(table).update({ is_active: isActive }).eq('id', id)
  if (error) throw error
}

export async function uploadDocumentAsset(
  itemFg: string,
  documentType: DocumentAssetType,
  file: File,
): Promise<string> {
  if (!settingsSupabase) throw new Error('Settings access is not configured')
  const normalizedItemFg = itemFg.trim().toLocaleUpperCase()
  if (!normalizedItemFg) throw new Error('Item FG is required')
  if (file.size > 25 * 1024 * 1024) throw new Error('Document file exceeds 25 MB')
  const allowedTypes = new Set(['image/jpeg', 'image/png', 'image/webp', 'application/pdf'])
  if (!allowedTypes.has(file.type)) throw new Error('Unsupported document file type')

  const storagePath = createImmutableDocumentPath(normalizedItemFg, documentType, file.name)
  const bucket = 'prpd-documents'
  await uploadPrivateDocument(storagePath, file)

  const metadata = {
    item_fg: normalizedItemFg,
    document_type: documentType,
    version: null,
    storage_provider: 'r2',
    storage_bucket: bucket,
    storage_path: storagePath,
    original_filename: file.name,
    mime_type: file.type,
    size_bytes: file.size,
    is_active: true,
  }
  const { error: metadataError } = await settingsSupabase
    .from('document_assets')
    .insert(metadata as never)
  if (metadataError) {
    throw new Error(`File uploaded but metadata failed: ${metadataError.message}`)
  }
  return storagePath
}

function validateDocumentFile(file: File) {
  if (file.size > 25 * 1024 * 1024) throw new Error(`${file.name} มีขนาดเกิน 25 MB`)
  const allowedTypes = new Set(['image/jpeg', 'image/png', 'image/webp', 'application/pdf'])
  if (!allowedTypes.has(file.type)) throw new Error(`${file.name} เป็นชนิดไฟล์ที่ไม่รองรับ`)
}

export async function createProductionItemWithDocuments(
  input: CreateProductionItemInput,
  onProgress?: (type: DocumentAssetType, status: DocumentUploadStatus) => void,
): Promise<MaterialItem> {
  if (!settingsSupabase) throw new Error('Settings access is not configured')
  const itemFg = input.itemFg.trim().toLocaleUpperCase()
  if (!itemFg || !input.partName.trim() || !input.drawingNo.trim() || !input.model.trim()) {
    throw new Error('กรุณากรอก Item FG, Name Part, Drawing No. และ Model ให้ครบ')
  }

  const existing = await searchProductionItems(itemFg, 10)
  if (existing.some((item) => item.itemFg.trim().toLocaleUpperCase() === itemFg)) {
    throw new Error(`Item FG “${itemFg}” มีอยู่ในระบบแล้ว`)
  }

  const documentTypes: DocumentAssetType[] = ['drawing', 'inprocess', 'qc']
  const documents: Array<Record<string, string | number>> = []
  for (const type of documentTypes) {
    const file = input.files[type]
    if (!file) throw new Error('กรุณาเลือกไฟล์ Drawing, Inprocess และ QC ให้ครบ')
    validateDocumentFile(file)
    const storagePath = createImmutableDocumentPath(itemFg, type, file.name)
    onProgress?.(type, 'uploading')
    await uploadPrivateDocument(storagePath, file)
    onProgress?.(type, 'uploaded')
    documents.push({
      document_type: type,
      storage_path: storagePath,
      original_filename: file.name,
      mime_type: file.type,
      size_bytes: file.size,
    })
  }

  const { data, error } = await settingsSupabase.rpc('create_production_item_with_documents', {
    p_item_fg: itemFg,
    p_name_part: input.partName.trim(),
    p_drawing_no: input.drawingNo.trim(),
    p_model: input.model.trim(),
    p_documents: documents,
  })
  if (error) throw error

  return mapProductionItem({
    id: String(data),
    item_fg: itemFg,
    name_part: input.partName.trim(),
    drawing_no: input.drawingNo.trim(),
    model: input.model.trim(),
    source: 'production',
  })
}
