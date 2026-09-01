// Lista las plantillas ya persistidas en el backend para el tipo activo (§1.2 del doc de la
// tarea) — a diferencia de la Galería (diseños prefabricados, locales) y Borradores
// (localStorage, trabajo en progreso), esto es "mis plantillas guardadas" en el servidor.

import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { FolderOpen, Star, Trash2 } from 'lucide-react'
import { listPlantillas, getPlantilla } from '@/shared/api/plantillas'
import { ConfirmModal } from '@/shared/ui/Modal'
import { toApiType } from './typeMapping'
import type { TemplateDocument, TemplateType } from './types'

interface Props {
  type: TemplateType
  onUse: (document: TemplateDocument, templateId: string, name: string) => void
  onSetDefault: (id: string) => Promise<void>
  onDelete: (id: string) => Promise<void>
}

export function SavedTemplatesTab({ type, onUse, onSetDefault, onDelete }: Props) {
  const queryClient = useQueryClient()
  const [busyId, setBusyId] = useState<string | null>(null)
  const [pendingDelete, setPendingDelete] = useState<{ id: string; name: string; isDefault: boolean } | null>(null)

  const queryKey = ['plantillas-guardadas', type]
  const { data, isLoading } = useQuery({
    queryKey,
    queryFn: () => listPlantillas({ type: toApiType(type) }),
  })

  const items = data?.items ?? []

  async function handleUse(id: string) {
    setBusyId(id)
    try {
      const plantilla = await getPlantilla(id)
      onUse(plantilla.documentJson as unknown as TemplateDocument, plantilla.id, plantilla.plantillaName)
    } catch {
      toast.error('No se pudo cargar la plantilla')
    } finally {
      setBusyId(null)
    }
  }

  async function handleSetDefault(id: string) {
    setBusyId(id)
    try {
      await onSetDefault(id)
      queryClient.invalidateQueries({ queryKey })
      toast.success('Plantilla marcada como default')
    } catch {
      toast.error('No se pudo marcar como default')
    } finally {
      setBusyId(null)
    }
  }

  async function confirmDelete() {
    if (!pendingDelete) return
    setBusyId(pendingDelete.id)
    try {
      await onDelete(pendingDelete.id)
      queryClient.invalidateQueries({ queryKey })
      toast.success('Plantilla eliminada')
    } catch {
      toast.error('No se pudo eliminar la plantilla')
    } finally {
      setBusyId(null)
      setPendingDelete(null)
    }
  }

  if (isLoading) {
    return (
      <div style={{ padding: 14 }}>
        <span className="skeleton-box" style={{ height: 14, display: 'block', marginBottom: 8 }} />
        <span className="skeleton-box" style={{ height: 14, display: 'block', width: '80%' }} />
      </div>
    )
  }

  return (
    <div className="tpl-drafts-tab">
      {items.length === 0 ? (
        <p className="tpl-drafts-empty">Aún no has guardado ninguna plantilla de este tipo en el servidor — usa "Guardar" en el editor.</p>
      ) : (
        <div className="tpl-gallery-list">
          {items.map((item) => (
            <div key={item.id} className="tpl-gallery-card">
              <div className="tpl-gallery-card-head">
                <span className="tpl-gallery-card-title">{item.plantillaName}</span>
                {item.isDefault && <span className="tpl-gallery-card-badge">Default</span>}
              </div>
              <div className="tpl-gallery-card-actions">
                <button
                  type="button"
                  className="btn btn-secondary btn-size-xs"
                  disabled={busyId === item.id}
                  onClick={() => handleUse(item.id)}
                >
                  <FolderOpen size={13} /> Cargar
                </button>
                {!item.isDefault && (
                  <button
                    type="button"
                    className="btn btn-ghost btn-size-xs"
                    disabled={busyId === item.id}
                    onClick={() => handleSetDefault(item.id)}
                  >
                    <Star size={13} /> Marcar default
                  </button>
                )}
                <button
                  type="button"
                  className="btn btn-ghost btn-size-xs"
                  disabled={busyId === item.id}
                  onClick={() => setPendingDelete({ id: item.id, name: item.plantillaName, isDefault: item.isDefault })}
                  title="Eliminar plantilla"
                >
                  <Trash2 size={13} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <ConfirmModal
        open={!!pendingDelete}
        onClose={() => setPendingDelete(null)}
        onConfirm={confirmDelete}
        title="¿Eliminar plantilla?"
        description={
          pendingDelete?.isDefault
            ? `"${pendingDelete.name}" es la plantilla default de este tipo — si la eliminas, Caja/POS no podrá imprimir con el editor hasta que marques otra como default.`
            : `Se eliminará "${pendingDelete?.name}". Esta acción no se puede deshacer.`
        }
        confirmLabel="Eliminar"
        variant="danger"
        loading={busyId === pendingDelete?.id}
      />
    </div>
  )
}
