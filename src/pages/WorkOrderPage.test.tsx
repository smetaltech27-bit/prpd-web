import { act, fireEvent, render, screen } from '@testing-library/react'
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
    vi.useRealTimers()
    vi.clearAllMocks()
  })

  it('returns to a cleared form and hides the success notice automatically after printing', async () => {
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

    vi.useFakeTimers()
    act(() => window.dispatchEvent(new Event('afterprint')))

    expect(screen.queryByRole('dialog', { name: 'Work Order Preview' })).not.toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('พิมพ์สำเร็จ')
    expect(screen.getByLabelText('Item FG *')).toHaveValue('')
    expect(screen.getByLabelText('QTY *')).toHaveValue(1)
    expect(screen.getByLabelText('Delivery Date *')).toHaveValue('')

    act(() => vi.advanceTimersByTime(3000))
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })
})
