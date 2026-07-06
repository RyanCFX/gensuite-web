import { ChevronsUpDown, ChevronUp, ChevronDown } from 'lucide-react'
import type { CSSProperties } from 'react'

interface SortableThProps {
  label: string
  sortKey: string
  orderBy: string
  onSort: (key: string) => void
  style?: CSSProperties
  align?: 'left' | 'right' | 'center'
}

export function SortableTh({ label, sortKey, orderBy, onSort, style, align = 'left' }: SortableThProps) {
  const isAsc = orderBy === sortKey
  const isDesc = orderBy === `-${sortKey}`
  const isActive = isAsc || isDesc

  return (
    <th style={{ textAlign: align, padding: 0, ...style }}>
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
          color: isActive ? 'var(--color-primary, #4f46e5)' : 'inherit',
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
