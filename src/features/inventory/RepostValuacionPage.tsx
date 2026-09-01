// Herramienta administrativa (System Manager / Accounts Manager): encola el recálculo nativo de
// ERPNext de la cola de valuación (FIFO/Moving Average) de un artículo — repara una tasa de costo
// corrupta (ej. negativa) que bloquea devoluciones o compras posteriores. El trabajo se procesa en
// segundo plano en ERPNext (puede tardar minutos) — esta pantalla solo encola y hace seguimiento,
// no espera a que termine. Fuera del flujo normal de inventario a propósito (ver Config → esta
// pantalla) — no es algo que un usuario de negocio deba tocar en el día a día.

import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { RefreshCw, ChevronLeft, ChevronRight, Wrench, ExternalLink, AlertTriangle } from 'lucide-react'
import { createRepostValuacion, listRepostsValuacion, listWarehouses } from '@/shared/api/inventory'
import type { RepostValuacionItem, RepostValuacionStatus, ApiError, Item } from '@/shared/api/types'
import { PageHeader } from '@/components/shared/PageHeader'
import { ItemSelect } from '@/shared/ui/ItemSelect'
import { SearchSelect } from '@/shared/ui/SearchSelect'
import type { SearchSelectOption } from '@/shared/ui/SearchSelect'
import { DatePicker } from '@/shared/ui/DatePicker'
import { formatDateTime, formatDate } from '@/lib/formatters'

const PAGE_SIZE = 20

const STATUS_BADGE: Record<RepostValuacionStatus, string> = {
  Queued: 'badge-neutral',
  'In Progress': 'badge-info',
  Completed: 'badge-success',
  Skipped: 'badge-error',
  Failed: 'badge-error',
}

const STATUS_LABEL: Record<RepostValuacionStatus, string> = {
  Queued: 'En cola',
  'In Progress': 'En progreso',
  Completed: 'Completado',
  Skipped: 'Omitido',
  Failed: 'Falló',
}

