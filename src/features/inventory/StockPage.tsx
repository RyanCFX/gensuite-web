import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { listInventory } from '@/shared/api/inventory'
import { isApiErrorCode, ERROR_CODES } from '@/shared/api/client'
import { formatDOP, formatNumber } from '@/lib/formatters'
import { PageHeader } from '@/components/shared/PageHeader'
import { RecargarButton } from '@/components/shared/RecargarButton'
import { DollarSign, TrendingUp, Package } from 'lucide-react'
import { useSortState } from '@/shared/hooks/useSortState'
import { SortableTh } from '@/shared/ui/SortableTh'
import { useAuthStore } from '@/stores/auth.store'
import { Select, SelectItem } from '@/components/ui/select'
import { OpcionesSelect } from '@/shared/ui/OpcionesSelect'
import { useFiltrosPantalla } from '@/shared/permissions/useAcceso'
import { useDatosArticulo, veAlgunPrecio, restringidosDe } from '@/shared/permissions/datosArticulo'
import { DatoRestringido } from '@/shared/ui/DatoRestringido'
import { FilterField } from '@/shared/ui/FilterField'
import { useResizableColumns } from '@/shared/hooks/useResizableColumns'
import { SearchInput } from '@/shared/ui/SearchInput'

const COLUMNS = [
  { key: 'codigo', width: 110 },
  { key: 'nombre', width: 220 },
  { key: 'almacen', width: 120 },
  { key: 'categoria', width: 130 },
  { key: 'stock', width: 90 },
  { key: 'disponible', width: 110 },
  { key: 'ubicacion', width: 140 },
  { key: 'costoUnit', width: 110 },
  { key: 'precioVenta', width: 110 },
  { key: 'inversion', width: 120 },
  { key: 'valorVenta', width: 120 },
  { key: 'ganancia', width: 110 },
  { key: 'estado', width: 100 },
]

