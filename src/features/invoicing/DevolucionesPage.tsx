import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { listDevoluciones } from '@/shared/api/devoluciones'
import { RecargarButton } from '@/components/shared/RecargarButton'
import { getCatalogosFiscales } from '@/shared/api/config'
import { ChevronLeft, ChevronRight, Plus, SlidersHorizontal } from 'lucide-react'
import { formatDate, formatDOP } from '@/lib/formatters'
import { useSortState } from '@/shared/hooks/useSortState'
import { SortableTh } from '@/shared/ui/SortableTh'
import { SearchSelect } from '@/shared/ui/SearchSelect'
import type { SearchSelectOption } from '@/shared/ui/SearchSelect'
import { DatePicker } from '@/shared/ui/DatePicker'
import { FilterField } from '@/shared/ui/FilterField'
import { Drawer } from '@/shared/ui/Drawer'
import { Select, SelectItem } from '@/components/ui/select'
import { useResizableColumns } from '@/shared/hooks/useResizableColumns'
import { usePuede } from '@/shared/permissions/can'
import { OpcionesSelect } from '@/shared/ui/OpcionesSelect'
import { SearchInput } from '@/shared/ui/SearchInput'

const PAGE_SIZE = 20

const COLUMNS = [
  { key: 'id', width: 100 },
  { key: 'ncf', width: 120 },
  { key: 'ncfAfectado', width: 120 },
  { key: 'facturaOriginal', width: 120 },
  { key: 'cliente', width: 180 },
  { key: 'fecha', width: 100 },
  { key: 'total', width: 120 },
  { key: 'estado', width: 110 },
]

// El shape real de la API (igual que /credit-notes) usa `returnAgainst`, no `originalInvoice`
// como dice el tipo genérico `DevolucionListItem` — ver el mismo comentario en CreditNotesPage.tsx.
interface DevolucionRow {
  id: string
  returnAgainst: string
  customerName?: string
  postingDate?: string
  grandTotal?: number
  status: string
  /** Solo viene presente tras someter la nota — en Draft llega vacío/undefined */
  ncf?: string
  /** NCF de la factura original devuelta — distinto de `ncf`, que es el propio de la nota */
  ncfAfectado?: string | null
}

// El backend devuelve el status en minúscula. Una vez Sometida, `status` deja de ser "submitted"
// y pasa a ser el resumen de uso (available/partially_used/fully_used) — mismo patrón que Notas de Crédito.
const STATUS_BADGE: Record<string, string> = {
  draft: 'badge-draft',
  submitted: 'badge-submitted',
  cancelled: 'badge-cancelled',
  available: 'badge-success',
  partially_used: 'badge-warning',
  fully_used: 'badge-neutral',
}
const STATUS_LABEL: Record<string, string> = {
  draft: 'Borrador',
  submitted: 'Sometido',
  cancelled: 'Cancelado',
  available: 'Disponible',
  partially_used: 'Parcialmente usada',
  fully_used: 'Agotada',
}

