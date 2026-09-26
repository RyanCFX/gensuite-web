import { FileText } from 'lucide-react'
import { type GlColumn, classifyGlRow, glCellValue } from '@/shared/lib/glLedger'
import { useResizableColumns } from '@/shared/hooks/useResizableColumns'

/** Tabla genérica de Libro Diario/Mayor: resalta las filas de Apertura/Total/Cierre y filtra
 * las separadoras. */
export function GlLedgerTable({ data, columns }: { data: Record<string, unknown>[]; columns?: GlColumn[] }) {
  const rows = data.filter((r) => classifyGlRow(r) !== 'separator')

  // Columnas dinámicas (según los datos o la prop `columns`) — calculadas ANTES del early return
  // de abajo para que el hook de anchos se llame siempre, sin importar si hay filas o no.
  const colDefs: GlColumn[] = columns && columns.length > 0
    ? columns
    : rows.length > 0
      ? Object.keys(rows[0]).map((k) => ({ fieldname: k, label: k.replace(/_/g, ' ') }))
      : []
  const COLUMNS = colDefs.map((c) => ({ key: c.fieldname, width: 140 }))
  const { widths: colWidths, startResize } = useResizableColumns(COLUMNS)

  if (rows.length === 0) {
    return (
      <div className="empty-state">
        <span className="empty-icon"><FileText size={20} /></span>
        <p className="empty-title">Sin datos</p>
        <p className="empty-sub">No hay movimientos para los filtros seleccionados.</p>
      </div>
    )
  }

  return (
    <div className="table-scroll">
      <table className="data-table navy-table items-table-resizable">
        <colgroup>
          {COLUMNS.map((c) => <col key={c.key} style={{ width: colWidths[c.key] }} />)}
        </colgroup>
        <thead>
          <tr>
            {colDefs.map((c) => (
              <th key={c.fieldname}>
                {c.label}
                <span className="col-resize-handle" onMouseDown={startResize(c.fieldname)} />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => {
            const isSubtotal = classifyGlRow(row) === 'subtotal'
            return (
              <tr key={i} style={isSubtotal ? { fontWeight: 700, background: 'var(--surface-sunken)' } : undefined}>
                {colDefs.map((c) => (
                  <td key={c.fieldname}>{glCellValue(c.fieldname, row[c.fieldname])}</td>
                ))}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
