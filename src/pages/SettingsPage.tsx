import { Archive, FileCheck2, FileImage, FileUp, LockKeyhole, Pencil, Plus, Save, Search, X } from 'lucide-react'
import { useEffect, useState, type FormEvent } from 'react'
import { rawMaterials, equipmentItems } from '../app/mockData'
import { PageHeader } from '../components/AppShell'
import { lockSettings } from '../services/settingsAccess'
import { isSupabaseConfigured } from '../lib/supabase'
import { deactivateMasterItem, findActiveDocuments, listFactorySupplies, listRawMaterials, listVendorNames, saveMasterItem, uploadDocumentAsset, type ActiveDocumentAsset, type DocumentAssetType } from '../services/prpdRepository'
import { fetchPrivateDocument } from '../services/documentStorage'
import type { MaterialItem } from '../types/domain'

type SettingsTab = 'raw' | 'equipment' | 'documents'

const emptyItem: MaterialItem = { id: '', itemFg: '', partName: '', spec: '', drawingNo: '', orderCode: '', vendor: '', materialType: '', dimension: '', unitPrice: 0, usage: 1, comment: '' }

export function matchesMasterSearch(item: MaterialItem, query: string, vendor = '') {
  const keyword = query.trim().toLocaleLowerCase()
  const matchesKeyword = !keyword || [item.itemFg, item.partName, item.spec, item.drawingNo, item.vendor, item.materialType, item.dimension]
    .some((value) => value.toLocaleLowerCase().includes(keyword))
  return matchesKeyword && (!vendor || item.vendor === vendor)
}

