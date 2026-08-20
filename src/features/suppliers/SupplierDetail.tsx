import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { getSupplier, deleteSupplier, getSupplierPurchases } from '@/shared/api/suppliers'
import { getHistorialPagos } from '@/shared/api/pagos'
import { listImpuestosCompras } from '@/shared/api/config'
import { listRetenciones } from '@/shared/api/retenciones'
import { formatDate, formatDOP } from '@/lib/formatters'
import { PageHeader } from '@/components/shared/PageHeader'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { Pencil, Ban, Building2, Globe, Wallet } from 'lucide-react'

const PAGO_STATUS_BADGE: Record<string, string> = {
  draft: 'badge-draft',
  submitted: 'badge-submitted',
  cancelled: 'badge-cancelled',
}
const PAGO_STATUS_LABEL: Record<string, string> = {
  draft: 'Borrador',
  submitted: 'Sometido',
  cancelled: 'Cancelado',
}

function SaldoFavorProveedorIndicator({ tieneSaldoAFavor, saldoAFavor }: { tieneSaldoAFavor: boolean; saldoAFavor: number }) {
  if (!tieneSaldoAFavor || saldoAFavor <= 0) return null

  return (
    <div className="card">
      <div className="card-body">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <Wallet size={16} style={{ color: 'var(--success-text)' }} />
          <span style={{ fontWeight: 500 }}>Saldo a favor: {formatDOP(saldoAFavor)}</span>
        </div>
      </div>
    </div>
  )
}

function HistorialPagos({ supplierId }: { supplierId: string }) {
  const navigate = useNavigate()
  const { data, isLoading } = useQuery({
    queryKey: ['historial-pagos', supplierId],
    queryFn: () => getHistorialPagos(supplierId, { limit: 10 }),
    retry: false,
  })

  if (isLoading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {Array.from({ length: 3 }).map((_, i) => (
          <span key={i} className="skeleton-box" style={{ height: 40, display: 'block' }} />
        ))}
      </div>
    )
  }

  if (!data || data.items.length === 0) {
    return <p style={{ fontSize: 13, color: 'var(--text-tertiary)' }}>Sin pagos registrados</p>
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {data.items.map((pago) => (
        <div
          key={pago.id}
          className="data-table-row-link"
          onClick={() => navigate(`/pagos/${pago.id}`)}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            border: '1px solid var(--border-default)',
            borderRadius: 'var(--radius-md)',
            padding: '8px 12px',
            fontSize: 13,
            cursor: 'pointer',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span className={`badge ${PAGO_STATUS_BADGE[pago.status] ?? 'badge-draft'}`}>
              {PAGO_STATUS_LABEL[pago.status] ?? pago.status}
            </span>
            <span style={{ fontWeight: 500, fontFamily: 'var(--font-mono)' }}>{pago.id}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <span style={{ color: 'var(--text-tertiary)' }}>{formatDate(pago.postingDate)}</span>
            <span style={{ fontWeight: 500 }}>{formatDOP(pago.paidAmount)}</span>
          </div>
        </div>
      ))}
    </div>
  )
}

function RecentPurchases({ supplierId }: { supplierId: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ['supplier-purchases', supplierId],
    queryFn: () => getSupplierPurchases(supplierId, { limit: 5 }),
    retry: false,
  })

  if (isLoading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {Array.from({ length: 3 }).map((_, i) => (
          <span key={i} className="skeleton-box" style={{ height: 40, display: 'block' }} />
        ))}
      </div>
    )
  }

  if (!data || data.items.length === 0) {
    return <p style={{ fontSize: 13, color: 'var(--text-tertiary)' }}>Sin compras recientes</p>
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {data.items.map((purchase) => (
        <div
          key={purchase.id}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            border: '1px solid var(--border-default)',
            borderRadius: 'var(--radius-md)',
            padding: '8px 12px',
            fontSize: 13,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <StatusBadge status={purchase.status} />
            <span style={{ fontWeight: 500 }}>{purchase.id}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <span style={{ color: 'var(--text-tertiary)' }}>{formatDate(purchase.postingDate)}</span>
            <span style={{ fontWeight: 500 }}>{formatDOP(purchase.grandTotal)}</span>
          </div>
        </div>
      ))}
    </div>
  )
}

