import { CheckCircle2, FileText, LoaderCircle, Printer, X } from 'lucide-react'
import { useEffect, useState, type FormEvent, type SyntheticEvent } from 'react'
import { createPortal } from 'react-dom'
import { PageHeader } from '../components/AppShell'
import type { MaterialItem } from '../types/domain'
import { fetchPrivateDocument } from '../services/documentStorage'
import { findActiveDocuments, searchProductionItems, type ActiveDocumentAsset } from '../services/prpdRepository'
import './workOrder.css'

type PrintDocumentType = 'drawing' | 'inprocess'
type DocumentUrls = Partial<Record<PrintDocumentType, { asset: ActiveDocumentAsset; url: string }>>

const WORK_ORDER_PROCESSES = [
  { label: 'Cutting', qrData: 'Cutting', qrColumn: 'start' },
  { label: 'Milling', qrData: 'Milling', qrColumn: 'finish' },
  { label: 'CNC', qrData: 'CNC', qrColumn: 'start' },
  { label: 'Grinding', qrData: 'Grinding', qrColumn: 'finish' },
  { label: 'QC', qrData: 'Finished Goods', qrColumn: 'start' },
] as const

function dateText(value: string, shortYear = false): string {
  const [year, month, day] = value.split('-')
  if (!year || !month || !day) return value
  return `${day}/${month}/${shortYear ? year.slice(-2) : year}`
}

function qrUrl(value: string, size = 100): string {
  return `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encodeURIComponent(value)}`
}

function WorkOrderFirstPage({ master, quantity, deliveryDate, drawingUrl }: {
  master: MaterialItem
  quantity: number
  deliveryDate: string
  drawingUrl?: string
}) {
  return <article className="wo-page wo-cover-page print-page">
    <table className="wo-legacy-header" aria-label="หัวเอกสาร Work Order">
      <colgroup><col className="wo-logo-column" /><col className="wo-title-column" /><col className="wo-meta-label-column" /><col className="wo-meta-value-column" /><col className="wo-month-column" /></colgroup>
      <tbody>
        <tr><td className="wo-logo-cell" rowSpan={3}><img src={`${import.meta.env.BASE_URL}logo-smt.jpg`} alt="SMT" /></td><th>S METAL TECH</th><td className="wo-meta-label">หมายเลขเอกสาร :</td><td className="wo-meta-value">FM - MA - 001</td><td className="wo-month-cell" rowSpan={3}>Jul<br />2026</td></tr>
        <tr><th>ใบสั่งผลิต</th><td className="wo-meta-label">วันที่เริ่มใช้</td><td className="wo-meta-value">01/07/2026</td></tr>
        <tr><th>WORK ORDER</th><td className="wo-meta-label">แก้ไขครั้งที่</td><td className="wo-meta-value">00</td></tr>
      </tbody>
    </table>

    <section className="wo-job-information">
      <div className="wo-job-line wo-job-primary">
        <span className="wo-label">Name Part</span><strong>{master.partName || '-'}</strong>
        <span className="wo-label">ITEM</span><strong>{master.itemFg}</strong>
        <span className="wo-label">QTY</span><strong>{quantity}</strong><span>PCS.</span>
        <span className="wo-label wo-delivery-label">DELIVERY</span><strong>{dateText(deliveryDate, true)}</strong>
      </div>
      <div className="wo-job-secondary">
        <div className="wo-specification-lines">
          <div><span className="wo-label">SPEC.</span><strong>{master.spec || '-'}</strong></div>
          <div><span className="wo-label">DWG NO.</span><strong>{master.drawingNo || '-'}</strong></div>
        </div>
        <div className="wo-item-qr"><b>1</b><img src={qrUrl(master.itemFg, 150)} alt={`QR ${master.itemFg}`} /></div>
        <div className="wo-receiving-qr"><span>Receiving</span><img src={qrUrl('Receiving', 120)} alt="QR Receiving" /></div>
      </div>
    </section>

    <table className="wo-process-table" aria-label="ตารางติดตามกระบวนการผลิต">
      <colgroup><col className="wo-process-detail" /><col className="wo-process-qr" /><col className="wo-process-scan" /><col className="wo-process-material" /><col className="wo-process-result" /><col className="wo-process-result" /><col className="wo-process-balance" /><col className="wo-process-employee" /><col className="wo-process-note" /></colgroup>
      <thead><tr><th>Detail</th><th><span className="wo-step-number">2</span></th><th>สแกน Barcode เมื่อเริ่ม<br />ขึ้นงานและหลังเสร็จงาน</th><th>Mat'l<br />เข้า</th><th>F/G<small>(งานดี)</small></th><th>N/G<small>(งานเสีย)</small></th><th>ยอดคง<br />เหลือ<small>(ชิ้น)</small></th><th>ชื่อพนักงาน</th><th>หมายเหตุ</th></tr></thead>
      <tbody>{WORK_ORDER_PROCESSES.map((process) => <tr key={process.label}>
        <th>{process.label}</th>
        <td>{process.qrColumn === 'start' && <img src={qrUrl(process.qrData)} alt={`QR ${process.qrData}`} />}</td>
        <td>{process.qrColumn === 'finish' && <img src={qrUrl(process.qrData)} alt={`QR ${process.qrData}`} />}</td>
        <td /><td /><td /><td /><td /><td />
      </tr>)}</tbody>
    </table>

    <div className="wo-embedded-drawing">
      {drawingUrl ? <img src={drawingUrl} alt={`Drawing ${master.itemFg}`} /> : <span>ไม่พบรูปภาพ Drawing สำหรับแสดงในหน้า Work Order</span>}
    </div>
  </article>
}