export function sortVendorNames(names: string[]) {
  return [...new Set(names.map((name) => name.trim()).filter(Boolean))]
    .sort((left, right) => left.localeCompare(right, ['th', 'en'], { sensitivity: 'base', numeric: true }))
}

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
        <div className="table-toolbar"><form className="settings-search-form" onSubmit={searchMaster}><label className="search-box"><Search size={18} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="ค้นหา Item FG, Part, Spec หรือ Vendor…" /></label>{tab === 'equipment' && <label className="settings-vendor-filter"><span>Vendor</span><select value={vendor} onChange={(event) => setVendor(event.target.value)}><option value="">ทั้งหมด</option>{vendors.map((name) => <option value={name} key={name}>{name}</option>)}</select></label>}<button className="button button-primary" type="submit" disabled={searching}><Search size={17} />{searching ? 'กำลังค้นหา…' : 'ค้นหา'}</button></form><button className="button button-primary" onClick={() => openEditor()}><Plus size={17} /> Add {tab === 'raw' ? 'Raw Material' : 'Equipment'}</button></div>
        {savedNotice && <div className="inline-notice"><Save size={17} />{savedNotice}</div>}
        <div className="table-wrap"><table className="data-table"><thead><tr><th>ITEM FG / PART</th><th>SPEC / DWG NO.</th><th>VENDOR</th><th>TYPE / DIMENSION</th><th>PRICE / USAGE</th><th /></tr></thead><tbody>{activeRows.map((item) => <tr key={item.id}><td><strong>{item.itemFg || '—'}</strong><span>{item.partName}</span></td><td><strong>{item.spec}</strong><span>{item.drawingNo}</span></td><td>{item.vendor}</td><td><strong>{item.materialType}</strong><span>{item.dimension}</span></td><td><strong>฿{item.unitPrice.toLocaleString()}</strong><span>Usage {item.usage}</span></td><td><div className="row-actions"><button className="icon-button" onClick={() => openEditor(item)} title="แก้ไข"><Pencil size={16} /></button><button className="icon-button" onClick={() => void deactivateItem(item)} title="ปิดใช้งาน"><Archive size={16} /></button></div></td></tr>)}{!activeRows.length && <tr><td colSpan={6} className="settings-empty-results">{searched[tab] ? 'ไม่พบรายการที่ตรงกับเงื่อนไขค้นหา' : 'กรอกคำค้นหา แล้วกดปุ่มค้นหาเพื่อแสดงรายการ'}</td></tr>}</tbody></table></div>
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
      const source = isSupabaseConfigured ? await listRawMaterials() : rawMaterials
      const matches = source.filter((item) => matchesMasterSearch(item, query))
      setItems(matches)
      setSearched(true)
    } catch {
      setItems([])
      setSearched(true)
      setNotice('ค้นหา Item FG ไม่สำเร็จ กรุณาตรวจการเชื่อมต่อ Supabase')
    } finally {
      setSearching(false)
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
      setNotice(`${label}: อัปโหลด ${file.name} และสร้าง Version ใหม่แล้ว`)
    } catch (error) {
      setNotice(`${label}: อัปโหลดไม่สำเร็จ — ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }
  const assetByType = new Map(assets.map((asset) => [asset.type, asset]))
  return <div className="document-settings-grid">
    <section className="card document-master-list"><div className="card-header"><div><p className="eyebrow">ITEM MASTER</p><h2>เลือก Item FG</h2></div></div><form className="document-settings-search" onSubmit={searchItems}><label className="search-box"><Search size={18} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="ค้นหา Item FG, Name Part หรือ DWG No.…" /></label><button className="button button-primary" type="submit" disabled={searching}><Search size={17} />{searching ? 'กำลังค้นหา…' : 'ค้นหา'}</button></form><div className="result-list">{items.map((item) => <button className={`document-result ${selected?.id === item.id ? 'selected' : ''}`} onClick={() => setSelected(item)} key={item.id}><span className="availability found"><FileImage /></span><span><strong>{item.itemFg}</strong><small>{item.partName} • {item.drawingNo}</small></span></button>)}{!items.length && <p className="settings-result-message">{searched ? 'ไม่พบ Item FG ที่ตรงกับคำค้นหา' : 'กรอกคำค้นหา แล้วกดปุ่มค้นหาเพื่อแสดงรายการ'}</p>}</div></section>
    <section className="card file-manager"><div className="card-header"><div><p className="eyebrow">PRIVATE R2 DOCUMENTS</p><h2>{selected ? `${selected.itemFg} — ${selected.partName}` : 'ไม่พบ Item FG'}</h2></div></div>{notice && <div className="inline-notice"><FileUp size={17} />{notice}</div>}
      {selected && ([['Drawing', 'drawing'], ['Inprocess Check Sheet', 'inprocess'], ['QC Check Sheet', 'qc']] as const).map(([label, type]) => {
        const asset = assetByType.get(type)
        return <article className="upload-row" key={label}><span className={`availability ${asset ? 'found' : 'missing'}`}>{asset ? <FileCheck2 /> : <FileImage />}</span><div><strong>{label}</strong><small>{loadingAssets ? 'กำลังตรวจสอบ…' : asset ? `${asset.filename} • Version ${asset.version}` : 'ยังไม่มีไฟล์ที่ Active'}</small></div>{asset && <button className="button button-ghost" onClick={() => setPreviewAsset(asset)}>Preview</button>}<label className="button button-secondary upload-button"><FileUp size={16} />{asset ? 'Add revision' : 'Add file'}<input type="file" accept="image/jpeg,image/png,image/webp,application/pdf" onChange={(event) => void upload(label, type, event.target.files?.[0])} /></label></article>
      })}
      {previewAsset && <div className="settings-document-preview"><div className="card-header"><div><p className="eyebrow">PREVIEW</p><h2>{previewAsset.itemFg} • {previewAsset.filename}</h2></div><button className="icon-button" onClick={() => setPreviewAsset(null)} aria-label="ปิด Preview"><X size={18} /></button></div>{previewUrl ? (previewAsset.mimeType === 'application/pdf' ? <iframe src={previewUrl} title={previewAsset.filename} /> : <img src={previewUrl} alt={previewAsset.filename} />) : <p>กำลังโหลดเอกสาร…</p>}</div>}
      <p className="helper-text">ต้นฉบับเก็บใน Cloudflare R2 แบบ Private และ Supabase เก็บ Metadata/Version เท่านั้น</p>
    </section>
  </div>
}
