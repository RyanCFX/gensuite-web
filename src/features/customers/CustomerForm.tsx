import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm, Controller } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { toast } from 'sonner'
import { getCustomer, createCustomer, updateCustomer } from '@/shared/api/customers'
import { validateRNC, validateCedula, formatRNC, formatCedula } from '@/lib/validators/dgii'
import { CheckCircle2, XCircle, Info, ArrowLeft } from 'lucide-react'

// NOTE: tipoIdentificacion does NOT exist in CreateCustomerDto/UpdateCustomerDto.
// It is only used here as a local UI helper to decide which field to show.
type IdType = 'RNC' | 'Cedula' | 'Pasaporte' | 'NIT' | ''

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
    }
    if (isEdit) updateMutation.mutate(payload)
    else createMutation.mutate(payload)
  }

  const hasCredit = watch('hasCredit')
  const isGovernment = watch('isGovernment')
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
                    <select className="ff-select" value={field.value} onChange={field.onChange}>
                      <option value="Company">Empresa</option>
                      <option value="Individual">Individual</option>
                    </select>
                  )}
                />
              </div>

              <div className="ff-wrap">
                <label className="ff-label">Tipo de identificación</label>
                <select
                  className="ff-select"
                  value={idType}
                  onChange={(e) => {
                    setIdType(e.target.value as IdType)
                    setValue('rnc', '')
                    setValue('cedula', '')
                  }}
                >
                  <option value="">Sin identificación</option>
                  <option value="RNC">RNC (empresa)</option>
                  <option value="Cedula">Cédula</option>
                  <option value="Pasaporte">Pasaporte</option>
                  <option value="NIT">NIT (extranjero)</option>
                </select>
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