export default function DevolucionesPage() {
  const puedeCrear = usePuede('ventas.devolucion.crear')
  const navigate = useNavigate()

  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [branch, setBranch] = useState('')
  const [department, setDepartment] = useState('')
  const [status, setStatus] = useState('all')
  const [createdAtFrom, setCreatedAtFrom] = useState('')
  const [createdAtTo, setCreatedAtTo] = useState('')
  const [postingDateFrom, setPostingDateFrom] = useState('')
  const [postingDateTo, setPostingDateTo] = useState('')
  const [ncf, setNcf] = useState('')
  const [ncfType, setNcfType] = useState('')
  const [grandTotalMin, setGrandTotalMin] = useState('')
  const [grandTotalMax, setGrandTotalMax] = useState('')
  const [refundedAmountMin, setRefundedAmountMin] = useState('')
  const [refundedAmountMax, setRefundedAmountMax] = useState('')
  const [moreFiltersOpen, setMoreFiltersOpen] = useState(false)
  const { orderBy, sort } = useSortState()
  const { widths: colWidths, startResize } = useResizableColumns(COLUMNS)

  // ── Filtro por cliente (autocomplete real, mismo patrón que CreditNotesPage) ──
  const [customerId, setCustomerId] = useState('')
  const [customerLabel, setCustomerLabel] = useState('')

  const { data: catalogos } = useQuery({
    queryKey: ['catalogos-fiscales', { type: 'venta' }],
    queryFn: () => getCatalogosFiscales({ type: 'venta' }),
  })
  const [ncfTypeSearch, setNcfTypeSearch] = useState('')
  const ncfTypeOptions: SearchSelectOption[] = (catalogos?.ncfTypes ?? [])
    .filter((t) => !ncfTypeSearch || t.label.toLowerCase().includes(ncfTypeSearch.toLowerCase()))
    .map((t) => ({ value: t.value, label: t.label }))

  const debouncedSearch = search
  const offset = (page - 1) * PAGE_SIZE





  const { data, isLoading, isError } = useQuery({
    queryKey: [
      'devoluciones',
      {
        search: debouncedSearch, offset, orderBy, branch, department, customerId, status,
        createdAtFrom, createdAtTo, postingDateFrom, postingDateTo,
        ncf, ncfType, grandTotalMin, grandTotalMax, refundedAmountMin, refundedAmountMax,
      },
    ],
    queryFn: () =>
      listDevoluciones({
        search: debouncedSearch || undefined,
        limit: PAGE_SIZE,
        offset,
        orderBy: orderBy || undefined,
        branch: branch || undefined,
        department: department || undefined,
        customer: customerId || undefined,
        status: status === 'all' ? undefined : status,
        createdAtFrom: createdAtFrom || undefined,
        createdAtTo: createdAtTo || undefined,
        postingDateFrom: postingDateFrom || undefined,
        postingDateTo: postingDateTo || undefined,
        ncf: ncf || undefined,
        ncfType: ncfType || undefined,
        grandTotalMin: grandTotalMin ? Number(grandTotalMin) : undefined,
        grandTotalMax: grandTotalMax ? Number(grandTotalMax) : undefined,
        refundedAmountMin: refundedAmountMin ? Number(refundedAmountMin) : undefined,
        refundedAmountMax: refundedAmountMax ? Number(refundedAmountMax) : undefined,
      }),
  })


  const totalPages = data ? Math.ceil(data.meta.total / PAGE_SIZE) : 1

  const activeMoreFiltersCount = [
    ncf, ncfType, createdAtFrom, createdAtTo, postingDateFrom, postingDateTo,
    grandTotalMin, grandTotalMax, refundedAmountMin, refundedAmountMax,
  ].filter((v) => v !== '').length

  function clearMoreFilters() {
    setNcf('')
    setNcfType('')
    setCreatedAtFrom('')
    setCreatedAtTo('')
    setPostingDateFrom('')
    setPostingDateTo('')
    setGrandTotalMin('')
    setGrandTotalMax('')
    setRefundedAmountMin('')
    setRefundedAmountMax('')
    setPage(1)
  }

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h1 className="page-title"><span className="page-title-dot" />Devoluciones</h1>
          {data && <p className="page-sub">{data.meta.total} devoluciones en total</p>}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          <RecargarButton />
          {puedeCrear && (
            <button className="btn btn-navy" onClick={() => navigate('/devoluciones/nueva')}>
              <Plus size={16} />
              Nueva Devolución
            </button>
          )}
        </div>
      </div>

      <div className="card filter-card-navy" style={{ marginBottom: 20 }}>
        <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="filter-bar" style={{ margin: 0 }}>
            <div className="filter-bar-left">
              <SearchInput placeholder="Buscar por cliente, NCF…" value={search} onChange={(v) => {
    setSearch(v)
    setPage(1)
  }} />
              <OpcionesSelect hideOnForbidden filterLabel="Cliente" filterStyle={{ width: 220 }} recurso="clientes" value={customerId} onChange={(val, opt) => { setCustomerId(val); setCustomerLabel(opt?.label ?? ''); setPage(1) }} selectedLabel={customerLabel} placeholder="Filtrar por cliente…" minChars={2} />
              <OpcionesSelect hideOnForbidden filterLabel="Sucursal" filterStyle={{ width: 200 }} recurso="sucursales" value={branch} onChange={(val) => { setBranch(val); setPage(1) }} placeholder="Todas las sucursales" />
              <OpcionesSelect hideOnForbidden filterLabel="Departamento" filterStyle={{ width: 200 }} recurso="departamentos" value={department} onChange={(val) => { setDepartment(val); setPage(1) }} placeholder="Todos los departamentos" />
              <FilterField label="Estado">
                <Select
                  value={status}
                  onValueChange={(val) => { setStatus(val); setPage(1) }}
                >
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="draft">Borrador</SelectItem>
                  <SelectItem value="submitted">Sometido</SelectItem>
                  <SelectItem value="cancelled">Cancelado</SelectItem>
                </Select>
              </FilterField>

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
                onSort={(k) => { sort(k); setPage(1) }}
                resizeHandle={<span className="col-resize-handle" onMouseDown={startResize('id')} />}
              />
              <th>
                NCF
                <span className="col-resize-handle" onMouseDown={startResize('ncf')} />
              </th>
              <th>
                NCF Afectado
                <span className="col-resize-handle" onMouseDown={startResize('ncfAfectado')} />
              </th>
              <th>
                Factura Original
                <span className="col-resize-handle" onMouseDown={startResize('facturaOriginal')} />
              </th>
              <SortableTh
                label="Cliente"
                sortKey="customerName"
                orderBy={orderBy}
                onSort={(k) => { sort(k); setPage(1) }}
                resizeHandle={<span className="col-resize-handle" onMouseDown={startResize('cliente')} />}
              />
              <SortableTh
                label="Fecha"
                sortKey="postingDate"
                orderBy={orderBy}
                onSort={(k) => { sort(k); setPage(1) }}
                resizeHandle={<span className="col-resize-handle" onMouseDown={startResize('fecha')} />}
              />
              <SortableTh
                label="Total"
                sortKey="grandTotal"
                orderBy={orderBy}
                onSort={(k) => { sort(k); setPage(1) }}
                align="right"
                resizeHandle={<span className="col-resize-handle" onMouseDown={startResize('total')} />}
              />
              <SortableTh
                label="Estado"
                sortKey="status"
                orderBy={orderBy}
                onSort={(k) => { sort(k); setPage(1) }}
                resizeHandle={<span className="col-resize-handle" onMouseDown={startResize('estado')} />}
              />
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              Array.from({ length: 6 }).map((_, i) => (
                <tr key={i}>
                  {Array.from({ length: 8 }).map((__, j) => (
                    <td key={j}><div className="skeleton-box" style={{ height: 14, width: '100%' }} /></td>
                  ))}
                </tr>
              ))
            ) : isError ? (
              <tr>
                <td colSpan={8} style={{ textAlign: 'center', padding: '32px 0', color: 'var(--color-error)' }}>
                  Error al cargar las devoluciones
                </td>
              </tr>
            ) : data?.items.length === 0 ? (
              <tr>
                <td colSpan={8}>
                  <div className="empty-state">
                    <div className="empty-title">Sin devoluciones</div>
                    <p className="empty-sub">Las devoluciones se crean desde el detalle de una factura sometida.</p>
                  </div>
                </td>
              </tr>
            ) : (
              (data?.items as unknown as DevolucionRow[] | undefined)?.map((devolucion) => {
                const statusLower = (devolucion.status ?? '').toLowerCase()
                return (
                  <tr
                    key={devolucion.id}
                    className="table-row-clickable"
                    onClick={() => navigate(`/devoluciones/${devolucion.id}`)}
                  >
                    <td className="td-muted" style={{ fontFamily: 'var(--font-body)', fontSize: 12 }}>
                      {devolucion.id}
                    </td>
                    <td style={{ fontFamily: 'var(--font-body)', fontSize: 12 }}>
                      {devolucion.ncf ?? <span className="td-dim">Pendiente</span>}
                    </td>
                    <td style={{ fontFamily: 'var(--font-body)', fontSize: 12 }}>
                      {devolucion.ncfAfectado ?? <span className="td-dim">—</span>}
                    </td>
                    <td style={{ fontFamily: 'var(--font-body)', fontSize: 12 }}>{devolucion.returnAgainst}</td>
                    <td>{devolucion.customerName ?? '—'}</td>
                    <td>{formatDate(devolucion.postingDate)}</td>
                    <td style={{ textAlign: 'right', fontWeight: 500 }}>{formatDOP(Math.abs(devolucion.grandTotal ?? 0))}</td>
                    <td>
                      <span className={`badge ${STATUS_BADGE[statusLower] ?? 'badge-neutral'}`}>
                        {STATUS_LABEL[statusLower] ?? devolucion.status}
                      </span>
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>
      </div>

      {data && data.meta.total > PAGE_SIZE && (
        <div className="pagination">
          <span className="pagination-info">
            Mostrando {offset + 1}–{Math.min(offset + PAGE_SIZE, data.meta.total)} de {data.meta.total}
          </span>
          <div className="pagination-controls">
            <button
              className="btn btn-ghost btn-size-icon-sm"
              disabled={page === 1}
              onClick={() => setPage((p) => p - 1)}
            >
              <ChevronLeft size={16} />
            </button>
            <span style={{ fontSize: 13 }}>Página {page} de {totalPages}</span>
            <button
              className="btn btn-ghost btn-size-icon-sm"
              disabled={!data.meta.hasMore}
              onClick={() => setPage((p) => p + 1)}
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      )}

      <Drawer
        open={moreFiltersOpen}
        onClose={() => setMoreFiltersOpen(false)}
        title="Más filtros"
        subtitle="Refina la búsqueda de devoluciones"
        footer={
          <>
            <button className="btn btn-ghost" onClick={clearMoreFilters}>Limpiar</button>
            <button className="btn btn-navy" onClick={() => setMoreFiltersOpen(false)}>Aplicar</button>
          </>
        }
      >
        <div className="ff-wrap">
          <label className="ff-label">NCF</label>
          <input
            className="ff-input"
            placeholder="Buscar NCF…"
            value={ncf}
            onChange={(e) => { setNcf(e.target.value); setPage(1) }}
          />
        </div>

        <div className="ff-wrap">
          <label className="ff-label">Tipo NCF</label>
          <SearchSelect
            value={ncfType}
            onChange={(val) => { setNcfType(val); setPage(1) }}
            options={ncfTypeOptions}
            onSearch={setNcfTypeSearch}
            selectedLabel={catalogos?.ncfTypes?.find((t) => t.value === ncfType)?.label ?? ''}
            placeholder="Todos los tipos NCF"
          />
        </div>

        <div className="ff-wrap">
          <label className="ff-label">Fecha de creación</label>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <DatePicker className="ff-input" value={createdAtFrom} onChange={(v) => { setCreatedAtFrom(v); setPage(1) }} clearable />
            <span style={{ color: 'var(--text-secondary)', fontSize: 13 }}>—</span>
            <DatePicker className="ff-input" value={createdAtTo} onChange={(v) => { setCreatedAtTo(v); setPage(1) }} clearable />
          </div>
        </div>

        <div className="ff-wrap">
          <label className="ff-label">Fecha de emisión</label>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <DatePicker className="ff-input" value={postingDateFrom} onChange={(v) => { setPostingDateFrom(v); setPage(1) }} clearable />
            <span style={{ color: 'var(--text-secondary)', fontSize: 13 }}>—</span>
            <DatePicker className="ff-input" value={postingDateTo} onChange={(v) => { setPostingDateTo(v); setPage(1) }} clearable />
          </div>
        </div>

        <div className="ff-wrap">
          <label className="ff-label">Total</label>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input
              type="number"
              className="ff-input"
              placeholder="Total mín."
              value={grandTotalMin}
              onChange={(e) => { setGrandTotalMin(e.target.value); setPage(1) }}
            />
            <span style={{ color: 'var(--text-secondary)', fontSize: 13 }}>—</span>
            <input
              type="number"
              className="ff-input"
              placeholder="Total máx."
              value={grandTotalMax}
              onChange={(e) => { setGrandTotalMax(e.target.value); setPage(1) }}
            />
          </div>
        </div>

        <div className="ff-wrap">
          <label className="ff-label">Monto reembolsado</label>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input
              type="number"
              className="ff-input"
              placeholder="Reemb. mín."
              value={refundedAmountMin}
              onChange={(e) => { setRefundedAmountMin(e.target.value); setPage(1) }}
            />
            <span style={{ color: 'var(--text-secondary)', fontSize: 13 }}>—</span>
            <input
              type="number"
              className="ff-input"
              placeholder="Reemb. máx."
              value={refundedAmountMax}
              onChange={(e) => { setRefundedAmountMax(e.target.value); setPage(1) }}
            />
          </div>
        </div>
      </Drawer>
    </div>
  )
}
