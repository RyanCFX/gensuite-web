import { useQuery } from '@tanstack/react-query'
import { getItem } from '@/shared/api/catalog'
import { getItemUbicaciones } from '@/shared/api/ubicaciones'
import { formatDOP } from '@/lib/formatters'
import { X, Package, MapPin, Percent, Tag } from 'lucide-react'

/**
 * Modal de solo lectura con el detalle de un artículo — usa el mismo GET
 * que /inventario/productos/:id o /catalogo/servicios/:id, pero sin acciones de edición.
 * Pensado para consultarse rápido desde las líneas de Cotización/Pedido/Factura.
 */
export function ItemDetailModal({ itemCode, onClose }: { itemCode: string; onClose: () => void }) {
  const { data: item, isLoading, isError } = useQuery({
    queryKey: ['item', itemCode],
    queryFn: () => getItem(itemCode),
    enabled: !!itemCode,
  })

  const { data: ubicacionesData } = useQuery({
    queryKey: ['item-ubicaciones', itemCode],
    queryFn: () => getItemUbicaciones(itemCode),
    enabled: !!itemCode && !isLoading,
  })
  const ubicaciones = ubicacionesData?.items ?? []

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" style={{ maxWidth: 560 }} onClick={(e) => e.stopPropagation()}>
        {isLoading ? (
          <>
            <div className="modal-head">
              <h2 className="modal-title">Detalle del artículo</h2>
              <button className="modal-close" onClick={onClose}><X size={16} /></button>
            </div>
            <div className="modal-body">
              <span className="skeleton-box" style={{ height: 200, display: 'block' }} />
            </div>
          </>
        ) : isError || !item ? (
          <>
            <div className="modal-head">
              <h2 className="modal-title">Detalle del artículo</h2>
              <button className="modal-close" onClick={onClose}><X size={16} /></button>
            </div>
            <div className="modal-body">
              <p style={{ fontSize: 13, color: 'var(--error-text)' }}>Error al cargar el artículo.</p>
            </div>
          </>
        ) : (
          <>
            {/* ── Header con ícono, nombre y badges ── */}
            <div style={{ padding: '20px 24px 16px', borderBottom: '1px solid var(--border-default)', display: 'flex', gap: 14 }}>
              <div style={{
                width: 44, height: 44, borderRadius: 'var(--radius-lg)', flexShrink: 0,
                background: 'var(--brand-primary-subtle)', color: 'var(--brand-primary)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <Package size={22} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <h2 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1.3 }}>
                  {item.itemName}
                </h2>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 12, fontFamily: 'var(--font-mono)', color: 'var(--text-tertiary)' }}>{item.id}</span>
                  {item.disabled
                    ? <span className="badge badge-neutral">Inactivo</span>
                    : <span className="badge badge-success">Activo</span>}
                  <span className="badge badge-info">{item.type === 'product' ? 'Producto' : 'Servicio'}</span>
                  {item.hasVariants && <span className="badge badge-neutral">Template</span>}
                  {item.variantOf && <span className="badge badge-neutral">Variante</span>}
                </div>
              </div>
              <button className="modal-close" onClick={onClose} style={{ marginLeft: 0 }}><X size={16} /></button>
            </div>

            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
              {/* ── Cifras clave ── */}
              <div className="stats-row" style={{ gridTemplateColumns: item.type === 'product' && !item.hasVariants ? 'repeat(3, 1fr)' : 'repeat(2, 1fr)', marginBottom: 0 }}>
                <div className="stat-card" style={{ padding: 14 }}>
                  <span className="stat-label">Precio de Venta</span>
                  <div className="stat-value" style={{ fontSize: 20 }}>{formatDOP(item.standardRate)}</div>
                </div>
                {item.type === 'product' && !item.hasVariants && (
                  <div className="stat-card" style={{ padding: 14 }}>
                    <span className="stat-label">Stock Actual</span>
                    <div className="stat-value" style={{ fontSize: 20, color: (item.currentStock ?? 0) > 0 ? 'var(--success-text)' : 'var(--error-text)' }}>
                      {item.currentStock ?? 0}
                    </div>
                  </div>
                )}
                {item.valuationRate != null && (
                  <div className="stat-card" style={{ padding: 14 }}>
                    <span className="stat-label">Costo de Valoración</span>
                    <div className="stat-value" style={{ fontSize: 20 }}>{formatDOP(item.valuationRate)}</div>
                  </div>
                )}
              </div>

              {/* ── Información general ── */}
              <div className="card" style={{ boxShadow: 'none' }}>
                <div className="card-header">
                  <span className="card-title" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Tag size={13} style={{ color: 'var(--text-tertiary)' }} /> Información General
                  </span>
                </div>
                <div className="fields-grid fields-grid-3">
                  <div className="detail-field">
                    <span className="detail-label">Categoría</span>
                    <span className="detail-value">
                      {item.subcategoryName
                        ? `${item.categoryName ?? item.category} > ${item.subcategoryName}`
                        : item.categoryName ?? item.category ?? '—'}
                    </span>
                  </div>
                  <div className="detail-field">
                    <span className="detail-label">Marca</span>
                    <span className="detail-value">{item.brandName ?? item.brand ?? '—'}</span>
                  </div>
                  <div className="detail-field">
                    <span className="detail-label">Descuento</span>
                    <span className="detail-value">
                      {item.allowsDiscount ? `Hasta ${item.maxDiscountPct ?? 0}%` : 'No permitido'}
                    </span>
                  </div>
                </div>
              </div>

              {/* ── Fiscal ── */}
              <div className="card" style={{ boxShadow: 'none' }}>
                <div className="card-header">
                  <span className="card-title" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Percent size={13} style={{ color: 'var(--text-tertiary)' }} /> Impuestos
                  </span>
                </div>
                <div className="fields-grid fields-grid-3">
                  <div className="detail-field">
                    <span className="detail-label">Impuesto de Venta</span>
                    <span className="detail-value">
                      {item.salesTaxTemplate ?? '—'}
                      {item.salesTaxPct != null && item.salesTaxPct > 0 && ` (${item.salesTaxPct}%)`}
                    </span>
                  </div>
                  <div className="detail-field">
                    <span className="detail-label">Impuesto de Compra</span>
                    <span className="detail-value">
                      {item.purchaseTaxTemplate ?? '—'}
                      {item.purchaseTaxPct != null && item.purchaseTaxPct > 0 && ` (${item.purchaseTaxPct}%)`}
                    </span>
                  </div>
                </div>
              </div>

              {/* ── Existencias por almacén ── */}
              {item.type === 'product' && !item.hasVariants && (
                <div className="card" style={{ boxShadow: 'none' }}>
                  <div className="card-header">
                    <span className="card-title">Existencias por almacén</span>
                  </div>
                  <div className="card-body" style={{ paddingTop: 12 }}>
                    {(() => {
                      const entries = Object.entries(item.stockByWarehouse ?? {}).sort((a, b) => b[1] - a[1])
                      if (entries.length === 0) {
                        return <p style={{ fontSize: 13, color: 'var(--text-tertiary)' }}>Sin existencias</p>
                      }
                      return (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                          {entries.map(([warehouseName, qty]) => (
                            <div key={warehouseName} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, fontSize: 13 }}>
                              <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>{warehouseName}</span>
                              <span style={{ fontWeight: 500, flexShrink: 0 }}>{qty}</span>
                            </div>
                          ))}
                        </div>
                      )
                    })()}
                  </div>
                </div>
              )}

              {/* ── Ubicaciones (Zona / Rack) ── */}
              {item.type === 'product' && !item.hasVariants && (
                <div className="card" style={{ boxShadow: 'none' }}>
                  <div className="card-header">
                    <span className="card-title" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <MapPin size={13} style={{ color: 'var(--text-tertiary)' }} /> Ubicaciones
                    </span>
                  </div>
                  <div className="card-body" style={{ paddingTop: 12 }}>
                    {ubicaciones.length === 0 ? (
                      <p style={{ fontSize: 13, color: 'var(--text-tertiary)' }}>Sin ubicaciones asignadas.</p>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {ubicaciones.map((u) => (
                          <div
                            key={u.id}
                            style={{
                              display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px',
                              border: '1px solid var(--border-default)', borderRadius: 'var(--radius-md)',
                            }}
                          >
                            <MapPin size={13} style={{ color: 'var(--text-tertiary)', flexShrink: 0 }} />
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <span style={{ fontSize: 13, fontWeight: 500 }}>
                                {u.zonaName ?? '—'} / {u.ubicacionName ?? u.ubicacionId}
                              </span>
                              <span style={{ display: 'block', fontSize: 11, color: 'var(--text-tertiary)' }}>{u.warehouse}</span>
                            </div>
                            {u.esPrincipal && <span className="badge badge-success">Principal</span>}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {item.internalDescription && (
                <div className="detail-field">
                  <span className="detail-label">Descripción</span>
                  <span className="detail-value-dim">{item.internalDescription}</span>
                </div>
              )}
            </div>

            <div className="modal-foot">
              <button className="btn btn-secondary" onClick={onClose}>Cerrar</button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
