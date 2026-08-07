import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { getInventoryHistory, listWarehouses } from '@/shared/api/inventory'
import { listSucursales } from '@/shared/api/sucursales'
import { formatDate, formatNumber } from '@/lib/formatters'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { PageHeader } from '@/components/shared/PageHeader'
import { useSortState } from '@/shared/hooks/useSortState'
import { SortableTh } from '@/shared/ui/SortableTh'
import { Select, SelectItem } from '@/components/ui/select'
import { SearchSelect } from '@/shared/ui/SearchSelect'
import type { SearchSelectOption } from '@/shared/ui/SearchSelect'

const PAGE_SIZE = 30

const VOUCHER_TYPES = [
  'Stock Entry',
  'Purchase Receipt',
  'Delivery Note',
  'Stock Reconciliation',
]

export default function HistoryPage() {
  const [warehouse, setWarehouse] = useState<string>('all')
  const [branch, setBranch] = useState('')
  const [voucherType, setVoucherType] = useState<string>('all')
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')
  const [page, setPage] = useState(1)
  const { orderBy, sort } = useSortState()

  const offset = (page - 1) * PAGE_SIZE

  const { data: warehouses } = useQuery({
    queryKey: ['warehouses'],
    queryFn: listWarehouses,
  })

  const { data: sucursales } = useQuery({
    queryKey: ['sucursales-all'],
    queryFn: () => listSucursales({ limit: 100 }),
  })

  const [warehouseSearch, setWarehouseSearch] = useState('')
  const warehouseOptions: SearchSelectOption[] = (warehouses ?? [])
    .filter((w) => !warehouseSearch || w.name.toLowerCase().includes(warehouseSearch.toLowerCase()))
    .map((w) => ({ value: w.name, label: w.name }))

  const [branchSearch, setBranchSearch] = useState('')
  const branchOptions: SearchSelectOption[] = (sucursales?.items ?? [])
    .filter((s) => !branchSearch || s.name.toLowerCase().includes(branchSearch.toLowerCase()))
    .map((s) => ({ value: s.id, label: s.name }))

  const { data, isLoading, isError } = useQuery({
    queryKey: ['inventory-history', { warehouse, branch, voucherType, fromDate, toDate, offset, orderBy }],
    queryFn: () =>
      getInventoryHistory({
        warehouse: warehouse !== 'all' ? warehouse : undefined,
        branch: warehouse === 'all' ? (branch || undefined) : undefined,
        voucherType: voucherType !== 'all' ? voucherType : undefined,
        fromDate: fromDate || undefined,
        toDate: toDate || undefined,
        limit: PAGE_SIZE,
        offset,
        orderBy: orderBy || undefined,
      }),
  })

  const totalPages = data ? Math.ceil(data.meta.total / PAGE_SIZE) : 1

  return (
    <div className="page-container">
      <PageHeader
        title="Historial de Movimientos"
        description="Entradas y salidas de inventario"
      />

      <div className="filter-bar">
        <div className="filter-bar-left">
          <div style={{ width: 200 }}>
            <SearchSelect
              value={warehouse === 'all' ? '' : warehouse}
              onChange={(val) => { setWarehouse(val || 'all'); setPage(1); if (val) setBranch('') }}
              options={warehouseOptions}
              onSearch={setWarehouseSearch}
              selectedLabel={warehouse === 'all' ? '' : warehouse}
              placeholder="Todos los almacenes"
            />
          </div>

          {warehouse === 'all' && (
            <div style={{ width: 200 }}>
              <SearchSelect
                value={branch}
                onChange={(val) => { setBranch(val); setPage(1) }}
                options={branchOptions}
                onSearch={setBranchSearch}
                selectedLabel={sucursales?.items.find((s) => s.id === branch)?.name ?? ''}
                placeholder="Todas las sucursales"
              />
            </div>
          )}

          <Select value={voucherType} onValueChange={(val) => { setVoucherType(val); setPage(1) }}>
            <SelectItem value="all">Todos los tipos</SelectItem>
            {VOUCHER_TYPES.map((t) => (
              <SelectItem key={t} value={t}>{t}</SelectItem>
            ))}
          </Select>

          <input
            type="date"
            className="filter-select"
            value={fromDate}
            onChange={(e) => { setFromDate(e.target.value); setPage(1) }}
          />
          <span style={{ color: 'var(--text-secondary)', fontSize: 13 }}>—</span>
          <input
            type="date"
            className="filter-select"
            value={toDate}
            onChange={(e) => { setToDate(e.target.value); setPage(1) }}
          />
        </div>
      </div>

      <div className="card">
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <SortableTh label="Artículo" sortKey="itemCode" orderBy={orderBy} onSort={(k) => { sort(k); setPage(1) }} />
                <th>Almacén</th>
                <th style={{ textAlign: 'right' }}>Movimiento</th>
                <th style={{ textAlign: 'right' }}>Stock Resultante</th>
                <th>Tipo Doc</th>
                <th># Doc</th>
                <SortableTh label="Fecha" sortKey="date" orderBy={orderBy} onSort={(k) => { sort(k); setPage(1) }} />
              </tr>
            </thead>
            <tbody>
              {isLoading
                ? Array.from({ length: 8 }).map((_, i) => (
                    <tr key={i}>
                      {Array.from({ length: 7 }).map((__, j) => (
                        <td key={j}><div className="skeleton-box" style={{ height: 14, width: '100%' }} /></td>
                      ))}
                    </tr>
                  ))
                : isError
                  ? (
                      <tr>
                        <td colSpan={7} style={{ textAlign: 'center', padding: '32px 0', color: 'var(--error-text)' }}>
                          Error al cargar el historial
                        </td>
                      </tr>
                    )
                  : data?.items.length === 0
                    ? (
                        <tr>
                          <td colSpan={7}>
                            <div className="empty-state">
                              <div className="empty-title">Sin movimientos</div>
                              <p className="empty-sub">No hay movimientos con los filtros seleccionados.</p>
                            </div>
                          </td>
                        </tr>
                      )
                    : data?.items.map((entry, i) => (
                        <tr key={i}>
                          <td>
                            <span style={{ fontWeight: 500 }}>{entry.itemName}</span>
                            <span className="td-muted" style={{ marginLeft: 6 }}>({entry.itemCode})</span>
                          </td>
                          <td className="td-muted">{entry.warehouse}</td>
                          <td style={{
                            textAlign: 'right',
                            fontFamily: 'monospace',
                            fontWeight: 600,
                            color: entry.movementQty >= 0 ? 'oklch(62.7% 0.194 149.214)' : 'oklch(51.4% 0.222 16.935)',
                          }}
                          >
                            {formatNumber(entry.movementQty)}
                          </td>
                          <td style={{ textAlign: 'right', fontFamily: 'monospace' }}>
                            {formatNumber(entry.stockAfter)}
                          </td>
                          <td className="td-muted">{entry.voucherType}</td>
                          <td style={{ fontFamily: 'monospace', fontSize: 12 }}>{entry.voucherNo}</td>
                          <td>{formatDate(entry.postingDate)}</td>
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
              <button
                className="btn btn-ghost btn-size-icon-sm"
                disabled={page === 1}
                onClick={() => setPage((p) => p - 1)}
              >
                <ChevronLeft size={14} />
              </button>
              <span style={{ fontSize: 12, color: 'var(--text-secondary)', padding: '0 8px' }}>
                {page} / {totalPages}
              </span>
              <button
                className="btn btn-ghost btn-size-icon-sm"
                disabled={!data.meta.hasMore}
                onClick={() => setPage((p) => p + 1)}
              >
                <ChevronRight size={14} />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
