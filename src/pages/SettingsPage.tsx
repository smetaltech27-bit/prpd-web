import { Archive, FileCheck2, FileImage, FileUp, LockKeyhole, Pencil, Plus, Save, Search, X } from 'lucide-react'
import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { rawMaterials, equipmentItems, documents } from '../app/mockData'
import { PageHeader } from '../components/AppShell'
import { lockSettings } from '../services/settingsAccess'
import { isSupabaseConfigured } from '../lib/supabase'
import { deactivateMasterItem, listFactorySupplies, listRawMaterials, saveMasterItem, uploadDocumentAsset, type DocumentAssetType } from '../services/prpdRepository'
import type { MaterialItem } from '../types/domain'

type SettingsTab = 'raw' | 'equipment' | 'documents'

const emptyItem: MaterialItem = { id: '', itemFg: '', partName: '', spec: '', drawingNo: '', orderCode: '', vendor: '', materialType: '', dimension: '', unitPrice: 0, usage: 1, comment: '' }

export function SettingsPage() {
  const [tab, setTab] = useState<SettingsTab>('raw')
  const [query, setQuery] = useState('')
  const [editorOpen, setEditorOpen] = useState(false)
  const [form, setForm] = useState<MaterialItem>(emptyItem)
  const [rows, setRows] = useState({ raw: rawMaterials, equipment: equipmentItems })
  const [savedNotice, setSavedNotice] = useState('')
  const [saving, setSaving] = useState(false)
  const activeRows = tab === 'raw' ? rows.raw : rows.equipment
  const filteredRows = useMemo(() => activeRows.filter((item) => [item.itemFg, item.partName, item.vendor].some((value) => value.toLowerCase().includes(query.toLowerCase()))), [activeRows, query])

  function openEditor(item?: MaterialItem) {
    setForm(item ? { ...item } : { ...emptyItem, id: `new-${Date.now()}` })
    setEditorOpen(true)
    setSavedNotice('')
  }

  useEffect(() => {
    if (!isSupabaseConfigured) return
    void Promise.all([listRawMaterials(), listFactorySupplies()]).then(([raw, equipment]) => {
      setRows({ raw, equipment })
    }).catch(() => setSavedNotice('เชื่อมต่อ Supabase ไม่สำเร็จ จึงแสดงข้อมูลตัวอย่าง'))
  }, [])

  async function saveItem(event: FormEvent) {
    event.preventDefault()
    const key = tab === 'raw' ? 'raw' : 'equipment'
    setSaving(true)
    let savedForm = form
    if (isSupabaseConfigured) {
      try {
        const id = await saveMasterItem(key, form)
        savedForm = { ...form, id }
      } catch {
        setSavedNotice('บันทึกไม่สำเร็จ กรุณาตรวจสิทธิ์ Settings และข้อมูลที่กรอก')
        setSaving(false)
        return
      }
    }
    setRows((current) => {
      const exists = current[key].some((item) => item.id === savedForm.id || item.id === form.id)
      return { ...current, [key]: exists ? current[key].map((item) => item.id === form.id ? savedForm : item) : [savedForm, ...current[key]] }
    })
    setEditorOpen(false)
    setSaving(false)
    setSavedNotice(isSupabaseConfigured ? 'บันทึกข้อมูลลง Supabase แล้ว' : 'บันทึกในหน้าจอ Prototype แล้ว — ยังไม่ส่งข้อมูลไป Supabase')
  }

  async function deactivateItem(item: MaterialItem) {
    const key = tab === 'raw' ? 'raw' : 'equipment'
    if (isSupabaseConfigured) {
      try {
        await deactivateMasterItem(key, item.id)
      } catch {
        setSavedNotice('ปิดใช้งานไม่สำเร็จ กรุณาตรวจสิทธิ์ Settings')
        return
      }
    }
    setRows((current) => ({ ...current, [key]: current[key].filter((row) => row.id !== item.id) }))
    setSavedNotice(isSupabaseConfigured ? 'ปิดใช้งานรายการแล้ว โดยประวัติ PR เดิมไม่ถูกลบ' : 'นำรายการออกจาก Prototype แล้ว')
  }

  async function handleLock() {
    await lockSettings()
    window.dispatchEvent(new Event('prpd-settings-lock'))
  }

  return <div className="page settings-page">
    <PageHeader eyebrow="ADMINISTRATION" title="Settings" description="จัดการ Master Data และเอกสารการผลิตจากหน้าเดียว" actions={<><span className="prototype-badge">{isSupabaseConfigured ? 'Supabase connected' : 'UI Prototype'}</span><button className="button button-secondary" onClick={handleLock}><LockKeyhole size={17} /> Lock Settings</button></>} />
    <div className="settings-tabs" role="tablist">
      <button className={tab === 'raw' ? 'active' : ''} onClick={() => { setTab('raw'); setEditorOpen(false) }}>Raw Material</button>
      <button className={tab === 'equipment' ? 'active' : ''} onClick={() => { setTab('equipment'); setEditorOpen(false) }}>Factory Supply / Equipment</button>
      <button className={tab === 'documents' ? 'active' : ''} onClick={() => { setTab('documents'); setEditorOpen(false) }}>Document Files</button>
    </div>
    {tab !== 'documents' && <div className="settings-layout">
      <section className="card master-card">
        <div className="table-toolbar"><label className="search-box"><Search size={18} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="ค้นหา Item FG, Part หรือ Vendor…" /></label><button className="button button-primary" onClick={() => openEditor()}><Plus size={17} /> Add {tab === 'raw' ? 'Raw Material' : 'Equipment'}</button></div>
        {savedNotice && <div className="inline-notice"><Save size={17} />{savedNotice}</div>}
        <div className="table-wrap"><table className="data-table"><thead><tr><th>ITEM FG / PART</th><th>SPEC / DWG NO.</th><th>VENDOR</th><th>TYPE / DIMENSION</th><th>PRICE / USAGE</th><th /></tr></thead><tbody>{filteredRows.map((item) => <tr key={item.id}><td><strong>{item.itemFg || '—'}</strong><span>{item.partName}</span></td><td><strong>{item.spec}</strong><span>{item.drawingNo}</span></td><td>{item.vendor}</td><td><strong>{item.materialType}</strong><span>{item.dimension}</span></td><td><strong>฿{item.unitPrice.toLocaleString()}</strong><span>Usage {item.usage}</span></td><td><div className="row-actions"><button className="icon-button" onClick={() => openEditor(item)} title="แก้ไข"><Pencil size={16} /></button><button className="icon-button" onClick={() => void deactivateItem(item)} title="ปิดใช้งาน"><Archive size={16} /></button></div></td></tr>)}</tbody></table></div>
      </section>
      {editorOpen && <aside className="card editor-card">
        <div className="card-header"><div><p className="eyebrow">{activeRows.some((item) => item.id === form.id) ? 'EDIT RECORD' : 'NEW RECORD'}</p><h2>รายละเอียดรายการ</h2></div><button className="icon-button" onClick={() => setEditorOpen(false)}><X size={18} /></button></div>
        <form className="editor-form" onSubmit={saveItem}>
          <div className="form-pair"><Field label="Item FG" required={tab === 'raw'} value={form.itemFg} onChange={(value) => setForm({ ...form, itemFg: value })} /><Field label="Name Part" required value={form.partName} onChange={(value) => setForm({ ...form, partName: value })} /></div>
          <div className="form-pair"><Field label="Spec" value={form.spec} onChange={(value) => setForm({ ...form, spec: value })} /><Field label="DWG No." value={form.drawingNo} onChange={(value) => setForm({ ...form, drawingNo: value })} /></div>
          <div className="form-pair"><Field label="Code Order RM" value={form.orderCode} onChange={(value) => setForm({ ...form, orderCode: value })} /><Field label="Vendor" required value={form.vendor} onChange={(value) => setForm({ ...form, vendor: value })} /></div>
          <div className="form-pair"><Field label="Type" value={form.materialType} onChange={(value) => setForm({ ...form, materialType: value })} /><Field label="Dimension" value={form.dimension} onChange={(value) => setForm({ ...form, dimension: value })} /></div>
          <div className="form-pair"><Field label="Unit Price" type="number" value={String(form.unitPrice)} onChange={(value) => setForm({ ...form, unitPrice: Number(value) })} /><Field label="Usage" type="number" value={String(form.usage)} onChange={(value) => setForm({ ...form, usage: Number(value) })} /></div>
          <Field label="Comment" value={form.comment ?? ''} onChange={(value) => setForm({ ...form, comment: value })} />
          <button className="button button-primary button-full" type="submit" disabled={saving}><Save size={17} /> {saving ? 'Saving…' : 'Save record'}</button>
        </form>
      </aside>}
    </div>}
    {tab === 'documents' && <DocumentManager />}
  </div>
}

