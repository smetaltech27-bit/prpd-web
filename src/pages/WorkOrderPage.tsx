import { CheckCircle2, ClipboardCheck, FileImage, FileWarning, LoaderCircle, Play, Printer, X } from 'lucide-react'
import { useEffect, useMemo, useState, type FormEvent, type SyntheticEvent } from 'react'
import { createPortal } from 'react-dom'
import { PageHeader } from '../components/AppShell'
import type { MaterialItem } from '../types/domain'
import { fetchPrivateDocument } from '../services/documentStorage'
import { findActiveDocuments, listRawMaterials, type ActiveDocumentAsset } from '../services/prpdRepository'
import './workOrder.css'

type DocumentUrls = Partial<Record<'drawing' | 'inprocess' | 'qc', { asset: ActiveDocumentAsset; url: string }>>

function dateText(value: string): string {
  const [year, month, day] = value.split('-')
  return year && month && day ? `${day}/${month}/${year}` : value
}

export function WorkOrderPage() {
  const [itemFg, setItemFg] = useState('')
  const [quantity, setQuantity] = useState(1)
  const [deliveryDate, setDeliveryDate] = useState('')
  const [master, setMaster] = useState<MaterialItem | null>(null)
  const [documents, setDocuments] = useState<DocumentUrls>({})
  const [orientation, setOrientation] = useState<Record<string, 'portrait' | 'landscape'>>({})
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [previewOpen, setPreviewOpen] = useState(false)

  useEffect(() => () => {
    Object.values(documents).forEach((document) => URL.revokeObjectURL(document.url))
  }, [documents])

  async function load(event: FormEvent) {
    event.preventDefault()
    if (!itemFg.trim() || quantity <= 0 || !deliveryDate) {
      setError('กรุณากรอก Item FG, QTY และ Delivery Date ให้ครบ')
      return
    }
    setLoading(true)
    setError('')
    Object.values(documents).forEach((document) => URL.revokeObjectURL(document.url))
    setDocuments({})
    try {
      const matches = await listRawMaterials(itemFg.trim())
      const normalized = itemFg.trim().toLocaleUpperCase()
      const exact = matches.find((item) => item.itemFg.trim().toLocaleUpperCase() === normalized)
      if (!exact) throw new Error(`ไม่พบ Item FG “${itemFg.trim()}” ใน Raw Material Master`)
      setMaster(exact)
      const assets = await findActiveDocuments(exact.itemFg)
      const loadedEntries = await Promise.all(assets.map(async (asset) => {
        const blob = await fetchPrivateDocument(asset)
        return [asset.type, { asset, url: URL.createObjectURL(blob) }] as const
      }))
      setDocuments(Object.fromEntries(loadedEntries))
    } catch (reason) {
      setMaster(null)
      setError(reason instanceof Error ? reason.message : 'โหลด Work Order ไม่สำเร็จ')
    } finally {
      setLoading(false)
    }
  }

  function rememberOrientation(type: string, event: SyntheticEvent<HTMLImageElement>) {
    const image = event.currentTarget
    setOrientation((current) => ({ ...current, [type]: image.naturalWidth > image.naturalHeight ? 'landscape' : 'portrait' }))
  }

  const documentRows = useMemo(() => [
    { type: 'drawing' as const, label: 'Drawing', Icon: FileImage },
    { type: 'inprocess' as const, label: 'Inprocess Check Sheet', Icon: ClipboardCheck },
    { type: 'qc' as const, label: 'QC Check Sheet', Icon: CheckCircle2 },
  ], [])

  return <div className="page">
    <PageHeader eyebrow="PRODUCTION" title="Work Order" description="ค้นหา Item FG และจัดชุดเอกสารตามระบบเดิมสำหรับเริ่มงานผลิต" actions={<button className="button button-secondary" disabled={!master} onClick={() => setPreviewOpen(true)}><Printer size={17} /> Preview print set</button>} />
    <section className="card workorder-setup">
      <div className="card-header"><div><p className="eyebrow">JOB SETUP</p><h2>รายละเอียดใบสั่งงาน</h2></div><span className="status-pill blue">Work Order</span></div>
      <form className="form-grid" onSubmit={load}>
        <label><span>Item FG *</span><input value={itemFg} onChange={(event) => setItemFg(event.target.value)} placeholder="เช่น TM4207A" /></label>
        <label><span>QTY *</span><input type="number" min="1" value={quantity} onChange={(event) => setQuantity(Math.max(1, Number(event.target.value)))} /></label>
        <label><span>Delivery Date *</span><input type="date" value={deliveryDate} onChange={(event) => setDeliveryDate(event.target.value)} /></label>
        <button className="button button-primary" type="submit" disabled={loading}>{loading ? <LoaderCircle className="spin" /> : <Play size={17} />}{loading ? 'กำลังดึงข้อมูล…' : 'ดึงข้อมูล'}</button>
      </form>
      {error && <div className="flow-notice error">{error}</div>}
    </section>
    {master && <div className="workorder-grid">
      <section className="card job-summary"><p className="eyebrow">JOB SUMMARY</p><h2>{master.partName}</h2><dl><div><dt>Item FG</dt><dd>{master.itemFg}</dd></div><div><dt>Drawing No.</dt><dd>{master.drawingNo || '-'}</dd></div><div><dt>Quantity</dt><dd>{quantity}</dd></div><div><dt>Delivery</dt><dd>{dateText(deliveryDate)}</dd></div><div><dt>Spec</dt><dd>{master.spec || '-'}</dd></div></dl></section>
      <section className="card document-pack"><div className="card-header"><div><p className="eyebrow">DOCUMENT PACK</p><h2>เอกสารประกอบการผลิต</h2></div></div>
        {documentRows.map(({ type, label, Icon }) => <article className="pack-item" key={type}><span><Icon size={19} /></span><div><strong>{label}</strong><small className={documents[type] ? '' : 'missing-text'}>{documents[type] ? `พร้อม • ${documents[type]?.asset.filename}` : 'ไม่พบไฟล์ Active'}</small></div>{documents[type] ? <button className="button button-ghost" onClick={() => window.open(documents[type]?.url, '_blank', 'noopener,noreferrer')}>Preview</button> : <FileWarning size={18} />}</article>)}
        <p className="helper-text">ชุด Work Order จะเรียง หน้า Work Order → Inprocess → Drawing ตามระบบเดิม ส่วน QC พิมพ์จากเมนู QC Check Sheet</p>
      </section>
    </div>}

    {master && previewOpen && createPortal(<div className="wo-preview-overlay" role="dialog" aria-modal="true" aria-label="Work Order Preview"><div className="wo-preview-panel">
      <header className="wo-preview-toolbar no-print"><button className="button button-secondary" onClick={() => setPreviewOpen(false)}><X size={17} /> กลับไปแก้ไข</button><div><strong>Work Order Print Preview</strong><span>หน้า Work Order → Inprocess → Drawing</span></div><button className="button button-primary" onClick={() => requestAnimationFrame(() => window.print())}><Printer size={17} /> พิมพ์เอกสาร</button></header>
      <div className="wo-preview-body"><div className="wo-print-root">
        <article className="wo-page wo-cover-page print-page">
          <header><img src={`${import.meta.env.BASE_URL}logo-smt.jpg`} alt="S Metal Tech" /><div><strong>S Metal Tech Co.,Ltd.</strong><span>WORK ORDER</span></div><dl><div><dt>Document No.</dt><dd>FM-MA-001</dd></div><div><dt>Revision</dt><dd>00</dd></div></dl></header>
          <section className="wo-job-title"><div><span>Name Part</span><strong>{master.partName}</strong></div><div><span>Item FG</span><strong>{master.itemFg}</strong></div><div><span>QTY</span><strong>{quantity}</strong></div><div><span>Delivery Date</span><strong>{dateText(deliveryDate)}</strong></div><div><span>Spec</span><strong>{master.spec || '-'}</strong></div><div><span>Drawing No.</span><strong>{master.drawingNo || '-'}</strong></div></section>
          <section className="wo-tracking"><div className="wo-qr"><img src={`https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=${encodeURIComponent(master.itemFg)}`} alt={`QR ${master.itemFg}`} /><strong>{master.itemFg}</strong></div><table><thead><tr><th>Process</th><th>Operator</th><th>Date</th><th>Result / Remark</th></tr></thead><tbody>{['Material receiving', 'Cutting', 'Milling', 'CNC', 'Grinding', 'QC'].map((process) => <tr key={process}><td>{process}</td><td /><td /><td /></tr>)}</tbody></table></section>
          {documents.drawing && documents.drawing.asset.mimeType !== 'application/pdf' && <div className="wo-drawing-thumb"><img src={documents.drawing.url} alt="Drawing" /></div>}
          <footer><span>Start date: 01/04/2024</span><span>Prepared by __________</span><span>Approved by __________</span></footer>
        </article>
        {(['inprocess', 'drawing'] as const).map((type) => documents[type] ? <article className={`wo-page wo-document-page ${orientation[type] ?? 'portrait'} print-page`} key={type}>{documents[type]?.asset.mimeType === 'application/pdf' ? <iframe src={documents[type]?.url} title={documents[type]?.asset.filename} /> : <img src={documents[type]?.url} alt={documents[type]?.asset.filename} onLoad={(event) => rememberOrientation(type, event)} className={type === 'inprocess' ? 'fill' : 'contain'} />}</article> : null)}
      </div></div>
    </div></div>, document.body)}
  </div>
}
