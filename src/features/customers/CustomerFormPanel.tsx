import { useEffect, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm, useFieldArray, Controller } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { toast } from 'sonner'
import { createCustomer, updateCustomer, listCustomerGroups } from '@/shared/api/customers'
import { listSucursales } from '@/shared/api/sucursales'
import { listMetodosPago, listImpuestosVentas } from '@/shared/api/config'
import { listUsuarios } from '@/shared/api/usuarios'
import type { ApiError, Customer } from '@/shared/api/types'
import { validateRNCDetailed, validateCedulaDetailed, formatRNC, formatCedula } from '@/lib/validators/dgii'
import { SearchSelect, type SearchSelectOption } from '@/shared/ui/SearchSelect'
import { MultiSelectChecklist } from '@/shared/ui/MultiSelectChecklist'
import { AccountSelect } from '@/components/shared/AccountSelect'
import { CheckCircle2, XCircle, Info, HelpCircle, Plus, Trash2 } from 'lucide-react'

// NOTE: tipoIdentificacion does NOT exist in CreateCustomerDto/UpdateCustomerDto.
// It is only used here as a local UI helper to decide which field to show.
type IdType = 'RNC' | 'Cedula' | 'Pasaporte' | 'NIT' | ''

const ID_TYPE_LABELS: Record<string, string> = {
  RNC: 'RNC (empresa)',
  Cedula: 'Cédula',
  Pasaporte: 'Pasaporte',
  NIT: 'NIT (extranjero)',
}

const schema = z.object({
  customerName: z.string().min(1, 'El nombre es requerido'),
  customerType: z.enum(['Company', 'Individual']),
  rnc: z.string().optional(),
  cedula: z.string().optional(),
  isGovernment: z.boolean(),
  hasCredit: z.boolean(),
  creditLimit: z.number().min(0).optional(),
  creditDays: z.number().min(0).optional(),
  emailInvoice: z.string().email('Email inválido').optional().or(z.literal('')),
  customerGroup: z.string().optional(),
  address: z.string().optional(),
  telefonos: z.array(z.object({
    telefono: z.string().min(1, 'Requerido'),
    etiqueta: z.string().optional(),
  })).optional(),
  branch: z.string().optional(),
  formaPagoDefault: z.string().optional(),
  cuentaCxcDefault: z.string().optional(),
  encargadoCxc: z.string().email('Email inválido').optional().or(z.literal('')),
  impuestoVentasDefault: z.array(z.string()).optional(),
}).superRefine((data, ctx) => {
  // Only validate if the user filled in the field
  if (data.rnc) {
    const result = validateRNCDetailed(data.rnc)
    if (!result.valid) {
      ctx.addIssue({ code: 'custom', path: ['rnc'], message: result.reason ?? 'RNC inválido' })
    }
  }
  if (data.cedula) {
    const result = validateCedulaDetailed(data.cedula)
    if (!result.valid) {
      ctx.addIssue({ code: 'custom', path: ['cedula'], message: result.reason ?? 'Cédula inválida' })
    }
  }
})

type FormValues = z.infer<typeof schema>

export interface CustomerFormPanelProps {
  /** Si se pasa, el formulario opera en modo edición contra este cliente. */
  customer?: Customer
  onSuccess: (customer: Customer) => void
  onCancel: () => void
}

