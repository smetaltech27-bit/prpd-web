import { createPortal } from 'react-dom'
import { Eye, EyeOff, KeyRound, LockKeyhole, X } from 'lucide-react'
import { type FormEvent, useEffect, useRef, useState } from 'react'
import type { SettingsUnlockResult } from '../services/settingsAccess'

interface PasswordModalProps {
  open: boolean
  onClose: () => void
  onUnlock: (password: string) => Promise<SettingsUnlockResult>
  eyebrow?: string
  title?: string
  description?: string
  submitLabel?: string
  danger?: boolean
}

export function PasswordModal({
  open,
  onClose,
  onUnlock,
  eyebrow = 'Restricted area',
  title = 'ปลดล็อก Settings',
  description = 'กรอกรหัสผ่านผู้ดูแลระบบเพื่อจัดการ Master Data และเอกสารการผลิต',
  submitLabel = 'ปลดล็อก',
  danger = false,
}: PasswordModalProps) {
  const [password, setPassword] = useState('')
  const [visible, setVisible] = useState(false)
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [failedAttempts, setFailedAttempts] = useState(0)
  const [cooldownUntil, setCooldownUntil] = useState(0)
  const [clock, setClock] = useState(Date.now())
  const inputRef = useRef<HTMLInputElement>(null)
  const formRef = useRef<HTMLFormElement>(null)
  const cooldownSeconds = Math.max(0, Math.ceil((cooldownUntil - clock) / 1000))

  useEffect(() => {
    if (!cooldownUntil) return
    const timer = window.setInterval(() => {
      const now = Date.now()
      setClock(now)
      if (now >= cooldownUntil) {
        setCooldownUntil(0)
        setFailedAttempts(0)
      }
    }, 1000)
    return () => window.clearInterval(timer)
  }, [cooldownUntil])

  useEffect(() => {
    if (!open) return
    setPassword('')
    setError('')
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    window.setTimeout(() => inputRef.current?.focus(), 80)
    const handleEscape = (event: KeyboardEvent) => event.key === 'Escape' && onClose()
    document.addEventListener('keydown', handleEscape)
    return () => {
      document.body.style.overflow = previousOverflow
      document.removeEventListener('keydown', handleEscape)
    }
  }, [open, onClose])

  if (!open) return null

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (cooldownSeconds > 0) return
    if (!password.trim()) {
      setError('กรุณากรอกรหัสผ่าน')
      return
    }
    setSubmitting(true)
    const result = await onUnlock(password)
    setSubmitting(false)
    if (!result.ok) {
      const messages = {
        'not-configured': 'ยังไม่ได้ตั้งค่าบัญชี Settings Admin ในระบบ',
        'invalid-credentials': 'รหัสผ่านไม่ถูกต้อง กรุณาลองอีกครั้ง',
        'not-authorized': 'บัญชีนี้ไม่มีสิทธิ์จัดการ Settings',
      }
      if (result.reason === 'invalid-credentials') {
        const nextAttempts = failedAttempts + 1
        if (nextAttempts >= 5) {
          setFailedAttempts(0)
          setCooldownUntil(Date.now() + 5 * 60 * 1000)
          setClock(Date.now())
          setError('กรอกรหัสผิดครบ 5 ครั้ง ระบบพักการลอง 5 นาที')
        } else {
          setFailedAttempts(nextAttempts)
          setError(`${messages[result.reason]} (เหลือ ${5 - nextAttempts} ครั้ง)`)
        }
      } else {
        setError(messages[result.reason])
      }
      setPassword('')
      inputRef.current?.focus()
    }
  }

  return createPortal(
    <div className="modal-overlay" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="modal-panel unlock-modal" role="dialog" aria-modal="true" aria-labelledby="unlock-title">
        <header className="modal-header">
          <div className={`modal-icon ${danger ? 'danger' : ''}`}><LockKeyhole size={22} /></div>
          <div>
            <p className="eyebrow">{eyebrow}</p>
            <h2 id="unlock-title">{title}</h2>
          </div>
          <button className="icon-button" type="button" onClick={onClose} aria-label="ปิด"><X size={20} /></button>
        </header>
        <form ref={formRef} className="modal-body" onSubmit={handleSubmit}>
          <p className="muted">{description}</p>
          <label className="field-label" htmlFor="settings-password">Password</label>
          <div className={`password-field ${error ? 'has-error' : ''}`}>
            <KeyRound size={18} />
            <input
              ref={inputRef}
              id="settings-password"
              type={visible ? 'text' : 'password'}
              value={password}
              onChange={(event) => { setPassword(event.target.value); setError('') }}
              autoComplete="current-password"
              placeholder="Enter settings password"
              disabled={cooldownSeconds > 0}
            />
            <button type="button" onClick={() => setVisible((value) => !value)} aria-label={visible ? 'ซ่อนรหัสผ่าน' : 'แสดงรหัสผ่าน'}>
              {visible ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>
          {error && <p className="field-error" role="alert">{error}</p>}
          {cooldownSeconds > 0 && <p className="field-error" role="status">ลองใหม่ได้ใน {cooldownSeconds} วินาที</p>}
          <div className="security-note">ระบบตรวจสิทธิ์ผ่าน Supabase Auth และ RLS โดยไม่บันทึกรหัสผ่านไว้ใน Browser</div>
        </form>
        <footer className="modal-footer">
          <button className="button button-secondary" type="button" onClick={onClose}>ยกเลิก</button>
          <button className={`button ${danger ? 'button-danger' : 'button-primary'}`} type="button" disabled={submitting || cooldownSeconds > 0} onClick={() => formRef.current?.requestSubmit()}>
            {submitting ? 'กำลังตรวจสอบ…' : submitLabel}
          </button>
        </footer>
      </section>
    </div>,
    document.body,
  )
}
