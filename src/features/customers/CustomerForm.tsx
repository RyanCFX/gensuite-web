import { useNavigate, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { getCustomer } from '@/shared/api/customers'
import { ArrowLeft } from 'lucide-react'
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
      <div className="page-container">
        <span className="skeleton-box" style={{ width: 200, height: 28, marginBottom: 16 }} />
        <span className="skeleton-box" style={{ display: 'block', width: '100%', height: 260, borderRadius: 'var(--radius-lg)' }} />
      </div>
    )
  }

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <button className="page-back-link" onClick={() => navigate(-1)}>
            <ArrowLeft size={14} aria-hidden="true" /> Volver
          </button>
          <h1 className="page-title">{isEdit ? 'Editar Cliente' : 'Nuevo Cliente'}</h1>
        </div>
      </div>

      <div style={{ maxWidth: 680 }}>
        <CustomerFormPanel
          customer={customer}
          onSuccess={(c) => navigate(`/clientes/${c.id}`)}
          onCancel={() => navigate(-1)}
        />
      </div>
    </div>
  )
}
