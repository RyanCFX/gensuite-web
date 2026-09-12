import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate, useParams } from 'react-router-dom'
import { toast } from 'sonner'
import {
  desvincularFacturaDeLote,
  downloadLoteFarmaciaPdf,
  facturarLoteFarmacia,
  getLoteFarmacia,
  marcarLoteEnRevision,
  recalcularLoteFarmacia,
} from '@/shared/api/farmacia'
import { formatDOP, formatDate } from '@/lib/formatters'
import { ArrowLeft, RefreshCw, ClipboardCheck, Receipt, Trash2, Loader2, Download, Plus, X } from 'lucide-react'
import { Permitido } from '@/components/shared/Permitido'
import { usePuede } from '@/shared/permissions/can'
import { FacturasElegiblesModal } from './FacturasElegiblesModal'
import { EstadoArsBadge } from '@/features/invoicing/EstadoArsBadge'
import type { LoteFarmaciaEstado } from '@/shared/api/types'

const ESTADO_BADGE: Record<LoteFarmaciaEstado, string> = {
  Abierto: 'badge-draft',
  'En Revisión': 'badge-warning',
  Facturado: 'badge-info',
}

export default function LoteDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [elegiblesOpen, setElegiblesOpen] = useState(false)
  const [confirmarFacturar, setConfirmarFacturar] = useState(false)
  const [descargandoPdf, setDescargandoPdf] = useState(false)

  const { data: lote, isLoading } = useQuery({
    queryKey: ['farmacia-lote', id],
    queryFn: () => getLoteFarmacia(id!),
    enabled: !!id,
  })

  function invalidateAll() {
    queryClient.invalidateQueries({ queryKey: ['farmacia-lote', id] })
    queryClient.invalidateQueries({ queryKey: ['farmacia-lotes'] })
    queryClient.invalidateQueries({ queryKey: ['farmacia-facturas-elegibles'] })
    // El estado ARS de las facturas cambió (Pendiente ↔ En Lote ↔ Facturado).
    queryClient.invalidateQueries({ queryKey: ['invoices'] })
  }

  const recalcularMutation = useMutation({
    mutationFn: () => recalcularLoteFarmacia(id!),
    onSuccess: () => { invalidateAll(); toast.success('Totales recalculados') },
    onError: (err: { message?: string }) => toast.error(err?.message ?? 'Error al recalcular'),
  })

  const enRevisionMutation = useMutation({
    mutationFn: () => marcarLoteEnRevision(id!),
    onSuccess: () => { invalidateAll(); toast.success('Lote marcado en revisión') },
    onError: (err: { message?: string }) => toast.error(err?.message ?? 'Error al marcar en revisión'),
  })

  const desvincularMutation = useMutation({
    mutationFn: (facturaId: string) => desvincularFacturaDeLote(id!, facturaId),
    onSuccess: () => { invalidateAll(); toast.success('Factura quitada del lote — volvió a "Pendiente"') },
    onError: (err: { message?: string }) => toast.error(err?.message ?? 'Error al quitar la factura'),
  })

  const facturarMutation = useMutation({
    mutationFn: () => facturarLoteFarmacia(id!),
    onSuccess: (loteFacturado) => {
      invalidateAll()
      setConfirmarFacturar(false)
      toast.success(
        loteFacturado.ncfAsignado
          ? `Lote facturado — NCF ${loteFacturado.ncfAsignado}`
          : 'Lote facturado correctamente',
      )
    },
    onError: (err: { message?: string }) => {
      setConfirmarFacturar(false)
      const msg = err?.message ?? 'Error al facturar el lote'
      // Reintentar `facturar` es seguro: nunca emite dos consolidadas (§6.5).
      toast.error(msg, { duration: 8000 })
    },
  })

  const puedeVincular = usePuede('farmacia.lotes.vincular-facturas')
  const puedeVerElegibles = usePuede('farmacia.lotes.facturas-elegibles')

  async function handleDescargarPdf() {
    if (!id) return
    setDescargandoPdf(true)
    try {
      await downloadLoteFarmaciaPdf(id)
    } catch (err) {
      toast.error((err as { message?: string })?.message ?? 'Error al descargar el PDF')
    } finally {
      setDescargandoPdf(false)
    }
  }

  if (isLoading || !lote) {
    return (
      <div className="page-container">
        <div className="skeleton-box" style={{ width: 220, height: 24, marginBottom: 8 }} />
        <div className="skeleton-box" style={{ width: '100%', height: 280, borderRadius: 'var(--radius-lg)' }} />
      </div>
    )
  }

  const esAbierto = lote.estado === 'Abierto'
  const facturado = lote.estado === 'Facturado'
  const editable = !facturado
  const mostrarAccionesFactura = editable && puedeVincular
  // Mientras el lote está abierto manda la lista viva; una vez facturado, el snapshot congelado
  // es el anexo oficial de la consolidada (§6.3/§6.4).
  const facturas = lote.facturas ?? []
  const snapshot = lote.facturasSnapshot ?? []
  const sinFacturas = lote.cantidadFacturas === 0

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <a className="page-back-link" onClick={() => navigate('/farmacia/lotes')}>
            <ArrowLeft size={14} /> Lotes de Facturación ARS
          </a>
          <h1 className="page-title">
            {lote.id} <span className={`badge ${ESTADO_BADGE[lote.estado] ?? 'badge-neutral'}`}>{lote.estado}</span>
          </h1>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {editable && (
            <Permitido accion="farmacia.lotes.recalcular">
              <button className="btn btn-secondary" onClick={() => recalcularMutation.mutate()} disabled={recalcularMutation.isPending}>
                {recalcularMutation.isPending ? <Loader2 size={15} className="spinner" /> : <RefreshCw size={15} />}
                Recalcular totales
              </button>
            </Permitido>
          )}
          {esAbierto && (
            <Permitido accion="farmacia.lotes.marcar-en-revision">
              <button className="btn btn-secondary" onClick={() => enRevisionMutation.mutate()} disabled={enRevisionMutation.isPending}>
                {enRevisionMutation.isPending ? <Loader2 size={15} className="spinner" /> : <ClipboardCheck size={15} />}
                Marcar en revisión
              </button>
            </Permitido>
          )}
          {editable && (
            <Permitido accion="farmacia.lotes.facturar">
              <button
                className="btn btn-primary"
                onClick={() => setConfirmarFacturar(true)}
                disabled={facturarMutation.isPending || sinFacturas}
                title={sinFacturas ? 'Agregá al menos una factura antes de facturar el lote' : undefined}
              >
                {facturarMutation.isPending ? <Loader2 size={15} className="spinner" /> : <Receipt size={15} />}
                Facturar
              </button>
            </Permitido>
          )}
          {facturado && (
            <Permitido accion="farmacia.lotes.imprimir">
              <button className="btn btn-secondary" onClick={handleDescargarPdf} disabled={descargandoPdf}>
                {descargandoPdf ? <Loader2 size={15} className="spinner" /> : <Download size={15} />}
                Descargar PDF
              </button>
            </Permitido>
          )}
        </div>
      </div>

      <div className="card">
        <div className="card-header"><h2 className="card-title">Información General</h2></div>
        <div className="card-body">
          <div className="form-row form-row-3">
            <div className="ff-wrap"><label className="ff-label">ARS</label><p style={{ fontWeight: 600 }}>{lote.aseguradoraName ?? lote.aseguradora}</p></div>
            <div className="ff-wrap"><label className="ff-label">Período</label><p>{formatDate(lote.periodoInicio)} – {formatDate(lote.periodoFin)}</p></div>
            {lote.responsable && <div className="ff-wrap"><label className="ff-label">Responsable</label><p>{lote.responsable}</p></div>}
            <div className="ff-wrap"><label className="ff-label">Cantidad de facturas</label><p style={{ fontWeight: 600 }}>{lote.cantidadFacturas}</p></div>
            <div className="ff-wrap"><label className="ff-label">Monto total del lote</label><p style={{ fontWeight: 600 }}>{formatDOP(lote.montoTotalLote)}</p></div>
            {lote.ncfAsignado && <div className="ff-wrap"><label className="ff-label">NCF de la consolidada</label><p style={{ fontFamily: 'monospace' }}>{lote.ncfAsignado}</p></div>}
            {lote.facturaConsolidada && (
              <div className="ff-wrap">
                <label className="ff-label">Factura consolidada</label>
                <p>
                  <button
                    style={{ fontFamily: 'monospace', color: 'var(--color-brand)', background: 'none', border: 'none', padding: 0, cursor: 'pointer', textDecoration: 'underline' }}
                    onClick={() => navigate(`/facturas/${lote.facturaConsolidada}`)}
                  >
                    {lote.facturaConsolidada}
                  </button>
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <div className="card-header" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <h2 className="card-title" style={{ flex: 1 }}>Facturas vinculadas</h2>
          {mostrarAccionesFactura && puedeVerElegibles && (
            <button className="btn btn-secondary btn-size-sm" onClick={() => setElegiblesOpen(true)}>
              <Plus size={14} /> Agregar facturas
            </button>
          )}
        </div>

        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>Factura</th>
                <th>Paciente</th>
                <th>NCF</th>
                <th>N.º autorización</th>
                <th style={{ textAlign: 'right' }}>Total</th>
                <th style={{ textAlign: 'right' }}>Cobertura neta</th>
                <th>Estado ARS</th>
                {mostrarAccionesFactura && <th style={{ width: 48 }} />}
              </tr>
            </thead>
            <tbody>
              {facturas.length === 0 ? (
                <tr>
                  <td colSpan={mostrarAccionesFactura ? 8 : 7}>
                    <div className="empty-state">
                      <div className="empty-title">Sin facturas vinculadas todavía</div>
                      {mostrarAccionesFactura && puedeVerElegibles && (
                        <p className="empty-sub">
                          Usá "Agregar facturas" para ver las facturas elegibles de esta ARS en el período.
                        </p>
                      )}
                    </div>
                  </td>
                </tr>
              ) : (
                facturas.map((f) => (
                  <tr key={f.id} className="table-row-clickable" onClick={() => navigate(`/facturas/${f.id}`)}>
                    <td className="td-muted" style={{ fontFamily: 'monospace', fontSize: 12 }}>{f.id}</td>
                    <td>{f.customerName || f.customer}</td>
                    <td style={{ fontFamily: 'monospace', fontSize: 12 }}>{f.ncf ?? '—'}</td>
                    <td>{f.numeroAutorizacion}</td>
                    <td style={{ textAlign: 'right' }}>{formatDOP(f.grandTotal)}</td>
                    <td style={{ textAlign: 'right', fontWeight: 600 }}>{formatDOP(f.montoCoberturaNeta)}</td>
                    <td><EstadoArsBadge estado={f.estadoArs} /></td>
                    {mostrarAccionesFactura && (
                      <td className="actions-cell" onClick={(e) => e.stopPropagation()}>
                        <button
                          className="btn btn-ghost btn-size-sm"
                          title="Quitar del lote"
                          onClick={() => desvincularMutation.mutate(f.id)}
                          disabled={desvincularMutation.isPending}
                        >
                          <Trash2 size={14} />
                        </button>
                      </td>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Anexo oficial: lo que realmente se facturó, congelado al emitir la consolidada. La
          cobertura neta de la lista viva puede haber bajado después por devoluciones (§6.4). */}
      {facturado && snapshot.length > 0 && (
        <div className="card" style={{ marginTop: 16 }}>
          <div className="card-header">
            <h2 className="card-title">Anexo facturado</h2>
            <p style={{ margin: '2px 0 0', fontSize: 12, color: 'var(--text-tertiary)' }}>
              Montos congelados al emitir la consolidada — no cambian con devoluciones posteriores.
            </p>
          </div>
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Factura</th>
                  <th>NCF</th>
                  <th>Paciente</th>
                  <th>N.º autorización</th>
                  <th>Carnet</th>
                  <th style={{ textAlign: 'right' }}>Cobertura facturada</th>
                </tr>
              </thead>
              <tbody>
                {snapshot.map((f) => (
                  <tr key={f.factura}>
                    <td className="td-muted" style={{ fontFamily: 'monospace', fontSize: 12 }}>{f.factura}</td>
                    <td style={{ fontFamily: 'monospace', fontSize: 12 }}>{f.ncf ?? '—'}</td>
                    <td>{f.paciente ?? '—'}</td>
                    <td>{f.numeroAutorizacion ?? '—'}</td>
                    <td>{f.carnetAfiliado ?? '—'}</td>
                    <td style={{ textAlign: 'right', fontWeight: 600 }}>{formatDOP(f.montoCobertura)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {elegiblesOpen && (
        <FacturasElegiblesModal
          lote={lote}
          onClose={() => setElegiblesOpen(false)}
          onVinculadas={() => invalidateAll()}
        />
      )}

      {confirmarFacturar && (
        <div className="modal-overlay" onClick={() => setConfirmarFacturar(false)}>
          <div className="modal-box modal-box-sm" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <h2 className="modal-title">Facturar lote</h2>
              <button className="modal-close" onClick={() => setConfirmarFacturar(false)}><X size={16} /></button>
            </div>
            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: 0 }}>
                Se emitirá la factura consolidada <strong>B01/E31</strong> a{' '}
                <strong>{lote.aseguradoraName ?? lote.aseguradora}</strong> por{' '}
                <strong>{formatDOP(lote.montoTotalLote)}</strong> con{' '}
                <strong>{lote.cantidadFacturas}</strong> factura(s).
              </p>
              <p style={{ fontSize: 13, color: 'var(--color-error)', fontWeight: 600, margin: 0 }}>
                No se puede deshacer.
              </p>
            </div>
            <div className="modal-foot">
              <button className="btn btn-secondary" onClick={() => setConfirmarFacturar(false)}>Volver</button>
              <button className="btn btn-danger" onClick={() => facturarMutation.mutate()} disabled={facturarMutation.isPending}>
                {facturarMutation.isPending ? <Loader2 size={14} className="spinner" /> : null}
                Facturar Lote
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
