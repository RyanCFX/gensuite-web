import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { getCustomer, deleteCustomer } from '@/shared/api/customers'
import { getSemaforoByCustomer, getSaldoFavor, getEstadoCuenta, downloadEstadoCuentaPdf } from '@/shared/api/cobros'
import { getCreditNoteSaldoFavor, removerCreditNoteAplicada } from '@/shared/api/notes'
import { client } from '@/shared/api/client'
import type { Invoice, EstadoCuentaResponse } from '@/shared/api/types'
import { formatDate, formatDOP } from '@/lib/formatters'
import { Pencil, Ban, Building2, User, ArrowLeft, Wallet, Receipt, X, FileText, Download, Eye, EyeOff } from 'lucide-react'

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

function SaldoFavorIndicator({ customerId }: { customerId: string }) {
  const { data: saldo } = useQuery({
    queryKey: ['saldo-favor', customerId],
    queryFn: () => getSaldoFavor(customerId),
    retry: false,
  })

  if (!saldo || saldo.balance <= 0) return null

  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <div className="card-body">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <Wallet size={16} style={{ color: 'var(--success-text)' }} />
          <span style={{ fontWeight: 500 }}>Saldo a favor: {formatDOP(saldo.balance)}</span>
        </div>
      </div>
    </div>
  )
}

