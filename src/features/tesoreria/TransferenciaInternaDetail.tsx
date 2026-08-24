import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { ArrowLeft, Send, Ban, Pencil } from 'lucide-react'
import {
  getTransferenciaInterna,
  submitTransferenciaInterna,
  cancelTransferenciaInterna,
  updateTransferenciaInternaCabecera,
} from '@/shared/api/tesoreria'
import type { TesoreriaEstado, UpdateTransferenciaInternaDto } from '@/shared/api/types'
import { formatDate, formatDOP } from '@/lib/formatters'

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

export default function TransferenciaInternaDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const [confirmSubmit, setConfirmSubmit] = useState(false)
  const [confirmCancel, setConfirmCancel] = useState(false)
  const [editOpen, setEditOpen] = useState(false)

  const { data: transferencia, isLoading, isError } = useQuery({
    queryKey: ['tesoreria-transferencia-interna', id],
    queryFn: () => getTransferenciaInterna(id!),
    enabled: !!id,
  })

  function invalidateRelated() {
    queryClient.invalidateQueries({ queryKey: ['tesoreria-transferencia-interna', id] })
    queryClient.invalidateQueries({ queryKey: ['tesoreria-transferencias-internas'] })
    queryClient.invalidateQueries({ queryKey: ['tesoreria-movimientos'] })
  }

  const submitMutation = useMutation({
    mutationFn: () => submitTransferenciaInterna(id!),
    onSuccess: () => { toast.success('Transferencia sometida correctamente'); invalidateRelated(); setConfirmSubmit(false) },
    onError: (err: { message?: string }) => { toast.error(err?.message ?? 'Error al someter la transferencia'); setConfirmSubmit(false) },
  })

  const cancelMutation = useMutation({
    mutationFn: () => cancelTransferenciaInterna(id!),
    onSuccess: () => { toast.success('Transferencia cancelada'); invalidateRelated(); setConfirmCancel(false) },
    onError: (err: { message?: string }) => { toast.error(err?.message ?? 'Error al cancelar la transferencia'); setConfirmCancel(false) },
  })

  if (isLoading) {
    return (
      <div className="page-container">
        <span className="skeleton-box" style={{ height: 28, width: 240, display: 'block', marginBottom: 8 }} />
        <span className="skeleton-box" style={{ height: 16, width: 160, display: 'block', marginBottom: 24 }} />
        <div className="card">
          <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {Array.from({ length: 4 }).map((_, i) => (
              <span key={i} className="skeleton-box" style={{ height: 18, width: `${60 + (i % 3) * 15}%`, display: 'block' }} />
            ))}
          </div>
        </div>
      </div>
    )
  }

  if (isError || !transferencia) {
    return (
      <div className="page-container">
        <a className="page-back-link" onClick={() => navigate('/tesoreria/transferencias')}>
          <ArrowLeft size={14} /> Transferencias Internas
        </a>
        <div style={{ textAlign: 'center', padding: '48px 0', color: 'var(--text-tertiary)' }}>
          No se encontró la transferencia
        </div>
      </div>
    )
  }

  const isDraft = transferencia.estado === 'draft'
  const isSubmitted = transferencia.estado === 'submitted'
  const origenLinea = transferencia.lineas.find((l) => l.credito > 0)
  const destinoLinea = transferencia.lineas.find((l) => l.debito > 0 && l.cuenta !== origenLinea?.cuenta)

  return (
    <div className="page-container">
      <a className="page-back-link" onClick={() => navigate('/tesoreria/transferencias')}>
        <ArrowLeft size={14} /> Transferencias Internas
      </a>

      <div className="page-header">
        <div>
          <h1 className="page-title" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {transferencia.id}
            <span className={`badge ${STATUS_BADGE[transferencia.estado]}`}>{STATUS_LABEL[transferencia.estado]}</span>
          </h1>
          <p className="page-sub">{formatDate(transferencia.fecha)}</p>
        </div>
      </div>

      {(isDraft || isSubmitted) && (
        <div className="doc-actions-bar">
          {isDraft && (
            <>
              <button className="btn btn-ghost btn-size-sm" onClick={() => setEditOpen(true)}>
                <Pencil size={14} /> Editar cabecera
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
        <div className="card-header"><h2 className="card-title">Información de la Transferencia</h2></div>
        <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div className="fields-grid">
            <div className="detail-field">
              <span className="detail-label">Cuenta Origen</span>
              <span className="detail-value">{transferencia.cuentaBancaria ?? origenLinea?.cuenta ?? '—'}</span>
            </div>
            <div className="detail-field">
              <span className="detail-label">Cuenta Destino</span>
              <span className="detail-value">{destinoLinea?.cuenta ?? '—'}</span>
            </div>
            {transferencia.tipoDocumento && (
              <div className="detail-field">
                <span className="detail-label">Tipo de Documento</span>
                <span className="detail-value">{transferencia.tipoDocumento}</span>
              </div>
            )}
            {transferencia.referencias?.numeroReferencia && (
              <div className="detail-field">
                <span className="detail-label">Referencia</span>
                <span className="detail-value" style={{ fontFamily: 'var(--font-mono)' }}>{transferencia.referencias.numeroReferencia}</span>
              </div>
            )}
          </div>

          <div style={{ paddingTop: 16, borderTop: '1px solid var(--border-default)' }}>
            <div className="detail-field">
              <span className="detail-label">Monto (sale de origen)</span>
              <span style={{ fontSize: 22, fontWeight: 700 }}>{formatDOP(transferencia.monto)}</span>
            </div>
          </div>

          {transferencia.descripcion && (
            <div className="detail-field">
              <span className="detail-label">Descripción</span>
              <span className="detail-value">{transferencia.descripcion}</span>
            </div>
          )}
          {transferencia.nota && (
            <div className="detail-field">
              <span className="detail-label">Nota</span>
              <span className="detail-value" style={{ whiteSpace: 'pre-wrap' }}>{transferencia.nota}</span>
            </div>
          )}
        </div>
      </div>

      {transferencia.lineas?.length > 0 && (
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
                {transferencia.lineas.map((l, i) => (
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
            <div className="modal-head"><h2 className="modal-title">Someter Transferencia</h2></div>
            <div className="modal-body">
              <p style={{ margin: 0 }}>
                ¿Confirmas someter la transferencia <strong>{transferencia.id}</strong> por <strong>{formatDOP(transferencia.monto)}</strong>?
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
            <div className="modal-head"><h2 className="modal-title">Cancelar Transferencia</h2></div>
            <div className="modal-body">
              <p style={{ margin: 0 }}>
                ¿Confirmas cancelar la transferencia <strong>{transferencia.id}</strong>? Para corregirla deberás crear una nueva.
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
          transferenciaId={transferencia.id}
          initial={{
            descripcion: transferencia.descripcion ?? '',
            nota: transferencia.nota ?? '',
            numeroReferencia: transferencia.referencias?.numeroReferencia ?? '',
          }}
          onClose={() => setEditOpen(false)}
          onSaved={() => { setEditOpen(false); invalidateRelated() }}
        />
      )}
    </div>
  )
}

interface EditCabeceraValues {
  descripcion: string
  nota: string
  numeroReferencia: string
}

function EditCabeceraModal({
  transferenciaId,
  initial,
  onClose,
  onSaved,
}: {
  transferenciaId: string
  initial: EditCabeceraValues
  onClose: () => void
  onSaved: () => void
}) {
  const [values, setValues] = useState(initial)

  const mutation = useMutation({
    mutationFn: (dto: UpdateTransferenciaInternaDto) => updateTransferenciaInternaCabecera(transferenciaId, dto),
    onSuccess: () => { toast.success('Cabecera actualizada'); onSaved() },
    onError: (err: { message?: string }) => toast.error(err?.message ?? 'Error al actualizar'),
  })

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    mutation.mutate({
      descripcion: values.descripcion || undefined,
      nota: values.nota || undefined,
      referencias: values.numeroReferencia ? { numeroReferencia: values.numeroReferencia } : undefined,
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
              Solo se puede editar la cabecera de un borrador — cuentas, monto y deducciones no
              son editables.
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
