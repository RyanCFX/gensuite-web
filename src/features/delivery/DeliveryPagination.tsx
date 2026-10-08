import { ChevronLeft, ChevronRight } from 'lucide-react'

interface Props {
  page: number
  pageSize: number
  total: number
  hasMore?: boolean
  onPage: (p: number) => void
}

export function DeliveryPagination({ page, pageSize, total, hasMore, onPage }: Props) {
  if (total <= pageSize) return null
  const offset = (page - 1) * pageSize
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  return (
    <div className="pagination">
      <span className="pagination-info">Mostrando {offset + 1}–{Math.min(offset + pageSize, total)} de {total}</span>
      <div className="pagination-controls">
        <button className="btn btn-ghost btn-size-icon-sm" disabled={page === 1} onClick={() => onPage(page - 1)}><ChevronLeft size={16} /></button>
        <span style={{ fontSize: 13 }}>Página {page} de {totalPages}</span>
        <button className="btn btn-ghost btn-size-icon-sm" disabled={!hasMore} onClick={() => onPage(page + 1)}><ChevronRight size={16} /></button>
      </div>
    </div>
  )
}
