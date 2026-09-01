import { CheckCircle2, LoaderCircle, Printer, Search, Trash2, X } from 'lucide-react'
import { useMemo, useRef, useState, type ChangeEvent } from 'react'
import { createPortal } from 'react-dom'
import type { MaterialItem } from '../types/domain'
import {
  bangkokToday,
  createRawMaterialLines,
  formatIsoDate,
  groupItemsByVendor,
  isPastDueDate,
  paginateVendorItems,
  PrPrintDocument,
  type PrLineItem,
} from '../features/pr'
import { isSupabaseConfigured } from '../lib/supabase'
import {
  confirmPurchaseRequestsPrinted,
  discardPurchaseRequestDrafts,
  reservePurchaseRequestsForPrint,
  updatePurchaseRequestDraftsForPrint,
  type CreatedPr,
} from '../services/prpdRepository'
import { EmptyState, PageHeader } from './AppShell'

interface PrBuilderProps {
  category: 'Raw Material' | 'Equipment'
  items: MaterialItem[]
}

function numberValue(event: ChangeEvent<HTMLInputElement>, minimum = 0): number {
  const value = Number(event.target.value)
  return Number.isFinite(value) ? Math.max(minimum, value) : minimum
}

function vendorKey(value: string): string {
  return value.trim().replace(/\s+/g, ' ').toLocaleLowerCase()
}

function toPrInputItem(line: PrLineItem) {
  return {
    sourceId: line.id,
    quantity: line.quantity,
    fgQty: line.fgQuantity,
    unitPrice: line.unitPrice,
    dueDate: line.dueDate,
    comment: line.comment,
    vendorName: line.vendor,
    namePart: line.namePart,
    spec: line.spec,
  }
}

