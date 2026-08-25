import { CheckCircle2, ClipboardCheck, FileImage, Play, Printer, Search } from 'lucide-react'
import { useState } from 'react'
import { PageHeader } from '../components/AppShell'

export function WorkOrderPage() {
  const [itemFg, setItemFg] = useState('')
  const [quantity, setQuantity] = useState(1)
  const [loaded, setLoaded] = useState(false)
  return (
    <div className="page">
      <PageHeader eyebrow="PRODUCTION" title="Work Order" description="ค้นหา Item FG และจัดชุดเอกสารสำหรับเริ่มงานผลิต" actions={<button className="button button-secondary" disabled={!loaded} onClick={() => window.print()}><Printer size={17} /> Print set</button>} />
      <section className="card workorder-setup">
        <div className="card-header"><div><p className="eyebrow">JOB SETUP</p><h2>รายละเอียดใบสั่งงาน</h2></div><span className="status-pill blue">New work order</span></div>
        <form className="form-grid" onSubmit={(event) => { event.preventDefault(); setLoaded(Boolean(itemFg.trim())) }}>
          <label><span>Item FG</span><div className="input-with-icon"><Search size={18} /><input value={itemFg} onChange={(event) => setItemFg(event.target.value)} placeholder="เช่น TM4207A" /></div></label>
          <label><span>Production quantity</span><input type="number" min="1" value={quantity} onChange={(event) => setQuantity(Math.max(1, Number(event.target.value)))} /></label>
          <label><span>Due date</span><input type="date" /></label>
          <button className="button button-primary" type="submit"><Play size={17} /> Load work order</button>
        </form>
      </section>
      {loaded && <div className="workorder-grid">
        <section className="card job-summary"><p className="eyebrow">JOB SUMMARY</p><h2>ARM A</h2><dl><div><dt>Item FG</dt><dd>{itemFg.toUpperCase()}</dd></div><div><dt>Drawing No.</dt><dd>MT524685A</dd></div><div><dt>Quantity</dt><dd>{quantity}</dd></div><div><dt>Material</dt><dd>BRASS BAR</dd></div></dl></section>
        <section className="card document-pack"><div className="card-header"><div><p className="eyebrow">DOCUMENT PACK</p><h2>เอกสารประกอบการผลิต</h2></div></div>
          {[['Drawing', FileImage], ['Inprocess Check Sheet', ClipboardCheck], ['QC Check Sheet', CheckCircle2]].map(([label, Icon]) => <article className="pack-item" key={String(label)}><span><Icon size={19} /></span><div><strong>{String(label)}</strong><small>พร้อมพิมพ์</small></div><button className="button button-ghost">Preview</button></article>)}
        </section>
      </div>}
    </div>
  )
}
