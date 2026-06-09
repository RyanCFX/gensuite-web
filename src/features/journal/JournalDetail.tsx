import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { getJournalEntry, submitJournalEntry, cancelJournalEntry } from '@/shared/api/journal-entry'
import { formatDate, formatDOP } from '@/lib/formatters'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { ArrowLeft } from 'lucide-react'

// ─── Confirm Modal ────────────────────────────────────────────────────────────

interface ConfirmModalProps {
  title: string
  body: string
  confirmLabel: string
  confirmClass?: string
  isPending: boolean
  onConfirm: () => void
  onClose: () => void
}

function ConfirmModal({ title, body, confirmLabel, confirmClass = 'btn btn-primary', isPending, onConfirm, onClose }: ConfirmModalProps) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2 className="modal-title">{title}</h2>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        <div className="modal-body">
          <p style={{ fontSize: 14 }}>{body}</p>
        </div>
        <div className="modal-foot">
          <button className="btn btn-ghost" onClick={onClose} disabled={isPending}>Cancelar</button>
          <button className={confirmClass} onClick={onConfirm} disabled={isPending}>
            {isPending
              ? <><span className="spinner spinner-white spinner-sm" /> Procesando…</>
              : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function JournalDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const [showSubmitModal, setShowSubmitModal] = useState(false)
  const [showCancelModal, setShowCancelModal] = useState(false)

  const { data: entry, isLoading, isError } = useQuery({
    queryKey: ['journal-entry', id],
    queryFn: () => getJournalEntry(decodeURIComponent(id!)),
    enabled: Boolean(id),
  })

  const submitMutation = useMutation({
    mutationFn: () => submitJournalEntry(decodeURIComponent(id!)),
    onSuccess: () => {
      toast.success('Asiento confirmado')
      queryClient.invalidateQueries({ queryKey: ['journal-entries'] })
      queryClient.invalidateQueries({ queryKey: ['journal-entry', id] })
      setShowSubmitModal(false)
    },
    onError: (err: { message?: string }) => {
      toast.error(err?.message ?? 'Error al confirmar el asiento')
    },
  })

  const cancelMutation = useMutation({
    mutationFn: () => cancelJournalEntry(decodeURIComponent(id!)),
    onSuccess: () => {
      toast.success('Asiento cancelado')
      queryClient.invalidateQueries({ queryKey: ['journal-entries'] })
      queryClient.invalidateQueries({ queryKey: ['journal-entry', id] })
      setShowCancelModal(false)
    },
    onError: (err: { message?: string }) => {
      toast.error(err?.message ?? 'Error al cancelar el asiento')
    },
  })

  if (isLoading) {
    return (
      <div className="page-container">
        <div className="skeleton-box" style={{ width: 160, height: 16, marginBottom: 8 }} />
        <div className="skeleton-box" style={{ width: 300, height: 28, marginBottom: 20 }} />
        <div className="stats-row" style={{ marginBottom: 20 }}>
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="stat-card">
              <div className="skeleton-box" style={{ height: 16, width: 100, marginBottom: 8 }} />
              <div className="skeleton-box" style={{ height: 24, width: 140 }} />
            </div>
          ))}
        </div>
        <div className="skeleton-box" style={{ width: '100%', height: 240, borderRadius: 'var(--radius-lg)' }} />
      </div>
    )
  }

  if (isError || !entry) {
    return (
      <div className="page-container">
        <p style={{ color: 'var(--color-error)' }}>Error al cargar el asiento</p>
        <button className="btn btn-ghost" style={{ marginTop: 16 }} onClick={() => navigate('/asientos')}>
          Volver
        </button>
      </div>
    )
  }

  const isBalanced = Math.abs(entry.totalDebit - entry.totalCredit) < 0.01

  return (
    <div className="page-container">
      {/* Header */}
      <div className="page-header">
        <div>
          <button className="page-back-link" onClick={() => navigate('/asientos')}>
            <ArrowLeft size={14} /> Asientos Contables
          </button>
          <h1 className="page-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {entry.id}
            <StatusBadge status={entry.status} />
          </h1>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {entry.status === 'Draft' && (
            <button className="btn btn-primary" onClick={() => setShowSubmitModal(true)}>
              Confirmar
            </button>
          )}
          {entry.status === 'Submitted' && (
            <button className="btn btn-danger" onClick={() => setShowCancelModal(true)}>
              Cancelar
            </button>
          )}
        </div>
      </div>

      {/* KPI stat-cards */}
      <div className="stats-row" style={{ marginBottom: 20 }}>
        <div className="stat-card">
          <div className="stat-card-top">
            <span className="stat-label">Total Débitos</span>
          </div>
          <span className="stat-value">{formatDOP(entry.totalDebit)}</span>
        </div>
        <div className="stat-card">
          <div className="stat-card-top">
            <span className="stat-label">Total Créditos</span>
          </div>
          <span className="stat-value">{formatDOP(entry.totalCredit)}</span>
        </div>
        <div className="stat-card">
          <div className="stat-card-top">
            <span className="stat-label">Balance</span>
          </div>
          <span
            className="stat-value"
            style={{ fontSize: 15, color: isBalanced ? 'var(--success-text)' : 'var(--error-text)' }}
          >
            {isBalanced ? '✓ Balanceado' : '✗ Desbalanceado'}
          </span>
        </div>
      </div>

      {/* Fields card */}
      <div className="card" style={{ marginBottom: 20 }}>
        <div className="card-header">
          <h2 className="card-title">Información</h2>
        </div>
        <div className="card-body">
          <div className="fields-grid fields-grid-3">
            <div className="detail-field">
              <span className="detail-label">Fecha</span>
              <span className="detail-value">{formatDate(entry.postingDate)}</span>
            </div>
            <div className="detail-field">
              <span className="detail-label">Tipo de Voucher</span>
              <span className="detail-value">{entry.voucherType ?? '—'}</span>
            </div>
            <div className="detail-field">
              <span className="detail-label">Creado</span>
              <span className="detail-value">{formatDate(entry.createdAt)}</span>
            </div>
            {entry.remarks && (
              <div className="detail-field" style={{ gridColumn: '1 / -1' }}>
                <span className="detail-label">Descripción</span>
                <span className="detail-value">{entry.remarks}</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Entry lines */}
      <div className="card">
        <div className="card-header">
          <h2 className="card-title">Líneas del Asiento</h2>
        </div>
        <div className="card-body" style={{ padding: 0 }}>
          <div className="items-table-wrap">
            <table className="items-table">
              <thead>
                <tr>
                  <th>Cuenta</th>
                  <th style={{ textAlign: 'right' }}>Débito</th>
                  <th style={{ textAlign: 'right' }}>Crédito</th>
                  <th>Descripción</th>
                </tr>
              </thead>
              <tbody>
                {(entry.entries ?? []).length === 0
                  ? (
                      <tr>
                        <td colSpan={4} style={{ textAlign: 'center', padding: '24px 0', color: 'var(--text-secondary)', fontSize: 13 }}>
                          Sin líneas de detalle
                        </td>
                      </tr>
                    )
                  : (entry.entries ?? []).map((line, idx) => (
                      <tr key={idx}>
                        <td style={{ fontFamily: 'monospace', fontSize: 12 }}>{line.account}</td>
                        <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                          {line.debit > 0 ? formatDOP(line.debit) : '—'}
                        </td>
                        <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                          {line.credit > 0 ? formatDOP(line.credit) : '—'}
                        </td>
                        <td className="td-muted">{line.description ?? '—'}</td>
                      </tr>
                    ))}
              </tbody>
              <tfoot>
                <tr className="items-total-row">
                  <td className="items-total-line" style={{ fontWeight: 600 }}>Totales</td>
                  <td className="items-total-line" style={{ textAlign: 'right', fontWeight: 600 }}>
                    {formatDOP(entry.totalDebit)}
                  </td>
                  <td className="items-total-line" style={{ textAlign: 'right', fontWeight: 600 }}>
                    {formatDOP(entry.totalCredit)}
                  </td>
                  <td className="items-total-line" />
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      </div>

      {/* Confirm submit modal */}
      {showSubmitModal && (
        <ConfirmModal
          title="¿Confirmar asiento?"
          body="Esta acción registra asientos GL permanentes en el libro mayor. El asiento pasará a estado Sometido y no se podrá editar."
          confirmLabel="Confirmar Asiento"
          confirmClass="btn btn-primary"
          isPending={submitMutation.isPending}
          onConfirm={() => submitMutation.mutate()}
          onClose={() => setShowSubmitModal(false)}
        />
      )}

      {/* Confirm cancel modal */}
      {showCancelModal && (
        <ConfirmModal
          title="¿Cancelar asiento?"
          body="Esta acción revertirá los asientos GL registrados. El asiento pasará a estado Cancelado."
          confirmLabel="Cancelar Asiento"
          confirmClass="btn btn-danger"
          isPending={cancelMutation.isPending}
          onConfirm={() => cancelMutation.mutate()}
          onClose={() => setShowCancelModal(false)}
        />
      )}
    </div>
  )
}
