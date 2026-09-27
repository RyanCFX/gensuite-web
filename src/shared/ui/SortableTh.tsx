import { ChevronsUpDown, ChevronUp, ChevronDown } from 'lucide-react'
import type { CSSProperties, ReactNode } from 'react'

interface SortableThProps {
  label: string
  sortKey: string
  orderBy: string
  onSort: (key: string) => void
  style?: CSSProperties
  align?: 'left' | 'right' | 'center'
  /** Manija de `useResizableColumns` (ej. `startResize('nombre')`) — se pinta como hijo directo
   *  del `<th>`, igual que en una columna no ordenable, para que `.col-resize-handle` se posicione
   *  contra el borde del `<th>` y no del `<button>` interno. */
  resizeHandle?: ReactNode
}

export function SortableTh({ label, sortKey, orderBy, onSort, style, align = 'left', resizeHandle }: SortableThProps) {
  const isAsc = orderBy === sortKey
  const isDesc = orderBy === `-${sortKey}`
  const isActive = isAsc || isDesc

  return (
    <th style={{ textAlign: align, padding: 0, ...style }}>
      {resizeHandle}
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 4,
          padding: '0 12px',
          height: '100%',
          minHeight: 38,
          width: '100%',
          justifyContent: align === 'right' ? 'flex-end' : align === 'center' ? 'center' : 'flex-start',
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          fontWeight: 600,
          fontSize: 'inherit',
          color: isActive ? 'var(--sidebar-label)' : 'inherit',
          whiteSpace: 'nowrap',
        }}
      >
        {label?.toUpperCase()}
        {isAsc
          ? <ChevronUp size={12} />
          : isDesc
            ? <ChevronDown size={12} />
            : <ChevronsUpDown size={12} style={{ opacity: 0.35 }} />}
      </button>
    </th>
  )
}