export function CustomerFormPanel({ customer, onSuccess, onCancel }: CustomerFormPanelProps) {
  const isEdit = Boolean(customer)
  const queryClient = useQueryClient()

  // UI-only: which identification field to show
  const [idType, setIdType] = useState<IdType>('RNC')

  const { data: groupsData } = useQuery({
    queryKey: ['customer-groups'],
    queryFn: listCustomerGroups,
  })

  const { data: sucursalesData } = useQuery({
    queryKey: ['sucursales-all'],
    queryFn: () => listSucursales({ limit: 100 }),
    staleTime: 60_000,
  })
  const [branchQuery, setBranchQuery] = useState('')
  const branchOptions: SearchSelectOption[] = (sucursalesData?.items ?? [])
    .filter((s) => !branchQuery || s.name.toLowerCase().includes(branchQuery.toLowerCase()))
    .map((s) => ({ value: s.name, label: s.name }))

  const { data: metodosPagoData } = useQuery({
    queryKey: ['metodos-pago'],
    queryFn: listMetodosPago,
    staleTime: 60_000,
  })
  const [formaPagoQuery, setFormaPagoQuery] = useState('')
  const formaPagoOptions: SearchSelectOption[] = (metodosPagoData ?? [])
    .filter((m) => !m.disabled)
    .filter((m) => !formaPagoQuery || m.name.toLowerCase().includes(formaPagoQuery.toLowerCase()))
    .map((m) => ({ value: m.name, label: m.name }))

  const { data: impuestosVentasData } = useQuery({
    queryKey: ['impuestos-ventas'],
    queryFn: listImpuestosVentas,
    staleTime: 5 * 60_000,
  })
  const [impuestoVentasSearch, setImpuestoVentasSearch] = useState('')

  const { data: usuariosData } = useQuery({
    queryKey: ['usuarios-all'],
    queryFn: () => listUsuarios({ limit: 100 }),
    staleTime: 60_000,
  })
  const [encargadoQuery, setEncargadoQuery] = useState('')
  const encargadoOptions: SearchSelectOption[] = (usuariosData?.items ?? [])
    .filter((u) => !encargadoQuery || u.fullName.toLowerCase().includes(encargadoQuery.toLowerCase()) || u.email.toLowerCase().includes(encargadoQuery.toLowerCase()))
    .map((u) => ({ value: u.email, label: u.fullName, sublabel: u.email }))

  const {
    register, control, handleSubmit, watch, setValue, setError,
    formState: { errors, isSubmitting }, reset,
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      customerName: '',
      customerType: 'Company',
      rnc: '',
      cedula: '',
      isGovernment: false,
      hasCredit: false,
      creditLimit: 0,
      creditDays: 30,
      emailInvoice: '',
      customerGroup: '',
      address: '',
      telefonos: [],
      branch: '',
      formaPagoDefault: '',
      cuentaCxcDefault: '',
      encargadoCxc: '',
      impuestoVentasDefault: [],
    },
  })

  const { fields: telefonoFields, append: appendTelefono, remove: removeTelefono } = useFieldArray({
    control,
    name: 'telefonos',
  })

  useEffect(() => {
    if (customer) {
      // Set UI idType based on what data exists
      if (customer.rnc) setIdType('RNC')
      else if (customer.cedula) setIdType('Cedula')
      reset({
        customerName: customer.customerName,
        customerType: customer.customerType,
        rnc: customer.rnc ?? '',
        cedula: customer.cedula ?? '',
        isGovernment: customer.isGovernment,
        hasCredit: customer.hasCredit,
        creditLimit: customer.creditLimit,
        creditDays: customer.creditDays,
        emailInvoice: customer.emailInvoice ?? '',
        customerGroup: customer.customerGroup ?? '',
        address: customer.address ?? '',
        telefonos: customer.telefonos ?? [],
        branch: customer.branch ?? '',
        formaPagoDefault: customer.formaPagoDefault ?? '',
        cuentaCxcDefault: customer.cuentaCxcDefault ?? '',
        encargadoCxc: customer.encargadoCxc ?? '',
        impuestoVentasDefault: customer.impuestoVentasDefault ?? [],
      })
    }
  }, [customer, reset])

  const createMutation = useMutation({
    mutationFn: createCustomer,
    onSuccess: (data) => {
      toast.success('Cliente creado correctamente')
      queryClient.invalidateQueries({ queryKey: ['customers'] })
      onSuccess(data)
    },
    onError: (err: ApiError) => {
      if (err?.statusCode === 409) {
        toast.error(err.message)
        setError(idType === 'Cedula' ? 'cedula' : 'rnc', { type: 'manual', message: err.message })
        return
      }
      toast.error(err?.message ?? 'Error al crear el cliente')
    },
  })

  const updateMutation = useMutation({
    mutationFn: (payload: Partial<FormValues>) => updateCustomer(customer!.id, payload),
    onSuccess: (data) => {
      toast.success('Cliente actualizado correctamente')
      queryClient.invalidateQueries({ queryKey: ['customers'] })
      queryClient.invalidateQueries({ queryKey: ['customer', customer!.id] })
      onSuccess(data)
    },
    onError: (err: ApiError) => {
      if (err?.statusCode === 409) {
        toast.error(err.message)
        setError(idType === 'Cedula' ? 'cedula' : 'rnc', { type: 'manual', message: err.message })
        return
      }
      toast.error(err?.message ?? 'Error al actualizar el cliente')
    },
  })

  const onSubmit = (values: FormValues) => {
    // Build payload — DO NOT include tipoIdentificacion (field doesn't exist in BFF)
    const payload = {
      customerName: values.customerName,
      customerType: values.customerType,
      rnc: idType === 'RNC' && values.rnc ? values.rnc.replace(/[-\s]/g, '') : undefined,
      cedula: idType === 'Cedula' && values.cedula ? values.cedula.replace(/[-\s]/g, '') : undefined,
      isGovernment: values.isGovernment,
      hasCredit: values.hasCredit,
      creditLimit: values.hasCredit ? values.creditLimit : undefined,
      creditDays: values.hasCredit ? values.creditDays : undefined,
      emailInvoice: values.emailInvoice || undefined,
      customerGroup: values.customerGroup || undefined,
      address: values.address || undefined,
      // Se manda la lista completa siempre — no hay "agregar un teléfono" a nivel de API.
      telefonos: values.telefonos && values.telefonos.length > 0 ? values.telefonos : undefined,
      branch: values.branch || undefined,
      formaPagoDefault: values.formaPagoDefault || undefined,
      cuentaCxcDefault: values.cuentaCxcDefault || undefined,
      encargadoCxc: values.encargadoCxc || undefined,
      impuestoVentasDefault: values.impuestoVentasDefault ?? [],
    }
    if (isEdit) updateMutation.mutate(payload)
    else createMutation.mutate(payload)
  }

  const hasCredit = watch('hasCredit')
  const isGovernment = watch('isGovernment')
  const customerType = watch('customerType')
  const customerGroup = watch('customerGroup')
  const isSystemManaged = Boolean(customer?.isSystemManaged)

  // Si el cliente es Empresa, la identificación siempre es RNC — se fuerza y se bloquea el selector.
  useEffect(() => {
    if (customerType === 'Company' && idType !== 'RNC') {
      setIdType('RNC')
      setValue('cedula', '')
    }
  }, [customerType, idType, setValue])
  const [groupQuery, setGroupQuery] = useState('')
  const [groupLabel, setGroupLabel] = useState('')
  const filteredGroups = (groupsData ?? []).filter((g) => !groupQuery || g.name.toLowerCase().includes(groupQuery.toLowerCase()))
  const groupOptions: SearchSelectOption[] = filteredGroups.map((g) => ({ value: g.name, label: g.name }))
  const selectedGroup = groupsData?.find((g) => g.name === customerGroup)
  const rncValue = watch('rnc') ?? ''
  const cedulaValue = watch('cedula') ?? ''
  const rncClean = rncValue.replace(/[-\s]/g, '')
  const cedulaClean = cedulaValue.replace(/[-\s]/g, '')
  const rncDetail = rncClean ? validateRNCDetailed(rncClean) : null
  const cedulaDetail = cedulaClean ? validateCedulaDetailed(cedulaClean) : null
  const rncValid = rncClean.length === 9 ? (rncDetail?.valid ?? null) : null
  const cedulaValid = cedulaClean.length === 11 ? (cedulaDetail?.valid ?? null) : null

  return (
    <form onSubmit={handleSubmit(onSubmit)} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, alignItems: 'start' }}>
      {isSystemManaged && (
        <div className="inline-alert inline-alert-info" style={{ gridColumn: '1 / -1' }}>
          <Info size={14} aria-hidden="true" style={{ flexShrink: 0 }} />
          Este cliente es gestionado por el sistema y no puede ser editado.
        </div>
      )}

      {/* ════════════════ COLUMNA IZQUIERDA ════════════════ */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* ── Información general ── */}
      <div className="card">
        <div className="card-header">
          <h2 className="card-title">Información General</h2>
        </div>
        <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* Nombre */}
          <div className="ff-wrap">
            <label className="ff-label" htmlFor="customerName">
              Nombre <span className="ff-required">*</span>
            </label>
            <input
              id="customerName"
              className={`ff-input${errors.customerName ? ' ff-input-error' : ''}`}
              placeholder="Nombre del cliente o empresa"
              {...register('customerName')}
            />
            {errors.customerName && <p className="ff-error">{errors.customerName.message}</p>}
          </div>

          {/* Tipo + Identificación selector */}
          <div className="form-row">
            <div className="ff-wrap">
              <label className="ff-label">Tipo de cliente</label>
              <Controller
                name="customerType"
                control={control}
                render={({ field }) => (
                  <SearchSelect
                    id="customerType"
                    value={field.value}
                    onChange={(v) => field.onChange(v)}
                    options={[
                      { value: 'Company', label: 'Empresa' },
                      { value: 'Individual', label: 'Individual' },
                    ]}
                    selectedLabel={field.value === 'Company' ? 'Empresa' : field.value === 'Individual' ? 'Individual' : ''}
                    onSearch={() => {}}
                    placeholder="Seleccionar…"
                  />
                )}
              />
            </div>

            <div className="ff-wrap">
              <label className="ff-label">Tipo de identificación</label>
              <SearchSelect
                value={idType}
                onChange={(v) => {
                  setIdType(v as IdType)
                  setValue('rnc', '')
                  setValue('cedula', '')
                }}
                options={[
                  { value: '', label: 'Sin identificación' },
                  { value: 'RNC', label: 'RNC (empresa)' },
                  { value: 'Cedula', label: 'Cédula' },
                  { value: 'Pasaporte', label: 'Pasaporte' },
                  { value: 'NIT', label: 'NIT (extranjero)' },
                ]}
                selectedLabel={idType ? ID_TYPE_LABELS[idType] : ''}
                disabled={customerType === 'Company'}
                onSearch={() => {}}
                placeholder="Seleccionar…"
              />
            </div>
          </div>

          {/* RNC */}
          {idType === 'RNC' && (
            <div className="ff-wrap">
              <label className="ff-label" htmlFor="rnc">RNC</label>
              <div className="ff-input-wrap">
                <input
                  id="rnc"
                  className={`ff-input${errors.rnc ? ' ff-input-error' : ''}`}
                  placeholder="Ej: 130-12345-6"
                  value={rncValue}
                  onChange={(e) => {
                    setValue('rnc', formatRNC(e.target.value), { shouldValidate: true })
                  }}
                />
                {rncValid !== null && (
                  <span className="ff-validation-icon">
                    {rncValid
                      ? <CheckCircle2 size={15} style={{ color: 'var(--success-text)' }} />
                      : <XCircle size={15} style={{ color: 'var(--error-text)' }} />}
                  </span>
                )}
              </div>
              {errors.rnc
                ? <p className="ff-error">{errors.rnc.message}</p>
                : rncDetail && !rncDetail.valid && (
                  <p className="ff-error">{rncDetail.reason}</p>
                )}
            </div>
          )}

          {/* Cédula */}
          {idType === 'Cedula' && (
            <div className="ff-wrap">
              <label className="ff-label" htmlFor="cedula">Cédula</label>
              <div className="ff-input-wrap">
                <input
                  id="cedula"
                  className={`ff-input${errors.cedula ? ' ff-input-error' : ''}`}
                  placeholder="Ej: 001-1234567-8"
                  value={cedulaValue}
                  onChange={(e) => {
                    setValue('cedula', formatCedula(e.target.value), { shouldValidate: true })
                  }}
                />
                {cedulaValid !== null && (
                  <span className="ff-validation-icon">
                    {cedulaValid
                      ? <CheckCircle2 size={15} style={{ color: 'var(--success-text)' }} />
                      : <XCircle size={15} style={{ color: 'var(--error-text)' }} />}
                  </span>
                )}
              </div>
              {errors.cedula
                ? <p className="ff-error">{errors.cedula.message}</p>
                : cedulaDetail && !cedulaDetail.valid && (
                  <p className="ff-error">{cedulaDetail.reason}</p>
                )}
            </div>
          )}

          {/* Email para facturas */}
          <div className="ff-wrap">
            <label className="ff-label" htmlFor="emailInvoice">Email para facturas</label>
            <input
              id="emailInvoice"
              type="email"
              className={`ff-input${errors.emailInvoice ? ' ff-input-error' : ''}`}
              placeholder="facturas@empresa.com"
              {...register('emailInvoice')}
            />
            {errors.emailInvoice && <p className="ff-error">{errors.emailInvoice.message}</p>}
          </div>

          {/* Dirección */}
          <div className="ff-wrap">
            <label className="ff-label" htmlFor="address">Dirección</label>
            <input
              id="address"
              className="ff-input"
              placeholder="Calle, número, sector, ciudad…"
              {...register('address')}
            />
          </div>

          {/* Grupo de clientes */}
          <div className="form-row">
            <div className="ff-wrap">
              <label className="ff-label" htmlFor="customerGroup">Grupo de clientes</label>
              <SearchSelect
                id="customerGroup"
                value={customerGroup ?? ''}
                onChange={(_, opt) => {
                  setValue('customerGroup', opt?.value ?? '')
                  setGroupLabel(opt?.label ?? '')
                }}
                options={groupOptions}
                selectedLabel={groupLabel}
                onSearch={setGroupQuery}
                placeholder="Buscar grupo…"
              />
            </div>
            {selectedGroup && selectedGroup.priceTier && (
              <div className="ff-wrap">
                <label className="ff-label">Nivel de precio</label>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, height: 36 }}>
                  <span className="badge" style={{ background: 'var(--accent-bg)', color: 'var(--accent)' }}>
                    Nivel {selectedGroup.priceTier}
                  </span>
                  <HelpCircle size={13} style={{ color: 'var(--text-tertiary)' }} />
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Teléfonos ── */}
      <div className="card">
        <div className="card-header">
          <h2 className="card-title">Teléfonos</h2>
        </div>
        <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {telefonoFields.map((field, idx) => (
            <div key={field.id} className="form-row" style={{ alignItems: 'flex-start' }}>
              <div className="ff-wrap" style={{ flex: 2 }}>
                <input
                  className={`ff-input${errors.telefonos?.[idx]?.telefono ? ' ff-input-error' : ''}`}
                  placeholder="Ej: 809-555-0100"
                  {...register(`telefonos.${idx}.telefono` as const)}
                />
                {errors.telefonos?.[idx]?.telefono && (
                  <p className="ff-error">{errors.telefonos[idx]?.telefono?.message}</p>
                )}
              </div>
              <div className="ff-wrap" style={{ flex: 1 }}>
                <input
                  className="ff-input"
                  placeholder="Etiqueta (ej: Oficina, Celular)"
                  {...register(`telefonos.${idx}.etiqueta` as const)}
                />
              </div>
              <button
                type="button"
                className="btn btn-ghost btn-size-sm"
                style={{ marginTop: 2 }}
                onClick={() => removeTelefono(idx)}
                title="Quitar teléfono"
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
          <button
            type="button"
            className="btn btn-secondary btn-size-sm"
            style={{ alignSelf: 'flex-start' }}
            onClick={() => appendTelefono({ telefono: '', etiqueta: '' })}
          >
            <Plus size={14} />Agregar teléfono
          </button>
        </div>
      </div>
      </div>

      {/* ════════════════ COLUMNA DERECHA ════════════════ */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* ── Crédito y configuración ── */}
      <div className="card">
        <div className="card-header">
          <h2 className="card-title">Crédito y Configuración</h2>
        </div>
        <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

          <Controller
            name="isGovernment"
            control={control}
            render={({ field }) => (
              <label className="ff-check-wrap">
                <input type="checkbox" className="ff-check" checked={field.value} onChange={field.onChange} />
                <span style={{ fontSize: 13 }}>Es entidad de Gobierno</span>
              </label>
            )}
          />

          {isGovernment && (
            <div className="inline-alert inline-alert-info">
              <Info size={14} aria-hidden="true" style={{ flexShrink: 0 }} />
              Aplica NCF tipo <strong>B15 — Gubernamental</strong> en facturas.
            </div>
          )}

          <Controller
            name="hasCredit"
            control={control}
            render={({ field }) => (
              <label className="ff-check-wrap">
                <input type="checkbox" className="ff-check" checked={field.value} onChange={field.onChange} />
                <span style={{ fontSize: 13 }}>Tiene crédito</span>
              </label>
            )}
          />

          {hasCredit && (
            <div className="form-row" style={{ paddingLeft: 22 }}>
              <div className="ff-wrap">
                <label className="ff-label" htmlFor="creditLimit">Límite de Crédito (RD$)</label>
                <input
                  id="creditLimit"
                  type="number"
                  min={0}
                  step={0.01}
                  className={`ff-input${errors.creditLimit ? ' ff-input-error' : ''}`}
                  {...register('creditLimit', { valueAsNumber: true })}
                />
                {errors.creditLimit && <p className="ff-error">{errors.creditLimit.message}</p>}
              </div>
              <div className="ff-wrap">
                <label className="ff-label" htmlFor="creditDays">Días de Crédito</label>
                <input
                  id="creditDays"
                  type="number"
                  min={0}
                  className={`ff-input${errors.creditDays ? ' ff-input-error' : ''}`}
                  {...register('creditDays', { valueAsNumber: true })}
                />
                {errors.creditDays && <p className="ff-error">{errors.creditDays.message}</p>}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Configuración Adicional ── */}
      <div className="card">
        <div className="card-header">
          <h2 className="card-title">Configuración Adicional</h2>
        </div>
        <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="form-row">
            <div className="ff-wrap">
              <label className="ff-label" htmlFor="branch">Sucursal</label>
              <Controller
                name="branch"
                control={control}
                render={({ field }) => (
                  <SearchSelect
                    id="branch"
                    value={field.value ?? ''}
                    onChange={field.onChange}
                    options={branchOptions}
                    onSearch={setBranchQuery}
                    placeholder="Buscar sucursal…"
                  />
                )}
              />
              <p className="ff-hint">Solo para filtrar/agrupar clientes — no afecta las facturas.</p>
            </div>
            <div className="ff-wrap">
              <label className="ff-label" htmlFor="formaPagoDefault">Forma de Pago por Defecto</label>
              <Controller
                name="formaPagoDefault"
                control={control}
                render={({ field }) => (
                  <SearchSelect
                    id="formaPagoDefault"
                    value={field.value ?? ''}
                    onChange={field.onChange}
                    options={formaPagoOptions}
                    onSearch={setFormaPagoQuery}
                    placeholder="Buscar método de pago…"
                  />
                )}
              />
              <p className="ff-hint">Prellena el método de pago al facturar a este cliente — editable por documento.</p>
            </div>
          </div>

          <div className="form-row">
            <div className="ff-wrap">
              <label className="ff-label" htmlFor="cuentaCxcDefault">Cuenta CxC Alterna</label>
              <Controller
                name="cuentaCxcDefault"
                control={control}
                render={({ field }) => (
                  <AccountSelect
                    id="cuentaCxcDefault"
                    value={field.value ?? ''}
                    onChange={field.onChange}
                    rootType="Asset"
                    placeholder="Buscar cuenta…"
                  />
                )}
              />
              <p className="ff-hint">
                Si se omite, se usa el default de la compañía (112-01 - CUENTAS POR COBRAR CLIENTES).
              </p>
            </div>
            <div className="ff-wrap">
              <label className="ff-label" htmlFor="encargadoCxc">Encargado de Cuentas por Cobrar</label>
              <Controller
                name="encargadoCxc"
                control={control}
                render={({ field }) => (
                  <SearchSelect
                    id="encargadoCxc"
                    value={field.value ?? ''}
                    onChange={field.onChange}
                    options={encargadoOptions}
                    onSearch={setEncargadoQuery}
                    placeholder="Buscar usuario…"
                  />
                )}
              />
              {errors.encargadoCxc && <p className="ff-error">{errors.encargadoCxc.message}</p>}
            </div>
          </div>

          <div className="ff-wrap">
            <label className="ff-label">Impuesto(s) de Venta por Defecto</label>
            <Controller
              name="impuestoVentasDefault"
              control={control}
              render={({ field }) => (
                <MultiSelectChecklist
                  value={field.value ?? []}
                  onChange={field.onChange}
                  options={(impuestosVentasData ?? []).map((t) => ({ id: t.id, label: t.title }))}
                  search={impuestoVentasSearch}
                  onSearchChange={setImpuestoVentasSearch}
                  searchPlaceholder="Buscar plantilla…"
                  emptyLabel="No hay plantillas configuradas."
                />
              )}
            />
            <p className="ff-hint">
              Prellena el/los template(s) de impuesto al crear una factura/cotización a este cliente — puedes elegir varios.
            </p>
          </div>
        </div>
      </div>
      </div>

      {/* ── Botones ── */}
      <div style={{ gridColumn: '1 / -1', display: 'flex', alignItems: 'center', gap: 12 }}>
        <button type="submit" className="btn btn-primary" disabled={isSubmitting || isSystemManaged}>
          {isSubmitting
            ? <><span className="spinner spinner-white spinner-sm" /> Guardando…</>
            : isEdit ? 'Guardar Cambios' : 'Crear Cliente'}
        </button>
        <button type="button" className="btn btn-ghost" onClick={onCancel}>
          Cancelar
        </button>
      </div>
    </form>
  )
}
