import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useForm, useFieldArray, Controller } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { toast } from 'sonner'
import { createAseguradora, updateAseguradora, nombreAseguradora } from '@/shared/api/aseguradoras'
import { listUsuarios } from '@/shared/api/usuarios'
import type { ApiError, Aseguradora } from '@/shared/api/types'
import { validateRNCDetailed, formatRNC } from '@/lib/validators/dgii'
import { SearchSelect, type SearchSelectOption } from '@/shared/ui/SearchSelect'
import { AccountSelect } from '@/components/shared/AccountSelect'
import { Info, Plus, Trash2 } from 'lucide-react'
import { useBeforeUnloadWarning } from '@/shared/hooks/useBeforeUnloadWarning'

const schema = z.object({
  nombre: z.string().min(1, 'El nombre es requerido'),
  rnc: z.string().min(1, 'El RNC es requerido'),
  email: z.string().email('Email inválido').optional().or(z.literal('')),
  phone: z.string().optional(),
  address: z.string().optional(),
  hasCredit: z.boolean(),
  creditLimit: z.number().min(0).optional(),
  creditDays: z.number().min(0).optional(),
  cuentaCxcDefault: z.string().optional(),
  encargadoCxc: z.string().email('Email inválido').optional().or(z.literal('')),
  telefonos: z.array(z.object({
    telefono: z.string().min(1, 'Requerido'),
    etiqueta: z.string().optional(),
  })).optional(),
}).superRefine((data, ctx) => {
  const result = validateRNCDetailed(data.rnc)
  if (!result.valid) {
    ctx.addIssue({ code: 'custom', path: ['rnc'], message: result.reason ?? 'RNC inválido' })
  }
})

type FormValues = z.infer<typeof schema>

export interface AseguradoraFormPanelProps {
  /** Si se pasa, el formulario opera en modo edición contra esta aseguradora. */
  aseguradora?: Aseguradora
  onSuccess: (aseguradora: Aseguradora) => void
  onCancel: () => void
}

