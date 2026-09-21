// Cargar saldo de apertura de un cliente — docs/tasks/PROMPT_APERTURA_FRONTEND.md §4.
// Crea Y confirma en una sola llamada: no hay borrador ni edición posterior (corregir = anular +
// volver a cargar). El flujo normal es cargar varias facturas seguidas ("Cargar otra").

import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQuery } from '@tanstack/react-query'
import { toast } from 'sonner'
import { ArrowLeft, AlertTriangle, Info } from 'lucide-react'
import { crearAperturaVenta } from '@/shared/api/apertura'
import { listCustomers } from '@/shared/api/customers'
import { listSucursales } from '@/shared/api/sucursales'
import { getFacturacionConfig } from '@/shared/api/config'
import { listMonedas } from '@/shared/api/monedas'
import type { CrearFacturaAperturaVentaDto, FacturaAperturaVenta } from '@/shared/api/types'
import { PageHeader } from '@/components/shared/PageHeader'
import { RecargarButton } from '@/components/shared/RecargarButton'
import { DatePicker } from '@/shared/ui/DatePicker'
import { SearchSelect } from '@/shared/ui/SearchSelect'
import type { SearchSelectOption } from '@/shared/ui/SearchSelect'
import { Select, SelectItem } from '@/components/ui/select'
import { Modal } from '@/shared/ui/Modal'
import { formatMoney } from '@/lib/formatters'
import { NCF_ORIGINAL_REGEX, TIPOS_NCF_DGII, today, usePreflightGate } from './lib'

interface FieldErrors {
  customer?: string
  numeroFacturaOriginal?: string
  ncfOriginal?: string
  branch?: string
}

function emptyForm() {
  return {
    customerId: '',
    customerLabel: '',
    numeroFacturaOriginal: '',
    fechaFactura: today(),
    fechaVencimiento: '',
    montoPendiente: '' as number | '',
    descripcion: '',
    origen: '',
    ncfOriginal: '',
    reportarEnDgii: false,
    moneda: '',
    tasaCambio: '' as number | '',
    branch: '',
  }
}

