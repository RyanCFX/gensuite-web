import { useEffect, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Permitido } from '@/components/shared/Permitido'
import { FieldTooltip } from '@/shared/ui/FieldTooltip'
import { AccountSelect } from '@/components/shared/AccountSelect'
import { useFeature } from '@/shared/features/can'
import {
  getFacturacionConfig,
  habilitarDelivery,
  deshabilitarDelivery,
  updateDeliveryConfig,
  habilitarDespacho,
} from '@/shared/api/config'
import type { ApiError, UpdateDeliveryConfigDto } from '@/shared/api/types'
import { esErrorDelivery } from '@/lib/deliveryErrors'

/**
 * Configuración → Facturación → Despacho → Delivery (§7).
 * Solo visible si el tenant contrató la feature `delivery` (§1).
 */
export function DeliveryConfigSection() {
  const tieneFeature = useFeature('delivery')
  if (!tieneFeature) return null
  return <DeliveryConfigInner />
}

interface DeshabilitarBloqueos {
  pendientesEntrega?: number
  viajesAbiertos?: number
  cobrosPorConciliar?: { cantidad?: number; monto?: number }
}

function DeliveryConfigInner() {
  const queryClient = useQueryClient()
  const { data, isLoading } = useQuery({ queryKey: ['facturacion-config'], queryFn: getFacturacionConfig })

  const [confirmarEntregaConciliaCobro, setConfirmarEntregaConciliaCobro] = useState(false)
  const [conciliarCobroConfirmaEntrega, setConciliarCobroConfirmaEntrega] = useState(false)
  const [permiteDiferencias, setPermiteDiferencias] = useState(false)
  const [cuentaDiferencias, setCuentaDiferencias] = useState('')
  const [vehiculoPorDefecto, setVehiculoPorDefecto] = useState('')
  const [ciudadPorDefecto, setCiudadPorDefecto] = useState('')
  const [bloqueos, setBloqueos] = useState<DeshabilitarBloqueos | null>(null)
  const [showDeshabilitarConfirm, setShowDeshabilitarConfirm] = useState(false)

  useEffect(() => {
    if (data) {
      setConfirmarEntregaConciliaCobro(data.deliveryConfirmarEntregaConciliaCobro ?? false)
      setConciliarCobroConfirmaEntrega(data.deliveryConciliarCobroConfirmaEntrega ?? false)
      setPermiteDiferencias(data.deliveryPermiteDiferencias ?? false)
      setCuentaDiferencias(data.deliveryCuentaDiferencias ?? '')
      setVehiculoPorDefecto(data.deliveryVehiculoPorDefecto ?? '')
      setCiudadPorDefecto(data.deliveryCiudadPorDefecto ?? '')
      setBloqueos(null)
    }
  }, [data])

  const habilitarMutation = useMutation({
    mutationFn: () => habilitarDelivery(),
    onSuccess: (res) => {
      toast.success(typeof res?.message === 'string' && res.message ? res.message : 'Delivery activado correctamente')
      queryClient.invalidateQueries({ queryKey: ['facturacion-config'] })
      queryClient.invalidateQueries({ queryKey: ['configuracion-operativa'] })
    },
    onError: (err: ApiError) => {
      // Requiere despacho habilitado: enlace a habilitarlo (§7).
      if (esErrorDelivery(err, 'DELIVERY_REQUIERE_DESPACHO_HABILITADO')) {
        toast.error(err?.message ?? 'Hay que habilitar el despacho primero', { duration: 8000 })
        return
      }
      toast.error(err?.message ?? 'Error al activar delivery')
    },
  })

  const habilitarDespachoMutation = useMutation({
    mutationFn: () => habilitarDespacho(),
    onSuccess: (res) => {
      toast.success(res.message)
      queryClient.invalidateQueries({ queryKey: ['facturacion-config'] })
      queryClient.invalidateQueries({ queryKey: ['configuracion-operativa'] })
    },
    onError: (err: ApiError) => toast.error(err?.message ?? 'Error al activar el despacho'),
  })

  const deshabilitarMutation = useMutation({
    mutationFn: () => deshabilitarDelivery(),
    onSuccess: (res) => {
      toast.success(typeof res?.message === 'string' && res.message ? res.message : 'Delivery desactivado')
      setShowDeshabilitarConfirm(false)
      queryClient.invalidateQueries({ queryKey: ['facturacion-config'] })
      queryClient.invalidateQueries({ queryKey: ['configuracion-operativa'] })
    },
    onError: (err: ApiError) => {
      setShowDeshabilitarConfirm(false)
      // 409 con los pendientes: mostrar los números y pedir terminar lo pendiente (§7).
      if (esErrorDelivery(err, 'DELIVERY_CON_PENDIENTES')) {
        setBloqueos((err.details ?? {}) as DeshabilitarBloqueos)
        return
      }
      toast.error(err?.message ?? 'Error al desactivar delivery')
    },
  })

  const ajustesMutation = useMutation({
    mutationFn: (dto: UpdateDeliveryConfigDto) => updateDeliveryConfig(dto),
    onSuccess: () => {
      toast.success('Ajustes de delivery actualizados')
      queryClient.invalidateQueries({ queryKey: ['facturacion-config'] })
      queryClient.invalidateQueries({ queryKey: ['configuracion-operativa'] })
    },
    onError: (err: ApiError) => toast.error(err?.message ?? 'Error al guardar los ajustes de delivery'),
  })

  if (isLoading) return <span className="skeleton-box" style={{ height: 120, display: 'block' }} />

  const habilitado = data?.deliveryHabilitado ?? false

  // Solo mandar lo que cambió (el endpoint exige al menos un campo).
  function guardarAjustes() {
    if (!data) return
    const dto: UpdateDeliveryConfigDto = {}
    if (confirmarEntregaConciliaCobro !== (data.deliveryConfirmarEntregaConciliaCobro ?? false)) {
      dto.confirmarEntregaConciliaCobro = confirmarEntregaConciliaCobro
    }
    if (conciliarCobroConfirmaEntrega !== (data.deliveryConciliarCobroConfirmaEntrega ?? false)) {
      dto.conciliarCobroConfirmaEntrega = conciliarCobroConfirmaEntrega
    }
    if (permiteDiferencias !== (data.deliveryPermiteDiferencias ?? false)) {
      dto.permiteDiferencias = permiteDiferencias
    }
    if (cuentaDiferencias !== (data.deliveryCuentaDiferencias ?? '')) {
      dto.cuentaDiferencias = cuentaDiferencias
    }
    if (vehiculoPorDefecto !== (data.deliveryVehiculoPorDefecto ?? '')) {
      dto.vehiculoPorDefecto = vehiculoPorDefecto
    }
    if (ciudadPorDefecto !== (data.deliveryCiudadPorDefecto ?? '')) {
      dto.ciudadPorDefecto = ciudadPorDefecto
    }
    if (Object.keys(dto).length === 0) {
      toast.info('Sin cambios para guardar')
      return
    }
    // `permiteDiferencias: true` requiere cuenta (enviada o ya guardada).
    const cuentaFinal = dto.cuentaDiferencias ?? data.deliveryCuentaDiferencias ?? ''
    if ((dto.permiteDiferencias ?? permiteDiferencias) && !cuentaFinal) {
      toast.error('Para permitir diferencias hay que indicar la cuenta de diferencias.')
      return
    }
    ajustesMutation.mutate(dto)
  }

  const ajustesDirty =
    !!data &&
    (confirmarEntregaConciliaCobro !== (data.deliveryConfirmarEntregaConciliaCobro ?? false) ||
      conciliarCobroConfirmaEntrega !== (data.deliveryConciliarCobroConfirmaEntrega ?? false) ||
      permiteDiferencias !== (data.deliveryPermiteDiferencias ?? false) ||
      cuentaDiferencias !== (data.deliveryCuentaDiferencias ?? '') ||
      vehiculoPorDefecto !== (data.deliveryVehiculoPorDefecto ?? '') ||
      ciudadPorDefecto !== (data.deliveryCiudadPorDefecto ?? ''))

  return (
    <div className="ff-wrap" style={{ borderTop: '1px solid var(--border-default)', paddingTop: 16 }}>
      <label className="ff-label" style={{ fontSize: 14, fontWeight: 600 }}>Delivery (cobro contra entrega)</label>
      <p className="ff-hint" style={{ marginBottom: 12 }}>
        La venta se factura y se cobra como siempre, pero lo que el repartidor cobra al entregar
        no entra a la gaveta: queda por conciliar hasta que vuelve con el dinero.
      </p>

      {!habilitado ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'flex-start' }}>
          <Permitido accion="config.delivery.habilitar">
            <button
              className="btn btn-secondary btn-size-sm"
              onClick={() => habilitarMutation.mutate()}
              disabled={habilitarMutation.isPending}
            >
              {habilitarMutation.isPending ? 'Activando…' : 'Activar delivery'}
            </button>
          </Permitido>
          {habilitarMutation.isError && (
            <p className="ff-hint" style={{ margin: 0 }}>
              Requiere el módulo de Despacho activado.{' '}
              <Permitido accion="config.despacho.habilitar">
                <button
                  className="btn btn-ghost btn-size-sm"
                  style={{ padding: 0, textDecoration: 'underline' }}
                  onClick={() => habilitarDespachoMutation.mutate()}
                  disabled={habilitarDespachoMutation.isPending}
                >
                  Activar despacho primero
                </button>
              </Permitido>
            </p>
          )}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div className="inline-alert inline-alert-success" style={{ alignItems: 'flex-start' }}>
            <span>Delivery activo.</span>
          </div>
          <Permitido accion="config.delivery.deshabilitar">
            <div>
              <button className="btn btn-secondary btn-size-sm" onClick={() => setShowDeshabilitarConfirm(true)}>
                Desactivar delivery
              </button>
            </div>
          </Permitido>
          {bloqueos && (
            <div className="inline-alert inline-alert-warning" style={{ alignItems: 'flex-start' }}>
              <span>
                No se puede desactivar: hay {bloqueos.pendientesEntrega ?? 0} entregas pendientes,{' '}
                {bloqueos.viajesAbiertos ?? 0} viajes abiertos y{' '}
                {bloqueos.cobrosPorConciliar?.cantidad ?? 0} cobros por conciliar
                {bloqueos.cobrosPorConciliar?.monto != null && (
                  <> (RD$ {bloqueos.cobrosPorConciliar.monto.toLocaleString('es-DO', { minimumFractionDigits: 2 })})</>
                )}
                . Termina lo pendiente y vuelve a intentarlo.
              </span>
            </div>
          )}

          <Permitido accion="config.delivery.configurar">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, borderTop: '1px solid var(--border-default)', paddingTop: 12 }}>
              <label className="ff-label" style={{ fontWeight: 600 }}>Ajustes avanzados de despacho</label>

              <label className="ff-check-wrap">
                <input
                  type="checkbox"
                  className="ff-check"
                  checked={confirmarEntregaConciliaCobro}
                  onChange={(e) => setConfirmarEntregaConciliaCobro(e.target.checked)}
                />
                <span style={{ fontSize: 13 }}>
                  Confirmar entrega concilia el cobro
                  <FieldTooltip>
                    Al confirmar una entrega como «entregado», se concilia automáticamente su cobro
                    con lo previsto. Si quien confirma no tiene permiso de conciliar, la entrega se
                    confirma igual y el cobro queda para caja.
                  </FieldTooltip>
                </span>
              </label>

              <label className="ff-check-wrap">
                <input
                  type="checkbox"
                  className="ff-check"
                  checked={conciliarCobroConfirmaEntrega}
                  onChange={(e) => setConciliarCobroConfirmaEntrega(e.target.checked)}
                />
                <span style={{ fontSize: 13 }}>
                  Conciliar cobro confirma la entrega
                  <FieldTooltip>
                    Al conciliar el cobro de una factura «en ruta», se marca su parada como entregada.
                    Con ambos automatismos encendidos no hay bucle: cada uno actúa solo si el otro
                    lado sigue pendiente.
                  </FieldTooltip>
                </span>
              </label>

              <label className="ff-check-wrap">
                <input
                  type="checkbox"
                  className="ff-check"
                  checked={permiteDiferencias}
                  onChange={(e) => setPermiteDiferencias(e.target.checked)}
                />
                <span style={{ fontSize: 13 }}>
                  Permite conciliar con faltante
                  <FieldTooltip>
                    Permite conciliar un cobro con menos de lo previsto (exige la cuenta de
                    diferencias y el permiso «conciliar con diferencia» al conciliar).
                  </FieldTooltip>
                </span>
              </label>

              <div className="ff-wrap" style={{ maxWidth: 320 }}>
                <label className="ff-label" htmlFor="deliveryCuentaDiferencias">
                  Cuenta de diferencias
                  {permiteDiferencias && <span className="ff-required"> *</span>}
                  <FieldTooltip>Cuenta contable de movimiento donde cae el faltante.</FieldTooltip>
                </label>
                <AccountSelect
                  id="deliveryCuentaDiferencias"
                  value={cuentaDiferencias}
                  onChange={setCuentaDiferencias}
                  placeholder="Buscar cuenta…"
                  ledgerOnly={true}
                />
              </div>

              <div className="form-row">
                <div className="ff-wrap">
                  <label className="ff-label" htmlFor="deliveryVehiculoDefault">Vehículo por defecto</label>
                  <input
                    id="deliveryVehiculoDefault"
                    className="ff-input"
                    value={vehiculoPorDefecto}
                    onChange={(e) => setVehiculoPorDefecto(e.target.value)}
                    placeholder="Ej: SIN-VEHICULO"
                  />
                </div>
                <div className="ff-wrap">
                  <label className="ff-label" htmlFor="deliveryCiudadDefault">Ciudad por defecto</label>
                  <input
                    id="deliveryCiudadDefault"
                    className="ff-input"
                    value={ciudadPorDefecto}
                    onChange={(e) => setCiudadPorDefecto(e.target.value)}
                    placeholder="Ej: Santo Domingo"
                  />
                </div>
              </div>

              <div>
                <button
                  className="btn btn-navy btn-size-sm"
                  onClick={guardarAjustes}
                  disabled={!ajustesDirty || ajustesMutation.isPending}
                >
                  {ajustesMutation.isPending ? 'Guardando…' : 'Guardar ajustes'}
                </button>
              </div>
            </div>
          </Permitido>
        </div>
      )}

      {showDeshabilitarConfirm && (
        <div className="modal-overlay" onClick={() => setShowDeshabilitarConfirm(false)}>
          <div className="modal-box modal-box-sm" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <h2 className="modal-title">¿Desactivar delivery?</h2>
              <button className="modal-close" onClick={() => setShowDeshabilitarConfirm(false)}>×</button>
            </div>
            <div className="modal-body">
              <p style={{ fontSize: 13, margin: 0 }}>
                Se cortan las ventas y viajes nuevos. Si quedan pendientes, el servidor lo rechazará
                hasta terminarlos.
              </p>
            </div>
            <div className="modal-foot">
              <button className="btn btn-ghost" onClick={() => setShowDeshabilitarConfirm(false)}>Cancelar</button>
              <button
                className="btn btn-danger"
                onClick={() => deshabilitarMutation.mutate()}
                disabled={deshabilitarMutation.isPending}
              >
                {deshabilitarMutation.isPending ? 'Desactivando…' : 'Desactivar delivery'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