export function PrBuilder({ category, items }: PrBuilderProps) {
  const isRaw = category === 'Raw Material'
  const minimumDueDate = bangkokToday()
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
  const [finalizingPrint, setFinalizingPrint] = useState(false)
  const [reservedPrs, setReservedPrs] = useState<CreatedPr[]>([])
  const [printConfirmationOpen, setPrintConfirmationOpen] = useState(false)

  const lines = useMemo(
    () => isRaw ? rawLines : Object.values(equipmentLines),
    [equipmentLines, isRaw, rawLines],
  )
  const groups = useMemo(() => groupItemsByVendor(lines), [lines])
  const createdNumbers = useMemo(
    () => Object.fromEntries(reservedPrs.map((record) => [record.vendor_name, record.pr_number])),
    [reservedPrs],
  )
  const createdIds = useMemo(() => reservedPrs.map((record) => record.id), [reservedPrs])
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
    if (isPastDueDate(dueDate, minimumDueDate)) {
      showPastDueDateError()
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
    if (patch.dueDate && isPastDueDate(patch.dueDate, minimumDueDate)) {
      showPastDueDateError()
      return
    }
    if (patch.dueDate) setError('')
    setRawLines((current) => current.map((line) => line.lineId === lineId ? { ...line, ...patch } : line))
  }

  function clearRawMaterialSearch() {
    setItemFg('')
    setProductionQuantity(1)
    setDueDate('')
    setError('')
    setNotice('')
  }

  function toggleEquipment(item: MaterialItem) {
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
    if (patch.dueDate && isPastDueDate(patch.dueDate, minimumDueDate)) {
      showPastDueDateError()
      return
    }
    if (patch.dueDate) setError('')
    setEquipmentLines((current) => current[id] ? { ...current, [id]: { ...current[id], ...patch } } : current)
  }

  function clearEquipmentSelection() {
    setEquipmentLines({})
    setError('')
    setNotice('ล้างรายการที่เลือกทั้งหมดแล้ว')
  }

  function showPastDueDateError() {
    setNotice('')
    setError(`Due Date ต้องไม่ย้อนหลังวันปัจจุบัน กรุณาเลือกตั้งแต่ ${formatIsoDate(minimumDueDate)} เป็นต้นไป`)
  }

  function updateHeaderDueDate(value: string) {
    if (isPastDueDate(value, minimumDueDate)) {
      showPastDueDateError()
      return
    }
    setError('')
    setDueDate(value)
    if (!isRaw) {
      setEquipmentLines((current) => Object.fromEntries(Object.entries(current).map(([id, line]) => [id, { ...line, dueDate: value }])))
    }
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
    if (lines.some((line) => isPastDueDate(line.dueDate ?? '', minimumDueDate))) {
      showPastDueDateError()
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
    let handled = false
    const showConfirmation = () => {
      if (handled) return
      handled = true
      window.removeEventListener('afterprint', showConfirmation)
      setPrintConfirmationOpen(true)
    }
    window.addEventListener('afterprint', showConfirmation, { once: true })
    requestAnimationFrame(() => requestAnimationFrame(() => {
      window.print()
      window.setTimeout(showConfirmation, 0)
    }))
  }

  async function saveAndPrint() {
    if (!validateDraft()) return
    if (!isSupabaseConfigured) {
      setError('ยังไม่ได้เชื่อม Supabase จึงไม่สามารถจองเลข PR จริงได้')
      return
    }
    setCreating(true)
    setError('')
    try {
      const kind = isRaw ? 'raw_material' : 'factory_supply'
      let nextReserved: CreatedPr[]

      if (!reservedPrs.length) {
        nextReserved = await reservePurchaseRequestsForPrint({
          kind,
          requestDate: minimumDueDate,
          dueDate: dueDate || undefined,
          items: lines.map(toPrInputItem),
        })
      } else {
        const groupByVendor = new Map(groups.map((group) => [vendorKey(group.vendor), group]))
        const reservedByVendor = new Map(reservedPrs.map((record) => [vendorKey(record.vendor_name), record]))
        const existingDrafts = reservedPrs.flatMap((record) => {
          const group = groupByVendor.get(vendorKey(record.vendor_name))
          return group ? [{ id: record.id, items: group.items.map(toPrInputItem) }] : []
        })
        const staleDrafts = reservedPrs.filter((record) => !groupByVendor.has(vendorKey(record.vendor_name)))
        const newGroups = groups.filter((group) => !reservedByVendor.has(vendorKey(group.vendor)))

        nextReserved = existingDrafts.length
          ? await updatePurchaseRequestDraftsForPrint({ kind, dueDate: dueDate || undefined, drafts: existingDrafts })
          : []

        if (newGroups.length) {
          const created = await reservePurchaseRequestsForPrint({
            kind,
            requestDate: minimumDueDate,
            dueDate: dueDate || undefined,
            items: newGroups.flatMap((group) => group.items.map(toPrInputItem)),
          })
          nextReserved = [...nextReserved, ...created]
          setReservedPrs([...nextReserved, ...staleDrafts])
        }

        if (staleDrafts.length) {
          await discardPurchaseRequestDrafts(staleDrafts.map((record) => record.id))
        }
      }

      setReservedPrs(nextReserved)
      setNotice(`ใช้เลข ${nextReserved.map((record) => record.pr_number).join(', ')} สำหรับการพิมพ์ครั้งนี้ กรุณายืนยันหลังปิดหน้าพิมพ์`)
      printCurrentPreview()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'จองเลข PR ไม่สำเร็จ ระบบไม่ได้บันทึกรายการบางส่วน')
    } finally {
      setCreating(false)
    }
  }

  function closePreview() {
    setPreviewOpen(false)
  }

  async function confirmPrinted() {
    if (!createdIds.length) return
    setFinalizingPrint(true)
    setError('')
    try {
      await confirmPurchaseRequestsPrinted(createdIds)
      const numberList = Object.values(createdNumbers).join(', ')
      setPrintConfirmationOpen(false)
      setPreviewOpen(false)
      setRawLines([])
      setEquipmentLines({})
      setReservedPrs([])
      setNotice(`ยืนยันการพิมพ์และบันทึก ${numberList} ใน PR History แล้ว`)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'ยืนยันผลการพิมพ์ไม่สำเร็จ กรุณาลองอีกครั้ง')
    } finally {
      setFinalizingPrint(false)
    }
  }

  function cancelPrintAndEdit() {
    setError('')
    setPrintConfirmationOpen(false)
    setPreviewOpen(false)
    setNotice(`กลับไปแก้ไขได้ โดยยังคงจองเลข ${Object.values(createdNumbers).join(', ')} ไว้ให้ใช้พิมพ์รอบถัดไป`)
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
            <label><span>Due Date *</span><input type="date" min={minimumDueDate} value={dueDate} onChange={(event) => updateHeaderDueDate(event.target.value)} /></label>
            <div className="legacy-pr-input-actions">
              <button className="button button-secondary" type="button" onClick={clearRawMaterialSearch} disabled={!itemFg && productionQuantity === 1 && !dueDate} title="ล้างเฉพาะข้อมูลค้นหา โดยไม่ล้างรายการที่เลือก"><X size={17} /> ล้างข้อมูล</button>
              <button className="button button-primary" onClick={addRawMaterial}><Search size={17} /> ดึงข้อมูล</button>
            </div>
          </div>
        ) : (
          <div className="legacy-pr-inputs equipment-filters">
            <label><span>Due Date *</span><input type="date" min={minimumDueDate} value={dueDate} onChange={(event) => updateHeaderDueDate(event.target.value)} /></label>
            <label><span>ค้นหารายการ</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Code, Name, Spec…" /></label>
            <label><span>Vendor</span><select value={vendorFilter} onChange={(event) => setVendorFilter(event.target.value)}><option value="">ทั้งหมด</option>{vendors.map((vendor) => <option key={vendor}>{vendor}</option>)}</select></label>
          </div>
        )}
        {(notice || error) && <div className={`flow-notice ${error ? 'error' : ''}`}>{error || notice}</div>}

        {isRaw ? (
          <RawMaterialTable lines={rawLines} minimumDueDate={minimumDueDate} updateLine={updateRawLine} removeLine={(lineId) => setRawLines((current) => current.filter((line) => line.lineId !== lineId))} />
        ) : (
          <EquipmentTable items={filteredEquipment} selected={equipmentLines} toggle={toggleEquipment} update={updateEquipment} />
        )}

        <div className="legacy-pr-actions">
          {!isRaw && <button className="button button-secondary" disabled={!lines.length} onClick={clearEquipmentSelection}>ล้างข้อมูล</button>}
          <button className="button button-primary" disabled={!lines.length} onClick={preview}><Printer size={17} /> สรุปและเตรียมพิมพ์</button>
        </div>
      </section>

      {previewOpen && createPortal(
        <div className="pr-preview-overlay" role="dialog" aria-modal="true" aria-label="PR Preview">
          <div className="pr-preview-panel">
            <header className="pr-preview-toolbar no-print">
              <button className="button button-secondary" onClick={closePreview}><X size={17} /> กลับไปแก้ไข</button>
              <div><strong>PR Preview</strong><span>{Object.keys(createdNumbers).length ? 'จองเลขชั่วคราวแล้ว รอยืนยันผลการพิมพ์' : 'ยังไม่จองเลข PR จนกดปุ่มพิมพ์'}</span></div>
              <button className="button button-primary" disabled={creating} onClick={() => void saveAndPrint()}>{creating ? <LoaderCircle className="spin" /> : <Printer size={17} />}{creating ? 'กำลังจองเลข…' : Object.keys(createdNumbers).length ? 'พิมพ์อีกครั้ง' : 'จองเลข PR และพิมพ์'}</button>
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
                      requestDate: minimumDueDate,
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
          {printConfirmationOpen && (
            <div className="modal-overlay print-confirm-overlay no-print" role="presentation">
              <section className="modal-panel print-confirm-panel" role="dialog" aria-modal="true" aria-labelledby="print-confirm-title">
                <header className="modal-header">
                  <span className="modal-icon"><Printer size={22} /></span>
                  <div><span className="eyebrow">PRINT CONFIRMATION</span><h2 id="print-confirm-title">ยืนยันพิมพ์เอกสาร</h2></div>
                  <span />
                </header>
                <div className="modal-body">
                  <div className="print-confirm-numbers"><span>เลข PR ที่จองชั่วคราว</span><strong>{Object.values(createdNumbers).join(', ')}</strong></div>
                  {error && <div className="flow-notice error">{error}</div>}
                </div>
                <footer className="modal-footer">
                  <button className="button button-secondary" disabled={finalizingPrint} onClick={cancelPrintAndEdit}>ยังไม่ได้พิมพ์ / กลับไปแก้ไข</button>
                  <button className="button button-primary" disabled={finalizingPrint} onClick={() => void confirmPrinted()}>{finalizingPrint ? <LoaderCircle className="spin" /> : <CheckCircle2 size={17} />}{finalizingPrint ? 'กำลังบันทึก…' : 'ยืนยันพิมพ์'}</button>
                </footer>
              </section>
            </div>
          )}
        </div>,
        document.body,
      )}
    </div>
  )
}

