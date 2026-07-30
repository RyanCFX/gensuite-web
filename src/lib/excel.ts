import ExcelJS from 'exceljs'

// ─── Design tokens matching the app's FLUX DESIGN SYSTEM ───────────────────
const BRAND = 'FF4538'
const BRAND_LIGHT = 'FFF0EF'
const BG_HEADER = 'FFF0EF'
const BG_STRIPE = 'FFF9F8'
const BG_WHITE = 'FFFFFF'
const TEXT_PRIMARY = '1A1A1A'
const TEXT_SECONDARY = '6B7280'
const TEXT_WHITE = 'FFFFFF'
const BORDER = 'E5E7EB'
const BG_SUCCESS = 'ECFDF5'
const TEXT_SUCCESS = '065F46'

// ─── Typography ─────────────────────────────────────────────────────────────
const FONT_DEFAULT = { name: 'Inter', size: 10, color: { argb: TEXT_PRIMARY } }
const FONT_MONO = { name: 'JetBrains Mono', size: 9, color: { argb: TEXT_PRIMARY } }
const FONT_HEADER = { name: 'Inter', size: 10, bold: true, color: { argb: BRAND } }
const FONT_TITLE = { name: 'Inter', size: 14, bold: true, color: { argb: TEXT_PRIMARY } }
const FONT_SUBTITLE = { name: 'Inter', size: 10, color: { argb: TEXT_SECONDARY } }

function border(style: Partial<ExcelJS.Border> = {}): Partial<ExcelJS.Borders> {
  return {
    top: { style: 'thin', color: { argb: BORDER }, ...style },
    bottom: { style: 'thin', color: { argb: BORDER }, ...style },
    left: { style: 'thin', color: { argb: BORDER }, ...style },
    right: { style: 'thin', color: { argb: BORDER }, ...style },
  }
}

export interface Reporte606Row {
  rnc: string
  proveedor: string
  ncf: string
  fecha: string
  montoExento: number
  montoGravado: number
  itbis: number
  montoTotal: number
}

export interface Reporte606Config {
  titulo?: string
  periodo: string
  rncEmpresa: string
  nombreEmpresa: string
  rows: Reporte606Row[]
}

