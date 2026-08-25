export interface PrNumberOptions {
  prefix?: string
  separator?: string
  sequenceLength?: number
  date?: Date
}

/** Formats a display number only. Allocation must be performed atomically by the backend. */
export function formatPrNumber(
  sequence: number,
  options: PrNumberOptions = {},
): string {
  if (!Number.isSafeInteger(sequence) || sequence < 1) {
    throw new RangeError('PR sequence must be a positive integer')
  }

  const {
    prefix = 'PR',
    separator = '-',
    sequenceLength = 4,
    date = new Date(),
  } = options

  if (!Number.isInteger(sequenceLength) || sequenceLength < 1) {
    throw new RangeError('sequenceLength must be a positive integer')
  }

  const year = String(date.getFullYear()).slice(-2)
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const running = String(sequence).padStart(sequenceLength, '0')
  return [prefix, `${year}${month}`, running].filter(Boolean).join(separator)
}

