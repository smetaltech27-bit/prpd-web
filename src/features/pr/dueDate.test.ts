import { describe, expect, it } from 'vitest'
import { bangkokToday, formatIsoDate, isPastDueDate } from './dueDate'

describe('PR due date validation', () => {
  it('uses the Bangkok calendar date independently from the browser timezone', () => {
    expect(bangkokToday(Date.parse('2026-08-26T18:30:00.000Z'))).toBe('2026-08-27')
  })

  it('rejects only dates before the current date', () => {
    expect(isPastDueDate('2026-08-26', '2026-08-27')).toBe(true)
    expect(isPastDueDate('2026-08-27', '2026-08-27')).toBe(false)
    expect(isPastDueDate('2026-08-28', '2026-08-27')).toBe(false)
    expect(isPastDueDate('', '2026-08-27')).toBe(false)
  })

  it('formats the warning date for Thai users', () => {
    expect(formatIsoDate('2026-08-27')).toBe('27/08/2026')
  })
})
