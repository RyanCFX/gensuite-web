import * as React from 'react'

export interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {
  circle?: boolean
}

export function Skeleton({ className = '', circle, style, ...props }: SkeletonProps) {
  return (
    <div
      className={`skeleton ${className}`}
      style={{
        ...style,
        ...(circle ? { borderRadius: '9999px' } : {}),
      }}
      {...props}
    />
  )
}
