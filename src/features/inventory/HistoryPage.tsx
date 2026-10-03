import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { getInventoryHistory } from '@/shared/api/inventory'
import { formatDate, formatNumber } from '@/lib/formatters'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { PageHeader } from '@/components/shared/PageHeader'
import { RecargarButton } from '@/components/shared/RecargarButton'
import { useSortState } from '@/shared/hooks/useSortState'
import { SortableTh } from '@/shared/ui/SortableTh'
import { Select, SelectItem } from '@/components/ui/select'
import { DatePicker } from '@/shared/ui/DatePicker'
import { FilterField } from '@/shared/ui/FilterField'
import { ItemHistoryDrawer } from './ItemHistoryDrawer'
import { STOCK_VOUCHER_TYPES } from '@/lib/constants'
import { useResizableColumns } from '@/shared/hooks/useResizableColumns'
import { OpcionesSelect } from '@/shared/ui/OpcionesSelect'

const PAGE_SIZE = 30

const COLUMNS = [
  { key: 'articulo', width: 220 },
  { key: 'almacen', width: 140 },
  { key: 'movimiento', width: 110 },
  { key: 'stockResultante', width: 130 },
  { key: 'tipoDoc', width: 110 },
  { key: 'numDoc', width: 110 },
  { key: 'fecha', width: 100 },
]

export default function HistoryPage() {
  const [warehouse, setWarehouse] = useState<string>('all')
  const [branch, setBranch] = useState('')
  const [voucherType, setVoucherType] = useState<string>('all')
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')
  const [page, setPage] = useState(1)
  const { orderBy, sort } = useSortState()
  const [selectedItem, setSelectedItem] = useState<{ itemCode: string; itemName: string; warehouse: string } | null>(null)
  const { widths: colWidths, startResize } = useResizableColumns(COLUMNS)

  const offset = (page - 1) * PAGE_SIZE





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
        title={<><span className="page-title-dot" />Historial de Movimientos</>}
        description="Entradas y salidas de inventario"
        action={<RecargarButton />}
      />

      <div className="card filter-card-navy" style={{ marginBottom: 20 }}>
        <div className="card-body">
          <div className="filter-bar" style={{ margin: 0 }}>
            <div className="filter-bar-left">
              <OpcionesSelect hideOnForbidden filterLabel="Almacén" filterStyle={{ width: 200 }} recurso="almacenes" value={warehouse === 'all' ? '' : warehouse} onChange={(val) => { setWarehouse(val || 'all'); setPage(1); if (val) setBranch('') }} selectedLabel={warehouse === 'all' ? '' : warehouse} placeholder="Todos los almacenes" />

              {warehouse === 'all' && (
                <OpcionesSelect hideOnForbidden filterLabel="Sucursal" filterStyle={{ width: 200 }} recurso="sucursales" value={branch} onChange={(val) => { setBranch(val); setPage(1) }} placeholder="Todas las sucursales" />
              )}

              <FilterField label="Tipo de documento">
                <Select value={voucherType} onValueChange={(val) => { setVoucherType(val); setPage(1) }}>
                  <SelectItem value="all">Todos los tipos</SelectItem>
                  {STOCK_VOUCHER_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>{t}</SelectItem>
                  ))}
                </Select>
              </FilterField>

              <FilterField label="Desde">
                <DatePicker
                  className="filter-select"
                  value={fromDate}
                  onChange={(v) => { setFromDate(v); setPage(1) }}
                  clearable
                />
              </FilterField>
              <FilterField label="Hasta">
                <DatePicker
                  className="filter-select"
                  value={toDate}
                  onChange={(v) => { setToDate(v); setPage(1) }}
                  clearable
                />
              </FilterField>
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
                  label="Artículo"
                  sortKey="itemCode"
                  orderBy={orderBy}
                  onSort={(k) => { sort(k); setPage(1) }}
                  resizeHandle={<span className="col-resize-handle" onMouseDown={startResize('articulo')} />}
                />
                <th>
                  Almacén
                  <span className="col-resize-handle" onMouseDown={startResize('almacen')} />
                </th>
                <th style={{ textAlign: 'right' }}>
                  Movimiento
                  <span className="col-resize-handle" onMouseDown={startResize('movimiento')} />
                </th>
                <th style={{ textAlign: 'right' }}>
                  Stock Resultante
                  <span className="col-resize-handle" onMouseDown={startResize('stockResultante')} />
                </th>
                <th>
                  Tipo Doc
                  <span className="col-resize-handle" onMouseDown={startResize('tipoDoc')} />
                </th>
                <th>
                  # Doc
                  <span className="col-resize-handle" onMouseDown={startResize('numDoc')} />
                </th>
                <SortableTh
                  label="Fecha"
                  sortKey="date"
                  orderBy={orderBy}
                  onSort={(k) => { sort(k); setPage(1) }}
                  resizeHandle={<span className="col-resize-handle" onMouseDown={startResize('fecha')} />}
                />
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
                        <tr
                          key={i}
                          className="data-table-row-link"
                          onClick={() => setSelectedItem({ itemCode: entry.itemCode, itemName: entry.itemName, warehouse: entry.warehouse })}
                        >
                          <td>
                            <span style={{ fontWeight: 500 }}>{entry.itemName}</span>
                            <span className="td-muted" style={{ marginLeft: 6 }}>({entry.itemCode})</span>
                          </td>
                          <td className="td-muted">{entry.warehouse}</td>
                          <td style={{
                            textAlign: 'right',
                            fontFamily: 'var(--font-body)',
                            fontWeight: 600,
                            color: entry.movementQty >= 0 ? 'oklch(62.7% 0.194 149.214)' : 'oklch(51.4% 0.222 16.935)',
                          }}
                          >
                            {formatNumber(entry.movementQty)}
                          </td>
                          <td style={{ textAlign: 'right', fontFamily: 'var(--font-body)' }}>
                            {formatNumber(entry.stockAfter)}
                          </td>
                          <td className="td-muted">{entry.voucherType}</td>
                          <td style={{ fontFamily: 'var(--font-body)', fontSize: 12 }}>{entry.voucherNo}</td>
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

      {selectedItem && (
        <ItemHistoryDrawer
          key={selectedItem.itemCode}
          itemCode={selectedItem.itemCode}
          itemName={selectedItem.itemName}
          initialWarehouse={selectedItem.warehouse}
          onClose={() => setSelectedItem(null)}
        />
      )}
    </div>
  )
}
