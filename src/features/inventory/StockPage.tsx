import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { getInventorySummary, listInventory, listWarehouses } from '@/shared/api/inventory'
import { formatDOP, formatNumber } from '@/lib/formatters'
import { DollarSign, TrendingUp, Package } from 'lucide-react'

export default function StockPage() {
  const [warehouse, setWarehouse] = useState<string>('all')
  const [category, setCategory] = useState('')
  const [brand, setBrand] = useState('')
  const [stockStatus, setStockStatus] = useState<string>('all')

  const { data: summary, isLoading: summaryLoading } = useQuery({
    queryKey: ['inventory-summary'],
    queryFn: getInventorySummary,
  })

  const { data: warehouses } = useQuery({
    queryKey: ['warehouses'],
    queryFn: listWarehouses,
  })

  const { data, isLoading, isError } = useQuery({
    queryKey: ['inventory', { warehouse, stockStatus }],
    queryFn: () =>
      listInventory({
        warehouse: warehouse !== 'all' ? warehouse : undefined,
        stockStatus: stockStatus !== 'all' ? (stockStatus as 'in_stock' | 'low_stock' | 'out_of_stock') : undefined,
        limit: 100,
      }),
  })

  const stockBadgeClass: Record<string, string> = {
    in_stock: 'badge-in-stock',
    low_stock: 'badge-low-stock',
    out_of_stock: 'badge-out-stock',
  }
  const stockLabel: Record<string, string> = {
    in_stock: 'En stock',
    low_stock: 'Stock bajo',
    out_of_stock: 'Sin stock',
  }

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h1 className="page-title">Stock Actual</h1>
          <p className="page-sub">Vista del inventario por almacén</p>
        </div>
      </div>

      <div className="stats-row">
        <div className="stat-card">
          <div className="stat-card-top">
            <div className="stat-icon-badge"><DollarSign size={16} /></div>
            <span className="stat-label">Inversión Total</span>
          </div>
          {summaryLoading
            ? <div className="skeleton-box" style={{ height: 28, width: '70%' }} />
            : <div className="stat-value">{formatDOP(summary?.totalInvestment)}</div>}
        </div>

        <div className="stat-card">
          <div className="stat-card-top">
            <div className="stat-icon-badge"><Package size={16} /></div>
            <span className="stat-label">Valor Total</span>
          </div>
          {summaryLoading
            ? <div className="skeleton-box" style={{ height: 28, width: '70%' }} />
            : <div className="stat-value">{formatDOP(summary?.totalValue)}</div>}
        </div>

        <div className="stat-card">
          <div className="stat-card-top">
            <div className="stat-icon-badge"><TrendingUp size={16} /></div>
            <span className="stat-label">Ganancia Potencial</span>
          </div>
          {summaryLoading
            ? <div className="skeleton-box" style={{ height: 28, width: '70%' }} />
            : <div className="stat-value">{formatDOP(summary?.potentialProfit)}</div>}
        </div>
      </div>

      <div className="filter-bar">
        <div className="filter-bar-left">
          <select className="filter-select" value={warehouse} onChange={(e) => setWarehouse(e.target.value)}>
            <option value="all">Todos los almacenes</option>
            {warehouses?.map((w) => (
              <option key={w.name} value={w.name}>{w.name}</option>
            ))}
          </select>
          <input
            className="ff-input ff-input-sm"
            placeholder="Categoría"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            style={{ width: 160 }}
          />
          <input
            className="ff-input ff-input-sm"
            placeholder="Marca"
            value={brand}
            onChange={(e) => setBrand(e.target.value)}
            style={{ width: 160 }}
          />
          <select className="filter-select" value={stockStatus} onChange={(e) => setStockStatus(e.target.value)}>
            <option value="all">Todos los estados</option>
            <option value="in_stock">En stock</option>
            <option value="low_stock">Stock bajo</option>
            <option value="out_of_stock">Sin stock</option>
          </select>
        </div>
      </div>

      <div className="table-scroll">
        <table className="data-table">
          <thead>
            <tr>
              <th>Código</th>
              <th>Nombre</th>
              <th>Almacén</th>
              <th style={{ textAlign: 'right' }}>Stock</th>
              <th style={{ textAlign: 'right' }}>Costo</th>
              <th style={{ textAlign: 'right' }}>Precio Venta</th>
              <th style={{ textAlign: 'right' }}>Inversión</th>
              <th style={{ textAlign: 'right' }}>Valor</th>
              <th style={{ textAlign: 'right' }}>Ganancia</th>
              <th>Estado</th>
            </tr>
          </thead>
          <tbody>
            {isLoading
              ? Array.from({ length: 8 }).map((_, i) => (
                  <tr key={i}>
                    {Array.from({ length: 10 }).map((__, j) => (
                      <td key={j}><div className="skeleton-box" style={{ height: 14, width: '100%' }} /></td>
                    ))}
                  </tr>
                ))
              : isError
                ? (
                    <tr>
                      <td colSpan={10} style={{ textAlign: 'center', padding: '32px 0', color: 'var(--color-error)' }}>
                        Error al cargar el inventario
                      </td>
                    </tr>
                  )
                : !data?.items.length
                  ? (
                      <tr>
                        <td colSpan={10}>
                          <div className="empty-state">
                            <div className="empty-title">Sin artículos</div>
                            <p className="empty-sub">No hay artículos en inventario con los filtros seleccionados.</p>
                          </div>
                        </td>
                      </tr>
                    )
                  : data?.items?.map?.((item) => (
                      <tr key={`${item.itemCode}-${item.warehouse}`}>
                        <td style={{ fontFamily: 'monospace', fontSize: 12 }}>{item.itemCode}</td>
                        <td style={{ fontWeight: 500 }}>{item.itemName}</td>
                        <td className="td-muted">{item.warehouse}</td>
                        <td style={{ textAlign: 'right' }}>{formatNumber(item.actualQty)}</td>
                        <td style={{ textAlign: 'right' }}>{formatDOP(item.valuationRate)}</td>
                        <td style={{ textAlign: 'right' }}>{formatDOP(item.sellingRate)}</td>
                        <td style={{ textAlign: 'right' }}>{formatDOP(item.valuationAmount)}</td>
                        <td style={{ textAlign: 'right' }}>{formatDOP(item.sellingAmount)}</td>
                        <td style={{ textAlign: 'right' }}>{formatDOP(item.potentialProfit)}</td>
                        <td>
                          <span className={`badge ${stockBadgeClass[item.stockStatus] ?? 'badge-neutral'}`}>
                            {stockLabel[item.stockStatus] ?? item.stockStatus}
                          </span>
                        </td>
                      </tr>
                    ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
