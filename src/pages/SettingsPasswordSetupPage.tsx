import { CheckCircle2, Eye, EyeOff, KeyRound, LockKeyhole, ShieldCheck } from 'lucide-react'
import { useEffect, useState, type FormEvent } from 'react'
import { settingsSupabase } from '../lib/supabase'
import { validateNewSettingsPassword } from '../services/settingsInvite'

type SetupState = 'checking' | 'ready' | 'invalid' | 'saving' | 'success'

function returnToSettings() {
  const destination = new URL(window.location.href)
  destination.search = ''
  destination.hash = '/settings'
  window.location.replace(destination.toString())
}

export function SettingsPasswordSetupPage() {
  const [state, setState] = useState<SetupState>('checking')
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [visible, setVisible] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    async function verifyInvite() {
      if (!settingsSupabase) {
        if (active) setState('invalid')
        return
      }
      const { data, error: sessionError } = await settingsSupabase.auth.getSession()
      const expectedEmail = import.meta.env.VITE_SETTINGS_ADMIN_EMAIL?.trim().toLocaleLowerCase()
      const actualEmail = data.session?.user.email?.toLocaleLowerCase()
      if (sessionError || !data.session || !expectedEmail || actualEmail !== expectedEmail) {
        await settingsSupabase.auth.signOut()
        if (active) setState('invalid')
        return
      }
      const { data: isAdmin, error: roleError } = await settingsSupabase.rpc('is_settings_admin')
      if (roleError || isAdmin !== true) {
        await settingsSupabase.auth.signOut()
        if (active) setState('invalid')
        return
      }
      if (active) setState('ready')
    }
    void verifyInvite()
    return () => { active = false }
  }, [])

  async function submit(event: FormEvent) {
    event.preventDefault()
    const validationError = validateNewSettingsPassword(password, confirmation)
    if (validationError) {
      setError(validationError)
      return
    }
    if (!settingsSupabase) {
      setState('invalid')
      return
    }
    setError('')
    setState('saving')
    const { error: updateError } = await settingsSupabase.auth.updateUser({ password })
    if (updateError) {
      setError(updateError.message || 'ตั้งรหัสผ่านไม่สำเร็จ กรุณาลองอีกครั้ง')
      setState('ready')
      return
    }
    await settingsSupabase.auth.signOut()
    setPassword('')
    setConfirmation('')
    setState('success')
  }

  return (
    <main className="auth-setup-shell">
      <section className="auth-setup-card" aria-labelledby="password-setup-title">
        <div className="auth-setup-brand">
          <div className="brand-logo"><img src={`${import.meta.env.BASE_URL}logo-smt.jpg`} alt="S Metal Tech" /></div>
          <div><strong>PRPD</strong><span>Secure administrator setup</span></div>
        </div>

        {state === 'checking' && <div className="auth-setup-status" role="status"><span className="modal-icon"><ShieldCheck /></span><h1 id="password-setup-title">กำลังตรวจสอบคำเชิญ</h1><p>ระบบกำลังยืนยัน Session และสิทธิ์ Settings Admin</p></div>}

        {state === 'invalid' && <div className="auth-setup-status"><span className="modal-icon danger"><LockKeyhole /></span><h1 id="password-setup-title">ลิงก์ใช้ไม่ได้หรือหมดอายุ</h1><p>กรุณาใช้ Invite ล่าสุด หรือติดต่อผู้ดูแลเพื่อส่งคำเชิญใหม่</p><button className="button button-secondary" onClick={returnToSettings}>กลับหน้า Settings</button></div>}

        {(state === 'ready' || state === 'saving') && <>
          <header className="auth-setup-heading">
            <span className="modal-icon"><KeyRound /></span>
            <div><p className="eyebrow">FIRST-TIME SETUP</p><h1 id="password-setup-title">ตั้ง Password สำหรับ Settings</h1></div>
          </header>
          <p className="muted">รหัสนี้ใช้เฉพาะการปลดล็อกเมนู Settings และจะถูกส่งตรงไปยัง Supabase Auth โดยไม่บันทึกไว้ใน Source Code หรือ Browser</p>
          <form className="auth-setup-form" onSubmit={submit}>
            <label className="field-label" htmlFor="new-settings-password">Password ใหม่</label>
            <div className={`password-field ${error ? 'has-error' : ''}`}>
              <KeyRound size={18} />
              <input id="new-settings-password" type={visible ? 'text' : 'password'} value={password} onChange={(event) => { setPassword(event.target.value); setError('') }} autoComplete="new-password" placeholder="อย่างน้อย 6 ตัวอักษร" disabled={state === 'saving'} autoFocus />
              <button type="button" onClick={() => setVisible((value) => !value)} aria-label={visible ? 'ซ่อนรหัสผ่าน' : 'แสดงรหัสผ่าน'}>{visible ? <EyeOff size={18} /> : <Eye size={18} />}</button>
            </div>
            <label className="field-label" htmlFor="confirm-settings-password">ยืนยัน Password</label>
            <div className={`password-field ${error ? 'has-error' : ''}`}>
              <KeyRound size={18} />
              <input id="confirm-settings-password" type={visible ? 'text' : 'password'} value={confirmation} onChange={(event) => { setConfirmation(event.target.value); setError('') }} autoComplete="new-password" placeholder="กรอก Password เดิมอีกครั้ง" disabled={state === 'saving'} />
              <span aria-hidden="true" />
            </div>
            {error && <p className="field-error" role="alert">{error}</p>}
            <div className="security-note">Password ต้องมีความยาวอย่างน้อย 6 ตัวอักษร</div>
            <button className="button button-primary button-full" type="submit" disabled={state === 'saving'}>{state === 'saving' ? 'กำลังตั้ง Password…' : 'บันทึก Password'}</button>
          </form>
        </>}

        {state === 'success' && <div className="auth-setup-status"><span className="modal-icon success"><CheckCircle2 /></span><h1 id="password-setup-title">ตั้ง Password สำเร็จ</h1><p>Invite session ถูกปิดแล้ว กรุณาใช้ Password ใหม่เพื่อปลดล็อก Settings</p><button className="button button-primary" onClick={returnToSettings}>ไปหน้า Settings</button></div>}
      </section>
    </main>
  )
}
