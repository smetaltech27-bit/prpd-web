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
  }
}

async function listMaster(table: MasterTable, itemFg?: string): Promise<MaterialItem[]> {
  if (!supabase) return []
  const typeColumn = table === 'raw_materials' ? 'material_type' : 'supply_type'
  let query = supabase
    .from(table)
    .select(`id,name_part,spec,dwg_no,item_fg,code_order_rm,${typeColumn},dimension,unit_price,usage_qty,comment,vendors(name)`)
    .eq('is_active', true)
    .order('name_part')
  if (itemFg?.trim()) query = query.ilike('item_fg', itemFg.trim())
  const { data, error } = await query
  if (error) throw error
  return ((data ?? []) as unknown as MasterRow[]).map(mapMasterRow)
}

export function listRawMaterials(itemFg?: string): Promise<MaterialItem[]> {
  return listMaster('raw_materials', itemFg)
}

export function listFactorySupplies(): Promise<MaterialItem[]> {
  return listMaster('factory_supplies')
}

export async function createPurchaseRequests(input: CreatePrInput): Promise<CreatedPr[]> {
  if (!supabase) throw new Error('Supabase is not configured')
  const { data, error } = await supabase.rpc('create_purchase_requests', {
    p_request_kind: input.kind,
    p_items: input.items.map((item) => ({
      source_id: item.sourceId,
      quantity: item.quantity,
      fg_qty: item.fgQty ?? null,
      unit_price: item.unitPrice ?? null,
      due_date: item.dueDate ?? null,
      comment: item.comment ?? null,
      vendor_name: item.vendorName ?? null,
      name_part: item.namePart ?? null,
      spec: item.spec ?? null,
    })),
    p_request_date: input.requestDate,
    p_due_date: input.dueDate ?? null,
    p_requester_name: input.requesterName ?? null,
    p_header_comment: input.headerComment ?? null,
  })
  if (error) throw error
  return (data ?? []) as CreatedPr[]
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
  if (!settingsSupabase) throw new Error('Settings access is not configured')
  const table = (kind === 'raw' ? 'raw_materials' : 'factory_supplies') as string
  const { error } = await settingsSupabase.from(table).update({ is_active: false }).eq('id', id)
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