function Field({ label, value, onChange, type = 'text', required = false }: { label: string; value: string; onChange: (value: string) => void; type?: string; required?: boolean }) {
  return <label className="field"><span>{label}{required && ' *'}</span><input type={type} value={value} required={required} onChange={(event) => onChange(event.target.value)} /></label>
}

function DocumentManager() {
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState(documents[0])
  const [notice, setNotice] = useState('')
  const matches = documents.filter((doc) => [doc.itemFg, doc.partName, doc.drawingNo].some((value) => value.toLowerCase().includes(query.toLowerCase())))
  async function upload(label: string, type: DocumentAssetType, file?: File) {
    if (!file) return
    if (!isSupabaseConfigured) {
      setNotice(`${label}: เลือกไฟล์ ${file.name} แล้ว (Prototype ยังไม่ได้อัปโหลดจริง)`)
      return
    }
    setNotice(`${label}: กำลังอัปโหลด ${file.name}…`)
    try {
      await uploadDocumentAsset(selected.itemFg, type, file)
      setNotice(`${label}: อัปโหลด ${file.name} และสร้าง Version ใหม่แล้ว`)
    } catch (error) {
      setNotice(`${label}: อัปโหลดไม่สำเร็จ — ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }
  return <div className="document-settings-grid">
    <section className="card document-master-list"><div className="card-header"><div><p className="eyebrow">ITEM MASTER</p><h2>เลือก Item FG</h2></div></div><label className="search-box"><Search size={18} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="ค้นหา Item FG หรือ DWG No.…" /></label><div className="result-list">{matches.map((doc) => <button className={`document-result ${selected.id === doc.id ? 'selected' : ''}`} onClick={() => setSelected(doc)} key={doc.id}><span className="availability found"><FileImage /></span><span><strong>{doc.itemFg}</strong><small>{doc.partName} • {doc.drawingNo}</small></span></button>)}</div></section>
    <section className="card file-manager"><div className="card-header"><div><p className="eyebrow">DOCUMENT FILES</p><h2>{selected.itemFg} — {selected.partName}</h2></div></div>{notice && <div className="inline-notice"><FileUp size={17} />{notice}</div>}
      {([['Drawing', selected.drawing, 'drawing'], ['Inprocess Check Sheet', selected.inprocess, 'inprocess'], ['QC Check Sheet', selected.qc, 'qc']] as const).map(([label, exists, type]) => <article className="upload-row" key={label}><span className={`availability ${exists ? 'found' : 'missing'}`}>{exists ? <FileCheck2 /> : <FileImage />}</span><div><strong>{label}</strong><small>{exists ? 'มีไฟล์ในระบบ' : 'ยังไม่มีไฟล์'}</small></div>{exists && <button className="button button-ghost">Preview</button>}<label className="button button-secondary upload-button"><FileUp size={16} />{exists ? 'Replace' : 'Add file'}<input type="file" accept="image/jpeg,image/png,image/webp,application/pdf" onChange={(event) => void upload(label, type, event.target.files?.[0])} /></label></article>)}
      <p className="helper-text">ไฟล์จริงจะถูกเก็บใน Private Supabase Storage และเก็บประวัติ Version เมื่อเชื่อม Backend แล้ว</p>
    </section>
  </div>
}
