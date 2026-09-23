import { useEffect, useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm, Controller } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { toast } from 'sonner'
import { createSupplier, updateSupplier } from '@/shared/api/suppliers'
import { listRetenciones } from '@/shared/api/retenciones'
import type { ApiError, Supplier, CreateProveedorDto, UpdateProveedorDto } from '@/shared/api/types'
import { listGruposProveedores, getCatalogosFiscales, listPaises, listBancos, listImpuestosCompras, getFacturacionConfig, listAlmacenes } from '@/shared/api/config'
import { validateRNCDetailed, validateCedulaDetailed, formatRNC, formatCedula } from '@/lib/validators/dgii'
import { TIPO_IDENTIFICACION } from '@/lib/constants'
import { SearchSelect } from '@/shared/ui/SearchSelect'
import type { SearchSelectOption } from '@/shared/ui/SearchSelect'
import { MultiSelectChecklist } from '@/shared/ui/MultiSelectChecklist'
import { FieldTooltip } from '@/shared/ui/FieldTooltip'
import { AccountSelect } from '@/components/shared/AccountSelect'
import { Select, SelectItem } from '@/components/ui/select'
import { CheckCircle2, XCircle, Save, Loader2 } from 'lucide-react'
import { useBeforeUnloadWarning } from '@/shared/hooks/useBeforeUnloadWarning'


const schema = z
  .object({
    supplierName: z.string().min(1, 'El nombre es requerido'),
    supplierType: z.enum(['Company', 'Individual']),
    tipoIdentificacion: z.enum(['RNC', 'Cedula', 'Pasaporte', 'NIT']).optional(),
    rnc: z.string().optional(),
    cedula: z.string().optional(),
    esProveedorExterior: z.boolean(),
    paisOrigen: z.string().optional(),
    diasCredito: z.number().min(0),
    supplierGroup: z.string().optional(),
    paymentTerms: z.string().optional(),
    emailId: z.string().email('Email inválido').optional().or(z.literal('')),
    emailPagos: z.string().email('Email inválido').optional().or(z.literal('')),
    mobileNo: z.string().optional(),
    banco: z.string().optional(),
    tipoCuenta: z.string().optional(),
    numeroCuenta: z.string().optional(),
    abaSwift: z.string().optional(),
    defaultTipoBienes606: z.string().optional(),
    defaultFormaPago606: z.string().optional(),
    defaultTipoPagoProveedor: z.string().optional(),
    almacenCompraDefault: z.string().optional(),
    cuentaCxpDefault: z.string().optional(),
    defaultCurrency: z.string().optional(),
    retencionesDefault: z.array(z.string()).optional(),
    impuestoComprasDefault: z.array(z.string()).optional(),
    impuestoGastosDefault: z.array(z.string()).optional(),
  })
  .superRefine((data, ctx) => {
    if (data.tipoIdentificacion === 'RNC' && data.rnc) {
      const result = validateRNCDetailed(data.rnc)
      if (!result.valid) {
        ctx.addIssue({ code: 'custom', path: ['rnc'], message: result.reason ?? 'RNC inválido' })
      }
    }
    if (data.tipoIdentificacion === 'Cedula' && data.cedula) {
      const result = validateCedulaDetailed(data.cedula)
      if (!result.valid) {
        ctx.addIssue({ code: 'custom', path: ['cedula'], message: result.reason ?? 'Cédula inválida' })
      }
    }
  })

type FormValues = z.infer<typeof schema>

export interface SupplierFormPanelProps {
  /** Si se pasa, el formulario opera en modo edición contra este proveedor. */
  supplier?: Supplier
  onSuccess: (supplier: Supplier) => void
  onCancel: () => void
}

