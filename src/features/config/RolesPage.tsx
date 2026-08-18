import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { ShieldOff, Plus, ChevronRight } from 'lucide-react'
import { PageHeader } from '@/components/shared/PageHeader'
import { useIsSystemManager } from '@/shared/hooks/useIsSystemManager'
import { listRoles } from '@/shared/api/usuarios'
import { createRole } from '@/shared/api/roles'
import type { ApiError, CreateRoleDto } from '@/shared/api/types'
import { ConfirmModal } from '@/shared/ui/Modal'
import { useConfirmClose } from '@/shared/hooks/useConfirmClose'
import { useDirtyCheck } from '@/shared/hooks/useDirtyCheck'

function apiMessage(err: unknown, fallback: string): string {
  return (err as ApiError)?.message ?? fallback
}

export default function RolesPage() {
  const isSystemManager = useIsSystemManager()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [showCreate, setShowCreate] = useState(false)

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['roles-admin'],
    queryFn: listRoles,
    enabled: isSystemManager,
    retry: false,
  })

  const createMutation = useMutation({
    mutationFn: (dto: CreateRoleDto) => createRole(dto),
    onSuccess: (_, dto) => {
      toast.success(`Rol "${dto.roleName}" creado`)
      queryClient.invalidateQueries({ queryKey: ['roles-admin'] })
      queryClient.invalidateQueries({ queryKey: ['roles'] })
      setShowCreate(false)
      navigate(`/config/roles/${encodeURIComponent(dto.roleName)}`)
    },
    onError: (err) => toast.error(apiMessage(err, 'No se pudo crear el rol')),
  })

  if (!isSystemManager) {
    return (
      <div className="page-container">
        <PageHeader title="Roles" description="Roles del sistema y usuarios asignados" />
        <div className="empty-state">
          <span className="empty-icon"><ShieldOff size={20} /></span>
          <p className="empty-title">Acceso restringido</p>
          <p className="empty-sub">Esta sección requiere el rol System Manager en el sistema.</p>
        </div>
      </div>
    )
  }

  const forbidden = (error as unknown as ApiError | null)?.statusCode === 403

  return (
    <div className="page-container">
      <PageHeader
        title="Roles"
        description="Roles del sistema y usuarios asignados"
        action={
          <button className="btn btn-primary" onClick={() => setShowCreate(true)}>
            <Plus size={16} /> Nuevo Rol
          </button>
        }
      />

      <div className="table-scroll">
        <table className="data-table">
          <thead>
            <tr>
              <th>Rol</th>
              <th style={{ width: 48 }} />
            </tr>
          </thead>
          <tbody>
            {isLoading
              ? Array.from({ length: 6 }).map((_, i) => (
                  <tr key={i}>
                    <td><div className="skeleton-box" style={{ height: 14, width: '40%' }} /></td>
                    <td />
                  </tr>
                ))
              : forbidden
                ? (
                    <tr>
                      <td colSpan={2}>
                        <div className="empty-state">
                          <p className="empty-title">Acceso restringido</p>
                          <p className="empty-sub">Tu usuario no tiene el rol System Manager en el sistema.</p>
                        </div>
                      </td>
                    </tr>
                  )
                : isError
                  ? (
                      <tr>
                        <td colSpan={2} style={{ textAlign: 'center', padding: '32px 0', color: 'var(--error-text)' }}>
                          {apiMessage(error, 'Error al cargar los roles')}
                        </td>
                      </tr>
                    )
                  : (data ?? []).map((role) => (
                      <tr
                        key={role.id}
                        className="table-row-clickable"
                        onClick={() => navigate(`/config/roles/${encodeURIComponent(role.id)}`)}
                      >
                        <td style={{ fontWeight: 500 }}>{role.label}</td>
                        <td className="td-muted" style={{ textAlign: 'center' }}>
                          <ChevronRight size={14} />
                        </td>
                      </tr>
                    ))}
          </tbody>
        </table>
      </div>

      {showCreate && (
        <CreateRoleModal
          onClose={() => setShowCreate(false)}
          onSubmit={(dto) => createMutation.mutate(dto)}
          isPending={createMutation.isPending}
        />
      )}
    </div>
  )
}

function CreateRoleModal({
  onClose,
  onSubmit,
  isPending,
}: {
  onClose: () => void
  onSubmit: (dto: CreateRoleDto) => void
  isPending: boolean
}) {
  const [roleName, setRoleName] = useState('')
  const [deskAccess, setDeskAccess] = useState(true)

  const isDirty = useDirtyCheck({ roleName, deskAccess }, true)
  const { requestClose, confirming, confirmDiscard, cancelDiscard } = useConfirmClose(isDirty, onClose)

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!roleName.trim()) return
    onSubmit({ roleName: roleName.trim(), deskAccess })
  }

  return (
    <div className="modal-overlay" onClick={requestClose}>
      <div className="modal-box modal-box-sm" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2 className="modal-title">Nuevo Rol</h2>
          <button className="modal-close" onClick={requestClose}>×</button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div className="ff-wrap">
              <label className="ff-label" htmlFor="roleName">Nombre del rol</label>
              <input
                id="roleName"
                className="ff-input"
                value={roleName}
                onChange={(e) => setRoleName(e.target.value)}
                placeholder="Ej. Supervisor de Caja"
                autoFocus
                required
              />
            </div>
            <label className="ff-check-wrap">
              <input
                type="checkbox"
                className="ff-check"
                checked={deskAccess}
                onChange={(e) => setDeskAccess(e.target.checked)}
              />
              Acceso al Desk
            </label>
          </div>
          <div className="modal-foot">
            <button type="button" className="btn btn-ghost" onClick={requestClose}>Cancelar</button>
            <button type="submit" className="btn btn-primary" disabled={!roleName.trim() || isPending}>
              Crear Rol
            </button>
          </div>
        </form>
      </div>
      <ConfirmModal
        open={confirming}
        onClose={cancelDiscard}
        onConfirm={confirmDiscard}
        title="¿Descartar cambios?"
        description="Tienes cambios sin guardar en este formulario. Si continúas, se perderán."
        confirmLabel="Descartar cambios"
        variant="danger"
      />
    </div>
  )
}
