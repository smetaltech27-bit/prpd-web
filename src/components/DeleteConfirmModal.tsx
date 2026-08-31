import { AlertTriangle, LoaderCircle, Trash2, X } from 'lucide-react'
import { createPortal } from 'react-dom'
import { type FormEvent, useEffect, useRef, useState } from 'react'

interface DeleteConfirmModalProps {
  open: boolean
  onClose: () => void
  onConfirm: () => Promise<void>
  title: string
  description: string
  resourceName: string
  confirmationValue?: string
  submitLabel?: string
}

export function DeleteConfirmModal({
  open,
  onClose,
  onConfirm,
  title,
  description,
  resourceName,
  confirmationValue,
  submitLabel = 'ลบถาวร',
}: DeleteConfirmModalProps) {
  const [confirmation, setConfirmation] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const submittingRef = useRef(false)
  const cancelRef = useRef<HTMLButtonElement>(null)
  const formRef = useRef<HTMLFormElement>(null)
  const requiresTypedConfirmation = Boolean(confirmationValue)
  const matchesConfirmation = !requiresTypedConfirmation || confirmation.trim() === confirmationValue

  useEffect(() => {
    if (!open) return
    setConfirmation('')
    setError('')
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    window.setTimeout(() => cancelRef.current?.focus(), 80)
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !submittingRef.current) onClose()
    }
    document.addEventListener('keydown', handleEscape)
    return () => {
      document.body.style.overflow = previousOverflow
      document.removeEventListener('keydown', handleEscape)
    }
  }, [open])

  if (!open) return null

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (!matchesConfirmation || submitting) return
    setSubmitting(true)
    submittingRef.current = true
    setError('')
    try {
      await onConfirm()
      onClose()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'ลบข้อมูลไม่สำเร็จ')
    } finally {
      submittingRef.current = false
      setSubmitting(false)
    }
  }

  return createPortal(
    <div className="modal-overlay delete-confirm-overlay" role="presentation">
      <section className="modal-panel delete-confirm-modal" role="alertdialog" aria-modal="true" aria-labelledby="delete-confirm-title" aria-describedby="delete-confirm-description">
        <header className="modal-header">
          <span className="modal-icon danger"><AlertTriangle size={22} /></span>
          <div><p className="eyebrow">PERMANENT DELETE</p><h2 id="delete-confirm-title">{title}</h2></div>
          <button className="icon-button" type="button" onClick={onClose} disabled={submitting} aria-label="ปิด"><X size={19} /></button>
        </header>
        <form ref={formRef} className="modal-body delete-confirm-body" onSubmit={handleSubmit}>
          <p id="delete-confirm-description" className="muted">{description}</p>
          <div className="delete-resource"><span>รายการที่จะลบ</span><strong>{resourceName}</strong></div>
          <div className="delete-warning"><AlertTriangle size={17} /><span>การลบนี้เรียกคืนไม่ได้</span></div>
          {confirmationValue && <label className="field delete-confirm-field"><span>พิมพ์ <strong>{confirmationValue}</strong> เพื่อยืนยัน</span><input autoComplete="off" value={confirmation} onChange={(event) => { setConfirmation(event.target.value); setError('') }} /></label>}
          {error && <p className="field-error" role="alert">{error}</p>}
        </form>
        <footer className="modal-footer">
          <button ref={cancelRef} className="button button-secondary" type="button" onClick={onClose} disabled={submitting}>ยกเลิก</button>
          <button className="button button-danger" type="button" disabled={!matchesConfirmation || submitting} onClick={() => formRef.current?.requestSubmit()}>{submitting ? <LoaderCircle className="spin" size={17} /> : <Trash2 size={17} />}{submitting ? 'กำลังลบ…' : submitLabel}</button>
        </footer>
      </section>
    </div>,
    document.body,
  )
}
