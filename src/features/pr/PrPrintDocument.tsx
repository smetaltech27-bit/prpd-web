import { forwardRef } from 'react'
import type { PrDraft, PrLineItem, PrPage } from './types'
import { buildPrPages } from './pagination'
import './pr.css'

export interface PrPrintDocumentProps {
  draft: PrDraft
  pages?: PrPage<PrLineItem>[]
  logoUrl?: string
  companyName?: string
}

const money = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

function dateText(value: string): string {
  if (!value) return '-'
  const [year, month, day] = value.split('-')
  return year && month && day ? `${day}/${month}/${year}` : value
}

function signatureBlock(requestedBy: string) {
  return (
    <footer className="pr-signatures" aria-label="Approval signatures">
      {['Requester', 'Checked', 'Approved'].map((role) => (
        <div className="pr-signature" key={role}>
          <strong>{role}</strong>
          <div>{role === 'Requester' && requestedBy ? requestedBy : ''}</div>
        </div>
      ))}
    </footer>
  )
}

export const PrPrintDocument = forwardRef<HTMLDivElement, PrPrintDocumentProps>(
  function PrPrintDocument({ draft, pages = buildPrPages(draft.items), logoUrl, companyName = 'S Metal Tech Co.,Ltd.' }, ref) {
    const vendorTotal = draft.items.reduce((sum, item) => sum + (item.unitPrice ?? 0) * item.quantity, 0)
    return (
      <div className="pr-print-root" ref={ref}>
        {pages.map((page) => (
          <article className="pr-print-page print-page" key={`${page.vendor}-${page.pageNumber}`}>
            <header className="pr-print-header">
              <div className="pr-print-brand">
                {logoUrl ? <img src={logoUrl} alt={`${companyName} logo`} /> : null}
                <strong>{companyName}</strong>
              </div>
              <div className="pr-page-label">หน้า {page.pageNumber} / {page.totalPages}</div>
              <dl className="pr-print-meta">
                <div><dt>PR</dt><dd>{draft.prNumber}</dd></div>
              </dl>
            </header>

            <section className="pr-print-vendor">
              <strong>{draft.kind === 'raw-material' ? 'Purchase Request / Vendor' : 'Factory Supply / Equipment Request'}</strong>
              <b>{page.vendor}</b>
              <span>Date</span>
              <b>{dateText(draft.requestDate)}</b>
            </section>

            <table className="pr-print-table">
              <thead><tr><th>No.</th><th>Code RM</th><th>Name part</th><th>Type</th><th>Dimension</th><th>Q’ty</th><th>Price</th><th>Due date</th><th>Comment</th></tr></thead>
              <tbody>
                {page.rows.map((item, rowIndex) => {
                  const absoluteIndex = (page.pageNumber - 1) * page.rows.length + rowIndex + 1
                  return item ? (
                    <tr key={item.lineId}>
                      <td>{absoluteIndex}</td><td>{item.codeOrder || '-'}</td><td>{item.namePart}</td>
                      <td>{item.materialType || '-'}</td><td>{[item.spec, item.dimension].filter(Boolean).join(' / ') || '-'}</td>
                      <td>{item.quantity}</td><td>{money.format(item.unitPrice ?? 0)}</td><td>{dateText(item.dueDate ?? '')}</td><td>{item.comment || '-'}</td>
                    </tr>
                  ) : <tr className="pr-empty-row" key={`empty-${rowIndex}`} aria-hidden="true">{Array.from({ length: 9 }, (_, cellIndex) => <td key={cellIndex}>&nbsp;</td>)}</tr>
                })}
              </tbody>
              <tfoot>
                <tr><td colSpan={6}>{page.isFinalPage ? 'Total Amount' : 'Continued on next page'}</td><td>{page.isFinalPage ? money.format(vendorTotal) : ''}</td><td colSpan={2} /></tr>
              </tfoot>
            </table>
            {page.isFinalPage ? signatureBlock(draft.requestedBy) : <div className="pr-continuation">มีรายการต่อหน้าถัดไป • ช่องลงนามอยู่หน้าสุดท้าย</div>}
          </article>
        ))}
      </div>
    )
  },
)
