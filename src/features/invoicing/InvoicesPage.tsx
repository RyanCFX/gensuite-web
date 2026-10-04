import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { RecargarButton } from '@/components/shared/RecargarButton'
import { listInvoices } from '@/shared/api/invoices'
import type { ListInvoicesParams } from '@/shared/api/invoices'
import { Plus, Eye, GitBranch, SlidersHorizontal } from 'lucide-react'
import { formatDate, formatDOP, displayId } from '@/lib/formatters'
import { useSortState } from '@/shared/hooks/useSortState'
import { SortableTh } from '@/shared/ui/SortableTh'
import { Select, SelectItem } from '@/components/ui/select'
import { SearchSelect } from '@/shared/ui/SearchSelect'
import type { SearchSelectOption } from '@/shared/ui/SearchSelect'
import { OpcionesSelect } from '@/shared/ui/OpcionesSelect'
import { useFiltrosPantalla } from '@/shared/permissions/useAcceso'
import { DatePicker } from '@/shared/ui/DatePicker'
import { FilterField } from '@/shared/ui/FilterField'
import { Drawer } from '@/shared/ui/Drawer'
import { usePermissionsStore } from '@/stores/permissions.store'
import { EstadoArsBadge } from './EstadoArsBadge'
import type { EstadoArs } from '@/shared/api/types'
import { useResizableColumns } from '@/shared/hooks/useResizableColumns'
import { usePuede } from '@/shared/permissions/can'
import { useFiltroQuery } from '@/shared/hooks/useFiltroQuery'
import { SearchInput } from '@/shared/ui/SearchInput'
import { getCatalogosFiscalesLookup } from '@/shared/api/formularios'

type StatusFilter = 'draft' | 'submitted' | 'cancelled' | 'all'
type EstadoArsFilter = EstadoArs | 'all' | 'sinLote'
type PaymentFilter = 'paid' | 'unpaid' | 'partly_paid' | 'all'

const STATUS_BADGE: Record<string, string> = {
  draft: 'badge-draft',
  submitted: 'badge-submitted',
  cancelled: 'badge-cancelled',
}
const STATUS_LABEL: Record<string, string> = {
  draft: 'Borrador',
  submitted: 'Sometido',
  cancelled: 'Cancelado',
}

const PAYMENT_BADGE: Record<string, string> = {
  unpaid: 'badge-warning',
  partly_paid: 'badge-info',
  paid: 'badge-success',
  overdue: 'badge-error',
}
const PAYMENT_LABEL: Record<string, string> = {
  unpaid: 'Pendiente',
  partly_paid: 'Pago parcial',
  paid: 'Pagado',
  overdue: 'Vencido',
}

