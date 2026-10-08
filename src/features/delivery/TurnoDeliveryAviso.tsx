import { Link } from 'react-router-dom'
import { usePuede } from '@/shared/permissions/can'
import { formatMoney } from '@/lib/formatters'
import { DeliveryEntregaBadge } from './DeliveryBadges'
import type { TurnoBloqueoDeliveryFactura } from '@/lib/deliveryErrors'
import type { DeliveryEstadoEntrega } from '@/shared/api/types'

/**
 * Aviso de cobros delivery por conciliar que bloquean el cierre del turno — §3.4
 * docs/tasks/PROMPT_DELIVERY_FRONTEND.md. Sin excepción para administradores.
 * Cada factura enlaza a la pantalla de cobros ("Conciliar") y, si no se entregó, a "Anular".
 */
export function TurnoDeliveryAviso({
  cantidad,
  monto,
  facturas,
  titulo,
  onNavigate,
}: {
  cantidad?: number
  monto?: number
  facturas: (TurnoBloqueoDeliveryFactura | { invoiceId: string; customerName?: string; customer?: string; monto?: number; estadoEntrega?: DeliveryEstadoEntrega | string; viaje?: string })[]
  titulo?: string
  /** Se llama al seguir un enlace (para cerrar el modal contenedor). */
  onNavigate?: () => void
}) {
  const puedeVer = usePuede('delivery.cobros.listar')
  const puedeConciliar = usePuede('delivery.cobros.conciliar')
  const puedeAnular = usePuede('delivery.entregas.anular')
  if (facturas.length === 0 && !cantidad) return null

  return (
    <div className="inline-alert inline-alert-warning" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 8 }}>
      <span>
        <strong>{titulo ?? 'No se puede cerrar el turno: hay cobros delivery por conciliar.'}</strong>
        {cantidad != null && (
          <> {cantidad} cobro(s){monto != null && <> por {formatMoney(monto)}</>}.</>
        )}
      </span>
      {facturas.length > 0 && (
        <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, display: 'flex', flexDirection: 'column', gap: 4 }}>
          {facturas.map((f) => (
            <li key={f.invoiceId}>
              <strong>{f.invoiceId}</strong>
              {(f.customerName ?? f.customer) && <> — {f.customerName ?? f.customer}</>}
              {f.monto != null && <> — {formatMoney(f.monto)}</>}{' '}
              <DeliveryEntregaBadge estado={f.estadoEntrega as DeliveryEstadoEntrega | undefined} />
              {f.viaje && <span className="td-muted"> ({f.viaje})</span>}
              {puedeVer && (
                <span style={{ marginLeft: 8, display: 'inline-flex', gap: 8 }}>
                  {puedeConciliar && (
                    <Link to={`/delivery/cobros?q=${encodeURIComponent(f.invoiceId)}`} onClick={onNavigate}>Conciliar</Link>
                  )}
                  {puedeAnular && f.estadoEntrega === 'no_entregado' && (
                    <Link to={`/delivery/cobros?q=${encodeURIComponent(f.invoiceId)}`} onClick={onNavigate}>Anular</Link>
                  )}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
