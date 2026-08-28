import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { deletePurchaseRequestHistory, searchPrHistory } from '../services/prpdRepository'
import { lockSettings, unlockSettings } from '../services/settingsAccess'
import { HistoryPage } from './HistoryPage'

vi.mock('../services/prpdRepository', () => ({
  searchPrHistory: vi.fn(),
  deletePurchaseRequestHistory: vi.fn(),
}))

vi.mock('../services/settingsAccess', () => ({
  unlockSettings: vi.fn(),
  lockSettings: vi.fn(),
}))

const historyRows = [
  {
    lineId: 'line-1', prId: 'pr-1', prNumber: 'PR-2608-0001', requestKind: 'raw_material' as const,
    requestDate: '2026-08-28', vendorName: 'Vendor A', itemFg: 'FG-1', codeOrderRm: 'RM-1',
    namePart: 'Part 1', materialType: 'SS400', spec: 'SPEC-1', fgQty: 1, quantity: 1,
    unitPrice: 100, dueDate: '2026-08-29', comment: '',
  },
  {
    lineId: 'line-2', prId: 'pr-1', prNumber: 'PR-2608-0001', requestKind: 'raw_material' as const,
    requestDate: '2026-08-28', vendorName: 'Vendor A', itemFg: 'FG-2', codeOrderRm: 'RM-2',
    namePart: 'Part 2', materialType: 'SS400', spec: 'SPEC-2', fgQty: 1, quantity: 2,
    unitPrice: 200, dueDate: '2026-08-29', comment: '',
  },
  {
    lineId: 'line-3', prId: 'pr-2', prNumber: 'PR-2608-0002', requestKind: 'raw_material' as const,
    requestDate: '2026-08-28', vendorName: 'Vendor B', itemFg: 'FG-3', codeOrderRm: 'RM-3',
    namePart: 'Part 3', materialType: 'SS400', spec: 'SPEC-3', fgQty: 1, quantity: 1,
    unitPrice: 300, dueDate: '2026-08-29', comment: '',
  },
]

describe('PR history deletion', () => {
  afterEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  it('selects every line of the same PR and deletes the complete PR after admin confirmation', async () => {
    vi.mocked(searchPrHistory).mockResolvedValue(historyRows)
    vi.mocked(unlockSettings).mockResolvedValue({ ok: true })
    vi.mocked(deletePurchaseRequestHistory).mockResolvedValue({ deletedRequests: 1, deletedLines: 2 })
    vi.mocked(lockSettings).mockResolvedValue()

    render(<HistoryPage />)

    const firstPrCheckboxes = await screen.findAllByRole('checkbox', { name: /เลือก PR-2608-0001 รายการ/ })
    fireEvent.click(firstPrCheckboxes[0])
    expect(firstPrCheckboxes[0]).toBeChecked()
    expect(firstPrCheckboxes[1]).toBeChecked()
    expect(screen.getByText('เลือกแล้ว 1 เลข PR')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'ลบประวัติที่เลือก' }))
    expect(screen.getByRole('heading', { name: 'ยืนยันการลบประวัติ PR' })).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'settings-password' } })
    fireEvent.click(screen.getByRole('button', { name: 'ยืนยันและลบ' }))

    await waitFor(() => expect(unlockSettings).toHaveBeenCalledWith('settings-password'))
    await waitFor(() => expect(deletePurchaseRequestHistory).toHaveBeenCalledWith(['pr-1']))
    await waitFor(() => expect(lockSettings).toHaveBeenCalled())
    expect(await screen.findByText(/ลบประวัติ 1 เลข PR รวม 2 รายการแล้ว/)).toBeInTheDocument()
  })

  it('selects all visible PR numbers instead of counting duplicate lines', async () => {
    vi.mocked(searchPrHistory).mockResolvedValue(historyRows)
    render(<HistoryPage />)

    await screen.findByText('PR-2608-0002')
    fireEvent.click(screen.getByRole('checkbox', { name: 'เลือกทั้งหมดในตาราง' }))
    expect(screen.getByText('เลือกแล้ว 2 เลข PR')).toBeInTheDocument()
  })
})
