import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { ExternalLink } from 'lucide-react'
import { getInvoice } from '@/shared/api/invoices'
import { getCatalogosFiscales, getFacturacionConfig } from '@/shared/api/config'
import type { DeliveryPendiente } from '@/shared/api/types'
import { displayId, formatDate, formatMoney } from '@/lib/formatters'
import { Drawer } from '@/shared/ui/Drawer'
import { DeliveryEntregaBadge, DeliveryCobroBadge } from './DeliveryBadges'
import { DeliveryInfoCard } from './DeliveryInfoCard'
import { EstadoArsBadge } from '@/features/invoicing/EstadoArsBadge'

interface FacturaDeliveryDrawerProps {
  /** Fila que se clickeó — null = drawer cerrado. */
  row: DeliveryPendiente | null
  onClose: () => void
}

const STATUS_BADGE: Record<string, string> = {
  draft: 'badge-draft',
  submitted: 'badge-submitted',
  cancelled: 'badge-cancelled',
}
const STATUS_LABEL: Record<string, string> = {
  draft: 'Borrador',
  submitted: 'Sometido',
  cancelled: 'Cancelado',
}
const PAYMENT_BADGE: Record<string, string> = {
  unpaid: 'badge-warning',
  partly_paid: 'badge-info',
  paid: 'badge-success',
}
const PAYMENT_LABEL: Record<string, string> = {
  unpaid: 'Pendiente',
  partly_paid: 'Parcial',
  paid: 'Pagado',
}

/**
 * Detalle de la factura delivery en un drawer — misma estructura y diseño que la ficha
 * (`InvoiceDetail`): encabezado con badges, `DeliveryInfoCard`, card "Información de la
 * Factura" y card de artículos con totales. Solo lectura — las acciones viven en la ficha
 * completa. Solo se monta cuando el usuario puede ver facturas (`ventas.factura.listar`).
 */