export function SupplierFormPanel({ supplier, onSuccess, onCancel }: SupplierFormPanelProps) {
  const isEdit = Boolean(supplier)
  const queryClient = useQueryClient()

  const { data: gruposData, isLoading: gruposLoading } = useQuery({
    queryKey: ['grupos-proveedores'],
    queryFn: listGruposProveedores,
    staleTime: 60_000,
  })

  // ── Multimoneda (docs/tasks/64_multimoneda_completo.md Fase 2) ────────────
  const { data: facturacionConfig } = useQuery({
    queryKey: ['facturacion-config'],
    queryFn: getFacturacionConfig,
    staleTime: 5 * 60_000,
  })
  const monedaBase = facturacionConfig?.monedaBase ?? 'DOP'
  const monedasHabilitadas = facturacionConfig?.monedasHabilitadas ?? ['DOP']

  const { data: catalogos } = useQuery({
    queryKey: ['catalogos-fiscales'],
    queryFn: getCatalogosFiscales,
    staleTime: 60 * 60_000,
  })
  const [defaultTipoBienes606Search, setDefaultTipoBienes606Search] = useState('')
  const defaultTipoBienes606Options: SearchSelectOption[] = (catalogos?.tipoBienes606 ?? [])
    .filter((t) => !defaultTipoBienes606Search || t.label.toLowerCase().includes(defaultTipoBienes606Search.toLowerCase()))
    .map((t) => ({ value: t.value, label: t.label }))

  const [defaultFormaPago606Search, setDefaultFormaPago606Search] = useState('')
  const defaultFormaPago606Options: SearchSelectOption[] = (catalogos?.formaPago606 ?? [])
    .filter((t) => !defaultFormaPago606Search || t.label.toLowerCase().includes(defaultFormaPago606Search.toLowerCase()))
    .map((t) => ({ value: t.value, label: t.label }))

  // Sin contexto de sucursal en esta pantalla (es un default a nivel de proveedor, no de
  // documento) — ofrece todos los almacenes del tenant, igual que "Almacén destino" en
  // RelacionDetail (misma naturaleza de campo: override que gana sobre la resolución normal).
  const { data: almacenesData } = useQuery({
    queryKey: ['almacenes-todos'],
    queryFn: () => listAlmacenes(),
    staleTime: 60_000,
  })
  const almacenCompraDefaultOptions: SearchSelectOption[] = (almacenesData ?? []).map((w) => ({ value: w.id, label: w.name }))

  const { data: paisesData, isLoading: paisesLoading } = useQuery({
    queryKey: ['paises'],
    queryFn: listPaises,
    staleTime: 60 * 60_000,
  })

  const grupoOptions: SearchSelectOption[] = (gruposData ?? []).map((g) => ({
    value: g.name,
    label: g.name,
    sublabel: g.parentGroup ? `Sub de: ${g.parentGroup}` : undefined,
  }))

  const [paisSearch, setPaisSearch] = useState('')
  const paisOptions: SearchSelectOption[] = useMemo(() => {
    const q = paisSearch.toLowerCase()
    return (paisesData ?? [])
      .filter((p) => !q || p.name.toLowerCase().includes(q))
      .map((p) => ({ value: p.name, label: p.name }))
  }, [paisesData, paisSearch])

  const { data: bancosData } = useQuery({
    queryKey: ['bancos'],
    queryFn: listBancos,
    staleTime: 60 * 60_000,
  })

  const { data: retencionesData } = useQuery({
    queryKey: ['retenciones-all'],
    queryFn: () => listRetenciones({ limit: 100 }),
    staleTime: 60_000,
  })
  const retencionesOptions = retencionesData?.items ?? []
  const [retencionSearch, setRetencionSearch] = useState('')

  // Mismo catálogo de templates para ambos selectores — cada campo guarda cuáles aplican según el contexto.
  const { data: impuestosComprasData } = useQuery({
    queryKey: ['impuestos-compras'],
    queryFn: listImpuestosCompras,
    staleTime: 5 * 60_000,
  })
  const [impuestoComprasSearch, setImpuestoComprasSearch] = useState('')
  const [impuestoGastosSearch, setImpuestoGastosSearch] = useState('')
  const [bancoSearch, setBancoSearch] = useState('')
  const bancoOptions: SearchSelectOption[] = useMemo(() => {
    const q = bancoSearch.toLowerCase()
    return (bancosData ?? [])
      .filter((b) => !q || b.name.toLowerCase().includes(q))
      .map((b) => ({ value: b.name, label: b.name }))
  }, [bancosData, bancoSearch])

  const {
    register,
    control,
    handleSubmit,
    watch,
    setValue,
    setError,
    formState: { errors, isSubmitting, isDirty },
    reset,
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      supplierName: '',
      supplierType: 'Company',
      tipoIdentificacion: 'RNC',
      rnc: '',
      cedula: '',
      esProveedorExterior: false,
      paisOrigen: '',
      diasCredito: 0,
      supplierGroup: '',
      paymentTerms: '',
      emailId: '',
      emailPagos: '',
      mobileNo: '',
      banco: '',
      tipoCuenta: '',
      numeroCuenta: '',
      abaSwift: '',
      defaultTipoBienes606: '',
      defaultFormaPago606: '',
      defaultTipoPagoProveedor: '',
      almacenCompraDefault: '',
      cuentaCxpDefault: '',
      defaultCurrency: '',
      retencionesDefault: [],
      impuestoComprasDefault: [],
      impuestoGastosDefault: [],
    },
  })

  useBeforeUnloadWarning(isDirty)

  useEffect(() => {
    if (supplier) {
      reset({
        supplierName: supplier.supplierName,
        supplierType: supplier.supplierType,
        tipoIdentificacion: supplier.tipoIdentificacion,
        rnc: supplier.rnc ?? '',
        cedula: supplier.cedula ?? '',
        esProveedorExterior: supplier.esProveedorExterior,
        paisOrigen: supplier.paisOrigen ?? '',
        diasCredito: supplier.diasCredito,
        supplierGroup: supplier.supplierGroup ?? '',
        paymentTerms: supplier.paymentTerms ?? '',
        emailId: supplier.emailId ?? '',
        emailPagos: supplier.emailPagos ?? '',
        mobileNo: supplier.mobileNo ?? '',
        banco: supplier.banco ?? '',
        tipoCuenta: supplier.tipoCuenta ?? '',
        numeroCuenta: supplier.numeroCuenta ?? '',
        abaSwift: supplier.abaSwift ?? '',
        defaultTipoBienes606: supplier.defaultTipoBienes606 ?? '',
        defaultFormaPago606: supplier.defaultFormaPago606 ?? '',
        defaultTipoPagoProveedor: supplier.defaultTipoPagoProveedor ?? '',
        almacenCompraDefault: supplier.almacenCompraDefault ?? '',
        cuentaCxpDefault: supplier.cuentaCxpDefault ?? '',
        defaultCurrency: supplier.defaultCurrency ?? '',
        retencionesDefault: (supplier.retencionesDefault ?? []).map((d) => d.id),
        impuestoComprasDefault: (supplier.impuestoComprasDefault ?? []).map((d) => d.id),
        impuestoGastosDefault: (supplier.impuestoGastosDefault ?? []).map((d) => d.id),
      })
    }
  }, [supplier, reset])

  const createMutation = useMutation({
    mutationFn: (data: FormValues) =>
      createSupplier({
        supplierName: data.supplierName,
        supplierType: data.supplierType,
        tipoIdentificacion: data.tipoIdentificacion as CreateProveedorDto['tipoIdentificacion'],
        rnc: data.rnc || undefined,
        cedula: data.cedula || undefined,
        esProveedorExterior: data.esProveedorExterior,
        paisOrigen: data.paisOrigen || undefined,
        diasCredito: data.diasCredito,
        supplierGroup: data.supplierGroup || undefined,
        paymentTerms: data.paymentTerms || undefined,
        emailId: data.emailId || undefined,
        emailPagos: data.emailPagos || undefined,
        mobileNo: data.mobileNo || undefined,
        banco: data.banco || undefined,
        tipoCuenta: (data.tipoCuenta || undefined) as UpdateProveedorDto['tipoCuenta'],
        numeroCuenta: data.numeroCuenta || undefined,
        abaSwift: data.abaSwift || undefined,
        defaultTipoBienes606: data.defaultTipoBienes606 || undefined,
        defaultFormaPago606: data.defaultFormaPago606 || undefined,
        defaultTipoPagoProveedor: (data.defaultTipoPagoProveedor || undefined) as 'Contado' | 'Crédito' | undefined,
        almacenCompraDefault: data.almacenCompraDefault || undefined,
        cuentaCxpDefault: data.cuentaCxpDefault || undefined,
        defaultCurrency: data.defaultCurrency || undefined,
        retencionesDefault: data.retencionesDefault && data.retencionesDefault.length > 0 ? data.retencionesDefault : undefined,
        impuestoComprasDefault: data.impuestoComprasDefault ?? [],
        impuestoGastosDefault: data.impuestoGastosDefault ?? [],
      }),
    onSuccess: (data) => {
      toast.success('Proveedor creado correctamente')
      queryClient.invalidateQueries({ queryKey: ['suppliers'] })
      onSuccess(data)
    },
    onError: (err: ApiError) => {
      if (err?.statusCode === 409) {
        toast.error(err.message)
        setError(watch('tipoIdentificacion') === 'Cedula' ? 'cedula' : 'rnc', { type: 'manual', message: err.message })
        return
      }
      toast.error(err?.message ?? 'Error al crear el proveedor')
    },
  })

  const updateMutation = useMutation({
    mutationFn: (data: Partial<FormValues>) => updateSupplier(supplier!.id, data as unknown as UpdateProveedorDto),
    onSuccess: (data) => {
      toast.success('Proveedor actualizado correctamente')
      queryClient.invalidateQueries({ queryKey: ['suppliers'] })
      queryClient.invalidateQueries({ queryKey: ['supplier', supplier!.id] })
      onSuccess(data)
    },
    onError: (err: ApiError) => {
      if (err?.statusCode === 409) {
        toast.error(err.message)
        setError(watch('tipoIdentificacion') === 'Cedula' ? 'cedula' : 'rnc', { type: 'manual', message: err.message })
        return
      }
      toast.error(err?.message ?? 'Error al actualizar el proveedor')
    },
  })

  const onSubmit = (values: FormValues) => {
    if (isEdit) {
      // A diferencia del resto de los campos de este PUT, `defaultCurrency` es un enum
      // restringido en el backend (DOP/USD/EUR) — un '' sin tocar se rechazaría con
      // CURRENCY_NOT_SUPPORTED en vez de tratarse como "no enviado".
      updateMutation.mutate({ ...values, defaultCurrency: values.defaultCurrency || undefined })
    } else {
      createMutation.mutate(values)
    }
  }

  const tipoId = watch('tipoIdentificacion')
  const esExterior = watch('esProveedorExterior')
  const rncValue = watch('rnc')
  const cedulaValue = watch('cedula')

  const showRNC = tipoId === 'RNC'
  const showCedula = tipoId === 'Cedula'

  const rncDetail = showRNC && rncValue ? validateRNCDetailed(rncValue) : null
  const cedulaDetail = showCedula && cedulaValue ? validateCedulaDetailed(cedulaValue) : null
  const rncValid = rncDetail?.valid ?? null
  const cedulaValid = cedulaDetail?.valid ?? null

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="detail-grid">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        {/* General info */}
        <div className="card">
          <div className="card-header">
            <span className="card-title">Información General</span>
          </div>
          <div className="card-body">
            <div className="form-section">
              <div className="ff-wrap">
                <label className="ff-label">Nombre <span className="ff-required">*</span></label>
                <input className="ff-input" id="supplierName" {...register('supplierName')} />
                {errors.supplierName && <span className="ff-error">{errors.supplierName.message}</span>}
              </div>

              <div className="form-row">
                <div className="ff-wrap">
                  <label className="ff-label">Tipo</label>
                  <Controller
                    name="supplierType"
                    control={control}
                    render={({ field }) => (
                      <Select value={field.value} onValueChange={field.onChange}>
                        <SelectItem value="Company">Empresa</SelectItem>
                        <SelectItem value="Individual">Individual</SelectItem>
                      </Select>
                    )}
                  />
                </div>

                <div className="ff-wrap">
                  <label className="ff-label">Tipo Identificación</label>
                  <Controller
                    name="tipoIdentificacion"
                    control={control}
                    render={({ field }) => (
                      <Select value={field.value ?? ''} onValueChange={field.onChange} placeholder="Seleccionar">
                        {TIPO_IDENTIFICACION.map((t) => (
                          <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                        ))}
                      </Select>
                    )}
                  />
                </div>
              </div>

              {showRNC && (
                <div className="ff-wrap">
                  <label className="ff-label">RNC</label>
                  <div className="ff-input-wrap">
                    <input
                      id="rnc"
                      className="ff-input"
                      placeholder="1-23-45678-9"
                      value={rncValue ?? ''}
                      onChange={(e) => {
                        setValue('rnc', formatRNC(e.target.value), { shouldValidate: true })
                      }}
                      style={{ paddingRight: rncValue ? 36 : undefined }}
                    />
                    {rncValue && (
                      <span className="ff-validation-icon">
                        {rncValid
                          ? <CheckCircle2 size={16} style={{ color: 'var(--success-text)' }} />
                          : <XCircle size={16} style={{ color: 'var(--error-text)' }} />}
                      </span>
                    )}
                  </div>
                  {errors.rnc
                    ? <span className="ff-error">{errors.rnc.message}</span>
                    : rncDetail && !rncDetail.valid && (
                      <span className="ff-error" style={{ display: 'block' }}>{rncDetail.reason}</span>
                    )}
                </div>
              )}

              {showCedula && (
                <div className="ff-wrap">
                  <label className="ff-label">Cédula</label>
                  <div className="ff-input-wrap">
                    <input
                      id="cedula"
                      className="ff-input"
                      placeholder="001-1234567-8"
                      value={cedulaValue ?? ''}
                      onChange={(e) => {
                        setValue('cedula', formatCedula(e.target.value), { shouldValidate: true })
                      }}
                      style={{ paddingRight: cedulaValue ? 36 : undefined }}
                    />
                    {cedulaValue && (
                      <span className="ff-validation-icon">
                        {cedulaValid
                          ? <CheckCircle2 size={16} style={{ color: 'var(--success-text)' }} />
                          : <XCircle size={16} style={{ color: 'var(--error-text)' }} />}
                      </span>
                    )}
                  </div>
                  {errors.cedula
                    ? <span className="ff-error">{errors.cedula.message}</span>
                    : cedulaDetail && !cedulaDetail.valid && (
                      <span className="ff-error" style={{ display: 'block' }}>{cedulaDetail.reason}</span>
                    )}
                </div>
              )}

              <div className="form-row">
                <div className="ff-wrap">
                  <label className="ff-label">Email</label>
                  <input className="ff-input" type="email" {...register('emailId')} />
                  {errors.emailId && <span className="ff-error">{errors.emailId.message}</span>}
                </div>
                <div className="ff-wrap">
                  <label className="ff-label">Email de Pagos</label>
                  <input className="ff-input" type="email" {...register('emailPagos')} />
                  {errors.emailPagos && <span className="ff-error">{errors.emailPagos.message}</span>}
                </div>
                <div className="ff-wrap">
                  <label className="ff-label">Teléfono</label>
                  <input className="ff-input" {...register('mobileNo')} />
                </div>
                <div className="ff-wrap">
                  <label className="ff-label">Días de Crédito</label>
                  <input className="ff-input" type="number" min={0} {...register('diasCredito', { valueAsNumber: true })} />
                </div>
              </div>

              <div className="form-row">
                <div className="ff-wrap">
                  <label className="ff-label">
                    Grupo de Proveedor
                    <FieldTooltip>Categoría organizativa del proveedor</FieldTooltip>
                  </label>
                  <Controller
                    name="supplierGroup"
                    control={control}
                    render={({ field }) => (
                      <SearchSelect
                        value={field.value ?? ''}
                        onChange={(id) => field.onChange(id || undefined)}
                        options={grupoOptions}
                        onSearch={() => {}}
                        loading={gruposLoading}
                        placeholder="Buscar grupo…"
                      />
                    )}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Proveedor Exterior */}
        <div className="card">
          <div className="card-header">
            <span className="card-title">Origen</span>
          </div>
          <div className="card-body">
            <div className="form-section">
              <Controller
                name="esProveedorExterior"
                control={control}
                render={({ field }) => (
                  <label className="ff-check-wrap">
                    <input
                      type="checkbox"
                      className="ff-check"
                      id="esProveedorExterior"
                      checked={field.value}
                      onChange={field.onChange}
                    />
                    <span className="ff-label" style={{ cursor: 'pointer' }}>Es proveedor del exterior</span>
                  </label>
                )}
              />

              {esExterior && (
                <div className="ff-wrap">
                  <label className="ff-label">País de Origen</label>
                  <Controller
                    name="paisOrigen"
                    control={control}
                    render={({ field }) => (
                      <SearchSelect
                        id="paisOrigen"
                        value={field.value ?? ''}
                        onChange={(v) => field.onChange(v || undefined)}
                        options={paisOptions}
                        onSearch={setPaisSearch}
                        loading={paisesLoading}
                        placeholder="Buscar país…"
                      />
                    )}
                  />
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Bank account */}
        <div className="card">
          <div className="card-header">
            <span className="card-title">Cuenta Bancaria</span>
          </div>
          <div className="card-body">
            <div className="form-section">
              <div className="form-row">
                <div className="ff-wrap">
                  <label className="ff-label">Banco</label>
                  <Controller
                    name="banco"
                    control={control}
                    render={({ field }) => (
                      <SearchSelect
                        value={field.value ?? ''}
                        onChange={(val) => field.onChange(val)}
                        options={bancoOptions}
                        onSearch={setBancoSearch}
                        selectedLabel={field.value ?? ''}
                        placeholder="Ej: Banco Popular"
                      />
                    )}
                  />
                </div>
                <div className="ff-wrap">
                  <label className="ff-label">Tipo de Cuenta</label>
                  <Controller
                    name="tipoCuenta"
                    control={control}
                    render={({ field }) => (
                      <Select value={field.value ?? ''} onValueChange={field.onChange} placeholder="Seleccionar">
                        <SelectItem value="Corriente">Corriente</SelectItem>
                        <SelectItem value="Ahorros">Ahorros</SelectItem>
                        <SelectItem value="Internacional">Internacional</SelectItem>
                      </Select>
                    )}
                  />
                </div>
                <div className="ff-wrap">
                  <label className="ff-label">Número de Cuenta</label>
                  <input className="ff-input" {...register('numeroCuenta')} />
                </div>
                <div className="ff-wrap">
                  <label className="ff-label">ABA / SWIFT</label>
                  <input className="ff-input" {...register('abaSwift')} placeholder="Código ABA o SWIFT" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ════════════════ COLUMNA DERECHA ════════════════ */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        {/* Clasificación fiscal 606 — compartida entre Compras y Gastos */}
        <div className="card">
          <div className="card-header">
            <span className="card-title">Clasificación Fiscal (606)</span>
          </div>
          <div className="card-body">
            <p className="ff-hint" style={{ marginTop: 0, marginBottom: 12 }}>
              Prellenan el reporte 606 al registrar una Compra o un Gasto a este proveedor.
            </p>
            <div className="form-section">
              <div className="form-row">
                <div className="ff-wrap">
                  <label className="ff-label">Tipo de Bienes/Servicios</label>
                  <Controller
                    name="defaultTipoBienes606"
                    control={control}
                    render={({ field }) => (
                      <SearchSelect
                        value={field.value ?? ''}
                        onChange={field.onChange}
                        options={defaultTipoBienes606Options}
                        onSearch={setDefaultTipoBienes606Search}
                        selectedLabel={catalogos?.tipoBienes606?.find((t) => t.value === field.value)?.label ?? ''}
                        placeholder="Sin configurar"
                      />
                    )}
                  />
                </div>
                <div className="ff-wrap">
                  <label className="ff-label">Forma de Pago</label>
                  <Controller
                    name="defaultFormaPago606"
                    control={control}
                    render={({ field }) => (
                      <SearchSelect
                        value={field.value ?? ''}
                        onChange={field.onChange}
                        options={defaultFormaPago606Options}
                        onSearch={setDefaultFormaPago606Search}
                        selectedLabel={catalogos?.formaPago606?.find((t) => t.value === field.value)?.label ?? ''}
                        placeholder="Sin configurar"
                      />
                    )}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Defaults de Compras (bienes) */}
        <div className="card">
          <div className="card-header">
            <span className="card-title">Compras (bienes)</span>
          </div>
          <div className="card-body">
            <p className="ff-hint" style={{ marginTop: 0, marginBottom: 12 }}>
              Se aplican automáticamente al registrar una Compra a este proveedor, si el usuario no elige
              un valor explícito en el formulario.
            </p>
            <div className="form-section">
              <div className="ff-wrap">
                <label className="ff-label">Tipo de Pago</label>
                <Controller
                  name="defaultTipoPagoProveedor"
                  control={control}
                  render={({ field }) => (
                    <Select value={field.value ?? ''} onValueChange={field.onChange} placeholder="Sin configurar">
                      <SelectItem value="Contado">Contado</SelectItem>
                      <SelectItem value="Crédito">Crédito</SelectItem>
                    </Select>
                  )}
                />
              </div>
              <div className="ff-wrap">
                <label className="ff-label">
                  Moneda por Defecto
                  <FieldTooltip>
                    Prellena la moneda al pagarle a este proveedor. Al fijarla, se autopobla su cuenta CxP en esa
                    moneda (salvo que elijas una "Cuenta CxP Alterna" explícita abajo).
                  </FieldTooltip>
                </label>
                <label className="ff-label">Almacén de Compras por Defecto</label>
                <Controller
                  name="almacenCompraDefault"
                  control={control}
                  render={({ field }) => (
                    <SearchSelect
                      value={field.value ?? ''}
                      onChange={field.onChange}
                      options={almacenCompraDefaultOptions}
                      onSearch={() => {}}
                      selectedLabel={almacenesData?.find((w) => w.id === field.value)?.name ?? ''}
                      placeholder="Se resuelve por la sucursal de la compra"
                    />
                  )}
                />
                <p className="ff-hint">
                  Si se configura, las compras a este proveedor (incluidas compras B2B de este socio) entran SIEMPRE
                  a este almacén, sin importar la sucursal.
                </p>
              </div>
              <div className="ff-wrap">
                <label className="ff-label">Moneda por Defecto</label>
                <Controller
                  name="defaultCurrency"
                  control={control}
                  render={({ field }) => (
                    <Select value={field.value ?? ''} onValueChange={field.onChange} placeholder={`Heredar (${monedaBase})`}>
                      <SelectItem value="">Heredar ({monedaBase})</SelectItem>
                      {(['DOP', 'USD', 'EUR'] as const).map((c) => (
                        <SelectItem key={c} value={c} disabled={!monedasHabilitadas.includes(c)}>
                          {c}{!monedasHabilitadas.includes(c) ? ' (habilítela primero en Monedas)' : ''}
                        </SelectItem>
                      ))}
                    </Select>
                  )}
                />
              </div>
              <div className="ff-wrap">
                <label className="ff-label">
                  Cuenta CxP Alterna
                  <FieldTooltip>
                    Si se configura, las compras a este proveedor afectan esta cuenta en vez de la cuenta CxP
                    default de la empresa. Dejar vacío para usar el default.
                  </FieldTooltip>
                </label>
                <Controller
                  name="cuentaCxpDefault"
                  control={control}
                  render={({ field }) => (
                    <AccountSelect
                      value={field.value ?? ''}
                      onChange={field.onChange}
                      rootType="Liability"
                      placeholder="Buscar cuenta…"
                    />
                  )}
                />
              </div>
              <div className="ff-wrap">
                <label className="ff-label">
                  Impuestos del Documento
                  <FieldTooltip>
                    Purchase Taxes and Charges Templates aplicados al total de la compra si no se elige ninguno
                    explícito — si eliges varios, sus líneas de impuesto se combinan en el mismo documento.
                  </FieldTooltip>
                </label>
                <Controller
                  name="impuestoComprasDefault"
                  control={control}
                  render={({ field }) => (
                    <MultiSelectChecklist
                      value={field.value ?? []}
                      onChange={field.onChange}
                      options={(impuestosComprasData ?? []).map((t) => ({ id: String(t.id), label: t.title }))}
                      search={impuestoComprasSearch}
                      onSearchChange={setImpuestoComprasSearch}
                      searchPlaceholder="Buscar plantilla…"
                      emptyLabel="No hay plantillas configuradas."
                    />
                  )}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Defaults de Gastos (servicios) */}
        <div className="card">
          <div className="card-header">
            <span className="card-title">Gastos (servicios)</span>
          </div>
          <div className="card-body">
            <p className="ff-hint" style={{ marginTop: 0, marginBottom: 12 }}>
              Se aplican automáticamente al registrar un Gasto a este proveedor, si el usuario no elige un
              valor explícito en el formulario. No afectan a Compras.
            </p>
            <div className="form-section">
              <div className="ff-wrap">
                <label className="ff-label">
                  Impuestos del Documento
                  <FieldTooltip>Mismo catálogo de templates que Compras, aplicado a Gastos en su lugar — puedes elegir varios.</FieldTooltip>
                </label>
                <Controller
                  name="impuestoGastosDefault"
                  control={control}
                  render={({ field }) => (
                    <MultiSelectChecklist
                      value={field.value ?? []}
                      onChange={field.onChange}
                      options={(impuestosComprasData ?? []).map((t) => ({ id: String(t.id), label: t.title }))}
                      search={impuestoGastosSearch}
                      onSearchChange={setImpuestoGastosSearch}
                      searchPlaceholder="Buscar plantilla…"
                      emptyLabel="No hay plantillas configuradas."
                    />
                  )}
                />
              </div>
              <div className="ff-wrap">
                <label className="ff-label">
                  Retenciones por Defecto
                  <FieldTooltip>
                    Estas retenciones se aplican por defecto al registrar un Gasto a este proveedor (el BFF
                    calcula el monto correspondiente a partir de la tasa de cada una). La retención no
                    corresponde a compra de bienes según las reglas fiscales RD, por eso no aplica en Compras.
                  </FieldTooltip>
                </label>
                <Controller
                  name="retencionesDefault"
                  control={control}
                  render={({ field }) => (
                    <MultiSelectChecklist
                      value={field.value ?? []}
                      onChange={field.onChange}
                      options={retencionesOptions.map((r) => ({ id: r.id, label: r.categoryName }))}
                      search={retencionSearch}
                      onSearchChange={setRetencionSearch}
                      searchPlaceholder="Buscar retención…"
                      emptyLabel="No hay retenciones configuradas."
                    />
                  )}
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ════════════════ BOTONES (ancho completo) ════════════════ */}
      <div style={{ gridColumn: '1 / -1', display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
        <button type="button" className="btn btn-ghost" onClick={onCancel}>
          Cancelar
        </button>
        <button type="submit" className="btn btn-navy" disabled={isSubmitting}>
          {isSubmitting
            ? <Loader2 size={15} style={{ animation: 'spin 1s linear infinite' }} />
            : <Save size={15} />}
          {isEdit ? 'Guardar Cambios' : 'Crear Proveedor'}
        </button>
      </div>
    </form>
  )
}
