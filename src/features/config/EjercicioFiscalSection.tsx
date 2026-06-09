import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Plus, Pencil, Lock, LockOpen } from 'lucide-react'
import { X } from 'lucide-react'
import {
  listEjerciciosFiscales,
  getEjercicioVigente,
  createEjercicioFiscal,
  updateEjercicioFiscal,
  closeEjercicioFiscal,
  reopenEjercicioFiscal,
} from '@/shared/api/ejercicioFiscal'
import type { EjercicioFiscal, CreateEjercicioFiscalDto } from '@/shared/api/types'
import { formatDate } from '@/lib/formatters'

export default function EjercicioFiscalSection() {
  const queryClient = useQueryClient()

  const { data, isLoading } = useQuery({
    queryKey: ['ejercicios-fiscales'],
    queryFn: () => listEjerciciosFiscales({ limit: 50 }),
  })

  const { data: vigente } = useQuery({
    queryKey: ['ejercicio-vigente'],
    queryFn: getEjercicioVigente,
  })

  // ── Form state ────────────────────────────────────────────────────────────
  const [showForm, setShowForm] = useState(false)
  const [editTarget, setEditTarget] = useState<EjercicioFiscal | null>(null)
  const [formYear, setFormYear] = useState('')
  const [formStart, setFormStart] = useState('')
  const [formEnd, setFormEnd] = useState('')
  const [formError, setFormError] = useState('')

  // ── Confirm dialogs ───────────────────────────────────────────────────────
  const [confirmClose, setConfirmClose] = useState<EjercicioFiscal | null>(null)
  const [confirmReopen, setConfirmReopen] = useState<EjercicioFiscal | null>(null)

  function openCreate() {
    setEditTarget(null)
    setFormYear('')
    setFormStart('')
    setFormEnd('')
    setFormError('')
    setShowForm(true)
  }

  function openEdit(fy: EjercicioFiscal) {
    setEditTarget(fy)
    setFormYear(fy.year)
    setFormStart(fy.yearStartDate)
    setFormEnd(fy.yearEndDate)
    setFormError('')
    setShowForm(true)
  }

  function closeForm() {
    setShowForm(false)
    setEditTarget(null)
    setFormError('')
  }

  function validateForm(): boolean {
    if (!formYear.trim()) { setFormError('El año es requerido'); return false }
    if (!formStart) { setFormError('La fecha de inicio es requerida'); return false }
    if (!formEnd) { setFormError('La fecha de fin es requerida'); return false }
    if (formEnd <= formStart) { setFormError('La fecha de fin debe ser mayor que la de inicio'); return false }
    setFormError('')
    return true
  }

  const saveMutation = useMutation({
    mutationFn: () => {
      const dto: CreateEjercicioFiscalDto = { year: formYear, yearStartDate: formStart, yearEndDate: formEnd }
      return editTarget ? updateEjercicioFiscal(editTarget.id, dto) : createEjercicioFiscal(dto)
    },
    onSuccess: () => {
      toast.success(editTarget ? 'Ejercicio actualizado' : 'Ejercicio fiscal creado')
      queryClient.invalidateQueries({ queryKey: ['ejercicios-fiscales'] })
      queryClient.invalidateQueries({ queryKey: ['ejercicio-vigente'] })
      closeForm()
    },
    onError: (err: { message?: string }) => toast.error(err?.message ?? 'Error al guardar'),
  })

  const closeMutation = useMutation({
    mutationFn: (id: string) => closeEjercicioFiscal(id),
    onSuccess: () => {
      toast.success('Ejercicio cerrado')
      queryClient.invalidateQueries({ queryKey: ['ejercicios-fiscales'] })
      setConfirmClose(null)
    },
    onError: (err: { message?: string }) => toast.error(err?.message ?? 'Error al cerrar'),
  })

  const reopenMutation = useMutation({
    mutationFn: (id: string) => reopenEjercicioFiscal(id),
    onSuccess: () => {
      toast.success('Ejercicio reabierto')
      queryClient.invalidateQueries({ queryKey: ['ejercicios-fiscales'] })
      setConfirmReopen(null)
    },
    onError: (err: { message?: string }) => toast.error(err?.message ?? 'Error al reabrir'),
  })

  function handleSave() {
    if (!validateForm()) return
    saveMutation.mutate()
  }

  const items = data?.items ?? []

  return (
    <>
      <div className="card">
        <div className="card-header">
          <span className="card-title">Ejercicios Fiscales</span>
          <button className="btn btn-primary btn-size-sm" onClick={openCreate}>
            <Plus size={14} /> Nuevo ejercicio
          </button>
        </div>
        <div>
          {isLoading
            ? <span className="skeleton-box" style={{ height: 128, display: 'block', margin: 16 }} />
            : items.length === 0
              ? (
                  <div className="card-body">
                    <div className="empty-state">
                      <p className="empty-title">Sin ejercicios fiscales</p>
                      <p className="empty-sub">Crea el primer ejercicio fiscal para comenzar.</p>
                    </div>
                  </div>
                )
              : (
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Año</th>
                        <th>Inicio</th>
                        <th>Fin</th>
                        <th>Estado</th>
                        <th style={{ width: 120 }} />
                      </tr>
                    </thead>
                    <tbody>
                      {items.map((fy) => {
                        const isVigente = vigente?.id === fy.id
                        return (
                          <tr key={fy.id}>
                            <td style={{ fontWeight: 600 }}>
                              {fy.year}
                              {isVigente && (
                                <span className="badge badge-info" style={{ marginLeft: 8, fontSize: 10 }}>Vigente</span>
                              )}
                            </td>
                            <td className="td-muted">{formatDate(fy.yearStartDate)}</td>
                            <td className="td-muted">{formatDate(fy.yearEndDate)}</td>
                            <td>
                              {fy.isClosed
                                ? <span className="badge badge-error">Cerrado</span>
                                : <span className="badge badge-success">Abierto</span>}
                            </td>
                            <td>
                              <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                                {/* Edit — disabled if closed */}
                                <button
                                  className="btn btn-ghost btn-size-icon-sm"
                                  onClick={() => openEdit(fy)}
                                  disabled={fy.isClosed}
                                  title={fy.isClosed ? 'Reabra el ejercicio para editarlo' : 'Editar'}
                                >
                                  <Pencil size={13} />
                                </button>
                                {/* Close / Reopen */}
                                {fy.isClosed
                                  ? (
                                      <button
                                        className="btn btn-ghost btn-size-icon-sm"
                                        title="Reabrir ejercicio"
                                        onClick={() => setConfirmReopen(fy)}
                                      >
                                        <LockOpen size={13} />
                                      </button>
                                    )
                                  : (
                                      <button
                                        className="btn btn-ghost btn-size-icon-sm"
                                        title="Cerrar ejercicio"
                                        style={{ color: 'var(--color-warning)' }}
                                        onClick={() => setConfirmClose(fy)}
                                      >
                                        <Lock size={13} />
                                      </button>
                                    )}
                              </div>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                )}
        </div>
      </div>

      {/* ── Create / Edit modal ────────────────────────────────────────────── */}
      {showForm && (
        <div className="modal-overlay" onClick={closeForm}>
          <div className="modal-box modal-box-sm" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <h2 className="modal-title">{editTarget ? 'Editar Ejercicio Fiscal' : 'Nuevo Ejercicio Fiscal'}</h2>
              <button className="modal-close" onClick={closeForm}><X size={16} /></button>
            </div>
            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div className="ff-wrap">
                <label className="ff-label ff-required">Año</label>
                <input
                  className="ff-input"
                  value={formYear}
                  onChange={(e) => setFormYear(e.target.value)}
                  placeholder="2026"
                />
              </div>
              <div className="ff-wrap">
                <label className="ff-label ff-required">Fecha de inicio</label>
                <input
                  type="date"
                  className="ff-input"
                  value={formStart}
                  onChange={(e) => setFormStart(e.target.value)}
                />
              </div>
              <div className="ff-wrap">
                <label className="ff-label ff-required">Fecha de fin</label>
                <input
                  type="date"
                  className="ff-input"
                  value={formEnd}
                  onChange={(e) => setFormEnd(e.target.value)}
                />
              </div>
              {formError && (
                <p style={{ fontSize: 12, color: 'var(--error-text)', margin: 0 }}>{formError}</p>
              )}
            </div>
            <div className="modal-foot">
              <button className="btn btn-ghost" onClick={closeForm}>Cancelar</button>
              <button
                className="btn btn-primary"
                onClick={handleSave}
                disabled={saveMutation.isPending}
              >
                {saveMutation.isPending ? 'Guardando…' : editTarget ? 'Guardar cambios' : 'Crear ejercicio'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Confirm Close ─────────────────────────────────────────────────── */}
      {confirmClose && (
        <div className="modal-overlay" onClick={() => setConfirmClose(null)}>
          <div className="modal-box modal-box-sm" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <h2 className="modal-title">¿Cerrar ejercicio fiscal {confirmClose.year}?</h2>
              <button className="modal-close" onClick={() => setConfirmClose(null)}><X size={16} /></button>
            </div>
            <div className="modal-body">
              <p style={{ fontSize: 13 }}>
                Los reportes financieros seguirán siendo accesibles, pero <strong>no se podrán modificar transacciones retroactivas</strong> en este período.
              </p>
            </div>
            <div className="modal-foot">
              <button className="btn btn-ghost" onClick={() => setConfirmClose(null)}>Cancelar</button>
              <button
                className="btn btn-danger"
                onClick={() => closeMutation.mutate(confirmClose.id)}
                disabled={closeMutation.isPending}
              >
                {closeMutation.isPending ? 'Cerrando…' : 'Cerrar ejercicio'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Confirm Reopen ─────────────────────────────────────────────────── */}
      {confirmReopen && (
        <div className="modal-overlay" onClick={() => setConfirmReopen(null)}>
          <div className="modal-box modal-box-sm" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <h2 className="modal-title">¿Reabrir ejercicio fiscal {confirmReopen.year}?</h2>
              <button className="modal-close" onClick={() => setConfirmReopen(null)}><X size={16} /></button>
            </div>
            <div className="modal-body">
              <p style={{ fontSize: 13 }}>
                El ejercicio volverá a estar <strong>abierto</strong> y podrá recibir transacciones nuevamente.
              </p>
            </div>
            <div className="modal-foot">
              <button className="btn btn-ghost" onClick={() => setConfirmReopen(null)}>Cancelar</button>
              <button
                className="btn btn-primary"
                onClick={() => reopenMutation.mutate(confirmReopen.id)}
                disabled={reopenMutation.isPending}
              >
                {reopenMutation.isPending ? 'Reabriendo…' : 'Reabrir ejercicio'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
