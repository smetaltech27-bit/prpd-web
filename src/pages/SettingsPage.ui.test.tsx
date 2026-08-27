import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SettingsPage } from './SettingsPage'

vi.mock('../lib/supabase', () => ({ isSupabaseConfigured: false }))
vi.mock('../services/settingsAccess', () => ({ lockSettings: vi.fn() }))
vi.mock('../services/documentStorage', () => ({ fetchPrivateDocument: vi.fn() }))
vi.mock('../services/prpdRepository', () => ({
  deactivateMasterItem: vi.fn(),
  findActiveDocuments: vi.fn(async () => []),
  listFactorySupplies: vi.fn(async () => []),
  listRawMaterials: vi.fn(async () => []),
  listVendorNames: vi.fn(async () => []),
  saveMasterItem: vi.fn(async () => 'saved-id'),
  uploadDocumentAsset: vi.fn(),
}))

describe('Settings document search', () => {
  afterEach(() => vi.clearAllMocks())

  it('selects the first search result automatically and clears the complete state', async () => {
    render(<SettingsPage />)
    fireEvent.click(screen.getByRole('button', { name: 'Document Files' }))

    const searchInput = screen.getByPlaceholderText('ค้นหา Item FG, Name Part หรือ DWG No.…')
    fireEvent.change(searchInput, { target: { value: 'TM4207A' } })
    fireEvent.click(screen.getByRole('button', { name: 'ค้นหา' }))

    expect(await screen.findByText('TM4207A — ARM A')).toBeInTheDocument()
    expect(screen.getByText('Drawing')).toBeInTheDocument()
    expect(screen.getByText('Inprocess Check Sheet')).toBeInTheDocument()
    expect(screen.getByText('QC Check Sheet')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'ล้างข้อมูล' }))

    expect(searchInput).toHaveValue('')
    expect(screen.queryByRole('button', { name: /TM4207A/ })).not.toBeInTheDocument()
    expect(screen.getByText('ไม่พบ Item FG')).toBeInTheDocument()
    expect(screen.getByText('กรอกคำค้นหา แล้วกดปุ่มค้นหาเพื่อแสดงรายการ')).toBeInTheDocument()
  })
})
