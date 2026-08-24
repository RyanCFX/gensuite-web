import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { ArrowLeft, Send, Ban, Printer, Pencil } from 'lucide-react'
import {
  getEmision,
  submitEmision,
  cancelEmision,
  updateEmisionCabecera,
  getEmisionPdfBlobUrl,
} from '@/shared/api/tesoreria'
import type { TesoreriaEstado, UpdateEmisionDto } from '@/shared/api/types'
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

export default function EmisionDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const [confirmSubmit, setConfirmSubmit] = useState(false)
  const [confirmCancel, setConfirmCancel] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const [printError, setPrintError] = useState<string | null>(null)

  const { data: emision, isLoading, isError } = useQuery({
    queryKey: ['tesoreria-emision', id],
    queryFn: () => getEmision(id!),
    enabled: !!id,
  })

  function invalidateRelated() {
    queryClient.invalidateQueries({ queryKey: ['tesoreria-emision', id] })
    queryClient.invalidateQueries({ queryKey: ['tesoreria-emisiones'] })
    queryClient.invalidateQueries({ queryKey: ['tesoreria-movimientos'] })
  }

  const submitMutation = useMutation({
    mutationFn: () => submitEmision(id!),
    onSuccess: () => {
      toast.success('Emisión sometida correctamente')
      invalidateRelated()
      setConfirmSubmit(false)
    },
    onError: (err: { message?: string }) => {
      toast.error(err?.message ?? 'Error al someter la emisión')
      setConfirmSubmit(false)
    },
  })

  const cancelMutation = useMutation({
    mutationFn: () => cancelEmision(id!),
    onSuccess: () => {
      toast.success('Emisión cancelada')
      invalidateRelated()
      setConfirmCancel(false)
    },
    onError: (err: { message?: string }) => {
      toast.error(err?.message ?? 'Error al cancelar la emisión')
      setConfirmCancel(false)
    },
  })

  const printMutation = useMutation({
    mutationFn: () => getEmisionPdfBlobUrl(id!),
    onSuccess: (url) => {
      setPrintError(null)
      window.open(url, '_blank')
    },
    onError: (err: { message?: string }) => {
      setPrintError(err?.message ?? 'No se pudo generar el PDF')
    },
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

  if (isError || !emision) {
    return (
      <div className="page-container">
        <a className="page-back-link" onClick={() => navigate('/tesoreria/emisiones')}>
          <ArrowLeft size={14} /> Emisiones
        </a>
        <div style={{ textAlign: 'center', padding: '48px 0', color: 'var(--text-tertiary)' }}>
          No se encontró la emisión
        </div>
      </div>
    )
  }

  const isDraft = emision.estado === 'draft'
  const isSubmitted = emision.estado === 'submitted'

  return (
    <div className="page-container">
      <a className="page-back-link" onClick={() => navigate('/tesoreria/emisiones')}>
        <ArrowLeft size={14} /> Emisiones
      </a>

      <div className="page-header">
        <div>
          <h1 className="page-title" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {emision.id}
            <span className={`badge ${STATUS_BADGE[emision.estado]}`}>{STATUS_LABEL[emision.estado]}</span>
          </h1>
          <p className="page-sub">
            {emision.beneficiario?.nombre ?? emision.beneficiarioNombre ?? 'Sin beneficiario'} · {formatDate(emision.fecha)}
          </p>
        </div>
      </div>

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
          <>
            <button className="btn btn-ghost btn-size-sm" onClick={() => printMutation.mutate()} disabled={printMutation.isPending}>
              <Printer size={14} /> {printMutation.isPending ? 'Generando…' : 'Imprimir'}
            </button>
            <button className="btn btn-danger btn-size-sm" onClick={() => setConfirmCancel(true)} disabled={cancelMutation.isPending}>
              <Ban size={14} /> Cancelar
            </button>
          </>
        )}
      </div>

      {printError && (
        <div className="inline-alert inline-alert-error" style={{ marginBottom: 16 }}>
          <p style={{ margin: 0, fontWeight: 500 }}>{printError}</p>
          <p style={{ margin: '4px 0 0', fontSize: 12 }}>
            Intente regenerar la plantilla desde{' '}
            <a onClick={() => navigate('/config/tesoreria/plantillas-cheque')} style={{ cursor: 'pointer', textDecoration: 'underline' }}>
              Configuración → Plantillas de Cheque
            </a>
            , o quite la plantilla configurada en la cuenta bancaria para usar el comprobante genérico mientras se resuelve.
          </p>
        </div>
      )}

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-header"><h2 className="card-title">Información de la Emisión</h2></div>
        <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div className="fields-grid">
            <div className="detail-field">
              <span className="detail-label">Cuenta Bancaria</span>
              <span className="detail-value">{emision.cuentaBancaria ?? '—'}</span>
            </div>
            <div className="detail-field">
              <span className="detail-label">Tipo de Documento</span>
              <span className="detail-value">{emision.tipoDocumento ?? '—'}</span>
            </div>
            <div className="detail-field">
              <span className="detail-label">Fecha</span>
              <span className="detail-value">{formatDate(emision.fecha)}</span>
            </div>
            {emision.referencias?.numeroCheque && (
              <div className="detail-field">
                <span className="detail-label">Número de Cheque</span>
                <span className="detail-value" style={{ fontFamily: 'var(--font-mono)' }}>{emision.referencias.numeroCheque}</span>
              </div>
            )}
            {emision.referencias?.numeroReferencia && (
              <div className="detail-field">
                <span className="detail-label">Referencia</span>
                <span className="detail-value" style={{ fontFamily: 'var(--font-mono)' }}>{emision.referencias.numeroReferencia}</span>
              </div>
            )}
            {emision.documentoOrigen?.doctype && (
              <div className="detail-field">
                <span className="detail-label">Documento Contable</span>
                <span className="detail-value">{emision.documentoOrigen.doctype} — {emision.documentoOrigen.name}</span>
              </div>
            )}
          </div>

          <div style={{ paddingTop: 16, borderTop: '1px solid var(--border-default)' }}>
            <div className="detail-field">
              <span className="detail-label">Monto</span>
              <span style={{ fontSize: 22, fontWeight: 700, color: 'var(--error-text)' }}>{formatDOP(emision.monto)}</span>
            </div>
          </div>

          {emision.descripcion && (
            <div className="detail-field">
              <span className="detail-label">Descripción</span>
              <span className="detail-value">{emision.descripcion}</span>
            </div>
          )}
          {emision.nota && (
            <div className="detail-field">
              <span className="detail-label">Nota</span>
              <span className="detail-value" style={{ whiteSpace: 'pre-wrap' }}>{emision.nota}</span>
            </div>
          )}
        </div>
      </div>

      {emision.lineas?.length > 0 && (
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
                {emision.lineas.map((l, i) => (
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
            <div className="modal-head"><h2 className="modal-title">Someter Emisión</h2></div>
            <div className="modal-body">
              <p style={{ margin: 0 }}>
                ¿Confirmas someter la emisión <strong>{emision.id}</strong> por <strong>{formatDOP(emision.monto)}</strong>?
              </p>
              <p style={{ margin: '8px 0 0', fontSize: 12, color: 'var(--text-secondary)' }}>
                Esta acción generará el asiento contable real y afectará el saldo de la cuenta bancaria.
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
            <div className="modal-head"><h2 className="modal-title">Cancelar Emisión</h2></div>
            <div className="modal-body">
              <p style={{ margin: 0 }}>
                ¿Confirmas cancelar la emisión <strong>{emision.id}</strong>? Para corregirla deberás crear una nueva.
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
          emisionId={emision.id}
          initial={{
            descripcion: emision.descripcion ?? '',
            nota: emision.nota ?? '',
            numeroCheque: emision.referencias?.numeroCheque ?? '',
            numeroReferencia: emision.referencias?.numeroReferencia ?? '',
            comprobante: emision.referencias?.comprobante ?? '',
            branch: emision.branch ?? '',
            department: emision.department ?? '',
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
  numeroCheque: string
  numeroReferencia: string
  comprobante: string
  branch: string
  department: string
}

/**
 * Modal MÍNIMO de edición de un borrador — solo cabecera (descripcion, nota, referencias, branch,
 * department). PUT /tesoreria/emisiones/:id no acepta más que esto; nunca reabrir el formulario
 * completo de creación para editar un borrador.
 */
function EditCabeceraModal({
  emisionId,
  initial,
  onClose,
  onSaved,
}: {
  emisionId: string
  initial: EditCabeceraValues
  onClose: () => void
  onSaved: () => void
}) {
  const [values, setValues] = useState(initial)

  const mutation = useMutation({
    mutationFn: (dto: UpdateEmisionDto) => updateEmisionCabecera(emisionId, dto),
    onSuccess: () => {
      toast.success('Cabecera actualizada')
      onSaved()
    },
    onError: (err: { message?: string }) => toast.error(err?.message ?? 'Error al actualizar'),
  })

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    mutation.mutate({
      descripcion: values.descripcion || undefined,
      nota: values.nota || undefined,
      referencias: {
        numeroCheque: values.numeroCheque || undefined,
        numeroReferencia: values.numeroReferencia || undefined,
        comprobante: values.comprobante || undefined,
      },
      branch: values.branch || undefined,
      department: values.department || undefined,
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
              Solo se puede editar la cabecera de un borrador — monto, beneficiario, deducciones,
              distribución y liquidaciones no son editables. Para corregirlos, descarta este
              borrador (no lo sometas) y crea uno nuevo.
            </p>
            <div className="ff-wrap">
              <label className="ff-label">Descripción</label>
              <input className="ff-input" value={values.descripcion} onChange={(e) => setValues((v) => ({ ...v, descripcion: e.target.value }))} />
            </div>
            <div className="ff-wrap">
              <label className="ff-label">Número de Cheque</label>
              <input className="ff-input" value={values.numeroCheque} onChange={(e) => setValues((v) => ({ ...v, numeroCheque: e.target.value }))} />
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
