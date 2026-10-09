import { useState } from 'react'
import { FieldTooltip } from '@/shared/ui/FieldTooltip'
import { useDeliveryPuerta } from '@/shared/hooks/useDelivery'
import { getClienteDetalle } from '@/shared/api/formularios'

/**
 * Sección "Con delivery" para los formularios de Factura, Pedido y Cotización —
 * §2.1/§2.4 docs/tasks/PROMPT_DELIVERY_FRONTEND.md.
 *
 * Visible solo si la puerta §1 está abierta (feature + habilitación). La validación que
 * bloquea el submit (dirección obligatoria, solo DOP) vive en cada formulario; acá solo
 * presentación + precarga de la dirección.
 */
export interface DeliveryFormValue {
  esDelivery: boolean
  direccionEntrega: string
  telefonoEntrega: string
  referenciaEntrega: string
}

export const EMPTY_DELIVERY_FORM: DeliveryFormValue = {
  esDelivery: false,
  direccionEntrega: '',
  telefonoEntrega: '',
  referenciaEntrega: '',
}

export function DeliveryFormSection({
  value,
  onChange,
  clienteOcasional,
  direccionOcasional,
  customerId,
  monedaBase,
  currencyActual,
  direccionError,
}: {
  value: DeliveryFormValue
  onChange: (v: DeliveryFormValue) => void
  /** Origen de la precarga (§2.1): ocasional → su campo; registrado → ficha del cliente. */
  clienteOcasional: boolean
  direccionOcasional: string
  customerId: string
  monedaBase: string
  /** Moneda elegida en el formulario ('' = automática). Distinta de la base → aviso. */
  currencyActual: string
  /** El formulario ya intentó guardar sin dirección: marcar el campo en rojo. */
  direccionError: boolean
}) {
  const puerta = useDeliveryPuerta()
  const [cargandoDireccion, setCargandoDireccion] = useState(false)

  if (!puerta.operativo && !puerta.drenaje) return null

  const sinDireccion = value.esDelivery && !value.direccionEntrega.trim()
  const monedaInvalida = value.esDelivery && !!currencyActual && currencyActual !== monedaBase

  async function toggle(on: boolean) {
    if (!on) {
      onChange({ ...value, esDelivery: false })
      return
    }
    // Precarga solo si el usuario no escribió una para esta venta.
    let direccion = value.direccionEntrega
    if (!direccion.trim()) {
      if (clienteOcasional) {
        direccion = direccionOcasional.trim()
      } else if (customerId) {
        setCargandoDireccion(true)
        try {
          const c = await getClienteDetalle(customerId)
          if (c.address?.trim()) direccion = c.address.trim()
        } catch {
          // Sin ficha: el usuario la escribe a mano.
        } finally {
          setCargandoDireccion(false)
        }
      }
    }
    onChange({ ...value, esDelivery: true, direccionEntrega: direccion })
  }

  return (
    <div style={{ marginTop: 16, borderTop: '1px solid var(--border-default)', paddingTop: 16 }}>
      <label className="ff-toggle-wrap">
        <span className="ff-toggle">
          <input type="checkbox" checked={value.esDelivery} onChange={(e) => void toggle(e.target.checked)} />
          <span className="ff-toggle-track"><span className="ff-toggle-thumb" /></span>
        </span>
        Con delivery
        <FieldTooltip>
          Se factura y se cobra como siempre, pero lo que el repartidor cobrará al entregar no
          entra a la gaveta: queda por conciliar.
        </FieldTooltip>
      </label>
      {value.esDelivery && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 12 }}>
          <div className="ff-wrap">
            <label className="ff-label ff-required" htmlFor="direccionEntrega">
              Dirección de entrega
              <FieldTooltip>
                Precargada del cliente ocasional o de la ficha del cliente. Cambiarla para esta
                venta no modifica la ficha del cliente.
              </FieldTooltip>
            </label>
            <input
              id="direccionEntrega"
              className={`ff-input${sinDireccion && direccionError ? ' items-input-error' : ''}`}
              value={value.direccionEntrega}
              onChange={(e) => onChange({ ...value, direccionEntrega: e.target.value })}
              placeholder={cargandoDireccion ? 'Cargando dirección del cliente…' : 'Calle, número, sector, ciudad'}
            />
            {sinDireccion && direccionError && (
              <p className="ff-hint" style={{ color: 'red' }}>La dirección de entrega es obligatoria.</p>
            )}
          </div>
          <div className="form-row">
            <div className="ff-wrap">
              <label className="ff-label" htmlFor="telefonoEntrega">Teléfono de entrega</label>
              <input
                id="telefonoEntrega"
                className="ff-input"
                value={value.telefonoEntrega}
                onChange={(e) => onChange({ ...value, telefonoEntrega: e.target.value })}
                placeholder="Para el repartidor"
              />
            </div>
            <div className="ff-wrap">
              <label className="ff-label" htmlFor="referenciaEntrega">Referencia</label>
              <input
                id="referenciaEntrega"
                className="ff-input"
                value={value.referenciaEntrega}
                onChange={(e) => onChange({ ...value, referenciaEntrega: e.target.value })}
                placeholder="Casa azul, portón negro…"
                maxLength={500}
              />
            </div>
          </div>
          {monedaInvalida && (
            <p className="ff-hint" style={{ color: 'red' }}>
              Delivery solo admite {monedaBase} (moneda de la compañía).
            </p>
          )}
        </div>
      )}
    </div>
  )
}