export default function RepostValuacionPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  // ── Formulario ──────────────────────────────────────────────────────────
  const [itemCode, setItemCode] = useState('')
  const [itemLabel, setItemLabel] = useState('')
  const [warehouse, setWarehouse] = useState('')
  const [warehouseSearch, setWarehouseSearch] = useState('')
  const [postingDate, setPostingDate] = useState('')

  const { data: warehouses } = useQuery({
    queryKey: ['warehouses'],
    queryFn: listWarehouses,
    staleTime: 5 * 60_000,
  })
  const warehouseOptions: SearchSelectOption[] = (warehouses ?? [])
    .filter((w) => !warehouseSearch || w.name.toLowerCase().includes(warehouseSearch.toLowerCase()))
    .map((w) => ({ value: w.id, label: w.name }))

  function resetForm() {
    setItemCode('')
    setItemLabel('')
    setWarehouse('')
    setPostingDate('')
  }

  const createMutation = useMutation({
    mutationFn: () => createRepostValuacion({ itemCode, warehouse: warehouse || undefined, postingDate }),
    onSuccess: (result) => {
      toast.success(result.message || 'Recálculo encolado correctamente')
      resetForm()
      queryClient.invalidateQueries({ queryKey: ['repost-valuacion'] })
    },
    onError: (err: ApiError) => {
      if (err?.statusCode === 403) {
        toast.error('No tienes permiso para esta operación — se requiere rol de administrador (System Manager o Accounts Manager).')
        return
      }
      toast.error(err?.message ?? 'No se pudo encolar el recálculo')
    },
  })

  const canSubmit = !!itemCode && !!postingDate

  // ── Seguimiento ──────────────────────────────────────────────────────────
  const [page, setPage] = useState(1)
  const offset = (page - 1) * PAGE_SIZE

  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ['repost-valuacion', offset],
    queryFn: () => listRepostsValuacion({ limit: PAGE_SIZE, offset }),
    // Trabajo de background que puede tardar minutos — un refresco espaciado (no agresivo) más
    // el botón "Actualizar" es suficiente; no tiene sentido pollear cada pocos segundos.
    refetchInterval: 45_000,
  })

  const items = data?.items ?? []
  const totalPages = data ? Math.max(1, Math.ceil(data.meta.total / PAGE_SIZE)) : 1

  return (
    <div className="page-container">
      <PageHeader
        title="Recálculo de Valuación de Inventario"
        description="Repara la cola de valuación (FIFO/Moving Average) de un artículo cuando queda corrupta por movimientos retroactivos o stock negativo — usa el mecanismo nativo de ERPNext (Repost Item Valuation). Herramienta de soporte técnico, no del flujo normal de inventario."
      />

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div className="card">
          <div className="card-header" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Wrench size={15} style={{ color: 'var(--icon-muted)' }} />
            <span className="card-title">Nuevo recálculo</span>
          </div>
          <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div className="inline-alert inline-alert-info">
              <AlertTriangle size={16} />
              Esto NO se procesa al instante — el sistema lo hace en segundo plano y puede tardar
              varios minutos. Puedes salir de esta pantalla y volver luego a revisar el progreso
              en "Recálculos recientes".
            </div>

            <div className="form-row">
              <div className="ff-wrap">
                <label className="ff-label ff-required">Artículo</label>
                <ItemSelect
                  value={itemCode}
                  selectedLabel={itemLabel}
                  onSelect={(item: Item) => { setItemCode(item.id); setItemLabel(item.itemName) }}
                  onClear={() => { setItemCode(''); setItemLabel('') }}
                  placeholder="Buscar artículo por código o nombre…"
                />
              </div>
              <div className="ff-wrap">
                <label className="ff-label">Almacén</label>
                <SearchSelect
                  value={warehouse}
                  onChange={setWarehouse}
                  options={warehouseOptions}
                  onSearch={setWarehouseSearch}
                  selectedLabel={warehouses?.find((w) => w.id === warehouse)?.name ?? ''}
                  placeholder="Todos los almacenes del artículo"
                />
                <p className="ff-hint">
                  Si no eliges ninguno, ERPNext recalcula el artículo en todos los almacenes donde tiene movimientos.
                </p>
              </div>
            </div>

            <div className="ff-wrap" style={{ maxWidth: 240 }}>
              <label className="ff-label ff-required">Fecha desde la cual recalcular</label>
              <DatePicker value={postingDate} onChange={setPostingDate} clearable />
              <p className="ff-hint">
                Debe ser igual o anterior a la fecha del primer movimiento problemático de este
                artículo — una fecha posterior deja intacta la corrupción anterior a esa fecha.{' '}
                <button
                  type="button"
                  className="btn-link"
                  style={{ fontSize: 12 }}
                  onClick={() => navigate('/inventario/historial')}
                >
                  Ver historial de movimientos <ExternalLink size={11} style={{ verticalAlign: 'middle' }} />
                </button>
              </p>
            </div>

            <div>
              <button
                type="button"
                className="btn btn-primary btn-size-sm"
                onClick={() => createMutation.mutate()}
                disabled={!canSubmit || createMutation.isPending}
              >
                {createMutation.isPending && <span className="spinner" />}
                <Wrench size={14} /> Encolar recálculo
              </button>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span className="card-title">Recálculos recientes</span>
            <button
              type="button"
              className="btn btn-ghost btn-size-xs"
              onClick={() => refetch()}
              disabled={isFetching}
            >
              <RefreshCw size={12} style={isFetching ? { animation: 'spin 1s linear infinite' } : undefined} />
              Actualizar
            </button>
          </div>
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Artículo</th>
                  <th>Almacén</th>
                  <th>Estado</th>
                  <th>Progreso</th>
                  <th>Desde</th>
                  <th>Encolado</th>
                  <th style={{ width: 120 }} />
                </tr>
              </thead>
              <tbody>
                {isLoading
                  ? Array.from({ length: 5 }).map((_, i) => (
                      <tr key={i}>
                        {Array.from({ length: 7 }).map((__, j) => (
                          <td key={j}><div className="skeleton-box" style={{ height: 14, width: '100%' }} /></td>
                        ))}
                      </tr>
                    ))
                  : items.length === 0
                    ? (
                        <tr>
                          <td colSpan={7}>
                            <div className="empty-state">
                              <div className="empty-title">Sin recálculos</div>
                              <p className="empty-sub">Todavía no se ha encolado ningún recálculo de valuación.</p>
                            </div>
                          </td>
                        </tr>
                      )
                    : items.map((r: RepostValuacionItem) => (
                        <tr key={r.id}>
                          <td style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>{r.itemCode}</td>
                          <td className="td-muted">{r.warehouse ?? 'Todos'}</td>
                          <td><span className={`badge ${STATUS_BADGE[r.status]}`}>{STATUS_LABEL[r.status]}</span></td>
                          <td className="td-muted" style={{ fontSize: 12 }}>
                            {r.totalRepostingCount > 0 ? `${r.currentIndex} / ${r.totalRepostingCount}` : '—'}
                          </td>
                          <td className="td-muted">{formatDate(r.postingDate)}</td>
                          <td className="td-muted" style={{ fontSize: 12 }}>{formatDateTime(r.createdAt)}</td>
                          <td>
                            {(r.status === 'Failed' || r.status === 'Skipped') && r.errorLog && (
                              <details>
                                <summary style={{ cursor: 'pointer', fontSize: 12, color: 'var(--color-error)' }}>
                                  Ver error
                                </summary>
                                <pre style={{
                                  whiteSpace: 'pre-wrap',
                                  wordBreak: 'break-word',
                                  fontSize: 11,
                                  maxWidth: 360,
                                  marginTop: 4,
                                  padding: 8,
                                  background: 'var(--surface-sunken)',
                                  borderRadius: 'var(--radius-md)',
                                }}>
                                  {r.errorLog}
                                </pre>
                              </details>
                            )}
                          </td>
                        </tr>
                      ))}
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
                <span style={{ fontSize: 12, color: 'var(--text-secondary)', padding: '0 8px' }}>
                  {page} / {totalPages}
                </span>
                <button className="btn btn-ghost btn-size-icon-sm" disabled={!data.meta.hasMore} onClick={() => setPage((p) => p + 1)}>
                  <ChevronRight size={14} />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
