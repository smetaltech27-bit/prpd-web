import { Download, Filter, Printer, Search } from 'lucide-react'
import { useMemo, useState } from 'react'
import { historyRecords } from '../app/mockData'
import { PageHeader } from '../components/AppShell'

export function HistoryPage() {
  const [tab, setTab] = useState<'Raw Material' | 'Equipment'>('Raw Material')
  const [query, setQuery] = useState('')
  const rows = useMemo(() => historyRecords.filter((record) => record.category === tab && [record.prNumber, record.vendor].some((value) => value.toLowerCase().includes(query.toLowerCase()))), [query, tab])
  return <div className="page">
    <PageHeader eyebrow="MANAGEMENT" title="PR History" description="ค้นหา ตรวจสอบ และพิมพ์ Purchase Request ที่เคยสร้าง" actions={<button className="button button-secondary"><Download size={17} /> Export</button>} />
    <section className="card history-card">
      <div className="tab-bar" role="tablist"><button className={tab === 'Raw Material' ? 'active' : ''} onClick={() => setTab('Raw Material')}>Raw Material PR</button><button className={tab === 'Equipment' ? 'active' : ''} onClick={() => setTab('Equipment')}>Equipment PR</button></div>
      <div className="table-toolbar"><label className="search-box"><Search size={18} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="ค้นหา PR No. หรือ Vendor…" /></label><button className="button button-secondary"><Filter size={17} /> Filter</button></div>
      <div className="table-wrap"><table className="data-table history-table"><thead><tr><th>PR NUMBER</th><th>DATE</th><th>VENDOR</th><th>ITEMS</th><th>AMOUNT</th><th>STATUS</th><th /></tr></thead><tbody>{rows.map((record) => <tr key={record.prNumber}><td><strong className="link-text">{record.prNumber}</strong></td><td>{record.date}</td><td><strong>{record.vendor}</strong><span>{record.category}</span></td><td>{record.items}</td><td><strong>฿{record.amount.toLocaleString()}</strong></td><td><span className={`status-pill ${record.status.toLowerCase()}`}>{record.status}</span></td><td><button className="icon-button" onClick={() => window.print()} aria-label="พิมพ์"><Printer size={17} /></button></td></tr>)}</tbody></table></div>
      {!rows.length && <p className="no-results">ไม่พบ Purchase Request ในหมวดนี้</p>}
    </section>
  </div>
}
