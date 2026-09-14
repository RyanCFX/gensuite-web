import { FileText } from 'lucide-react'
import { type GlColumn, classifyGlRow, glCellValue } from '@/shared/lib/glLedger'

/** Tabla genérica de Libro Diario/Mayor: resalta las filas de Apertura/Total/Cierre y filtra
 * las separadoras. */
export function GlLedgerTable({ data, columns }: { data: Record<string, unknown>[]; columns?: GlColumn[] }) {
  const rows = data.filter((r) => classifyGlRow(r) !== 'separator')

  if (rows.length === 0) {
    return (
      <div className="empty-state">
        <span className="empty-icon"><FileText size={20} /></span>
        <p className="empty-title">Sin datos</p>
        <p className="empty-sub">No hay movimientos para los filtros seleccionados.</p>
      </div>
    )
  }

  const colDefs: GlColumn[] = columns && columns.length > 0
    ? columns
    : Object.keys(rows[0]).map((k) => ({ fieldname: k, label: k.replace(/_/g, ' ') }))

  return (
    <div className="table-scroll">
      <table className="data-table navy-table">
        <thead>
          <tr>
            {colDefs.map((c) => <th key={c.fieldname}>{c.label}</th>)}
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
