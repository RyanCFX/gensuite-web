import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { listInventory, listWarehouses } from '@/shared/api/inventory'
import { formatDOP, formatNumber } from '@/lib/formatters'
import { PageHeader } from '@/components/shared/PageHeader'
import { DollarSign, TrendingUp, Package } from 'lucide-react'
import { useSortState } from '@/shared/hooks/useSortState'
import { SortableTh } from '@/shared/ui/SortableTh'
import { useAuthStore } from '@/stores/auth.store'

export default function StockPage() {
  const authUser = useAuthStore((s) => s.user)
  const [warehouse, setWarehouse] = useState<string>('all')
  const [category, setCategory] = useState('')
  const [brand, setBrand] = useState('')
  const [stockFilter, setStockFilter] = useState<string>('all')
  const { orderBy, sort } = useSortState()

  const { data: warehouses } = useQuery({
    queryKey: ['warehouses'],
    queryFn: listWarehouses,
  })

  const { data, isLoading, isError } = useQuery({
    queryKey: ['inventory', { warehouse, stockFilter, orderBy }],
    queryFn: () =>
      listInventory({
        warehouse: warehouse !== 'all' ? warehouse : undefined,
        limit: 100,
        orderBy: orderBy || undefined,
      }),
  })

  const summary = data?.summary

  // Client-side filter by category, brand and stock status
  const allItems = data?.items ?? []
  const items = allItems.filter((item) => {
    if (category && !item.category?.toLowerCase().includes(category.toLowerCase()) &&
        !item.itemName.toLowerCase().includes(category.toLowerCase())) return false
    if (brand && !item.brand?.toLowerCase().includes(brand.toLowerCase())) return false
    if (stockFilter === 'in_stock' && item.actualQty <= 0) return false
    if (stockFilter === 'out_of_stock' && item.actualQty > 0) return false
    return true
  })

  // Derive stock status badge from actualQty (API doesn't return stockStatus)
  function getStockStatus(qty: number): 'in_stock' | 'out_of_stock' {
    return qty > 0 ? 'in_stock' : 'out_of_stock'
  }

  const stockBadgeClass: Record<string, string> = {
    in_stock: 'badge-in-stock',
    out_of_stock: 'badge-out-stock',
  }
  const stockLabel: Record<string, string> = {
    in_stock: 'En stock',
    out_of_stock: 'Sin stock',
  }

  return (
    <div className="page-container">
      <PageHeader
        title="Stock Actual"
        description="Vista del inventario por almacén"
      />

      <div className="stats-row">
        <div className="stat-card">
          <div className="stat-card-top">
            <div className="stat-icon-badge"><DollarSign size={16} /></div>
            <span className="stat-label">Inversión Total</span>
          </div>
          {isLoading
            ? <div className="skeleton-box" style={{ height: 28, width: '70%' }} />
            : <div className="stat-value">{formatDOP(summary?.totalInvestment)}</div>}
        </div>

        <div className="stat-card">
          <div className="stat-card-top">
            <div className="stat-icon-badge"><Package size={16} /></div>
            <span className="stat-label">Valor de Venta</span>
          </div>
          {isLoading
            ? <div className="skeleton-box" style={{ height: 28, width: '70%' }} />
            : <div className="stat-value">{formatDOP(summary?.totalSaleValue)}</div>}
        </div>

        <div className="stat-card">
          <div className="stat-card-top">
            <div className="stat-icon-badge"><TrendingUp size={16} /></div>
            <span className="stat-label">Ganancia Potencial</span>
          </div>
          {isLoading
            ? <div className="skeleton-box" style={{ height: 28, width: '70%' }} />
            : <div className="stat-value">{formatDOP(summary?.totalPotentialProfit)}</div>}
        </div>
      </div>

      {authUser?.defaultWarehouse && (
        <div style={{ marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
          <span className="badge badge-info">
            Viendo: {authUser.defaultWarehouse}
          </span>
          <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>
            {warehouse !== 'all' ? `(filtro manual: ${warehouse})` : 'almacén por defecto'}
          </span>
        </div>
      )}

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
            placeholder="Categoría / nombre"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            style={{ width: 180 }}
          />
          <input
            className="ff-input ff-input-sm"
            placeholder="Marca"
            value={brand}
            onChange={(e) => setBrand(e.target.value)}
            style={{ width: 160 }}
          />
          <select className="filter-select" value={stockFilter} onChange={(e) => setStockFilter(e.target.value)}>
            <option value="all">Todos los estados</option>
            <option value="in_stock">En stock</option>
            <option value="out_of_stock">Sin stock</option>
          </select>
        </div>
      </div>

      <div className="card">
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <SortableTh label="Código" sortKey="itemCode" orderBy={orderBy} onSort={sort} />
                <SortableTh label="Nombre" sortKey="itemName" orderBy={orderBy} onSort={sort} />
                <th>Almacén</th>
                <th>Categoría</th>
                <SortableTh label="Stock" sortKey="currentStock" orderBy={orderBy} onSort={sort} align="right" />
                <th>Ubicación</th>
                <th style={{ textAlign: 'right' }}>Costo Unit.</th>
                <th style={{ textAlign: 'right' }}>Precio Venta</th>
                <th style={{ textAlign: 'right' }}>Inversión</th>
                <th style={{ textAlign: 'right' }}>Valor Venta</th>
                <th style={{ textAlign: 'right' }}>Ganancia</th>
                <th>Estado</th>
              </tr>
            </thead>
            <tbody>
              {isLoading
                ? Array.from({ length: 8 }).map((_, i) => (
                    <tr key={i}>
                      {Array.from({ length: 12 }).map((__, j) => (
                        <td key={j}><div className="skeleton-box" style={{ height: 14, width: '100%' }} /></td>
                      ))}
                    </tr>
                  ))
                : isError
                  ? (
                      <tr>
                        <td colSpan={12} style={{ textAlign: 'center', padding: '32px 0', color: 'var(--error-text)' }}>
                          Error al cargar el inventario
                        </td>
                      </tr>
                    )
                  : items.length === 0
                    ? (
                        <tr>
                          <td colSpan={12}>
                            <div className="empty-state">
                              <div className="empty-title">Sin artículos</div>
                              <p className="empty-sub">No hay artículos en inventario con los filtros seleccionados.</p>
                            </div>
                          </td>
                        </tr>
                      )
                    : items.map((item) => {
                        const status = getStockStatus(item.actualQty)
                        return (
                          <tr key={`${item.itemCode}-${item.warehouse}`}>
                            <td style={{ fontFamily: 'monospace', fontSize: 12 }}>{item.itemCode}</td>
                            <td style={{ fontWeight: 500 }}>{item.itemName}</td>
                            <td className="td-muted">{item.warehouse}</td>
                            <td className="td-muted">{item.category ?? '—'}</td>
                            <td style={{ textAlign: 'right' }}>{formatNumber(item.actualQty)}</td>
                            <td className="td-muted" title={item.ubicaciones && item.ubicaciones.length > 1 ? item.ubicaciones.join(', ') : undefined}>
                              {!item.ubicaciones || item.ubicaciones.length === 0
                                ? 'Sin asignar'
                                : item.ubicaciones.length === 1
                                  ? item.ubicaciones[0]
                                  : `${item.ubicaciones[0]} +${item.ubicaciones.length - 1}`}
                            </td>
                            <td style={{ textAlign: 'right' }}>{formatDOP(item.valuationRate)}</td>
                            <td style={{ textAlign: 'right' }}>{formatDOP(item.standardRate)}</td>
                            <td style={{ textAlign: 'right' }}>{formatDOP(item.investmentValue)}</td>
                            <td style={{ textAlign: 'right' }}>{formatDOP(item.saleValue)}</td>
                            <td style={{ textAlign: 'right' }}>{formatDOP(item.potentialProfit)}</td>
                            <td>
                              <span className={`badge ${stockBadgeClass[status]}`}>
                                {stockLabel[status]}
                              </span>
                            </td>
                          </tr>
                        )
                      })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
