import ExcelJS from 'exceljs'
import { writeFile } from 'fs'

// ─── Design tokens (app's FLUX DESIGN SYSTEM) ───────────────────────────────
const BRAND = 'FF4538'
const BG_HEADER = 'FFF0EF'
const BG_STRIPE = 'FFF9F8'
const TEXT_PRIMARY = '1A1A1A'
const TEXT_SECONDARY = '6B7280'
const BORDER = 'E5E7EB'

const FONT_DEFAULT = { name: 'Calibri', size: 10, color: { argb: TEXT_PRIMARY } }
const FONT_MONO = { name: 'Consolas', size: 9, color: { argb: TEXT_PRIMARY } }
const FONT_HEADER = { name: 'Calibri', size: 10, bold: true, color: { argb: BRAND } }
const FONT_TITLE = { name: 'Calibri', size: 14, bold: true, color: { argb: TEXT_PRIMARY } }
const FONT_SUBTITLE = { name: 'Calibri', size: 10, color: { argb: TEXT_SECONDARY } }

function border(style = {}) {
  return {
    top: { style: 'thin', color: { argb: BORDER }, ...style },
    bottom: { style: 'thin', color: { argb: BORDER }, ...style },
    left: { style: 'thin', color: { argb: BORDER }, ...style },
    right: { style: 'thin', color: { argb: BORDER }, ...style },
  }
}

// ─── Sample data (DGII 606 — Compras) ───────────────────────────────────────
const rows = [
  { rnc: '101234567', proveedor: 'Distribuidora Nacional SRL',       ncf: 'B0100000101', fecha: '2026-01-08', exento: 0,     gravado: 45000,  itbis: 5850,   total: 50850 },
  { rnc: '102345678', proveedor: 'Comercial del Sur SAS',             ncf: 'B0100000202', fecha: '2026-01-10', exento: 12000, gravado: 32000,  itbis: 4160,   total: 48160 },
  { rnc: '103456789', proveedor: 'Importadora del Norte SRL',         ncf: 'B0100000303', fecha: '2026-01-12', exento: 0,     gravado: 89000,  itbis: 11570,  total: 100570 },
  { rnc: '104567890', proveedor: 'Proveedora Oriental SAS',           ncf: 'B0100000404', fecha: '2026-01-15', exento: 5500,  gravado: 0,      itbis: 0,      total: 5500 },
  { rnc: '105678901', proveedor: 'Suministros Occidente SRL',         ncf: 'B0100000505', fecha: '2026-01-18', exento: 0,     gravado: 67000,  itbis: 8710,   total: 75710 },
  { rnc: '106789012', proveedor: 'Tecnología Empresarial SAS',        ncf: 'B0100000606', fecha: '2026-01-20', exento: 8500,  gravado: 24000,  itbis: 3120,   total: 35620 },
  { rnc: '107890123', proveedor: 'Industrias Metálicas SRL',         ncf: 'B0100000707', fecha: '2026-01-22', exento: 0,     gravado: 125000, itbis: 16250,  total: 141250 },
  { rnc: '108901234', proveedor: 'Agroinsumos del Valle SAS',         ncf: 'B0100000808', fecha: '2026-01-25', exento: 18000, gravado: 15000,  itbis: 1950,   total: 34950 },
  { rnc: '109012345', proveedor: 'Servicios Corporativos RD SRL',     ncf: 'B0100000909', fecha: '2026-01-28', exento: 0,     gravado: 34000,  itbis: 4420,   total: 38420 },
  { rnc: '101112131', proveedor: 'Logística y Transporte SAS',        ncf: 'B0100001010', fecha: '2026-01-30', exento: 9200,  gravado: 0,      itbis: 0,      total: 9200 },
  { rnc: '101234568', proveedor: 'Materiales de Construcción SRL',    ncf: 'B0100001111', fecha: '2026-02-03', exento: 0,     gravado: 78000,  itbis: 10140,  total: 88140 },
  { rnc: '102345679', proveedor: 'Equipos Industriales SAS',          ncf: 'B0100001212', fecha: '2026-02-05', exento: 25000, gravado: 0,      itbis: 0,      total: 25000 },
  { rnc: '103456780', proveedor: 'Embotelladora Nacional SRL',        ncf: 'B0100001313', fecha: '2026-02-07', exento: 0,     gravado: 56000,  itbis: 7280,   total: 63280 },
  { rnc: '104567891', proveedor: 'Farmacéutica del Caribe SAS',       ncf: 'B0100001414', fecha: '2026-02-10', exento: 3400,  gravado: 43000,  itbis: 5590,   total: 51990 },
  { rnc: '105678902', proveedor: 'Oficina y Papelería SRL',           ncf: 'B0100001515', fecha: '2026-02-12', exento: 0,     gravado: 18000,  itbis: 2340,   total: 20340 },
]

