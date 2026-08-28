import type { PrHistoryLine } from '../../services/prpdRepository'

export type HistoryExportKind = 'raw_material' | 'factory_supply'

interface HistoryExportColumn {
  label: string
  value: (row: PrHistoryLine, index: number) => string | number
}

function displayDate(value: string): string {
  if (!value) return '-'
  const [year, month, day] = value.split('-')
  return year && month && day ? `${day}/${month}/${year}` : value
}

function exportColumns(kind: HistoryExportKind): HistoryExportColumn[] {
  const sharedStart: HistoryExportColumn[] = [
    { label: 'No.', value: (_row, index) => index + 1 },
    { label: 'Date', value: (row) => displayDate(row.requestDate) },
    { label: 'PR Number', value: (row) => row.prNumber },
    { label: 'Vendor', value: (row) => row.vendorName },
  ]
  const sharedEnd: HistoryExportColumn[] = [
    { label: 'Code RM', value: (row) => row.codeOrderRm || '-' },
    { label: 'Name Part', value: (row) => row.namePart },
    { label: 'Type', value: (row) => row.materialType || '-' },
    { label: 'Spec', value: (row) => row.spec || '-' },
    { label: "Q'ty", value: (row) => row.quantity },
    { label: 'Price', value: (row) => row.unitPrice },
    { label: 'Due Date', value: (row) => displayDate(row.dueDate) },
    { label: 'Comment', value: (row) => row.comment || '-' },
  ]

  if (kind === 'raw_material') {
    return [
      ...sharedStart,
      { label: 'Item FG', value: (row) => row.itemFg || '-' },
      ...sharedEnd.slice(0, 4),
      { label: 'จำนวนผลิต', value: (row) => row.fgQty ?? '-' },
      ...sharedEnd.slice(4),
    ]
  }
  return [...sharedStart, ...sharedEnd]
}

function escapeXml(value: string | number): string {
  return String(value)
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

function cell(value: string | number, styleId = 'Data'): string {
  const type = typeof value === 'number' && Number.isFinite(value) ? 'Number' : 'String'
  return `<Cell ss:StyleID="${styleId}"><Data ss:Type="${type}">${escapeXml(value)}</Data></Cell>`
}

export function buildHistoryWorkbook(rows: PrHistoryLine[], kind: HistoryExportKind): string {
  const columns = exportColumns(kind)
  const header = columns.map((column) => cell(column.label, 'Header')).join('')
  const body = rows.map((row, index) => `<Row>${columns.map((column) => cell(column.value(row, index))).join('')}</Row>`).join('')
  const worksheetName = kind === 'raw_material' ? 'Raw Material History' : 'Equipment History'

  return `<?xml version="1.0" encoding="UTF-8"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
  <Styles>
    <Style ss:ID="Default" ss:Name="Normal"><Font ss:FontName="Arial" ss:Size="10"/></Style>
    <Style ss:ID="Header"><Font ss:FontName="Arial" ss:Size="10" ss:Bold="1"/><Interior ss:Color="#DCEEFF" ss:Pattern="Solid"/></Style>
    <Style ss:ID="Data"><Font ss:FontName="Arial" ss:Size="10"/></Style>
  </Styles>
  <Worksheet ss:Name="${worksheetName}"><Table><Row>${header}</Row>${body}</Table></Worksheet>
</Workbook>`
}

export function downloadHistoryWorkbook(rows: PrHistoryLine[], kind: HistoryExportKind): void {
  const workbook = buildHistoryWorkbook(rows, kind)
  const blob = new Blob([workbook], { type: 'application/vnd.ms-excel;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `PR-History-${kind === 'raw_material' ? 'Raw-Material' : 'Equipment'}-${new Date().toISOString().slice(0, 10)}.xls`
  link.click()
  URL.revokeObjectURL(url)
}
