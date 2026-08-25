import { useId, useMemo, useState, type FormEvent, type SyntheticEvent } from 'react'
import { createPortal } from 'react-dom'
import { Eye, FileImage, Printer, Search, X } from 'lucide-react'
import { printImage } from '../../lib/print'
import { searchDocuments, suggestItemFg } from './documentSearch'
import { DOCUMENT_LABELS, DOCUMENT_TYPES, getDocumentOrientation } from './types'
import type { DocumentSearchResult, DocumentType, ImageDimensions, ProductionDocument } from './types'
import './documents.css'

export interface DocumentCenterProps {
  documents: readonly ProductionDocument[]
  documentType?: DocumentType
  initialItemFg?: string
}

export function DocumentCenter({ documents, documentType, initialItemFg = '' }: DocumentCenterProps) {
  const [query, setQuery] = useState(initialItemFg)
  const [searchedItemFg, setSearchedItemFg] = useState(initialItemFg.trim())
  const [preview, setPreview] = useState<ProductionDocument | null>(null)
  const [dimensions, setDimensions] = useState<Record<string, ImageDimensions>>({})
  const dataListId = useId()
  const types = documentType ? [documentType] : DOCUMENT_TYPES
  const results = useMemo(
    () => searchDocuments(documents, searchedItemFg, types),
    [documents, searchedItemFg, documentType],
  )
  const suggestions = useMemo(() => suggestItemFg(documents, query), [documents, query])

  function submit(event: FormEvent) {
    event.preventDefault()
    setSearchedItemFg(query.trim())
  }

  function rememberDimensions(document: ProductionDocument, event: SyntheticEvent<HTMLImageElement>) {
    const { naturalWidth: width, naturalHeight: height } = event.currentTarget
    setDimensions((current) => ({ ...current, [document.id]: { width, height } }))
  }

  function handlePrint(document: ProductionDocument) {
    printImage(document.imageUrl, {
      itemFg: document.itemFg,
      label: DOCUMENT_LABELS[document.type],
      orientation: getDocumentOrientation(document, dimensions[document.id]),
    })
  }

  return (
    <section className="document-center">
      <header>
        <span className="document-center__eyebrow">Production Documents</span>
        <h1>{documentType ? `Print ${DOCUMENT_LABELS[documentType]}` : 'Find & Print Documents'}</h1>
        <p>Search by Item FG to preview and print the current production document.</p>
      </header>

      <form className="document-search" onSubmit={submit}>
        <Search size={19} aria-hidden="true" />
        <input list={dataListId} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Enter Item FG" aria-label="Item FG" />
        <datalist id={dataListId}>{suggestions.map((itemFg) => <option value={itemFg} key={itemFg} />)}</datalist>
        <button type="submit" disabled={!query.trim()}>Search</button>
      </form>

      {searchedItemFg ? (
        <div className="document-results" aria-live="polite">
          {results.map((result) => (
            <DocumentResultCard
              key={result.type}
              result={result}
              onPreview={setPreview}
              onPrint={handlePrint}
              onImageLoad={rememberDimensions}
            />
          ))}
        </div>
      ) : <div className="document-welcome"><FileImage size={30} /><span>Enter an Item FG to begin.</span></div>}

      {preview && typeof document !== 'undefined' ? createPortal(
        <div className="document-modal" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && setPreview(null)}>
          <section className="document-modal__panel" role="dialog" aria-modal="true" aria-labelledby="document-preview-title">
            <header>
              <div><span>{DOCUMENT_LABELS[preview.type]}</span><h2 id="document-preview-title">{preview.itemFg}</h2></div>
              <button type="button" onClick={() => setPreview(null)} aria-label="Close preview"><X /></button>
            </header>
            <div className="document-modal__body">
              <img src={preview.imageUrl} alt={`${DOCUMENT_LABELS[preview.type]} for ${preview.itemFg}`} onLoad={(event) => rememberDimensions(preview, event)} />
            </div>
            <footer>
              <span>{getDocumentOrientation(preview, dimensions[preview.id])} · A4 print</span>
              <button type="button" onClick={() => handlePrint(preview)}><Printer size={17} /> Print</button>
            </footer>
          </section>
        </div>,
        document.body,
      ) : null}
    </section>
  )
}

interface DocumentResultCardProps {
  result: DocumentSearchResult
  onPreview: (document: ProductionDocument) => void
  onPrint: (document: ProductionDocument) => void
  onImageLoad: (document: ProductionDocument, event: SyntheticEvent<HTMLImageElement>) => void
}

function DocumentResultCard({ result, onPreview, onPrint, onImageLoad }: DocumentResultCardProps) {
  const document = result.document
  return (
    <article className={`document-card document-card--${result.status}`}>
      <div className="document-card__status"><span />{result.status === 'found' ? 'Found' : 'Missing'}</div>
      <h2>{result.label}</h2>
      {document ? (
        <>
          <div className="document-card__preview">
            <img src={document.imageUrl} alt="" onLoad={(event) => onImageLoad(document, event)} />
          </div>
          <dl><div><dt>Item FG</dt><dd>{document.itemFg}</dd></div><div><dt>Drawing No.</dt><dd>{document.drawingNo || '-'}</dd></div></dl>
          <div className="document-card__actions">
            <button type="button" className="document-action document-action--secondary" onClick={() => onPreview(document)}><Eye size={16} /> Preview</button>
            <button type="button" className="document-action" onClick={() => onPrint(document)}><Printer size={16} /> Print</button>
          </div>
        </>
      ) : <p>No {result.label} is registered for this Item FG.</p>}
    </article>
  )
}
