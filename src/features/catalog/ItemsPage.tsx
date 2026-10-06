import { useEffect, useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { listItems, toggleItem, listServicios, toggleServicio } from '@/shared/api/catalog'
import { listUOMs } from '@/shared/api/config'
import type { Item } from '@/shared/api/types'
import type { DatoArticulo } from '@/shared/permissions/datosArticulo'
import { isApiErrorCode, ERROR_CODES } from '@/shared/api/client'
import { formatDOP } from '@/lib/formatters'
import { Plus, Eye, ToggleLeft, ToggleRight, ChevronLeft, ChevronRight, SlidersHorizontal } from 'lucide-react'
import { ActionsMenu, ActionsMenuItem } from '@/shared/ui/ActionsMenu'
import { PageHeader } from '@/components/shared/PageHeader'
import { RecargarButton } from '@/components/shared/RecargarButton'
import { useSortState } from '@/shared/hooks/useSortState'
import { SortableTh } from '@/shared/ui/SortableTh'
import { SearchSelect } from '@/shared/ui/SearchSelect'
import type { SearchSelectOption } from '@/shared/ui/SearchSelect'
import { Select, SelectItem } from '@/components/ui/select'
import { FilterField } from '@/shared/ui/FilterField'
import { Drawer } from '@/shared/ui/Drawer'
import { listPrincipiosActivos } from '@/shared/api/principios-activos'
import { usePermissionsStore } from '@/stores/permissions.store'
import { usePuede } from '@/shared/permissions/can'
import { useResizableColumns } from '@/shared/hooks/useResizableColumns'
import { OpcionesSelect } from '@/shared/ui/OpcionesSelect'
import { SearchInput } from '@/shared/ui/SearchInput'
import { useDatosArticulo, veAlgunPrecio, restringidosDe } from '@/shared/permissions/datosArticulo'
import { DatoRestringido } from '@/shared/ui/DatoRestringido'

const PAGE_SIZE = 20

// Política de columnas restringidas (§5.2 del doc de datos del artículo, única en toda la app):
// la columna se OCULTA cuando el dato no es visible (Fuente A, store); si el store está
// desactualizado y la respuesta igual recorta, la celda muestra "—" (Fuente B, meta).
function StockBadge({ item, restringido }: { item: Item; restringido?: boolean }) {
  if (restringido) return <DatoRestringido bloqueante />
  const stock = item.currentStock ?? 0
  let status: 'in-stock' | 'low-stock' | 'out-stock'
  if (stock <= 0) status = 'out-stock'
  else if (stock <= 10) status = 'low-stock'
  else status = 'in-stock'

  const labelMap = {
    'in-stock': 'En stock',
    'low-stock': 'Stock bajo',
    'out-stock': 'Sin stock',
  }

  return (
    <span className={`badge badge-${status}`}>
      {labelMap[status]} ({stock})
    </span>
  )
}

function AutoDiscountBadge({ item }: { item: Item }) {
  const ad = item.autoDiscount
  if (!ad) return null
  if (ad.discountType === 'Discount Percentage') {
    return <span className="badge badge-discount">{ad.discountPercentage ?? 0}% OFF</span>
  }
  return <span className="badge badge-discount">{ad.discountAmount ?? 0} OFF</span>
}

function ItemTypeBadge({ item }: { item: Item }) {
  if (item.hasVariants) return <span className="badge badge-info">Template</span>
  if (item.variantOf) return <span className="badge badge-neutral">Variante</span>
  return <span className="badge badge-draft">Artículo</span>
}

export default function ItemsPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const location = useLocation()

  // Productos y Servicios son módulos separados que comparten esta implementación — el tipo
  // queda fijo según la ruta desde la que se entró, nunca es elegible por el usuario.
  const fixedType: 'product' | 'service' = location.pathname.startsWith('/catalogo/servicios') ? 'service' : 'product'
  const isProduct = fixedType === 'product'
  const basePath = isProduct ? '/inventario/productos' : '/catalogo/servicios'
  const moduleLabel = isProduct ? 'Productos' : 'Servicios'
  // `catalogo.items.*` aplica solo a productos; la pantalla de servicios usa
  // `catalogo.servicios.*` (openapi.json: Lista de Servicios).
  const puedeCrear = usePuede(isProduct ? 'catalogo.items.crear' : 'catalogo.servicios.crear')
  const puedeActivar = usePuede(isProduct ? 'catalogo.items.activar' : 'catalogo.servicios.activar')

  const [search, setSearch] = useState('')
  const [templateFilter, setTemplateFilter] = useState<'all' | 'template' | 'standalone'>('all')
  const [categoryFilter, setCategoryFilter] = useState<string>('')
  const [brandFilter, setBrandFilter] = useState<string>('')
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'disabled'>('active')
  const [page, setPage] = useState(1)
  const { orderBy, sort } = useSortState()

  const [stockUomFilter, setStockUomFilter] = useState('')
  const [hasWarrantyFilter, setHasWarrantyFilter] = useState<'all' | 'true' | 'false'>('all')
  const [warrantyPeriodMin, setWarrantyPeriodMin] = useState('')
  const [warrantyPeriodMax, setWarrantyPeriodMax] = useState('')
  const [pricesMin, setPricesMin] = useState('')
  const [pricesMax, setPricesMax] = useState('')
  const [priceModeFilter, setPriceModeFilter] = useState<'all' | 'manual' | 'cost_plus'>('all')
  const [maxDiscountPctMin, setMaxDiscountPctMin] = useState('')
  const [maxDiscountPctMax, setMaxDiscountPctMax] = useState('')
  const [trackingTypeFilter, setTrackingTypeFilter] = useState<'all' | 'none' | 'serial' | 'batch'>('all')
  const [moreFiltersOpen, setMoreFiltersOpen] = useState(false)

  // ─── Composición de medicamentos (vertical Farmacia) — docs/tasks/
  // PROMPT_COMPOSICION_MEDICAMENTOS_FRONTEND.md §7. Filtros completamente ausentes (ni ocultos ni
  // deshabilitados) para un tenant que no sea Farmacia. ─────────────────────────────────────────
  const esFarmacia = usePermissionsStore((s) => s.vertical) === 'farmacia'
  const [principioActivoFilter, setPrincipioActivoFilter] = useState('')
  const [esMedicamentoFilter, setEsMedicamentoFilter] = useState(false)

  const debouncedSearch = search
  const offset = (page - 1) * PAGE_SIZE

  // ─── Datos del artículo (§3) ──────────────────────────────────────────
  // Fuente A (store) decide estructura y controles; Fuente B (meta de la respuesta) decide
  // cómo se pinta cada celda. Columnas restringidas: se OCULTAN (política única de la app).
  const datos = useDatosArticulo()
  const hayPrecio = veAlgunPrecio(datos)
  const colPrecio = hayPrecio
  const colStock = isProduct && datos.stock
  const colDescuento = datos.descuento
  const colCount = (isProduct ? 10 : 8) - (colPrecio ? 0 : 1) - (colStock ? 0 : 1) - (colDescuento ? 0 : 1)

  // Orden efectivo: nunca se envía un orden apoyado en un dato restringido (§7.1).
  const campoOrden = orderBy.startsWith('-') ? orderBy.slice(1) : orderBy
  const ordenRestringido =
    (campoOrden === 'standardRate' || campoOrden === 'rate') ? !hayPrecio
    : campoOrden === 'currentStock' ? !datos.stock
    : false
  const orderByEfectivo = ordenRestringido ? undefined : (orderBy || undefined)

  // Si cambian los permisos con la pantalla abierta, se descartan los filtros que ya no
  // corresponden (no hay estado guardado en URL/localStorage en esta pantalla).
  const visibilidadKey = JSON.stringify(datos)
  useEffect(() => {
    if (!veAlgunPrecio(datos)) { setPricesMin(''); setPricesMax('') }
    if (!datos.costo) setPriceModeFilter('all')
    if (!datos.descuento) { setMaxDiscountPctMin(''); setMaxDiscountPctMax('') }
    setPage(1)
    // Solo ante cambio de visibilidad, no en cada tecleo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibilidadKey])

  const [reintentoDato, setReintentoDato] = useState(false)
  const { data, isLoading, isError, error } = useQuery({
    queryKey: [
      'items',
      {
        search: debouncedSearch, fixedType, templateFilter, categoryFilter, brandFilter, statusFilter, offset, orderBy: orderByEfectivo,
        stockUomFilter, hasWarrantyFilter, warrantyPeriodMin, warrantyPeriodMax,
        pricesMin, pricesMax, priceModeFilter, maxDiscountPctMin, maxDiscountPctMax, trackingTypeFilter,
        principioActivoFilter, esMedicamentoFilter,
      },
    ],
    queryFn: () => {
      // Productos → GET /catalog/items (solo productos: type=service da 403/vacío).
      // Servicios → GET /catalog/servicios (el backend fuerza type=service).
      // Los filtros apoyados en datos restringidos no se envían (§7.1); el resto igual que antes.
      const baseParams = {
        search: debouncedSearch || undefined,
        category: categoryFilter || undefined,
        brand: brandFilter || undefined,
        disabled: statusFilter === 'all' ? undefined : statusFilter === 'disabled' ? 'true' : 'false',
        isTemplate: templateFilter === 'template' ? true : templateFilter === 'standalone' ? false : undefined,
        limit: PAGE_SIZE,
        offset,
        orderBy: orderByEfectivo,
        stockUom: isProduct ? (stockUomFilter || undefined) : undefined,
        hasWarranty: hasWarrantyFilter === 'all' ? undefined : hasWarrantyFilter === 'true',
        warrantyPeriodMin: warrantyPeriodMin ? Number(warrantyPeriodMin) : undefined,
        warrantyPeriodMax: warrantyPeriodMax ? Number(warrantyPeriodMax) : undefined,
        pricesMin: hayPrecio && pricesMin ? Number(pricesMin) : undefined,
        pricesMax: hayPrecio && pricesMax ? Number(pricesMax) : undefined,
        priceMode: datos.costo && priceModeFilter !== 'all' ? priceModeFilter : undefined,
        maxDiscountPctMin: datos.descuento && maxDiscountPctMin ? Number(maxDiscountPctMin) : undefined,
        maxDiscountPctMax: datos.descuento && maxDiscountPctMax ? Number(maxDiscountPctMax) : undefined,
        trackingType: isProduct ? (trackingTypeFilter === 'all' ? undefined : trackingTypeFilter) : undefined,
        principioActivo: esFarmacia ? (principioActivoFilter || undefined) : undefined,
        esMedicamento: esFarmacia && esMedicamentoFilter ? true : undefined,
      }
      return isProduct ? listItems({ ...baseParams, type: 'product' }) : listServicios(baseParams)
    },
  })

  // Defensa §7.3: si igual llega 403 DATO_NO_PERMITIDO (permiso cambiado con la pantalla
  // abierta), se quitan los filtros apoyados en datos y se reintenta una sola vez — el cambio
  // de estado re-dispara la query. El interceptor ya mostró el mensaje y refrescó /me/acceso.
  useEffect(() => {
    if (error && isApiErrorCode(error, ERROR_CODES.DATO_NO_PERMITIDO) && !reintentoDato) {
      setReintentoDato(true)
      setPricesMin('')
      setPricesMax('')
      setPriceModeFilter('all')
      setMaxDiscountPctMin('')
      setMaxDiscountPctMax('')
      setPage(1)
    }
  }, [error, reintentoDato])

  // Fuente B: datos recortados en ESTA respuesta (para pintar cada celda).
  const restr = restringidosDe(data ?? {})
  // Nivel principal de precio: defaultPriceTier solo si ese nivel es visible; si no, el primer
  // nivel visible; null = ninguno visible.
  const nivelPrincipal: 'A' | 'B' | 'C' | null = (() => {
    const niveles: ('A' | 'B' | 'C')[] = ['A', 'B', 'C']
    const visible = (t: 'A' | 'B' | 'C') => !restr.has(`precio${t}` as DatoArticulo)
    const def = data?.meta.defaultPriceTier
    if (def && visible(def)) return def
    return niveles.find(visible) ?? null
  })()

  /** Celda de precio principal: nivel visible o `—` (nunca 0 por permiso). */
  function celdaPrecio(item: Item) {
    if (item.hasVariants || !nivelPrincipal) return <span className="td-muted">—</span>
    const valor = item.prices?.[nivelPrincipal] ?? null
    if (valor == null) {
      return <DatoRestringido bloqueante={restr.has(`precio${nivelPrincipal}` as DatoArticulo)}>—</DatoRestringido>
    }
    return formatDOP(valor)
  }

  const { data: principiosActivosData } = useQuery({
    queryKey: ['principios-activos-filtro', {}],
    queryFn: () => listPrincipiosActivos({ soloActivos: true, limit: 100 }),
    enabled: esFarmacia,
  })
  const [principioActivoSearch, setPrincipioActivoSearch] = useState('')
  const principioActivoOptions: SearchSelectOption[] = (principiosActivosData?.items ?? [])
    .filter((p) => !principioActivoSearch || p.nombre.toLowerCase().includes(principioActivoSearch.toLowerCase()))
    .map((p) => ({ value: p.id, label: p.nombre }))



  const { data: uomsData } = useQuery({
    queryKey: ['uoms-all'],
    queryFn: () => listUOMs(),
    staleTime: 60 * 60_000,
    // Solo alimenta el filtro de UOM del modal de más filtros.
    enabled: moreFiltersOpen,
  })



  const [stockUomSearch, setStockUomSearch] = useState('')
  const stockUomOptions: SearchSelectOption[] = (uomsData ?? [])
    .filter((u) => !stockUomSearch || u.name.toLowerCase().includes(stockUomSearch.toLowerCase()))
    .map((u) => ({ value: u.name, label: u.name }))

  const toggleMutation = useMutation({
    mutationFn: (id: string) => (isProduct ? toggleItem(id) : toggleServicio(id)),
    onSuccess: (item: Item) => {
      toast.success(item.disabled ? 'Artículo desactivado' : 'Artículo activado')
      queryClient.invalidateQueries({ queryKey: ['items'] })
    },
    onError: () => {
      toast.error('Error al cambiar el estado del artículo')
    },
  })


  const totalPages = data ? Math.ceil(data.meta.total / PAGE_SIZE) : 1

  const activeMoreFiltersCount = [
    ...(hayPrecio ? [pricesMin, pricesMax] : []),
    ...(datos.descuento ? [maxDiscountPctMin, maxDiscountPctMax] : []),
    stockUomFilter, warrantyPeriodMin, warrantyPeriodMax,
  ].filter((v) => v !== '').length
    + (hasWarrantyFilter !== 'all' ? 1 : 0)
    + (datos.costo && priceModeFilter !== 'all' ? 1 : 0)
    + (trackingTypeFilter !== 'all' ? 1 : 0)
    + (esFarmacia && principioActivoFilter ? 1 : 0)
    + (esFarmacia && esMedicamentoFilter ? 1 : 0)

  const ITEMS_COLUMNS = [
    { key: 'codigo', width: 110 },
    { key: 'nombre', width: 220 },
    ...(isProduct ? [{ key: 'rol', width: 100 }] : []),
    { key: 'categoria', width: 160 },
    { key: 'marca', width: 140 },
    ...(colPrecio ? [{ key: 'precio', width: 110 }] : []),
    ...(colStock ? [{ key: 'stock', width: 90 }] : []),
    { key: 'estado', width: 100 },
    ...(colDescuento ? [{ key: 'descuento', width: 110 }] : []),
    { key: 'actions', width: 48 },
  ]
  const { widths: colWidths, startResize } = useResizableColumns(ITEMS_COLUMNS)

  function clearMoreFilters() {
    setStockUomFilter('')
    setHasWarrantyFilter('all')
    setWarrantyPeriodMin('')
    setWarrantyPeriodMax('')
    setPricesMin('')
    setPricesMax('')
    setPriceModeFilter('all')
    setMaxDiscountPctMin('')
    setMaxDiscountPctMax('')
    setTrackingTypeFilter('all')
    setPrincipioActivoFilter('')
    setEsMedicamentoFilter(false)
    setPage(1)
  }

  return (
    <div className="page-container">
      <PageHeader
        title={<><span className="page-title-dot" />{moduleLabel}</>}
        description={data ? `${data.meta.total} ${isProduct ? 'productos' : 'servicios'}` : undefined}
        action={
          <>
            <RecargarButton />
            {puedeCrear && (
              <button className="btn btn-navy" onClick={() => navigate(`${basePath}/nuevo`)}>
                <Plus size={16} />
                Nuevo {isProduct ? 'Producto' : 'Servicio'}
              </button>
            )}
          </>
        }
      />

      <div className="card filter-card-navy" style={{ marginBottom: 20 }}>
        <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="filter-bar" style={{ margin: 0 }}>
            <div className="filter-bar-left">
              <SearchInput placeholder="Buscar por código o nombre…" value={search} onChange={(v) => {
    setSearch(v)
    setPage(1)
  }} />
              <OpcionesSelect hideOnForbidden filterLabel="Categoría" filterStyle={{ width: 200 }} recurso="categorias" value={categoryFilter} onChange={(val) => { setCategoryFilter(val); setPage(1) }} placeholder="Todas las categorías" />
              <OpcionesSelect hideOnForbidden filterLabel="Marca" filterStyle={{ width: 200 }} recurso="marcas" value={brandFilter} onChange={(val) => { setBrandFilter(val); setPage(1) }} placeholder="Todas las marcas" />
              <FilterField label="Estado">
                <Select
                  value={statusFilter}
                  onValueChange={(val) => { setStatusFilter(val as 'all' | 'active' | 'disabled'); setPage(1) }}
                >
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="active">Activos</SelectItem>
                  <SelectItem value="disabled">Inactivos</SelectItem>
                </Select>
              </FilterField>

              <button type="button" className="btn btn-secondary btn-size-sm" onClick={() => setMoreFiltersOpen(true)}>
                <SlidersHorizontal size={13} />
                Más filtros
                {activeMoreFiltersCount > 0 && (
                  <span className="badge badge-brand" style={{ marginLeft: 2 }}>{activeMoreFiltersCount}</span>
                )}
              </button>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
            {/* Template / standalone toggle */}
            <div style={{ display: 'flex', gap: 4 }}>
              {[
                { value: 'all', label: 'Todos' },
                { value: 'template', label: 'Solo Plantillas' },
                { value: 'standalone', label: 'Solo Artículos' },
              ].map((opt) => (
                <button
                  key={opt.value}
                  className={`btn btn-size-xs ${templateFilter === opt.value ? 'btn-navy' : 'btn-ghost'}`}
                  onClick={() => { setTemplateFilter(opt.value as typeof templateFilter); setPage(1) }}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="card navy-table-card">
        <div className="table-scroll">
          <table className="data-table navy-table items-table-resizable">
          <colgroup>
            {ITEMS_COLUMNS.map((c) => <col key={c.key} style={{ width: colWidths[c.key] }} />)}
          </colgroup>
          <thead>
            <tr>
              <SortableTh
                label="Código"
                sortKey="id"
                orderBy={orderBy}
                onSort={(k) => { sort(k); setPage(1) }}
                resizeHandle={<span className="col-resize-handle" onMouseDown={startResize('codigo')} />}
              />
              <SortableTh
                label="Nombre"
                sortKey="itemName"
                orderBy={orderBy}
                onSort={(k) => { sort(k); setPage(1) }}
                resizeHandle={<span className="col-resize-handle" onMouseDown={startResize('nombre')} />}
              />
              {isProduct && (
                <th>
                  Rol
                  <span className="col-resize-handle" onMouseDown={startResize('rol')} />
                </th>
              )}
              <th>
                Categoría
                <span className="col-resize-handle" onMouseDown={startResize('categoria')} />
              </th>
              <th>
                Marca
                <span className="col-resize-handle" onMouseDown={startResize('marca')} />
              </th>
              {colPrecio && (
                <SortableTh
                  label="Precio"
                  sortKey="standardRate"
                  orderBy={orderBy}
                  onSort={(k) => { sort(k); setPage(1) }}
                  align="right"
                  resizeHandle={<span className="col-resize-handle" onMouseDown={startResize('precio')} />}
                />
              )}
              {colStock && (
                <SortableTh
                  label="Stock"
                  sortKey="currentStock"
                  orderBy={orderBy}
                  onSort={(k) => { sort(k); setPage(1) }}
                  resizeHandle={<span className="col-resize-handle" onMouseDown={startResize('stock')} />}
                />
              )}
                <th>
                  Estado
                  <span className="col-resize-handle" onMouseDown={startResize('estado')} />
                </th>
              {colDescuento && (
                <th>
                  Descuento
                  <span className="col-resize-handle" onMouseDown={startResize('descuento')} />
                </th>
              )}
                <th />
            </tr>
          </thead>
          <tbody>
            {isLoading
              ? Array.from({ length: 6 }).map((_, i) => (
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
                        Error al cargar {isProduct ? 'los productos' : 'los servicios'}
                      </td>
                    </tr>
                  )
                : data?.items.length === 0
                  ? (
                      <tr>
                        <td colSpan={colCount}>
                          <div className="empty-state">
                            <p className="empty-title">{isProduct ? 'Sin productos' : 'Sin servicios'}</p>
                            <p className="empty-sub">No se encontraron {isProduct ? 'productos' : 'servicios'}.</p>
                          </div>
                        </td>
                      </tr>
                    )
                  : data?.items.map((item) => (
                      <tr
                        key={item.id}
                        className="table-row-clickable"
                        onClick={() => navigate(`${basePath}/${item.id}`)}
                      >
                        <td style={{ fontFamily: 'var(--font-body)', fontSize: 12 }}>{item.id}</td>
                        <td style={{ fontWeight: 500 }}>{item.itemName}</td>
                        {isProduct && <td><ItemTypeBadge item={item} /></td>}
                        <td className="td-muted">
                          {item.subcategoryName
                            ? `${item.categoryName ?? item.category} > ${item.subcategoryName}`
                            : item.categoryName ?? item.category ?? '—'}
                        </td>
                        <td className="td-muted">{item.brandName ?? '—'}</td>
          {colPrecio && (
          <td style={{ textAlign: 'right' }}>
            {celdaPrecio(item)}
          </td>
          )}
          {colStock && <td><StockBadge item={item} restringido={restr.has('stock')} /></td>}
          {colDescuento && (
          <td>
            {restr.has('descuento') ? (
              <DatoRestringido bloqueante>—</DatoRestringido>
            ) : (
              <>
                <AutoDiscountBadge item={item} />
                {item.allowsDiscount === false
                  ? <span className="badge badge-neutral" style={{ marginLeft: 4 }}>Sin dto.</span>
                  : null}
              </>
            )}
          </td>
          )}
                        <td>
                          {item.disabled
                            ? <span className="badge badge-neutral">Inactivo</span>
                            : <span className="badge badge-success">Activo</span>}
                        </td>
                        <td onClick={(e) => e.stopPropagation()} className="actions-cell">
                          <ActionsMenu>
                            <ActionsMenuItem onClick={() => navigate(`${basePath}/${item.id}`)}>
                              <Eye size={14} /> Ver detalle
                            </ActionsMenuItem>
                            {item.hasVariants && (
                              <ActionsMenuItem onClick={() => navigate(`${basePath}/${item.id}#variants`)}>
                                <Eye size={14} /> Ver variantes
                              </ActionsMenuItem>
                            )}
                            <ActionsMenuItem disabled={!puedeActivar || toggleMutation.isPending} onClick={() => toggleMutation.mutate(item.id)}>
                              {item.disabled
                                ? <><ToggleRight size={14} /> Activar</>
                                : <><ToggleLeft size={14} /> Desactivar</>}
                            </ActionsMenuItem>
                          </ActionsMenu>
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

      <Drawer
        open={moreFiltersOpen}
        onClose={() => setMoreFiltersOpen(false)}
        title="Más filtros"
        subtitle={`Refina la búsqueda de ${isProduct ? 'productos' : 'servicios'}`}
        footer={
          <>
            <button className="btn btn-ghost" onClick={clearMoreFilters}>Limpiar</button>
            <button className="btn btn-navy" onClick={() => setMoreFiltersOpen(false)}>Aplicar</button>
          </>
        }
      >
        {isProduct && (
          <div className="ff-wrap">
            <label className="ff-label">UOM de stock</label>
            <SearchSelect
              value={stockUomFilter}
              onChange={(val) => { setStockUomFilter(val); setPage(1) }}
              options={stockUomOptions}
              onSearch={setStockUomSearch}
              selectedLabel={stockUomFilter}
              placeholder="Todas las UOM"
            />
          </div>
        )}

        <div className="ff-wrap">
          <label className="ff-label">Garantía</label>
          <Select
            value={hasWarrantyFilter}
            onValueChange={(val) => { setHasWarrantyFilter(val as 'all' | 'true' | 'false'); setPage(1) }}
          >
            <SelectItem value="all">Garantía: Todos</SelectItem>
            <SelectItem value="true">Con garantía</SelectItem>
            <SelectItem value="false">Sin garantía</SelectItem>
          </Select>
        </div>

        <div className="ff-wrap">
          <label className="ff-label">Período de garantía</label>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input
              type="number"
              className="ff-input"
              placeholder="Mín."
              value={warrantyPeriodMin}
              onChange={(e) => { setWarrantyPeriodMin(e.target.value); setPage(1) }}
            />
            <span style={{ color: 'var(--text-secondary)', fontSize: 13 }}>—</span>
            <input
              type="number"
              className="ff-input"
              placeholder="Máx."
              value={warrantyPeriodMax}
              onChange={(e) => { setWarrantyPeriodMax(e.target.value); setPage(1) }}
            />
          </div>
        </div>

        {hayPrecio && (
        <div className="ff-wrap">
          <label className="ff-label">Precio</label>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input
              type="number"
              className="ff-input"
              placeholder="Mín."
              value={pricesMin}
              onChange={(e) => { setPricesMin(e.target.value); setPage(1) }}
            />
            <span style={{ color: 'var(--text-secondary)', fontSize: 13 }}>—</span>
            <input
              type="number"
              className="ff-input"
              placeholder="Máx."
              value={pricesMax}
              onChange={(e) => { setPricesMax(e.target.value); setPage(1) }}
            />
          </div>
        </div>
        )}

        {datos.costo && (
        <div className="ff-wrap">
          <label className="ff-label">Modo de precio</label>
          <Select
            value={priceModeFilter}
            onValueChange={(val) => { setPriceModeFilter(val as 'all' | 'manual' | 'cost_plus'); setPage(1) }}
          >
            <SelectItem value="all">Modo precio: Todos</SelectItem>
            <SelectItem value="manual">Manual</SelectItem>
            <SelectItem value="cost_plus">Costo + Margen</SelectItem>
          </Select>
        </div>
        )}

        {datos.descuento && (
        <div className="ff-wrap">
          <label className="ff-label">Descuento máximo (%)</label>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input
              type="number"
              className="ff-input"
              placeholder="Mín."
              value={maxDiscountPctMin}
              onChange={(e) => { setMaxDiscountPctMin(e.target.value); setPage(1) }}
            />
            <span style={{ color: 'var(--text-secondary)', fontSize: 13 }}>—</span>
            <input
              type="number"
              className="ff-input"
              placeholder="Máx."
              value={maxDiscountPctMax}
              onChange={(e) => { setMaxDiscountPctMax(e.target.value); setPage(1) }}
            />
          </div>
        </div>
        )}

        {isProduct && (
          <div className="ff-wrap">
            <label className="ff-label">Tracking</label>
            <Select
              value={trackingTypeFilter}
              onValueChange={(val) => { setTrackingTypeFilter(val as 'all' | 'none' | 'serial' | 'batch'); setPage(1) }}
            >
              <SelectItem value="all">Tracking: Todos</SelectItem>
              <SelectItem value="none">Sin tracking</SelectItem>
              <SelectItem value="serial">Serial</SelectItem>
              <SelectItem value="batch">Lote</SelectItem>
            </Select>
          </div>
        )}

        {esFarmacia && (
          <>
            <div className="ff-wrap">
              <label className="ff-label">Principio activo</label>
              <SearchSelect
                value={principioActivoFilter}
                onChange={(val) => { setPrincipioActivoFilter(val); setPage(1) }}
                options={principioActivoOptions}
                onSearch={setPrincipioActivoSearch}
                selectedLabel={principiosActivosData?.items.find((p) => p.id === principioActivoFilter)?.nombre ?? ''}
                placeholder="Todos los principios activos"
              />
            </div>
            <label className="ff-check-wrap">
              <input
                type="checkbox"
                checked={esMedicamentoFilter}
                onChange={(e) => { setEsMedicamentoFilter(e.target.checked); setPage(1) }}
              />
              Solo medicamentos
            </label>
          </>
        )}
      </Drawer>
    </div>
  )
}
