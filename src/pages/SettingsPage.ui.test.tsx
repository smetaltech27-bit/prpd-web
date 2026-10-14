import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createProductionItemWithDocuments, deleteDocumentItem, deleteMasterItem, listAllSettingsMasterItems, listFactorySupplies, setMasterItemActive } from '../services/prpdRepository'
import { downloadSettingsMasterWorkbook } from '../features/settings/masterExport'
import { SettingsPage } from './SettingsPage'

vi.mock('../lib/supabase', () => ({ isSupabaseConfigured: true }))
vi.mock('../services/settingsAccess', () => ({ lockSettings: vi.fn() }))
vi.mock('../services/documentStorage', () => ({ fetchPrivateDocument: vi.fn() }))
vi.mock('../features/settings/masterExport', () => ({ downloadSettingsMasterWorkbook: vi.fn() }))
vi.mock('../services/prpdRepository', () => ({
  deactivateMasterItem: vi.fn(),
  deleteDocumentItem: vi.fn(async () => ({ deletedItem: 1, deletedAssets: 3, deletedFiles: 3, failedFiles: 0 })),
  deleteMasterItem: vi.fn(),
  findActiveDocuments: vi.fn(async () => []),
  listFactorySupplies: vi.fn(async () => []),
  listAllSettingsMasterItems: vi.fn(async () => []),
  listRawMaterials: vi.fn(async (_itemFg?: string, includeInactive = false) => includeInactive ? [{
    id: 'raw-inactive', itemFg: 'TM-INACTIVE', partName: 'INACTIVE PART', drawingNo: 'DWG-I',
    spec: 'SPEC-I', orderCode: 'RM-I', vendor: 'VENDOR I', materialType: 'STEEL', dimension: '10x20',
    unitPrice: 100, usage: 2, comment: 'เก็บไว้ใช้ภายหลัง', isActive: false,
  }] : [{
    id: 'raw-delete', itemFg: 'TM-DELETE', partName: 'DELETE PART', drawingNo: 'DWG-D',
    spec: 'SPEC-D', orderCode: 'RM-D', vendor: 'VENDOR D', materialType: 'STEEL', dimension: '10x20',
    unitPrice: 100, usage: 2, comment: '', isActive: true,
  }]),
  listVendorNames: vi.fn(async () => []),
  searchProductionItems: vi.fn(async (query: string) => query === 'TM4207A' ? [{
    id: 'production-1', itemFg: 'TM4207A', partName: 'ARM A', drawingNo: 'MT524685A',
    spec: 'AL400', orderCode: '', vendor: '', materialType: '', dimension: '', unitPrice: 0, usage: 1, source: 'production' as const,
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
    vi.mocked(listAllSettingsMasterItems).mockReset()
    vi.mocked(deleteMasterItem).mockReset()
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

  it('searches equipment by Code RM and displays the code before Part', async () => {
    vi.mocked(listFactorySupplies).mockResolvedValueOnce([{
      id: 'equipment-code', itemFg: '', partName: 'MACHINE TAP', drawingNo: '',
      spec: '', orderCode: 'RM-0042', vendor: 'VENDOR A', materialType: 'EQUIPMENT',
      dimension: 'M4', unitPrice: 255, usage: 1,
    }])
    render(<SettingsPage />)
    fireEvent.click(screen.getByRole('button', { name: 'Factory Supply / Equipment' }))
    expect(screen.getAllByRole('columnheader').slice(1, 3).map((cell) => cell.textContent)).toEqual(['CODE RM', 'PART'])
    expect(screen.getByText('กรอกคำค้นหา แล้วกดปุ่มค้นหาเพื่อแสดงรายการ')).toHaveAttribute('colspan', '13')
    fireEvent.change(screen.getByPlaceholderText('ค้นหา Code RM, Item FG, Part, Spec หรือ Vendor…'), { target: { value: ' rm-004 ' } })
    fireEvent.click(screen.getByRole('button', { name: 'ค้นหา' }))
    const codeCell = await screen.findByRole('cell', { name: 'RM-0042' })
    expect(codeCell.nextElementSibling).toHaveTextContent('MACHINE TAP')
    expect(listFactorySupplies).toHaveBeenCalledWith(false)
  })


  const allItems = ['A', 'B'].map((suffix) => ({
    id: 'master-' + suffix, itemFg: 'FG-' + suffix, partName: 'PART-' + suffix,
    orderCode: 'RM-' + suffix, vendor: 'VENDOR', spec: '', drawingNo: '',
    materialType: '', dimension: '', unitPrice: 100, usage: 1, isActive: true,
  }))

  it.each(['Raw Material', 'Factory Supply / Equipment'])('loads all %s rows and clears search text', async (tabName) => {
    vi.mocked(listAllSettingsMasterItems).mockResolvedValueOnce(allItems)
    render(<SettingsPage />)
    fireEvent.click(screen.getByRole('button', { name: tabName }))
    const search = screen.getByPlaceholderText(/ค้นหา .*Part, Spec หรือ Vendor/)
    fireEvent.change(search, { target: { value: 'NO MATCH' } })
    fireEvent.click(screen.getByRole('button', { name: 'แสดงข้อมูลทั้งหมด' }))
    expect(await screen.findByText('PART-A')).toBeInTheDocument()
    expect(screen.getByText('PART-B')).toBeInTheDocument()
    expect(search).toHaveValue('')
    expect(listAllSettingsMasterItems).toHaveBeenCalledWith(tabName === 'Raw Material' ? 'raw' : 'equipment', false)
    fireEvent.click(screen.getByRole('button', { name: 'Export Excel' }))
    expect(downloadSettingsMasterWorkbook).toHaveBeenLastCalledWith(allItems, tabName === 'Raw Material' ? 'raw' : 'equipment')
    fireEvent.click(screen.getByRole('checkbox', { name: 'เลือก FG-A' }))
    expect(screen.getByRole('checkbox', { name: 'เลือกทั้งหมด' })).toBePartiallyChecked()
    expect(screen.getByRole('status')).toHaveTextContent('เลือก 1 รายการ')
    fireEvent.click(screen.getByRole('checkbox', { name: 'เลือกทั้งหมด' }))
    expect(screen.getByRole('status')).toHaveTextContent('เลือก 2 รายการ')
    fireEvent.click(screen.getByRole('checkbox', { name: 'เลือกทั้งหมด' }))
    expect(screen.getByRole('button', { name: 'ลบรายการที่เลือก' })).toBeDisabled()
  })

  it('confirms bulk deletion and retains only failed rows selected', async () => {
    vi.mocked(listAllSettingsMasterItems).mockResolvedValueOnce(allItems)
    vi.mocked(deleteMasterItem).mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error('Referenced by PR'))
    render(<SettingsPage />)
    fireEvent.click(screen.getByRole('button', { name: 'แสดงข้อมูลทั้งหมด' }))
    await screen.findByText('PART-A')
    fireEvent.click(screen.getByRole('checkbox', { name: 'เลือกทั้งหมด' }))
    fireEvent.click(screen.getByRole('button', { name: 'ลบรายการที่เลือก' }))
    expect(screen.getByRole('alertdialog', { name: 'ลบรายการที่เลือกหรือไม่?' })).toBeInTheDocument()
    expect(deleteMasterItem).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'ยกเลิก' }))
    expect(deleteMasterItem).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'ลบรายการที่เลือก' }))
    fireEvent.click(screen.getByRole('button', { name: 'ลบถาวร' }))
    expect(await screen.findByText(/ลบสำเร็จ 1 รายการ; ลบไม่สำเร็จ 1 รายการ/)).toBeInTheDocument()
    expect(deleteMasterItem).toHaveBeenNthCalledWith(1, 'raw', 'master-A')
    expect(deleteMasterItem).toHaveBeenNthCalledWith(2, 'raw', 'master-B')
    expect(screen.queryByText('PART-A')).not.toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: 'เลือก FG-B' })).toBeChecked()
  })

  it('deletes only the selected equipment row and clears selection after success', async () => {
    vi.mocked(listAllSettingsMasterItems).mockResolvedValueOnce(allItems)
    vi.mocked(deleteMasterItem).mockResolvedValue(undefined)
    render(<SettingsPage />)
    fireEvent.click(screen.getByRole('button', { name: 'Factory Supply / Equipment' }))
    fireEvent.click(screen.getByRole('button', { name: 'แสดงข้อมูลทั้งหมด' }))
    await screen.findByText('PART-A')
    fireEvent.click(screen.getByRole('checkbox', { name: 'เลือก FG-B' }))
    fireEvent.click(screen.getByRole('button', { name: 'ลบรายการที่เลือก' }))
    fireEvent.click(screen.getByRole('button', { name: 'ลบถาวร' }))
    await screen.findByText('ลบสำเร็จ 1 รายการ')
    expect(deleteMasterItem).toHaveBeenCalledExactlyOnceWith('equipment', 'master-B')
    expect(screen.getByText('PART-A')).toBeInTheDocument()
    expect(screen.queryByText('PART-B')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'ลบรายการที่เลือก' })).toBeDisabled()
  })

  it('uses the inactive option and clears selection when changing it', async () => {
    vi.mocked(listAllSettingsMasterItems).mockResolvedValueOnce(allItems)
    render(<SettingsPage />)
    fireEvent.click(screen.getByRole('checkbox', { name: 'แสดงรายการที่ปิดใช้งาน' }))
    fireEvent.click(screen.getByRole('button', { name: 'แสดงข้อมูลทั้งหมด' }))
    await screen.findByText('PART-A')
    expect(listAllSettingsMasterItems).toHaveBeenCalledWith('raw', true)
    fireEvent.click(screen.getByRole('checkbox', { name: 'เลือกทั้งหมด' }))
    fireEvent.click(screen.getByRole('checkbox', { name: 'แสดงรายการที่ปิดใช้งาน' }))
    expect(screen.queryByText('PART-A')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'ลบรายการที่เลือก' })).toBeDisabled()
  })

  it('ignores a previous tab request completing after a newer load', async () => {
    let finish!: (items: typeof allItems) => void
    vi.mocked(listAllSettingsMasterItems).mockImplementationOnce(() => new Promise((resolve) => { finish = resolve }))
      .mockResolvedValueOnce([allItems[1]])
    render(<SettingsPage />)
    fireEvent.click(screen.getByRole('button', { name: 'แสดงข้อมูลทั้งหมด' }))
    fireEvent.click(screen.getByRole('button', { name: 'Factory Supply / Equipment' }))
    fireEvent.click(screen.getByRole('button', { name: 'แสดงข้อมูลทั้งหมด' }))
    await screen.findByText('PART-B')
    await act(async () => { finish([allItems[0]]) })
    expect(screen.queryByText('PART-A')).not.toBeInTheDocument()
    expect(screen.getByText('PART-B')).toBeInTheDocument()
  })

  it('reports a failed full load without presenting partial rows', async () => {
    vi.mocked(listAllSettingsMasterItems).mockRejectedValueOnce(new Error('Network'))
    render(<SettingsPage />)
    fireEvent.click(screen.getByRole('button', { name: 'แสดงข้อมูลทั้งหมด' }))
    expect(await screen.findByText('ค้นหาข้อมูลไม่สำเร็จ กรุณาตรวจการเชื่อมต่อ Supabase')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'ลบรายการที่เลือก' })).toBeDisabled()
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

  it('requires confirmation before permanently deleting a master item', async () => {
    render(<SettingsPage />)
    fireEvent.change(screen.getByPlaceholderText('ค้นหา Item FG, Part, Spec หรือ Vendor…'), { target: { value: 'TM-DELETE' } })
    fireEvent.click(screen.getByRole('button', { name: 'ค้นหา' }))

    fireEvent.click(await screen.findByRole('button', { name: 'ลบ TM-DELETE' }))
    expect(screen.getByRole('alertdialog', { name: 'ลบ Raw Material หรือไม่?' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'ลบถาวร' }))

    await waitFor(() => expect(deleteMasterItem).toHaveBeenCalledWith('raw', 'raw-delete'))
    expect(screen.queryByText('TM-DELETE')).not.toBeInTheDocument()
  })

  it('requires the exact Item FG before deleting a production item and its documents', async () => {
    render(<SettingsPage />)
    fireEvent.click(screen.getByRole('button', { name: 'Document Files' }))
    const searchInput = screen.getByPlaceholderText('ค้นหา Item FG, Name Part หรือ DWG No.…')
    fireEvent.change(searchInput, { target: { value: 'TM4207A' } })
    fireEvent.click(screen.getByRole('button', { name: 'ค้นหา' }))
    await screen.findByText('TM4207A — ARM A')

    fireEvent.click(screen.getByRole('button', { name: 'ลบ Item ที่เลือก' }))
    const deleteButton = screen.getByRole('button', { name: 'ลบถาวร' })
    expect(deleteButton).toBeDisabled()
    fireEvent.change(screen.getByLabelText('พิมพ์ TM4207A เพื่อยืนยัน'), { target: { value: 'TM4207A' } })
    expect(deleteButton).toBeEnabled()
    fireEvent.click(deleteButton)

    await waitFor(() => expect(deleteDocumentItem).toHaveBeenCalledWith('production', 'production-1', 'TM4207A'))
    expect(await screen.findByText('ไม่พบ Item FG')).toBeInTheDocument()
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
