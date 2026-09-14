import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { getAseguradora, deleteAseguradora, nombreAseguradora } from '@/shared/api/aseguradoras'
import type { ApiError } from '@/shared/api/types'
import { formatDate, formatDOP } from '@/lib/formatters'
import { Permitido } from '@/components/shared/Permitido'
import { Pencil, Ban, Shield, ArrowLeft } from 'lucide-react'

export default function AseguradoraDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [showDisableDialog, setShowDisableDialog] = useState(false)

  const { data: aseguradora, isLoading, isError } = useQuery({
    queryKey: ['aseguradora', id],
    queryFn: () => getAseguradora(id!),
    enabled: Boolean(id),
  })

  const disableMutation = useMutation({
    mutationFn: () => deleteAseguradora(id!),
    onSuccess: () => {
      toast.success('Aseguradora desactivada')
      queryClient.invalidateQueries({ queryKey: ['aseguradoras'] })
      navigate('/farmacia/aseguradoras')
    },
    onError: (err: ApiError) => {
      toast.error(err?.message ?? 'Error al desactivar la aseguradora')
    },
  })

  if (isLoading) {
    return (
      <div className="page-container">
        <div className="skeleton-box" style={{ width: 200, height: 28, marginBottom: 16 }} />
        <div className="skeleton-box" style={{ width: '100%', height: 192, borderRadius: 'var(--radius-lg)' }} />
      </div>
    )
  }

  if (isError || !aseguradora) {
    return (
      <div className="page-container">
        <p style={{ color: 'var(--color-error)' }}>Error al cargar la aseguradora</p>
        <button className="btn btn-ghost" style={{ marginTop: 16 }} onClick={() => navigate('/farmacia/aseguradoras')}>
          Volver
        </button>
      </div>
    )
  }

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <a className="page-back-link" onClick={() => navigate('/farmacia/aseguradoras')}>
            <ArrowLeft size={14} /> Aseguradoras
          </a>
          <h1 className="page-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Shield size={20} style={{ color: 'var(--text-secondary)' }} />
            {nombreAseguradora(aseguradora)}
            {aseguradora.disabled && <span className="badge badge-error">Inactiva</span>}
          </h1>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <Permitido accion="aseguradoras.editar">
            <button className="btn btn-secondary" onClick={() => navigate(`/farmacia/aseguradoras/${id}/editar`)}>
              <Pencil size={14} />
              Editar
            </button>
          </Permitido>
          {!aseguradora.disabled && (
            <Permitido accion="aseguradoras.eliminar">
              <button className="btn btn-danger" onClick={() => setShowDisableDialog(true)}>
                <Ban size={14} />
                Desactivar
              </button>
            </Permitido>
          )}
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <h2 className="card-title">Información General</h2>
        </div>
        <div className="card-body">
          <div className="fields-grid fields-grid-3">
            <div className="detail-field">
              <span className="detail-label">RNC</span>
              <span className="detail-value">{aseguradora.rnc ?? '—'}</span>
            </div>
            <div className="detail-field">
              <span className="detail-label">Email</span>
              <span className="detail-value">{aseguradora.email ?? '—'}</span>
            </div>
            <div className="detail-field">
              <span className="detail-label">Teléfono</span>
              <span className="detail-value">{aseguradora.phone ?? '—'}</span>
            </div>
            <div className="detail-field">
              <span className="detail-label">Dirección</span>
              <span className="detail-value">{aseguradora.address ?? '—'}</span>
            </div>
            <div className="detail-field">
              <span className="detail-label">Cuenta CxC Alterna</span>
              <span className="detail-value">{aseguradora.cuentaCxcDefault ?? '—'}</span>
            </div>
            <div className="detail-field">
              <span className="detail-label">Encargado de Cobros</span>
              <span className="detail-value">{aseguradora.encargadoCxc ?? '—'}</span>
            </div>
            <div className="detail-field">
              <span className="detail-label">Tiene Crédito</span>
              <span className="detail-value">{aseguradora.hasCredit ? 'Sí' : 'No'}</span>
            </div>
            {aseguradora.hasCredit && (
              <>
                <div className="detail-field">
                  <span className="detail-label">Límite de Crédito</span>
                  <span className="detail-value">{formatDOP(aseguradora.creditLimit)}</span>
                </div>
                <div className="detail-field">
                  <span className="detail-label">Días de Crédito</span>
                  <span className="detail-value">{aseguradora.creditDays} días</span>
                </div>
              </>
            )}
            {aseguradora.telefonos && aseguradora.telefonos.length > 0 && (
              <div className="detail-field" style={{ gridColumn: '1 / -1' }}>
                <span className="detail-label">Teléfonos</span>
                <span className="detail-value" style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {aseguradora.telefonos.map((t, i) => (
                    <span key={i}>
                      {t.telefono}
                      {t.etiqueta && <span style={{ color: 'var(--text-tertiary)', marginLeft: 6 }}>({t.etiqueta})</span>}
                    </span>
                  ))}
                </span>
              </div>
            )}
            {aseguradora.createdAt && (
              <div className="detail-field">
                <span className="detail-label">Creada</span>
                <span className="detail-value">{formatDate(aseguradora.createdAt)}</span>
              </div>
            )}
            {aseguradora.modifiedAt && (
              <div className="detail-field">
                <span className="detail-label">Modificada</span>
                <span className="detail-value">{formatDate(aseguradora.modifiedAt)}</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {showDisableDialog && (
        <div className="modal-overlay" onClick={() => setShowDisableDialog(false)}>
          <div className="modal-box modal-box-sm" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <h2 className="modal-title">¿Desactivar aseguradora?</h2>
              <button className="modal-close" onClick={() => setShowDisableDialog(false)}>×</button>
            </div>
            <div className="modal-body">
              <p style={{ fontSize: 14 }}>
                Se desactivará a <strong>{nombreAseguradora(aseguradora)}</strong>. Podrás reactivarla más adelante.
              </p>
            </div>
            <div className="modal-foot">
              <button className="btn btn-ghost" onClick={() => setShowDisableDialog(false)}>Cancelar</button>
              <button
                className="btn btn-danger"
                onClick={() => disableMutation.mutate()}
                disabled={disableMutation.isPending}
              >
                Desactivar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
