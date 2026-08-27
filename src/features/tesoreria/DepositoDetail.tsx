import { useRef, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { ArrowLeft, Send, Ban, Pencil, BookOpen } from 'lucide-react'
import { getDeposito, submitDeposito, cancelDeposito, updateDepositoCabecera, previewAsientosDeposito } from '@/shared/api/tesoreria'
import { getCuentaBancaria } from '@/shared/api/cuentas-bancarias'
import type { TesoreriaEstado, UpdateDepositoDto } from '@/shared/api/types'
import { formatDate, formatDOP } from '@/lib/formatters'
import { AsientosPreviewModal } from '@/components/shared/AsientosPreviewModal'
import { CuentaContableOverrideSection } from './components/CuentaContableOverrideSection'
import { EditableAccountCell, findBancoYPartyRows } from './components/EditableAccountCell'

const STATUS_BADGE: Record<TesoreriaEstado, string> = {
  draft: 'badge-draft',
  submitted: 'badge-submitted',
  cancelled: 'badge-cancelled',
}
const STATUS_LABEL: Record<TesoreriaEstado, string> = {
  draft: 'Borrador',
  submitted: 'Sometido',
  cancelled: 'Cancelado',
}

export default function DepositoDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const [confirmSubmit, setConfirmSubmit] = useState(false)
  const [confirmCancel, setConfirmCancel] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const [previewOpen, setPreviewOpen] = useState(false)

  const [pendingBancoOverride, setPendingBancoOverride] = useState('')
  const [pendingPartyOverride, setPendingPartyOverride] = useState('')
  const refetchPreviewRef = useRef<() => void>(() => {})

  const { data: deposito, isLoading, isError } = useQuery({
    queryKey: ['tesoreria-deposito', id],
    queryFn: () => getDeposito(id!),
    enabled: !!id,
  })

  function invalidateRelated() {
    queryClient.invalidateQueries({ queryKey: ['tesoreria-deposito', id] })
    queryClient.invalidateQueries({ queryKey: ['tesoreria-depositos'] })
    queryClient.invalidateQueries({ queryKey: ['tesoreria-movimientos'] })
  }

  const overrideMutation = useMutation({
    mutationFn: (dto: UpdateDepositoDto) => updateDepositoCabecera(id!, dto),
    onSuccess: () => {
      toast.success('Cuentas actualizadas')
      refetchPreviewRef.current()
      invalidateRelated()
    },
    onError: (err: { message?: string }) => toast.error(err?.message ?? 'Error al actualizar'),
  })

  const submitMutation = useMutation({
    mutationFn: () => submitDeposito(id!),
    onSuccess: () => { toast.success('Depósito sometido correctamente'); invalidateRelated(); setConfirmSubmit(false) },
    onError: (err: { message?: string }) => { toast.error(err?.message ?? 'Error al someter el depósito'); setConfirmSubmit(false) },
  })

  const cancelMutation = useMutation({
    mutationFn: () => cancelDeposito(id!),
    onSuccess: () => { toast.success('Depósito cancelado'); invalidateRelated(); setConfirmCancel(false) },
    onError: (err: { message?: string }) => { toast.error(err?.message ?? 'Error al cancelar el depósito'); setConfirmCancel(false) },
  })

  if (isLoading) {
    return (
      <div className="page-container">
        <span className="skeleton-box" style={{ height: 28, width: 240, display: 'block', marginBottom: 8 }} />
        <span className="skeleton-box" style={{ height: 16, width: 160, display: 'block', marginBottom: 24 }} />
        <div className="card">
          <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {Array.from({ length: 6 }).map((_, i) => (
              <span key={i} className="skeleton-box" style={{ height: 18, width: `${60 + (i % 3) * 15}%`, display: 'block' }} />
            ))}
          </div>
        </div>
      </div>
    )
  }

  if (isError || !deposito) {
    return (
      <div className="page-container">
        <a className="page-back-link" onClick={() => navigate('/tesoreria/depositos')}>
          <ArrowLeft size={14} /> Depósitos
        </a>
        <div style={{ textAlign: 'center', padding: '48px 0', color: 'var(--text-tertiary)' }}>
          No se encontró el depósito
        </div>
      </div>
    )
  }

  const isDraft = deposito.estado === 'draft'
  const isSubmitted = deposito.estado === 'submitted'

  return (
    <div className="page-container">
      <a className="page-back-link" onClick={() => navigate('/tesoreria/depositos')}>
        <ArrowLeft size={14} /> Depósitos
      </a>

      <div className="page-header">
        <div>
          <h1 className="page-title" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {deposito.id}
            <span className={`badge ${STATUS_BADGE[deposito.estado]}`}>{STATUS_LABEL[deposito.estado]}</span>
          </h1>
          <p className="page-sub">
            {deposito.beneficiario?.nombre ?? deposito.beneficiarioNombre ?? 'Sin origen'} · {formatDate(deposito.fecha)}
          </p>
        </div>
      </div>

      {(isDraft || isSubmitted) && (
        <div className="doc-actions-bar">
          {isDraft && (
            <>
              <button className="btn btn-ghost btn-size-sm" onClick={() => setEditOpen(true)}>
                <Pencil size={14} /> Editar cabecera
              </button>
              <button className="btn btn-ghost btn-size-sm" onClick={() => setPreviewOpen(true)}>
                <BookOpen size={14} /> Ver asiento contable
              </button>
              <button className="btn btn-primary btn-size-sm" onClick={() => setConfirmSubmit(true)} disabled={submitMutation.isPending}>
                <Send size={14} /> Someter
              </button>
            </>
          )}
          {isSubmitted && (
            <button className="btn btn-danger btn-size-sm" onClick={() => setConfirmCancel(true)} disabled={cancelMutation.isPending}>
              <Ban size={14} /> Cancelar
            </button>
          )}
        </div>
      )}

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-header"><h2 className="card-title">Información del Depósito</h2></div>
        <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div className="fields-grid">
            <div className="detail-field">
              <span className="detail-label">Cuenta Bancaria</span>
              <span className="detail-value">{deposito.cuentaBancaria ?? '—'}</span>
            </div>
            <div className="detail-field">
              <span className="detail-label">Tipo de Documento</span>
              <span className="detail-value">{deposito.tipoDocumento ?? '—'}</span>
            </div>
            <div className="detail-field">
              <span className="detail-label">Fecha</span>
              <span className="detail-value">{formatDate(deposito.fecha)}</span>
            </div>
            {deposito.referencias?.numeroReferencia && (
              <div className="detail-field">
                <span className="detail-label">Referencia</span>
                <span className="detail-value" style={{ fontFamily: 'var(--font-mono)' }}>{deposito.referencias.numeroReferencia}</span>
              </div>
            )}
            {deposito.documentoOrigen?.doctype && (
              <div className="detail-field">
                <span className="detail-label">Documento Contable</span>
                <span className="detail-value">{deposito.documentoOrigen.doctype} — {deposito.documentoOrigen.name}</span>
              </div>
            )}
            {deposito.cuentaBancoOverride && (
              <div className="detail-field">
                <span className="detail-label">Cuenta del banco (reasignada)</span>
                <span className="detail-value">{deposito.cuentaBancoOverride}</span>
              </div>
            )}
            {deposito.cuentaPartyOverride && (
              <div className="detail-field">
                <span className="detail-label">Cuenta del origen (reasignada)</span>
                <span className="detail-value">{deposito.cuentaPartyOverride}</span>
              </div>
            )}
          </div>

          <div style={{ paddingTop: 16, borderTop: '1px solid var(--border-default)' }}>
            <div className="detail-field">
              <span className="detail-label">Monto</span>
              <span style={{ fontSize: 22, fontWeight: 700, color: 'var(--success-text)' }}>{formatDOP(deposito.monto)}</span>
            </div>
          </div>

          {deposito.descripcion && (
            <div className="detail-field">
              <span className="detail-label">Descripción</span>
              <span className="detail-value">{deposito.descripcion}</span>
            </div>
          )}
          {deposito.nota && (
            <div className="detail-field">
              <span className="detail-label">Nota</span>
              <span className="detail-value" style={{ whiteSpace: 'pre-wrap' }}>{deposito.nota}</span>
            </div>
          )}
        </div>
      </div>

      {deposito.lineas?.length > 0 && (
        <div className="card">
          <div className="card-header"><h2 className="card-title">Asiento Contable</h2></div>
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Cuenta</th>
                  <th style={{ textAlign: 'right' }}>Débito</th>
                  <th style={{ textAlign: 'right' }}>Crédito</th>
                  <th>Descripción</th>
                </tr>
              </thead>
              <tbody>
                {deposito.lineas.map((l, i) => (
                  <tr key={i}>
                    <td>{l.cuenta}{l.esBanco && <span className="badge badge-neutral" style={{ marginLeft: 6 }}>Banco</span>}</td>
                    <td style={{ textAlign: 'right' }}>{l.debito ? formatDOP(l.debito) : '—'}</td>
                    <td style={{ textAlign: 'right' }}>{l.credito ? formatDOP(l.credito) : '—'}</td>
                    <td className="td-muted">{l.descripcion ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {confirmSubmit && (
        <div className="modal-overlay" onClick={() => setConfirmSubmit(false)}>
          <div className="modal-box modal-box-sm" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head"><h2 className="modal-title">Someter Depósito</h2></div>
            <div className="modal-body">
              <p style={{ margin: 0 }}>
                ¿Confirmas someter el depósito <strong>{deposito.id}</strong> por <strong>{formatDOP(deposito.monto)}</strong>?
              </p>
            </div>
            <div className="modal-foot">
              <button className="btn btn-ghost" onClick={() => setConfirmSubmit(false)}>Cancelar</button>
              <button className="btn btn-primary" onClick={() => submitMutation.mutate()} disabled={submitMutation.isPending}>
                {submitMutation.isPending ? <><span className="spinner" /> Sometiendo…</> : <><Send size={14} /> Confirmar</>}
              </button>
            </div>
          </div>
        </div>
      )}

      {confirmCancel && (
        <div className="modal-overlay" onClick={() => setConfirmCancel(false)}>
          <div className="modal-box modal-box-sm" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head"><h2 className="modal-title">Cancelar Depósito</h2></div>
            <div className="modal-body">
              <p style={{ margin: 0 }}>
                ¿Confirmas cancelar el depósito <strong>{deposito.id}</strong>? Para corregirlo deberás crear uno nuevo.
              </p>
            </div>
            <div className="modal-foot">
              <button className="btn btn-ghost" onClick={() => setConfirmCancel(false)}>Volver</button>
              <button className="btn btn-danger" onClick={() => cancelMutation.mutate()} disabled={cancelMutation.isPending}>
                {cancelMutation.isPending ? <><span className="spinner" /> Cancelando…</> : <><Ban size={14} /> Confirmar cancelación</>}
              </button>
            </div>
          </div>
        </div>
      )}

      {editOpen && (
        <EditCabeceraModal
          depositoId={deposito.id}
          cuentaBancariaId={deposito.cuentaBancaria}
          hayOrigen={!!deposito.beneficiario}
          initial={{
            descripcion: deposito.descripcion ?? '',
            nota: deposito.nota ?? '',
            numeroReferencia: deposito.referencias?.numeroReferencia ?? '',
            comprobante: deposito.referencias?.comprobante ?? '',
            cuentaBancoOverride: deposito.cuentaBancoOverride ?? '',
            cuentaPartyOverride: deposito.cuentaPartyOverride ?? '',
          }}
          onClose={() => setEditOpen(false)}
          onSaved={() => { setEditOpen(false); invalidateRelated() }}
        />
      )}

      <AsientosPreviewModal
        open={previewOpen}
        onClose={() => setPreviewOpen(false)}
        queryKey={['tesoreria-deposito-preview-asientos', id]}
        queryFn={() => previewAsientosDeposito(id!)}
        renderAccountCell={isDraft ? (row, _index, rows) => {
          const { bancoRow, partyRow } = findBancoYPartyRows(rows)
          if (row === bancoRow) {
            return <EditableAccountCell row={row} rootType="Asset" onCommit={setPendingBancoOverride} />
          }
          if (row === partyRow) {
            return <EditableAccountCell row={row} onCommit={setPendingPartyOverride} />
          }
          return undefined
        } : undefined}
        extraContent={isDraft ? (refetch) => {
          refetchPreviewRef.current = refetch
          return (
            <button
              type="button"
              className="btn btn-primary btn-size-sm"
              disabled={overrideMutation.isPending || (!pendingBancoOverride && !pendingPartyOverride)}
              onClick={() => overrideMutation.mutate({
                cuentaBancoOverride: pendingBancoOverride || undefined,
                cuentaPartyOverride: pendingPartyOverride || undefined,
              })}
            >
              {overrideMutation.isPending ? 'Guardando…' : 'Guardar cuentas'}
            </button>
          )
        } : undefined}
      />
    </div>
  )
}

interface EditCabeceraValues {
  descripcion: string
  nota: string
  numeroReferencia: string
  comprobante: string
  cuentaBancoOverride: string
  cuentaPartyOverride: string
}

function EditCabeceraModal({
  depositoId,
  cuentaBancariaId,
  hayOrigen,
  initial,
  onClose,
  onSaved,
}: {
  depositoId: string
  cuentaBancariaId: string | null
  hayOrigen: boolean
  initial: EditCabeceraValues
  onClose: () => void
  onSaved: () => void
}) {
  const [values, setValues] = useState(initial)

  const { data: cuentaBancariaDoc } = useQuery({
    queryKey: ['tesoreria-cuenta-bancaria-heredada', cuentaBancariaId],
    queryFn: () => getCuentaBancaria(cuentaBancariaId!),
    enabled: !!cuentaBancariaId,
    retry: false,
  })

  const mutation = useMutation({
    mutationFn: (dto: UpdateDepositoDto) => updateDepositoCabecera(depositoId, dto),
    onSuccess: () => { toast.success('Cabecera actualizada'); onSaved() },
    onError: (err: { message?: string }) => toast.error(err?.message ?? 'Error al actualizar'),
  })

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    mutation.mutate({
      descripcion: values.descripcion || undefined,
      nota: values.nota || undefined,
      referencias: {
        numeroReferencia: values.numeroReferencia || undefined,
        comprobante: values.comprobante || undefined,
      },
      cuentaBancoOverride: values.cuentaBancoOverride || undefined,
      cuentaPartyOverride: hayOrigen && values.cuentaPartyOverride ? values.cuentaPartyOverride : undefined,
    })
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2 className="modal-title">Editar cabecera del borrador</h2>
          <button className="modal-close" type="button" onClick={onClose}>×</button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <p className="ff-hint">
              Solo se puede editar la cabecera de un borrador — monto, origen, deducciones,
              distribución y liquidaciones no son editables.
            </p>
            <div className="ff-wrap">
              <label className="ff-label">Descripción</label>
              <input className="ff-input" value={values.descripcion} onChange={(e) => setValues((v) => ({ ...v, descripcion: e.target.value }))} />
            </div>
            <div className="ff-wrap">
              <label className="ff-label">Número de Referencia</label>
              <input className="ff-input" value={values.numeroReferencia} onChange={(e) => setValues((v) => ({ ...v, numeroReferencia: e.target.value }))} />
            </div>
            <div className="ff-wrap">
              <label className="ff-label">Nota</label>
              <textarea className="ff-input" rows={3} value={values.nota} onChange={(e) => setValues((v) => ({ ...v, nota: e.target.value }))} />
            </div>

            <CuentaContableOverrideSection
              defaultOpen={!!(initial.cuentaBancoOverride || initial.cuentaPartyOverride)}
              rows={[
                {
                  key: 'banco',
                  label: 'Cuenta del banco',
                  value: values.cuentaBancoOverride,
                  onChange: (v) => setValues((s) => ({ ...s, cuentaBancoOverride: v })),
                  cuentaHeredada: cuentaBancariaDoc?.account,
                  rootType: 'Asset',
                },
                {
                  key: 'party',
                  label: 'Cuenta del origen',
                  value: values.cuentaPartyOverride,
                  onChange: (v) => setValues((s) => ({ ...s, cuentaPartyOverride: v })),
                  disabled: !hayOrigen,
                  disabledReason: !hayOrigen ? 'Este borrador no tiene origen (cliente o proveedor).' : undefined,
                },
              ]}
            />
          </div>
          <div className="modal-foot">
            <button type="button" className="btn btn-ghost" onClick={onClose}>Cancelar</button>
            <button type="submit" className="btn btn-primary" disabled={mutation.isPending}>
              {mutation.isPending ? 'Guardando…' : 'Guardar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
