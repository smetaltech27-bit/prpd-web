export function bangkokToday(now = Date.now()): string {
  return new Date(now + 7 * 60 * 60 * 1000).toISOString().slice(0, 10)
}

export function isPastDueDate(value: string, currentDate = bangkokToday()): boolean {
  return Boolean(value) && value < currentDate
}

export function formatIsoDate(value: string): string {
  const [year, month, day] = value.split('-')
  return year && month && day ? `${day}/${month}/${year}` : value
}