export function AseguradoraFormPanel({ aseguradora, onSuccess, onCancel }: AseguradoraFormPanelProps) {
  const isEdit = Boolean(aseguradora)
  const queryClient = useQueryClient()

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
    formState: { errors, isSubmitting, isDirty }, reset,
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      nombre: '',
      rnc: '',
      email: '',
      phone: '',
      address: '',
      // Una ARS creada desde esta pantalla debe poder facturar un lote — por eso el default es true.
      hasCredit: true,
      creditLimit: 0,
      creditDays: 30,
      cuentaCxcDefault: '',
      encargadoCxc: '',
      telefonos: [],
    },
  })

  const { fields: telefonoFields, append: appendTelefono, remove: removeTelefono } = useFieldArray({
    control,
    name: 'telefonos',
  })

  useBeforeUnloadWarning(isDirty)

  useEffect(() => {
    if (aseguradora) {
      reset({
        nombre: nombreAseguradora(aseguradora),
        rnc: aseguradora.rnc ?? '',
        email: aseguradora.email ?? '',
        phone: aseguradora.phone ?? '',
        address: aseguradora.address ?? '',
        hasCredit: aseguradora.hasCredit,
        creditLimit: aseguradora.creditLimit,
        creditDays: aseguradora.creditDays,
        cuentaCxcDefault: aseguradora.cuentaCxcDefault ?? '',
        encargadoCxc: aseguradora.encargadoCxc ?? '',
        telefonos: aseguradora.telefonos ?? [],
      })
    }
  }, [aseguradora, reset])

  const createMutation = useMutation({
    mutationFn: createAseguradora,
    onSuccess: (data) => {
      toast.success('Aseguradora creada correctamente')
      queryClient.invalidateQueries({ queryKey: ['aseguradoras'] })
      onSuccess(data)
    },
    onError: (err: ApiError) => {
      if (err?.statusCode === 409) {
        toast.error(err.message)
        setError('rnc', { type: 'manual', message: err.message })
        return
      }
      toast.error(err?.message ?? 'Error al crear la aseguradora')
    },
  })

  const updateMutation = useMutation({
    mutationFn: (payload: Partial<FormValues>) => updateAseguradora(aseguradora!.id, payload),
    onSuccess: (data) => {
      toast.success('Aseguradora actualizada correctamente')
      queryClient.invalidateQueries({ queryKey: ['aseguradoras'] })
      queryClient.invalidateQueries({ queryKey: ['aseguradora', aseguradora!.id] })
      onSuccess(data)
    },
    onError: (err: ApiError) => {
      if (err?.statusCode === 409) {
        toast.error(err.message)
        setError('rnc', { type: 'manual', message: err.message })
        return
      }
      toast.error(err?.message ?? 'Error al actualizar la aseguradora')
    },
  })

  const onSubmit = (values: FormValues) => {
    const payload = {
      nombre: values.nombre,
      rnc: values.rnc.replace(/[-\s]/g, ''),
      email: values.email || undefined,
      phone: values.phone || undefined,
      address: values.address || undefined,
      hasCredit: values.hasCredit,
      creditLimit: values.hasCredit ? values.creditLimit : undefined,
      creditDays: values.hasCredit ? values.creditDays : undefined,
      cuentaCxcDefault: values.cuentaCxcDefault || undefined,
      encargadoCxc: values.encargadoCxc || undefined,
      telefonos: values.telefonos && values.telefonos.length > 0 ? values.telefonos : undefined,
    }
    if (isEdit) updateMutation.mutate(payload)
    else createMutation.mutate(payload as Parameters<typeof createAseguradora>[0])
  }

  const hasCredit = watch('hasCredit')
  const rncValue = watch('rnc') ?? ''

  return (
    <form onSubmit={handleSubmit(onSubmit)} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20, alignItems: 'start' }}>
      {/* ════════════════ COLUMNA IZQUIERDA ════════════════ */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        <div className="card">
          <div className="card-header">
            <h2 className="card-title">Información General</h2>
          </div>
          <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div className="ff-wrap">
              <label className="ff-label" htmlFor="rnc">RNC <span className="ff-required">*</span></label>
              <input
                id="rnc"
                className={`ff-input${errors.rnc ? ' ff-input-error' : ''}`}
                placeholder="Ej: 130-12345-6"
                value={rncValue}
                onChange={(e) => setValue('rnc', formatRNC(e.target.value), { shouldValidate: true, shouldDirty: true })}
              />
              {errors.rnc && <p className="ff-error">{errors.rnc.message}</p>}
            </div>

            <div className="ff-wrap">
              <label className="ff-label" htmlFor="nombre">Nombre <span className="ff-required">*</span></label>
              <input
                id="nombre"
                className={`ff-input${errors.nombre ? ' ff-input-error' : ''}`}
                placeholder="Nombre de la aseguradora"
                {...register('nombre')}
              />
              {errors.nombre && <p className="ff-error">{errors.nombre.message}</p>}
            </div>

            <div className="ff-wrap">
              <label className="ff-label" htmlFor="email">Email</label>
              <input
                id="email"
                type="email"
                className={`ff-input${errors.email ? ' ff-input-error' : ''}`}
                placeholder="facturas@aseguradora.com"
                {...register('email')}
              />
              {errors.email && <p className="ff-error">{errors.email.message}</p>}
            </div>

            <div className="ff-wrap">
              <label className="ff-label" htmlFor="phone">Teléfono</label>
              <input id="phone" className="ff-input" placeholder="Ej: 809-555-0100" {...register('phone')} />
            </div>

            <div className="ff-wrap">
              <label className="ff-label" htmlFor="address">Dirección</label>
              <input id="address" className="ff-input" placeholder="Calle, número, sector, ciudad…" {...register('address')} />
            </div>
          </div>
        </div>

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
                    placeholder="Etiqueta (ej: Oficina, Cobros)"
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
        <div className="card">
          <div className="card-header">
            <h2 className="card-title">Crédito y Configuración</h2>
          </div>
          <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
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

            {!hasCredit && (
              <div className="inline-alert inline-alert-info">
                <Info size={14} aria-hidden="true" style={{ flexShrink: 0 }} />
                Sin crédito habilitado no se podrá facturar un lote consolidado a esta aseguradora.
              </div>
            )}

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
                Cuenta contable al facturar el lote consolidado. Si se omite, se usa el default de la compañía.
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
        </div>
      </div>

      {/* ── Botones ── */}
      <div style={{ gridColumn: '1 / -1', display: 'flex', alignItems: 'center', gap: 12 }}>
        <button type="submit" className="btn btn-primary" disabled={isSubmitting}>
          {isSubmitting
            ? <><span className="spinner spinner-white spinner-sm" /> Guardando…</>
            : isEdit ? 'Guardar Cambios' : 'Crear Aseguradora'}
        </button>
        <button type="button" className="btn btn-ghost" onClick={onCancel}>
          Cancelar
        </button>
      </div>
    </form>
  )
}
