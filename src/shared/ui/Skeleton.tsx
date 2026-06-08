interface SkeletonProps {
  width?: number | string
  height?: number | string
  className?: string
  style?: React.CSSProperties
}

import type { CSSProperties } from 'react'

export function Skeleton({ width, height = 16, className = '', style }: SkeletonProps) {
  const s: CSSProperties = { width, height, ...style }
  return <span className={`skeleton-box ${className}`} style={s} aria-hidden="true" />
}

export function SkeletonCard({ rows = 3 }: { rows?: number }) {
  return (
    <div className="card" style={{ padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 12 }}>
      <Skeleton width="40%" height={18} />
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} width={`${60 + (i % 3) * 15}%`} height={13} />
      ))}
    </div>
  )
}