export default function StockPage() {
  const authUser = useAuthStore((s) => s.user)
  const [warehouse, setWarehouse] = useState<string>('all')
  const [branch, setBranch] = useState('')
  const [category, setCategory] = useState('')
  const [brand, setBrand] = useState('')
  const [stockFilter, setStockFilter] = useState<string>('all')
  const { orderBy, sort } = useSortState()
  const { widths: colWidths, startResize } = useResizableColumns(COLUMNS)

  // Filtros protegidos v2 (pantalla `inventario.stock` = gate sin el último segmento).
  const filtros = useFiltrosPantalla('inventario.stock')

  // ─── Datos del artículo (§3): dos formas de lista según `existenciasAlmacen` (§6.3) ──
  // Fuente A (store) decide estructura y controles; Fuente B (meta) confirma y pinta celdas.
  // Columnas restringidas: se OCULTAN (misma política que Productos).
  const datos = useDatosArticulo()
  const hayPrecio = veAlgunPrecio(datos)
  const colAlmacen = datos.existenciasAlmacen
  const colStock = datos.stock
  const colDisponible = datos.stock
  const colCostoUnit = datos.costo
  const colPrecioVenta = hayPrecio
  const colInversion = datos.stock && datos.costo
  const colValorVenta = datos.stock && hayPrecio
  const colGanancia = datos.stock && datos.costo && hayPrecio
  const colEstado = datos.stock
  const colUbicacion = datos.existenciasAlmacen
  // Columnas visibles: 3 fijas (código, nombre, categoría) + condicionales.
  const colCount = 3
    + (colAlmacen ? 1 : 0) + (colStock ? 1 : 0) + (colDisponible ? 1 : 0) + (colUbicacion ? 1 : 0)
    + (colCostoUnit ? 1 : 0) + (colPrecioVenta ? 1 : 0) + (colInversion ? 1 : 0)
    + (colValorVenta ? 1 : 0) + (colGanancia ? 1 : 0) + (colEstado ? 1 : 0)

  // Sin `existenciasAlmacen` no se envían warehouse/branch (§7.2) y se descartan si cambian los
  // permisos con la pantalla abierta.
  const visibilidadKey = JSON.stringify(datos)
  /* eslint-disable react-hooks/set-state-in-effect -- descarta filtros que el permiso nuevo ya no permite */
  useEffect(() => {
    if (!datos.existenciasAlmacen) { setWarehouse('all'); setBranch('') }
    if (!datos.stock) setStockFilter('all')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibilidadKey])
  /* eslint-enable react-hooks/set-state-in-effect */

  const rawParams = {
    warehouse: datos.existenciasAlmacen && warehouse !== 'all' ? warehouse : undefined,
    branch: datos.existenciasAlmacen && warehouse === 'all' ? (branch || undefined) : undefined,
    limit: 100,
    orderBy: orderBy || undefined,
  }
  const { limpios: params } = filtros.sanear(rawParams)

  const [reintentoDato, setReintentoDato] = useState(false)
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['inventory', { warehouse, branch, stockFilter, orderBy }],
    queryFn: () => listInventory(params),
  })

  // Defensa §7.3: ante 403 DATO_NO_PERMITIDO se quitan warehouse/branch y el orden por stock,
  // y se reintenta una sola vez.
  /* eslint-disable react-hooks/set-state-in-effect -- reintento único tras 403, no en cada render */
  useEffect(() => {
    if (error && isApiErrorCode(error, ERROR_CODES.DATO_NO_PERMITIDO) && !reintentoDato) {
      setReintentoDato(true)
      setWarehouse('all')
      setBranch('')
      if (orderBy.replace(/^-/, '') === 'currentStock') sort('itemCode')
    }
  }, [error, reintentoDato, orderBy, sort])
  /* eslint-enable react-hooks/set-state-in-effect */

  const summary = data?.summary
  const restr = restringidosDe(data ?? {})
  // Forma colapsada: una fila por artículo (warehouse null). Se confirma con la respuesta;
  // antes de que llegue, rige la Fuente A.
  const colapsada = data ? restr.has('existenciasAlmacen') : !datos.existenciasAlmacen

  // Client-side filter by category, brand and stock status
  const allItems = data?.items ?? []
  const items = allItems.filter((item) => {
    if (category && !item.category?.toLowerCase().includes(category.toLowerCase()) &&
        !item.itemName.toLowerCase().includes(category.toLowerCase())) return false
    if (brand && !item.brand?.toLowerCase().includes(brand.toLowerCase())) return false
    // Sin dato `stock` no hay filtro de estado (el control está oculto); el `?? 0` solo cubre
    // respuestas a medio cargar, nunca un null por permiso.
    if (stockFilter === 'in_stock' && (item.actualQty ?? 0) <= 0) return false
    if (stockFilter === 'out_of_stock' && (item.actualQty ?? 0) > 0) return false
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
        title={<><span className="page-title-dot" />Stock Actual</>}
        description={colapsada ? 'Totales por artículo (sin desglose por almacén)' : 'Vista del inventario por almacén'}
        action={<RecargarButton />}
      />

      <div className="stats-row">
        <div className="stat-card">
          <div className="stat-card-top">
            <div className="stat-icon-badge"><DollarSign size={16} /></div>
            <span className="stat-label">Inversión Total</span>
          </div>
          {isLoading
            ? <div className="skeleton-box" style={{ height: 28, width: '70%' }} />
            : <div className="stat-value">{summary?.totalInvestment == null ? '—' : formatDOP(summary.totalInvestment)}</div>}
        </div>

        <div className="stat-card">
          <div className="stat-card-top">
            <div className="stat-icon-badge"><Package size={16} /></div>
            <span className="stat-label">Valor de Venta</span>
          </div>
          {isLoading
            ? <div className="skeleton-box" style={{ height: 28, width: '70%' }} />
            : <div className="stat-value">{summary?.totalSaleValue == null ? '—' : formatDOP(summary.totalSaleValue)}</div>}
        </div>

        <div className="stat-card">
          <div className="stat-card-top">
            <div className="stat-icon-badge"><TrendingUp size={16} /></div>
            <span className="stat-label">Ganancia Potencial</span>
          </div>
          {isLoading
            ? <div className="skeleton-box" style={{ height: 28, width: '70%' }} />
            : <div className="stat-value">{summary?.totalPotentialProfit == null ? '—' : formatDOP(summary.totalPotentialProfit)}</div>}
        </div>
      </div>

      {authUser?.defaultWarehouse && !colapsada && (
        <div style={{ marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
          <span className="badge badge-info">
            Viendo: {authUser.defaultWarehouse}
          </span>
          <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>
            {warehouse !== 'all' ? `(filtro manual: ${warehouse})` : 'almacén por defecto'}
          </span>
        </div>
      )}

      <div className="card filter-card-navy" style={{ marginBottom: 20 }}>
        <div className="card-body">
          <div className="filter-bar" style={{ margin: 0 }}>
            <div className="filter-bar-left">
              {filtros.puedeFiltrar('warehouse') && datos.existenciasAlmacen && (
              <OpcionesSelect hideOnForbidden filterLabel="Almacén" filterStyle={{ width: 200 }}
                  recurso="almacenes"
                  value={warehouse === 'all' ? '' : warehouse}
                  onChange={(val) => { setWarehouse(val || 'all'); if (val) setBranch('') }}
                  selectedLabel={warehouse === 'all' ? '' : warehouse}
                  placeholder="Todos los almacenes"
                />
              )}
              {warehouse === 'all' && filtros.puedeFiltrar('branch') && datos.existenciasAlmacen && (
                <OpcionesSelect hideOnForbidden filterLabel="Sucursal" filterStyle={{ width: 200 }}
                    recurso="sucursales"
                    value={branch}
                    onChange={setBranch}
                    selectedLabel={branch}
                    placeholder="Todas las sucursales"
                  />
              )}
              <FilterField label="Categoría / nombre">
                <SearchInput variant="field" style={{ width: 180 }} placeholder="Categoría / nombre" value={category} onChange={(v) => setCategory(v)} /></FilterField>
              <FilterField label="Marca">
                <SearchInput variant="field" style={{ width: 160 }} placeholder="Marca" value={brand} onChange={(v) => setBrand(v)} /></FilterField>
              {datos.stock && (
              <FilterField label="Estado">
                <Select value={stockFilter} onValueChange={setStockFilter}>
                  <SelectItem value="all">Todos los estados</SelectItem>
                  <SelectItem value="in_stock">En stock</SelectItem>
                  <SelectItem value="out_of_stock">Sin stock</SelectItem>
                </Select>
              </FilterField>
              )}
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
                  label="Código"
                  sortKey="itemCode"
                  orderBy={orderBy}
                  onSort={sort}
                  resizeHandle={<span className="col-resize-handle" onMouseDown={startResize('codigo')} />}
                />
                <SortableTh
                  label="Nombre"
                  sortKey="itemName"
                  orderBy={orderBy}
                  onSort={sort}
                  resizeHandle={<span className="col-resize-handle" onMouseDown={startResize('nombre')} />}
                />
                {colAlmacen && (
                <th>
                  Almacén
                  <span className="col-resize-handle" onMouseDown={startResize('almacen')} />
                </th>
                )}
                <th>
                  Categoría
                  <span className="col-resize-handle" onMouseDown={startResize('categoria')} />
                </th>
                {colStock ? (
                <SortableTh
                  label="Stock"
                  sortKey="currentStock"
                  orderBy={orderBy}
                  onSort={sort}
                  align="right"
                  resizeHandle={<span className="col-resize-handle" onMouseDown={startResize('stock')} />}
                />
                ) : null}
                {colDisponible && (
                <th style={{ textAlign: 'right' }} title="Stock físico menos lo reservado nativamente para pedidos concretos — lo que realmente se le puede prometer a un cliente nuevo ahora mismo">
                  Disponible
                  <span className="col-resize-handle" onMouseDown={startResize('disponible')} />
                </th>
                )}
                {colUbicacion && (
                <th>
                  Ubicación
                  <span className="col-resize-handle" onMouseDown={startResize('ubicacion')} />
                </th>
                )}
                {colCostoUnit && (
                <th style={{ textAlign: 'right' }}>
                  Costo Unit.
                  <span className="col-resize-handle" onMouseDown={startResize('costoUnit')} />
                </th>
                )}
                {colPrecioVenta && (
                <th style={{ textAlign: 'right' }}>
                  Precio Venta
                  <span className="col-resize-handle" onMouseDown={startResize('precioVenta')} />
                </th>
                )}
                {colInversion && (
                <th style={{ textAlign: 'right' }}>
                  Inversión
                  <span className="col-resize-handle" onMouseDown={startResize('inversion')} />
                </th>
                )}
                {colValorVenta && (
                <th style={{ textAlign: 'right' }}>
                  Valor Venta
                  <span className="col-resize-handle" onMouseDown={startResize('valorVenta')} />
                </th>
                )}
                {colGanancia && (
                <th style={{ textAlign: 'right' }}>
                  Ganancia
                  <span className="col-resize-handle" onMouseDown={startResize('ganancia')} />
                </th>
                )}
                {colEstado && (
                <th>
                  Estado
                  <span className="col-resize-handle" onMouseDown={startResize('estado')} />
                </th>
                )}
              </tr>
            </thead>
            <tbody>
              {isLoading
                ? Array.from({ length: 8 }).map((_, i) => (
                    <tr key={i}>
                      {Array.from({ length: colCount }).map((__, j) => (
                        <td key={j}><div className="skeleton-box" style={{ height: 14, width: '100%' }} /></td>
                      ))}
                    </tr>
                  ))
                : isError
                  ? (
                      <tr>
                        <td colSpan={colCount} style={{ textAlign: 'center', padding: '32px 0', color: 'var(--error-text)' }}>
                          Error al cargar el inventario
                        </td>
                      </tr>
                    )
                  : items.length === 0
                    ? (
                        <tr>
                          <td colSpan={colCount}>
                            <div className="empty-state">
                              <div className="empty-title">Sin artículos</div>
                              <p className="empty-sub">No hay artículos en inventario con los filtros seleccionados.</p>
                            </div>
                          </td>
                        </tr>
                      )
                    : items.map((item) => {
                        // §5.5: sin número real no hay badge de estado (nunca "Sin stock" por permiso).
                        const qtyConocida = colStock && item.actualQty != null
                        const status = qtyConocida ? getStockStatus(item.actualQty as number) : null
                        return (
                          <tr key={`${item.itemCode}-${item.warehouse ?? ''}`}>
                            <td style={{ fontFamily: 'var(--font-body)', fontSize: 12 }}>{item.itemCode}</td>
                            <td style={{ fontWeight: 500 }}>{item.itemName}</td>
                            {colAlmacen && <td className="td-muted">{item.warehouse ?? '—'}</td>}
                            <td className="td-muted">{item.category ?? '—'}</td>
                            {colStock && (
                            <td style={{ textAlign: 'right' }}>
                              {item.actualQty == null
                                ? <DatoRestringido bloqueante={restr.has('stock')}>—</DatoRestringido>
                                : formatNumber(item.actualQty)}
                            </td>
                            )}
                            {colDisponible && (
                            <td style={{ textAlign: 'right' }}>
                              {item.disponibleParaVender == null ? (
                                <DatoRestringido bloqueante={restr.has('stock')}>—</DatoRestringido>
                              ) : (
                                <>{formatNumber(item.disponibleParaVender)}</>
                              )}
                              {item.reservedStock != null && item.reservedStock > 0 && (
                                <div className="td-muted" style={{ fontSize: 11 }}>{item.reservedStock} reservado</div>
                              )}
                            </td>
                            )}
                            {colUbicacion && (
                            <td className="td-muted" title={item.ubicaciones && item.ubicaciones.length > 1 ? item.ubicaciones.join(', ') : undefined}>
                              {!item.ubicaciones || item.ubicaciones.length === 0
                                ? 'Sin asignar'
                                : item.ubicaciones.length === 1
                                  ? item.ubicaciones[0]
                                  : `${item.ubicaciones[0]} +${item.ubicaciones.length - 1}`}
                            </td>
                            )}
                            {colCostoUnit && (
                            <td style={{ textAlign: 'right' }}>
                              {item.valuationRate == null
                                ? <DatoRestringido bloqueante={restr.has('costo')}>—</DatoRestringido>
                                : formatDOP(item.valuationRate)}
                            </td>
                            )}
                            {colPrecioVenta && (
                            <td style={{ textAlign: 'right' }}>
                              {item.standardRate == null
                                ? <DatoRestringido bloqueante={!hayPrecio || restr.has('precioA')}>—</DatoRestringido>
                                : formatDOP(item.standardRate)}
                            </td>
                            )}
                            {colInversion && (
                            <td style={{ textAlign: 'right' }}>
                              {item.investmentValue == null
                                ? <DatoRestringido bloqueante={restr.has('stock') || restr.has('costo')}>—</DatoRestringido>
                                : formatDOP(item.investmentValue)}
                            </td>
                            )}
                            {colValorVenta && (
                            <td style={{ textAlign: 'right' }}>
                              {item.saleValue == null
                                ? <DatoRestringido bloqueante={restr.has('stock') || !hayPrecio}>—</DatoRestringido>
                                : formatDOP(item.saleValue)}
                            </td>
                            )}
                            {colGanancia && (
                            <td style={{ textAlign: 'right' }}>
                              {item.potentialProfit == null
                                ? <DatoRestringido bloqueante>—</DatoRestringido>
                                : formatDOP(item.potentialProfit)}
                            </td>
                            )}
                            {colEstado && (
                            <td>
                              {status === null ? (
                                <DatoRestringido bloqueante>—</DatoRestringido>
                              ) : (
                                <span className={`badge ${stockBadgeClass[status]}`}>
                                  {stockLabel[status]}
                                </span>
                              )}
                            </td>
                            )}
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
