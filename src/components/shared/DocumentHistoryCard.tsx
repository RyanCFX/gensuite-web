import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronDown, ChevronRight, History } from 'lucide-react'
import { formatDate, formatDOP, displayId } from '@/lib/formatters'
import type { AmendmentEntry } from '@/shared/api/types'

function ItemsPreview({ items }: { items: NonNullable<AmendmentEntry['items']> }) {
  return (
    <div style={{ padding: '0 0 12px 44px' }}>
      <table className="items-table" style={{ fontSize: 12 }}>
        <thead>
          <tr>
            <th>Código</th>
            <th>Descripción</th>
            <th>Notas</th>
            <th style={{ textAlign: 'right' }}>Cant.</th>
            <th style={{ textAlign: 'right' }}>Precio</th>
            <th style={{ textAlign: 'right' }}>Importe</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item, i) => (
            <tr key={i}>
              <td style={{ fontFamily: 'monospace', fontSize: 11 }}>{item.itemCode || '—'}</td>
              <td>{item.description || '—'}</td>
              <td style={{ fontSize: 11, color: 'var(--text-tertiary)', maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={item.notes ?? ''}>{item.notes ?? '—'}</td>
              <td style={{ textAlign: 'right' }}>{item.qty}</td>
              <td style={{ textAlign: 'right' }}>{formatDOP(item.rate)}</td>
              <td style={{ textAlign: 'right' }}>{formatDOP(item.amount)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function HistoryRow({ entry, isLast, basePath, isDraft }: { entry: AmendmentEntry; isLast: boolean; basePath: string; isDraft: boolean }) {
  const navigate = useNavigate()
  const [expanded, setExpanded] = useState(false)
  const hasItems = !!entry.items?.length

  const handleView = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (isDraft && entry.sequence) {
      navigate(`${basePath}/${entry.id}/versions/${entry.sequence}`)
    } else {
      navigate(`${basePath}/${entry.id}`)
    }
  }

  return (
    <div style={{ borderBottom: isLast ? 'none' : '1px solid var(--border-default)' }}>
      <div
        style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 0', cursor: hasItems ? 'pointer' : 'default' }}
        onClick={() => hasItems && setExpanded((p) => !p)}
      >
        {hasItems ? (
          expanded ? <ChevronDown size={14} style={{ flexShrink: 0, color: 'var(--text-tertiary)' }} />
            : <ChevronRight size={14} style={{ flexShrink: 0, color: 'var(--text-tertiary)' }} />
        ) : (
          <div style={{ width: 14 }} />
        )}
        <div style={{
          width: 8, height: 8, borderRadius: '50%',
          background: isDraft ? 'var(--brand-primary)' : 'var(--text-tertiary)',
          flexShrink: 0,
        }} />
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 500, fontSize: 13 }}>
            {isDraft ? `Versión ${entry.sequence ?? '?'}` : displayId(entry.id, entry.sequence)}
            {isDraft && <span style={{ marginLeft: 6, fontSize: 11, color: 'var(--text-tertiary)' }}>(editada)</span>}
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>
            {entry.date ? `${formatDate(entry.date)} · ` : ''}
            {formatDOP(entry.grandTotal ?? entry.total ?? 0)}
            <span style={{ marginLeft: 6 }}>· {entry.status}</span>
          </div>
        </div>
        <button className="btn btn-ghost btn-size-sm" onClick={handleView}>
          Ver
        </button>
      </div>
      {expanded && hasItems && <ItemsPreview items={entry.items!} />}
    </div>
  )
}

interface DocumentHistoryCardProps {
  history?: AmendmentEntry[]
  basePath: string
  currentDocId: string
}

export function DocumentHistoryCard({ history, basePath, currentDocId }: DocumentHistoryCardProps) {
  if (!history || history.length === 0) return null

  return (
    <div className="card" style={{ marginTop: 16 }}>
      <div className="card-header">
        <h2 className="card-title" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <History size={15} /> Historial de versiones
        </h2>
      </div>
      <div className="card-body">
        {history.map((entry, idx) => (
          <HistoryRow
            key={`${entry.id}-${entry.sequence ?? 0}`}
            entry={entry}
            isLast={idx === history.length - 1}
            basePath={basePath}
            isDraft={entry.id === currentDocId}
          />
        ))}
      </div>
    </div>
  )
}