function SupportingDocumentPage({ type, document, orientation, onImageLoad }: {
  type: PrintDocumentType
  document?: DocumentUrls[PrintDocumentType]
  orientation: 'portrait' | 'landscape'
  onImageLoad: (event: SyntheticEvent<HTMLImageElement>) => void
}) {
  const label = type === 'inprocess' ? 'Inprocess Check Sheet' : 'Drawing'
  return <article className={`wo-page wo-document-page ${orientation} print-page`}>
    {!document
      ? <div className="wo-missing-document"><strong>{label}</strong><span>ไม่พบไฟล์ Active สำหรับเอกสารนี้</span></div>
      : document.asset.mimeType === 'application/pdf'
        ? <iframe src={document.url} title={document.asset.filename} />
        : <img src={document.url} alt={document.asset.filename} onLoad={onImageLoad} className={type === 'inprocess' ? 'fill' : 'contain'} />}
  </article>
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
  const [printSuccess, setPrintSuccess] = useState(false)

  useEffect(() => () => {
    Object.values(documents).forEach((document) => URL.revokeObjectURL(document.url))
  }, [documents])

  useEffect(() => {
    if (!previewOpen) return
    const showPrintSuccess = () => {
      setPreviewOpen(false)
      setPrintSuccess(true)
    }
    window.addEventListener('afterprint', showPrintSuccess)
    return () => window.removeEventListener('afterprint', showPrintSuccess)
  }, [previewOpen])

  function startNewWorkOrder() {
    setPrintSuccess(false)
    setItemFg('')
    setQuantity(1)
    setDeliveryDate('')
    setMaster(null)
    setDocuments({})
    setOrientation({})
    setError('')
  }

  async function load(event: FormEvent) {
    event.preventDefault()
    if (!itemFg.trim() || quantity <= 0 || !deliveryDate) {
      setError('กรุณากรอก Item FG, QTY และ Delivery Date ให้ครบ')
      return
    }
    setLoading(true)
    setError('')
    setPreviewOpen(false)
    setDocuments({})
    try {
      const matches = await searchProductionItems(itemFg.trim(), 10)
      const normalized = itemFg.trim().toLocaleUpperCase()
      const exact = matches.find((item) => item.itemFg.trim().toLocaleUpperCase() === normalized)
      if (!exact) throw new Error(`ไม่พบ Item FG “${itemFg.trim()}” ใน Production Item Master`)

      const assets = (await findActiveDocuments(exact.itemFg)).filter((asset) => asset.type === 'drawing' || asset.type === 'inprocess')
      const loadedEntries = await Promise.all(assets.map(async (asset) => {
        const blob = await fetchPrivateDocument(asset)
        return [asset.type, { asset, url: URL.createObjectURL(blob) }] as const
      }))
      setMaster(exact)
      setDocuments(Object.fromEntries(loadedEntries))
      setPreviewOpen(true)
    } catch (reason) {
      setMaster(null)
      setError(reason instanceof Error ? reason.message : 'สร้างใบ Work Order ไม่สำเร็จ')
    } finally {
      setLoading(false)
    }
  }

  function rememberOrientation(type: PrintDocumentType, event: SyntheticEvent<HTMLImageElement>) {
    const image = event.currentTarget
    setOrientation((current) => ({ ...current, [type]: image.naturalWidth > image.naturalHeight ? 'landscape' : 'portrait' }))
  }

  const drawingForFirstPage = documents.drawing?.asset.mimeType === 'application/pdf' ? undefined : documents.drawing?.url

  return <div className="page">
    <PageHeader eyebrow="PRODUCTION" title="Work Order" description="ค้นหา Item FG และสร้างชุดเอกสารสำหรับเริ่มงานผลิต" />
    <section className="card workorder-setup">
      <div className="card-header"><div><p className="eyebrow">JOB SETUP</p><h2>รายละเอียดใบสั่งงาน</h2></div><span className="status-pill blue">Work Order</span></div>
      <form className="form-grid" onSubmit={load}>
        <label><span>Item FG *</span><input value={itemFg} onChange={(event) => setItemFg(event.target.value)} placeholder="เช่น TM4207A" /></label>
        <label><span>QTY *</span><input type="number" min="1" value={quantity} onChange={(event) => setQuantity(Math.max(1, Number(event.target.value)))} /></label>
        <label><span>Delivery Date *</span><input type="date" value={deliveryDate} onChange={(event) => setDeliveryDate(event.target.value)} /></label>
        <button className="button button-primary" type="submit" disabled={loading}>{loading ? <LoaderCircle className="spin" /> : <FileText size={17} />}{loading ? 'กำลังสร้าง…' : 'สร้างใบ Work Order'}</button>
      </form>
      {error && <div className="flow-notice error">{error}</div>}
    </section>

    {master && previewOpen && createPortal(<div className="wo-preview-overlay" role="dialog" aria-modal="true" aria-label="Work Order Preview"><div className="wo-preview-panel">
      <header className="wo-preview-toolbar no-print"><button className="button button-secondary" onClick={() => setPreviewOpen(false)}><X size={17} /> กลับไปแก้ไข</button><div><strong>Work Order Print Preview</strong><span>Work Order → Inprocess Check Sheet → Drawing (3 แผ่น)</span></div><button className="button button-primary" onClick={() => requestAnimationFrame(() => window.print())}><Printer size={17} /> พิมพ์เอกสาร</button></header>
      <div className="wo-preview-body"><div className="wo-print-root">
        <WorkOrderFirstPage master={master} quantity={quantity} deliveryDate={deliveryDate} drawingUrl={drawingForFirstPage} />
        <SupportingDocumentPage type="inprocess" document={documents.inprocess} orientation={orientation.inprocess ?? 'portrait'} onImageLoad={(event) => rememberOrientation('inprocess', event)} />
        <SupportingDocumentPage type="drawing" document={documents.drawing} orientation={orientation.drawing ?? 'portrait'} onImageLoad={(event) => rememberOrientation('drawing', event)} />
      </div></div>
    </div></div>, document.body)}
    {printSuccess && createPortal(<div className="modal-overlay print-success-overlay" role="presentation">
      <section className="modal-panel print-success-panel" role="dialog" aria-modal="true" aria-labelledby="print-success-title">
        <header className="modal-header"><span className="modal-icon success"><CheckCircle2 size={24} /></span><div><p className="eyebrow">PRINT COMPLETE</p><h2 id="print-success-title">พิมพ์สำเร็จ</h2></div></header>
        <div className="modal-body"><p className="print-success-message">พิมพ์เอกสาร Work Order สำเร็จแล้ว กด OK เพื่อกลับไปเริ่มสร้างใบสั่งผลิตใหม่</p></div>
        <footer className="modal-footer"><button className="button button-primary" type="button" onClick={startNewWorkOrder}>OK</button></footer>
      </section>
    </div>, document.body)}
  </div>
}