function RawMaterialTable({ lines, minimumDueDate, updateLine, removeLine }: {
  lines: PrLineItem[]
  minimumDueDate: string
  updateLine: (lineId: string, patch: Partial<PrLineItem>) => void
  removeLine: (lineId: string) => void
}) {
  return <div className="table-wrap legacy-flow-table"><table className="data-table editable-table raw-material-table"><thead><tr><th>No.</th><th>Vendor</th><th>Item FG</th><th>Code RM</th><th>Name Part</th><th>Type</th><th>Spec</th><th>จำนวนผลิต</th><th>Q’ty</th><th>Price</th><th>Due Date</th><th>Comment</th><th>จัดการ</th></tr></thead><tbody>
    {!lines.length && <tr><td colSpan={13}><EmptyState title="ยังไม่มีรายการ" description="กรอก Item FG แล้วกดดึงข้อมูล ระบบจะแสดง Raw Material ทุก Vendor" /></td></tr>}
    {lines.map((line, index) => <tr key={line.lineId}>
      <td>{index + 1}</td>
      <td><span className="master-value" title="ข้อมูลจาก Master Data">{line.vendor || '-'}</span></td>
      <td><span className="item-fg-value">{line.itemFg}</span></td><td>{line.codeOrder || '-'}</td>
      <td><span className="master-value" title="ข้อมูลจาก Master Data">{line.namePart || '-'}</span></td>
      <td>{line.materialType || '-'}</td>
      <td><span className="master-value" title="ข้อมูลจาก Master Data">{line.spec || '-'}</span></td>
      <td>{line.fgQuantity}</td>
      <td><input className="number-input" type="number" min="0.0001" step="any" value={line.quantity} onChange={(event) => updateLine(line.lineId, { quantity: numberValue(event) })} /></td>
      <td><input className="number-input" type="number" min="0" step="0.01" value={line.unitPrice ?? 0} onChange={(event) => updateLine(line.lineId, { unitPrice: numberValue(event) })} /></td>
      <td><input type="date" min={minimumDueDate} value={line.dueDate ?? ''} onChange={(event) => updateLine(line.lineId, { dueDate: event.target.value })} /></td>
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
  return <div className="table-wrap legacy-flow-table"><table className="data-table editable-table equipment-pr-table"><thead><tr><th>เลือก</th><th>Code RM</th><th>Name Part</th><th>Spec</th><th>Dimension</th><th>Type</th><th>Vendor</th><th>Price</th><th>Q’ty</th></tr></thead><tbody>
    {items.map((item) => {
      const line = selected[item.id]
      return <tr key={item.id} className={line ? 'selected-row' : ''}>
        <td><input className="row-checkbox" type="checkbox" checked={Boolean(line)} onChange={() => toggle(item)} /></td>
        <td>{item.orderCode || '-'}</td><td>{item.partName}</td><td>{item.spec || '-'}</td><td>{item.dimension || '-'}</td><td>{item.materialType}</td><td>{item.vendor}</td>
        <td>{line ? <input className="number-input" type="number" min="0" step="0.01" value={line.unitPrice ?? 0} onChange={(event) => update(item.id, { unitPrice: numberValue(event) })} /> : item.unitPrice.toLocaleString()}</td>
        <td>{line ? <input className="number-input" type="number" min="0.0001" step="any" value={line.quantity} onChange={(event) => update(item.id, { quantity: numberValue(event) })} /> : '-'}</td>
      </tr>
    })}
  </tbody></table></div>
}
