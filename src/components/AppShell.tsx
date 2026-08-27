import {
  Boxes, ClipboardList, FileCheck2, FileClock, FileImage, FileText, History,
  Menu, PackageSearch, Settings, ShieldCheck, Wrench, X,
} from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import { NavLink, useLocation, useNavigate } from 'react-router-dom'
import { startSettingsIdleLock, unlockSettings } from '../services/settingsAccess'
import { ensureAppSession, type AppSessionState } from '../services/appSession'
import { isSupabaseConfigured } from '../lib/supabase'
import { PasswordModal } from './PasswordModal'

interface AppShellProps { children: ReactNode }

const mainMenu = [
  { path: '/raw-material-pr', label: 'ออก PR วัตถุดิบ (Raw Material PR)', icon: PackageSearch },
  { path: '/equipment-pr', label: 'ออก PR วัสดุอุปกรณ์ (Equipment PR)', icon: Boxes },
  { path: '/work-order', label: 'ใบสั่งงาน (Work Order)', icon: Wrench },
]

const documentMenu = [
  { path: '/print/drawing', label: 'พิมพ์แบบงาน (Print Drawing)', icon: FileImage },
  { path: '/print/inprocess', label: 'พิมพ์ใบตรวจระหว่างผลิต (Print Inprocess Check Sheet)', icon: FileClock },
  { path: '/print/qc', label: 'พิมพ์ใบตรวจคุณภาพ (Print QC Check Sheet)', icon: FileCheck2 },
]

export function AppShell({ children }: AppShellProps) {
  const [mobileOpen, setMobileOpen] = useState(false)
  const [passwordOpen, setPasswordOpen] = useState(false)
  const [settingsUnlocked, setSettingsUnlocked] = useState(false)
  const [appSession, setAppSession] = useState<AppSessionState>(isSupabaseConfigured ? 'error' : 'demo')
  const navigate = useNavigate()
  const location = useLocation()

  function closeMobile() { setMobileOpen(false) }

  useEffect(() => {
    void ensureAppSession().then(setAppSession)
  }, [])

  useEffect(() => {
    if (!settingsUnlocked) return
    return startSettingsIdleLock(() => {
      setSettingsUnlocked(false)
      if (location.pathname === '/settings') navigate('/raw-material-pr', { replace: true })
    })
  }, [settingsUnlocked, location.pathname, navigate])

  useEffect(() => {
    const handleLock = () => {
      setSettingsUnlocked(false)
      navigate('/raw-material-pr', { replace: true })
    }
    window.addEventListener('prpd-settings-lock', handleLock)
    return () => window.removeEventListener('prpd-settings-lock', handleLock)
  }, [navigate])

  useEffect(() => {
    if (location.pathname === '/settings' && !settingsUnlocked && !passwordOpen) setPasswordOpen(true)
  }, [location.pathname, passwordOpen, settingsUnlocked])

  function handleSettingsClick() {
    closeMobile()
    if (settingsUnlocked) navigate('/settings')
    else setPasswordOpen(true)
  }

  async function handleUnlock(password: string) {
    const result = await unlockSettings(password)
    if (result.ok) {
      setSettingsUnlocked(true)
      setPasswordOpen(false)
      navigate('/settings')
    }
    return result
  }

  const navItem = ({ path, label, icon: Icon }: typeof mainMenu[number]) => (
    <NavLink key={path} to={path} onClick={closeMobile} className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
      <Icon size={19} strokeWidth={1.9} /><span>{label}</span>
    </NavLink>
  )

  return (
    <div className="app-shell">
      {mobileOpen && <button className="sidebar-backdrop" aria-label="ปิดเมนู" onClick={closeMobile} />}
      <aside className={`sidebar ${mobileOpen ? 'open' : ''}`}>
        <div className="brand">
          <div className="brand-logo"><img src={`${import.meta.env.BASE_URL}logo-smt.jpg`} alt="S Metal Tech" /></div>
          <div><strong>PRPD</strong><span>คำขอซื้อ (Purchase Request)</span></div>
          <button className="sidebar-close" onClick={closeMobile} aria-label="ปิดเมนู"><X size={20} /></button>
        </div>
        <nav className="sidebar-nav" aria-label="เมนูหลัก">
          <p className="nav-heading">คำขอซื้อ (PURCHASE REQUEST)</p>
          {mainMenu.map(navItem)}
          <p className="nav-heading">เอกสารการผลิต (PRODUCTION DOCUMENTS)</p>
          {documentMenu.map(navItem)}
          <p className="nav-heading">การจัดการ (MANAGEMENT)</p>
          <NavLink to="/pr-history" onClick={closeMobile} className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
            <History size={19} /><span>ประวัติ PR (PR History)</span>
          </NavLink>
        </nav>
        <div className="sidebar-footer">
          <button className={`nav-item settings-link ${location.pathname === '/settings' ? 'active' : ''}`} onClick={handleSettingsClick}>
            <Settings size={19} /><span>การตั้งค่า (Settings)</span><ShieldCheck size={15} className="nav-trailing" />
          </button>
          <div className={`system-status ${appSession === 'ready' ? '' : 'setup-required'}`}><span /><div><strong>{appSession === 'ready' ? 'ระบบออนไลน์ (System online)' : appSession === 'demo' ? 'ข้อมูลตัวอย่าง (Demo data)' : 'การเชื่อมต่อมีปัญหา (Connection issue)'}</strong><small>{appSession === 'ready' ? 'Supabase พร้อมใช้งาน (Supabase ready)' : appSession === 'demo' ? 'ต้องตั้งค่าระบบ (Setup required)' : 'ตรวจสอบ Supabase Auth (Check Supabase Auth)'}</small></div></div>
        </div>
      </aside>
      <main className="main-area">
        <header className="mobile-header">
          <button className="icon-button" onClick={() => setMobileOpen(true)} aria-label="เปิดเมนู"><Menu /></button>
          <div className="mobile-brand"><FileText size={20} /><strong>PRPD</strong></div>
          <div className="status-dot" />
        </header>
        {location.pathname === '/settings' && !settingsUnlocked ? (
          <div className="page"><EmptyState icon={ShieldCheck} title="Settings is locked" description="กรอกรหัสผ่านผู้ดูแลระบบเพื่อเข้าถึง Master Data และไฟล์เอกสาร" /></div>
        ) : children}
      </main>
      <PasswordModal open={passwordOpen} onClose={() => { setPasswordOpen(false); if (location.pathname === '/settings' && !settingsUnlocked) navigate('/raw-material-pr', { replace: true }) }} onUnlock={handleUnlock} />
    </div>
  )
}

export function PageHeader({ eyebrow, title, description, actions }: { eyebrow: string; title: string; description: string; actions?: ReactNode }) {
  return (
    <header className="page-header">
      <div><p className="eyebrow">{eyebrow}</p><h1>{title}</h1><p>{description}</p></div>
      {actions && <div className="page-actions">{actions}</div>}
    </header>
  )
}

export function EmptyState({ icon: Icon = ClipboardList, title, description }: { icon?: typeof ClipboardList; title: string; description: string }) {
  return <div className="empty-state"><span><Icon size={24} /></span><h3>{title}</h3><p>{description}</p></div>
}
