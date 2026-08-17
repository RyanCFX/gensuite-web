import { useNavigate, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { getCustomer } from '@/shared/api/customers'
import { PageHeader } from '@/components/shared/PageHeader'
import { CustomerFormPanel } from './CustomerFormPanel'

export default function CustomerForm() {
  const { id } = useParams<{ id?: string }>()
  const isEdit = Boolean(id)
  const navigate = useNavigate()

  const { data: customer, isLoading } = useQuery({
    queryKey: ['customer', id],
    queryFn: () => getCustomer(id!),
    enabled: isEdit,
  })

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
        ← Clientes
      </button>

      <PageHeader title={isEdit ? 'Editar Cliente' : 'Nuevo Cliente'} />

      <CustomerFormPanel
        customer={customer}
        onSuccess={(c) => navigate(`/clientes/${c.id}`)}
        onCancel={() => navigate(-1)}
      />
    </div>
  )
}
