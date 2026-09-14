// Cargar saldo de apertura de un proveedor — docs/tasks/PROMPT_APERTURA_FRONTEND.md §5.
// Formulario simétrico al de ventas (§4): mismas reglas de negocio, con `supplier` en vez de
// `customer`, `numeroFacturaProveedor` (número que el PROVEEDOR le puso a su factura) y un select
// explícito de `tipoComprobante` (a diferencia de ventas, acá el tipo no se deriva del NCF).

import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQuery } from '@tanstack/react-query'
import { toast } from 'sonner'
import { ArrowLeft, AlertTriangle, Info } from 'lucide-react'
import { crearAperturaCompra } from '@/shared/api/apertura'
import { listSuppliers } from '@/shared/api/suppliers'
import { listSucursales } from '@/shared/api/sucursales'
import { getFacturacionConfig, getCatalogosFiscales } from '@/shared/api/config'
import { listMonedas } from '@/shared/api/monedas'
import type { CrearFacturaAperturaCompraDto, FacturaAperturaCompra } from '@/shared/api/types'
import { PageHeader } from '@/components/shared/PageHeader'
import { DatePicker } from '@/shared/ui/DatePicker'
import { SearchSelect } from '@/shared/ui/SearchSelect'
import type { SearchSelectOption } from '@/shared/ui/SearchSelect'
import { Select, SelectItem } from '@/components/ui/select'
import { Modal } from '@/shared/ui/Modal'
import { formatMoney } from '@/lib/formatters'
import { today, usePreflightGate } from './lib'

interface FieldErrors {
  supplier?: string
  numeroFacturaProveedor?: string
  branch?: string
}

function emptyForm() {
  return {
    supplierId: '',
    supplierLabel: '',
    numeroFacturaProveedor: '',
    fechaFactura: today(),
    fechaVencimiento: '',
    montoPendiente: '' as number | '',
    descripcion: '',
    origen: '',
    ncfProveedor: '',
    tipoComprobante: '',
    reportarEnDgii: false,
    moneda: '',
    tasaCambio: '' as number | '',
    branch: '',
  }
}

