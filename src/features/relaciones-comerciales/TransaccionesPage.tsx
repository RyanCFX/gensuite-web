// Bandeja de transacciones B2B — docs/tasks/relaciones_comerciales, Fase 06 §2.
//
// Solo lista + Reintentar/Cancelar (los únicos endpoints de esta fase que no requieren abrir el
// detalle). Aceptar/Rechazar/Mapear/Igualar/Enlazar viven todos en TransaccionDetail.
import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { ChevronLeft, ChevronRight, RotateCw, Ban, X, ArrowDownLeft, ArrowUpRight } from 'lucide-react'
import { listTransaccionesB2B, reintentarTransaccionB2B, cancelarTransaccionB2B } from '@/shared/api/relaciones'
import type { ApiError, EstadoTransaccionB2B } from '@/shared/api/types'
import { PageHeader } from '@/components/shared/PageHeader'
import { RecargarButton } from '@/components/shared/RecargarButton'
import { Badge } from '@/shared/ui/Badge'
import { ConfirmModal } from '@/shared/ui/Modal'
import { FilterField } from '@/shared/ui/FilterField'
import { Select, SelectItem } from '@/components/ui/select'
import { DatePicker } from '@/shared/ui/DatePicker'
import { usePuede } from '@/shared/permissions/can'
import { formatDate, formatDateTime, formatDOP } from '@/lib/formatters'
import { ESTADO_TRANSACCION_BADGE, ESTADOS_TRANSACCION_B2B } from './estadoTransaccion'

const PAGE_SIZE = 20