async function main() {
  const wb = new ExcelJS.Workbook()
  wb.creator = 'GenSuite'
  wb.created = new Date()

  const ws = wb.addWorksheet('606 Compras', {
    pageSetup: {
      orientation: 'landscape',
      fitToPage: true,
      paperSize: 9, // A4
      margins: { left: 0.5, right: 0.5, top: 0.5, bottom: 0.5, header: 0.3, footer: 0.3 },
    },
  })

  // ── Columns ──────────────────────────────────────────────────────────────
  const colDefs = [
    { key: 'idx',      w: 5  },
    { key: 'rnc',      w: 16 },
    { key: 'proveedor', w: 38 },
    { key: 'ncf',      w: 14 },
    { key: 'fecha',    w: 13 },
    { key: 'exento',   w: 16 },
    { key: 'gravado',  w: 16 },
    { key: 'itbis',    w: 14 },
    { key: 'total',    w: 16 },
  ]

  colDefs.forEach((c, i) => { ws.getColumn(i + 1).width = c.w })

  // ── Fila 1: Título ──────────────────────────────────────────────────────
  ws.mergeCells(1, 1, 1, 9)
  const titleCell = ws.getCell('A1')
  titleCell.value = 'Reporte DGII 606 — Compras del Período'
  titleCell.font = FONT_TITLE
  titleCell.alignment = { vertical: 'middle', horizontal: 'left' }
  ws.getRow(1).height = 30

  // ── Fila 2: Subtítulo ───────────────────────────────────────────────────
  ws.mergeCells(2, 1, 2, 9)
  const subCell = ws.getCell('A2')
  subCell.value = 'Período: Enero–Febrero 2026  ·  RNC: 1-31-00001-0  ·  GENSUITE SRL'
  subCell.font = FONT_SUBTITLE
  subCell.alignment = { vertical: 'middle', horizontal: 'left' }
  ws.getRow(2).height = 20

  // ── Fila 3: Encabezados de columna ─────────────────────────────────────
  const headers = ['#', 'RNC / Cédula', 'Proveedor / Razón Social', 'NCF', 'Fecha',
                   'Monto Exento', 'Monto Gravado', 'ITBIS', 'Monto Total']
  const headerRow = ws.getRow(3)
  headerRow.height = 30
  headers.forEach((h, i) => {
    const cell = headerRow.getCell(i + 1)
    cell.value = h
    cell.font = FONT_HEADER
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BG_HEADER } }
    cell.border = border()
    cell.alignment = { vertical: 'middle', horizontal: i === 0 ? 'center' : 'left' }
  })

  // ── Filas de datos ──────────────────────────────────────────────────────
  let sumExento = 0, sumGravado = 0, sumItbis = 0, sumTotal = 0

  rows.forEach((r, i) => {
    const rowNum = i + 4
    const isEven = i % 2 === 1
    ws.getRow(rowNum).height = 22

    const vals = [
      i + 1, r.rnc, r.proveedor, r.ncf, r.fecha,
      r.exento, r.gravado, r.itbis, r.total,
    ]
    sumExento += r.exento
    sumGravado += r.gravado
    sumItbis += r.itbis
    sumTotal += r.total

    vals.forEach((v, j) => {
      const cell = ws.getRow(rowNum).getCell(j + 1)
      cell.value = v
      cell.font = (j >= 1 && j <= 3) ? FONT_MONO : FONT_DEFAULT
      cell.border = border()
      if (isEven) {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BG_STRIPE } }
      }
      cell.alignment = {
        vertical: 'middle',
        horizontal: j === 0 ? 'center' : j >= 5 ? 'right' : 'left',
      }
      if (j >= 5) cell.numFmt = '#,##0.00'
    })
  })

  // ── Fila de totales ─────────────────────────────────────────────────────
  const totalRowNum = rows.length + 4
  const totalRow = ws.getRow(totalRowNum)
  totalRow.height = 26

  const totalVals = ['', 'TOTALES', '', '', '', sumExento, sumGravado, sumItbis, sumTotal]
  totalVals.forEach((v, j) => {
    const cell = totalRow.getCell(j + 1)
    cell.value = v
    cell.font = { ...FONT_DEFAULT, bold: true, color: { argb: BRAND } }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BG_HEADER } }
    cell.border = border({ style: 'medium' })
    cell.alignment = {
      vertical: 'middle',
      horizontal: j === 0 ? 'center' : j >= 5 ? 'right' : 'left',
    }
    if (j >= 5) cell.numFmt = '#,##0.00'
  })

  // ── Footer ──────────────────────────────────────────────────────────────
  const footerRow = totalRowNum + 1
  ws.mergeCells(footerRow, 1, footerRow, 9)
  const footerCell = ws.getCell(`A${footerRow}`)
  footerCell.value = `Total de registros: ${rows.length}  ·  Generado el ${new Date().toLocaleDateString('es-DO', { year: 'numeric', month: 'long', day: 'numeric' })}`
  footerCell.font = { ...FONT_SUBTITLE, italic: true }
  footerCell.alignment = { vertical: 'middle', horizontal: 'right' }
  ws.getRow(footerRow).height = 22

  // ── Escribir archivo ────────────────────────────────────────────────────
  const buffer = await wb.xlsx.writeBuffer()
  const filename = 'reporte-606-compras.xlsx'
  writeFile(filename, buffer, (err) => {
    if (err) {
      console.error('Error al escribir el archivo:', err)
      process.exit(1)
    }
    console.log(`✓ Archivo generado: ${filename}`)
    console.log(`  Ubicación: ${process.cwd()}/${filename}`)
    console.log(`  Total registros: ${rows.length}`)
    console.log(`  Total compras: RD$${sumTotal.toLocaleString('es-DO')}`)
  })
}

main()
