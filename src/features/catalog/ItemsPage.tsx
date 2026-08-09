import { useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { listItems, toggleItem, listCategories, listBrands } from '@/shared/api/catalog'
import { listUOMs } from '@/shared/api/config'
import type { Item } from '@/shared/api/types'
import { useDebounce } from '@/lib/useDebounce'
import { formatDOP } from '@/lib/formatters'
import { Plus, Eye, ToggleLeft, ToggleRight, ChevronLeft, ChevronRight, Search } from 'lucide-react'
import { ActionsMenu, ActionsMenuItem } from '@/shared/ui/ActionsMenu'
import { PageHeader } from '@/components/shared/PageHeader'
import { useSortState } from '@/shared/hooks/useSortState'
import { SortableTh } from '@/shared/ui/SortableTh'
import { SearchSelect } from '@/shared/ui/SearchSelect'
import type { SearchSelectOption } from '@/shared/ui/SearchSelect'
import { Select, SelectItem } from '@/components/ui/select'

const PAGE_SIZE = 20

function StockBadge({ item }: { item: Item }) {
  if (item.type === 'service') return null

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

  const [search, setSearch] = useState('')
  const [kindFilter, setKindFilter] = useState<'all' | 'product' | 'service'>('all')
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

  const debouncedSearch = useDebounce(search, 300)
  const offset = (page - 1) * PAGE_SIZE

  const { data, isLoading, isError } = useQuery({
    queryKey: [
      'items',
      {
        search: debouncedSearch, kindFilter, templateFilter, categoryFilter, brandFilter, statusFilter, offset, orderBy,
        stockUomFilter, hasWarrantyFilter, warrantyPeriodMin, warrantyPeriodMax,
        pricesMin, pricesMax, priceModeFilter, maxDiscountPctMin, maxDiscountPctMax, trackingTypeFilter,
      },
    ],
    queryFn: () =>
      listItems({
        search: debouncedSearch || undefined,
        type: kindFilter === 'all' ? undefined : kindFilter,
        category: categoryFilter || undefined,
        brand: brandFilter || undefined,
        disabled: statusFilter === 'all' ? undefined : statusFilter === 'disabled' ? 'true' : 'false',
        isTemplate: templateFilter === 'template' ? true : templateFilter === 'standalone' ? false : undefined,
        limit: PAGE_SIZE,
        offset,
        orderBy: orderBy || undefined,
        stockUom: stockUomFilter || undefined,
        hasWarranty: hasWarrantyFilter === 'all' ? undefined : hasWarrantyFilter === 'true',
        warrantyPeriodMin: warrantyPeriodMin ? Number(warrantyPeriodMin) : undefined,
        warrantyPeriodMax: warrantyPeriodMax ? Number(warrantyPeriodMax) : undefined,
        pricesMin: pricesMin ? Number(pricesMin) : undefined,
        pricesMax: pricesMax ? Number(pricesMax) : undefined,
        priceMode: priceModeFilter === 'all' ? undefined : priceModeFilter,
        maxDiscountPctMin: maxDiscountPctMin ? Number(maxDiscountPctMin) : undefined,
        maxDiscountPctMax: maxDiscountPctMax ? Number(maxDiscountPctMax) : undefined,
        trackingType: trackingTypeFilter === 'all' ? undefined : trackingTypeFilter,
      }),
  })

  const { data: categoriesData } = useQuery({
    queryKey: ['categories', {}],
    queryFn: () => listCategories(),
  })

  const { data: brandsData } = useQuery({
    queryKey: ['brands', {}],
    queryFn: () => listBrands(),
  })

  const { data: uomsData } = useQuery({
    queryKey: ['uoms-all'],
    queryFn: () => listUOMs(),
    staleTime: 60 * 60_000,
  })

  const [categorySearch, setCategorySearch] = useState('')
  const categoryOptions: SearchSelectOption[] = (categoriesData?.items ?? [])
    .filter((c) => !categorySearch || c.name.toLowerCase().includes(categorySearch.toLowerCase()))
    .map((c) => ({ value: c.id, label: c.name }))

  const [brandSearch, setBrandSearch] = useState('')
  const brandOptions: SearchSelectOption[] = (brandsData?.items ?? [])
    .filter((b) => !brandSearch || b.name.toLowerCase().includes(brandSearch.toLowerCase()))
    .map((b) => ({ value: b.id, label: b.name }))

  const [stockUomSearch, setStockUomSearch] = useState('')
  const stockUomOptions: SearchSelectOption[] = (uomsData ?? [])
    .filter((u) => !stockUomSearch || u.name.toLowerCase().includes(stockUomSearch.toLowerCase()))
    .map((u) => ({ value: u.name, label: u.name }))

  const toggleMutation = useMutation({
    mutationFn: (id: string) => toggleItem(id),
    onSuccess: (item: Item) => {
      toast.success(item.disabled ? 'Artículo desactivado' : 'Artículo activado')
      queryClient.invalidateQueries({ queryKey: ['items'] })
    },
    onError: () => {
      toast.error('Error al cambiar el estado del artículo')
    },
  })

  const handleSearchChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setSearch(e.target.value)
    setPage(1)
  }, [])

  const totalPages = data ? Math.ceil(data.meta.total / PAGE_SIZE) : 1

  return (
    <div className="page-container">
      <PageHeader
        title="Artículos"
        description={data ? `${data.meta.total} artículos` : undefined}
        action={
          <button className="btn btn-primary" onClick={() => navigate('/inventario/articulos/nuevo')}>
            <Plus size={16} />
            Nuevo Artículo
          </button>
        }
      />

      <div className="filter-bar">
        <div className="filter-bar-left">
          <div className="search-input-wrap">
            <Search size={14} className="search-input-icon" />
            <input
              className="search-input"
              placeholder="Buscar por código o nombre…"
              value={search}
              onChange={handleSearchChange}
            />
          </div>
          <Select
            value={kindFilter}
            onValueChange={(val) => { setKindFilter(val as 'all' | 'product' | 'service'); setPage(1) }}
          >
            <SelectItem value="all">Todos los tipos</SelectItem>
            <SelectItem value="product">Producto</SelectItem>
            <SelectItem value="service">Servicio</SelectItem>
          </Select>
          <div style={{ width: 200 }}>
            <SearchSelect
              value={categoryFilter}
              onChange={(val) => { setCategoryFilter(val); setPage(1) }}
              options={categoryOptions}
              onSearch={setCategorySearch}
              selectedLabel={categoriesData?.items.find((c) => c.id === categoryFilter)?.name ?? ''}
              placeholder="Todas las categorías"
            />
          </div>
          <div style={{ width: 200 }}>
            <SearchSelect
              value={brandFilter}
              onChange={(val) => { setBrandFilter(val); setPage(1) }}
              options={brandOptions}
              onSearch={setBrandSearch}
              selectedLabel={brandsData?.items.find((b) => b.id === brandFilter)?.name ?? ''}
              placeholder="Todas las marcas"
            />
          </div>
          <Select
            value={statusFilter}
            onValueChange={(val) => { setStatusFilter(val as 'all' | 'active' | 'disabled'); setPage(1) }}
          >
            <SelectItem value="all">Todos</SelectItem>
            <SelectItem value="active">Activos</SelectItem>
            <SelectItem value="disabled">Inactivos</SelectItem>
          </Select>
        </div>
        {/* Template / standalone toggle */}
        <div style={{ display: 'flex', gap: 4 }}>
          {[
            { value: 'all', label: 'Todos' },
            { value: 'template', label: 'Solo Plantillas' },
            { value: 'standalone', label: 'Solo Artículos' },
          ].map((opt) => (
            <button
              key={opt.value}
              className={`btn btn-size-xs ${templateFilter === opt.value ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => { setTemplateFilter(opt.value as typeof templateFilter); setPage(1) }}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      <div className="filter-bar">
        <div className="filter-bar-left">
          <div style={{ width: 160 }}>
            <SearchSelect
              value={stockUomFilter}
              onChange={(val) => { setStockUomFilter(val); setPage(1) }}
              options={stockUomOptions}
              onSearch={setStockUomSearch}
              selectedLabel={stockUomFilter}
              placeholder="Todas las UOM"
            />
          </div>
          <Select
            value={hasWarrantyFilter}
            onValueChange={(val) => { setHasWarrantyFilter(val as 'all' | 'true' | 'false'); setPage(1) }}
          >
            <SelectItem value="all">Garantía: Todos</SelectItem>
            <SelectItem value="true">Con garantía</SelectItem>
            <SelectItem value="false">Sin garantía</SelectItem>
          </Select>
          <input
            type="number"
            className="ff-input ff-input-sm"
            style={{ width: 100 }}
            placeholder="Garant. mín."
            value={warrantyPeriodMin}
            onChange={(e) => { setWarrantyPeriodMin(e.target.value); setPage(1) }}
          />
          <span style={{ color: 'var(--text-secondary)', fontSize: 13 }}>—</span>
          <input
            type="number"
            className="ff-input ff-input-sm"
            style={{ width: 100 }}
            placeholder="Garant. máx."
            value={warrantyPeriodMax}
            onChange={(e) => { setWarrantyPeriodMax(e.target.value); setPage(1) }}
          />
          <input
            type="number"
            className="ff-input ff-input-sm"
            style={{ width: 100 }}
            placeholder="Precio mín."
            value={pricesMin}
            onChange={(e) => { setPricesMin(e.target.value); setPage(1) }}
          />
          <span style={{ color: 'var(--text-secondary)', fontSize: 13 }}>—</span>
          <input
            type="number"
            className="ff-input ff-input-sm"
            style={{ width: 100 }}
            placeholder="Precio máx."
            value={pricesMax}
            onChange={(e) => { setPricesMax(e.target.value); setPage(1) }}
          />
          <Select
            value={priceModeFilter}
            onValueChange={(val) => { setPriceModeFilter(val as 'all' | 'manual' | 'cost_plus'); setPage(1) }}
          >
            <SelectItem value="all">Modo precio: Todos</SelectItem>
            <SelectItem value="manual">Manual</SelectItem>
            <SelectItem value="cost_plus">Costo + Margen</SelectItem>
          </Select>
          <input
            type="number"
            className="ff-input ff-input-sm"
            style={{ width: 100 }}
            placeholder="Dto. máx. mín."
            value={maxDiscountPctMin}
            onChange={(e) => { setMaxDiscountPctMin(e.target.value); setPage(1) }}
          />
          <span style={{ color: 'var(--text-secondary)', fontSize: 13 }}>—</span>
          <input
            type="number"
            className="ff-input ff-input-sm"
            style={{ width: 100 }}
            placeholder="Dto. máx. máx."
            value={maxDiscountPctMax}
            onChange={(e) => { setMaxDiscountPctMax(e.target.value); setPage(1) }}
          />
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
      </div>

      <div className="card">
        <div className="table-scroll">
          <table className="data-table">
          <thead>
            <tr>
              <SortableTh label="Código" sortKey="id" orderBy={orderBy} onSort={(k) => { sort(k); setPage(1) }} />
              <SortableTh label="Nombre" sortKey="itemName" orderBy={orderBy} onSort={(k) => { sort(k); setPage(1) }} />
              <th>Tipo</th>
              <th>Rol</th>
              <th>Categoría</th>
              <th>Marca</th>
              <SortableTh label="Precio" sortKey="standardRate" orderBy={orderBy} onSort={(k) => { sort(k); setPage(1) }} align="right" />
               <SortableTh label="Stock" sortKey="currentStock" orderBy={orderBy} onSort={(k) => { sort(k); setPage(1) }} />
                <th>Estado</th>
                <th>Descuento</th>
                <th style={{ width: 48 }} />
            </tr>
          </thead>
          <tbody>
            {isLoading
              ? Array.from({ length: 6 }).map((_, i) => (
                  <tr key={i}>
                    {Array.from({ length: 10 }).map((__, j) => (
                      <td key={j}><div className="skeleton-box" style={{ height: 14, width: '100%' }} /></td>
                    ))}
                  </tr>
                ))
              : isError
                ? (
                    <tr>
                      <td colSpan={10} style={{ textAlign: 'center', padding: '32px 0', color: 'var(--error-text)' }}>
                        Error al cargar los artículos
                      </td>
                    </tr>
                  )
                : data?.items.length === 0
                  ? (
                      <tr>
                        <td colSpan={10}>
                          <div className="empty-state">
                            <p className="empty-title">Sin artículos</p>
                            <p className="empty-sub">No se encontraron artículos.</p>
                          </div>
                        </td>
                      </tr>
                    )
                  : data?.items.map((item) => (
                      <tr
                        key={item.id}
                        className="table-row-clickable"
                        onClick={() => navigate(`/inventario/articulos/${item.id}`)}
                      >
                        <td style={{ fontFamily: 'monospace', fontSize: 12 }}>{item.id}</td>
                        <td style={{ fontWeight: 500 }}>{item.itemName}</td>
                        <td>
                          <span className="badge badge-neutral">
                            {item.type === 'product' ? 'Producto' : 'Servicio'}
                          </span>
                        </td>
                        <td><ItemTypeBadge item={item} /></td>
                        <td className="td-muted">
                          {item.subcategoryName
                            ? `${item.categoryName ?? item.category} > ${item.subcategoryName}`
                            : item.categoryName ?? item.category ?? '—'}
                        </td>
                        <td className="td-muted">{item.brandName ?? '—'}</td>
          <td style={{ textAlign: 'right' }}>
            {item.hasVariants
              ? <span className="td-muted">—</span>
              : formatDOP(item.standardRate)}
          </td>
          <td><StockBadge item={item} /></td>
          <td>
            <AutoDiscountBadge item={item} />
            {item.allowsDiscount === false
              ? <span className="badge badge-neutral" style={{ marginLeft: 4 }}>Sin dto.</span>
              : null}
          </td>
                        <td>
                          {item.disabled
                            ? <span className="badge badge-neutral">Inactivo</span>
                            : <span className="badge badge-success">Activo</span>}
                        </td>
                        <td onClick={(e) => e.stopPropagation()} className="actions-cell">
                          <ActionsMenu>
                            <ActionsMenuItem onClick={() => navigate(`/inventario/articulos/${item.id}`)}>
                              <Eye size={14} /> Ver detalle
                            </ActionsMenuItem>
                            {item.hasVariants && (
                              <ActionsMenuItem onClick={() => navigate(`/inventario/articulos/${item.id}#variants`)}>
                                <Eye size={14} /> Ver variantes
                              </ActionsMenuItem>
                            )}
                            <ActionsMenuItem disabled={toggleMutation.isPending} onClick={() => toggleMutation.mutate(item.id)}>
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
    </div>
  )
}
