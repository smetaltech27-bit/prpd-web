import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fetchPrivateDocument } from '../services/documentStorage'
import { searchActiveDocuments } from '../services/prpdRepository'
import { DocumentSearch } from './DocumentSearch'

vi.mock('../services/prpdRepository', () => ({ searchActiveDocuments: vi.fn() }))
vi.mock('../services/documentStorage', () => ({ fetchPrivateDocument: vi.fn() }))

describe('DocumentSearch', () => {
  beforeEach(() => {
    vi.stubGlobal('URL', {
      ...URL,
      createObjectURL: vi.fn(() => 'blob:document-preview'),
      revokeObjectURL: vi.fn(),
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.clearAllMocks()
  })

  it('opens the first result directly and clears the complete search state', async () => {
    vi.mocked(searchActiveDocuments).mockResolvedValue([{
      id: 'drawing-1',
      itemFg: 'C12036A',
      type: 'drawing',
      filename: 'C12036A.jpg',
      mimeType: 'image/jpeg',
      sizeBytes: 422_000,
      version: 1,
      updatedAt: '2026-08-27T00:00:00.000Z',
      partName: 'TERMINAL',
      drawingNo: 'MT501913A',
      storageProvider: 'r2',
      bucket: 'documents',
      path: 'drawing/C12036A.jpg',
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
})
