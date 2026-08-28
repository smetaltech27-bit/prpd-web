import { Archive, CheckCircle2, FileCheck2, FileImage, FileUp, LoaderCircle, LockKeyhole, Pencil, Plus, Save, Search, X } from 'lucide-react'
import { useEffect, useState, type FormEvent } from 'react'
import { createPortal } from 'react-dom'
import { rawMaterials, equipmentItems } from '../app/mockData'
import { PageHeader } from '../components/AppShell'
import { lockSettings } from '../services/settingsAccess'
import { isSupabaseConfigured } from '../lib/supabase'
import { createProductionItemWithDocuments, deactivateMasterItem, findActiveDocuments, listFactorySupplies, listRawMaterials, listVendorNames, saveMasterItem, searchProductionItems, uploadDocumentAsset, type ActiveDocumentAsset, type DocumentAssetType, type DocumentUploadStatus } from '../services/prpdRepository'
import { fetchPrivateDocument } from '../services/documentStorage'
import { matchesMasterSearch, sortVendorNames } from '../features/settings/search'
import type { MaterialItem } from '../types/domain'

type SettingsTab = 'raw' | 'equipment' | 'documents'

const emptyItem: MaterialItem = { id: '', itemFg: '', partName: '', spec: '', drawingNo: '', orderCode: '', vendor: '', materialType: '', dimension: '', unitPrice: 0, usage: 1, comment: '' }
const documentTypes: Array<{ type: DocumentAssetType; label: string; hint: string }> = [
  { type: 'drawing', label: 'Drawing', hint: 'แบบงานหรือ Drawing หลัก' },
  { type: 'inprocess', label: 'Inprocess Check Sheet', hint: 'ใบตรวจระหว่างกระบวนการผลิต' },
  { type: 'qc', label: 'QC Check Sheet', hint: 'ใบตรวจสอบคุณภาพ' },
]

interface NewProductionItemForm {
  itemFg: string
  partName: string
  drawingNo: string
  model: string
}

const emptyProductionItem: NewProductionItemForm = { itemFg: '', partName: '', drawingNo: '', model: '' }