export function FacturaDeliveryDrawer({ row, onClose }: FacturaDeliveryDrawerProps) {
  const navigate = useNavigate()
  const invoiceId = row?.invoiceId ?? null

  const { data: inv, isLoading, isError } = useQuery({
    queryKey: ['invoice', invoiceId],
    queryFn: () => getInvoice(invoiceId!),
    enabled: !!invoiceId,
  })

  // Catálogo de tipos de venta para el label del comprobante (caché compartido).
  const { data: catalogos } = useQuery({
    queryKey: ['catalogos-fiscales', { type: 'venta' }],
    queryFn: () => getCatalogosFiscales({ type: 'venta' }),
    staleTime: 60 * 60_000,
  })
  const { data: facturacion } = useQuery({
    queryKey: ['facturacion-config'],
    queryFn: getFacturacionConfig,
  })
  const monedaBase = facturacion?.monedaBase ?? 'DOP'

  const ncfLabel = inv
    ? [...(catalogos?.ncfTypes ?? []), ...(catalogos?.ncfTypesFisicos ?? [])].find((t) => t.value === inv.ncfType)?.label
    : undefined
  const ps = inv?.paymentStatus
  const outstandingColor =
    ps === 'paid'
      ? 'var(--color-success)'
      : ps === 'partly_paid'
        ? 'var(--color-brand)'
        : 'var(--color-error)'
  const roundedTotal = inv ? (inv.roundedTotal ?? inv.grandTotal) : 0
  const roundingAdjustment = inv?.roundingAdjustment ?? 0
  const estadoArs = inv?.aseguradora?.estadoArs ?? null
  // Columnas ARS por línea, igual que la ficha (solo si alguna línea trae montos).
  const conArs = !!inv && inv.items.some((it) => it.montoAprobadoArs != null || it.montoPacienteArs != null)

  return (
    <Drawer
      open={!!row}
      onClose={onClose}
      title={row ? `Factura ${displayId(row.invoiceId, 0)}` : 'Factura'}
      width={700}
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose}>Cerrar</button>
          {invoiceId && (
            <button className="btn btn-primary" onClick={() => { onClose(); navigate(`/facturas/${invoiceId}`) }}>
              <ExternalLink size={14} /> Ver ficha completa
            </button>
          )}
        </>
      }
    >
      {isLoading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="skeleton-box" style={{ height: 14, width: '100%' }} />
          ))}
        </div>
      ) : isError || !inv ? (
        <div className="empty-state">
          <p className="empty-title">No se pudo cargar la factura</p>
          <p className="empty-sub">Intenta de nuevo o ábrela desde la ficha completa.</p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* ── Encabezado igual que la ficha: badges + NCF ── */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
              {inv.status === 'submitted' ? (
                ps ? (
                  <span className={`badge ${PAYMENT_BADGE[ps] ?? 'badge-neutral'}`}>
                    {PAYMENT_LABEL[ps] ?? ps}
                  </span>
                ) : (
                  <span className="badge badge-submitted">Sometido</span>
                )
              ) : (
                <span className={`badge ${STATUS_BADGE[inv.status] ?? 'badge-neutral'}`}>
                  {STATUS_LABEL[inv.status] ?? inv.status}
                </span>
              )}
              <EstadoArsBadge estado={estadoArs} />
              {inv.delivery?.esDelivery && (
                <>
                  <DeliveryEntregaBadge estado={inv.delivery.estado} />
                  <DeliveryCobroBadge estado={inv.delivery.cobro?.estado} />
                </>
              )}
            </div>
            <p className="page-sub" style={{ marginTop: 6 }}>
              {inv.ncf ? `NCF: ${inv.ncf}` : 'Borrador — NCF pendiente de asignación'}
            </p>
          </div>

          {/* ── Bloque delivery: mismo componente de la ficha ── */}
          <DeliveryInfoCard delivery={inv.delivery} currency={inv.currency} columns={1} />

          {/* ── Card "Información de la Factura" ── */}
          <div className="card" style={{ marginBottom: 0 }}>
            <div className="card-header navy-card-header">
              <h2 className="card-title">Información de la Factura</h2>
            </div>
            <div className="card-body" style={{ display: 'flex', flexDirection: 'column' }}>
              <div className="fields-grid" style={{ gridTemplateColumns: '1fr' }}>
                <div className="detail-field">
                  <span className="detail-label">Cliente</span>
                  <span className="detail-value">
                    {inv.esClienteOcasional ? (
                      <span>
                        {inv.clienteOcasionalNombre ?? inv.customerName}
                        <span style={{ fontSize: 11, color: 'var(--text-tertiary)', marginLeft: 6 }}>(ocasional)</span>
                      </span>
                    ) : (
                      inv.customerName
                    )}
                  </span>
                </div>
                {inv.esClienteOcasional && inv.clienteOcasionalRnc && (
                  <div className="detail-field">
                    <span className="detail-label">RNC</span>
                    <span className="detail-value" style={{ fontFamily: 'var(--font-body)' }}>{inv.clienteOcasionalRnc}</span>
                  </div>
                )}
                {inv.esClienteOcasional && inv.clienteOcasionalDireccion && (
                  <div className="detail-field">
                    <span className="detail-label">Dirección</span>
                    <span className="detail-value">{inv.clienteOcasionalDireccion}</span>
                  </div>
                )}
                <div className="detail-field">
                  <span className="detail-label">Fecha</span>
                  <span className="detail-value">{formatDate(inv.postingDate)}</span>
                </div>
                <div className="detail-field">
                  <span className="detail-label">Vencimiento</span>
                  <span className="detail-value">{formatDate(inv.dueDate)}</span>
                </div>
                <div className="detail-field">
                  <span className="detail-label">NCF</span>
                  <span className="detail-value" style={{ fontFamily: 'var(--font-body)', fontWeight: 600 }}>
                    {inv.ncf ?? (
                      <em style={{ fontStyle: 'italic', fontWeight: 400, color: 'var(--text-secondary)' }}>
                        Pendiente
                      </em>
                    )}
                  </span>
                </div>
                <div className="detail-field">
                  <span className="detail-label">Tipo NCF</span>
                  <span className="detail-value">
                    {ncfLabel ? <span className="badge badge-neutral">{ncfLabel}</span> : '—'}
                  </span>
                </div>
                {inv.amendedFrom && (
                  <div className="detail-field">
                    <span className="detail-label">Enmienda de</span>
                    <button
                      style={{
                        fontSize: 12,
                        fontFamily: 'var(--font-body)',
                        color: 'var(--color-brand)',
                        textDecoration: 'underline',
                        background: 'none',
                        border: 'none',
                        cursor: 'pointer',
                        padding: 0,
                        textAlign: 'left',
                      }}
                      onClick={() => navigate(`/facturas/${inv.amendedFrom}`)}
                    >
                      {inv.amendedFrom}
                    </button>
                  </div>
                )}
              </div>

              {inv.status === 'submitted' && (
                <div style={{ paddingTop: 16, borderTop: '1px solid var(--border)', display: 'flex', flexWrap: 'wrap', gap: 24 }}>
                  <div className="detail-field">
                    <span className="detail-label">Pendiente</span>
                    <span className="detail-value" style={{ fontWeight: 700, color: outstandingColor }}>
                      {formatMoney(inv.outstandingAmount, inv.currency)}
                    </span>
                    {inv.currency && inv.currency !== monedaBase && inv.baseOutstandingAmount != null && (
                      <span className="detail-value" style={{ fontWeight: 400, fontSize: 12, color: 'var(--text-tertiary)' }}>
                        ≈ {formatMoney(inv.baseOutstandingAmount, monedaBase)}
                      </span>
                    )}
                  </div>
                  {inv.currency && inv.currency !== monedaBase && (
                    <div className="detail-field">
                      <span className="detail-label">Moneda</span>
                      <span className="detail-value">
                        {inv.currency}
                        {inv.conversionRate != null && (
                          <span style={{ fontWeight: 400, fontSize: 12, color: 'var(--text-tertiary)', marginLeft: 6 }}>
                            (tasa {inv.conversionRate})
                          </span>
                        )}
                      </span>
                    </div>
                  )}
                  {(ps || inv.isPos) && (
                    <div className="detail-field">
                      <span className="detail-label">Estado de Pago</span>
                      <span className="detail-value">
                        {inv.isPos && ps === 'paid' ? (
                          <span className="badge badge-pos">Contado</span>
                        ) : (
                          <span className={`badge ${PAYMENT_BADGE[ps!] ?? 'badge-neutral'}`}>
                            {PAYMENT_LABEL[ps!] ?? ps}
                          </span>
                        )}
                      </span>
                    </div>
                  )}
                </div>
              )}

              {inv.status === 'submitted' && (inv.paymentLines?.length ?? 0) > 0 && (
                <div style={{ paddingTop: 16, borderTop: '1px solid var(--border)' }}>
                  <p style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 8 }}>Pagos</p>
                  <div className="table-scroll">
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th>Método</th>
                          <th style={{ textAlign: 'right' }}>Monto</th>
                        </tr>
                      </thead>
                      <tbody>
                        {inv.paymentLines!.map((p, i) => (
                          <tr key={i}>
                            <td>{p.modeOfPayment}</td>
                            <td style={{ textAlign: 'right' }}>{formatMoney(p.amount, inv.currency)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {inv.notes && (
                <div className="detail-field" style={{ paddingTop: 16, borderTop: '1px solid var(--border)' }}>
                  <span className="detail-label">Notas</span>
                  <span className="detail-value" style={{ whiteSpace: 'pre-line' }}>{inv.notes}</span>
                </div>
              )}
            </div>
          </div>

          {/* ── Card de artículos ── */}
          <div className="card" style={{ marginBottom: 0 }}>
            <div className="items-table-wrap">
              <table className="items-table navy-table">
                <thead>
                  <tr>
                    <th>Código</th>
                    <th>Descripción</th>
                    <th style={{ textAlign: 'right' }}>Cant.</th>
                    <th style={{ textAlign: 'right' }}>Precio Unit.</th>
                    <th style={{ textAlign: 'right' }}>Dto. %</th>
                    <th style={{ textAlign: 'right' }}>Importe</th>
                    <th>UDM</th>
                    {conArs && <th style={{ textAlign: 'right' }}>Cubre ARS</th>}
                    {conArs && <th style={{ textAlign: 'right' }}>Paciente</th>}
                  </tr>
                </thead>
                <tbody>
                  {inv.items.map((item, i) => (
                    <tr key={i}>
                      <td style={{ fontFamily: 'var(--font-body)', fontSize: 12 }}>{item.itemCode || '—'}</td>
                      <td>{item.description || '—'}</td>
                      <td style={{ textAlign: 'right' }}>{item.qty}</td>
                      <td style={{ textAlign: 'right' }}>
                        {item.discountPct && item.discountPct > 0 ? (
                          <>
                            <span style={{ textDecoration: 'line-through', color: 'var(--text-tertiary)', marginRight: 4 }}>
                              {formatMoney(item.rate, inv.currency)}
                            </span>
                            {formatMoney(item.discountedRate ?? item.rate, inv.currency)}
                          </>
                        ) : (
                          formatMoney(item.rate, inv.currency)
                        )}
                      </td>
                      <td style={{ textAlign: 'right' }}>{item.discountPct ? `${item.discountPct}%` : '—'}</td>
                      <td style={{ textAlign: 'right', fontWeight: 500 }}>{formatMoney(item.amount, inv.currency)}</td>
                      <td>{item.uom || '—'}</td>
                      {conArs && (
                        <td style={{ textAlign: 'right' }}>
                          {item.montoAprobadoArs != null ? formatMoney(item.montoAprobadoArs, 'DOP') : '—'}
                        </td>
                      )}
                      {conArs && (
                        <td style={{ textAlign: 'right' }}>
                          {item.montoPacienteArs != null ? formatMoney(item.montoPacienteArs, 'DOP') : '—'}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="items-total-row navy-totals">
                {(() => {
                  const gross = inv.items.reduce((s, it) => s + it.qty * it.rate, 0)
                  const discount = gross - inv.subtotal
                  return (
                    <>
                      <div className="items-total-line" style={{ fontSize: 14, justifyContent: 'flex-end', gap: 24 }}>
                        <span style={{ textAlign: 'right' }}>Subtotal</span>
                        <span style={{ textAlign: 'left', minWidth: 170 }}>{formatMoney(gross, inv.currency)}</span>
                      </div>
                      <div className="items-total-line" style={{ fontSize: 14, justifyContent: 'flex-end', gap: 24 }}>
                        <span style={{ textAlign: 'right' }}>Descuento</span>
                        <span style={{ textAlign: 'left', minWidth: 170 }}>-{formatMoney(discount, inv.currency)}</span>
                      </div>
                    </>
                  )
                })()}
                <div className="items-total-line" style={{ fontSize: 14, justifyContent: 'flex-end', gap: 24 }}>
                  <span style={{ textAlign: 'right' }}>Impuesto</span>
                  <span style={{ textAlign: 'left', minWidth: 170 }}>{formatMoney(inv.grandTotal - inv.subtotal, inv.currency)}</span>
                </div>
                <div
                  className="items-total-line total-row-highlight"
                  style={{ fontWeight: roundingAdjustment !== 0 ? 500 : 700, justifyContent: 'flex-end', gap: 24 }}
                >
                  <span style={{ fontSize: roundingAdjustment !== 0 ? 13 : 18, color: '#FCB124', textAlign: 'right' }}>Total</span>
                  <span style={{ fontSize: roundingAdjustment !== 0 ? 13 : 18, color: '#FCB124', textAlign: 'left', minWidth: 170 }}>
                    {formatMoney(inv.grandTotal, inv.currency)}
                  </span>
                </div>
                {roundingAdjustment !== 0 && (
                  <div className="items-total-line" style={{ fontSize: 14, justifyContent: 'flex-end', gap: 24 }}>
                    <span style={{ textAlign: 'right' }}>Ajuste por redondeo</span>
                    <span style={{ textAlign: 'left', minWidth: 170 }}>
                      {roundingAdjustment > 0 ? '+' : ''}{formatMoney(roundingAdjustment, inv.currency)}
                    </span>
                  </div>
                )}
                {roundingAdjustment !== 0 && (
                  <div className="items-total-line total-row-highlight" style={{ fontWeight: 700, justifyContent: 'flex-end', gap: 24 }}>
                    <span style={{ fontSize: 18, color: '#FCB124', textAlign: 'right' }}>Total a pagar</span>
                    <span style={{ fontSize: 18, color: '#FCB124', textAlign: 'left', minWidth: 170 }}>
                      {formatMoney(roundedTotal, inv.currency)}
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </Drawer>
  )
}