export default function VentaForm() {
  const navigate = useNavigate()
  const { listo, isLoading: loadingPreflight } = usePreflightGate()

  const [form, setForm] = useState(emptyForm())
  const [errors, setErrors] = useState<FieldErrors>({})
  const [customerQuery, setCustomerQuery] = useState('')
  const [branchQuery, setBranchQuery] = useState('')
  const [created, setCreated] = useState<FacturaAperturaVenta | null>(null)

  const { data: facturacionConfig } = useQuery({
    queryKey: ['facturacion-config'],
    queryFn: getFacturacionConfig,
    staleTime: 5 * 60_000,
  })
  const multimonedaHabilitada = facturacionConfig?.multimonedaHabilitada ?? false
  const monedaBase = facturacionConfig?.monedaBase ?? 'DOP'

  const { data: monedas } = useQuery({
    queryKey: ['monedas'],
    queryFn: listMonedas,
    enabled: multimonedaHabilitada,
    staleTime: 5 * 60_000,
  })
  const monedasOptions = (monedas ?? []).filter((m) => m.habilitada && m.code !== monedaBase)

  const { data: customersData, isLoading: customersLoading } = useQuery({
    queryKey: ['aperturaCustomerSearch', customerQuery],
    queryFn: () => listCustomers({ search: customerQuery || undefined, limit: 15 }),
  })
  const customerOptions: SearchSelectOption[] = (customersData?.items ?? []).map((c) => ({
    value: c.id,
    label: c.customerName,
  }))

  const { data: sucursalesData } = useQuery({
    queryKey: ['sucursales-all'],
    queryFn: () => listSucursales({ limit: 100 }),
    staleTime: 60_000,
  })
  const mostrarSucursal = (sucursalesData?.items.length ?? 0) > 1
  const branchOptions: SearchSelectOption[] = (sucursalesData?.items ?? [])
    .filter((s) => !branchQuery || s.name.toLowerCase().includes(branchQuery.toLowerCase()))
    .map((s) => ({ value: s.name, label: s.name }))

  const mostrarTasaCambio = multimonedaHabilitada && !!form.moneda && form.moneda !== monedaBase

  const ncfValido = !form.ncfOriginal || NCF_ORIGINAL_REGEX.test(form.ncfOriginal)
  const ncfTipoValido = !form.ncfOriginal || !ncfValido || TIPOS_NCF_DGII.includes(form.ncfOriginal.slice(0, 3) as (typeof TIPOS_NCF_DGII)[number])

  const createMutation = useMutation({
    mutationFn: (dto: CrearFacturaAperturaVentaDto) => crearAperturaVenta(dto),
    onSuccess: (data) => {
      setCreated(data)
      setErrors({})
    },
    onError: (err: { message?: string }) => {
      const msg = err?.message ?? 'Error al cargar el saldo de apertura'
      if (/no encontrado/.test(msg) && /Cliente/.test(msg)) {
        setErrors((e) => ({ ...e, customer: msg }))
      } else if (/Ya existe la factura de apertura/.test(msg)) {
        setErrors((e) => ({ ...e, numeroFacturaOriginal: msg }))
      } else if (/ya está asignado/.test(msg)) {
        setErrors((e) => ({ ...e, ncfOriginal: msg }))
      } else if (/sucursal/i.test(msg) && /no existe/.test(msg)) {
        setErrors((e) => ({ ...e, branch: msg }))
      }
      toast.error(msg)
    },
  })

  const duplicadoMatch = useMemo(() => {
    const m = errors.numeroFacturaOriginal?.match(/APER-SINV-\d+/)
    return m?.[0]
  }, [errors.numeroFacturaOriginal])

  function resetForm() {
    setForm(emptyForm())
    setErrors({})
    setCreated(null)
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const newErrors: FieldErrors = {}
    if (!form.customerId) newErrors.customer = 'Selecciona un cliente'
    if (!form.numeroFacturaOriginal.trim()) newErrors.numeroFacturaOriginal = 'Ingresa la referencia de la factura original'
    if (form.ncfOriginal && !ncfValido) {
      newErrors.ncfOriginal = 'ncfOriginal debe tener el formato de un NCF dominicano válido: B + 10 dígitos (ej. B0100000123), o un e-NCF: E + 12 dígitos (ej. E310000000001).'
    } else if (form.ncfOriginal && !ncfTipoValido) {
      newErrors.ncfOriginal = `El prefijo de ncfOriginal ("${form.ncfOriginal.slice(0, 3)}") no corresponde a ningún tipo de comprobante DGII válido (${TIPOS_NCF_DGII.join(', ')}).`
    } else if (form.reportarEnDgii && !form.ncfOriginal) {
      newErrors.ncfOriginal = 'No se puede reportar a la DGII una factura sin NCF — indique ncfOriginal.'
    }
    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors)
      toast.error('Revisa los campos marcados')
      return
    }
    if (form.fechaFactura > today()) {
      toast.error('La fecha de la factura no puede ser futura.')
      return
    }
    if (form.fechaVencimiento && form.fechaVencimiento < form.fechaFactura) {
      toast.error('fechaVencimiento no puede ser anterior a fechaFactura.')
      return
    }
    if (!form.montoPendiente || form.montoPendiente <= 0) {
      toast.error('El saldo pendiente debe ser mayor a cero')
      return
    }
    if (mostrarTasaCambio && (!form.tasaCambio || form.tasaCambio <= 0)) {
      toast.error(`La factura está en ${form.moneda} (la compañía opera en ${monedaBase}) — indique tasaCambio: la tasa histórica de esa fecha no se asume ni se resuelve automáticamente.`)
      return
    }

    const dto: CrearFacturaAperturaVentaDto = {
      customer: form.customerId,
      numeroFacturaOriginal: form.numeroFacturaOriginal.trim(),
      fechaFactura: form.fechaFactura,
      fechaVencimiento: form.fechaVencimiento || undefined,
      montoPendiente: Number(form.montoPendiente),
      descripcion: form.descripcion || undefined,
      origen: form.origen || undefined,
      ncfOriginal: form.ncfOriginal || undefined,
      reportarEnDgii: form.reportarEnDgii,
      moneda: mostrarTasaCambio || form.moneda ? form.moneda || undefined : undefined,
      tasaCambio: mostrarTasaCambio ? Number(form.tasaCambio) : undefined,
      branch: form.branch || undefined,
    }
    createMutation.mutate(dto)
  }

  return (
    <div className="page-container">
      <a className="page-back-link" onClick={() => navigate('/apertura/ventas')}>
        <ArrowLeft size={14} /> Ventas — Apertura
      </a>

      <PageHeader
        title="Cargar saldo de cliente"
        description="Migra el saldo pendiente de una factura de venta del sistema anterior — sin generar NCF nuevo ni afectar los reportes del período actual."
        action={<RecargarButton label="Actualizar" />}
      />

      {!loadingPreflight && !listo && (
        <div className="inline-alert inline-alert-error" style={{ marginBottom: 16 }}>
          <AlertTriangle size={16} />
          Tu empresa todavía no está lista para migrar saldos —{' '}
          <a onClick={() => navigate('/apertura/diagnostico')} style={{ cursor: 'pointer', textDecoration: 'underline' }}>
            revisa el Diagnóstico
          </a>{' '}
          antes de continuar. El servidor rechazará este formulario.
        </div>
      )}

      <form onSubmit={handleSubmit}>
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="card-header"><h2 className="card-title">Datos de la factura</h2></div>
          <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div className="form-row form-row-3">
              <div className="ff-wrap">
                <label className="ff-label ff-required">Cliente</label>
                <SearchSelect
                  value={form.customerId}
                  selectedLabel={form.customerLabel}
                  onChange={(id, opt) => { setForm((f) => ({ ...f, customerId: id, customerLabel: opt?.label ?? '' })); setErrors((e) => ({ ...e, customer: undefined })) }}
                  options={customerOptions}
                  onSearch={setCustomerQuery}
                  loading={customersLoading}
                  placeholder="Buscar cliente…"
                  error={!!errors.customer}
                />
                {errors.customer && <span className="ff-error">{errors.customer}</span>}
                <p className="ff-hint">Si el cliente no existe, créalo primero en el módulo de Clientes.</p>
              </div>
              <div className="ff-wrap">
                <label className="ff-label ff-required">N° de factura original</label>
                <input
                  className={`ff-input${errors.numeroFacturaOriginal ? ' ff-input-error' : ''}`}
                  placeholder="Ej. FAC-2024-0117"
                  value={form.numeroFacturaOriginal}
                  onChange={(e) => { setForm((f) => ({ ...f, numeroFacturaOriginal: e.target.value })); setErrors((er) => ({ ...er, numeroFacturaOriginal: undefined })) }}
                />
                {errors.numeroFacturaOriginal && (
                  <span className="ff-error">
                    {errors.numeroFacturaOriginal}{' '}
                    {duplicadoMatch && (
                      <a onClick={() => navigate('/apertura/ventas')} style={{ cursor: 'pointer', textDecoration: 'underline' }}>
                        Ver en el listado
                      </a>
                    )}
                  </span>
                )}
              </div>
              <div className="ff-wrap">
                <label className="ff-label">Origen</label>
                <input
                  className="ff-input"
                  placeholder="Ej. Excel 2023, Mónica 9, Libreta manual"
                  value={form.origen}
                  onChange={(e) => setForm((f) => ({ ...f, origen: e.target.value }))}
                />
              </div>
              <div className="ff-wrap">
                <label className="ff-label ff-required">Fecha de la factura</label>
                <DatePicker value={form.fechaFactura} onChange={(v) => setForm((f) => ({ ...f, fechaFactura: v }))} max={today()} />
              </div>
              <div className="ff-wrap">
                <label className="ff-label">Fecha de vencimiento</label>
                <DatePicker
                  value={form.fechaVencimiento}
                  onChange={(v) => setForm((f) => ({ ...f, fechaVencimiento: v }))}
                  min={form.fechaFactura}
                  clearable
                />
                <p className="ff-hint">Si se omite, se usa la fecha de la factura.</p>
              </div>
              {mostrarSucursal && (
                <div className="ff-wrap">
                  <label className="ff-label">Sucursal</label>
                  <SearchSelect
                    value={form.branch}
                    onChange={(v) => { setForm((f) => ({ ...f, branch: v })); setErrors((e) => ({ ...e, branch: undefined })) }}
                    options={branchOptions}
                    onSearch={setBranchQuery}
                    placeholder="Opcional"
                    error={!!errors.branch}
                  />
                  {errors.branch && <span className="ff-error">{errors.branch}</span>}
                </div>
              )}
            </div>

            <div className="form-row form-row-3" style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: 16 }}>
              <div className="ff-wrap">
                <label className="ff-label ff-required">Saldo pendiente</label>
                <input
                  className="ff-input"
                  type="number"
                  min="0.01"
                  step="0.01"
                  placeholder="0.00"
                  value={form.montoPendiente}
                  onChange={(e) => setForm((f) => ({ ...f, montoPendiente: e.target.value === '' ? '' : parseFloat(e.target.value) }))}
                />
                <p className="ff-hint" style={{ display: 'flex', gap: 4, alignItems: 'flex-start' }}>
                  <Info size={12} style={{ flexShrink: 0, marginTop: 2 }} />
                  Es el saldo que el cliente TODAVÍA debe — no el total original de la factura. Si ya pagó
                  parte en el sistema anterior, anota el detalle en Descripción.
                </p>
              </div>
              {multimonedaHabilitada && (
                <div className="ff-wrap">
                  <label className="ff-label">Moneda</label>
                  <Select
                    value={form.moneda || monedaBase}
                    onValueChange={(v) => setForm((f) => ({ ...f, moneda: v === monedaBase ? '' : v, tasaCambio: '' }))}
                  >
                    <SelectItem value={monedaBase}>{monedaBase}</SelectItem>
                    {monedasOptions.map((m) => <SelectItem key={m.code} value={m.code}>{m.code}</SelectItem>)}
                  </Select>
                </div>
              )}
              {mostrarTasaCambio && (
                <div className="ff-wrap">
                  <label className="ff-label ff-required">Tasa de cambio</label>
                  <input
                    className="ff-input"
                    type="number"
                    min="0.0001"
                    step="0.0001"
                    placeholder="Tasa histórica de la fecha de la factura"
                    value={form.tasaCambio}
                    onChange={(e) => setForm((f) => ({ ...f, tasaCambio: e.target.value === '' ? '' : parseFloat(e.target.value) }))}
                  />
                  <p className="ff-hint">No se asume ninguna tasa actual — usa la tasa que tenías en el sistema anterior.</p>
                </div>
              )}
              <div className="ff-wrap" style={{ gridColumn: multimonedaHabilitada ? undefined : 'span 2' }}>
                <label className="ff-label">Descripción</label>
                <textarea
                  className="ff-input"
                  rows={2}
                  placeholder="Ej. Total original RD$25,000 — abonado RD$6,500 — pendiente RD$18,500"
                  value={form.descripcion}
                  onChange={(e) => setForm((f) => ({ ...f, descripcion: e.target.value }))}
                />
              </div>
            </div>
          </div>
        </div>

        <div className="card" style={{ marginBottom: 16 }}>
          <div className="card-header"><h2 className="card-title">NCF (opcional)</h2></div>
          <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div className="form-row form-row-3">
              <div className="ff-wrap">
                <label className="ff-label">NCF original</label>
                <input
                  className={`ff-input${errors.ncfOriginal ? ' ff-input-error' : ''}`}
                  placeholder="Ej. B0100000123"
                  value={form.ncfOriginal}
                  onChange={(e) => {
                    const val = e.target.value.toUpperCase()
                    setForm((f) => ({ ...f, ncfOriginal: val, reportarEnDgii: val ? f.reportarEnDgii : false }))
                    setErrors((er) => ({ ...er, ncfOriginal: undefined }))
                  }}
                />
                {errors.ncfOriginal && <span className="ff-error">{errors.ncfOriginal}</span>}
                <p className="ff-hint">Dejalo vacío si la factura vieja no tenía NCF o si ya se declaró en el sistema anterior.</p>
              </div>
              <div className="ff-wrap" style={{ justifyContent: 'flex-end' }}>
                <label className="ff-check-wrap" style={{ opacity: form.ncfOriginal ? 1 : 0.5 }}>
                  <input
                    type="checkbox"
                    className="ff-check"
                    checked={form.reportarEnDgii}
                    disabled={!form.ncfOriginal}
                    onChange={(e) => setForm((f) => ({ ...f, reportarEnDgii: e.target.checked }))}
                  />
                  <span className="ff-label">Reportar en la DGII (607)</span>
                </label>
                <p className="ff-hint">
                  Marca esto solo si esta factura vieja TODAVÍA no se declaró — se incluirá en el 607 del
                  mes de la fecha de la factura.
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="doc-actions-bar">
          <button type="button" className="btn btn-ghost" onClick={() => navigate('/apertura/ventas')}>Cancelar</button>
          <button type="submit" className="btn btn-navy" disabled={createMutation.isPending || (!loadingPreflight && !listo)}>
            {createMutation.isPending ? 'Cargando…' : 'Cargar saldo'}
          </button>
        </div>
      </form>

      <Modal
        open={!!created}
        onClose={() => setCreated(null)}
        title="Factura de apertura cargada"
        subtitle={created ? `${created.id} — ${created.customerName}` : undefined}
        footer={
          <>
            <button className="btn btn-secondary" onClick={() => created && navigate(`/apertura/ventas/${created.id}`)}>
              Ver factura
            </button>
            <button className="btn btn-navy" onClick={resetForm}>Cargar otra</button>
          </>
        }
      >
        {created && (
          <p style={{ margin: 0 }}>
            Se cargó y confirmó el saldo de <strong>{formatMoney(created.montoPendiente, created.currency)}</strong> para{' '}
            <strong>{created.customerName}</strong> (referencia {created.numeroFacturaOriginal}).
          </p>
        )}
      </Modal>
    </div>
  )
}
