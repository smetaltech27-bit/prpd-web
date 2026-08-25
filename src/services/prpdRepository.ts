import type { MaterialItem } from '../types/domain'
import { settingsSupabase, supabase } from '../lib/supabase'

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
  }>
}

export interface CreatedPr {
  id: string
  pr_number: string
  vendor_id: string
  line_count: number
}

export interface ActiveDocumentAsset {
  id: string
  itemFg: string
  type: 'drawing' | 'inprocess' | 'qc'
  bucket: string
  path: string
  filename: string
  signedUrl: string
}

export type DocumentAssetType = 'drawing' | 'inprocess' | 'qc'

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
    })),
    p_request_date: input.requestDate,
    p_due_date: input.dueDate ?? null,
    p_requester_name: input.requesterName ?? null,
    p_header_comment: input.headerComment ?? null,
  })
  if (error) throw error
  return (data ?? []) as CreatedPr[]
}

export async function findActiveDocuments(itemFg: string): Promise<ActiveDocumentAsset[]> {
  if (!supabase) return []
  const client = supabase
  const normalizedItemFg = itemFg.trim()
  if (!normalizedItemFg) return []
  const { data, error } = await supabase
    .from('document_assets')
    .select('id,item_fg,document_type,storage_bucket,storage_path,original_filename')
    .ilike('item_fg', normalizedItemFg)
    .eq('is_active', true)
  if (error) throw error

  return Promise.all((data ?? []).map(async (row) => {
    const { data: signed, error: signedError } = await client.storage
      .from(row.storage_bucket)
      .createSignedUrl(row.storage_path, 5 * 60)
    if (signedError) throw signedError
    return {
      id: row.id,
      itemFg: row.item_fg,
      type: row.document_type,
      bucket: row.storage_bucket,
      path: row.storage_path,
      filename: row.original_filename,
      signedUrl: signed.signedUrl,
    } as ActiveDocumentAsset
  }))
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

  const bucketByType: Record<DocumentAssetType, string> = {
    drawing: 'drawing',
    inprocess: 'inprocess-check-sheet',
    qc: 'qc-check-sheet',
  }
  const extension = file.name.split('.').pop()?.toLocaleLowerCase().replace(/[^a-z0-9]/g, '') || 'bin'
  const safeItemFg = normalizedItemFg.toLocaleLowerCase().replace(/[^a-z0-9_-]+/g, '-')
  const uniquePart = typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`
  const storagePath = `${safeItemFg}/revisions/${uniquePart}.${extension}`
  const bucket = bucketByType[documentType]

  const { error: uploadError } = await settingsSupabase.storage
    .from(bucket)
    .upload(storagePath, file, { upsert: false, contentType: file.type })
  if (uploadError) throw uploadError

  const metadata = {
    item_fg: normalizedItemFg,
    document_type: documentType,
    version: null,
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
