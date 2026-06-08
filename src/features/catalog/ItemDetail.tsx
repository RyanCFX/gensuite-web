import { useNavigate, useParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { getItem, toggleItem } from '@/shared/api/catalog'
import { formatDOP } from '@/lib/formatters'
import { ToggleLeft, ToggleRight, Package, ArrowLeft } from 'lucide-react'

export default function ItemDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const { data: item, isLoading, isError } = useQuery({
    queryKey: ['item', id],
    queryFn: () => getItem(id!),
    enabled: Boolean(id),
  })

  const toggleMutation = useMutation({
    mutationFn: () => toggleItem(id!),
    onSuccess: (updated) => {
      toast.success(updated.disabled ? 'Artículo desactivado' : 'Artículo activado')
      queryClient.invalidateQueries({ queryKey: ['item', id] })
      queryClient.invalidateQueries({ queryKey: ['items'] })
    },
    onError: () => {
      toast.error('Error al cambiar el estado del artículo')
    },
  })

  if (isLoading) {
    return (
      <div className="page-container">
        <div className="skeleton-box" style={{ width: 200, height: 28, marginBottom: 16 }} />
        <div className="skeleton-box" style={{ width: '100%', height: 192, borderRadius: 'var(--radius-lg)' }} />
      </div>
    )
  }

  if (isError || !item) {
    return (
      <div className="page-container">
        <p style={{ color: 'var(--color-error)' }}>Error al cargar el artículo</p>
        <button className="btn btn-ghost" style={{ marginTop: 16 }} onClick={() => navigate('/catalogo/articulos')}>
          Volver
        </button>
      </div>
    )
  }

  const stock = item.currentStock ?? 0
  let stockStatus: 'in-stock' | 'low-stock' | 'out-stock'
  if (stock <= 0) stockStatus = 'out-stock'
  else if (stock <= 10) stockStatus = 'low-stock'
  else stockStatus = 'in-stock'

  const stockColor = {
    'in-stock': 'var(--color-success)',
    'low-stock': 'var(--color-warning)',
    'out-stock': 'var(--color-error)',
  }[stockStatus]

  const stockLabel = {
    'in-stock': 'En Stock',
    'low-stock': 'Stock Bajo',
    'out-stock': 'Sin Stock',
  }[stockStatus]

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <a className="page-back-link" onClick={() => navigate('/catalogo/articulos')}>
            <ArrowLeft size={14} /> Artículos
          </a>
          <h1 className="page-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Package size={20} style={{ color: 'var(--text-secondary)' }} />
            {item.itemName}
            {item.disabled
              ? <span className="badge badge-neutral">Inactivo</span>
              : <span className="badge badge-success">Activo</span>}
            <span className="badge badge-neutral">{item.type === 'product' ? 'Producto' : 'Servicio'}</span>
          </h1>
          <p className="page-sub" style={{ fontFamily: 'monospace' }}>{item.id}</p>
        </div>
        <button
          className="btn btn-secondary"
          onClick={() => toggleMutation.mutate()}
          disabled={toggleMutation.isPending}
        >
          {item.disabled
            ? <><ToggleRight size={15} /> Activar</>
            : <><ToggleLeft size={15} /> Desactivar</>}
        </button>
      </div>

      {item.type === 'product' && (
        <div className="stats-row" style={{ marginBottom: 16 }}>
          <div className="stat-card">
            <div className="stat-card-top">
              <span className="stat-label">Stock Actual</span>
            </div>
            <div className="stat-value" style={{ color: stockColor, fontSize: 40 }}>{stock}</div>
            <div className="stat-footer">
              <span style={{ color: stockColor, fontWeight: 500, fontSize: 13 }}>{stockLabel}</span>
            </div>
          </div>

          <div className="stat-card">
            <div className="stat-card-top">
              <span className="stat-label">Precio de Venta</span>
            </div>
            <div className="stat-value" style={{ fontSize: 28 }}>{formatDOP(item.standardRate)}</div>
          </div>

          {item.valuationRate != null && (
            <div className="stat-card">
              <div className="stat-card-top">
                <span className="stat-label">Costo Valoración</span>
              </div>
              <div className="stat-value" style={{ color: 'var(--text-secondary)', fontSize: 24 }}>
                {formatDOP(item.valuationRate)}
              </div>
            </div>
          )}
        </div>
      )}

      {item.type === 'service' && (
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="card-header">
            <h2 className="card-title">Precio</h2>
          </div>
          <div className="card-body">
            <p style={{ fontSize: 28, fontWeight: 700 }}>{formatDOP(item.standardRate)}</p>
          </div>
        </div>
      )}

      <div className="card">
        <div className="card-header">
          <h2 className="card-title">Detalles</h2>
        </div>
        <div className="card-body">
          <div className="fields-grid fields-grid-3">
            <div className="detail-field">
              <span className="detail-label">Código</span>
              <span className="detail-value" style={{ fontFamily: 'monospace' }}>{item.id}</span>
            </div>
            <div className="detail-field">
              <span className="detail-label">Nombre</span>
              <span className="detail-value">{item.itemName}</span>
            </div>
            <div className="detail-field">
              <span className="detail-label">Tipo</span>
              <span className="detail-value">{item.type === 'product' ? 'Producto' : 'Servicio'}</span>
            </div>
            <div className="detail-field">
              <span className="detail-label">Categoría</span>
              <span className="detail-value">{item.categoryName ?? item.category ?? '—'}</span>
            </div>
            <div className="detail-field">
              <span className="detail-label">Marca</span>
              <span className="detail-value">{item.brandName ?? item.brand ?? '—'}</span>
            </div>
            <div className="detail-field">
              <span className="detail-label">Descripción</span>
              <span className="detail-value">{item.description ?? '—'}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
