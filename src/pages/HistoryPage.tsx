import { Filter, LoaderCircle, Search } from 'lucide-react'
import { useEffect, useState, type FormEvent } from 'react'
import { PageHeader } from '../components/AppShell'
import { searchPrHistory, type PrHistoryLine } from '../services/prpdRepository'

type HistoryTab = 'raw_material' | 'factory_supply'

function displayDate(value: string): string {
  if (!value) return '-'
  const [year, month, day] = value.split('-')
  return year && month && day ? `${day}/${month}/${year}` : value
}

export function HistoryPage() {
  const [tab, setTab] = useState<HistoryTab>('raw_material')
  const [requestDate, setRequestDate] = useState('')
  const [prNumber, setPrNumber] = useState('')
  const [vendor, setVendor] = useState('')
  const [itemFg, setItemFg] = useState('')
  const [codeOrderRm, setCodeOrderRm] = useState('')
  const [rows, setRows] = useState<PrHistoryLine[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function load() {
    setLoading(true)
    setError('')
    try {
      setRows(await searchPrHistory({ kind: tab, requestDate, prNumber, vendor, itemFg, codeOrderRm }))
    } catch (reason) {
      setRows([])
      setError(reason instanceof Error ? reason.message : 'ค้นหาประวัติไม่สำเร็จ')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void load() }, [tab])

  function submit(event: FormEvent) {
    event.preventDefault()
    void load()
  }

  return <div className="page">
    <PageHeader eyebrow="MANAGEMENT" title="PR History" description="ประวัติแบบรายบรรทัดตามเอกสารเดิม แยก Raw Material และวัสดุอุปกรณ์" />
    <section className="card history-card">
      <div className="tab-bar" role="tablist">
        <button className={tab === 'raw_material' ? 'active' : ''} onClick={() => setTab('raw_material')}>ประวัติ Raw Material</button>
        <button className={tab === 'factory_supply' ? 'active' : ''} onClick={() => setTab('factory_supply')}>ประวัติวัสดุอุปกรณ์</button>
      </div>
      <form className="history-filters" onSubmit={submit}>
        <label><span>วันที่</span><input type="date" value={requestDate} onChange={(event) => setRequestDate(event.target.value)} /></label>
        <label><span>เลข PR</span><input value={prNumber} onChange={(event) => setPrNumber(event.target.value)} placeholder="PR-2608-…" /></label>
        <label><span>Vendor</span><input value={vendor} onChange={(event) => setVendor(event.target.value)} /></label>
        {tab === 'raw_material' && <label><span>Item FG</span><input value={itemFg} onChange={(event) => setItemFg(event.target.value)} /></label>}
        <label><span>Code RM</span><input value={codeOrderRm} onChange={(event) => setCodeOrderRm(event.target.value)} /></label>
        <button className="button button-primary" disabled={loading}>{loading ? <LoaderCircle className="spin" /> : <Search size={17} />}{loading ? 'กำลังค้นหา…' : 'ค้นหา'}</button>
        <button className="button button-secondary" type="button" onClick={() => { setRequestDate(''); setPrNumber(''); setVendor(''); setItemFg(''); setCodeOrderRm('') }}><Filter size={17} /> ล้างตัวกรอง</button>
      </form>
      {error && <div className="flow-notice error">{error}</div>}
      <div className="table-wrap history-lines-wrap"><table className="data-table history-lines-table"><thead><tr>
        <th>No.</th><th>Date</th><th>PR Number</th><th>Vendor</th>{tab === 'raw_material' && <th>Item FG</th>}<th>Code RM</th><th>Name Part</th><th>Type</th><th>Spec</th>{tab === 'raw_material' && <th>จำนวนผลิต</th>}<th>Q’ty</th><th>Price</th><th>Due Date</th><th>Comment</th>
      </tr></thead><tbody>
        {rows.map((row, index) => <tr key={row.lineId}><td>{index + 1}</td><td>{displayDate(row.requestDate)}</td><td><strong className="link-text">{row.prNumber}</strong></td><td>{row.vendorName}</td>{tab === 'raw_material' && <td>{row.itemFg || '-'}</td>}<td>{row.codeOrderRm || '-'}</td><td>{row.namePart}</td><td>{row.materialType || '-'}</td><td>{row.spec || '-'}</td>{tab === 'raw_material' && <td>{row.fgQty ?? '-'}</td>}<td>{row.quantity}</td><td>{row.unitPrice.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td><td>{displayDate(row.dueDate)}</td><td>{row.comment || '-'}</td></tr>)}
      </tbody></table></div>
      {!loading && !rows.length && !error && <p className="no-results">ไม่พบประวัติ PR ตามเงื่อนไขที่ระบุ</p>}
    </section>
  </div>
}
