import { useMemo, useRef, useState } from 'react'
import { Printer, Search, Trash2 } from 'lucide-react'
import { printNode } from '../../lib/print'
import { PrPrintDocument } from './PrPrintDocument'
import { formatPrNumber } from './prNumber'
import type { PrCatalogItem, PrDraft, PrKind, PrLineItem } from './types'
import './pr.css'

export interface PrBuilderProps {
  kind: PrKind
  catalog: readonly PrCatalogItem[]
  logoUrl?: string
  initialSequence?: number
  onCreate?: (draft: PrDraft) => void | Promise<void>
}

export type SpecificPrBuilderProps = Omit<PrBuilderProps, 'kind'>

export function PrBuilder({
  kind,
  catalog,
  logoUrl,
  initialSequence = 1,
  onCreate,
}: PrBuilderProps) {
  const [query, setQuery] = useState('')
  const [lines, setLines] = useState<PrLineItem[]>([])
  const [requestedBy, setRequestedBy] = useState('')
  const printRef = useRef<HTMLDivElement>(null)

  const matches = useMemo(() => {
    const term = query.trim().toLocaleLowerCase()
    if (!term) return catalog.slice(0, 8)
    return catalog.filter((item) =>
      [item.itemFg, item.namePart, item.spec, item.drawingNo, item.vendor]
        .filter(Boolean)
        .some((value) => value!.toLocaleLowerCase().includes(term)),
    ).slice(0, 20)
  }, [catalog, query])

  const draft: PrDraft = {
    kind,
    prNumber: formatPrNumber(initialSequence),
    requestDate: new Date().toISOString().slice(0, 10),
    requestedBy,
    items: lines,
  }

  function addItem(item: PrCatalogItem) {
    setLines((current) => {
      const existing = current.find((line) => line.id === item.id)
      return existing
        ? current.map((line) => line.id === item.id ? { ...line, quantity: line.quantity + 1 } : line)
        : [...current, { ...item, quantity: item.usage || 1 }]
    })
  }

  function setQuantity(id: string, quantity: number) {
    setLines((current) => current.map((line) =>
      line.id === id ? { ...line, quantity: Math.max(1, quantity || 1) } : line,
    ))
  }

  async function createPr() {
    if (!lines.length) return
    await onCreate?.(draft)
  }

  function printPreview() {
    if (!printRef.current || !lines.length) return
    printNode(printRef.current, { title: draft.prNumber, orientation: 'landscape' })
  }

  return (
    <section className="pr-builder">
      <header className="pr-builder__header">
        <div><span className="pr-eyebrow">Purchase Request</span><h1>{kind === 'raw-material' ? 'Raw Material PR' : 'Factory Supply PR'}</h1></div>
        <span className="pr-number">{draft.prNumber}</span>
      </header>

      <label className="pr-search">
        <Search size={18} aria-hidden="true" />
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search Item FG, part, drawing or vendor" />
      </label>

      <div className="pr-catalog" role="list" aria-label="Search results">
        {matches.map((item) => (
          <button type="button" key={item.id} onClick={() => addItem(item)}>
            <strong>{item.itemFg || item.codeOrder || '-'}</strong>
            <span>{item.namePart}</span><small>{item.vendor}</small>
          </button>
        ))}
      </div>

      <div className="pr-lines-wrap">
        <table className="pr-lines">
          <thead><tr><th>Item FG</th><th>Part</th><th>Vendor</th><th>Qty</th><th /></tr></thead>
          <tbody>
            {lines.length ? lines.map((line) => (
              <tr key={line.id}>
                <td>{line.itemFg || '-'}</td><td>{line.namePart}</td><td>{line.vendor}</td>
                <td><input aria-label={`Quantity for ${line.namePart}`} type="number" min="1" value={line.quantity} onChange={(event) => setQuantity(line.id, Number(event.target.value))} /></td>
                <td><button className="pr-icon-button" aria-label={`Remove ${line.namePart}`} type="button" onClick={() => setLines((current) => current.filter((item) => item.id !== line.id))}><Trash2 size={17} /></button></td>
              </tr>
            )) : <tr><td className="pr-empty-state" colSpan={5}>Select items from the search results to prepare a PR.</td></tr>}
          </tbody>
        </table>
      </div>

      <div className="pr-builder__footer">
        <label>Requester<input value={requestedBy} onChange={(event) => setRequestedBy(event.target.value)} placeholder="Name" /></label>
        <div>
          <button type="button" className="pr-button pr-button--secondary" disabled={!lines.length} onClick={printPreview}><Printer size={17} /> Preview & Print</button>
          <button type="button" className="pr-button" disabled={!lines.length} onClick={createPr}>Create PR</button>
        </div>
      </div>

      <div className="pr-print-host" aria-hidden="true"><PrPrintDocument ref={printRef} draft={draft} logoUrl={logoUrl} /></div>
    </section>
  )
}

export function RawMaterialPrBuilder(props: SpecificPrBuilderProps) {
  return <PrBuilder {...props} kind="raw-material" />
}

export function EquipmentPrBuilder(props: SpecificPrBuilderProps) {
  return <PrBuilder {...props} kind="equipment" />
}
