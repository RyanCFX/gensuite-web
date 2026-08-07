import { useEffect, useState, useMemo } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm, Controller } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { toast } from 'sonner'
import { getSupplier, createSupplier, updateSupplier } from '@/shared/api/suppliers'
import type { ApiError } from '@/shared/api/types'
import { listGruposProveedores, getCatalogosFiscales, listPaises } from '@/shared/api/config'
import { validateRNCDetailed, validateCedulaDetailed, formatRNC, formatCedula } from '@/lib/validators/dgii'
import { TIPO_IDENTIFICACION } from '@/lib/constants'
import { PageHeader } from '@/components/shared/PageHeader'
import { SearchSelect } from '@/shared/ui/SearchSelect'
import type { SearchSelectOption } from '@/shared/ui/SearchSelect'
import { AccountSelect } from '@/components/shared/AccountSelect'
import { CheckCircle2, XCircle } from 'lucide-react'

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
    cuentaCxpDefault: z.string().optional(),
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

export default function SupplierForm() {
  const { id } = useParams<{ id?: string }>()
  const isEdit = Boolean(id)
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const { data: supplier, isLoading } = useQuery({
    queryKey: ['supplier', id],
    queryFn: () => getSupplier(id!),
    enabled: isEdit,
  })

  const { data: gruposData, isLoading: gruposLoading } = useQuery({
    queryKey: ['grupos-proveedores'],
    queryFn: listGruposProveedores,
    staleTime: 60_000,
  })

  const { data: catalogos } = useQuery({
    queryKey: ['catalogos-fiscales'],
    queryFn: getCatalogosFiscales,
    staleTime: 60 * 60_000,
  })

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

  const {
    register,
    control,
    handleSubmit,
    watch,
    setValue,
    setError,
    formState: { errors, isSubmitting },
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
      cuentaCxpDefault: '',
    },
  })

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
        cuentaCxpDefault: supplier.cuentaCxpDefault ?? '',
      })
    }
  }, [supplier, reset])

  const createMutation = useMutation({
    mutationFn: (data: FormValues) =>
      createSupplier({
        supplierName: data.supplierName,
        supplierType: data.supplierType,
        tipoIdentificacion: data.tipoIdentificacion,
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
        tipoCuenta: data.tipoCuenta || undefined,
        numeroCuenta: data.numeroCuenta || undefined,
        abaSwift: data.abaSwift || undefined,
        defaultTipoBienes606: data.defaultTipoBienes606 || undefined,
        defaultFormaPago606: data.defaultFormaPago606 || undefined,
        defaultTipoPagoProveedor: (data.defaultTipoPagoProveedor || undefined) as 'Contado' | 'Crédito' | undefined,
        cuentaCxpDefault: data.cuentaCxpDefault || undefined,
      }),
    onSuccess: () => {
      toast.success('Proveedor creado correctamente')
      queryClient.invalidateQueries({ queryKey: ['suppliers'] })
      navigate('/proveedores')
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
    mutationFn: (data: Partial<FormValues>) => updateSupplier(id!, data),
    onSuccess: () => {
      toast.success('Proveedor actualizado correctamente')
      queryClient.invalidateQueries({ queryKey: ['suppliers'] })
      queryClient.invalidateQueries({ queryKey: ['supplier', id] })
      navigate(`/proveedores/${id}`)
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
      updateMutation.mutate(values)
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

  if (isEdit && isLoading) {
    return (
      <div className="page-container" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <span className="skeleton-box" style={{ height: 32, width: 200, display: 'block' }} />
        <span className="skeleton-box" style={{ height: 256, display: 'block', borderRadius: 8 }} />
      </div>
    )
  }

  return (
    <div className="page-container">
      <button className="page-back-link" onClick={() => navigate(-1)}>
        ← Proveedores
      </button>

      <PageHeader title={isEdit ? 'Editar Proveedor' : 'Nuevo Proveedor'} />

      <form onSubmit={handleSubmit(onSubmit)} style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 380px', gap: 20, alignItems: 'start' }}>
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
                        <select className="ff-select" value={field.value} onChange={field.onChange}>
                          <option value="Company">Empresa</option>
                          <option value="Individual">Individual</option>
                        </select>
                      )}
                    />
                  </div>

                  <div className="ff-wrap">
                    <label className="ff-label">Tipo Identificación</label>
                    <Controller
                      name="tipoIdentificacion"
                      control={control}
                      render={({ field }) => (
                        <select className="ff-select" value={field.value ?? ''} onChange={field.onChange}>
                          <option value="">Seleccionar</option>
                          {TIPO_IDENTIFICACION.map((t) => (
                            <option key={t.value} value={t.value}>{t.label}</option>
                          ))}
                        </select>
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
                    <label className="ff-label">Grupo de Proveedor</label>
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
                    <p className="ff-hint">Categoría organizativa del proveedor</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ════════════════ COLUMNA DERECHA ════════════════ */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
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
                    <p className="ff-hint">El país se guarda tal cual lo maneja ERPNext (en inglés).</p>
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
                <div className="ff-wrap">
                  <label className="ff-label">Banco</label>
                  <input className="ff-input" {...register('banco')} placeholder="Ej: Banco Popular" />
                </div>
                <div className="ff-wrap">
                  <label className="ff-label">Tipo de Cuenta</label>
                  <Controller
                    name="tipoCuenta"
                    control={control}
                    render={({ field }) => (
                      <select className="ff-select" value={field.value ?? ''} onChange={field.onChange}>
                        <option value="">Seleccionar</option>
                        <option value="Corriente">Corriente</option>
                        <option value="Ahorros">Ahorros</option>
                        <option value="Internacional">Internacional</option>
                      </select>
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

          {/* Defaults de compra */}
          <div className="card">
            <div className="card-header">
              <span className="card-title">Valores por Defecto de Compra</span>
            </div>
            <div className="card-body">
              <div className="form-section">
                <div className="ff-wrap">
                  <label className="ff-label">Tipo de Bienes/Servicios (606) por Defecto</label>
                  <Controller
                    name="defaultTipoBienes606"
                    control={control}
                    render={({ field }) => (
                      <select className="ff-select" value={field.value ?? ''} onChange={field.onChange}>
                        <option value="">Sin configurar</option>
                        {(catalogos?.tipoBienes606 ?? []).map((t) => (
                          <option key={t.value} value={t.value}>{t.label}</option>
                        ))}
                      </select>
                    )}
                  />
                </div>
                <div className="ff-wrap">
                  <label className="ff-label">Forma de Pago (606) por Defecto</label>
                  <Controller
                    name="defaultFormaPago606"
                    control={control}
                    render={({ field }) => (
                      <select className="ff-select" value={field.value ?? ''} onChange={field.onChange}>
                        <option value="">Sin configurar</option>
                        {(catalogos?.formaPago606 ?? []).map((t) => (
                          <option key={t.value} value={t.value}>{t.label}</option>
                        ))}
                      </select>
                    )}
                  />
                </div>
                <div className="ff-wrap">
                  <label className="ff-label">Tipo de Pago por Defecto</label>
                  <Controller
                    name="defaultTipoPagoProveedor"
                    control={control}
                    render={({ field }) => (
                      <select className="ff-select" value={field.value ?? ''} onChange={field.onChange}>
                        <option value="">Sin configurar</option>
                        <option value="Contado">Contado</option>
                        <option value="Crédito">Crédito</option>
                      </select>
                    )}
                  />
                </div>
                <div className="ff-wrap">
                  <label className="ff-label">Cuenta CxP Alterna</label>
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
                  <p className="ff-hint">
                    Si se configura, las compras a este proveedor afectan esta cuenta en vez de la cuenta CxP
                    default de la empresa. Dejar vacío para usar el default.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ════════════════ BOTONES (ancho completo) ════════════════ */}
        <div style={{ gridColumn: '1 / -1', display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button type="button" className="btn btn-secondary" onClick={() => navigate(-1)}>
            Cancelar
          </button>
          <button type="submit" className="btn btn-primary" disabled={isSubmitting}>
            {isSubmitting ? 'Guardando…' : isEdit ? 'Guardar Cambios' : 'Crear Proveedor'}
          </button>
        </div>
      </form>
    </div>
  )
}
