import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm, Controller } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { toast } from 'sonner'
import { getCustomer, createCustomer, updateCustomer, listCustomerGroups } from '@/shared/api/customers'
import { validateRNC, validateCedula, formatRNC, formatCedula } from '@/lib/validators/dgii'
import { SearchSelect, type SearchSelectOption } from '@/shared/ui/SearchSelect'
import { CheckCircle2, XCircle, Info, ArrowLeft, HelpCircle } from 'lucide-react'

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
}).superRefine((data, ctx) => {
  // Only validate if the user filled in the field
  if (data.rnc && !validateRNC(data.rnc.replace(/[-\s]/g, ''))) {
    ctx.addIssue({ code: 'custom', path: ['rnc'], message: 'RNC inválido (dígito verificador)' })
  }
  if (data.cedula && !validateCedula(data.cedula.replace(/[-\s]/g, ''))) {
    ctx.addIssue({ code: 'custom', path: ['cedula'], message: 'Cédula inválida (dígito verificador)' })
  }
})

type FormValues = z.infer<typeof schema>

export default function CustomerForm() {
  const { id } = useParams<{ id?: string }>()
  const isEdit = Boolean(id)
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  // UI-only: which identification field to show
  const [idType, setIdType] = useState<IdType>('RNC')

  const { data: customer, isLoading } = useQuery({
    queryKey: ['customer', id],
    queryFn: () => getCustomer(id!),
    enabled: isEdit,
  })

  const { data: groupsData } = useQuery({
    queryKey: ['customer-groups'],
    queryFn: listCustomerGroups,
  })

  const {
    register, control, handleSubmit, watch, setValue,
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
    },
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
      })
    }
  }, [customer, reset])

  const createMutation = useMutation({
    mutationFn: createCustomer,
    onSuccess: (data) => {
      toast.success('Cliente creado correctamente')
      queryClient.invalidateQueries({ queryKey: ['customers'] })
      navigate(`/clientes/${data.id}`)
    },
    onError: (err: { message?: string }) => {
      toast.error(err?.message ?? 'Error al crear el cliente')
    },
  })

  const updateMutation = useMutation({
    mutationFn: (payload: Partial<FormValues>) => updateCustomer(id!, payload),
    onSuccess: () => {
      toast.success('Cliente actualizado correctamente')
      queryClient.invalidateQueries({ queryKey: ['customers'] })
      queryClient.invalidateQueries({ queryKey: ['customer', id] })
      navigate(`/clientes/${id}`)
    },
    onError: (err: { message?: string }) => {
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
    }
    if (isEdit) updateMutation.mutate(payload)
    else createMutation.mutate(payload)
  }

  const hasCredit = watch('hasCredit')
  const isGovernment = watch('isGovernment')
  const customerGroup = watch('customerGroup')
  const [groupQuery, setGroupQuery] = useState('')
  const [groupLabel, setGroupLabel] = useState('')
  const filteredGroups = (groupsData ?? []).filter((g) => !groupQuery || g.name.toLowerCase().includes(groupQuery.toLowerCase()))
  const groupOptions: SearchSelectOption[] = filteredGroups.map((g) => ({ value: g.name, label: g.name }))
  const selectedGroup = groupsData?.find((g) => g.name === customerGroup)
  const rncValue = watch('rnc') ?? ''
  const cedulaValue = watch('cedula') ?? ''
  const rncClean = rncValue.replace(/[-\s]/g, '')
  const cedulaClean = cedulaValue.replace(/[-\s]/g, '')
  const rncValid = rncClean.length === 9 ? validateRNC(rncClean) : null
  const cedulaValid = cedulaClean.length === 11 ? validateCedula(cedulaClean) : null

  if (isEdit && isLoading) {
    return (
      <div className="page-container">
        <span className="skeleton-box" style={{ width: 200, height: 28, marginBottom: 16 }} />
        <span className="skeleton-box" style={{ display: 'block', width: '100%', height: 260, borderRadius: 'var(--radius-lg)' }} />
      </div>
    )
  }

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <button className="page-back-link" onClick={() => navigate(-1)}>
            <ArrowLeft size={14} aria-hidden="true" /> Volver
          </button>
          <h1 className="page-title">{isEdit ? 'Editar Cliente' : 'Nuevo Cliente'}</h1>
        </div>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} style={{ display: 'flex', flexDirection: 'column', gap: 20, maxWidth: 680 }}>
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
                {errors.rnc && <p className="ff-error">{errors.rnc.message}</p>}
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
                {errors.cedula && <p className="ff-error">{errors.cedula.message}</p>}
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

            {/* Grupo de clientes */}
            <div className="form-row">
              <div className="ff-wrap">
                <label className="ff-label" htmlFor="customerGroup">Grupo de clientes</label>
                <SearchSelect
                  id="customerGroup"
                  value={customerGroup ?? ''}
                  onChange={(v, opt) => {
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
                    <HelpCircle size={13} style={{ color: 'var(--text-tertiary)' }} title="El nivel de precio se hereda del grupo de clientes" />
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

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

        {/* ── Botones ── */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button type="submit" className="btn btn-primary" disabled={isSubmitting}>
            {isSubmitting
              ? <><span className="spinner spinner-white spinner-sm" /> Guardando…</>
              : isEdit ? 'Guardar Cambios' : 'Crear Cliente'}
          </button>
          <button type="button" className="btn btn-ghost" onClick={() => navigate(-1)}>
            Cancelar
          </button>
        </div>
      </form>
    </div>
  )
}
