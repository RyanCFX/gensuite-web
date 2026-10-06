import { useQuery } from '@tanstack/react-query'
import { createPortal } from 'react-dom'
import { X, ExternalLink, History } from 'lucide-react'
import {
  getAuditoriaTransaccion,
  resolverDestinoLink,
  type AuditoriaTransaccion,
} from '@/shared/api/auditoria'
import { formatDateTime } from '@/lib/formatters'

interface Props {
  row: AuditoriaTransaccion | null
  onClose: () => void
  onVerHistorial: (docname: string) => void
  onAbrirDocumento: (row: AuditoriaTransaccion) => void
}

function renderValor(v: unknown): string {
  if (v === null || v === undefined) return '—'
  if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') return String(v)
  try {
    return JSON.stringify(v)
  } catch {
    return String(v)
  }
}

/**
 * Vista de detalle (modal) — §4. Muestra `metadata` como lista simple clave/valor (shape
 * variable, sin layout rígido) y `versiones` como JSON secundario, con estado
 * "no disponible" cuando es `null` (best-effort, nunca error ni carga infinita).
 */
export function AuditoriaDetailModal({ row, onClose, onVerHistorial, onAbrirDocumento }: Props) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['auditoria-transaccion', row?.id],
    queryFn: () => getAuditoriaTransaccion(row!.id),
    enabled: !!row?.id,
  })

  if (!row) return null

  const detail = data ?? null
  const metadataEntries = detail ? Object.entries(detail.metadata ?? {}) : []
  const destino = resolverDestinoLink(row.link)

  return createPortal(
    <div className="drawer-overlay" onClick={onClose}>
      <div
        className="drawer-panel drawer-panel-lg"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={`Detalle de ${row.label}`}
      >
        <div className="modal-head">
          <div>
            <h2 className="modal-title">{row.label}</h2>
            <p className="modal-sub">
              {row.doctype} · {row.docname} · {formatDateTime(row.createdAt)}
            </p>
          </div>
          <button className="modal-close" onClick={onClose} aria-label="Cerrar">
            <X size={16} />
          </button>
        </div>

        <div className="modal-body" style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 16 }}>
          {row.resumen && (
            <p style={{ fontSize: 14, color: 'var(--text-primary)', margin: 0 }}>{row.resumen}</p>
          )}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, fontSize: 13 }}>
            <div>
              <div className="ff-label-sm">Actor</div>
              <div style={{ fontWeight: 500 }}>{row.actorEmail}</div>
            </div>
            <div>
              <div className="ff-label-sm">Acción</div>
              <div className="td-muted" style={{ fontFamily: 'var(--font-body)', fontSize: 12 }}>
                {row.accion}
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button
              type="button"
              className="btn btn-navy btn-size-sm"
              onClick={() => onAbrirDocumento(row)}
              disabled={!row.link}
              title={destino.href || 'Abrir documento'}
            >
              <ExternalLink size={14} /> Abrir documento
            </button>
            <button
              type="button"
              className="btn btn-secondary btn-size-sm"
              onClick={() => onVerHistorial(row.docname)}
              title="Ver todo el historial de este documento"
            >
              <History size={14} /> Ver historial de este documento
            </button>
          </div>

          {isLoading ? (
            <span className="skeleton-box" style={{ height: 120, display: 'block' }} />
          ) : isError ? (
            <p style={{ fontSize: 13, color: 'var(--error-text)' }}>
              No se pudo cargar el detalle. El listado sigue disponible.
            </p>
          ) : detail ? (
            <>
              <div>
                <h3 style={{ fontSize: 13, fontWeight: 600, margin: '0 0 8px' }}>Datos relacionados</h3>
                {metadataEntries.length === 0 ? (
                  <p className="td-muted" style={{ fontSize: 13, margin: 0 }}>
                    Sin datos adicionales.
                  </p>
                ) : (
                  <dl style={{ margin: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {metadataEntries.map(([k, v]) => (
                      <div key={k} style={{ display: 'flex', gap: 8, fontSize: 13 }}>
                        <dt className="td-muted" style={{ minWidth: 140, flexShrink: 0 }}>
                          {k}
                        </dt>
                        <dd style={{ margin: 0, fontFamily: 'var(--font-body)', wordBreak: 'break-word' }}>
                          {renderValor(v)}
                        </dd>
                      </div>
                    ))}
                  </dl>
                )}
              </div>

              <div>
                <h3 style={{ fontSize: 13, fontWeight: 600, margin: '0 0 8px' }}>Detalle fino (ERPNext)</h3>
                {detail.versiones === null ? (
                  <p className="td-muted" style={{ fontSize: 13, margin: 0 }}>
                    Detalle fino no disponible.
                  </p>
                ) : detail.versiones.length === 0 ? (
                  <p className="td-muted" style={{ fontSize: 13, margin: 0 }}>
                    Sin cambios de campo registrados.
                  </p>
                ) : (
                  <pre
                    style={{
                      fontSize: 11,
                      background: 'var(--surface-2, #f4f4f5)',
                      borderRadius: 8,
                      padding: 12,
                      overflow: 'auto',
                      maxHeight: 280,
                      margin: 0,
                    }}
                  >
                    {JSON.stringify(detail.versiones, null, 2)}
                  </pre>
                )}
              </div>
            </>
          ) : null}
        </div>
      </div>
    </div>,
    document.body,
  )
}
