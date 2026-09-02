import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import type { MaterialItem } from '../types/domain'
import { PrBuilder } from './PrBuilder'

const rawMaterial: MaterialItem = {
  id: 'raw-1',
  itemFg: 'TM4207A',
  partName: 'PRESS PLATE',
  spec: 'AG600L',
  drawingNo: 'DWG-001',
  orderCode: '421143',
  vendor: 'พีเจเอส 149',
  materialType: 'Brass',
  dimension: '12mm. X 105mm. X 240mm.',
  unitPrice: 1340,
  usage: 1,
}

describe('Raw Material PR search clearing', () => {
  afterEach(cleanup)

  it('clears only the search inputs and keeps the selected raw-material lines', () => {
    render(<PrBuilder category="Raw Material" items={[rawMaterial]} />)

    const actionLabels = Array.from(document.querySelectorAll('.legacy-pr-input-actions button'))
      .map((button) => button.textContent?.trim())
    expect(actionLabels).toEqual(['ล้างข้อมูล', 'ดึงข้อมูล'])

    fireEvent.change(screen.getByLabelText('Item FG *'), { target: { value: 'TM4207A' } })
    fireEvent.change(screen.getByLabelText('จำนวนที่ต้องการผลิต (ชิ้น) *'), { target: { value: '2' } })
    fireEvent.change(screen.getByLabelText('Due Date *'), { target: { value: '2027-01-02' } })
    fireEvent.click(screen.getByRole('button', { name: 'ดึงข้อมูล' }))

    expect(screen.getByText('PRESS PLATE')).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: 'Dimension' })).toBeInTheDocument()
    expect(screen.queryByRole('columnheader', { name: 'Spec' })).not.toBeInTheDocument()
    expect(screen.queryByRole('columnheader', { name: 'Due Date' })).not.toBeInTheDocument()
    expect(screen.getByText('12mm. X 105mm. X 240mm.')).toBeInTheDocument()
    expect(document.querySelectorAll('.raw-material-table input[type="date"]')).toHaveLength(0)

    fireEvent.change(screen.getByLabelText('Item FG *'), { target: { value: 'TM4207A' } })
    fireEvent.change(screen.getByLabelText('จำนวนที่ต้องการผลิต (ชิ้น) *'), { target: { value: '3' } })
    fireEvent.click(screen.getByRole('button', { name: 'ล้างข้อมูล' }))

    expect(screen.getByLabelText('Item FG *')).toHaveValue('')
    expect(screen.getByLabelText('จำนวนที่ต้องการผลิต (ชิ้น) *')).toHaveValue(1)
    expect(screen.getByLabelText('Due Date *')).toHaveValue('')
    expect(screen.getByText('PRESS PLATE')).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: 'ล้างข้อมูล' })).toHaveLength(1)
  })

  it('labels the print column as Dimension while preserving the combined specification details', () => {
    render(<PrBuilder category="Raw Material" items={[rawMaterial]} />)

    fireEvent.change(screen.getByLabelText('Item FG *'), { target: { value: 'TM4207A' } })
    fireEvent.change(screen.getByLabelText('Due Date *'), { target: { value: '2027-01-02' } })
    fireEvent.click(screen.getByRole('button', { name: 'ดึงข้อมูล' }))
    fireEvent.click(screen.getByRole('button', { name: 'Preview' }))

    const preview = screen.getByRole('dialog', { name: 'PR Preview' })
    expect(within(preview).getByRole('columnheader', { name: 'Dimension' })).toBeInTheDocument()
    expect(within(preview).queryByRole('columnheader', { name: 'Spec' })).not.toBeInTheDocument()
    expect(within(preview).getByText('AG600L / 12mm. X 105mm. X 240mm.')).toBeInTheDocument()
  })
})
