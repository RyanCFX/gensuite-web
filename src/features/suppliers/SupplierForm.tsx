import { useNavigate, useParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffectOnActive } from 'keepalive-for-react'
import { useTabs } from '@/contexts/TabsContext'
import { getSupplier } from '@/shared/api/suppliers'
import { PageHeader } from '@/components/shared/PageHeader'
import { SupplierFormPanel } from './SupplierFormPanel'

export default function SupplierForm() {
  const { id } = useParams<{ id?: string }>()
  const isEdit = Boolean(id)
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { multiTab, activeId, closeTab } = useTabs()

  const { data: supplier, isLoading } = useQuery({
    queryKey: ['supplier', id],
    queryFn: () => getSupplier(id!),
    enabled: isEdit,
  })

  // Con Multipestañas, esta pantalla queda montada (KeepAlive) al cambiar de pestaña — al volver
  // a ella se re-consulta por si el proveedor cambió en el servidor mientras el usuario estaba en otra.
  useEffectOnActive(() => {
    if (isEdit) queryClient.invalidateQueries({ queryKey: ['supplier', id] })
  }, [isEdit, id], true)

  if (isEdit && isLoading) {
    return (
      <div className="page-container" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <span className="skeleton-box" style={{ height: 32, width: 200, display: 'block' }} />
        <span className="skeleton-box" style={{ height: 256, display: 'block', borderRadius: 8 }} />
      </div>
    )
  }

  return (
    <div className="page-container">
      <button className="page-back-link" onClick={() => navigate(-1)}>
        ← Proveedores
      </button>

      <PageHeader title={isEdit ? 'Editar Proveedor' : 'Nuevo Proveedor'} />

      <SupplierFormPanel
        supplier={supplier}
        onSuccess={(s) => {
          const formTabId = activeId
          if (isEdit) queryClient.removeQueries({ queryKey: ['supplier', id] })
          navigate(isEdit ? `/proveedores/${s.id}` : '/proveedores')
          // La pestaña del formulario ya no representa nada útil una vez guardado — se cierra sin
          // navegar (ya se navegó arriba) para no arrastrar su estado/cache si el usuario la reabre.
          if (multiTab && formTabId) closeTab(formTabId, { skipNavigate: true })
        }}
        onCancel={() => navigate(-1)}
      />
    </div>
  )
}