export function SettingsPage() {
  const [tab, setTab] = useState<SettingsTab>('raw')
  const [query, setQuery] = useState('')
  const [vendor, setVendor] = useState('')
  const [vendors, setVendors] = useState<string[]>([])
  const [editorOpen, setEditorOpen] = useState(false)
  const [form, setForm] = useState<MaterialItem>(emptyItem)
  const [rows, setRows] = useState<{ raw: MaterialItem[]; equipment: MaterialItem[] }>({ raw: [], equipment: [] })
  const [searched, setSearched] = useState({ raw: false, equipment: false })
  const [searching, setSearching] = useState(false)
  const [savedNotice, setSavedNotice] = useState('')
  const [saving, setSaving] = useState(false)
  const activeRows = tab === 'raw' ? rows.raw : rows.equipment

  function openEditor(item?: MaterialItem) {
    setForm(item ? { ...item } : { ...emptyItem, id: `new-${Date.now()}` })
    setEditorOpen(true)
    setSavedNotice('')
  }

  useEffect(() => {
    if (tab !== 'equipment' || vendors.length) return
    if (!isSupabaseConfigured) {
      setVendors(sortVendorNames(equipmentItems.map((item) => item.vendor)))
      return
    }
    void listVendorNames()
      .then((names) => setVendors(sortVendorNames(names)))
      .catch(() => setSavedNotice('อ่านรายชื่อ Vendor ไม่สำเร็จ กรุณาตรวจการเชื่อมต่อ Supabase'))
  }, [tab, vendors.length])

  function changeTab(nextTab: SettingsTab) {
    setTab(nextTab)
    setQuery('')
    setVendor('')
    if (nextTab !== 'documents') {
      setRows((current) => ({ ...current, [nextTab]: [] }))
      setSearched((current) => ({ ...current, [nextTab]: false }))
    }
    setEditorOpen(false)
    setSavedNotice('')
  }

  async function searchMaster(event: FormEvent) {
    event.preventDefault()
    if (tab === 'documents') return
    const key = tab
    if (!query.trim() && (key === 'raw' || !vendor)) {
      setSavedNotice(key === 'raw' ? 'กรุณากรอกคำค้นหา แล้วกดปุ่มค้นหา' : 'กรุณากรอกคำค้นหา หรือเลือก Vendor แล้วกดปุ่มค้นหา')
      return
    }
    setSearching(true)
    setSavedNotice('')
    try {
      const source = isSupabaseConfigured
        ? await (key === 'raw' ? listRawMaterials() : listFactorySupplies())
        : key === 'raw' ? rawMaterials : equipmentItems
      setRows((current) => ({ ...current, [key]: source.filter((item) => matchesMasterSearch(item, query, key === 'equipment' ? vendor : '')) }))
      setSearched((current) => ({ ...current, [key]: true }))
    } catch {
      setRows((current) => ({ ...current, [key]: [] }))
      setSearched((current) => ({ ...current, [key]: true }))
      setSavedNotice('ค้นหาข้อมูลไม่สำเร็จ กรุณาตรวจการเชื่อมต่อ Supabase')
    } finally {
      setSearching(false)
    }
  }

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
      if (!searched[key]) return current
      const existing = current[key].filter((item) => item.id !== form.id && item.id !== savedForm.id)
      const nextRows = [savedForm, ...existing].filter((item) => matchesMasterSearch(item, query, key === 'equipment' ? vendor : ''))
      return { ...current, [key]: nextRows }
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
      <button className={tab === 'raw' ? 'active' : ''} onClick={() => changeTab('raw')}>Raw Material</button>
      <button className={tab === 'equipment' ? 'active' : ''} onClick={() => changeTab('equipment')}>Factory Supply / Equipment</button>
      <button className={tab === 'documents' ? 'active' : ''} onClick={() => changeTab('documents')}>Document Files</button>
    </div>
    {tab !== 'documents' && <div className="settings-layout">
      <section className="card master-card">
        <div className="table-toolbar settings-master-toolbar"><form className="settings-search-form" onSubmit={searchMaster}><label className="search-box"><Search size={18} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="ค้นหา Item FG, Part, Spec หรือ Vendor…" /></label>{tab === 'equipment' && <label className="settings-vendor-filter"><span>Vendor</span><select value={vendor} onChange={(event) => setVendor(event.target.value)}><option value="">ทั้งหมด</option>{vendors.map((name) => <option value={name} key={name}>{name}</option>)}</select></label>}<button className="button button-primary" type="submit" disabled={searching}><Search size={17} />{searching ? 'กำลังค้นหา…' : 'ค้นหา'}</button></form><button className="button button-primary settings-add-master" onClick={() => openEditor()}><Plus size={17} /> Add {tab === 'raw' ? 'Raw Material' : 'Equipment'}</button></div>
        {savedNotice && <div className="inline-notice"><Save size={17} />{savedNotice}</div>}
        <div className="table-wrap"><table className="data-table settings-master-table"><thead><tr>
          {tab === 'raw' && <th>ITEM FG</th>}<th>PART</th><th>SPEC</th><th>DWG NO.</th><th>VENDOR</th><th>TYPE</th><th>DIMENSION</th><th>PRICE</th><th>USAGE</th><th />
        </tr></thead><tbody>{activeRows.map((item) => <tr key={item.id}>
          {tab === 'raw' && <td>{item.itemFg || '—'}</td>}<td>{item.partName || '—'}</td><td>{item.spec || '—'}</td><td>{item.drawingNo || '—'}</td><td>{item.vendor || '—'}</td><td>{item.materialType || '—'}</td><td>{item.dimension || '—'}</td><td>฿{item.unitPrice.toLocaleString()}</td><td>{item.usage}</td><td><div className="row-actions"><button className="icon-button" onClick={() => openEditor(item)} title="แก้ไข"><Pencil size={16} /></button><button className="icon-button" onClick={() => void deactivateItem(item)} title="ปิดใช้งาน"><Archive size={16} /></button></div></td>
        </tr>)}{!activeRows.length && <tr><td colSpan={tab === 'raw' ? 10 : 9} className="settings-empty-results">{searched[tab] ? 'ไม่พบรายการที่ตรงกับเงื่อนไขค้นหา' : 'กรอกคำค้นหา แล้วกดปุ่มค้นหาเพื่อแสดงรายการ'}</td></tr>}</tbody></table></div>
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
  const [items, setItems] = useState<MaterialItem[]>([])
  const [selected, setSelected] = useState<MaterialItem | null>(null)
  const [searched, setSearched] = useState(false)
  const [searching, setSearching] = useState(false)
  const [assets, setAssets] = useState<ActiveDocumentAsset[]>([])
  const [notice, setNotice] = useState('')
  const [loadingAssets, setLoadingAssets] = useState(false)
  const [previewAsset, setPreviewAsset] = useState<ActiveDocumentAsset | null>(null)
  const [previewUrl, setPreviewUrl] = useState('')
  const [newItemOpen, setNewItemOpen] = useState(false)
  const [newItemForm, setNewItemForm] = useState<NewProductionItemForm>(emptyProductionItem)
  const [newItemFiles, setNewItemFiles] = useState<Partial<Record<DocumentAssetType, File>>>({})
  const [uploadStatuses, setUploadStatuses] = useState<Partial<Record<DocumentAssetType, DocumentUploadStatus>>>({})
  const [creatingItem, setCreatingItem] = useState(false)
  const [newItemError, setNewItemError] = useState('')

  async function searchItems(event: FormEvent) {
    event.preventDefault()
    if (!query.trim()) {
      setNotice('กรุณากรอก Item FG, Name Part หรือ DWG No. แล้วกดปุ่มค้นหา')
      return
    }
    setSearching(true)
    setNotice('')
    setSelected(null)
    setAssets([])
    try {
      const matches = isSupabaseConfigured
        ? await searchProductionItems(query)
        : rawMaterials.filter((item) => matchesMasterSearch(item, query))
      setItems(matches)
      setSelected(matches[0] ?? null)
      setSearched(true)
    } catch {
      setItems([])
      setSearched(true)
      setNotice('ค้นหา Item FG ไม่สำเร็จ กรุณาตรวจการเชื่อมต่อ Supabase')
    } finally {
      setSearching(false)
    }
  }

  function clearDocumentSearch() {
    setQuery('')
    setItems([])
    setSelected(null)
    setSearched(false)
    setAssets([])
    setNotice('')
    setPreviewAsset(null)
    setPreviewUrl('')
  }

  function closeNewItem() {
    if (creatingItem) return
    setNewItemOpen(false)
    setNewItemForm(emptyProductionItem)
    setNewItemFiles({})
    setUploadStatuses({})
    setNewItemError('')
  }

  async function createNewItem(event: FormEvent) {
    event.preventDefault()
    const completeFiles = documentTypes.every(({ type }) => Boolean(newItemFiles[type]))
    if (!completeFiles) {
      setNewItemError('กรุณาเลือกไฟล์ Drawing, Inprocess Check Sheet และ QC Check Sheet ให้ครบ')
      return
    }
    if (!isSupabaseConfigured) {
      setNewItemError('ระบบ Prototype ไม่สามารถอัปโหลดเอกสารจริงได้')
      return
    }

    setCreatingItem(true)
    setNewItemError('')
    setUploadStatuses({})
    try {
      const created = await createProductionItemWithDocuments({
        ...newItemForm,
        files: newItemFiles as Record<DocumentAssetType, File>,
      }, (type, status) => setUploadStatuses((current) => ({ ...current, [type]: status })))
      setQuery(created.itemFg)
      setItems([created])
      setSelected(created)
      setSearched(true)
      setNotice(`สร้าง Item ${created.itemFg} พร้อมเอกสารทั้ง 3 รายการแล้ว`)
      setNewItemOpen(false)
      setNewItemForm(emptyProductionItem)
      setNewItemFiles({})
      setUploadStatuses({})
    } catch (error) {
      setNewItemError(error instanceof Error ? error.message : 'สร้าง Production Item ไม่สำเร็จ')
    } finally {
      setCreatingItem(false)
    }
  }

  async function refreshAssets(itemFg: string) {
    setLoadingAssets(true)
    try {
      setAssets(await findActiveDocuments(itemFg))
    } catch {
      setAssets([])
      setNotice('อ่านรายการเอกสารไม่สำเร็จ กรุณาตรวจการเชื่อมต่อ Supabase')
    } finally {
      setLoadingAssets(false)
    }
  }

  useEffect(() => {
    setPreviewAsset(null)
    setPreviewUrl('')
    if (selected) void refreshAssets(selected.itemFg)
  }, [selected])

  useEffect(() => {
    if (!previewAsset) {
      setPreviewUrl('')
      return
    }
    setPreviewUrl('')
    const controller = new AbortController()
    let objectUrl = ''
    void fetchPrivateDocument(previewAsset, { signal: controller.signal, useSettingsSession: true }).then((blob) => {
      objectUrl = URL.createObjectURL(blob)
      setPreviewUrl(objectUrl)
    }).catch((error) => setNotice(`Preview ไม่สำเร็จ — ${error instanceof Error ? error.message : 'Unknown error'}`))
    return () => {
      controller.abort()
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [previewAsset])

  async function upload(label: string, type: DocumentAssetType, file?: File) {
    if (!file || !selected) return
    if (!isSupabaseConfigured) {
      setNotice(`${label}: เลือกไฟล์ ${file.name} แล้ว (Prototype ยังไม่ได้อัปโหลดจริง)`)
      return
    }
    setNotice(`${label}: กำลังอัปโหลด ${file.name}…`)
    try {
      await uploadDocumentAsset(selected.itemFg, type, file)
      await refreshAssets(selected.itemFg)
      setPreviewAsset(null)
      setNotice(`${label}: เปลี่ยนไฟล์ Active เป็น ${file.name} และเก็บ Revision เดิมไว้แล้ว`)
    } catch (error) {
      setNotice(`${label}: อัปโหลดไม่สำเร็จ — ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }
  const assetByType = new Map(assets.map((asset) => [asset.type, asset]))
  return <>
    <div className="document-settings-grid">
    <section className="card document-master-list"><div className="document-master-toolbar"><div className="document-master-heading"><p className="eyebrow">ITEM MASTER</p><h2>เลือก Item FG</h2></div><form className="document-settings-search" onSubmit={searchItems}><label className="search-box"><Search size={18} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="ค้นหา Item FG, Name Part หรือ DWG No.…" /></label><button className="button button-primary" type="submit" disabled={searching}><Search size={17} />{searching ? 'กำลังค้นหา…' : 'ค้นหา'}</button><button className="button button-secondary" type="button" onClick={clearDocumentSearch} disabled={!query && !items.length && !selected && !notice}><X size={17} />ล้างข้อมูล</button></form><button className="button button-primary document-add-item" onClick={() => setNewItemOpen(true)}><Plus size={17} />เพิ่ม Item ใหม่</button></div><div className="result-list document-master-results">{items.map((item) => <button className={`document-result ${selected?.id === item.id ? 'selected' : ''}`} onClick={() => setSelected(item)} key={item.id}><span className="availability found"><FileImage /></span><span><strong>{item.itemFg}</strong><small>{item.partName} • {item.drawingNo}</small></span></button>)}{!items.length && <p className="settings-result-message">{searched ? 'ไม่พบ Item FG ที่ตรงกับคำค้นหา' : 'กรอกคำค้นหา แล้วกดปุ่มค้นหาเพื่อแสดงรายการ'}</p>}</div></section>
    <section className="card file-manager"><div className="card-header"><div><p className="eyebrow">PRIVATE R2 DOCUMENTS</p><h2>{selected ? `${selected.itemFg} — ${selected.partName}` : 'ไม่พบ Item FG'}</h2>{selected && <small className="production-item-model">Model / SPEC: {selected.spec || '—'} • DWG: {selected.drawingNo || '—'}</small>}</div></div>{notice && <div className="inline-notice"><FileUp size={17} />{notice}</div>}
      {selected && documentTypes.map(({ label, type }) => {
        const asset = assetByType.get(type)
        return <article className="upload-row" key={label}><span className={`availability ${asset ? 'found' : 'missing'}`}>{asset ? <FileCheck2 /> : <FileImage />}</span><div><strong>{label}</strong><small>{loadingAssets ? 'กำลังตรวจสอบ…' : asset ? `${asset.filename} • Version ${asset.version} • Active` : 'ยังไม่มีไฟล์ที่ Active'}</small></div>{asset && <button className="button button-ghost" onClick={() => setPreviewAsset(asset)}>Preview</button>}<label className="button button-secondary upload-button"><FileUp size={16} />{asset ? 'เปลี่ยนไฟล์ / Add Revision' : `เพิ่มไฟล์ ${label}`}<input type="file" accept="image/jpeg,image/png,image/webp,application/pdf" onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ''; void upload(label, type, file) }} /></label></article>
      })}
      {previewAsset && <div className="settings-document-preview"><div className="card-header"><div><p className="eyebrow">PREVIEW</p><h2>{previewAsset.itemFg} • {previewAsset.filename}</h2></div><button className="icon-button" onClick={() => setPreviewAsset(null)} aria-label="ปิด Preview"><X size={18} /></button></div>{previewUrl ? (previewAsset.mimeType === 'application/pdf' ? <iframe src={previewUrl} title={previewAsset.filename} /> : <img src={previewUrl} alt={previewAsset.filename} />) : <p>กำลังโหลดเอกสาร…</p>}</div>}
      <p className="helper-text">ต้นฉบับเก็บใน Cloudflare R2 แบบ Private และ Supabase เก็บ Metadata/Version เท่านั้น</p>
    </section>
    </div>
    {newItemOpen && createPortal(<div className="modal-overlay production-item-overlay" role="presentation">
      <section className="modal-panel production-item-modal" role="dialog" aria-modal="true" aria-labelledby="new-production-item-title">
        <header className="modal-header"><span className="modal-icon"><Plus size={22} /></span><div><p className="eyebrow">PRODUCTION ITEM MASTER</p><h2 id="new-production-item-title">เพิ่ม Item ใหม่พร้อมเอกสาร</h2></div><button className="icon-button" type="button" onClick={closeNewItem} disabled={creatingItem} aria-label="ปิด"><X size={19} /></button></header>
        <form className="production-item-form" onSubmit={createNewItem}>
          <div className="modal-body production-item-modal-body">
            <section className="production-item-fields"><div className="production-form-heading"><span>1</span><div><strong>ข้อมูล Item</strong><small>ข้อมูลนี้จะแสดงใน Work Order และหน้าพิมพ์เอกสาร</small></div></div>
              <div className="production-field-grid"><Field label="Item FG" required value={newItemForm.itemFg} onChange={(value) => setNewItemForm({ ...newItemForm, itemFg: value.toLocaleUpperCase() })} /><Field label="Name Part" required value={newItemForm.partName} onChange={(value) => setNewItemForm({ ...newItemForm, partName: value })} /><Field label="Drawing No." required value={newItemForm.drawingNo} onChange={(value) => setNewItemForm({ ...newItemForm, drawingNo: value })} /><Field label="Model / SPEC" required value={newItemForm.model} onChange={(value) => setNewItemForm({ ...newItemForm, model: value })} /></div>
            </section>
            <section className="production-document-fields"><div className="production-form-heading"><span>2</span><div><strong>เอกสารประกอบการผลิต</strong><small>ต้องเลือกไฟล์ให้ครบทั้ง 3 รายการก่อนบันทึก รองรับ JPG, PNG, WEBP และ PDF ไม่เกิน 25 MB</small></div></div>
              <div className="production-upload-grid">{documentTypes.map(({ type, label, hint }) => {
                const file = newItemFiles[type]
                const status = uploadStatuses[type]
                return <label className={`production-upload-card ${file ? 'has-file' : ''}`} key={type}><input type="file" aria-label={`ไฟล์ ${label}`} accept="image/jpeg,image/png,image/webp,application/pdf" required={!file} disabled={creatingItem} onChange={(event) => { const nextFile = event.target.files?.[0]; if (nextFile) setNewItemFiles((current) => ({ ...current, [type]: nextFile })) }} /><span className="production-upload-icon">{status === 'uploading' ? <LoaderCircle className="spin" /> : status === 'uploaded' || file ? <CheckCircle2 /> : <FileUp />}</span><span><strong>{label} *</strong><small>{status === 'uploading' ? 'กำลังอัปโหลด…' : status === 'uploaded' ? 'อัปโหลดแล้ว รอบันทึกข้อมูล' : file ? `${file.name} • ${(file.size / 1024 / 1024).toFixed(2)} MB` : hint}</small></span><b>{file ? 'เปลี่ยนไฟล์' : 'เลือกไฟล์'}</b></label>
              })}</div>
            </section>
            {newItemError && <div className="production-item-error" role="alert">{newItemError}</div>}
          </div>
          <footer className="modal-footer"><button className="button button-secondary" type="button" onClick={closeNewItem} disabled={creatingItem}>ยกเลิก</button><button className="button button-primary" type="submit" disabled={creatingItem}>{creatingItem ? <LoaderCircle className="spin" size={17} /> : <Save size={17} />}{creatingItem ? 'กำลังสร้าง Item และอัปโหลด…' : 'สร้าง Item พร้อมเอกสาร'}</button></footer>
        </form>
      </section>
    </div>, document.body)}
  </>
}
