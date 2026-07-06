import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { getCustomer, deleteCustomer } from '@/shared/api/customers'
import { getSemaforoByCustomer } from '@/shared/api/cobros'
import { client } from '@/shared/api/client'
import type { Invoice } from '@/shared/api/types'
import { formatDate, formatDOP } from '@/lib/formatters'
import { Pencil, Ban, Building2, User, ArrowLeft } from 'lucide-react'

function SemaforoIndicator({ customerId }: { customerId: string }) {
  const { data: entry } = useQuery({
    queryKey: ['semaforo', customerId],
    queryFn: () => getSemaforoByCustomer(customerId),
    retry: false,
  })

  if (!entry) return null

  const statusClass: Record<string, string> = {
    verde: 'semaforo-verde',
    amarillo: 'semaforo-amarillo',
    rojo: 'semaforo-rojo',
  }
  const labelMap: Record<string, string> = {
    verde: 'Crédito OK',
    amarillo: 'Crédito en alerta',
    rojo: 'Crédito excedido',
  }

  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <div className="card-body">
        <div className={`semaforo ${statusClass[entry.semaforo] ?? ''}`} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span className="semaforo-dot" />
          <span style={{ fontWeight: 500 }}>{labelMap[entry.semaforo] ?? entry.semaforo}</span>
          <span style={{ color: 'var(--text-secondary)', fontSize: 13 }}>
            ({(entry.pctUsado ?? 0).toFixed(1)}% utilizado — {formatDOP(entry.balance)} de {formatDOP(entry.creditLimit)})
          </span>
        </div>
      </div>
    </div>
  )
}

