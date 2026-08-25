import { CheckCircle2, FileSearch, FileWarning, Printer, Search } from 'lucide-react'
import { useMemo, useState } from 'react'
import { documents } from '../app/mockData'
import type { DocumentKind } from '../types/domain'
import { EmptyState, PageHeader } from './AppShell'

const config: Record<DocumentKind, { title: string; label: string; description: string }> = {
  drawing: { title: 'Print Drawing', label: 'Drawing', description: 'ค้นหา Preview และพิมพ์ Drawing ตาม Item FG หรือ Drawing No.' },
  inprocess: { title: 'Print Inprocess Check Sheet', label: 'Inprocess Check Sheet', description: 'ค้นหาแบบตรวจสอบระหว่างกระบวนการผลิต พร้อม Preview ก่อนพิมพ์' },
  qc: { title: 'Print QC Check Sheet', label: 'QC Check Sheet', description: 'ค้นหาเอกสารตรวจสอบคุณภาพตาม Item FG และพิมพ์เฉพาะไฟล์ที่ต้องการ' },
}

export function DocumentSearch({ kind }: { kind: DocumentKind }) {
  const [query, setQuery] = useState('')
  const [searched, setSearched] = useState(false)
  const [selectedId, setSelectedId] = useState('')
  const meta = config[kind]
  const results = useMemo(() => {
    if (!searched || !query.trim()) return []
    const keyword = query.toLowerCase()
    return documents.filter((doc) => [doc.itemFg, doc.partName, doc.drawingNo].some((value) => value.toLowerCase().includes(keyword)))
  }, [query, searched])

  const selected = documents.find((doc) => doc.id === selectedId)

  return (
    <div className="page">
      <PageHeader eyebrow="PRODUCTION DOCUMENTS" title={meta.title} description={meta.description} />
      <section className="document-hero card">
        <div className="document-search-copy"><span className="large-icon"><FileSearch /></span><div><h2>ค้นหา {meta.label}</h2><p>ใส่ Item FG, Part Name หรือ Drawing No. แล้วกด Enter</p></div></div>
        <form className="document-search-form" onSubmit={(event) => { event.preventDefault(); setSearched(true); setSelectedId('') }}>
          <label className="search-box large"><Search /><input value={query} onChange={(event) => { setQuery(event.target.value); setSearched(false) }} placeholder="เช่น TM4207A หรือ MT524685A" /></label>
          <button className="button button-primary" type="submit">Search</button>
        </form>
      </section>
      <div className="document-grid">
        <section className="card results-card">
          <div className="card-header"><div><p className="eyebrow">SEARCH RESULT</p><h2>รายการเอกสาร</h2></div>{searched && <span className="record-count">{results.length} results</span>}</div>
          {!searched && <EmptyState icon={Search} title="พร้อมค้นหาเอกสาร" description="ผลการค้นหาจะแสดงในพื้นที่นี้" />}
          {searched && !results.length && <EmptyState icon={FileWarning} title="ไม่พบเอกสาร" description="ตรวจสอบ Item FG หรือ Drawing No. แล้วลองอีกครั้ง" />}
          <div className="result-list">
            {results.map((doc) => {
              const available = doc[kind]
              return (
                <button key={doc.id} disabled={!available} className={`document-result ${selectedId === doc.id ? 'selected' : ''}`} onClick={() => setSelectedId(doc.id)}>
                  <span className={`availability ${available ? 'found' : 'missing'}`}>{available ? <CheckCircle2 /> : <FileWarning />}</span>
                  <span><strong>{doc.itemFg} — {doc.partName}</strong><small>Drawing No. {doc.drawingNo}</small></span>
                  <em>{available ? 'Found' : 'Not found'}</em>
                </button>
              )
            })}
          </div>
        </section>
        <aside className="card preview-card">
          <div className="card-header"><div><p className="eyebrow">PREVIEW</p><h2>Document preview</h2></div></div>
          {!selected && <EmptyState icon={FileSearch} title="เลือกเอกสาร" description="เลือกผลการค้นหาที่พบไฟล์เพื่อดูตัวอย่าง" />}
          {selected && <><div className="paper-preview"><img src={`${import.meta.env.BASE_URL}logo-smt.jpg`} alt="S Metal Tech" /><b>{meta.label.toUpperCase()}</b><span>{selected.partName}</span><small>ITEM FG: {selected.itemFg}</small><div className="paper-lines" /></div><button className="button button-primary button-full" onClick={() => window.print()}><Printer size={17} /> Print {meta.label}</button></>}
        </aside>
      </div>
    </div>
  )
}