export default function InvoicesPage() {
  const puedeCrear = usePuede('ventas.factura.crear')
  const navigate = useNavigate()
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState<StatusFilter>('all')
  const [paymentStatus, setPaymentStatus] = useState<PaymentFilter>('all')
  const [ncfType, setNcfType] = useState('')
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')
  const [branch, setBranch] = useState('')
  const [ncf, setNcf] = useState('')
  const [grandTotalMin, setGrandTotalMin] = useState('')
  const [grandTotalMax, setGrandTotalMax] = useState('')
  const [moreFiltersOpen, setMoreFiltersOpen] = useState(false)
  const { orderBy, sort } = useSortState()

  // ── Filtros del vertical farmacia (docs/PROMPT_FARMACIA_V2_FRONTEND.md §3.8) ────────────────
  const esFarmacia = usePermissionsStore((s) => s.vertical) === 'farmacia'
  const [aseguradora, setAseguradora] = useState('')
  const [aseguradoraLabel, setAseguradoraLabel] = useState('')
  // Filtros protegidos v2 (prompt Permisos v2 §3.3): pantalla `ventas.factura` (gate
  // `ventas.factura.listar` sin el último segmento). Los controles bloqueados se esconden
  // y los params se sanean antes de llamar al API (nunca se mandan).
  const filtros = useFiltrosPantalla('ventas.factura')
  const [estadoArs, setEstadoArs] = useState<EstadoArsFilter>('all')

  const rawParams: ListInvoicesParams = {
    search: search || undefined,
    status: status === 'all' ? undefined : status,
    paymentStatus: paymentStatus === 'all' ? undefined : paymentStatus,
    ncfType: ncfType || undefined,
    fromDate: fromDate || undefined,
    toDate: toDate || undefined,
    branch: branch || undefined,
    ncf: ncf || undefined,
    grandTotalMin: grandTotalMin !== '' ? Number(grandTotalMin) : undefined,
    grandTotalMax: grandTotalMax !== '' ? Number(grandTotalMax) : undefined,
    orderBy: orderBy || undefined,
    limit: 50,
    // `sinLote` y `estadoArs` son mutuamente excluyentes en la UI: "Sin lote" ya implica
    // "con cobertura y todavía sin lote", así que no se manda también un estadoArs.
    ...(esFarmacia
      ? {
          aseguradora: aseguradora || undefined,
          estadoArs: estadoArs !== 'all' && estadoArs !== 'sinLote' ? estadoArs : undefined,
          sinLote: estadoArs === 'sinLote' ? true : undefined,
        }
      : {}),
  }

  // Los bloqueados nunca se mandan (aunque vengan con valor por defecto o URL compartida).
  const { limpios: params } = filtros.sanear(rawParams)

  const { data, isLoading } = useQuery({
    queryKey: ['invoices', params],
    queryFn: () => listInvoices(params),
  })

  const { data: catalogos, bloqueado: catalogosBloqueado } = useFiltroQuery({
    queryKey: ['catalogos-fiscales', { type: 'venta' }],
    queryFn: () => getCatalogosFiscalesLookup({ type: 'venta' }),
    staleTime: 60 * 60_000,
    // Solo alimenta el filtro "Tipo NCF" del modal de más filtros.
    enabled: moreFiltersOpen,
  })
  const [ncfTypeSearch, setNcfTypeSearch] = useState('')
  const ncfTypeOptions: SearchSelectOption[] = (catalogos?.ncfTypes ?? [])
    .filter((t) => !ncfTypeSearch || t.label.toLowerCase().includes(ncfTypeSearch.toLowerCase()))
    .map((t) => ({ value: t.value, label: t.label }))

  const invoices = data?.items ?? []
  /** 9 columnas base + "Estado ARS" en tenants de farmacia. */
  const columnCount = esFarmacia ? 10 : 9

  const COLUMNS = [
    { key: 'id', width: 100 },
    { key: 'cliente', width: 180 },
    { key: 'fecha', width: 100 },
    { key: 'vence', width: 100 },
    { key: 'ncf', width: 120 },
    { key: 'total', width: 120 },
    { key: 'pendiente', width: 120 },
    { key: 'estado', width: 120 },
    ...(esFarmacia ? [{ key: 'estadoArs', width: 120 }] : []),
    { key: 'ver', width: 64 },
  ]
  const { widths: colWidths, startResize } = useResizableColumns(COLUMNS)

  const activeMoreFiltersCount = [ncfType, fromDate, toDate, ncf, grandTotalMin, grandTotalMax].filter((v) => v !== '').length

  function clearMoreFilters() {
    setNcfType('')
    setFromDate('')
    setToDate('')
    setNcf('')
    setGrandTotalMin('')
    setGrandTotalMax('')
  }

  function statusBadge(inv: { status: string; paymentStatus?: string | null; isPos?: boolean | null }) {
    if (inv.status === 'submitted') {
      // isPos ya no implica pago completo (módulo POS permite turno + pago parcial) —
      // solo se etiqueta "Contado" cuando paymentStatus confirma que no queda saldo pendiente.
      if (inv.isPos && inv.paymentStatus === 'paid') {
        return <span className="badge badge-pos">Contado</span>
      }
      if (inv.paymentStatus) {
        return (
          <span className={`badge ${PAYMENT_BADGE[inv.paymentStatus] ?? 'badge-neutral'}`}>
            {PAYMENT_LABEL[inv.paymentStatus] ?? inv.paymentStatus}
          </span>
        )
      }
      return <span className="badge badge-submitted">Sometido</span>
    }
    return (
      <span className={`badge ${STATUS_BADGE[inv.status] ?? 'badge-neutral'}`}>
        {STATUS_LABEL[inv.status] ?? inv.status}
      </span>
    )
  }

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h1 className="page-title"><span className="page-title-dot" />Facturas</h1>
          <p className="page-sub">Gestiona tus facturas de venta y comprobantes fiscales</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          <RecargarButton />
          {puedeCrear && (
            <button className="btn btn-navy" onClick={() => navigate('/facturas/nueva')}>
              <Plus size={16} />
              Nueva Factura
            </button>
          )}
        </div>
      </div>

      <div className="card filter-card-navy" style={{ marginBottom: 20 }}>
        <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="filter-bar" style={{ margin: 0 }}>
            <div className="filter-bar-left">
              <FilterField label="Buscar por cliente">
                <SearchInput placeholder="Cliente" value={search} onChange={(v) => setSearch(v)} />
              </FilterField>
              {filtros.puedeFiltrar('status') && (
              <FilterField label="Estado">
                <Select value={status} onValueChange={(val) => setStatus(val as StatusFilter)}>
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="draft">Borrador</SelectItem>
                  <SelectItem value="submitted">Sometido</SelectItem>
                  <SelectItem value="cancelled">Cancelado</SelectItem>
                </Select>
              </FilterField>
              )}
              {filtros.puedeFiltrar('paymentStatus') && (
              <FilterField label="Estado de pago">
                <Select value={paymentStatus} onValueChange={(val) => setPaymentStatus(val as PaymentFilter)}>
                  <SelectItem value="all">Todo estado pago</SelectItem>
                  <SelectItem value="unpaid">Pendiente</SelectItem>
                  <SelectItem value="partly_paid">Parcial</SelectItem>
                  <SelectItem value="paid">Pagado</SelectItem>
                </Select>
              </FilterField>
              )}
              {filtros.puedeFiltrar('branch') && (
              <OpcionesSelect hideOnForbidden filterLabel="Sucursal" filterStyle={{ width: 200 }}
                  recurso="sucursales"
                  value={branch}
                  onChange={setBranch}
                  placeholder="Todas las sucursales"
                  selectedLabel={branch}
                />
              )}
              {esFarmacia && filtros.puedeFiltrar('aseguradora') && (
                <>
                  <OpcionesSelect hideOnForbidden filterLabel="Aseguradora" filterStyle={{ width: 200 }}
                      recurso="aseguradoras"
                      value={aseguradora}
                      selectedLabel={aseguradoraLabel}
                      onChange={(val, opt) => { setAseguradora(val); setAseguradoraLabel(opt?.label ?? '') }}
                      placeholder="Todas las ARS"
                    />
                  {filtros.puedeFiltrar('estadoArs') && (
                  <FilterField label="Estado ARS">
                    <Select value={estadoArs} onValueChange={(val) => setEstadoArs(val as EstadoArsFilter)}>
                      <SelectItem value="all">Todo estado ARS</SelectItem>
                      <SelectItem value="Pendiente">Pendiente</SelectItem>
                      <SelectItem value="En Lote">En Lote</SelectItem>
                      <SelectItem value="Facturado">Facturado</SelectItem>
                      <SelectItem value="Anulada">Anulada</SelectItem>
                      <SelectItem value="sinLote">Con cobertura, sin lote</SelectItem>
                    </Select>
                  </FilterField>
                  )}
                </>
              )}

              <button type="button" className="btn btn-secondary btn-size-sm" onClick={() => setMoreFiltersOpen(true)}>
                <SlidersHorizontal size={13} />
                Más filtros
                {activeMoreFiltersCount > 0 && (
                  <span className="badge badge-brand" style={{ marginLeft: 2 }}>{activeMoreFiltersCount}</span>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="card navy-table-card">
      <div className="table-scroll">
        <table className="data-table navy-table items-table-resizable">
          <colgroup>
            {COLUMNS.map((c) => <col key={c.key} style={{ width: colWidths[c.key] }} />)}
          </colgroup>
          <thead>
            <tr>
              <SortableTh
                label="#"
                sortKey="id"
                orderBy={orderBy}
                onSort={sort}
                resizeHandle={<span className="col-resize-handle" onMouseDown={startResize('id')} />}
              />
              <SortableTh
                label="Cliente"
                sortKey="customerName"
                orderBy={orderBy}
                onSort={sort}
                resizeHandle={<span className="col-resize-handle" onMouseDown={startResize('cliente')} />}
              />
              <SortableTh
                label="Fecha"
                sortKey="postingDate"
                orderBy={orderBy}
                onSort={sort}
                resizeHandle={<span className="col-resize-handle" onMouseDown={startResize('fecha')} />}
              />
              <th>
                Vence
                <span className="col-resize-handle" onMouseDown={startResize('vence')} />
              </th>
              <th>
                NCF
                <span className="col-resize-handle" onMouseDown={startResize('ncf')} />
              </th>
              <SortableTh
                label="Total"
                sortKey="grandTotal"
                orderBy={orderBy}
                onSort={sort}
                align="right"
                resizeHandle={<span className="col-resize-handle" onMouseDown={startResize('total')} />}
              />
              <th style={{ textAlign: 'right' }}>
                Pendiente
                <span className="col-resize-handle" onMouseDown={startResize('pendiente')} />
              </th>
              <SortableTh
                label="Estado"
                sortKey="status"
                orderBy={orderBy}
                onSort={sort}
                resizeHandle={<span className="col-resize-handle" onMouseDown={startResize('estado')} />}
              />
              {esFarmacia && (
                <th>
                  Estado ARS
                  <span className="col-resize-handle" onMouseDown={startResize('estadoArs')} />
                </th>
              )}
              <th style={{ textAlign: 'right' }}>Ver</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              Array.from({ length: 6 }).map((_, i) => (
                <tr key={i}>
                  {Array.from({ length: columnCount }).map((__, j) => (
                    <td key={j}><div className="skeleton-box" style={{ height: 14, width: '100%' }} /></td>
                  ))}
                </tr>
              ))
            ) : invoices.length === 0 ? (
              <tr>
                <td colSpan={columnCount}>
                  <div className="empty-state">
                    <div className="empty-title">Sin facturas</div>
                    <p className="empty-sub">Crea tu primera factura para comenzar.</p>
                    {puedeCrear && (
                      <button className="btn btn-navy btn-size-sm" onClick={() => navigate('/facturas/nueva')}>
                        <Plus size={14} /> Nueva Factura
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ) : (
              invoices.map((inv) => (
                <tr
                  key={inv.id}
                  className="table-row-clickable"
                  onClick={() => navigate(`/facturas/${inv.id}`)}
                >
                  <td className="td-muted" style={{ fontFamily: 'var(--font-body)', fontSize: 12 }}>
                    {inv.amendedFrom && <GitBranch size={12} style={{ verticalAlign: 'middle', marginRight: 4, color: 'var(--text-tertiary)' }} />}
                    {displayId(inv.id, inv.sequence)}
                  </td>
                  <td style={{ fontWeight: 500 }}>{inv.customerName}</td>
                  <td>{formatDate(inv.postingDate)}</td>
                  <td>{formatDate(inv.dueDate)}</td>
                  <td>
                    {inv.ncf
                      ? <span style={{ fontFamily: 'var(--font-body)', fontSize: 12 }}>{inv.ncf}</span>
                      : inv.ncfType
                        ? <span className="badge badge-neutral" style={{ fontSize: 11 }}>{inv.ncfType}</span>
                        : <span className="td-dim">—</span>}
                  </td>
                  <td style={{ textAlign: 'right', fontWeight: 500 }}>{formatDOP(inv.grandTotal)}</td>
                  <td style={{ textAlign: 'right' }}>{formatDOP(inv.outstandingAmount)}</td>
                  <td>{statusBadge(inv)}</td>
                  {esFarmacia && (
                    <td>
                      {inv.aseguradora?.estadoArs
                        ? <EstadoArsBadge estado={inv.aseguradora.estadoArs} />
                        : <span className="td-dim">—</span>}
                    </td>
                  )}
                  <td style={{ textAlign: 'right' }}>
                    <button
                      className="btn btn-ghost btn-size-icon-sm"
                      onClick={(e) => { e.stopPropagation(); navigate(`/facturas/${inv.id}`) }}
                    >
                      <Eye size={15} />
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      </div>

      {data?.meta && (
        <div className="pagination">
          <span className="pagination-info">
            Mostrando {invoices.length} de {data.meta.total} facturas
          </span>
        </div>
      )}

      <Drawer
        open={moreFiltersOpen}
        onClose={() => setMoreFiltersOpen(false)}
        title="Más filtros"
        subtitle="Refina la búsqueda de facturas"
        footer={
          <>
            <button className="btn btn-ghost" onClick={clearMoreFilters}>Limpiar</button>
            <button className="btn btn-navy" onClick={() => setMoreFiltersOpen(false)}>Aplicar</button>
          </>
        }
      >
        {filtros.puedeFiltrar('ncfType') && !catalogosBloqueado && (
        <div className="ff-wrap">
          <label className="ff-label">Tipo NCF</label>
          <SearchSelect
            value={ncfType}
            onChange={setNcfType}
            options={ncfTypeOptions}
            onSearch={setNcfTypeSearch}
            selectedLabel={catalogos?.ncfTypes?.find((t) => t.value === ncfType)?.label ?? ''}
            placeholder="Todos los tipos NCF"
          />
        </div>
        )}

        {(filtros.puedeFiltrar('fromDate') || filtros.puedeFiltrar('toDate')) && (
        <div className="ff-wrap">
          <label className="ff-label">Fecha</label>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <DatePicker className="ff-input" value={fromDate} onChange={setFromDate} clearable />
            <span style={{ color: 'var(--text-secondary)', fontSize: 13 }}>—</span>
            <DatePicker className="ff-input" value={toDate} onChange={setToDate} clearable />
          </div>
        </div>
        )}

        {filtros.puedeFiltrar('ncf') && (
        <div className="ff-wrap">
          <label className="ff-label">NCF</label>
          <input
            className="ff-input"
            placeholder="Buscar NCF…"
            value={ncf}
            onChange={(e) => setNcf(e.target.value)}
          />
        </div>
        )}

        {(filtros.puedeFiltrar('grandTotalMin') || filtros.puedeFiltrar('grandTotalMax')) && (
        <div className="ff-wrap">
          <label className="ff-label">Total</label>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input
              type="number"
              className="ff-input"
              placeholder="Total mín."
              value={grandTotalMin}
              onChange={(e) => setGrandTotalMin(e.target.value)}
            />
            <span style={{ color: 'var(--text-secondary)', fontSize: 13 }}>—</span>
            <input
              type="number"
              className="ff-input"
              placeholder="Total máx."
              value={grandTotalMax}
              onChange={(e) => setGrandTotalMax(e.target.value)}
            />
          </div>
        </div>
        )}
      </Drawer>
    </div>
  )
}
