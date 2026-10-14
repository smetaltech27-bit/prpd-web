import type { MaterialItem } from '../../types/domain'

export type SettingsMasterKind = 'raw' | 'equipment'

interface SettingsExportColumn {
  label: string
  value: (row: MaterialItem) => string | number
  width: number
}

function display(value: string | undefined): string {
  return value?.trim() || '—'
}

function exportColumns(kind: SettingsMasterKind): SettingsExportColumn[] {
  return [
    { label: kind === 'raw' ? 'ITEM FG' : 'CODE RM', value: (row) => display(kind === 'raw' ? row.itemFg : row.orderCode), width: 100 },
    { label: 'PART', value: (row) => display(row.partName), width: 180 },
    { label: 'SPEC', value: (row) => display(row.spec), width: 120 },
    { label: 'DWG NO.', value: (row) => display(row.drawingNo), width: 120 },
    { label: 'VENDOR', value: (row) => display(row.vendor), width: 180 },
    { label: 'TYPE', value: (row) => display(row.materialType), width: 120 },
    { label: 'DIMENSION', value: (row) => display(row.dimension), width: 160 },
    { label: 'PRICE', value: (row) => row.unitPrice, width: 90 },
    { label: 'USAGE', value: (row) => row.usage, width: 70 },
    { label: 'COMMENT', value: (row) => display(row.comment), width: 200 },
    { label: 'สถานะ', value: (row) => row.isActive === false ? 'ปิดใช้งาน' : 'ใช้งานอยู่', width: 90 },
  ]
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

export function buildSettingsMasterWorkbook(rows: MaterialItem[], kind: SettingsMasterKind): string {
  const columns = exportColumns(kind)
  const columnDefinitions = columns.map((column) => `<Column ss:Width="${column.width}"/>`).join('')
  const header = columns.map((column) => cell(column.label, 'Header')).join('')
  const body = rows.map((row) => `<Row>${columns.map((column) => cell(column.value(row))).join('')}</Row>`).join('')
  const worksheetName = kind === 'raw' ? 'Raw Material' : 'Factory Supply Equipment'

  return `<?xml version="1.0" encoding="UTF-8"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
  <Styles>
    <Style ss:ID="Default" ss:Name="Normal"><Font ss:FontName="Arial" ss:Size="10"/><Alignment ss:Vertical="Center"/></Style>
    <Style ss:ID="Header"><Font ss:FontName="Arial" ss:Size="10" ss:Bold="1"/><Alignment ss:Horizontal="Center" ss:Vertical="Center"/><Interior ss:Color="#DCEEFF" ss:Pattern="Solid"/></Style>
    <Style ss:ID="Data"><Font ss:FontName="Arial" ss:Size="10"/><Alignment ss:Vertical="Center"/></Style>
  </Styles>
  <Worksheet ss:Name="${worksheetName}">
    <Table>${columnDefinitions}<Row>${header}</Row>${body}</Table>
    <WorksheetOptions xmlns="urn:schemas-microsoft-com:office:excel"><FreezePanes/><FrozenNoSplit/><SplitHorizontal>1</SplitHorizontal><TopRowBottomPane>1</TopRowBottomPane><ActivePane>2</ActivePane></WorksheetOptions>
  </Worksheet>
</Workbook>`
}

export function settingsMasterExportFileName(kind: SettingsMasterKind, now = Date.now()): string {
  const bangkokDate = new Date(now + 7 * 60 * 60 * 1000).toISOString().slice(0, 10)
  return `Settings-${kind === 'raw' ? 'Raw-Material' : 'Factory-Supply-Equipment'}-${bangkokDate}.xls`
}

export function downloadSettingsMasterWorkbook(rows: MaterialItem[], kind: SettingsMasterKind): void {
  const workbook = buildSettingsMasterWorkbook(rows, kind)
  const blob = new Blob([workbook], { type: 'application/vnd.ms-excel;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = settingsMasterExportFileName(kind)
  link.click()
  URL.revokeObjectURL(url)
}
