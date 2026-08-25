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

const money = new Intl.NumberFormat('en-US', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

function signatureBlock() {
  return (
    <footer className="pr-signatures" aria-label="Approval signatures">
      {['Requester', 'Checked', 'Approved'].map((role) => (
        <div className="pr-signature" key={role}>
          <div className="pr-signature__line" />
          <strong>{role}</strong>
          <span>Date ____ / ____ / ______</span>
        </div>
      ))}
    </footer>
  )
}

export const PrPrintDocument = forwardRef<HTMLDivElement, PrPrintDocumentProps>(
  function PrPrintDocument(
    { draft, pages = buildPrPages(draft.items), logoUrl, companyName = 'S METAL TECH' },
    ref,
  ) {
    return (
      <div className="pr-print-root" ref={ref}>
        {pages.map((page) => (
          <article className="pr-print-page print-page" key={`${page.vendor}-${page.pageNumber}`}>
            <header className="pr-print-header">
              <div className="pr-print-brand">
                {logoUrl ? <img src={logoUrl} alt={`${companyName} logo`} /> : null}
                <div>
                  <strong>{companyName}</strong>
                  <span>Purchase Request</span>
                </div>
              </div>
              <dl className="pr-print-meta">
                <div><dt>PR No.</dt><dd>{draft.prNumber}</dd></div>
                <div><dt>Date</dt><dd>{draft.requestDate}</dd></div>
                <div><dt>Page</dt><dd>{page.pageNumber} / {page.totalPages}</dd></div>
              </dl>
            </header>

            <section className="pr-print-vendor">
              <span>Vendor</span><strong>{page.vendor}</strong>
              <span>Request type</span>
              <strong>{draft.kind === 'raw-material' ? 'Raw Material' : 'Factory Supply / Equipment'}</strong>
            </section>

            <table className="pr-print-table">
              <thead>
                <tr>
                  <th>No.</th><th>Item FG</th><th>Part / Description</th><th>Spec / Dimension</th>
                  <th>Qty</th><th>Unit price</th><th>Amount</th><th>Comment</th>
                </tr>
              </thead>
              <tbody>
                {page.rows.map((item, rowIndex) => {
                  const absoluteIndex = (page.pageNumber - 1) * page.rows.length + rowIndex + 1
                  return item ? (
                    <tr key={item.id}>
                      <td>{absoluteIndex}</td><td>{item.itemFg || '-'}</td><td>{item.namePart}</td>
                      <td>{[item.spec, item.dimension].filter(Boolean).join(' · ') || '-'}</td>
                      <td>{item.quantity}</td><td>{money.format(item.unitPrice ?? 0)}</td>
                      <td>{money.format((item.unitPrice ?? 0) * item.quantity)}</td><td>{item.comment || '-'}</td>
                    </tr>
                  ) : (
                    <tr className="pr-empty-row" key={`empty-${rowIndex}`} aria-hidden="true">
                      {Array.from({ length: 8 }, (_, cellIndex) => <td key={cellIndex}>&nbsp;</td>)}
                    </tr>
                  )
                })}
              </tbody>
            </table>

            {page.continuation ? (
              <div className="pr-continuation">Continued on next page · Signature section is on the final page</div>
            ) : signatureBlock()}
          </article>
        ))}
      </div>
    )
  },
)
