import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createProductionItemWithDocuments, setMasterItemActive } from '../services/prpdRepository'
import { SettingsPage } from './SettingsPage'

vi.mock('../lib/supabase', () => ({ isSupabaseConfigured: true }))
vi.mock('../services/settingsAccess', () => ({ lockSettings: vi.fn() }))
vi.mock('../services/documentStorage', () => ({ fetchPrivateDocument: vi.fn() }))
vi.mock('../services/prpdRepository', () => ({
  deactivateMasterItem: vi.fn(),
  findActiveDocuments: vi.fn(async () => []),
  listFactorySupplies: vi.fn(async () => []),
  listRawMaterials: vi.fn(async (_itemFg?: string, includeInactive = false) => includeInactive ? [{
    id: 'raw-inactive', itemFg: 'TM-INACTIVE', partName: 'INACTIVE PART', drawingNo: 'DWG-I',
    spec: 'SPEC-I', orderCode: 'RM-I', vendor: 'VENDOR I', materialType: 'STEEL', dimension: '10x20',
    unitPrice: 100, usage: 2, comment: 'เก็บไว้ใช้ภายหลัง', isActive: false,
  }] : []),
  listVendorNames: vi.fn(async () => []),
  searchProductionItems: vi.fn(async (query: string) => query === 'TM4207A' ? [{
    id: 'production-1', itemFg: 'TM4207A', partName: 'ARM A', drawingNo: 'MT524685A',
    spec: 'AL400', orderCode: '', vendor: '', materialType: '', dimension: '', unitPrice: 0, usage: 1,
  }] : []),
  createProductionItemWithDocuments: vi.fn(),
  saveMasterItem: vi.fn(async () => 'saved-id'),
  setMasterItemActive: vi.fn(),
  uploadDocumentAsset: vi.fn(),
}))

describe('Settings document search', () => {
  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

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

  it('shows separated master-data columns and removes Item FG from equipment', () => {
    const { container } = render(<SettingsPage />)

    expect(container.querySelector('.settings-layout')).not.toHaveClass('has-editor')
    expect(screen.getByRole('columnheader', { name: 'ITEM FG' })).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: 'PART' })).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: 'SPEC' })).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: 'DWG NO.' })).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: 'DIMENSION' })).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: 'USAGE' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Factory Supply / Equipment' }))
    expect(screen.queryByRole('columnheader', { name: 'ITEM FG' })).not.toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: 'PART' })).toBeInTheDocument()
    expect(container.querySelector('.settings-search-form')).toHaveClass('has-vendor')

    fireEvent.click(screen.getByRole('button', { name: 'Add Equipment' }))
    expect(container.querySelector('.settings-layout')).toHaveClass('has-editor')
  })

  it('places the horizontal Item Master bar before Private R2 Documents', () => {
    const { container } = render(<SettingsPage />)
    fireEvent.click(screen.getByRole('button', { name: 'Document Files' }))

    const masterBar = container.querySelector('.document-master-toolbar')
    const fileManager = container.querySelector('.file-manager')
    expect(masterBar).toBeInTheDocument()
    expect(fileManager).toBeInTheDocument()
    if (!masterBar || !fileManager) throw new Error('Settings document layout is incomplete')
    expect(masterBar.compareDocumentPosition(fileManager) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(masterBar).toContainElement(screen.getByRole('button', { name: 'เพิ่ม Item ใหม่' }))
  })

  it('shows comments and reactivates an inactive master item', async () => {
    render(<SettingsPage />)

    fireEvent.click(screen.getByRole('checkbox', { name: 'แสดงรายการที่ปิดใช้งาน' }))
    fireEvent.change(screen.getByPlaceholderText('ค้นหา Item FG, Part, Spec หรือ Vendor…'), { target: { value: 'TM-INACTIVE' } })
    fireEvent.click(screen.getByRole('button', { name: 'ค้นหา' }))

    expect(await screen.findByText('เก็บไว้ใช้ภายหลัง')).toBeInTheDocument()
    expect(screen.getByText('ปิดใช้งาน')).toBeInTheDocument()
    fireEvent.click(screen.getByTitle('เปิดใช้งาน'))

    await waitFor(() => expect(setMasterItemActive).toHaveBeenCalledWith('raw', 'raw-inactive', true))
    expect(screen.getByText('ใช้งานอยู่')).toBeInTheDocument()
  })

  it('creates a new production item only after all three required documents are selected', async () => {
    vi.mocked(createProductionItemWithDocuments).mockResolvedValue({
      id: 'production-new', itemFg: 'TMNEW01', partName: 'NEW PART', drawingNo: 'DWG-001',
      spec: 'MODEL-A', orderCode: '', vendor: '', materialType: '', dimension: '', unitPrice: 0, usage: 1,
    })

    render(<SettingsPage />)
    fireEvent.click(screen.getByRole('button', { name: 'Document Files' }))
    fireEvent.click(screen.getByRole('button', { name: 'เพิ่ม Item ใหม่' }))

    fireEvent.change(screen.getByLabelText('Item FG *'), { target: { value: 'tmnew01' } })
    fireEvent.change(screen.getByLabelText('Name Part *'), { target: { value: 'NEW PART' } })
    fireEvent.change(screen.getByLabelText('Drawing No. *'), { target: { value: 'DWG-001' } })
    fireEvent.change(screen.getByLabelText('Model / SPEC *'), { target: { value: 'MODEL-A' } })
    fireEvent.change(screen.getByLabelText('ไฟล์ Drawing'), { target: { files: [new File(['drawing'], 'drawing.png', { type: 'image/png' })] } })
    fireEvent.change(screen.getByLabelText('ไฟล์ Inprocess Check Sheet'), { target: { files: [new File(['inprocess'], 'inprocess.pdf', { type: 'application/pdf' })] } })
    fireEvent.change(screen.getByLabelText('ไฟล์ QC Check Sheet'), { target: { files: [new File(['qc'], 'qc.jpg', { type: 'image/jpeg' })] } })
    fireEvent.click(screen.getByRole('button', { name: 'สร้าง Item พร้อมเอกสาร' }))

    await waitFor(() => expect(createProductionItemWithDocuments).toHaveBeenCalledTimes(1))
    expect(createProductionItemWithDocuments).toHaveBeenCalledWith(expect.objectContaining({
      itemFg: 'TMNEW01', partName: 'NEW PART', drawingNo: 'DWG-001', model: 'MODEL-A',
    }), expect.any(Function))
    expect(await screen.findByText('TMNEW01 — NEW PART')).toBeInTheDocument()
    expect(screen.queryByRole('dialog', { name: 'เพิ่ม Item ใหม่พร้อมเอกสาร' })).not.toBeInTheDocument()
  })
})
