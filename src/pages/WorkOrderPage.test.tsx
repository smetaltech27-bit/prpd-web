import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { findActiveDocuments, searchProductionItems } from '../services/prpdRepository'
import { WorkOrderPage } from './WorkOrderPage'

vi.mock('../services/prpdRepository', () => ({
  findActiveDocuments: vi.fn(),
  searchProductionItems: vi.fn(),
}))

vi.mock('../services/documentStorage', () => ({
  fetchPrivateDocument: vi.fn(),
}))

describe('Work Order print completion', () => {
  afterEach(() => {
    cleanup()
    vi.useRealTimers()
    vi.clearAllMocks()
  })

  it('returns directly to the Work Order preview after the system print dialog closes', async () => {
    vi.mocked(searchProductionItems).mockResolvedValue([{
      id: 'material-1',
      itemFg: 'TM0095B',
      partName: 'COVER(VZ300/500L(3))',
      spec: 'VZ300',
      drawingNo: 'MT515814B=',
      orderCode: '',
      vendor: '',
      materialType: '',
      dimension: '',
      unitPrice: 0,
      usage: 1,
    }])
    vi.mocked(findActiveDocuments).mockResolvedValue([])

    render(<WorkOrderPage />)
    fireEvent.change(screen.getByLabelText('Item FG *'), { target: { value: 'TM0095B' } })
    fireEvent.change(screen.getByLabelText('Delivery Date *'), { target: { value: '2026-08-28' } })
    fireEvent.click(screen.getByRole('button', { name: 'สร้างใบ Work Order' }))

    expect(await screen.findByRole('dialog', { name: 'Work Order Preview' })).toBeInTheDocument()

    const print = vi.spyOn(window, 'print').mockImplementation(() => undefined)
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => { callback(0); return 1 })
    fireEvent.click(screen.getByRole('button', { name: 'พิมพ์เอกสาร' }))
    expect(print).toHaveBeenCalledTimes(1)
    act(() => window.dispatchEvent(new Event('afterprint')))

    expect(screen.getByRole('dialog', { name: 'Work Order Preview' })).toBeInTheDocument()
    expect(screen.queryByRole('dialog', { name: 'พิมพ์สำเร็จ' })).not.toBeInTheDocument()
    expect(screen.getByLabelText('Item FG *')).toHaveValue('TM0095B')
    expect(screen.getByLabelText('Delivery Date *')).toHaveValue('2026-08-28')
  })

  it('clears the Work Order form and restores the default quantity', () => {
    render(<WorkOrderPage />)

    fireEvent.change(screen.getByLabelText('Item FG *'), { target: { value: 'TM0095B' } })
    fireEvent.change(screen.getByLabelText('QTY *'), { target: { value: '3' } })
    fireEvent.change(screen.getByLabelText('Delivery Date *'), { target: { value: '2026-08-28' } })
    fireEvent.click(screen.getByRole('button', { name: 'ล้างข้อมูล' }))

    expect(screen.getByLabelText('Item FG *')).toHaveValue('')
    expect(screen.getByLabelText('QTY *')).toHaveValue(1)
    expect(screen.getByLabelText('Delivery Date *')).toHaveValue('')
  })
})
