// Drawer de detalle de un artículo dentro de "Inventario → Historial" — reusa
// GET /inventory/history/:itemCode (docs/tasks/74_detalle_item_historial_inventario.md) para
// mostrar TODOS los movimientos de ese artículo (no solo el que se clickeó), con sus propios
// filtros de almacén/tipo de documento/fechas — así el operador puede, por ejemplo, aislar el
// Stock Reconciliation de apertura que generó el saldo actual.

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { getItemHistory, listWarehouses } from '@/shared/api/inventory'
import { formatDate, formatDOP, formatNumber } from '@/lib/formatters'
import { Drawer } from '@/shared/ui/Drawer'
import { Select, SelectItem } from '@/components/ui/select'
import { SearchSelect } from '@/shared/ui/SearchSelect'
import type { SearchSelectOption } from '@/shared/ui/SearchSelect'
import { DatePicker } from '@/shared/ui/DatePicker'
import { FilterField } from '@/shared/ui/FilterField'
import { STOCK_VOUCHER_TYPES } from '@/lib/constants'

const PAGE_SIZE = 15

interface ItemHistoryDrawerProps {
  itemCode: string
  itemName?: string
  /** Almacén de la fila que se clickeó — precarga el filtro, pero el operador puede
   *  limpiarlo para ver el artículo en todos los almacenes. */
  initialWarehouse?: string
  onClose: () => void
}

export function ItemHistoryDrawer({ itemCode, itemName, initialWarehouse, onClose }: ItemHistoryDrawerProps) {
  const [warehouse, setWarehouse] = useState(initialWarehouse ?? '')
  const [voucherType, setVoucherType] = useState('all')
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')
  const [page, setPage] = useState(1)
  const offset = (page - 1) * PAGE_SIZE

  const { data: warehouses } = useQuery({
    queryKey: ['warehouses'],
    queryFn: listWarehouses,
  })
  const [warehouseSearch, setWarehouseSearch] = useState('')
  const warehouseOptions: SearchSelectOption[] = (warehouses ?? [])
    .filter((w) => !warehouseSearch || w.name.toLowerCase().includes(warehouseSearch.toLowerCase()))
    .map((w) => ({ value: w.name, label: w.name }))

  const { data, isLoading, isError } = useQuery({
    queryKey: ['item-history', itemCode, { warehouse, voucherType, fromDate, toDate, offset }],
    queryFn: () =>
      getItemHistory(itemCode, {
        warehouse: warehouse || undefined,
        voucherType: voucherType !== 'all' ? voucherType : undefined,
        fromDate: fromDate || undefined,
        toDate: toDate || undefined,
        limit: PAGE_SIZE,
        offset,
      }),
  })

  const totalPages = data ? Math.ceil(data.meta.total / PAGE_SIZE) : 1

  return (
    <Drawer
      open
      onClose={onClose}
      title={itemName ?? itemCode}
      subtitle={itemName ? itemCode : undefined}
      size="lg"
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div className="filter-bar" style={{ margin: 0, flexWrap: 'wrap' }}>
          <div className="filter-bar-left" style={{ flexWrap: 'wrap' }}>
            <FilterField label="Almacén" style={{ width: 200 }}>
              <SearchSelect
                value={warehouse}
                onChange={(val) => { setWarehouse(val); setPage(1) }}
                options={warehouseOptions}
                onSearch={setWarehouseSearch}
                selectedLabel={warehouse}
                placeholder="Todos los almacenes"
              />
            </FilterField>
            <FilterField label="Tipo de documento">
              <Select value={voucherType} onValueChange={(val) => { setVoucherType(val); setPage(1) }}>
                <SelectItem value="all">Todos los tipos</SelectItem>
                {STOCK_VOUCHER_TYPES.map((t) => (
                  <SelectItem key={t} value={t}>{t}</SelectItem>
                ))}
              </Select>
            </FilterField>
            <FilterField label="Desde">
              <DatePicker value={fromDate} onChange={(v) => { setFromDate(v); setPage(1) }} clearable />
            </FilterField>
            <FilterField label="Hasta">
              <DatePicker value={toDate} onChange={(v) => { setToDate(v); setPage(1) }} clearable />
            </FilterField>
          </div>
        </div>

        <div className="table-scroll">
          <table className="data-table navy-table">
            <thead>
              <tr>
                <th>Almacén</th>
                <th style={{ textAlign: 'right' }}>Movimiento</th>
                <th style={{ textAlign: 'right' }}>Stock Resultante</th>
                <th style={{ textAlign: 'right' }}>Valoración</th>
                <th>Tipo Doc</th>
                <th># Doc</th>
                <th>Fecha</th>
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
                : isError
                  ? (
                      <tr>
                        <td colSpan={7} style={{ textAlign: 'center', padding: '32px 0', color: 'var(--error-text)' }}>
                          Error al cargar el historial de este artículo
                        </td>
                      </tr>
                    )
                  : data?.items.length === 0
                    ? (
                        <tr>
                          <td colSpan={7}>
                            <div className="empty-state">
                              <div className="empty-title">Sin movimientos</div>
                              <p className="empty-sub">Este artículo no tiene movimientos con los filtros seleccionados.</p>
                            </div>
                          </td>
                        </tr>
                      )
                    : data?.items.map((entry, i) => (
                        <tr key={i}>
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
                          <td style={{ textAlign: 'right' }}>{formatDOP(entry.valuationRate)}</td>
                          <td className="td-muted">{entry.voucherType}</td>
                          <td style={{ fontFamily: 'monospace', fontSize: 12 }}>{entry.voucherNo}</td>
                          <td>
                            {formatDate(entry.postingDate)}
                            {entry.postingTime && (
                              <span className="td-muted" style={{ marginLeft: 4, fontSize: 11 }}>{entry.postingTime}</span>
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
    </Drawer>
  )
}
