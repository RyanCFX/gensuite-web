import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { getInventoryHistory, listWarehouses } from '@/shared/api/inventory'
import { formatDate, formatNumber } from '@/lib/formatters'
import { ChevronLeft, ChevronRight } from 'lucide-react'

const PAGE_SIZE = 30

const VOUCHER_TYPES = [
  'Stock Entry',
  'Purchase Receipt',
  'Delivery Note',
  'Stock Reconciliation',
]

export default function HistoryPage() {
  const [warehouse, setWarehouse] = useState<string>('all')
  const [voucherType, setVoucherType] = useState<string>('all')
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')
  const [page, setPage] = useState(1)

  const offset = (page - 1) * PAGE_SIZE

  const { data: warehouses } = useQuery({
    queryKey: ['warehouses'],
    queryFn: listWarehouses,
  })

  const { data, isLoading, isError } = useQuery({
    queryKey: ['inventory-history', { warehouse, voucherType, fromDate, toDate, offset }],
    queryFn: () =>
      getInventoryHistory({
        warehouse: warehouse !== 'all' ? warehouse : undefined,
        voucherType: voucherType !== 'all' ? voucherType : undefined,
        fromDate: fromDate || undefined,
        toDate: toDate || undefined,
        limit: PAGE_SIZE,
        offset,
      }),
  })

  const totalPages = data ? Math.ceil(data.meta.total / PAGE_SIZE) : 1

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h1 className="page-title">Historial de Movimientos</h1>
          <p className="page-sub">Entradas y salidas de inventario</p>
        </div>
      </div>

      <div className="filter-bar">
        <div className="filter-bar-left">
          <select
            className="filter-select"
            value={warehouse}
            onChange={(e) => { setWarehouse(e.target.value); setPage(1) }}
          >
            <option value="all">Todos los almacenes</option>
            {warehouses?.map((w) => (
              <option key={w.name} value={w.name}>{w.name}</option>
            ))}
          </select>

          <select
            className="filter-select"
            value={voucherType}
            onChange={(e) => { setVoucherType(e.target.value); setPage(1) }}
          >
            <option value="all">Todos los tipos</option>
            {VOUCHER_TYPES.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>

          <input
            type="date"
            className="ff-input ff-input-sm"
            value={fromDate}
            onChange={(e) => { setFromDate(e.target.value); setPage(1) }}
            style={{ width: 144 }}
          />
          <span style={{ color: 'var(--text-secondary)', fontSize: 13 }}>—</span>
          <input
            type="date"
            className="ff-input ff-input-sm"
            value={toDate}
            onChange={(e) => { setToDate(e.target.value); setPage(1) }}
            style={{ width: 144 }}
          />
        </div>
      </div>

      <div className="table-scroll">
        <table className="data-table">
          <thead>
            <tr>
              <th>Artículo</th>
              <th>Almacén</th>
              <th style={{ textAlign: 'right' }}>Movimiento</th>
              <th style={{ textAlign: 'right' }}>Stock Resultante</th>
              <th>Tipo Doc</th>
              <th># Doc</th>
              <th>Fecha</th>
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
                      <td colSpan={7} style={{ textAlign: 'center', padding: '32px 0', color: 'var(--color-error)' }}>
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
    </div>
  )
}
