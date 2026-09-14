import { useMemo, useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Loader2, X } from 'lucide-react'
import { listFacturasElegibles, vincularFacturasALote } from '@/shared/api/farmacia'
import { formatDOP, formatDate } from '@/lib/formatters'
import type { LoteFacturacionArs, VincularFacturasResult } from '@/shared/api/types'

/** El backend acepta entre 1 y 100 facturas por llamada (§6.3). */
const MAX_POR_LOTE = 100

/**
 * Diálogo "Facturas elegibles" del lote: trae los candidatos que el servidor considera
 * vinculables y los manda en bloque (docs/PROMPT_FARMACIA_V2_FRONTEND.md §6.3). El resultado
 * nunca aborta por las rechazadas — se reportan con su motivo y el resto queda vinculado.
 */
export function FacturasElegiblesModal({
  lote,
  onClose,
  onVinculadas,
}: {
  lote: LoteFacturacionArs
  onClose: () => void
  onVinculadas: (res: VincularFacturasResult) => void
}) {
  const [seleccion, setSeleccion] = useState<Set<string>>(new Set())
  const [rechazadas, setRechazadas] = useState<VincularFacturasResult['rechazadas']>([])

  const { data, isLoading, error } = useQuery({
    queryKey: ['farmacia-facturas-elegibles', lote.aseguradora, lote.periodoInicio, lote.periodoFin],
    queryFn: () => listFacturasElegibles({
      aseguradora: lote.aseguradora,
      periodoInicio: lote.periodoInicio,
      periodoFin: lote.periodoFin,
    }),
    retry: false,
  })
  const elegibles = useMemo(() => data?.items ?? [], [data])

  const totalSeleccionado = useMemo(
    () => elegibles.filter((f) => seleccion.has(f.id)).reduce((s, f) => s + (f.montoCoberturaNeta ?? 0), 0),
    [elegibles, seleccion],
  )

  function toggle(id: string) {
    setSeleccion((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const todasSeleccionadas = elegibles.length > 0 && elegibles.every((f) => seleccion.has(f.id))
  function toggleTodas() {
    setSeleccion(todasSeleccionadas ? new Set() : new Set(elegibles.slice(0, MAX_POR_LOTE).map((f) => f.id)))
  }

  const vincularMutation = useMutation({
    mutationFn: () => vincularFacturasALote(lote.id, { facturaIds: [...seleccion] }),
    onSuccess: (res) => {
      const nVinculadas = res.vinculadas?.length ?? 0
      const nRechazadas = res.rechazadas?.length ?? 0
      if (nVinculadas > 0) {
        toast.success(
          nRechazadas > 0
            ? `${nVinculadas} factura(s) vinculada(s), ${nRechazadas} rechazada(s)`
            : `${nVinculadas} factura(s) vinculada(s) al lote`,
        )
      } else {
        toast.error('Ninguna factura pudo vincularse — revisá los motivos')
      }
      onVinculadas(res)
      setSeleccion(new Set())
      // Las rechazadas se muestran acá (no en un toast) para que el usuario pueda leer cada
      // motivo con calma; el diálogo queda abierto hasta que lo cierre.
      setRechazadas(res.rechazadas ?? [])
      if (nRechazadas === 0) onClose()
    },
    onError: (err: { message?: string }) => toast.error(err?.message ?? 'Error al vincular las facturas'),
  })

  const excedeTope = seleccion.size > MAX_POR_LOTE

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" style={{ maxWidth: 900 }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <div>
            <h2 className="modal-title">Facturas elegibles</h2>
            <p style={{ margin: '2px 0 0', fontSize: 12, color: 'var(--text-tertiary)' }}>
              {lote.aseguradoraName ?? lote.aseguradora} · {formatDate(lote.periodoInicio)} – {formatDate(lote.periodoFin)}
            </p>
          </div>
          <button className="modal-close" onClick={onClose}><X size={16} /></button>
        </div>

        <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {rechazadas.length > 0 && (
            <div className="inline-alert inline-alert-warn" style={{ display: 'block' }}>
              <strong>{rechazadas.length} factura(s) no se pudieron vincular:</strong>
              <ul style={{ margin: '6px 0 0', paddingLeft: 18, fontSize: 12 }}>
                {rechazadas.map((r) => (
                  <li key={r.factura}>
                    <span style={{ fontFamily: 'monospace' }}>{r.factura}</span> — {r.motivo}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <p style={{ margin: 0, fontSize: 12, color: 'var(--text-tertiary)', lineHeight: 1.5 }}>
            Facturas sometidas de esta ARS, con estado ARS <strong>Pendiente</strong>, sin lote,
            con cobertura neta pendiente y ya cobradas al paciente.
          </p>

          {error && (
            <div className="inline-alert inline-alert-error">
              {(error as { message?: string })?.message ?? 'No se pudieron cargar las facturas elegibles'}
            </div>
          )}

          <div className="table-scroll" style={{ maxHeight: 380 }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th style={{ width: 36 }}>
                    <input
                      type="checkbox"
                      checked={todasSeleccionadas}
                      disabled={elegibles.length === 0}
                      onChange={toggleTodas}
                      title="Seleccionar todas"
                      style={{ cursor: 'pointer' }}
                    />
                  </th>
                  <th>Factura</th>
                  <th>Paciente</th>
                  <th>Fecha</th>
                  <th>NCF</th>
                  <th>N.º autorización</th>
                  <th style={{ textAlign: 'right' }}>Total</th>
                  <th style={{ textAlign: 'right' }}>Cobertura neta</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <tr key={i}>
                      {Array.from({ length: 8 }).map((__, j) => (
                        <td key={j}><div className="skeleton-box" style={{ height: 14, width: '100%' }} /></td>
                      ))}
                    </tr>
                  ))
                ) : elegibles.length === 0 ? (
                  <tr>
                    <td colSpan={8}>
                      <div className="empty-state">
                        <div className="empty-title">Sin facturas elegibles</div>
                        <p className="empty-sub">
                          No hay facturas de esta ARS en el período que cumplan el criterio. Revisá
                          que estén sometidas y ya cobradas al paciente.
                        </p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  elegibles.map((f) => (
                    <tr
                      key={f.id}
                      className="table-row-clickable"
                      onClick={() => toggle(f.id)}
                      style={{ opacity: seleccion.has(f.id) ? 1 : 0.75 }}
                    >
                      <td onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={seleccion.has(f.id)}
                          onChange={() => toggle(f.id)}
                          style={{ cursor: 'pointer' }}
                        />
                      </td>
                      <td style={{ fontFamily: 'monospace', fontSize: 12 }}>{f.id}</td>
                      <td>{f.customerName || f.customer}</td>
                      <td className="td-muted">{formatDate(f.postingDate)}</td>
                      <td style={{ fontFamily: 'monospace', fontSize: 12 }}>{f.ncf ?? '—'}</td>
                      <td>{f.numeroAutorizacion}</td>
                      <td style={{ textAlign: 'right' }}>{formatDOP(f.grandTotal)}</td>
                      <td style={{ textAlign: 'right', fontWeight: 600 }}>{formatDOP(f.montoCoberturaNeta)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {elegibles.length > 0 && (
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
              <span className="td-muted">
                {data?.total ?? elegibles.length} elegible(s) · total disponible {formatDOP(data?.montoTotal ?? 0)}
              </span>
              <span style={{ fontWeight: 600 }}>
                {seleccion.size} seleccionada(s) — {formatDOP(totalSeleccionado)}
              </span>
            </div>
          )}

          {excedeTope && (
            <div className="inline-alert inline-alert-warn">
              Solo se pueden vincular {MAX_POR_LOTE} facturas por vez — deseleccioná algunas y repetí la operación.
            </div>
          )}
        </div>

        <div className="modal-foot">
          <button className="btn btn-secondary" onClick={onClose}>Cerrar</button>
          <button
            className="btn btn-primary"
            disabled={seleccion.size === 0 || excedeTope || vincularMutation.isPending}
            onClick={() => vincularMutation.mutate()}
          >
            {vincularMutation.isPending ? <Loader2 size={14} className="spinner" /> : null}
            Agregar {seleccion.size > 0 ? `${seleccion.size} factura(s)` : 'facturas'}
          </button>
        </div>
      </div>
    </div>
  )
}