function CreditNotesIndicator({ customerId }: { customerId: string }) {
  const queryClient = useQueryClient()
  const navigate = useNavigate()

  const { data: saldo } = useQuery({
    queryKey: ['credit-note-saldo-favor', customerId],
    queryFn: () => getCreditNoteSaldoFavor(customerId),
    retry: false,
  })

  const removeMutation = useMutation({
    mutationFn: ({ creditNoteId, invoiceId }: { creditNoteId: string; invoiceId: string }) =>
      removerCreditNoteAplicada(creditNoteId, invoiceId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['credit-note-saldo-favor', customerId] })
      toast.success('Nota de crédito removida de esa factura')
    },
    onError: (err: { message?: string }) => {
      toast.error(err?.message ?? 'Error al remover la nota de crédito — solo se puede deshacer mientras la factura destino siga en Borrador')
    },
  })

  if (!saldo || saldo.entries.length === 0) return null

  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <div className="card-header">
        <h2 className="card-title" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <Receipt size={16} style={{ color: 'var(--success-text)' }} /> Notas de Crédito
        </h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {saldo.balance > 0 && (
            <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
              Disponible: {formatDOP(saldo.balance)}
            </span>
          )}
          <button className="btn btn-ghost btn-size-sm" onClick={() => navigate(`/notas-credito?customer=${customerId}`)}>
            Ver todas
          </button>
        </div>
      </div>
      <div className="table-scroll">
        <table className="data-table">
          <thead>
            <tr>
              <th>NCF</th>
              <th>Fecha</th>
              <th style={{ textAlign: 'right' }}>Total</th>
              <th style={{ textAlign: 'right' }}>Reembolsado</th>
              <th style={{ textAlign: 'right' }}>Disponible</th>
              <th>Aplicada a</th>
            </tr>
          </thead>
          <tbody>
            {saldo.entries.map((entry) => (
              <tr key={entry.creditNoteId}>
                <td style={{ fontFamily: 'monospace', fontSize: 12 }}>{entry.ncf ?? entry.creditNoteId}</td>
                <td className="td-muted">{formatDate(entry.postingDate)}</td>
                <td style={{ textAlign: 'right' }}>{formatDOP(entry.grandTotal)}</td>
                <td style={{ textAlign: 'right' }}>{formatDOP(entry.refundedAmount)}</td>
                <td style={{ textAlign: 'right', fontWeight: 500 }}>{formatDOP(entry.availableAmount)}</td>
                <td>
                  {entry.appliedTo.length === 0 ? (
                    <span className="td-dim">—</span>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      {entry.appliedTo.map((a) => {
                        const canUndo = a.status === 'pending'
                        return (
                        <div key={a.invoiceId} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
                          <span>
                            <button
                              style={{ fontFamily: 'monospace', fontSize: 12, color: 'var(--color-brand)', background: 'none', border: 'none', padding: 0, cursor: 'pointer', textDecoration: 'underline' }}
                              onClick={() => navigate(`/facturas/${a.invoiceId}`)}
                            >
                              {a.invoiceId}
                            </button>
                            {' '}— {formatDOP(a.amount)}
                          </span>
                          <span className={`badge ${a.status === 'reconciled' ? 'badge-success' : 'badge-warning'}`} style={{ whiteSpace: 'nowrap' }}>
                            {a.status === 'reconciled' ? 'Reconciliada' : 'Pendiente'}
                          </span>
                          {canUndo && (
                            <button
                              className="btn btn-ghost btn-size-icon-sm"
                              title="Deshacer"
                              disabled={removeMutation.isPending}
                              onClick={() => removeMutation.mutate({ creditNoteId: entry.creditNoteId, invoiceId: a.invoiceId })}
                            >
                              <X size={12} />
                            </button>
                          )}
                        </div>
                        )
                      })}
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
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

function EstadoCuentaPreview({
  customerId,
  customerName,
  data,
  isLoading,
}: {
  customerId: string
  customerName: string
  data?: EstadoCuentaResponse | null
  isLoading: boolean
}) {
  const [showPreview, setShowPreview] = useState(true)

  const phone = data?.telefono ?? data?.cliente?.telefono ?? 'No especificado'
  const isDataValid = data && typeof data.empresa === 'string' && data.cliente && Array.isArray(data.documentos)

  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <div className="card-header">
        <h2 className="card-title" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <FileText size={16} /> Estado de Cuenta
        </h2>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            className="btn btn-ghost btn-size-sm"
            onClick={() => setShowPreview(!showPreview)}
          >
            {showPreview ? <EyeOff size={14} /> : <Eye size={14} />}
            {showPreview ? 'Ocultar' : 'Ver'}
          </button>
          <button
            className="btn btn-secondary btn-size-sm"
            onClick={() => downloadEstadoCuentaPdf(customerId, `estado-cuenta-${customerName}.pdf`)}
          >
            <Download size={14} />
            Descargar PDF
          </button>
        </div>
      </div>

      {isLoading && (
        <div className="card-body">
          <div className="skeleton-box" style={{ height: 200, width: '100%' }} />
        </div>
      )}

      {!isLoading && data && !showPreview && (
        <div className="card-body">
          <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
            Datos del estado de cuenta para <strong>{customerName}</strong>
          </p>
        </div>
      )}

      {!isLoading && data && showPreview && isDataValid && (
        <>
          {/* ── Cabecera ─────────────────────────────────────── */}
          <div className="card-body">
            <div className="fields-grid fields-grid-3" style={{ marginBottom: 16 }}>
              <div className="detail-field">
                <span className="detail-label">Cliente</span>
                <span className="detail-value">{data.cliente.nombre}</span>
              </div>
              <div className="detail-field">
                <span className="detail-label">Teléfono</span>
                <span className="detail-value">{phone}</span>
              </div>
              <div className="detail-field">
                <span className="detail-label">Fecha</span>
                <span className="detail-value">{formatDate(data.fecha)}</span>
              </div>
            </div>
          </div>

          {/* ── Documentos pendientes ────────────────────────── */}
          <div className="card-body" style={{ paddingTop: 0 }}>
            {data.documentos.length === 0 ? (
              <div className="empty-state">
                <p className="empty-title">Sin documentos pendientes</p>
                <p className="empty-sub">Este cliente no tiene saldos pendientes de cobro.</p>
              </div>
            ) : (
              <>
                <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>
                  Documentos Pendientes
                </h3>
                <div className="table-scroll">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Fecha</th>
                        <th>Número</th>
                        <th>Comprobante</th>
                        <th>Vence</th>
                        <th style={{ textAlign: 'right' }}>Monto</th>
                        <th style={{ textAlign: 'right' }}>Aplicado</th>
                        <th style={{ textAlign: 'right' }}>Saldo</th>
                        <th style={{ textAlign: 'right' }}>Días</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.documentos.map((doc, i) => (
                        <tr key={i}>
                          <td>{formatDate(doc.fecha)}</td>
                          <td style={{ fontFamily: 'monospace', fontSize: 12 }}>{doc.numero}</td>
                          <td style={{ fontFamily: 'monospace', fontSize: 12 }}>{doc.comprobante}</td>
                          <td>{formatDate(doc.vence)}</td>
                          <td style={{ textAlign: 'right', fontWeight: 500 }}>{formatDOP(doc.monto)}</td>
                          <td style={{ textAlign: 'right' }}>{formatDOP(doc.aplicado)}</td>
                          <td style={{ textAlign: 'right', fontWeight: 600, color: 'var(--error-text)' }}>{formatDOP(doc.saldo)}</td>
                          <td style={{ textAlign: 'right' }}>{doc.dias}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr>
                        <td colSpan={7} style={{ textAlign: 'right', fontWeight: 700 }}>Total Pendiente</td>
                        <td style={{ textAlign: 'right', fontWeight: 700, color: 'var(--error-text)' }}>{formatDOP(data.totalPendiente)}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </>
            )}
          </div>

          {/* ── Antigüedad de saldos ─────────────────────────── */}
          {data.aging && data.aging.length > 0 && (
            <div className="card-body" style={{ paddingTop: 16 }}>
              <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>
                Antigüedad de Saldos
              </h3>
              <div className="table-scroll">
                <table className="data-table">
                  <thead>
                    <tr>
                      {data.aging.map((bucket, i) => (
                        <th key={i} style={{ textAlign: 'right' }}>{bucket.label}</th>
                      ))}
                      <th style={{ textAlign: 'right', fontWeight: 700 }}>Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      {data.aging.map((bucket, i) => (
                        <td key={i} style={{ textAlign: 'right', fontWeight: 500 }}>{formatDOP(bucket.total)}</td>
                      ))}
                      <td style={{ textAlign: 'right', fontWeight: 700 }}>{formatDOP(data.totalPendiente)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      {!isLoading && data && showPreview && !isDataValid && (
        <div className="card-body">
          <div className="empty-state">
            <p className="empty-title">Datos no disponibles</p>
            <p className="empty-sub">La respuesta del servidor no tiene el formato esperado.</p>
          </div>
        </div>
      )}

      {!isLoading && !data && (
        <div className="card-body">
          <div className="empty-state">
            <p className="empty-title">Error al cargar el estado de cuenta</p>
            <p className="empty-sub">No se pudo obtener la información del servidor.</p>
          </div>
        </div>
      )}
    </div>
  )
}

export default function CustomerDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [showDisableDialog, setShowDisableDialog] = useState(false)
  const [showEstadoCuenta, setShowEstadoCuenta] = useState(false)

  const { data: estadoCuenta, isLoading: isEstadoCuentaLoading } = useQuery({
    queryKey: ['estado-cuenta', id],
    queryFn: () => id ? getEstadoCuenta(id) : null,
    enabled: Boolean(id) && showEstadoCuenta,
    retry: false,
  })

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
    onError: (err: { message?: string }) => {
      toast.error(err?.message ?? 'Error al desactivar el cliente')
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
            {customer.isSystemManaged && <span className="badge badge-neutral">Cliente del sistema</span>}
            {customer.disabled && <span className="badge badge-error">Inactivo</span>}
          </h1>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {!customer.isSystemManaged && (
            <button className="btn btn-secondary" onClick={() => navigate(`/clientes/${id}/editar`)}>
              <Pencil size={14} />
              Editar
            </button>
          )}
          {id && (
            <button className="btn btn-secondary" onClick={() => setShowEstadoCuenta(!showEstadoCuenta)}>
              <FileText size={14} />
              Estado de Cuenta
            </button>
          )}
          {!customer.disabled && !customer.isSystemManaged && (
            <button className="btn btn-danger" onClick={() => setShowDisableDialog(true)}>
              <Ban size={14} />
              Desactivar
            </button>
          )}
        </div>
      </div>

      {customer.hasCredit && id && <SemaforoIndicator customerId={id} />}
      {id && <SaldoFavorIndicator customerId={id} />}
      {id && <CreditNotesIndicator customerId={id} />}

      {id && showEstadoCuenta && (
        <EstadoCuentaPreview
          customerId={id}
          customerName={customer.customerName}
          data={estadoCuenta}
          isLoading={isEstadoCuentaLoading}
        />
      )}

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
              <span className="detail-label">Dirección</span>
              <span className="detail-value">{customer.address ?? '—'}</span>
            </div>
            <div className="detail-field">
              <span className="detail-label">Grupo de clientes</span>
              <span className="detail-value">{customer.customerGroup ?? '—'}</span>
            </div>
            <div className="detail-field">
              <span className="detail-label">Sucursal</span>
              <span className="detail-value">{customer.branch ?? '—'}</span>
            </div>
            <div className="detail-field">
              <span className="detail-label">Forma de Pago por Defecto</span>
              <span className="detail-value">{customer.formaPagoDefault ?? '—'}</span>
            </div>
            <div className="detail-field">
              <span className="detail-label">Cuenta CxC Alterna</span>
              <span className="detail-value">{customer.cuentaCxcDefault ?? '—'}</span>
            </div>
            <div className="detail-field">
              <span className="detail-label">Encargado de Cobros</span>
              <span className="detail-value">{customer.encargadoCxc ?? '—'}</span>
            </div>
            {customer.impuestoVentasDefault && customer.impuestoVentasDefault.length > 0 && (
              <div className="detail-field" style={{ gridColumn: '1 / -1' }}>
                <span className="detail-label">Impuesto(s) de Venta por Defecto</span>
                <span className="detail-value" style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {customer.impuestoVentasDefault.map((t) => (
                    <span key={t} className="badge badge-info">{t}</span>
                  ))}
                </span>
              </div>
            )}
            {customer.telefonos && customer.telefonos.length > 0 && (
              <div className="detail-field" style={{ gridColumn: '1 / -1' }}>
                <span className="detail-label">Teléfonos</span>
                <span className="detail-value" style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {customer.telefonos.map((t, i) => (
                    <span key={i}>
                      {t.telefono}
                      {t.etiqueta && <span style={{ color: 'var(--text-tertiary)', marginLeft: 6 }}>({t.etiqueta})</span>}
                    </span>
                  ))}
                </span>
              </div>
            )}
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
