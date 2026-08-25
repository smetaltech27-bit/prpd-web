import { CheckCircle2, FileText, Minus, Plus, Printer, Search, ShoppingCart, Trash2 } from 'lucide-react'
import { useMemo, useRef, useState } from 'react'
import type { MaterialItem } from '../types/domain'
import { planVendorPrs, PrPrintDocument, type PrLineItem } from '../features/pr'
import { printNode } from '../lib/print'
import { isSupabaseConfigured } from '../lib/supabase'
import { createPurchaseRequests } from '../services/prpdRepository'
import { EmptyState, PageHeader } from './AppShell'

interface PrBuilderProps {
  category: 'Raw Material' | 'Equipment'
  items: MaterialItem[]
}

export function PrBuilder({ category, items }: PrBuilderProps) {
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<Record<string, number>>({})
  const [notice, setNotice] = useState('')
  const [creating, setCreating] = useState(false)
  const [dueDate, setDueDate] = useState('')
  const [requester, setRequester] = useState('')
  const printRef = useRef<HTMLDivElement>(null)
  const filtered = useMemo(() => {
    const keyword = query.trim().toLowerCase()
    if (!keyword) return items
    return items.filter((item) => [item.itemFg, item.partName, item.spec, item.vendor, item.drawingNo].some((value) => value.toLowerCase().includes(keyword)))
  }, [items, query])
  const selectedItems = items.filter((item) => selected[item.id])
  const vendors = new Set(selectedItems.map((item) => item.vendor)).size
  const total = selectedItems.reduce((sum, item) => sum + item.unitPrice * selected[item.id], 0)
  const lineItems = useMemo<PrLineItem[]>(() => selectedItems.map((item) => ({
    id: item.id,
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
    quantity: selected[item.id],
  })), [selected, selectedItems])
  const prPlans = useMemo(() => planVendorPrs(lineItems, 1), [lineItems])

  function changeQuantity(id: string, change: number) {
    setSelected((current) => {
      const quantity = Math.max(0, (current[id] ?? 0) + change)
      if (!quantity) {
        const next = { ...current }
        delete next[id]
        return next
      }
      return { ...current, [id]: quantity }
    })
  }

  function preview() {
    if (!selectedItems.length) return
    setNotice(`${vendors} PR พร้อม Preview • แบ่งสูงสุด 12 รายการต่อหน้า และช่องเซ็นอยู่หน้าสุดท้าย`)
    requestAnimationFrame(() => {
      if (printRef.current) printNode(printRef.current, { title: 'PR Preview', orientation: 'landscape' })
    })
  }

  async function createPr() {
    if (!lineItems.length) return
    if (!isSupabaseConfigured) {
      setNotice('ยังไม่ได้เชื่อม Supabase จึงเปิด Print Preview โดยไม่บันทึกเลขจริง')
      preview()
      return
    }
    setCreating(true)
    try {
      const created = await createPurchaseRequests({
        kind: category === 'Raw Material' ? 'raw_material' : 'factory_supply',
        requestDate: new Date().toISOString().slice(0, 10),
        dueDate: dueDate || undefined,
        requesterName: requester || undefined,
        items: lineItems.map((item) => ({
          sourceId: item.id,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          dueDate: dueDate || undefined,
          comment: item.comment,
        })),
      })
      setNotice(`สร้าง ${created.length} PR สำเร็จ: ${created.map((item) => item.pr_number).join(', ')}`)
    } catch {
      setNotice('สร้าง PR ไม่สำเร็จ ระบบไม่ได้จองเลขบางส่วน กรุณาตรวจการเชื่อมต่อและลองใหม่')
    } finally {
      setCreating(false)
    }
  }

  return (
    <div className="page">
      <PageHeader
        eyebrow="PURCHASE REQUEST"
        title={`${category} PR`}
        description={category === 'Raw Material' ? 'ค้นหา Item FG เลือกวัตถุดิบ และสร้าง Purchase Request แยกตาม Vendor' : 'เลือก Factory Supply หรือ Equipment เพื่อสร้าง Purchase Request'}
        actions={<button className="button button-secondary" disabled={!selectedItems.length} onClick={preview}><Printer size={17} /> Print preview</button>}
      />
      <section className="metrics-grid">
        <article className="metric-card"><span className="metric-icon blue"><ShoppingCart /></span><div><small>Selected items</small><strong>{selectedItems.length}</strong><em>รายการ</em></div></article>
        <article className="metric-card"><span className="metric-icon cyan"><FileText /></span><div><small>PRs to create</small><strong>{vendors}</strong><em>แยกตาม Vendor</em></div></article>
        <article className="metric-card"><span className="metric-icon green"><CheckCircle2 /></span><div><small>Estimated total</small><strong>฿{total.toLocaleString()}</strong><em>ไม่รวม VAT</em></div></article>
      </section>
      <div className="workspace-grid">
        <section className="card catalog-card">
          <div className="card-header"><div><p className="eyebrow">MASTER DATA</p><h2>เลือกรายการ</h2></div><span className="record-count">{filtered.length} records</span></div>
          <label className="search-box">
            <Search size={19} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="ค้นหา Item FG, Part, Spec, Vendor…" />
            {query && <button onClick={() => setQuery('')} aria-label="ล้างคำค้นหา">×</button>}
          </label>
          <div className="table-wrap">
            <table className="data-table">
              <thead><tr><th>ITEM FG / PART</th><th>SPEC / MATERIAL</th><th>VENDOR</th><th className="align-right">UNIT PRICE</th><th className="align-center">QTY</th></tr></thead>
              <tbody>
                {filtered.map((item) => {
                  const quantity = selected[item.id] ?? 0
                  return (
                    <tr key={item.id} className={quantity ? 'selected-row' : ''}>
                      <td><strong>{item.itemFg}</strong><span>{item.partName}</span></td>
                      <td><strong>{item.spec}</strong><span>{item.materialType}</span></td>
                      <td><strong>{item.vendor}</strong><span>{item.dimension}</span></td>
                      <td className="align-right"><strong>฿{item.unitPrice.toLocaleString()}</strong></td>
                      <td><div className="stepper"><button onClick={() => changeQuantity(item.id, -1)} aria-label="ลดจำนวน"><Minus /></button><span>{quantity}</span><button onClick={() => changeQuantity(item.id, 1)} aria-label="เพิ่มจำนวน"><Plus /></button></div></td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </section>
        <aside className="card selection-card">
          <div className="card-header"><div><p className="eyebrow">PR BUILDER</p><h2>รายการที่เลือก</h2></div><span className="count-badge">{selectedItems.length}</span></div>
          <div className="selection-list">
            {!selectedItems.length && <EmptyState title="ยังไม่มีรายการ" description="กด + ในตารางเพื่อเพิ่มรายการลง PR" />}
            {selectedItems.map((item) => (
              <article className="selection-item" key={item.id}>
                <div><strong>{item.partName}</strong><span>{item.itemFg} • {item.vendor}</span></div>
                <b>× {selected[item.id]}</b>
                <button onClick={() => setSelected((current) => { const next = { ...current }; delete next[item.id]; return next })} aria-label="นำรายการออก"><Trash2 size={16} /></button>
              </article>
            ))}
          </div>
          {notice && <div className="inline-notice"><CheckCircle2 size={17} />{notice}</div>}
          <div className="selection-fields">
            <label className="field"><span>Requester</span><input value={requester} onChange={(event) => setRequester(event.target.value)} placeholder="ชื่อผู้ขอซื้อ" /></label>
            <label className="field"><span>Due date</span><input type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} /></label>
          </div>
          <div className="selection-summary"><span>รวมโดยประมาณ</span><strong>฿{total.toLocaleString()}</strong></div>
          <button className="button button-secondary button-full" disabled={!selectedItems.length} onClick={preview}><Printer size={17} /> Preview & Print PR</button>
          <button className="button button-primary button-full" disabled={!selectedItems.length || creating} onClick={() => void createPr()}><FileText size={17} /> {creating ? 'Creating…' : 'Create PR'}</button>
          <p className="helper-text">ระบบจะสร้างเลข PR หนึ่งเลขต่อ Vendor และจัดหน้าเอกสารสูงสุด 12 รายการต่อหน้า</p>
        </aside>
      </div>
      <div className="pr-print-host" ref={printRef} aria-hidden="true">
        {prPlans.map((plan) => (
          <PrPrintDocument
            key={plan.prNumber}
            draft={{
              kind: category === 'Raw Material' ? 'raw-material' : 'equipment',
              prNumber: plan.prNumber,
              requestDate: new Date().toISOString().slice(0, 10),
              requestedBy: '',
              items: plan.items,
            }}
            pages={plan.pages}
            logoUrl={`${import.meta.env.BASE_URL}logo-smt.jpg`}
          />
        ))}
      </div>
    </div>
  )
}
