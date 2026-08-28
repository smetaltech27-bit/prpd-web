import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fetchPrivateDocument } from '../services/documentStorage'
import { searchActiveDocuments } from '../services/prpdRepository'
import { printImage } from '../lib/print'
import { DocumentSearch } from './DocumentSearch'

vi.mock('../services/prpdRepository', () => ({ searchActiveDocuments: vi.fn() }))
vi.mock('../services/documentStorage', () => ({ fetchPrivateDocument: vi.fn() }))
vi.mock('../lib/print', () => ({ printImage: vi.fn() }))

const baseDocument = {
  id: 'document-1',
  itemFg: 'C12036A',
  filename: 'C12036A.jpg',
  mimeType: 'image/jpeg',
  sizeBytes: 422_000,
  version: 1,
  updatedAt: '2026-08-27T00:00:00.000Z',
  partName: 'TERMINAL',
  drawingNo: 'MT501913A',
  storageProvider: 'r2' as const,
  bucket: 'documents',
  path: 'drawing/C12036A.jpg',
}

describe('DocumentSearch', () => {
  beforeEach(() => {
    vi.stubGlobal('URL', {
      ...URL,
      createObjectURL: vi.fn(() => 'blob:document-preview'),
      revokeObjectURL: vi.fn(),
    })
  })

  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
    vi.clearAllMocks()
  })

  it('opens the first result directly and clears the complete search state', async () => {
    vi.mocked(searchActiveDocuments).mockResolvedValue([{
      ...baseDocument,
      id: 'drawing-1',
      type: 'drawing',
    }])
    vi.mocked(fetchPrivateDocument).mockResolvedValue(new Blob(['drawing'], { type: 'image/jpeg' }))

    render(<DocumentSearch kind="drawing" />)
    fireEvent.change(screen.getByPlaceholderText('เช่น TM4207A หรือ MT524685A'), { target: { value: 'C12036A' } })
    fireEvent.click(screen.getByRole('button', { name: 'ค้นหา' }))

    expect(await screen.findByAltText('Drawing C12036A')).toHaveAttribute('src', 'blob:document-preview')
    expect(screen.queryByText('SEARCH RESULT')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'ล้างข้อมูล' }))
    expect(screen.getByPlaceholderText('เช่น TM4207A หรือ MT524685A')).toHaveValue('')
    expect(screen.queryByAltText('Drawing C12036A')).not.toBeInTheDocument()
    expect(screen.getByText('พร้อมแสดงตัวอย่างเอกสาร')).toBeInTheDocument()
  })

  it.each([
    ['drawing', 'Drawing'],
    ['inprocess', 'Inprocess Check Sheet'],
    ['qc', 'QC Check Sheet'],
  ] as const)('returns directly to the %s preview after the system print dialog closes', async (kind, label) => {
    vi.mocked(searchActiveDocuments).mockResolvedValue([{ ...baseDocument, id: `${kind}-1`, type: kind }])
    vi.mocked(fetchPrivateDocument).mockResolvedValue(new Blob([kind], { type: 'image/jpeg' }))

    render(<DocumentSearch kind={kind} />)
    const searchInput = screen.getByPlaceholderText('เช่น TM4207A หรือ MT524685A')
    fireEvent.change(searchInput, { target: { value: 'C12036A' } })
    fireEvent.click(screen.getByRole('button', { name: 'ค้นหา' }))
    expect(await screen.findByAltText(`${label} C12036A`)).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: `พิมพ์ ${label}` }))
    expect(printImage).toHaveBeenCalledTimes(1)
    expect(printImage).toHaveBeenLastCalledWith('blob:document-preview', expect.objectContaining({
      marginMm: 0,
      bottomMarginMm: kind === 'inprocess' ? 6 : 0,
      fit: kind === 'inprocess' ? 'fill' : 'contain',
    }))
    fireEvent(window, new Event('afterprint'))

    expect(screen.queryByRole('dialog', { name: 'พิมพ์สำเร็จ' })).not.toBeInTheDocument()
    expect(screen.queryByRole('dialog', { name: 'พิมพ์เอกสารแล้วหรือไม่?' })).not.toBeInTheDocument()
    expect(searchInput).toHaveValue('C12036A')
    expect(screen.getByAltText(`${label} C12036A`)).toBeInTheDocument()
  })
})