export default function TransaccionesPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [searchParams] = useSearchParams()

  const puedeListar = usePuede('relaciones.transacciones.listar')
  const puedeReenviar = usePuede('relaciones.transaccion.reenviar')

  const [direccion, setDireccion] = useState<'all' | 'Entrante' | 'Saliente'>('all')
  const [tipo, setTipo] = useState<'all' | 'Venta' | 'Compra'>('all')
  const [estado, setEstado] = useState<'all' | EstadoTransaccionB2B>('all')
  // Precargado por query param (viene del detalle de una relación), pero removible por el usuario.
  const [relacionId, setRelacionId] = useState(() => searchParams.get('relacionId') ?? '')
  const [desde, setDesde] = useState('')
  const [hasta, setHasta] = useState('')
  const [page, setPage] = useState(1)
  const [cancelTarget, setCancelTarget] = useState<string | null>(null)

  const offset = (page - 1) * PAGE_SIZE

  const { data, isLoading, isError } = useQuery({
    queryKey: ['transacciones-b2b', { direccion, tipo, estado, relacionId, desde, hasta, offset }],
    queryFn: () =>
      listTransaccionesB2B({
        direccion: direccion !== 'all' ? direccion : undefined,
        tipo: tipo !== 'all' ? tipo : undefined,
        estado: estado !== 'all' ? estado : undefined,
        relacionId: relacionId || undefined,
        desde: desde || undefined,
        hasta: hasta || undefined,
        limit: PAGE_SIZE,
        offset,
      }),
    enabled: puedeListar,
  })

  const totalPages = data ? Math.max(1, Math.ceil(data.meta.total / PAGE_SIZE)) : 1

  function invalidar() {
    queryClient.invalidateQueries({ queryKey: ['transacciones-b2b'] })
  }

  const reintentarMutation = useMutation({
    mutationFn: (uid: string) => reintentarTransaccionB2B(uid),
    onSuccess: () => { toast.success('Transacción reenviada para reintentar.'); invalidar() },
    onError: (err: ApiError) => toast.error(err.message ?? 'Error al reintentar la transacción'),
  })

  const cancelarMutation = useMutation({
    mutationFn: (uid: string) => cancelarTransaccionB2B(uid),
    onSuccess: () => { toast.success('Envío cancelado.'); setCancelTarget(null); invalidar() },
    onError: (err: ApiError) => { toast.error(err.message ?? 'Error al cancelar el envío'); setCancelTarget(null) },
  })

  function resetPage<T>(setter: (v: T) => void) {
    return (v: T) => { setter(v); setPage(1) }
  }

  if (!puedeListar) {
    return (
      <div className="page-container">
        <PageHeader title={<><span className="page-title-dot" />Transacciones B2B</>} description="Relaciones Comerciales" />
        <div className="card">
          <div className="empty-state">
            <p className="empty-title">Sin acceso</p>
            <p className="empty-sub">No tienes permiso para ver la bandeja de transacciones B2B.</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="page-container">
      <PageHeader
        title={<><span className="page-title-dot" />Transacciones B2B</>}
        description="Facturas de venta/compra intercambiadas automáticamente con tus socios comerciales"
        action={<RecargarButton />}
      />

      <div className="card filter-card-navy" style={{ marginBottom: 20 }}>
        <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="filter-bar" style={{ margin: 0 }}>
            <div className="filter-bar-left">
              <FilterField label="Dirección">
                <Select value={direccion} onValueChange={resetPage(setDireccion) as (v: string) => void} clearable={false}>
                  <SelectItem value="all">Todas</SelectItem>
                  <SelectItem value="Entrante">Entrante</SelectItem>
                  <SelectItem value="Saliente">Saliente</SelectItem>
                </Select>
              </FilterField>
              <FilterField label="Tipo">
                <Select value={tipo} onValueChange={resetPage(setTipo) as (v: string) => void} clearable={false}>
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="Venta">Venta</SelectItem>
                  <SelectItem value="Compra">Compra</SelectItem>
                </Select>
              </FilterField>
              <FilterField label="Estado" style={{ minWidth: 220 }}>
                <Select value={estado} onValueChange={resetPage(setEstado) as (v: string) => void} clearable={false}>
                  <SelectItem value="all">Todos</SelectItem>
                  {ESTADOS_TRANSACCION_B2B.map((e) => (
                    <SelectItem key={e} value={e}>{ESTADO_TRANSACCION_BADGE[e].label}</SelectItem>
                  ))}
                </Select>
              </FilterField>
              <FilterField label="Desde">
                <DatePicker value={desde} onChange={resetPage(setDesde)} clearable />
              </FilterField>
              <FilterField label="Hasta">
                <DatePicker value={hasta} onChange={resetPage(setHasta)} clearable />
              </FilterField>
            </div>
          </div>

          {relacionId && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span className="td-muted" style={{ fontSize: 12 }}>Filtrando por relación:</span>
              <span className="badge badge-brand" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                {relacionId}
                <button
                  type="button"
                  onClick={() => resetPage(setRelacionId)('')}
                  style={{ display: 'inline-flex', background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: 'inherit' }}
                  aria-label="Quitar filtro de relación"
                >
                  <X size={12} />
                </button>
              </span>
            </div>
          )}
        </div>
      </div>

      <div className="card navy-table-card">
        <div className="table-scroll">
          <table className="data-table navy-table">
            <thead>
              <tr>
                <th>Dirección</th>
                <th>Tipo</th>
                <th>Contraparte</th>
                <th>Documento origen</th>
                <th>Estado</th>
                <th>Creada</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {isLoading
                ? Array.from({ length: 8 }).map((_, i) => (
                    <tr key={i}>
                      {Array.from({ length: 7 }).map((__, j) => (
                        <td key={j}><span className="skeleton-box" style={{ height: 16, width: '100%', display: 'block' }} /></td>
                      ))}
                    </tr>
                  ))
                : isError
                  ? (
                      <tr>
                        <td colSpan={7} style={{ textAlign: 'center', padding: '32px 0', color: 'var(--error-text)' }}>
                          Error al cargar las transacciones
                        </td>
                      </tr>
                    )
                  : data?.items.length === 0
                    ? (
                        <tr>
                          <td colSpan={7}>
                            <div className="empty-state">
                              <p className="empty-title">Sin transacciones</p>
                              <p className="empty-sub">No hay transacciones B2B que coincidan con estos filtros.</p>
                            </div>
                          </td>
                        </tr>
                      )
                    : data?.items.map((t) => {
                        const badge = ESTADO_TRANSACCION_BADGE[t.estado]
                        const reintentando = reintentarMutation.isPending && reintentarMutation.variables === t.transaccionUid
                        return (
                          <tr
                            key={t.transaccionUid}
                            className="table-row-clickable"
                            onClick={() => navigate(`/relaciones-comerciales/transacciones/${t.transaccionUid}`)}
                          >
                            <td>
                              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                                {t.direccion === 'Entrante' ? <ArrowDownLeft size={14} /> : <ArrowUpRight size={14} />}
                                {t.direccion}
                              </span>
                            </td>
                            <td>{t.tipo}</td>
                            <td>{t.contraparte.nombre}</td>
                            <td>
                              {t.documentoOrigen ? (
                                <div>
                                  <div style={{ fontWeight: 500 }}>{t.documentoOrigen.name}</div>
                                  <div className="td-muted" style={{ fontSize: 12 }}>
                                    {t.documentoOrigen.ncf ? `${t.documentoOrigen.ncf} · ` : ''}
                                    {formatDate(t.documentoOrigen.fecha)} · {formatDOP(t.documentoOrigen.total)}
                                  </div>
                                </div>
                              ) : <span className="td-muted">—</span>}
                            </td>
                            <td>
                              <Badge variant={badge.variant}>{badge.label}</Badge>
                              {t.motivoEstado && (
                                <div className="td-muted" style={{ fontSize: 12, marginTop: 4, maxWidth: 260 }}>{t.motivoEstado}</div>
                              )}
                            </td>
                            <td>{formatDateTime(t.creation)}</td>
                            <td onClick={(e) => e.stopPropagation()}>
                              <div style={{ display: 'flex', gap: 6 }}>
                                {t.estado === 'Error' && puedeReenviar && (
                                  <button
                                    type="button"
                                    className="btn btn-ghost btn-size-xs"
                                    disabled={reintentando}
                                    onClick={() => reintentarMutation.mutate(t.transaccionUid)}
                                  >
                                    <RotateCw size={12} /> Reintentar
                                  </button>
                                )}
                                {t.estado === 'Pendiente de entrega' && puedeReenviar && (
                                  <button
                                    type="button"
                                    className="btn btn-ghost btn-size-xs"
                                    onClick={() => setCancelTarget(t.transaccionUid)}
                                  >
                                    <Ban size={12} /> Cancelar
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        )
                      })}
            </tbody>
          </table>
        </div>

        {data && data.meta.total > PAGE_SIZE && (
          <div className="pagination">
            <span className="pagination-info">
              Mostrando {offset + 1}–{Math.min(offset + PAGE_SIZE, data.meta.total)} de {data.meta.total}
            </span>
            <div className="pagination-controls">
              <button className="btn btn-ghost btn-size-icon-sm" disabled={page === 1} onClick={() => setPage((p) => p - 1)}>
                <ChevronLeft size={14} />
              </button>
              <span style={{ fontSize: 12, color: 'var(--text-secondary)', padding: '0 8px' }}>{page} / {totalPages}</span>
              <button className="btn btn-ghost btn-size-icon-sm" disabled={!data.meta.hasMore} onClick={() => setPage((p) => p + 1)}>
                <ChevronRight size={14} />
              </button>
            </div>
          </div>
        )}
      </div>

      <ConfirmModal
        open={!!cancelTarget}
        onClose={() => setCancelTarget(null)}
        onConfirm={() => cancelTarget && cancelarMutation.mutate(cancelTarget)}
        title="Cancelar envío"
        description="¿Confirmas cancelar el envío de esta transacción? Solo se puede cancelar mientras el destino no haya respondido."
        confirmLabel="Cancelar envío"
        variant="danger"
        loading={cancelarMutation.isPending}
      />
    </div>
  )
}
