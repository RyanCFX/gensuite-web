import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Plus, X, AlertTriangle, ChevronLeft, ChevronRight } from 'lucide-react'
import { listCierresPeriodo, createCierrePeriodo, submitCierrePeriodo } from '@/shared/api/cierrePeriodo'
import { listEjerciciosFiscales } from '@/shared/api/ejercicioFiscal'
import type { CierrePeriodo, CreateCierrePeriodoDto } from '@/shared/api/types'
import { formatDate } from '@/lib/formatters'
import { PageHeader } from '@/components/shared/PageHeader'
import { SearchSelect } from '@/shared/ui/SearchSelect'
import type { SearchSelectOption } from '@/shared/ui/SearchSelect'
import { DatePicker } from '@/shared/ui/DatePicker'
import { ConfirmModal } from '@/shared/ui/Modal'
import { useConfirmClose } from '@/shared/hooks/useConfirmClose'
import { useDirtyCheck } from '@/shared/hooks/useDirtyCheck'

const STATUS_BADGE: Record<string, string> = {
  draft: 'badge-warning',
  submitted: 'badge-success',
}
const STATUS_LABEL: Record<string, string> = {
  draft: 'Borrador',
  submitted: 'Confirmado',
}

export default function CierrePeriodoPage() {
  const queryClient = useQueryClient()

  // ── Filters ───────────────────────────────────────────────────────────────
  const [fyFilter, setFyFilter] = useState('')

  const { data, isLoading } = useQuery({
    queryKey: ['cierres-periodo', fyFilter],
    queryFn: () => listCierresPeriodo({ fiscalYear: fyFilter || undefined, limit: 50 }),
  })

  const { data: ejerciciosData } = useQuery({
    queryKey: ['ejercicios-fiscales'],
    queryFn: () => listEjerciciosFiscales({ limit: 50 }),
  })

  const ejercicios = ejerciciosData?.items ?? []
  const [fyFilterSearch, setFyFilterSearch] = useState('')
  const fyFilterOptions: SearchSelectOption[] = ejercicios
    .filter((fy) => !fyFilterSearch || fy.year.includes(fyFilterSearch))
    .map((fy) => ({ value: fy.id, label: fy.year }))

  const [formFYSearch, setFormFYSearch] = useState('')
  const formFYOptions: SearchSelectOption[] = ejercicios
    .filter((fy) => !formFYSearch || fy.year.includes(formFYSearch))
    .map((fy) => ({ value: fy.id, label: `${fy.year}${fy.isClosed ? ' — Cerrado' : ' — Abierto'}` }))

  // ── Wizard state ──────────────────────────────────────────────────────────
  const [wizardOpen, setWizardOpen] = useState(false)
  const [step, setStep] = useState(1)

  const [formFY, setFormFY] = useState('')
  const [formPeriodEnd, setFormPeriodEnd] = useState('')
  const [formPostingDate, setFormPostingDate] = useState('')
  const [formCostCenter, setFormCostCenter] = useState('')
  const [formAccountHead, setFormAccountHead] = useState('')
  const [formRemarks, setFormRemarks] = useState('')
  const [formError, setFormError] = useState('')

  function openWizard() {
    setStep(1)
    setFormFY('')
    setFormPeriodEnd('')
    setFormPostingDate('')
    setFormCostCenter('')
    setFormAccountHead('')
    setFormRemarks('')
    setFormError('')
    setWizardOpen(true)
  }

  function closeWizard() {
    setWizardOpen(false)
  }

  const isWizardDirty = useDirtyCheck(
    { formFY, formPeriodEnd, formPostingDate, formCostCenter, formAccountHead, formRemarks },
    wizardOpen,
  )
  const { requestClose: requestCloseWizard, confirming: confirmingWizardClose, confirmDiscard: confirmDiscardWizard, cancelDiscard: cancelDiscardWizard } = useConfirmClose(isWizardDirty, closeWizard)

  function handleFYChange(fyId: string) {
    setFormFY(fyId)
    const fy = ejercicios.find((e) => e.id === fyId)
    if (fy) {
      setFormPeriodEnd(fy.yearEndDate)
      setFormPostingDate(fy.yearEndDate)
    }
  }

  function handlePeriodEndChange(v: string) {
    setFormPeriodEnd(v)
    setFormPostingDate(v)
  }

  function validateStep1(): boolean {
    if (!formFY) { setFormError('Selecciona un ejercicio fiscal'); return false }
    if (!formPeriodEnd) { setFormError('La fecha de fin de período es requerida'); return false }
    if (!formPostingDate) { setFormError('La fecha de registro es requerida'); return false }
    if (!formCostCenter.trim()) { setFormError('El centro de costo es requerido'); return false }
    if (!formAccountHead.trim()) { setFormError('La cuenta contable es requerida'); return false }
    setFormError('')
    return true
  }

  function goToStep2() {
    if (validateStep1()) setStep(2)
  }

  const createMutation = useMutation({
    mutationFn: () => {
      const dto: CreateCierrePeriodoDto = {
        closingFiscalYear: formFY,
        periodEndDate: formPeriodEnd,
        postingDate: formPostingDate,
        costCenter: formCostCenter,
        closingAccountHead: formAccountHead,
        remarks: formRemarks || undefined,
      }
      return createCierrePeriodo(dto)
    },
    onSuccess: (result) => {
      toast.success('Borrador de cierre creado')
      if (result.warning) {
        toast.info(result.warning, { duration: 8000 })
      }
      queryClient.invalidateQueries({ queryKey: ['cierres-periodo'] })
      closeWizard()
    },
    onError: (err: { message?: string }) => toast.error(err?.message ?? 'Error al crear el cierre'),
  })

  // ── Submit confirm ────────────────────────────────────────────────────────
  const [confirmTarget, setConfirmTarget] = useState<CierrePeriodo | null>(null)
  const [confirmText, setConfirmText] = useState('')

  function openConfirm(c: CierrePeriodo) {
    setConfirmTarget(c)
    setConfirmText('')
  }

  const submitMutation = useMutation({
    mutationFn: (id: string) => submitCierrePeriodo(id),
    onSuccess: (result) => {
      toast.success('Cierre confirmado exitosamente')
      if (result.warning) {
        toast.info(result.warning, { duration: 10000 })
      }
      queryClient.invalidateQueries({ queryKey: ['cierres-periodo'] })
      setConfirmTarget(null)
    },
    onError: (err: { message?: string }) => toast.error(err?.message ?? 'Error al confirmar el cierre'),
  })

  const items = data?.items ?? []
  const selectedFY = ejercicios.find((e) => e.id === formFY)

  return (
    <div className="page-container">
      <PageHeader
        title="Cierre de Período"
        description="Gestión de cierres contables por ejercicio fiscal"
      />

      {/* Filter bar */}
      <div className="filter-bar" style={{ marginBottom: 16 }}>
        <div className="filter-bar-left">
          <div style={{ width: 200 }}>
            <SearchSelect
              value={fyFilter}
              onChange={setFyFilter}
              options={fyFilterOptions}
              onSearch={setFyFilterSearch}
              selectedLabel={ejercicios.find((fy) => fy.id === fyFilter)?.year ?? ''}
              placeholder="Todos los ejercicios"
            />
          </div>
        </div>
        <button className="btn btn-primary btn-size-sm" onClick={openWizard}>
          <Plus size={14} /> Nuevo cierre
        </button>
      </div>

      {/* Table */}
      <div className="card">
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Ejercicio Fiscal</th>
                <th>Fin de Período</th>
                <th>Fecha Registro</th>
                <th>Estado</th>
                <th style={{ width: 140 }} />
              </tr>
            </thead>
            <tbody>
              {isLoading
                ? Array.from({ length: 4 }).map((_, i) => (
                    <tr key={i}>
                      {Array.from({ length: 6 }).map((__, j) => (
                        <td key={j}><div className="skeleton-box" style={{ height: 14, width: '100%' }} /></td>
                      ))}
                    </tr>
                  ))
                : items.length === 0
                  ? (
                      <tr>
                        <td colSpan={6}>
                          <div className="empty-state">
                            <p className="empty-title">Sin cierres de período</p>
                            <p className="empty-sub">Crea el primer cierre contable.</p>
                          </div>
                        </td>
                      </tr>
                    )
                  : items.map((c) => (
                      <tr key={c.id}>
                        <td style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>{c.id}</td>
                        <td style={{ fontWeight: 500 }}>{c.closingFiscalYear}</td>
                        <td className="td-muted">{formatDate(c.periodEndDate)}</td>
                        <td className="td-muted">{formatDate(c.postingDate)}</td>
                        <td>
                          <span className={`badge ${STATUS_BADGE[c.status] ?? 'badge-neutral'}`}>
                            {STATUS_LABEL[c.status] ?? c.status}
                          </span>
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          {c.status === 'draft' && (
                            <button
                              className="btn btn-danger btn-size-sm"
                              onClick={() => openConfirm(c)}
                            >
                              Confirmar cierre
                            </button>
                          )}
                          {c.status === 'submitted' && (
                            <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>Finalizado</span>
                          )}
                        </td>
                      </tr>
                    ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Wizard modal ─────────────────────────────────────────────────── */}
      {wizardOpen && (
        <div className="modal-overlay" onClick={requestCloseWizard}>
          <div className="modal-box" style={{ maxWidth: 560 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <h2 className="modal-title">
                Nuevo Cierre de Período
                <span style={{ fontSize: 12, color: 'var(--text-secondary)', fontWeight: 400, marginLeft: 8 }}>
                  Paso {step} de 2
                </span>
              </h2>
              <button className="modal-close" onClick={requestCloseWizard}><X size={16} /></button>
            </div>

            {step === 1 && (
              <>
                <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  <div className="ff-wrap">
                    <label className="ff-label ff-required">Ejercicio Fiscal</label>
                    <SearchSelect
                      value={formFY}
                      onChange={handleFYChange}
                      options={formFYOptions}
                      onSearch={setFormFYSearch}
                      selectedLabel={selectedFY ? `${selectedFY.year}${selectedFY.isClosed ? ' — Cerrado' : ' — Abierto'}` : ''}
                      placeholder="Seleccionar ejercicio…"
                    />
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    <div className="ff-wrap">
                      <label className="ff-label ff-required">Fin de Período</label>
                      <DatePicker
                        className="ff-input"
                        value={formPeriodEnd}
                        onChange={handlePeriodEndChange}
                      />
                    </div>
                    <div className="ff-wrap">
                      <label className="ff-label ff-required">Fecha de Registro</label>
                      <DatePicker
                        className="ff-input"
                        value={formPostingDate}
                        onChange={setFormPostingDate}
                      />
                    </div>
                  </div>

                  <div className="ff-wrap">
                    <label className="ff-label ff-required">Centro de Costo</label>
                    <input
                      className="ff-input"
                      value={formCostCenter}
                      onChange={(e) => setFormCostCenter(e.target.value)}
                      placeholder="Centro Principal - EMP"
                    />
                  </div>

                  <div className="ff-wrap">
                    <label className="ff-label ff-required">Cuenta de Cierre</label>
                    <input
                      className="ff-input"
                      value={formAccountHead}
                      onChange={(e) => setFormAccountHead(e.target.value)}
                      placeholder="Utilidades Retenidas - EMP"
                    />
                    <p className="ff-hint">Cuenta de Ganancias Retenidas en ERPNext</p>
                  </div>

                  <div className="ff-wrap">
                    <label className="ff-label">Observaciones</label>
                    <textarea
                      className="ff-textarea"
                      rows={2}
                      value={formRemarks}
                      onChange={(e) => setFormRemarks(e.target.value)}
                      placeholder="Cierre ejercicio fiscal 2026"
                    />
                  </div>

                  {formError && (
                    <p style={{ fontSize: 12, color: 'var(--error-text)', margin: 0 }}>{formError}</p>
                  )}
                </div>
                <div className="modal-foot">
                  <button className="btn btn-ghost" onClick={requestCloseWizard}>Cancelar</button>
                  <button className="btn btn-primary" onClick={goToStep2}>
                    Revisar <ChevronRight size={14} />
                  </button>
                </div>
              </>
            )}

            {step === 2 && (
              <>
                <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  {/* Warning banner */}
                  <div style={{
                    display: 'flex',
                    gap: 10,
                    padding: '12px 14px',
                    background: 'var(--warning-surface)',
                    border: '1px solid var(--warning-border)',
                    borderRadius: 'var(--radius-md)',
                    color: 'var(--warning-text)',
                  }}>
                    <AlertTriangle size={16} style={{ flexShrink: 0, marginTop: 1 }} />
                    <p style={{ fontSize: 13, margin: 0, lineHeight: 1.5 }}>
                      Al confirmar el cierre contable, ERPNext generará <strong>asientos GL irreversibles</strong> que transferirán el resultado neto del período a la cuenta de Ganancias Retenidas. <strong>Esta acción no puede deshacerse.</strong>
                    </p>
                  </div>

                  {/* Summary */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    {([
                      ['Ejercicio Fiscal', selectedFY?.year ?? formFY],
                      ['Fin de Período', formatDate(formPeriodEnd)],
                      ['Fecha de Registro', formatDate(formPostingDate)],
                      ['Centro de Costo', formCostCenter],
                      ['Cuenta de Cierre', formAccountHead],
                      formRemarks ? ['Observaciones', formRemarks] : null,
                    ] as ([string, string] | null)[]).filter((item): item is [string, string] => item !== null).map(([label, value]) => (
                      <div key={label} style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                        <span style={{ fontSize: 11, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</span>
                        <span style={{ fontSize: 13, fontWeight: 500 }}>{value}</span>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="modal-foot">
                  <button className="btn btn-ghost" onClick={() => setStep(1)}>
                    <ChevronLeft size={14} /> Atrás
                  </button>
                  <button
                    className="btn btn-primary"
                    onClick={() => createMutation.mutate()}
                    disabled={createMutation.isPending}
                  >
                    {createMutation.isPending ? 'Creando…' : 'Crear borrador'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      <ConfirmModal
        open={confirmingWizardClose}
        onClose={cancelDiscardWizard}
        onConfirm={confirmDiscardWizard}
        title="¿Descartar cambios?"
        description="Tienes cambios sin guardar en este formulario. Si continúas, se perderán."
        confirmLabel="Descartar cambios"
        variant="danger"
      />

      {/* ── Confirm submit dialog ─────────────────────────────────────────── */}
      {confirmTarget && (
        <div className="modal-overlay" onClick={() => setConfirmTarget(null)}>
          <div className="modal-box modal-box-sm" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <h2 className="modal-title" style={{ color: 'var(--error-text)' }}>Accion Irreversible</h2>
              <button className="modal-close" onClick={() => setConfirmTarget(null)}><X size={16} /></button>
            </div>
            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div style={{
                padding: '12px 14px',
                background: 'var(--error-surface)',
                border: '1px solid var(--error-border)',
                borderRadius: 'var(--radius-md)',
                color: 'var(--error-text)',
                fontSize: 13,
                lineHeight: 1.5,
              }}>
                <p style={{ margin: 0 }}>
                  ¿Confirmar el cierre del período <strong>{confirmTarget.closingFiscalYear}</strong>?
                  ERPNext ejecutará los asientos contables que transfieren el resultado neto a{' '}
                  <strong>{confirmTarget.closingAccountHead}</strong>.{' '}
                  <strong>Esta operación NO puede deshacerse.</strong>
                </p>
              </div>
              <div className="ff-wrap">
                <label className="ff-label">Escribe <strong>CONFIRMAR</strong> para continuar</label>
                <input
                  className="ff-input"
                  value={confirmText}
                  onChange={(e) => setConfirmText(e.target.value)}
                  placeholder="CONFIRMAR"
                  autoComplete="off"
                />
              </div>
            </div>
            <div className="modal-foot">
              <button className="btn btn-ghost" onClick={() => setConfirmTarget(null)}>Cancelar</button>
              <button
                className="btn btn-danger"
                disabled={confirmText !== 'CONFIRMAR' || submitMutation.isPending}
                onClick={() => submitMutation.mutate(confirmTarget.id)}
              >
                {submitMutation.isPending ? 'Confirmando…' : 'Confirmar cierre'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
