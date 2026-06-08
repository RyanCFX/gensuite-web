import { type ReactNode } from 'react'

interface PageHeaderProps {
  title: ReactNode
  description?: ReactNode
  overline?: string
  action?: ReactNode
}

export function PageHeader({ title, description, overline, action }: PageHeaderProps) {
  return (
    <div className="page-header">
      <div>
        {overline && <p className="overline">{overline}</p>}
        <h1 className="page-title">{title}</h1>
        {description && <p className="page-sub">{description as ReactNode}</p>}
      </div>
      {action && <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>{action}</div>}
    </div>
  )
}
