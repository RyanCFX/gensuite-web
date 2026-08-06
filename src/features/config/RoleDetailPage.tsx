import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { ShieldOff, Ban, CheckCircle2, Trash2, Info } from 'lucide-react'
import { PageHeader } from '@/components/shared/PageHeader'
import { useIsSystemManager } from '@/shared/hooks/useIsSystemManager'
import { getRoleDetail, updateRole, deleteRole } from '@/shared/api/roles'
import type { ApiError } from '@/shared/api/types'

function apiMessage(err: unknown, fallback: string): string {
  return (err as ApiError)?.message ?? fallback
}

export default function RoleDetailPage() {
  const { name = '' } = useParams<{ name: string }>()
  const roleName = decodeURIComponent(name)
  const isSystemManager = useIsSystemManager()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [confirmDelete, setConfirmDelete] = useState(false)

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['role-detail', roleName],
    queryFn: () => getRoleDetail(roleName),
    enabled: isSystemManager && !!roleName,
    retry: false,
  })

  const toggleDisabledMutation = useMutation({
    mutationFn: (disabled: boolean) => updateRole(roleName, { disabled }),
    onSuccess: (_, disabled) => {
      toast.success(disabled ? 'Rol deshabilitado' : 'Rol habilitado')
      queryClient.invalidateQueries({ queryKey: ['role-detail', roleName] })
    },
    onError: (err) => toast.error(apiMessage(err, 'No se pudo actualizar el rol')),
  })

  const toggleDeskAccessMutation = useMutation({
    mutationFn: (deskAccess: boolean) => updateRole(roleName, { deskAccess }),
    onSuccess: () => {
      toast.success('Acceso al Desk actualizado')
      queryClient.invalidateQueries({ queryKey: ['role-detail', roleName] })
    },
    onError: (err) => toast.error(apiMessage(err, 'No se pudo actualizar el rol')),
  })

  const deleteMutation = useMutation({
    mutationFn: () => deleteRole(roleName),
    onSuccess: () => {
      toast.success('Rol eliminado')
      queryClient.invalidateQueries({ queryKey: ['roles-admin'] })
      queryClient.invalidateQueries({ queryKey: ['roles'] })
      navigate('/config/roles', { replace: true })
    },
    onError: (err) => {
      toast.error(apiMessage(err, 'No se pudo eliminar el rol'))
      setConfirmDelete(false)
    },
  })

  if (!isSystemManager) {
    return (
      <div className="page-container">
        <PageHeader title="Rol" description="Detalle de rol" />
        <div className="empty-state">
          <span className="empty-icon"><ShieldOff size={20} /></span>
          <p className="empty-title">Acceso restringido</p>
          <p className="empty-sub">Esta sección requiere el rol System Manager en ERPNext.</p>
        </div>
      </div>
    )
  }

  const forbidden = (error as unknown as ApiError | null)?.statusCode === 403

  if (forbidden) {
    return (
      <div className="page-container">
        <PageHeader title="Rol" description="Detalle de rol" />
        <div className="empty-state">
          <span className="empty-icon"><ShieldOff size={20} /></span>
          <p className="empty-title">Acceso restringido</p>
          <p className="empty-sub">Tu usuario no tiene el rol System Manager en ERPNext.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="page-container">
      <button className="page-back-link" onClick={() => navigate('/config/roles')} style={{ marginBottom: 12 }}>
        ← Roles
      </button>

      {isLoading && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div className="skeleton-box" style={{ height: 28, width: '30%' }} />
          <div className="skeleton-box" style={{ height: 120, width: '100%' }} />
        </div>
      )}

      {isError && !forbidden && (
        <div className="inline-alert inline-alert-error">
          {apiMessage(error, 'Error al cargar el rol')}
        </div>
      )}

      {data && (
        <>
          <div className="page-header">
            <div>
              <h1 className="page-title">{data.roleName}</h1>
              <p className="page-sub">
                {data.isCustom ? 'Rol personalizado' : 'Rol estándar de ERPNext'}
              </p>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                className="btn btn-secondary"
                onClick={() => toggleDisabledMutation.mutate(!data.disabled)}
                disabled={toggleDisabledMutation.isPending}
              >
                {data.disabled ? <CheckCircle2 size={14} /> : <Ban size={14} />}
                {data.disabled ? 'Habilitar' : 'Deshabilitar'}
              </button>
              <button
                className="btn btn-danger"
                onClick={() => setConfirmDelete(true)}
                disabled={!data.isCustom}
                title={!data.isCustom ? 'Los roles estándar de ERPNext no se pueden eliminar' : undefined}
              >
                <Trash2 size={14} /> Eliminar
              </button>
            </div>
          </div>

          {!data.isCustom && (
            <div className="inline-alert inline-alert-info" style={{ marginBottom: 16 }}>
              <Info size={14} aria-hidden="true" />
              Este es un rol estándar de ERPNext — no se puede eliminar.
            </div>
          )}

          <div className="card" style={{ marginBottom: 16 }}>
            <div className="card-header">
              <h3 className="card-title">Detalle</h3>
            </div>
            <div className="card-body fields-grid fields-grid-3">
              <div className="detail-field">
                <span className="detail-label">Estado</span>
                <span className="detail-value">
                  {data.disabled
                    ? <span className="badge badge-error">Deshabilitado</span>
                    : <span className="badge badge-success">Habilitado</span>}
                </span>
              </div>
              <div className="detail-field">
                <span className="detail-label">Acceso al Desk</span>
                <span className="detail-value">
                  <label className="ff-check-wrap">
                    <input
                      type="checkbox"
                      className="ff-check"
                      checked={data.deskAccess}
                      onChange={(e) => toggleDeskAccessMutation.mutate(e.target.checked)}
                      disabled={toggleDeskAccessMutation.isPending}
                    />
                    {data.deskAccess ? 'Sí' : 'No'}
                  </label>
                </span>
              </div>
              <div className="detail-field">
                <span className="detail-label">Tipo</span>
                <span className="detail-value">
                  {data.isCustom
                    ? <span className="badge badge-info">Personalizado</span>
                    : <span className="badge badge-neutral">Estándar</span>}
                </span>
              </div>
            </div>
          </div>

          <div className="card">
            <div className="card-header">
              <h3 className="card-title">Usuarios con este rol ({data.users.length})</h3>
            </div>
            {data.users.length === 0 ? (
              <div className="card-body">
                <div className="empty-state">
                  <p className="empty-title">Sin usuarios asignados</p>
                  <p className="empty-sub">Ningún usuario tiene este rol actualmente.</p>
                </div>
              </div>
            ) : (
              <div className="table-scroll">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Usuario</th>
                      <th>Correo</th>
                      <th>Estado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.users.map((u) => (
                      <tr key={u.email}>
                        <td style={{ fontWeight: 500 }}>{u.fullName}</td>
                        <td className="td-muted">{u.email}</td>
                        <td>
                          {u.enabled
                            ? <span className="badge badge-success">Activo</span>
                            : <span className="badge badge-error">Inactivo</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      {confirmDelete && (
        <div className="modal-overlay" onClick={() => setConfirmDelete(false)}>
          <div className="modal-box modal-box-sm" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <h2 className="modal-title">¿Eliminar rol?</h2>
              <button className="modal-close" onClick={() => setConfirmDelete(false)}>×</button>
            </div>
            <div className="modal-body">
              <p style={{ fontSize: 14 }}>
                Se eliminará el rol <strong>{roleName}</strong>. ERPNext rechazará esta acción si
                el rol sigue asignado a algún usuario o tiene permisos de DocType activos.
              </p>
            </div>
            <div className="modal-foot">
              <button className="btn btn-ghost" onClick={() => setConfirmDelete(false)}>Cancelar</button>
              <button
                className="btn btn-danger"
                onClick={() => deleteMutation.mutate()}
                disabled={deleteMutation.isPending}
              >
                Eliminar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