function RecentInvoices({ customerId }: { customerId: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ['customer-invoices', customerId],
    queryFn: async () => {
      const res = await client.get<{ success: true; data: Invoice[]; meta: unknown }>(
        '/invoices',
        { params: { customer: customerId, limit: 5 } },
      )
      return (res.data as { data: Invoice[] }).data ?? []
    },
    retry: false,
  })

  if (isLoading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="skeleton-box" style={{ height: 32, width: '100%' }} />
        ))}
      </div>
    )
  }

  if (!data || data.length === 0) {
    return <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Sin facturas recientes</p>
  }

  const statusBadge = (status: string) => {
    if (status === 'Submitted') return <span className="badge badge-success">Sometido</span>
    if (status === 'Cancelled') return <span className="badge badge-error">Cancelado</span>
    return <span className="badge badge-draft">Borrador</span>
  }

  return (
    <div className="table-scroll">
      <table className="data-table">
        <thead>
          <tr>
            <th>Estado</th>
            <th>#</th>
            <th>NCF</th>
            <th>Fecha</th>
            <th style={{ textAlign: 'right' }}>Total</th>
          </tr>
        </thead>
        <tbody>
          {data.map((inv) => (
            <tr key={inv.id}>
              <td>{statusBadge(inv.status)}</td>
              <td style={{ fontFamily: 'monospace', fontSize: 12 }}>{inv.id}</td>
              <td className="td-muted" style={{ fontFamily: 'monospace', fontSize: 12 }}>{inv.ncf ?? '—'}</td>
              <td className="td-muted">{formatDate(inv.postingDate)}</td>
              <td style={{ textAlign: 'right', fontWeight: 500 }}>{formatDOP(inv.grandTotal)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export default function CustomerDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [showDisableDialog, setShowDisableDialog] = useState(false)

  const { data: customer, isLoading, isError } = useQuery({
    queryKey: ['customer', id],
    queryFn: () => getCustomer(id!),
    enabled: Boolean(id),
  })

  const disableMutation = useMutation({
    mutationFn: () => deleteCustomer(id!),
    onSuccess: () => {
      toast.success('Cliente desactivado')
      queryClient.invalidateQueries({ queryKey: ['customers'] })
      navigate('/clientes')
    },
    onError: () => {
      toast.error('Error al desactivar el cliente')
    },
  })

  if (isLoading) {
    return (
      <div className="page-container">
        <div className="skeleton-box" style={{ width: 200, height: 28, marginBottom: 16 }} />
        <div className="skeleton-box" style={{ width: '100%', height: 192, borderRadius: 'var(--radius-lg)', marginBottom: 16 }} />
        <div className="skeleton-box" style={{ width: '100%', height: 128, borderRadius: 'var(--radius-lg)' }} />
      </div>
    )
  }

  if (isError || !customer) {
    return (
      <div className="page-container">
        <p style={{ color: 'var(--color-error)' }}>Error al cargar el cliente</p>
        <button className="btn btn-ghost" style={{ marginTop: 16 }} onClick={() => navigate('/clientes')}>
          Volver
        </button>
      </div>
    )
  }

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <a className="page-back-link" onClick={() => navigate('/clientes')}>
            <ArrowLeft size={14} /> Clientes
          </a>
          <h1 className="page-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {customer.customerType === 'Company'
              ? <Building2 size={20} style={{ color: 'var(--text-secondary)' }} />
              : <User size={20} style={{ color: 'var(--text-secondary)' }} />}
            {customer.customerName}
            {customer.disabled && <span className="badge badge-error">Inactivo</span>}
          </h1>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-secondary" onClick={() => navigate(`/clientes/${id}/editar`)}>
            <Pencil size={14} />
            Editar
          </button>
          {!customer.disabled && (
            <button className="btn btn-danger" onClick={() => setShowDisableDialog(true)}>
              <Ban size={14} />
              Desactivar
            </button>
          )}
        </div>
      </div>

      {customer.hasCredit && id && <SemaforoIndicator customerId={id} />}

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-header">
          <h2 className="card-title">Información General</h2>
        </div>
        <div className="card-body">
          <div className="fields-grid fields-grid-3">
            <div className="detail-field">
              <span className="detail-label">Tipo</span>
              <span className="detail-value">{customer.customerType === 'Company' ? 'Empresa' : 'Individual'}</span>
            </div>
            <div className="detail-field">
              <span className="detail-label">Tipo Identificación</span>
              <span className="detail-value">{customer.rnc ? "RNC" : customer.cedula ? "Cédula" : "—"}</span>
            </div>
            <div className="detail-field">
              <span className="detail-label">RNC</span>
              <span className="detail-value">{customer.rnc ?? '—'}</span>
            </div>
            <div className="detail-field">
              <span className="detail-label">Cédula</span>
              <span className="detail-value">{customer.cedula ?? '—'}</span>
            </div>
            <div className="detail-field">
              <span className="detail-label">Email para Facturas</span>
              <span className="detail-value">{customer.emailInvoice ?? '—'}</span>
            </div>
            <div className="detail-field">
              <span className="detail-label">Grupo de clientes</span>
              <span className="detail-value">{customer.customerGroup ?? '—'}</span>
            </div>
            {customer.priceTier && (
              <div className="detail-field">
                <span className="detail-label">Nivel de precio</span>
                <span className="detail-value">
                  <span className="badge" style={{ background: 'var(--accent-bg)', color: 'var(--accent)' }}>
                    Nivel {customer.priceTier}
                  </span>
                </span>
              </div>
            )}
            <div className="detail-field">
              <span className="detail-label">¿Es Gobierno?</span>
              <span className="detail-value">{customer.isGovernment ? 'Sí' : 'No'}</span>
            </div>
            <div className="detail-field">
              <span className="detail-label">Tiene Crédito</span>
              <span className="detail-value">{customer.hasCredit ? 'Sí' : 'No'}</span>
            </div>
            {customer.hasCredit && (
              <>
                <div className="detail-field">
                  <span className="detail-label">Límite de Crédito</span>
                  <span className="detail-value">{formatDOP(customer.creditLimit)}</span>
                </div>
                <div className="detail-field">
                  <span className="detail-label">Días de Crédito</span>
                  <span className="detail-value">{customer.creditDays} días</span>
                </div>
              </>
            )}
            <div className="detail-field">
              <span className="detail-label">Creado</span>
              <span className="detail-value">{formatDate(customer.createdAt)}</span>
            </div>
            <div className="detail-field">
              <span className="detail-label">Modificado</span>
              <span className="detail-value">{formatDate(customer.modifiedAt)}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <h2 className="card-title">Facturas Recientes</h2>
        </div>
        <div className="card-body">
          {id && <RecentInvoices customerId={id} />}
        </div>
      </div>

      {showDisableDialog && (
        <div className="modal-overlay" onClick={() => setShowDisableDialog(false)}>
          <div className="modal-box modal-box-sm" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <h2 className="modal-title">¿Desactivar cliente?</h2>
              <button className="modal-close" onClick={() => setShowDisableDialog(false)}>×</button>
            </div>
            <div className="modal-body">
              <p style={{ fontSize: 14 }}>
                Se desactivará a <strong>{customer.customerName}</strong>. Podrás reactivarlo más adelante.
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