export default function CompraForm() {
  const navigate = useNavigate()
  const { listo, isLoading: loadingPreflight } = usePreflightGate()

  const [form, setForm] = useState(emptyForm())
  const [errors, setErrors] = useState<FieldErrors>({})
  const [supplierQuery, setSupplierQuery] = useState('')
  const [branchQuery, setBranchQuery] = useState('')
  const [tipoComprobanteQuery, setTipoComprobanteQuery] = useState('')
  const [created, setCreated] = useState<FacturaAperturaCompra | null>(null)

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

  const { data: catalogos } = useQuery({
    queryKey: ['catalogos-fiscales'],
    queryFn: getCatalogosFiscales,
    staleTime: 60 * 60_000,
  })
  const tipoComprobanteOptions: SearchSelectOption[] = (catalogos?.ncfTypesCompra ?? [])
    .filter((t) => !tipoComprobanteQuery || t.label.toLowerCase().includes(tipoComprobanteQuery.toLowerCase()))
    .map((t) => ({ value: t.value, label: t.label }))

  const { data: suppliersData, isLoading: suppliersLoading } = useQuery({
    queryKey: ['aperturaSupplierSearch', supplierQuery],
    queryFn: () => listSuppliers({ search: supplierQuery || undefined, limit: 15 }),
  })
  const supplierOptions: SearchSelectOption[] = (suppliersData?.items ?? []).map((s) => ({
    value: s.id,
    label: s.supplierName,
    sublabel: s.rnc ?? s.cedula,
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

  const createMutation = useMutation({
    mutationFn: (dto: CrearFacturaAperturaCompraDto) => crearAperturaCompra(dto),
    onSuccess: (data) => {
      setCreated(data)
      setErrors({})
    },
    onError: (err: { message?: string }) => {
      const msg = err?.message ?? 'Error al cargar el saldo de apertura'
      if (/no encontrado/.test(msg) && /Proveedor/.test(msg)) {
        setErrors((e) => ({ ...e, supplier: msg }))
      } else if (/Ya existe la factura de compra/.test(msg)) {
        setErrors((e) => ({ ...e, numeroFacturaProveedor: msg }))
      } else if (/sucursal/i.test(msg) && /no existe/.test(msg)) {
        setErrors((e) => ({ ...e, branch: msg }))
      }
      toast.error(msg)
    },
  })

  const duplicadoMatch = errors.numeroFacturaProveedor?.match(/APER-PINV-\d+/)?.[0]

  function resetForm() {
    setForm(emptyForm())
    setErrors({})
    setCreated(null)
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const newErrors: FieldErrors = {}
    if (!form.supplierId) newErrors.supplier = 'Selecciona un proveedor'
    if (!form.numeroFacturaProveedor.trim()) newErrors.numeroFacturaProveedor = 'Ingresa el número de factura del proveedor'
    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors)
      toast.error('Revisa los campos marcados')
      return
    }
    if (form.reportarEnDgii && !form.ncfProveedor) {
      toast.error('No se puede reportar a la DGII una factura sin NCF — indique ncfProveedor.')
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

    const dto: CrearFacturaAperturaCompraDto = {
      supplier: form.supplierId,
      numeroFacturaProveedor: form.numeroFacturaProveedor.trim(),
      fechaFactura: form.fechaFactura,
      fechaVencimiento: form.fechaVencimiento || undefined,
      montoPendiente: Number(form.montoPendiente),
      descripcion: form.descripcion || undefined,
      origen: form.origen || undefined,
      ncfProveedor: form.ncfProveedor || undefined,
      tipoComprobante: form.tipoComprobante || undefined,
      reportarEnDgii: form.reportarEnDgii,
      moneda: mostrarTasaCambio || form.moneda ? form.moneda || undefined : undefined,
      tasaCambio: mostrarTasaCambio ? Number(form.tasaCambio) : undefined,
      branch: form.branch || undefined,
    }
    createMutation.mutate(dto)
  }

  return (
    <div className="page-container">
      <a className="page-back-link" onClick={() => navigate('/apertura/compras')}>
        <ArrowLeft size={14} /> Compras — Apertura
      </a>

      <PageHeader
        title="Cargar saldo de proveedor"
        description="Migra el saldo pendiente de una factura de compra del sistema anterior — sin generar NCF nuevo ni afectar los reportes del período actual."
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
                <label className="ff-label ff-required">Proveedor</label>
                <SearchSelect
                  value={form.supplierId}
                  selectedLabel={form.supplierLabel}
                  onChange={(id, opt) => { setForm((f) => ({ ...f, supplierId: id, supplierLabel: opt?.label ?? '' })); setErrors((e) => ({ ...e, supplier: undefined })) }}
                  options={supplierOptions}
                  onSearch={setSupplierQuery}
                  loading={suppliersLoading}
                  placeholder="Buscar proveedor…"
                  error={!!errors.supplier}
                />
                {errors.supplier && <span className="ff-error">{errors.supplier}</span>}
                <p className="ff-hint">Si el proveedor no existe, créalo primero en el módulo de Proveedores.</p>
              </div>
              <div className="ff-wrap">
                <label className="ff-label ff-required">N° de factura del proveedor</label>
                <input
                  className={`ff-input${errors.numeroFacturaProveedor ? ' ff-input-error' : ''}`}
                  placeholder="Ej. PROV-F-2024-055"
                  value={form.numeroFacturaProveedor}
                  onChange={(e) => { setForm((f) => ({ ...f, numeroFacturaProveedor: e.target.value })); setErrors((er) => ({ ...er, numeroFacturaProveedor: undefined })) }}
                />
                {errors.numeroFacturaProveedor && (
                  <span className="ff-error">
                    {errors.numeroFacturaProveedor}{' '}
                    {duplicadoMatch && (
                      <a onClick={() => navigate('/apertura/compras')} style={{ cursor: 'pointer', textDecoration: 'underline' }}>
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
                  Es el saldo que TODAVÍA le debes al proveedor — no el total original de la factura.
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
          <div className="card-header"><h2 className="card-title">NCF del proveedor (opcional)</h2></div>
          <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div className="form-row form-row-3">
              <div className="ff-wrap">
                <label className="ff-label">NCF del proveedor</label>
                <input
                  className="ff-input"
                  placeholder="Se acepta tal cual venga"
                  value={form.ncfProveedor}
                  onChange={(e) => setForm((f) => ({ ...f, ncfProveedor: e.target.value, reportarEnDgii: e.target.value ? f.reportarEnDgii : false }))}
                />
                <p className="ff-hint">Sin validación de formato — es un NCF de un tercero.</p>
              </div>
              <div className="ff-wrap">
                <label className="ff-label">Tipo de comprobante</label>
                <SearchSelect
                  value={form.tipoComprobante}
                  onChange={(v) => setForm((f) => ({ ...f, tipoComprobante: v }))}
                  options={tipoComprobanteOptions}
                  onSearch={setTipoComprobanteQuery}
                  selectedLabel={catalogos?.ncfTypesCompra?.find((t) => t.value === form.tipoComprobante)?.label ?? ''}
                  placeholder="Seleccionar (opcional)"
                />
                <p className="ff-hint">A diferencia de ventas, acá el tipo se elige aparte — no se deriva del NCF.</p>
              </div>
              <div className="ff-wrap" style={{ justifyContent: 'flex-end' }}>
                <label className="ff-check-wrap" style={{ opacity: form.ncfProveedor ? 1 : 0.5 }}>
                  <input
                    type="checkbox"
                    className="ff-check"
                    checked={form.reportarEnDgii}
                    disabled={!form.ncfProveedor}
                    onChange={(e) => setForm((f) => ({ ...f, reportarEnDgii: e.target.checked }))}
                  />
                  <span className="ff-label">Reportar en la DGII (606)</span>
                </label>
                <p className="ff-hint">Marca esto solo si esta factura vieja TODAVÍA no se declaró.</p>
              </div>
            </div>
          </div>
        </div>

        <div className="doc-actions-bar">
          <button type="button" className="btn btn-ghost" onClick={() => navigate('/apertura/compras')}>Cancelar</button>
          <button type="submit" className="btn btn-navy" disabled={createMutation.isPending || (!loadingPreflight && !listo)}>
            {createMutation.isPending ? 'Cargando…' : 'Cargar saldo'}
          </button>
        </div>
      </form>

      <Modal
        open={!!created}
        onClose={() => setCreated(null)}
        title="Factura de apertura cargada"
        subtitle={created ? `${created.id} — ${created.supplierName}` : undefined}
        footer={
          <>
            <button className="btn btn-secondary" onClick={() => created && navigate(`/apertura/compras/${created.id}`)}>
              Ver factura
            </button>
            <button className="btn btn-navy" onClick={resetForm}>Cargar otra</button>
          </>
        }
      >
        {created && (
          <p style={{ margin: 0 }}>
            Se cargó y confirmó el saldo de <strong>{formatMoney(created.montoPendiente, created.currency)}</strong> para{' '}
            <strong>{created.supplierName}</strong> (factura {created.numeroFacturaProveedor}).
          </p>
        )}
      </Modal>
    </div>
  )
}
