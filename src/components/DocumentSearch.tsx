import { FileSearch, FileWarning, LoaderCircle, Printer, RotateCcw, Search } from 'lucide-react'
import { useEffect, useMemo, useRef, useState, type FormEvent, type SyntheticEvent } from 'react'
import type { DocumentKind } from '../types/domain'
import { EmptyState, PageHeader } from './AppShell'
import { fetchPrivateDocument } from '../services/documentStorage'
import { searchActiveDocuments, type ActiveDocumentAsset } from '../services/prpdRepository'
import { printImage, type PrintOrientation } from '../lib/print'

const config: Record<DocumentKind, { title: string; label: string; description: string }> = {
  drawing: { title: 'Print Drawing', label: 'Drawing', description: 'ค้นหา Preview และพิมพ์ Drawing ตาม Item FG, Part Name หรือ Drawing No.' },
  inprocess: { title: 'Print Inprocess Check Sheet', label: 'Inprocess Check Sheet', description: 'ค้นหาแบบตรวจสอบระหว่างกระบวนการผลิต พร้อม Preview ก่อนพิมพ์' },
  qc: { title: 'Print QC Check Sheet', label: 'QC Check Sheet', description: 'ค้นหาเอกสารตรวจสอบคุณภาพตาม Item FG และพิมพ์เฉพาะไฟล์ที่ต้องการ' },
}

export function DocumentSearch({ kind }: { kind: DocumentKind }) {
  const [query, setQuery] = useState('')
  const [searched, setSearched] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [results, setResults] = useState<ActiveDocumentAsset[]>([])
  const [selectedId, setSelectedId] = useState('')
  const [previewUrl, setPreviewUrl] = useState('')
  const [previewLoading, setPreviewLoading] = useState(false)
  const [previewError, setPreviewError] = useState('')
  const [orientation, setOrientation] = useState<PrintOrientation>('portrait')
  const previewFrameRef = useRef<HTMLIFrameElement>(null)
  const meta = config[kind]
  const selected = useMemo(() => results.find((document) => document.id === selectedId) ?? null, [results, selectedId])

  useEffect(() => {
    if (!selected) {
      setPreviewUrl('')
      setPreviewError('')
      return
    }
    const controller = new AbortController()
    let objectUrl = ''
    setPreviewLoading(true)
    setPreviewError('')
    void fetchPrivateDocument(selected, { signal: controller.signal }).then((blob) => {
      objectUrl = URL.createObjectURL(blob)
      setPreviewUrl(objectUrl)
    }).catch((reason) => {
      if (!controller.signal.aborted) setPreviewError(reason instanceof Error ? reason.message : 'เปิดเอกสารไม่สำเร็จ')
    }).finally(() => {
      if (!controller.signal.aborted) setPreviewLoading(false)
    })
    return () => {
      controller.abort()
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [selected])

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!query.trim()) return
    setSearched(true)
    setLoading(true)
    setError('')
    setSelectedId('')
    try {
      const found = await searchActiveDocuments(query, kind)
      setResults(found)
      setSelectedId(found[0]?.id ?? '')
    } catch (reason) {
      setResults([])
      setError(reason instanceof Error ? reason.message : 'ค้นหาเอกสารไม่สำเร็จ')
    } finally {
      setLoading(false)
    }
  }

  function rememberOrientation(event: SyntheticEvent<HTMLImageElement>) {
    const image = event.currentTarget
    setOrientation(image.naturalWidth > image.naturalHeight ? 'landscape' : 'portrait')
  }

  function clearSearch() {
    setQuery('')
    setSearched(false)
    setLoading(false)
    setError('')
    setResults([])
    setSelectedId('')
    setPreviewLoading(false)
    setPreviewError('')
    setOrientation('portrait')
  }

  function printSelected() {
    if (!selected || !previewUrl) return
    if (selected.mimeType === 'application/pdf') {
      const frameWindow = previewFrameRef.current?.contentWindow
      if (!frameWindow) {
        setPreviewError('ยังไม่สามารถสั่งพิมพ์ PDF ได้ กรุณารอให้ Preview โหลดเสร็จแล้วลองอีกครั้ง')
        return
      }
      frameWindow.focus()
      frameWindow.print()
      return
    }
    printImage(previewUrl, {
      itemFg: selected.itemFg,
      label: meta.label,
      orientation,
      marginMm: 0,
      bottomMarginMm: kind === 'inprocess' ? 4 : 0,
      fit: kind === 'inprocess' ? 'fill' : 'contain',
    })
  }

  return (
    <div className="page">
      <PageHeader eyebrow="PRODUCTION DOCUMENTS" title={meta.title} description={meta.description} />
      <section className="document-hero card">
        <div className="document-search-copy"><span className="large-icon"><FileSearch /></span><div><h2>ค้นหา {meta.label}</h2><p>ใส่ Item FG, Part Name หรือ Drawing No. แล้วกด Enter</p></div></div>
        <form className="document-search-form" onSubmit={submit}>
          <label className="search-box large"><Search /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="เช่น TM4207A หรือ MT524685A" /></label>
          <button className="button button-primary" type="submit" disabled={!query.trim() || loading}>{loading ? <LoaderCircle className="spin" /> : <Search size={17} />}{loading ? 'กำลังค้นหา…' : 'ค้นหา'}</button>
          <button className="button button-secondary" type="button" onClick={clearSearch} disabled={!query && !searched && !selected}><RotateCcw size={17} /> ล้างข้อมูล</button>
        </form>
      </section>
      <section className="card preview-card document-preview-full">
          <div className="card-header"><div><p className="eyebrow">PRIVATE PREVIEW</p><h2>Document Preview</h2></div>{selected && <span className="record-count">{selected.itemFg}</span>}</div>
          {!searched && <EmptyState icon={FileSearch} title="พร้อมแสดงตัวอย่างเอกสาร" description="ค้นหา Item FG, Part Name หรือ Drawing No. เพื่อเปิด Preview" />}
          {searched && loading && <EmptyState icon={LoaderCircle} title="กำลังค้นหา" description="กำลังตรวจ Metadata ใน Supabase" />}
          {searched && !loading && error && <EmptyState icon={FileWarning} title="ค้นหาไม่สำเร็จ" description={error} />}
          {searched && !loading && !error && !results.length && <EmptyState icon={FileWarning} title="ไม่พบเอกสาร" description="ตรวจสอบ Item FG, Part Name หรือ Drawing No. แล้วลองอีกครั้ง" />}
          {selected && previewLoading && <EmptyState icon={LoaderCircle} title="กำลังเปิดเอกสาร" description="ระบบกำลังตรวจสิทธิ์และโหลดไฟล์" />}
          {selected && !previewLoading && previewError && <EmptyState icon={FileWarning} title="เปิดเอกสารไม่สำเร็จ" description={previewError} />}
          {selected && !previewLoading && previewUrl && <>
            <div className="paper-preview paper-preview--document">
              {selected.mimeType === 'application/pdf'
                ? <iframe ref={previewFrameRef} src={previewUrl} title={`${meta.label} ${selected.itemFg}`} />
                : <img src={previewUrl} alt={`${meta.label} ${selected.itemFg}`} onLoad={rememberOrientation} />}
            </div>
            <div className="document-preview-meta"><strong>{selected.itemFg}</strong><span>{selected.filename}</span></div>
            <button className="button button-primary" onClick={printSelected}><Printer size={16} /> พิมพ์ {meta.label}</button>
          </>}
      </section>
    </div>
  )
}
