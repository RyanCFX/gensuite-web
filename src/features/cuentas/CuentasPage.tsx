import { useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { listCuentas, getCuentasTree } from '@/shared/api/cuentas'
import type { Cuenta } from '@/shared/api/types'
import type { ListCuentasParams } from '@/shared/api/cuentas'
import { useDebounce } from '@/lib/useDebounce'
import { Plus, Search, ChevronLeft, ChevronRight, ChevronDown, ChevronRight as ChevronRightSmall, Folder, FileText, BarChart2 } from 'lucide-react'
import { CuentaMovimientosModal } from '@/features/contabilidad/CuentaMovimientosModal'
import { Select, SelectItem } from '@/components/ui/select'

const PAGE_SIZE = 25

type RootTypeFilter = '' | 'Asset' | 'Liability' | 'Equity' | 'Income' | 'Expense'

function rootTypeBadgeStyle(rootType: string): React.CSSProperties {
  switch (rootType) {
    case 'Asset':
      return { background: 'var(--info-bg)', color: 'var(--info-text)' }
    case 'Liability':
      return { background: 'var(--warning-bg)', color: 'var(--warning-text)' }
    case 'Equity':
      return { background: 'var(--surface-sunken)', color: 'var(--text-secondary)' }
    case 'Income':
      return { background: 'var(--success-bg)', color: 'var(--success-text)' }
    case 'Expense':
      return { background: 'var(--error-bg)', color: 'var(--error-text)' }
    default:
      return {}
  }
}

function rootTypeLabel(rootType: string): string {
  const map: Record<string, string> = {
    Asset: 'Activo',
    Liability: 'Pasivo',
    Equity: 'Patrimonio',
    Income: 'Ingreso',
    Expense: 'Gasto',
  }
  return map[rootType] ?? rootType
}

// ─── Tree node ────────────────────────────────────────────────────────────────

function TreeNode({ cuenta, depth, onNavigate, onMovimientos }: { cuenta: Cuenta; depth: number; onNavigate: (id: string) => void; onMovimientos: (name: string) => void }) {
  const [expanded, setExpanded] = useState(depth < 2)
  const hasChildren = Boolean(cuenta.children && cuenta.children.length > 0)

  return (
    <div>
      <div
        className={!cuenta.isGroup ? 'table-row-clickable' : undefined}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          paddingLeft: depth * 20 + 8,
          paddingTop: 8,
          paddingBottom: 8,
          paddingRight: 16,
          borderBottom: '1px solid var(--border-subtle)',
          cursor: !cuenta.isGroup ? 'pointer' : 'default',
        }}
        onClick={!cuenta.isGroup ? () => onNavigate(cuenta.id) : undefined}
      >
        {/* Expand / collapse button */}
        <button
          type="button"
          style={{
            width: 20,
            height: 20,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
            background: 'none',
            border: 'none',
            cursor: hasChildren ? 'pointer' : 'default',
            color: 'var(--text-secondary)',
            padding: 0,
          }}
          onClick={(e) => {
            e.stopPropagation()
            if (hasChildren) setExpanded((v) => !v)
          }}
          aria-label={expanded ? 'Colapsar' : 'Expandir'}
        >
          {hasChildren
            ? expanded
              ? <ChevronDown size={13} />
              : <ChevronRightSmall size={13} />
            : null}
        </button>

        {/* Icon */}
        {cuenta.isGroup
          ? <Folder size={15} style={{ color: 'var(--text-secondary)', flexShrink: 0 }} />
          : <FileText size={15} style={{ color: 'var(--text-tertiary)', flexShrink: 0 }} />}

        {/* Name + number */}
        <span style={{ flex: 1, fontSize: 13, fontWeight: cuenta.isGroup ? 500 : 400 }}>
          {cuenta.accountName}
        </span>
        {cuenta.accountNumber && (
          <span style={{ fontSize: 12, color: 'var(--text-secondary)', fontFamily: 'monospace' }}>
            {cuenta.accountNumber}
          </span>
        )}

        {/* Badges */}
        <span
          className="badge"
          style={{ ...rootTypeBadgeStyle(cuenta.rootType), fontSize: 11 }}
        >
          {rootTypeLabel(cuenta.rootType)}
        </span>
        {cuenta.isGroup && (
          <span className="badge" style={{ fontSize: 11, background: 'var(--surface-sunken)', color: 'var(--text-secondary)' }}>
            Grupo
          </span>
        )}
        {cuenta.disabled && (
          <span className="badge badge-error" style={{ fontSize: 11 }}>Deshabilitada</span>
        )}
        {!hasChildren && (
          <button
            className="btn btn-ghost btn-size-sm"
            title="Ver movimientos"
            onClick={(e) => { e.stopPropagation(); onMovimientos(cuenta.id) }}
            style={{ padding: '0 4px' }}
          >
            <BarChart2 size={13} />
          </button>
        )}
      </div>

      {hasChildren && expanded && cuenta.children?.map((child) => (
        <TreeNode key={child.id} cuenta={child} depth={depth + 1} onNavigate={onNavigate} onMovimientos={onMovimientos} />
      ))}
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function CuentasPage() {
  const navigate = useNavigate()
  const [activeTab, setActiveTab] = useState<'lista' | 'arbol'>('lista')
  const [movimientosAccount, setMovimientosAccount] = useState<string | null>(null)

  // Lista tab state
  const [search, setSearch] = useState('')
  const [rootTypeFilter, setRootTypeFilter] = useState<RootTypeFilter>('')
  const [includeDisabled, setIncludeDisabled] = useState(false)
  const [page, setPage] = useState(1)

  const debouncedSearch = useDebounce(search, 300)
  const offset = (page - 1) * PAGE_SIZE

  const listParams: ListCuentasParams = {
    search: debouncedSearch || undefined,
    rootType: rootTypeFilter || undefined,
    includeDisabled: includeDisabled || undefined,
    limit: PAGE_SIZE,
    offset,
  }

  const { data, isLoading, isError } = useQuery({
    queryKey: ['cuentas', listParams],
    queryFn: () => listCuentas(listParams),
    enabled: activeTab === 'lista',
  })

  const { data: tree, isLoading: treeLoading, isError: treeError } = useQuery({
    queryKey: ['cuentas-tree'],
    queryFn: getCuentasTree,
    enabled: activeTab === 'arbol',
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
          <h1 className="page-title">Plan de Cuentas</h1>
          {data && activeTab === 'lista' && (
            <p className="page-sub">{data.meta.total} cuentas en total</p>
          )}
        </div>
        <button className="btn btn-primary" onClick={() => navigate('/cuentas/nueva')}>
          <Plus size={16} />
          Nueva Cuenta
        </button>
      </div>

      {/* Tabs */}
      <div className="tabs-bar" style={{ marginBottom: 16 }}>
        <button
          className={`tab-btn${activeTab === 'lista' ? ' on' : ''}`}
          onClick={() => setActiveTab('lista')}
        >
          Lista
        </button>
        <button
          className={`tab-btn${activeTab === 'arbol' ? ' on' : ''}`}
          onClick={() => setActiveTab('arbol')}
        >
          Árbol
        </button>
      </div>

      {/* ── Lista Tab ── */}
      {activeTab === 'lista' && (
        <>
          <div className="filter-bar">
            <div className="filter-bar-left">
              <div className="search-input-wrap">
                <Search size={15} className="search-input-icon" />
                <input
                  className="search-input"
                  placeholder="Buscar por nombre o código…"
                  value={search}
                  onChange={handleSearchChange}
                />
              </div>

              <Select
                value={rootTypeFilter}
                onValueChange={(val) => {
                  setRootTypeFilter(val as RootTypeFilter)
                  setPage(1)
                }}
                placeholder="Todos los tipos"
              >
                <SelectItem value="Asset">Activos</SelectItem>
                <SelectItem value="Liability">Pasivos</SelectItem>
                <SelectItem value="Equity">Patrimonio</SelectItem>
                <SelectItem value="Income">Ingresos</SelectItem>
                <SelectItem value="Expense">Gastos</SelectItem>
              </Select>

              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer', userSelect: 'none' }}>
                <input
                  type="checkbox"
                  checked={includeDisabled}
                  onChange={(e) => {
                    setIncludeDisabled(e.target.checked)
                    setPage(1)
                  }}
                />
                Incluir deshabilitadas
              </label>
            </div>
          </div>

          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Código</th>
                  <th>Nombre</th>
                  <th>Tipo</th>
                  <th>Raíz</th>
                  <th>Moneda</th>
                  <th>Estado</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {isLoading
                  ? Array.from({ length: 8 }).map((_, i) => (
                      <tr key={i}>
                        {Array.from({ length: 6 }).map((__, j) => (
                          <td key={j}><div className="skeleton-box" style={{ height: 14, width: '100%' }} /></td>
                        ))}
                      </tr>
                    ))
                  : isError
                    ? (
                        <tr>
                          <td colSpan={7} style={{ textAlign: 'center', padding: '32px 0', color: 'var(--color-error)' }}>
                            Error al cargar las cuentas
                          </td>
                        </tr>
                      )
                    : data?.items.length === 0
                      ? (
                          <tr>
                            <td colSpan={7}>
                              <div className="empty-state">
                                <div className="empty-icon"><FileText size={28} /></div>
                                <p className="empty-title">No se encontraron cuentas</p>
                                <p className="empty-sub">Intenta cambiar los filtros de búsqueda</p>
                              </div>
                            </td>
                          </tr>
                        )
                      : data?.items.map((cuenta) => (
                          <tr
                            key={cuenta.id}
                            className="table-row-clickable"
                            onClick={() => navigate(`/cuentas/${encodeURIComponent(cuenta.id)}`)}
                          >
                            <td className="td-muted" style={{ fontFamily: 'monospace', fontSize: 12 }}>
                              {cuenta.accountNumber ?? '—'}
                            </td>
                            <td style={{ fontWeight: 500 }}>{cuenta.accountName}</td>
                            <td className="td-muted">{cuenta.accountType ?? '—'}</td>
                            <td>
                              <span
                                className="badge"
                                style={{ ...rootTypeBadgeStyle(cuenta.rootType), fontSize: 11 }}
                              >
                                {rootTypeLabel(cuenta.rootType)}
                              </span>
                            </td>
                            <td className="td-muted">{cuenta.currency}</td>
                            <td>
                              {cuenta.disabled
                                ? <span className="badge badge-error">Deshabilitada</span>
                                : <span className="badge badge-submitted">Activa</span>}
                            </td>
                            <td onClick={(e) => e.stopPropagation()}>
                              {!cuenta.isGroup && (
                                <button
                                  className="btn btn-ghost btn-size-sm"
                                  title="Ver movimientos"
                                  onClick={() => setMovimientosAccount(cuenta.id)}
                                >
                                  <BarChart2 size={13} />
                                </button>
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
                  className="btn btn-ghost btn-size-sm"
                  disabled={page === 1}
                  onClick={() => setPage((p) => p - 1)}
                >
                  <ChevronLeft size={16} />
                </button>
                <span style={{ fontSize: 13 }}>Página {page} de {totalPages}</span>
                <button
                  className="btn btn-ghost btn-size-sm"
                  disabled={!data.meta.hasMore}
                  onClick={() => setPage((p) => p + 1)}
                >
                  <ChevronRight size={16} />
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {movimientosAccount && (
        <CuentaMovimientosModal accountId={movimientosAccount} onClose={() => setMovimientosAccount(null)} />
      )}

      {/* ── Árbol Tab ── */}
      {activeTab === 'arbol' && (
        <div className="card">
          <div className="card-body" style={{ padding: 0 }}>
            {treeLoading
              ? (
                  <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {Array.from({ length: 6 }).map((_, i) => (
                      <div key={i} className="skeleton-box" style={{ height: 18, width: `${80 - i * 8}%` }} />
                    ))}
                  </div>
                )
              : treeError
                ? (
                    <div style={{ padding: 24, color: 'var(--color-error)', fontSize: 13 }}>
                      Error al cargar el árbol de cuentas
                    </div>
                  )
                : !tree || (Array.isArray(tree) && tree.length === 0)
                  ? (
                      <div className="empty-state">
                        <div className="empty-icon"><Folder size={28} /></div>
                        <p className="empty-title">Sin cuentas</p>
                        <p className="empty-sub">Crea tu primera cuenta contable</p>
                      </div>
                    )
                  : (Array.isArray(tree) ? tree : []).map((root) => (
                      <TreeNode
                        key={root.id}
                        cuenta={root}
                        depth={0}
                        onNavigate={(id) => navigate(`/cuentas/${encodeURIComponent(id)}`)}
                        onMovimientos={(name) => setMovimientosAccount(name)}
                      />
                    ))}
          </div>
        </div>
      )}
    </div>
  )
}
