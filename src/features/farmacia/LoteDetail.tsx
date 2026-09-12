import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate, useParams } from 'react-router-dom'
import { toast } from 'sonner'
import {
  desvincularDespachoDeLote,
  downloadLoteFarmaciaPdf,
  facturarLoteFarmacia,
  getLoteFarmacia,
  listDespachos,
  marcarLoteEnRevision,
  recalcularLoteFarmacia,
  vincularDespachoALote,
} from '@/shared/api/farmacia'
import { formatDOP, formatDate } from '@/lib/formatters'
import { ArrowLeft, RefreshCw, ClipboardCheck, Receipt, Trash2, Loader2, Download, X } from 'lucide-react'
import { Permitido } from '@/components/shared/Permitido'
import { usePuede } from '@/shared/permissions/can'
import { SearchSelect } from '@/shared/ui/SearchSelect'
import type { SearchSelectOption } from '@/shared/ui/SearchSelect'
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
  const [despachoAAgregar, setDespachoAAgregar] = useState('')
  const [despachoQuery, setDespachoQuery] = useState('')
  const [confirmarFacturar, setConfirmarFacturar] = useState(false)
  const [descargandoPdf, setDescargandoPdf] = useState(false)

  const { data: lote, isLoading } = useQuery({
    queryKey: ['farmacia-lote', id],
    queryFn: () => getLoteFarmacia(id!),
    enabled: !!id,
  })

  const { data: despachosDelLote } = useQuery({
    queryKey: ['farmacia-despachos', { lote: id }],
    queryFn: () => listDespachos({ lote: id, limit: 100 }),
    enabled: !!id,
  })
  const despachos = despachosDelLote?.items ?? []

  // Candidatos a agregar: cobrados, sin lote asignado — nunca "Confirmado" (el servidor lo
  // rechazaría explicando por qué, docs/FARMACIA_ARS_FRONTEND.md §3.5).
  const { data: candidatosData, isLoading: candidatosLoading } = useQuery({
    queryKey: ['farmacia-despachos-sin-lote', despachoQuery],
    queryFn: () => listDespachos({ sinLote: true, estado: 'Cobrado', search: despachoQuery || undefined, limit: 20 }),
    enabled: lote?.estado === 'Abierto' || lote?.estado === 'En Revisión',
  })
  const candidatoOptions: SearchSelectOption[] = (candidatosData?.items ?? []).map((d) => ({
    value: d.id,
    label: d.id,
    sublabel: `${d.clienteName ?? d.cliente ?? ''} — ${formatDOP(d.montoPaciente)}`,
  }))

  function invalidateAll() {
    queryClient.invalidateQueries({ queryKey: ['farmacia-lote', id] })
    queryClient.invalidateQueries({ queryKey: ['farmacia-despachos', { lote: id }] })
    queryClient.invalidateQueries({ queryKey: ['farmacia-despachos-sin-lote'] })
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

  const vincularMutation = useMutation({
    mutationFn: (despachoId: string) => vincularDespachoALote(id!, { despachoId }),
    onSuccess: () => { invalidateAll(); setDespachoAAgregar('') },
    onError: (err: { message?: string }) => toast.error(err?.message ?? 'Error al agregar el despacho'),
  })

  const desvincularMutation = useMutation({
    mutationFn: (despachoId: string) => desvincularDespachoDeLote(id!, despachoId),
    onSuccess: () => { invalidateAll(); toast.success('Despacho quitado del lote') },
    onError: (err: { message?: string }) => toast.error(err?.message ?? 'Error al quitar el despacho'),
  })

  const facturarMutation = useMutation({
    mutationFn: () => facturarLoteFarmacia(id!),
    onSuccess: (loteFacturado) => {
      invalidateAll()
      setConfirmarFacturar(false)
      toast.success('Lote facturado correctamente')
      // La consolidada ya se emitió correctamente aunque falten despachos por marcar — es una
      // advertencia post-cierre, no un fallo de la operación completa (docs/FARMACIA_ARS_FRONTEND.md §3.5).
      if (loteFacturado.despachosNoMarcados && loteFacturado.despachosNoMarcados.length > 0) {
        toast.warning(`La factura se emitió, pero estos despachos no quedaron marcados como Facturado: ${loteFacturado.despachosNoMarcados.join(', ')}`)
      }
    },
    onError: (err: { message?: string }) => {
      setConfirmarFacturar(false)
      toast.error(err?.message ?? 'Error al facturar el lote')
    },
  })

  const puedeVincular = usePuede('farmacia.lotes.vincular-despacho')

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
  const editable = lote.estado !== 'Facturado'
  const mostrarAccionesDespacho = editable && puedeVincular

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
              <button className="btn btn-primary" onClick={() => setConfirmarFacturar(true)} disabled={facturarMutation.isPending}>
                {facturarMutation.isPending ? <Loader2 size={15} className="spinner" /> : <Receipt size={15} />}
                Facturar
              </button>
            </Permitido>
          )}
          {lote.estado === 'Facturado' && (
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
            <div className="ff-wrap"><label className="ff-label">Cantidad de despachos</label><p style={{ fontWeight: 600 }}>{lote.cantidadDespachos}</p></div>
            <div className="ff-wrap"><label className="ff-label">Monto total del lote</label><p style={{ fontWeight: 600 }}>{formatDOP(lote.montoTotalLote)}</p></div>
            {lote.ncfAsignado && <div className="ff-wrap"><label className="ff-label">NCF</label><p>{lote.ncfAsignado}</p></div>}
          </div>
        </div>
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <div className="card-header"><h2 className="card-title">Despachos vinculados</h2></div>

        {mostrarAccionesDespacho && (
          <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', display: 'flex', gap: 8, alignItems: 'flex-end' }}>
            <div style={{ flex: 1 }} className="ff-wrap">
              <label className="ff-label">Agregar despacho cobrado</label>
              <SearchSelect
                value={despachoAAgregar}
                onChange={(val) => setDespachoAAgregar(val)}
                options={candidatoOptions}
                onSearch={setDespachoQuery}
                loading={candidatosLoading}
                placeholder="Buscar despacho cobrado sin lote…"
              />
            </div>
            <button
              className="btn btn-secondary btn-size-sm"
              disabled={!despachoAAgregar || vincularMutation.isPending}
              onClick={() => vincularMutation.mutate(despachoAAgregar)}
            >
              {vincularMutation.isPending ? <Loader2 size={14} className="spinner" /> : null}
              Agregar
            </button>
          </div>
        )}

        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Paciente</th>
                <th>N.º autorización</th>
                <th style={{ textAlign: 'right' }}>Monto ARS</th>
                {mostrarAccionesDespacho && <th style={{ width: 48 }} />}
              </tr>
            </thead>
            <tbody>
              {despachos.length === 0 ? (
                <tr>
                  <td colSpan={mostrarAccionesDespacho ? 5 : 4}>
                    <div className="empty-state">
                      <div className="empty-title">Sin despachos vinculados todavía</div>
                    </div>
                  </td>
                </tr>
              ) : (
                despachos.map((d) => (
                  <tr key={d.id}>
                    <td className="td-muted" style={{ fontFamily: 'monospace', fontSize: 12 }}>{d.id}</td>
                    <td>{d.clienteName ?? d.cliente ?? '—'}</td>
                    <td>{d.numeroAprobacion ?? '—'}</td>
                    <td style={{ textAlign: 'right' }}>{formatDOP(d.montoArs)}</td>
                    {mostrarAccionesDespacho && (
                      <td className="actions-cell">
                        <button
                          className="btn btn-ghost btn-size-sm"
                          onClick={() => desvincularMutation.mutate(d.id)}
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

      {confirmarFacturar && (
        <div className="modal-overlay" onClick={() => setConfirmarFacturar(false)}>
          <div className="modal-box modal-box-sm" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <h2 className="modal-title">Facturar lote</h2>
              <button className="modal-close" onClick={() => setConfirmarFacturar(false)}><X size={16} /></button>
            </div>
            <div className="modal-body">
              <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                ¿Confirmas facturar este lote a {lote.aseguradoraName ?? lote.aseguradora} por {formatDOP(lote.montoTotalLote)}?
                Esta acción no se puede deshacer.
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
