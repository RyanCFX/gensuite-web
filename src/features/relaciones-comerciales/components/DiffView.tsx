// Comparación lado a lado — docs/tasks/relaciones_comerciales/FASE_10_IGUALAR_Y_DIFERENCIAS_FRONTEND.md §2
//
// `readOnly` se usa cuando la transacción quedó `Enlazada` (Fase 11 §2): los dos documentos están
// sometidos, así que nunca se ofrece "Igualar" — el padre simplemente no pasa los botones.
import { Badge } from '@/shared/ui/Badge'
import type { BadgeVariant } from '@/shared/ui/Badge'
import type { DiffTransaccion, EstadoLineaDiff } from '@/shared/api/types'
import { formatDOP, formatPct } from '@/lib/formatters'

const ESTADO_LINEA_BADGE: Record<EstadoLineaDiff, { label: string; variant: BadgeVariant }> = {
  igual: { label: 'Igual', variant: 'neutral' },
  modificada: { label: 'Modificada', variant: 'warning' },
  agregada: { label: 'Usted agregó esto', variant: 'info' },
  eliminada: { label: 'El socio la tiene y usted no', variant: 'error' },
}

function formatValor(v: unknown): string {
  if (v === null || v === undefined) return '—'
  if (typeof v === 'number') return formatDOP(v)
  return String(v)
}

export interface DiffViewProps {
  diff: DiffTransaccion
}

export function DiffView({ diff }: DiffViewProps) {
  const lineasVisibles = diff.lineas.filter((l) => l.estado !== 'igual')

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
        <span style={{ fontSize: 13 }}>{diff.resumenTexto}</span>
        <span style={{ fontWeight: 600, fontSize: 15, color: diff.totales.diferencia < 0 ? 'var(--error-text, #b91c1c)' : diff.totales.diferencia > 0 ? 'var(--warning-text, #92600a)' : 'var(--text-secondary)' }}>
          {diff.totales.diferencia === 0 ? 'Sin diferencia' : (
            <>{diff.totales.diferencia > 0 ? '+' : ''}{formatDOP(diff.totales.diferencia)} ({formatPct(diff.totales.diferenciaPct)})</>
          )}
        </span>
      </div>

      {diff.cabecera.length > 0 && (
        <div className="card">
          <div className="card-body" style={{ padding: 0 }}>
            <table className="data-table">
              <thead><tr><th>Campo</th><th>Origen (socio)</th><th>Usted</th></tr></thead>
              <tbody>
                {diff.cabecera.map((c) => (
                  <tr key={c.campo}>
                    <td>{c.campo}</td>
                    <td>{formatValor(c.origen)}</td>
                    <td>{formatValor(c.destino)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="card navy-table-card">
        <div className="table-scroll">
          <table className="data-table navy-table">
            <thead>
              <tr>
                <th>Lo que envió/tiene el socio</th>
                <th>Lo que tiene usted</th>
                <th>Estado</th>
                <th>Cambios</th>
              </tr>
            </thead>
            <tbody>
              {lineasVisibles.length === 0 ? (
                <tr><td colSpan={4} style={{ textAlign: 'center', padding: 24 }} className="td-muted">Sin diferencias en las líneas</td></tr>
              ) : lineasVisibles.map((linea, i) => {
                const badge = ESTADO_LINEA_BADGE[linea.estado]
                return (
                  <tr key={i}>
                    <td>{linea.itemOrigen ? <>{linea.itemOrigen.itemName} <span className="td-muted">({linea.itemOrigen.itemCode})</span></> : '—'}</td>
                    <td>{linea.itemDestino ? <>{linea.itemDestino.itemName} <span className="td-muted">({linea.itemDestino.itemCode})</span></> : '—'}</td>
                    <td><Badge variant={badge.variant}>{badge.label}</Badge></td>
                    <td>
                      {linea.cambios.length === 0 ? '—' : (
                        <ul style={{ margin: 0, paddingLeft: 16, fontSize: 12 }}>
                          {linea.cambios.map((c, j) => (
                            <li key={j}>
                              {c.campo}: {formatValor(c.origen)} → {formatValor(c.destino)}
                              {typeof c.deltaPct === 'number' && <> ({formatPct(c.deltaPct)})</>}
                            </li>
                          ))}
                        </ul>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 24, fontSize: 13 }}>
        <span>Total origen: <strong>{formatDOP(diff.totales.origen)}</strong></span>
        <span>Total suyo: <strong>{formatDOP(diff.totales.destino)}</strong></span>
      </div>
    </div>
  )
}
