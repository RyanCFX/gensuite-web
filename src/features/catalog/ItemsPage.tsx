import { useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { listItems, toggleItem, listCategories, listBrands } from '@/shared/api/catalog'
import type { Item } from '@/shared/api/types'
import { useDebounce } from '@/lib/useDebounce'
import { formatDOP } from '@/lib/formatters'
import { Plus, MoreHorizontal, Eye, ToggleLeft, ToggleRight, ChevronLeft, ChevronRight, Search } from 'lucide-react'

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
  const [openMenuId, setOpenMenuId] = useState<string | null>(null)

  const debouncedSearch = useDebounce(search, 300)
  const offset = (page - 1) * PAGE_SIZE

  const { data, isLoading, isError } = useQuery({
    queryKey: [
      'items',
      { search: debouncedSearch, kindFilter, templateFilter, categoryFilter, brandFilter, statusFilter, offset },
    ],
    queryFn: () =>
      listItems({
        search: debouncedSearch || undefined,
        type: kindFilter === 'all' ? undefined : kindFilter,
        category: categoryFilter || undefined,
        brand: brandFilter || undefined,
        disabled: statusFilter === 'all' ? undefined : statusFilter === 'disabled' ? 'true' : 'false',
        isTemplate: templateFilter === 'template' ? true : undefined,
        limit: PAGE_SIZE,
        offset,
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
      <div className="page-header">
        <div>
          <h1 className="page-title">Artículos</h1>
          {data && <p className="page-sub">{data.meta.total} artículos</p>}
        </div>
        <button className="btn btn-primary" onClick={() => navigate('/catalogo/articulos/nuevo')}>
          <Plus size={16} />
          Nuevo Artículo
        </button>
      </div>

      <div className="filter-bar">
        <div className="filter-bar-left">
          <div className="search-input-wrap">
            <Search size={15} className="search-input-icon" />
            <input
              className="search-input"
              placeholder="Buscar por código o nombre…"
              value={search}
              onChange={handleSearchChange}
            />
          </div>
          <select
            className="filter-select"
            value={kindFilter}
            onChange={(e) => { setKindFilter(e.target.value as 'all' | 'product' | 'service'); setPage(1) }}
          >
            <option value="all">Todos los tipos</option>
            <option value="product">Producto</option>
            <option value="service">Servicio</option>
          </select>
          <select
            className="filter-select"
            value={categoryFilter}
            onChange={(e) => { setCategoryFilter(e.target.value === '_all' ? '' : e.target.value); setPage(1) }}
          >
            <option value="_all">Todas las categorías</option>
            {categoriesData?.items.map((cat) => (
              <option key={cat.id} value={cat.id}>{cat.name}</option>
            ))}
          </select>
          <select
            className="filter-select"
            value={brandFilter}
            onChange={(e) => { setBrandFilter(e.target.value === '_all' ? '' : e.target.value); setPage(1) }}
          >
            <option value="_all">Todas las marcas</option>
            {brandsData?.items.map((b) => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>
          <select
            className="filter-select"
            value={statusFilter}
            onChange={(e) => { setStatusFilter(e.target.value as 'all' | 'active' | 'disabled'); setPage(1) }}
          >
            <option value="all">Todos</option>
            <option value="active">Activos</option>
            <option value="disabled">Inactivos</option>
          </select>
        </div>
        {/* Template / standalone toggle */}
        <div style={{ display: 'flex', gap: 4 }}>
          {[
            { value: 'all', label: 'Todos' },
            { value: 'template', label: 'Solo Templates' },
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

      <div className="table-scroll">
        <table className="data-table">
          <thead>
            <tr>
              <th>Código</th>
              <th>Nombre</th>
              <th>Tipo</th>
              <th>Rol</th>
              <th>Categoría</th>
              <th>Marca</th>
              <th style={{ textAlign: 'right' }}>Precio</th>
              <th>Stock</th>
              <th>Estado</th>
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
                      <td colSpan={10} style={{ textAlign: 'center', padding: '32px 0', color: 'var(--color-error)' }}>
                        Error al cargar los artículos
                      </td>
                    </tr>
                  )
                : data?.items.length === 0
                  ? (
                      <tr>
                        <td colSpan={10} style={{ textAlign: 'center', padding: '32px 0', color: 'var(--text-secondary)' }}>
                          No se encontraron artículos
                        </td>
                      </tr>
                    )
                  : data?.items.map((item) => (
                      <tr
                        key={item.id}
                        className="table-row-clickable"
                        onClick={() => navigate(`/catalogo/articulos/${item.id}`)}
                      >
                        <td style={{ fontFamily: 'monospace', fontSize: 12 }}>{item.id}</td>
                        <td style={{ fontWeight: 500 }}>{item.itemName}</td>
                        <td>
                          <span className="badge badge-neutral">
                            {item.type === 'product' ? 'Producto' : 'Servicio'}
                          </span>
                        </td>
                        <td><ItemTypeBadge item={item} /></td>
                        <td className="td-muted">{item.categoryName ?? '—'}</td>
                        <td className="td-muted">{item.brandName ?? '—'}</td>
                        <td style={{ textAlign: 'right' }}>
                          {item.hasVariants
                            ? <span className="td-muted">—</span>
                            : formatDOP(item.standardRate)}
                        </td>
                        <td><StockBadge item={item} /></td>
                        <td>
                          {item.disabled
                            ? <span className="badge badge-neutral">Inactivo</span>
                            : <span className="badge badge-success">Activo</span>}
                        </td>
                        <td onClick={(e) => e.stopPropagation()} className="actions-cell">
                          <div style={{ position: 'relative' }}>
                            <button
                              className="actions-trigger"
                              onClick={() => setOpenMenuId(openMenuId === item.id ? null : item.id)}
                            >
                              <MoreHorizontal size={16} />
                            </button>
                            {openMenuId === item.id && (
                              <div className="actions-menu">
                                <button
                                  className="actions-item"
                                  onClick={() => { setOpenMenuId(null); navigate(`/catalogo/articulos/${item.id}`) }}
                                >
                                  <Eye size={14} />
                                  Ver detalle
                                </button>
                                {item.hasVariants && (
                                  <button
                                    className="actions-item"
                                    onClick={() => { setOpenMenuId(null); navigate(`/catalogo/articulos/${item.id}#variants`) }}
                                  >
                                    <Eye size={14} />
                                    Ver variantes
                                  </button>
                                )}
                                <button
                                  className="actions-item"
                                  disabled={toggleMutation.isPending}
                                  onClick={() => { setOpenMenuId(null); toggleMutation.mutate(item.id) }}
                                >
                                  {item.disabled
                                    ? <><ToggleRight size={14} /> Activar</>
                                    : <><ToggleLeft size={14} /> Desactivar</>}
                                </button>
                              </div>
                            )}
                          </div>
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
