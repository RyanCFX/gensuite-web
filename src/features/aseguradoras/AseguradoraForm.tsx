import { useNavigate, useParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffectOnActive } from 'keepalive-for-react'
import { useTabs } from '@/contexts/TabsContext'
import { getAseguradora } from '@/shared/api/aseguradoras'
import { PageHeader } from '@/components/shared/PageHeader'
import { RecargarButton } from '@/components/shared/RecargarButton'
import { AseguradoraFormPanel } from './AseguradoraFormPanel'

export default function AseguradoraForm() {
  const { id } = useParams<{ id?: string }>()
  const isEdit = Boolean(id)
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { multiTab, activeId, closeTab } = useTabs()

  const { data: aseguradora, isLoading } = useQuery({
    queryKey: ['aseguradora', id],
    queryFn: () => getAseguradora(id!),
    enabled: isEdit,
  })

  useEffectOnActive(() => {
    if (isEdit) queryClient.invalidateQueries({ queryKey: ['aseguradora', id] })
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
        ← Aseguradoras
      </button>

      <PageHeader
        title={isEdit ? 'Editar Aseguradora' : 'Nueva Aseguradora'}
        action={isEdit ? <RecargarButton label="Actualizar" /> : undefined}
      />

      <AseguradoraFormPanel
        aseguradora={aseguradora}
        onSuccess={(a) => {
          const formTabId = activeId
          if (isEdit) queryClient.removeQueries({ queryKey: ['aseguradora', id] })
          navigate(`/farmacia/aseguradoras/${a.id}`)
          if (multiTab && formTabId) closeTab(formTabId, { skipNavigate: true })
        }}
        onCancel={() => navigate(-1)}
      />
    </div>
  )
}