export default function SupplierDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [showDisableDialog, setShowDisableDialog] = useState(false)

  const { data: supplier, isLoading, isError } = useQuery({
    queryKey: ['supplier', id],
    queryFn: () => getSupplier(id!),
    enabled: Boolean(id),
  })

  const { data: impuestosCompras } = useQuery({
    queryKey: ['impuestos-compras'],
    queryFn: listImpuestosCompras,
    staleTime: 5 * 60_000,
  })
  const impuestoTitulo = (templateId: string) => impuestosCompras?.find((t) => String(t.id) === templateId)?.title ?? templateId

  const { data: retencionesData } = useQuery({
    queryKey: ['retenciones-all'],
    queryFn: () => listRetenciones({ limit: 100 }),
    staleTime: 5 * 60_000,
  })
  const retencionTitulo = (retencionId: string) =>
    retencionesData?.items?.find((r) => r.id === retencionId)?.categoryName ?? retencionId

  const disableMutation = useMutation({
    mutationFn: () => deleteSupplier(id!),
    onSuccess: () => {
      toast.success('Proveedor desactivado')
      queryClient.invalidateQueries({ queryKey: ['suppliers'] })
      navigate('/proveedores')
    },
    onError: () => {
      toast.error('Error al desactivar el proveedor')
    },
  })

  if (isLoading) {
    return (
      <div className="page-container" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <span className="skeleton-box" style={{ height: 32, width: 200, display: 'block' }} />
        <span className="skeleton-box" style={{ height: 192, display: 'block', borderRadius: 8 }} />
        <span className="skeleton-box" style={{ height: 128, display: 'block', borderRadius: 8 }} />
      </div>
    )
  }

  if (isError || !supplier) {
    return (
      <div className="page-container">
        <p style={{ color: 'var(--error-text)' }}>Error al cargar el proveedor</p>
        <button className="btn btn-secondary" style={{ marginTop: 16 }} onClick={() => navigate('/proveedores')}>
          Volver
        </button>
      </div>
    )
  }

  return (
    <div className="page-container">
      <button className="page-back-link" onClick={() => navigate('/proveedores')}>
        ← Proveedores
      </button>

      <PageHeader
        title={
          <span style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            {supplier.esProveedorExterior
              ? <Globe size={20} style={{ color: 'var(--icon-muted)' }} />
              : <Building2 size={20} style={{ color: 'var(--icon-muted)' }} />}
            {supplier.supplierName}
            {supplier.disabled && <span className="badge badge-error">Inactivo</span>}
            {supplier.esProveedorExterior && <span className="badge badge-info">Exterior</span>}
          </span>
        }
        description={
          supplier.balance > 0 ? (
            <span>
              Balance pendiente:{' '}
              <span style={{ fontWeight: 600, color: 'var(--error-text)' }}>{formatDOP(supplier.balance)}</span>
            </span>
          ) : undefined
        }
        action={
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button className="btn btn-secondary btn-size-sm" onClick={() => navigate(`/proveedores/${id}/editar`)}>
              <Pencil size={14} />Editar
            </button>
            {!supplier.disabled && (
              <button className="btn btn-danger btn-size-sm" onClick={() => setShowDisableDialog(true)}>
                <Ban size={14} />Desactivar
              </button>
            )}
          </div>
        }
      />

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, alignItems: 'start' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <SaldoFavorProveedorIndicator tieneSaldoAFavor={supplier.tieneSaldoAFavor} saldoAFavor={supplier.saldoAFavor} />

          <div className="card">
            <div className="card-header">
              <span className="card-title">Información General</span>
            </div>
            <div className="fields-grid fields-grid-3">
              <div className="detail-field">
                <span className="detail-label">Tipo</span>
                <span className="detail-value">{supplier.supplierType === 'Company' ? 'Empresa' : 'Individual'}</span>
              </div>
              <div className="detail-field">
                <span className="detail-label">Tipo Identificación</span>
                <span className="detail-value">{supplier.tipoIdentificacion ?? '—'}</span>
              </div>
              <div className="detail-field">
                <span className="detail-label">RNC</span>
                <span className="detail-value" style={{ fontFamily: 'var(--font-mono)' }}>{supplier.rnc ?? '—'}</span>
              </div>
              <div className="detail-field">
                <span className="detail-label">Cédula</span>
                <span className="detail-value" style={{ fontFamily: 'var(--font-mono)' }}>{supplier.cedula ?? '—'}</span>
              </div>
              <div className="detail-field">
                <span className="detail-label">Email</span>
                <span className="detail-value">{supplier.emailId ?? '—'}</span>
              </div>
              <div className="detail-field">
                <span className="detail-label">Email Pagos</span>
                <span className="detail-value">{supplier.emailPagos ?? '—'}</span>
              </div>
              <div className="detail-field">
                <span className="detail-label">Teléfono</span>
                <span className="detail-value">{supplier.mobileNo ?? '—'}</span>
              </div>
              <div className="detail-field">
                <span className="detail-label">País de Origen</span>
                <span className="detail-value">{supplier.paisOrigen ?? '—'}</span>
              </div>
              <div className="detail-field">
                <span className="detail-label">Días de Crédito</span>
                <span className="detail-value">{supplier.diasCredito} días</span>
              </div>
              <div className="detail-field">
                <span className="detail-label">Creado</span>
                <span className="detail-value">{formatDate(supplier.createdAt)}</span>
              </div>
              <div className="detail-field">
                <span className="detail-label">Modificado</span>
                <span className="detail-value">{formatDate(supplier.modifiedAt)}</span>
              </div>
            </div>
          </div>

          <div className="card">
            <div className="card-header">
              <span className="card-title">Compras Recientes</span>
            </div>
            <div className="card-body">
              {id && <RecentPurchases supplierId={id} />}
            </div>
          </div>

          {(supplier.banco || supplier.numeroCuenta) && (
            <div className="card">
              <div className="card-header">
                <span className="card-title">Cuenta Bancaria</span>
              </div>
              <div className="fields-grid">
                <div className="detail-field">
                  <span className="detail-label">Banco</span>
                  <span className="detail-value">{supplier.banco ?? '—'}</span>
                </div>
                <div className="detail-field">
                  <span className="detail-label">Tipo de Cuenta</span>
                  <span className="detail-value">{supplier.tipoCuenta ?? '—'}</span>
                </div>
                <div className="detail-field">
                  <span className="detail-label">Número de Cuenta</span>
                  <span className="detail-value" style={{ fontFamily: 'var(--font-mono)' }}>{supplier.numeroCuenta ?? '—'}</span>
                </div>
                <div className="detail-field">
                  <span className="detail-label">ABA / SWIFT</span>
                  <span className="detail-value" style={{ fontFamily: 'var(--font-mono)' }}>{supplier.abaSwift ?? '—'}</span>
                </div>
              </div>
            </div>
          )}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div className="card">
            <div className="card-header">
              <span className="card-title">Valores por Defecto de Compra</span>
            </div>
            <div className="fields-grid">
              <div className="detail-field">
                <span className="detail-label">Tipo de Bienes/Servicios (606)</span>
                <span className="detail-value">{supplier.defaultTipoBienes606 ?? 'Sin configurar'}</span>
              </div>
              <div className="detail-field">
                <span className="detail-label">Forma de Pago (606)</span>
                <span className="detail-value">{supplier.defaultFormaPago606 ?? 'Sin configurar'}</span>
              </div>
              <div className="detail-field">
                <span className="detail-label">Tipo de Pago</span>
                <span className="detail-value">{supplier.defaultTipoPagoProveedor ?? 'Sin configurar'}</span>
              </div>
              <div className="detail-field">
                <span className="detail-label">Cuenta CxP Alterna</span>
                <span className="detail-value">{supplier.cuentaCxpDefault ?? 'Sin configurar'}</span>
              </div>
              <div className="detail-field">
                <span className="detail-label">Impuestos por Defecto — Compras (bienes)</span>
                {supplier.impuestoComprasDefault && supplier.impuestoComprasDefault.length > 0
                  ? (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 4 }}>
                        {supplier.impuestoComprasDefault.map((t) => (
                          <span key={t.id} className="badge badge-info">{impuestoTitulo(t.id)} ({t.tasa}%)</span>
                        ))}
                      </div>
                    )
                  : <span className="detail-value">Sin configurar</span>}
              </div>
              <div className="detail-field">
                <span className="detail-label">Impuestos por Defecto — Gastos (servicios)</span>
                {supplier.impuestoGastosDefault && supplier.impuestoGastosDefault.length > 0
                  ? (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 4 }}>
                        {supplier.impuestoGastosDefault.map((t) => (
                          <span key={t.id} className="badge badge-info">{impuestoTitulo(t.id)} ({t.tasa}%)</span>
                        ))}
                      </div>
                    )
                  : <span className="detail-value">Sin configurar</span>}
              </div>
              <div className="detail-field" style={{ gridColumn: '1 / -1' }}>
                <span className="detail-label">Retenciones por Defecto (solo Gastos)</span>
                {supplier.retencionesDefault && supplier.retencionesDefault.length > 0
                  ? (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 4 }}>
                        {supplier.retencionesDefault.map((r) => (
                          <span key={r.id} className="badge badge-info">{retencionTitulo(r.id)} ({r.tasa}%)</span>
                        ))}
                      </div>
                    )
                  : <span className="detail-value">Sin configurar</span>}
              </div>
            </div>
          </div>

          <div className="card">
            <div className="card-header">
              <span className="card-title">Historial de Pagos</span>
              {id && (
                <button className="btn btn-ghost btn-size-sm" onClick={() => navigate(`/pagos/lista?supplier=${id}`)}>
                  Ver todos
                </button>
              )}
            </div>
            <div className="card-body">
              {id && <HistorialPagos supplierId={id} />}
            </div>
          </div>
        </div>
      </div>

      {showDisableDialog && (
        <div className="modal-overlay" onClick={() => setShowDisableDialog(false)}>
          <div className="modal-box modal-box-sm" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <h2 className="modal-title">¿Desactivar proveedor?</h2>
              <button className="modal-close" onClick={() => setShowDisableDialog(false)}>×</button>
            </div>
            <div className="modal-body">
              <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                Se desactivará a <strong>{supplier.supplierName}</strong>. Podrás reactivarlo más adelante.
              </p>
            </div>
            <div className="modal-foot">
              <button className="btn btn-secondary" onClick={() => setShowDisableDialog(false)}>Cancelar</button>
              <button
                className="btn btn-danger"
                onClick={() => disableMutation.mutate()}
                disabled={disableMutation.isPending}
              >
                {disableMutation.isPending ? 'Desactivando…' : 'Desactivar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
