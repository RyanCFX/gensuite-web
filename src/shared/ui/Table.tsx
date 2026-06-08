import { type ReactNode, type CSSProperties } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface Column<T> {
  label: string
  render: (row: T) => ReactNode
  style?: CSSProperties
  width?: number | string
  align?: 'left' | 'right' | 'center'
}

export interface TableProps<T> {
  columns: Column<T>[]
  rows: T[]
  rowKey: (row: T) => string | number
  onRowClick?: (row: T) => void
  loadingRows?: number
  isLoading?: boolean
  emptyState?: ReactNode
}

// ─── Skeleton row ─────────────────────────────────────────────────────────────

function SkeletonRow({ cols }: { cols: number }) {
  return (
    <div className="table-row-skeleton">
      {Array.from({ length: cols }).map((_, i) => (
        <span key={i} className="skeleton-box" style={{ height: 13, width: `${Math.floor(80 / cols)}%` }} />
      ))}
    </div>
  )
}

// ─── Table ────────────────────────────────────────────────────────────────────

export function Table<T>({
  columns,
  rows,
  rowKey,
  onRowClick,
  loadingRows = 6,
  isLoading = false,
  emptyState,
}: TableProps<T>) {
  if (isLoading) {
    return (
      <div className="card card-flush">
        {Array.from({ length: loadingRows }).map((_, i) => (
          <SkeletonRow key={i} cols={columns.length} />
        ))}
      </div>
    )
  }

  if (rows.length === 0 && emptyState) {
    return <>{emptyState}</>
  }

  return (
    <div className="card card-flush">
      <div className="table-scroll">
        <table className="data-table">
          <thead>
            <tr>
              {columns.map((col, i) => (
                <th key={i} style={{ width: col.width, textAlign: col.align ?? 'left', ...col.style }}>
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={rowKey(row)}
                className={onRowClick ? 'table-row-clickable' : undefined}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                tabIndex={onRowClick ? 0 : undefined}
                onKeyDown={onRowClick ? (e) => { if (e.key === 'Enter') onRowClick(row) } : undefined}
              >
                {columns.map((col, j) => (
                  <td key={j} style={{ textAlign: col.align ?? 'left', ...col.style }}>
                    {col.render(row)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ─── Pagination ───────────────────────────────────────────────────────────────

export interface PaginationProps {
  page: number
  pageSize: number
  total: number
  onPage: (page: number) => void
}

export function Pagination({ page, pageSize, total, onPage }: PaginationProps) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  const from = (page - 1) * pageSize + 1
  const to = Math.min(page * pageSize, total)

  if (totalPages <= 1) return null

  const delta = 2
  const range: number[] = []
  for (let i = Math.max(1, page - delta); i <= Math.min(totalPages, page + delta); i++) {
    range.push(i)
  }

  return (
    <div className="pagination">
      <span className="pagination-info">{from}–{to} de {total}</span>
      <div className="pagination-controls">
        <button
          className="btn btn-ghost btn-size-xs"
          disabled={page <= 1}
          onClick={() => onPage(page - 1)}
          aria-label="Página anterior"
        >
          <ChevronLeft size={13} aria-hidden="true" />
        </button>
        {range.map((p) => (
          <button
            key={p}
            className={`btn btn-size-xs ${page === p ? 'btn-secondary' : 'btn-ghost'}`}
            style={{ minWidth: 28, fontWeight: page === p ? 600 : 400 }}
            onClick={() => onPage(p)}
            aria-current={page === p ? 'page' : undefined}
          >
            {p}
          </button>
        ))}
        <button
          className="btn btn-ghost btn-size-xs"
          disabled={page >= totalPages}
          onClick={() => onPage(page + 1)}
          aria-label="Página siguiente"
        >
          <ChevronRight size={13} aria-hidden="true" />
        </button>
      </div>
    </div>
  )
}