export async function generateReporte606WB(config: Reporte606Config): Promise<ExcelJS.Workbook> {
  const wb = new ExcelJS.Workbook()
  wb.creator = 'GenSuite'
  wb.created = new Date()

  const ws = wb.addWorksheet(`606 ${config.periodo}`, {
    pageSetup: { orientation: 'landscape', fitToPage: true, margins: {
      left: 0.5, right: 0.5, top: 0.5, bottom: 0.5, header: 0.3, footer: 0.3,
    }},
  })

  // ── Columnas ────────────────────────────────────────────────────────────
  const cols = [
    { header: '#', key: 'idx', width: 5 },
    { header: 'RNC / Cédula', key: 'rnc', width: 16 },
    { header: 'Proveedor / Razón Social', key: 'proveedor', width: 36 },
    { header: 'NCF', key: 'ncf', width: 14 },
    { header: 'Fecha', key: 'fecha', width: 13 },
    { header: 'Monto Exento', key: 'montoExento', width: 15 },
    { header: 'Monto Gravado', key: 'montoGravado', width: 15 },
    { header: 'ITBIS', key: 'itbis', width: 13 },
    { header: 'Monto Total', key: 'montoTotal', width: 15 },
  ]

  // ── Encabezado del reporte (3 filas) ────────────────────────────────────
  ws.mergeCells(1, 1, 1, 9)
  const titleCell = ws.getCell('A1')
  titleCell.value = config.titulo ?? `Reporte DGII 606 — Compras`
  titleCell.font = FONT_TITLE
  titleCell.alignment = { vertical: 'middle', horizontal: 'left' }
  ws.getRow(1).height = 28

  ws.mergeCells(2, 1, 2, 9)
  const subCell = ws.getCell('A2')
  subCell.value = `Período: ${config.periodo}  ·  RNC: ${config.rncEmpresa}  ·  ${config.nombreEmpresa}`
  subCell.font = FONT_SUBTITLE
  subCell.alignment = { vertical: 'middle', horizontal: 'left' }
  ws.getRow(2).height = 20

  // Fila de encabezados de columna (fila 3)
  const headerRow = ws.getRow(3)
  headerRow.height = 28
  cols.forEach((col, i) => {
    ws.getColumn(i + 1).width = col.width
    const cell = headerRow.getCell(i + 1)
    cell.value = col.header
    cell.font = FONT_HEADER
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BG_HEADER } }
    cell.border = border()
    cell.alignment = { vertical: 'middle', horizontal: i === 0 ? 'center' : 'left' }
  })

  // ── Filas de datos ──────────────────────────────────────────────────────
  let totalExento = 0
  let totalGravado = 0
  let totalItbis = 0
  let totalGeneral = 0

  config.rows.forEach((row, i) => {
    const r = i + 4
    const isEven = i % 2 === 1
    ws.getRow(r).height = 22

    const values = [
      i + 1,
      row.rnc,
      row.proveedor,
      row.ncf,
      row.fecha,
      row.montoExento,
      row.montoGravado,
      row.itbis,
      row.montoTotal,
    ]

    totalExento += row.montoExento
    totalGravado += row.montoGravado
    totalItbis += row.itbis
    totalGeneral += row.montoTotal

    values.forEach((val, j) => {
      const cell = ws.getRow(r).getCell(j + 1)
      cell.value = val
      cell.font = j === 1 || j === 2 || j === 3 ? FONT_MONO : FONT_DEFAULT
      cell.border = border()
      cell.fill = isEven ? { type: 'pattern', pattern: 'solid', fgColor: { argb: BG_STRIPE } } : undefined
      cell.alignment = {
        vertical: 'middle',
        horizontal: j >= 5 ? 'right' : j === 0 ? 'center' : 'left',
      }
      if (j >= 5) {
        cell.numFmt = '#,##0.00'
      }
    })
  })

  // ── Fila de totales ─────────────────────────────────────────────────────
  const totalRowNum = config.rows.length + 4
  const totalRow = ws.getRow(totalRowNum)
  totalRow.height = 26

  const totalCells = ['', 'TOTALES', '', '', '', totalExento, totalGravado, totalItbis, totalGeneral]
  totalCells.forEach((val, j) => {
    const cell = totalRow.getCell(j + 1)
    cell.value = val
    cell.font = { ...FONT_DEFAULT, bold: true, color: { argb: BRAND } }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BG_HEADER } }
    cell.border = border({ style: 'medium' })
    cell.alignment = {
      vertical: 'middle',
      horizontal: j >= 5 ? 'right' : j === 0 ? 'center' : 'left',
    }
    if (j >= 5) {
      cell.numFmt = '#,##0.00'
    }
  })

  // ── Footer con resumen ──────────────────────────────────────────────────
  const footerRow = totalRowNum + 1
  ws.mergeCells(footerRow, 1, footerRow, 9)
  const footerCell = ws.getCell(`A${footerRow}`)
  footerCell.value = `Total de registros: ${config.rows.length}  ·  Generado el ${new Date().toLocaleDateString('es-DO')}`
  footerCell.font = { ...FONT_SUBTITLE, italic: true }
  footerCell.alignment = { vertical: 'middle', horizontal: 'right' }
  ws.getRow(footerRow).height = 22

  // ── Print config ────────────────────────────────────────────────────────
  ws.pageSetup.printTitlesRow = '1:3'

  return wb
}

export async function downloadWorkbook(wb: ExcelJS.Workbook, filename: string) {
  const buffer = await wb.xlsx.writeBuffer()
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename.endsWith('.xlsx') ? filename : `${filename}.xlsx`
  a.click()
  URL.revokeObjectURL(url)
}
