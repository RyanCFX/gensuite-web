import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  listDevolucionesCompras,
  type ListDevolucionesComprasParams,
} from '@/shared/api/devoluciones-compras'
import { listSucursales } from '@/shared/api/sucursales'
import { PageHeader } from '@/components/shared/PageHeader'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { formatDate, formatDOP } from '@/lib/formatters'
import { Plus, ChevronLeft, ChevronRight, Search, Banknote } from 'lucide-react'
import { useSortState } from '@/shared/hooks/useSortState'
import { SortableTh } from '@/shared/ui/SortableTh'
import { SearchSelect } from '@/shared/ui/SearchSelect'
import type { SearchSelectOption } from '@/shared/ui/SearchSelect'
import { Select, SelectItem } from '@/components/ui/select'
import { DatePicker } from '@/shared/ui/DatePicker'
import { ApplyToCxpModal } from './ApplyToCxpModal'
import type { DevolucionCompra } from '@/shared/api/types'

const PAGE_SIZE = 20

export default function DevolucionesPage() {
  const navigate = useNavigate()
  const [supplier, setSupplier] = useState('')
  const [status, setStatus] = useState<string>('all')
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')
  const [branch, setBranch] = useState('')
  const [ncf, setNcf] = useState('')
  const [grandTotalMin, setGrandTotalMin] = useState('')
  const [grandTotalMax, setGrandTotalMax] = useState('')
  const [page, setPage] = useState(1)
  const { orderBy, sort } = useSortState()

  const [applyOpen, setApplyOpen] = useState(false)
  const [applyTarget, setApplyTarget] = useState<DevolucionCompra | null>(null)

  const offset = (page - 1) * PAGE_SIZE

  const { data: sucursalesData } = useQuery({
    queryKey: ['sucursales-all'],
    queryFn: () => listSucursales({ limit: 100 }),
  })
  const sucursales = sucursalesData?.items ?? []

  const [branchSearch, setBranchSearch] = useState('')
  const branchOptions: SearchSelectOption[] = sucursales
    .filter((s) => !branchSearch || s.name.toLowerCase().includes(branchSearch.toLowerCase()))
    .map((s) => ({ value: s.name, label: s.name }))

  const params: ListDevolucionesComprasParams = {
    supplier: supplier || undefined,
    status: status !== 'all' ? status : undefined,
    fromDate: fromDate || undefined,
    toDate: toDate || undefined,
    branch: branch || undefined,
    ncf: ncf || undefined,
    grandTotalMin: grandTotalMin ? Number(grandTotalMin) : undefined,
    grandTotalMax: grandTotalMax ? Number(grandTotalMax) : undefined,
    orderBy: orderBy || undefined,
    limit: PAGE_SIZE,
    offset,
  }

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['devoluciones-compras', { supplier, status, fromDate, toDate, branch, ncf, grandTotalMin, grandTotalMax, offset, orderBy }],
    queryFn: () => listDevolucionesCompras(params),
  })

  const rows = data?.items ?? []
  const totalPages = data ? Math.max(1, Math.ceil(data.meta.total / PAGE_SIZE)) : 1

  return (
    <div className="page-container">
      <PageHeader
        title="Devoluciones de Compras"
        description="Notas de crédito de compra y su aplicación a cuentas por pagar"
        action={
          <button className="btn btn-primary" onClick={() => navigate('/devoluciones-compras/nueva')}>
            <Plus size={16} />
            Nueva Devolución
          </button>
        }
      />

      <div>
        <div className="filter-bar">
          <div className="filter-bar-left">
            <div className="search-input-wrap">
              <Search size={14} className="search-input-icon" />
              <input
                className="search-input"
                placeholder="Buscar proveedor…"
                value={supplier}
                onChange={(e) => { setSupplier(e.target.value); setPage(1) }}
              />
            </div>
            <Select value={status} onValueChange={(val) => { setStatus(val); setPage(1) }}>
              <SelectItem value="all">Todos los estados</SelectItem>
              <SelectItem value="draft">Borrador</SelectItem>
              <SelectItem value="submitted">Sometido</SelectItem>
              <SelectItem value="cancelled">Anulado</SelectItem>
            </Select>
            <div style={{ width: 200 }}>
              <SearchSelect
                value={branch}
                onChange={(val) => { setBranch(val); setPage(1) }}
                options={branchOptions}
                onSearch={setBranchSearch}
                selectedLabel={branch}
                placeholder="Todas las sucursales"
              />
            </div>
            <DatePicker className="filter-select" value={fromDate} onChange={(v) => { setFromDate(v); setPage(1) }} clearable />
            <DatePicker className="filter-select" value={toDate} onChange={(v) => { setToDate(v); setPage(1) }} clearable />
            <div className="search-input-wrap">
              <Search size={14} className="search-input-icon" />
              <input
                className="search-input"
                placeholder="Buscar NCF…"
                value={ncf}
                onChange={(e) => { setNcf(e.target.value); setPage(1) }}
              />
            </div>
            <input
              type="number"
              className="ff-input ff-input-sm"
              style={{ width: 100 }}
              placeholder="Total min"
              value={grandTotalMin}
              onChange={(e) => { setGrandTotalMin(e.target.value); setPage(1) }}
            />
            <span style={{ color: 'var(--text-secondary)', fontSize: 13 }}>—</span>
            <input
              type="number"
              className="ff-input ff-input-sm"
              style={{ width: 100 }}
              placeholder="Total max"
              value={grandTotalMax}
              onChange={(e) => { setGrandTotalMax(e.target.value); setPage(1) }}
            />
          </div>
        </div>

        <div className="card">
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <SortableTh label="Id" sortKey="id" orderBy={orderBy} onSort={(k) => { sort(k); setPage(1) }} />
                  <SortableTh label="Proveedor" sortKey="supplierName" orderBy={orderBy} onSort={(k) => { sort(k); setPage(1) }} />
                  <SortableTh label="Fecha" sortKey="postingDate" orderBy={orderBy} onSort={(k) => { sort(k); setPage(1) }} />
                  <th>NCF</th>
                  <SortableTh label="Total" sortKey="grandTotal" orderBy={orderBy} onSort={(k) => { sort(k); setPage(1) }} align="right" />
                  <th style={{ textAlign: 'right' }}>Disponible</th>
                  <SortableTh label="Estado" sortKey="status" orderBy={orderBy} onSort={(k) => { sort(k); setPage(1) }} />
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {isLoading
                  ? Array.from({ length: 8 }).map((_, i) => (
                      <tr key={i}>
                        {Array.from({ length: 8 }).map((__, j) => (
                          <td key={j}><span className="skeleton-box" style={{ height: 16, width: '100%', display: 'block' }} /></td>
                        ))}
                      </tr>
                    ))
                  : isError
                    ? (
                        <tr>
                          <td colSpan={8} style={{ textAlign: 'center', padding: '32px 0', color: 'var(--error-text)' }}>
                            Error al cargar las devoluciones
                          </td>
                        </tr>
                      )
                    : rows.length === 0
                      ? (
                          <tr>
                            <td colSpan={8}>
                              <div className="empty-state">
                                <div className="empty-icon"><Plus size={20} /></div>
                                <p className="empty-title">Sin devoluciones</p>
                                <p className="empty-sub">No hay devoluciones de compras registradas.</p>
                                <button className="btn btn-primary btn-size-sm" onClick={() => navigate('/devoluciones-compras/nueva')}>
                                  <Plus size={14} />Nueva Devolución
                                </button>
                              </div>
                            </td>
                          </tr>
                        )
      : rows.map((d) => {
          // "Disponible" mantiene la misma lógica que la ruta devoluciones: la disponibilidad
          // de saldo se expresa con `availableAmount > 0` (equivalente al estado `available`/
          // `partially_used` de devoluciones, que el backend de compras representa como status
          // 'submitted' con availableAmount). No condicionamos al estado para que coincida con
          // el concepto de disponibilidad de la ruta devoluciones.
          const disponible = d.availableAmount ?? 0
          const canApply = disponible > 0
          return (
                            <tr key={d.id} className="table-row-clickable" onClick={() => navigate(`/devoluciones-compras/${d.id}`)}>
                              <td style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>{d.id}</td>
                              <td style={{ fontWeight: 500 }}>{d.supplierName ?? '—'}</td>
                              <td>{formatDate(d.postingDate)}</td>
                              <td className="td-muted" style={{ fontFamily: 'var(--font-mono)' }}>{d.ncf ?? '—'}</td>
                              <td style={{ textAlign: 'right' }}>{formatDOP(d.grandTotal)}</td>
                              <td style={{ textAlign: 'right' }}>{canApply ? formatDOP(disponible) : '—'}</td>
                              <td><StatusBadge status={d.status} /></td>
                              <td>
                                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                                  <button
                                    className="btn btn-ghost btn-size-xs"
                                    onClick={(e) => { e.stopPropagation(); navigate(`/devoluciones-compras/${d.id}`) }}
                                  >
                                    Ver
                                  </button>
                                  {canApply && (
                                    <button
                                      className="btn btn-ghost btn-size-xs"
                                      onClick={(e) => { e.stopPropagation(); setApplyTarget(d); setApplyOpen(true) }}
                                      title="Aplicar saldo a CxP"
                                    >
                                      <Banknote size={12} />Aplicar
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

      {applyOpen && applyTarget && (
        <ApplyToCxpModal
          devolucionId={applyTarget.id}
          supplier={applyTarget.supplier}
          supplierName={applyTarget.supplierName}
          availableAmount={applyTarget.availableAmount ?? 0}
          onClose={() => { setApplyOpen(false); setApplyTarget(null) }}
          onSuccess={() => { setApplyOpen(false); setApplyTarget(null); refetch() }}
        />
      )}
    </div>
  )
}
