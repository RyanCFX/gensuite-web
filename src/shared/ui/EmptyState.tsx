import { type ReactNode } from 'react'
import { Inbox } from 'lucide-react'

interface EmptyStateProps {
  title: string
  description?: string
  action?: ReactNode
  icon?: ReactNode
}

export function EmptyState({ title, description, action, icon }: EmptyStateProps) {
  return (
    <div className="empty-state">
      <span className="empty-icon" aria-hidden="true">
        {icon ?? <Inbox size={22} />}
      </span>
      <div>
        <p className="empty-title">{title}</p>
        {description && <p className="empty-sub">{description}</p>}
      </div>
      {action}
    </div>
  )
}
