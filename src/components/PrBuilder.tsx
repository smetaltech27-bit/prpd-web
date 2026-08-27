import { CheckCircle2, LoaderCircle, Printer, Search, Trash2, X } from 'lucide-react'
import { useMemo, useRef, useState, type ChangeEvent } from 'react'
import { createPortal } from 'react-dom'
import type { MaterialItem } from '../types/domain'
import {
  createRawMaterialLines,
  groupItemsByVendor,
  paginateVendorItems,
  PrPrintDocument,
  type PrLineItem,
} from '../features/pr'
import { isSupabaseConfigured } from '../lib/supabase'
import { createPurchaseRequests } from '../services/prpdRepository'
import { EmptyState, PageHeader } from './AppShell'

interface PrBuilderProps {
  category: 'Raw Material' | 'Equipment'
  items: MaterialItem[]
}

function today(): string {
  return new Date(Date.now() + 7 * 60 * 60 * 1000).toISOString().slice(0, 10)
}

function numberValue(event: ChangeEvent<HTMLInputElement>, minimum = 0): number {
  const value = Number(event.target.value)
  return Number.isFinite(value) ? Math.max(minimum, value) : minimum
}

export function PrBuilder({ category, items }: PrBuilderProps) {
  const isRaw = category === 'Raw Material'
  const sequence = useRef(0)
  const [itemFg, setItemFg] = useState('')
  const [productionQuantity, setProductionQuantity] = useState(1)
  const [dueDate, setDueDate] = useState('')
  const [query, setQuery] = useState('')
  const [vendorFilter, setVendorFilter] = useState('')
  const [rawLines, setRawLines] = useState<PrLineItem[]>([])
  const [equipmentLines, setEquipmentLines] = useState<Record<string, PrLineItem>>({})
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')
  const [previewOpen, setPreviewOpen] = useState(false)
  const [creating, setCreating] = useState(false)
  const [createdNumbers, setCreatedNumbers] = useState<Record<string, string>>({})

  const lines = useMemo(
    () => isRaw ? rawLines : Object.values(equipmentLines),
    [equipmentLines, isRaw, rawLines],
  )
  const groups = useMemo(() => groupItemsByVendor(lines), [lines])
  const total = lines.reduce((sum, item) => sum + (item.unitPrice ?? 0) * item.quantity, 0)
  const vendors = useMemo(() => [...new Set(items.map((item) => item.vendor).filter(Boolean))].sort(), [items])
  const filteredEquipment = useMemo(() => {
    const keyword = query.trim().toLocaleLowerCase()
    return items.filter((item) => {
      const matchesQuery = !keyword || [item.orderCode, item.partName, item.spec, item.dimension, item.materialType, item.vendor]
        .some((value) => value.toLocaleLowerCase().includes(keyword))
      return matchesQuery && (!vendorFilter || item.vendor === vendorFilter)
    })
  }, [items, query, vendorFilter])

  function addRawMaterial() {
    setError('')
    setNotice('')
    if (!itemFg.trim() || productionQuantity <= 0 || !dueDate) {
      setError('กรุณากรอก Item FG, จำนวนที่ต้องการผลิต และ Due Date ให้ครบ')
      return
    }
    const normalized = itemFg.trim().toLocaleUpperCase()
    const matches = items.filter((item) => item.itemFg.trim().toLocaleUpperCase() === normalized)
    if (!matches.length) {
      setError(`ไม่พบ Raw Material ของ Item FG “${itemFg.trim()}” ใน Master Data`)
      return
    }
    const appended = createRawMaterialLines(matches, productionQuantity, dueDate, (item, index) => {
      sequence.current += 1
      return `${item.id}-${sequence.current}-${index}`
    })
    setRawLines((current) => [...current, ...appended])
    setItemFg('')
    setNotice(`ดึงข้อมูล ${appended.length} รายการครบทุก Vendor แล้ว เลือกลบรายการที่ไม่ต้องการซื้อได้เลย`)
  }

  function updateRawLine(lineId: string, patch: Partial<PrLineItem>) {
    if (Object.keys(createdNumbers).length) return
    setRawLines((current) => current.map((line) => line.lineId === lineId ? { ...line, ...patch } : line))
  }

  function toggleEquipment(item: MaterialItem) {
    if (Object.keys(createdNumbers).length) return
    if (!dueDate) {
      setError('กรุณาระบุ Due Date ก่อนเลือกรายการ')
      return
    }
    setError('')
    setEquipmentLines((current) => {
      if (current[item.id]) {
        const next = { ...current }
        delete next[item.id]
        return next
      }
      return {
        ...current,
        [item.id]: {
          id: item.id,
          lineId: item.id,
          itemFg: item.itemFg,
          namePart: item.partName,
          spec: item.spec,
          drawingNo: item.drawingNo,
          codeOrder: item.orderCode,
          vendor: item.vendor,
          materialType: item.materialType,
          dimension: item.dimension,
          unitPrice: item.unitPrice,
          usage: item.usage,
          comment: item.comment,
          quantity: 1,
          dueDate,
        },
      }
    })
  }

  function updateEquipment(id: string, patch: Partial<PrLineItem>) {
    setEquipmentLines((current) => current[id] ? { ...current, [id]: { ...current[id], ...patch } } : current)
  }

  function validateDraft(): boolean {
    if (!lines.length) {
      setError('ยังไม่มีรายการสำหรับออก PR')
      return false
    }
    const invalid = lines.find((line) => !line.vendor.trim() || !line.namePart.trim() || line.quantity <= 0 || !line.dueDate)
    if (invalid) {
      setError('กรุณาตรวจ Vendor, Name Part, Q’ty และ Due Date ของทุกรายการ')
      return false
    }
    setError('')
    return true
  }

  function preview() {
    if (!validateDraft()) return
    setPreviewOpen(true)
  }

  function printCurrentPreview() {
    requestAnimationFrame(() => requestAnimationFrame(() => window.print()))
  }

  async function saveAndPrint() {
    if (Object.keys(createdNumbers).length) {
      printCurrentPreview()
      return
    }
    if (!validateDraft()) return
    if (!isSupabaseConfigured) {
      setError('ยังไม่ได้เชื่อม Supabase จึงไม่สามารถจองเลข PR จริงได้')
      return
    }
    setCreating(true)
    setError('')
    try {
      const created = await createPurchaseRequests({
        kind: isRaw ? 'raw_material' : 'factory_supply',
        requestDate: today(),
        dueDate: dueDate || undefined,
        items: lines.map((line) => ({
          sourceId: line.id,
          quantity: line.quantity,
          fgQty: line.fgQuantity,
          unitPrice: line.unitPrice,
          dueDate: line.dueDate,
          comment: line.comment,
          vendorName: line.vendor,
          namePart: line.namePart,
          spec: line.spec,
        })),
      })
      const numbers = Object.fromEntries(created.map((record) => [record.vendor_name, record.pr_number]))
      setCreatedNumbers(numbers)
      setNotice(`บันทึกและจองเลข ${created.map((record) => record.pr_number).join(', ')} แล้ว`)
      printCurrentPreview()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'สร้าง PR ไม่สำเร็จ ระบบไม่ได้จองเลขบางส่วน')
    } finally {
      setCreating(false)
    }
  }

  function closePreview() {
    setPreviewOpen(false)
    if (Object.keys(createdNumbers).length) {
      setRawLines([])
      setEquipmentLines({})
      setCreatedNumbers({})
      setNotice('พร้อมสร้าง PR ชุดถัดไป')
    }
  }

  return (
    <div className="page">
      <PageHeader
        eyebrow="PURCHASE REQUEST"
        title={isRaw ? 'ออก PR สั่ง Raw Material' : 'ออก PR สั่งวัสดุอุปกรณ์'}
        description={isRaw
          ? 'ใส่ Item FG จำนวนที่ต้องการผลิต และ Due Date ระบบจะคำนวณ Q’ty ตาม Usage และดึงทุก Vendor มาให้เลือก'
          : 'ค้นหาและเลือก Factory Supply / Equipment ระบุราคาและจำนวน แล้ว Preview ก่อนจองเลขและพิมพ์'}
        actions={<button className="button button-secondary" disabled={!lines.length} onClick={preview}><Printer size={17} /> Preview</button>}
      />

      <section className="metrics-grid">
        <article className="metric-card"><span className="metric-icon green"><CheckCircle2 /></span><div><small>Estimated total</small><strong>฿{total.toLocaleString()}</strong><em>ราคา × Q’ty</em></div></article>
      </section>

      <section className="card legacy-pr-card">
        {isRaw ? (
          <div className="legacy-pr-inputs">
            <label><span>Item FG *</span><input value={itemFg} onChange={(event) => setItemFg(event.target.value)} placeholder="เช่น TM4207A" onKeyDown={(event) => { if (event.key === 'Enter') addRawMaterial() }} /></label>
            <label><span>จำนวนที่ต้องการผลิต (ชิ้น) *</span><input type="number" min="1" value={productionQuantity} onChange={(event) => setProductionQuantity(numberValue(event, 1))} /></label>
            <label><span>Due Date *</span><input type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} /></label>
            <button className="button button-primary" onClick={addRawMaterial}><Search size={17} /> ดึงข้อมูล</button>
          </div>
        ) : (
          <div className="legacy-pr-inputs equipment-filters">
            <label><span>Due Date *</span><input type="date" value={dueDate} onChange={(event) => {
              const value = event.target.value
              setDueDate(value)
              setEquipmentLines((current) => Object.fromEntries(Object.entries(current).map(([id, line]) => [id, { ...line, dueDate: value }])))
            }} /></label>
            <label><span>ค้นหารายการ</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Code, Name, Spec…" /></label>
            <label><span>Vendor</span><select value={vendorFilter} onChange={(event) => setVendorFilter(event.target.value)}><option value="">ทั้งหมด</option>{vendors.map((vendor) => <option key={vendor}>{vendor}</option>)}</select></label>
          </div>
        )}
        {(notice || error) && <div className={`flow-notice ${error ? 'error' : ''}`}>{error || notice}</div>}

        {isRaw ? (
          <RawMaterialTable lines={rawLines} updateLine={updateRawLine} removeLine={(lineId) => setRawLines((current) => current.filter((line) => line.lineId !== lineId))} />
        ) : (
          <EquipmentTable items={filteredEquipment} selected={equipmentLines} toggle={toggleEquipment} update={updateEquipment} />
        )}

        <div className="legacy-pr-actions">
          {isRaw && <button className="button button-secondary" disabled={!rawLines.length} onClick={() => setRawLines([])}>ล้างข้อมูล</button>}
          <button className="button button-primary" disabled={!lines.length} onClick={preview}><Printer size={17} /> สรุปและเตรียมพิมพ์</button>
        </div>
      </section>

      {previewOpen && createPortal(
        <div className="pr-preview-overlay" role="dialog" aria-modal="true" aria-label="PR Preview">
          <div className="pr-preview-panel">
            <header className="pr-preview-toolbar no-print">
              <button className="button button-secondary" onClick={closePreview}><X size={17} /> กลับไปแก้ไข</button>
              <div><strong>PR Preview</strong><span>{Object.keys(createdNumbers).length ? 'บันทึกเลขจริงแล้ว กดพิมพ์ซ้ำได้โดยไม่สร้างเลขใหม่' : 'ยังไม่จองเลข PR จนกดปุ่มพิมพ์'}</span></div>
              <button className="button button-primary" disabled={creating} onClick={() => void saveAndPrint()}>{creating ? <LoaderCircle className="spin" /> : <Printer size={17} />}{creating ? 'กำลังจองเลข…' : Object.keys(createdNumbers).length ? 'พิมพ์ซ้ำ' : 'บันทึก PR และพิมพ์'}</button>
            </header>
            {(error || notice) && <div className={`pr-preview-message no-print ${error ? 'error' : ''}`}>{error || notice}</div>}
            <div className="pr-preview-body">
              <div className="pr-preview-pages">
                {groups.map((group) => (
                  <PrPrintDocument
                    key={group.vendor}
                    draft={{
                      kind: isRaw ? 'raw-material' : 'equipment',
                      prNumber: createdNumbers[group.vendor] ?? 'รอกดพิมพ์',
                      requestDate: today(),
                      requestedBy: '',
                      items: group.items,
                    }}
                    pages={paginateVendorItems(group.vendor, group.items)}
                    logoUrl={`${import.meta.env.BASE_URL}logo-smt.jpg`}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </div>
  )
}

function RawMaterialTable({ lines, updateLine, removeLine }: {
  lines: PrLineItem[]
  updateLine: (lineId: string, patch: Partial<PrLineItem>) => void
  removeLine: (lineId: string) => void
}) {
  return <div className="table-wrap legacy-flow-table"><table className="data-table editable-table"><thead><tr><th>No.</th><th>Vendor</th><th>Item FG</th><th>Code RM</th><th>Name Part</th><th>Type</th><th>Spec</th><th>จำนวนผลิต</th><th>Q’ty</th><th>Price</th><th>Due Date</th><th>Comment</th><th>จัดการ</th></tr></thead><tbody>
    {!lines.length && <tr><td colSpan={13}><EmptyState title="ยังไม่มีรายการ" description="กรอก Item FG แล้วกดดึงข้อมูล ระบบจะแสดง Raw Material ทุก Vendor" /></td></tr>}
    {lines.map((line, index) => <tr key={line.lineId}>
      <td>{index + 1}</td>
      <td><span className="master-value" title="ข้อมูลจาก Master Data">{line.vendor || '-'}</span></td>
      <td><strong>{line.itemFg}</strong></td><td>{line.codeOrder || '-'}</td>
      <td><span className="master-value" title="ข้อมูลจาก Master Data">{line.namePart || '-'}</span></td>
      <td>{line.materialType || '-'}</td>
      <td><span className="master-value" title="ข้อมูลจาก Master Data">{line.spec || '-'}</span></td>
      <td>{line.fgQuantity}</td>
      <td><input className="number-input" type="number" min="0.0001" step="any" value={line.quantity} onChange={(event) => updateLine(line.lineId, { quantity: numberValue(event) })} /></td>
      <td><input className="number-input" type="number" min="0" step="0.01" value={line.unitPrice ?? 0} onChange={(event) => updateLine(line.lineId, { unitPrice: numberValue(event) })} /></td>
      <td><input type="date" value={line.dueDate ?? ''} onChange={(event) => updateLine(line.lineId, { dueDate: event.target.value })} /></td>
      <td><input value={line.comment ?? ''} onChange={(event) => updateLine(line.lineId, { comment: event.target.value })} /></td>
      <td><button className="icon-button danger" onClick={() => removeLine(line.lineId)} aria-label="ลบรายการ"><Trash2 size={16} /></button></td>
    </tr>)}
  </tbody></table></div>
}

function EquipmentTable({ items, selected, toggle, update }: {
  items: MaterialItem[]
  selected: Record<string, PrLineItem>
  toggle: (item: MaterialItem) => void
  update: (id: string, patch: Partial<PrLineItem>) => void
}) {
  return <div className="table-wrap legacy-flow-table"><table className="data-table editable-table"><thead><tr><th>เลือก</th><th>Code RM</th><th>Name Part</th><th>Spec / Dimension</th><th>Type</th><th>Vendor</th><th>Price</th><th>Q’ty</th></tr></thead><tbody>
    {items.map((item) => {
      const line = selected[item.id]
      return <tr key={item.id} className={line ? 'selected-row' : ''}>
        <td><input className="row-checkbox" type="checkbox" checked={Boolean(line)} onChange={() => toggle(item)} /></td>
        <td><strong>{item.orderCode || '-'}</strong></td><td>{item.partName}</td><td><strong>{item.spec}</strong><span>{item.dimension}</span></td><td>{item.materialType}</td><td>{item.vendor}</td>
        <td>{line ? <input className="number-input" type="number" min="0" step="0.01" value={line.unitPrice ?? 0} onChange={(event) => update(item.id, { unitPrice: numberValue(event) })} /> : item.unitPrice.toLocaleString()}</td>
        <td>{line ? <input className="number-input" type="number" min="0.0001" step="any" value={line.quantity} onChange={(event) => update(item.id, { quantity: numberValue(event) })} /> : '-'}</td>
      </tr>
    })}
  </tbody></table></div>
}
