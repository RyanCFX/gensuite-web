import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm, Controller } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { toast } from 'sonner'
import {
  listCuentasPorPagar,
  createCuentaPorPagar,
  updateCuentaPorPagar,
  deleteCuentaPorPagar,
} from '@/shared/api/catalog'
import { getCatalogosFiscales } from '@/shared/api/config'
import type { CuentaPorPagar, CreateCuentaPorPagarDto, TipoDocumentoCuentaPorPagar } from '@/shared/api/types'
import { Plus, Pencil, Ban, Search } from 'lucide-react'
import { useSortState } from '@/shared/hooks/useSortState'
import { SortableTh } from '@/shared/ui/SortableTh'
import { SearchSelect } from '@/shared/ui/SearchSelect'
import type { SearchSelectOption } from '@/shared/ui/SearchSelect'
import { AccountSelect } from '@/components/shared/AccountSelect'
import { Select, SelectItem } from '@/components/ui/select'
import { ConfirmModal } from '@/shared/ui/Modal'
import { useConfirmClose } from '@/shared/hooks/useConfirmClose'

const TIPO_DOCUMENTO_OPTIONS: TipoDocumentoCuentaPorPagar[] = [
  'Factura',
  'Pago',
  'Nota de Crédito',
  'Nota de Débito',
  'Devolución',
]

const cuentaPorPagarSchema = z.object({
  titulo: z.string().min(1, 'El título es requerido'),
  descripcion: z.string().optional(),
  tipoDocumento: z.enum(['Factura', 'Pago', 'Nota de Crédito', 'Nota de Débito', 'Devolución']),
  cuenta: z.string().optional(),
  tipoBienes606: z.string().optional(),
  claseFiscal: z.string().optional(),
})

type FormValues = z.infer<typeof cuentaPorPagarSchema>

const emptyValues: FormValues = {
  titulo: '',
  descripcion: '',
  tipoDocumento: 'Factura',
  cuenta: '',
  tipoBienes606: '',
  claseFiscal: '',
}

export default function CuentasPorPagarPage() {
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<CuentaPorPagar | null>(null)
  const [toDisable, setToDisable] = useState<CuentaPorPagar | null>(null)
  const { orderBy, sort } = useSortState()

  const { data, isLoading, isError } = useQuery({
    queryKey: ['cuentas-por-pagar', { search, orderBy }],
    queryFn: () => listCuentasPorPagar({ search: search || undefined, limit: 100, orderBy: orderBy || undefined }),
  })

  const { data: catalogos } = useQuery({
    queryKey: ['catalogos-fiscales'],
    queryFn: getCatalogosFiscales,
    staleTime: 60 * 60_000,
  })
  const [claseFiscalSearch, setClaseFiscalSearch] = useState('')
  const claseFiscalOptions: SearchSelectOption[] = (catalogos?.tipoBienes606 ?? [])
    .filter((t) => !claseFiscalSearch || t.label.toLowerCase().includes(claseFiscalSearch.toLowerCase()))
    .map((t) => ({ value: t.value, label: t.label }))

  const {
    register,
    control,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<FormValues>({
    resolver: zodResolver(cuentaPorPagarSchema),
    defaultValues: emptyValues,
  })

  const { requestClose, confirming, confirmDiscard, cancelDiscard } = useConfirmClose(isDirty, closeDialog)

  const createMutation = useMutation({
    mutationFn: createCuentaPorPagar,
    onSuccess: () => {
      toast.success('Concepto creado')
      queryClient.invalidateQueries({ queryKey: ['cuentas-por-pagar'] })
      closeDialog()
    },
    onError: (err: { message?: string }) => toast.error(err?.message ?? 'Error al crear el concepto'),
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<CreateCuentaPorPagarDto> }) => updateCuentaPorPagar(id, data),
    onSuccess: () => {
      toast.success('Concepto actualizado')
      queryClient.invalidateQueries({ queryKey: ['cuentas-por-pagar'] })
      closeDialog()
    },
    onError: (err: { message?: string }) => toast.error(err?.message ?? 'Error al actualizar'),
  })

  const disableMutation = useMutation({
    mutationFn: (id: string) => deleteCuentaPorPagar(id),
    onSuccess: () => {
      toast.success('Concepto desactivado')
      queryClient.invalidateQueries({ queryKey: ['cuentas-por-pagar'] })
      setToDisable(null)
    },
    onError: (err: { message?: string }) => toast.error(err?.message ?? 'Error al desactivar'),
  })

  function openCreate() {
    setEditTarget(null)
    reset(emptyValues)
    setDialogOpen(true)
  }

  function openEdit(c: CuentaPorPagar) {
    setEditTarget(c)
    reset({
      titulo: c.titulo,
      descripcion: c.descripcion ?? '',
      tipoDocumento: c.tipoDocumento,
      cuenta: c.cuenta ?? '',
      tipoBienes606: c.tipoBienes606 ?? '',
      claseFiscal: c.claseFiscal ?? '',
    })
    setDialogOpen(true)
  }

  function closeDialog() {
    setDialogOpen(false)
    setEditTarget(null)
    reset(emptyValues)
  }

  function onSubmit(values: FormValues) {
    const payload = {
      titulo: values.titulo,
      descripcion: values.descripcion || undefined,
      tipoDocumento: values.tipoDocumento,
      cuenta: values.cuenta || undefined,
      tipoBienes606: (values.tipoBienes606 || undefined) as 'Bienes' | 'Servicios' | undefined,
      claseFiscal: values.claseFiscal || undefined,
    }
    if (editTarget) {
      updateMutation.mutate({ id: editTarget.id, data: payload })
    } else {
      createMutation.mutate(payload)
    }
  }

  const conceptos = data?.items ?? []

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h1 className="page-title">Cuentas por Pagar</h1>
          <p className="page-sub">
            Conceptos recurrentes de gasto (ej. alquiler, servicios de limpieza) que nunca se venden —
            solo sirven para prellenar un Gasto.
          </p>
        </div>
        <button className="btn btn-primary" onClick={openCreate}>
          <Plus size={16} />
          Nuevo Concepto
        </button>
      </div>

      <div className="filter-bar">
        <div className="filter-bar-left">
          <div className="search-input-wrap">
            <Search size={14} className="search-input-icon" />
            <input
              className="search-input"
              placeholder="Buscar por título…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>
      </div>

      <div className="table-scroll">
        <table className="data-table">
          <thead>
            <tr>
              <SortableTh label="Título" sortKey="titulo" orderBy={orderBy} onSort={sort} />
              <th>Tipo de Documento</th>
               <th>Cuenta</th>
               <th>Tipo de Bienes/Servicios (606)</th>
               <th>Estado</th>
              <th style={{ width: 80 }} />
            </tr>
          </thead>
          <tbody>
            {isLoading
              ? Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i}>
                    {Array.from({ length: 6 }).map((__, j) => (
                      <td key={j}><div className="skeleton-box" style={{ height: 14, width: '100%' }} /></td>
                    ))}
                  </tr>
                ))
              : isError
                ? (
                    <tr>
                      <td colSpan={6} style={{ textAlign: 'center', padding: '32px 0', color: 'var(--color-error)' }}>
                        Error al cargar los conceptos
                      </td>
                    </tr>
                  )
                : conceptos.length === 0
                  ? (
                      <tr>
                        <td colSpan={6} style={{ textAlign: 'center', padding: '32px 0', color: 'var(--text-secondary)' }}>
                          No se encontraron conceptos
                        </td>
                      </tr>
                    )
                  : conceptos.map((c) => (
                      <tr key={c.id}>
                        <td style={{ fontWeight: 500 }}>{c.titulo}</td>
                        <td className="td-muted">{c.tipoDocumento}</td>
                        <td className="td-muted">{c.cuenta ?? '—'}</td>
                        <td className="td-muted">{c.claseFiscal ?? '—'}</td>
                        <td>
                          {c.disabled
                            ? <span className="badge badge-neutral">Inactivo</span>
                            : <span className="badge badge-success">Activo</span>}
                        </td>
                        <td>
                          <div style={{ display: 'flex', gap: 4 }}>
                            <button
                              className="btn btn-ghost btn-size-icon-sm"
                              type="button"
                              onClick={() => openEdit(c)}
                            >
                              <Pencil size={13} />
                            </button>
                            {!c.disabled && (
                              <button
                                className="btn btn-ghost btn-size-icon-sm"
                                type="button"
                                style={{ color: 'var(--color-error)' }}
                                onClick={() => setToDisable(c)}
                              >
                                <Ban size={13} />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
          </tbody>
        </table>
      </div>

      {dialogOpen && (
        <div className="modal-overlay" onClick={requestClose}>
          <div className="modal-box" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <h2 className="modal-title">{editTarget ? 'Editar Concepto' : 'Nuevo Concepto'}</h2>
              <button className="modal-close" type="button" onClick={requestClose}>×</button>
            </div>
            <form onSubmit={handleSubmit(onSubmit)}>
              <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div className="ff-wrap">
                  <label className="ff-label ff-required" htmlFor="titulo">Título</label>
                  <input
                    id="titulo"
                    className={`ff-input${errors.titulo ? ' ff-input-error' : ''}`}
                    placeholder="Ej: Alquiler de oficina"
                    {...register('titulo')}
                  />
                  {errors.titulo && <p className="ff-error">{errors.titulo.message}</p>}
                </div>

                <div className="ff-wrap">
                  <label className="ff-label" htmlFor="descripcion">Descripción</label>
                  <input id="descripcion" className="ff-input" {...register('descripcion')} />
                </div>

                <div className="form-row">
                  <div className="ff-wrap">
                    <label className="ff-label ff-required">Tipo de Documento</label>
                    <Controller
                      name="tipoDocumento"
                      control={control}
                      render={({ field }) => (
                        <Select value={field.value} onValueChange={field.onChange}>
                          {TIPO_DOCUMENTO_OPTIONS.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
                        </Select>
                      )}
                    />
                    <p className="ff-hint">En qué tipo de documento se usa este concepto de gasto.</p>
                  </div>
                  <div className="ff-wrap">
                    <label className="ff-label">Tipo de Bienes/Servicios (606)</label>
                    <Controller
                      name="claseFiscal"
                      control={control}
                      render={({ field }) => (
                        <SearchSelect
                          value={field.value ?? ''}
                          onChange={field.onChange}
                          options={claseFiscalOptions}
                          onSearch={setClaseFiscalSearch}
                          selectedLabel={catalogos?.tipoBienes606?.find((t) => t.value === field.value)?.label ?? field.value}
                          placeholder="Sin configurar"
                        />
                      )}
                    />
                    <p className="ff-hint">Categoría 606 de la DGII (ej. Arrendamientos, Gastos de personal). El backend normaliza el código corto o el string completo.</p>
                  </div>
                </div>

                <div className="ff-wrap">
                  <label className="ff-label">Cuenta Contable</label>
                  <Controller
                    name="cuenta"
                    control={control}
                    render={({ field }) => (
                      <AccountSelect
                        value={field.value ?? ''}
                        onChange={field.onChange}
                        placeholder="Buscar cuenta…"
                      />
                    )}
                  />
                  <p className="ff-hint">Si se omite, ERPNext usa el default de la compañía.</p>
                </div>

                <div className="ff-wrap">
                  <label className="ff-label">Tipo de Gasto Fiscal</label>
                  <Controller
                    name="tipoBienes606"
                    control={control}
                    render={({ field }) => (
                      <Select value={field.value ?? ''} onValueChange={field.onChange} placeholder="Sin especificar">
                        <SelectItem value="Bienes">Bienes</SelectItem>
                        <SelectItem value="Servicios">Servicios</SelectItem>
                      </Select>
                    )}
                  />
                </div>
              </div>
              <div className="modal-foot">
                <button type="button" className="btn btn-ghost" onClick={requestClose}>Cancelar</button>
                <button type="submit" className="btn btn-primary" disabled={isSubmitting}>
                  {isSubmitting ? 'Guardando…' : editTarget ? 'Guardar' : 'Crear'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <ConfirmModal
        open={confirming}
        onClose={cancelDiscard}
        onConfirm={confirmDiscard}
        title="¿Descartar cambios?"
        description="Tienes cambios sin guardar en este formulario. Si continúas, se perderán."
        confirmLabel="Descartar cambios"
        variant="danger"
      />

      {toDisable && (
        <div className="modal-overlay" onClick={() => setToDisable(null)}>
          <div className="modal-box modal-box-sm" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <h2 className="modal-title">¿Desactivar concepto?</h2>
              <button className="modal-close" type="button" onClick={() => setToDisable(null)}>×</button>
            </div>
            <div className="modal-body">
              <p style={{ fontSize: 14 }}>
                Se desactivará <strong>{toDisable.titulo}</strong>. Dejará de aparecer como opción al
                registrar un Gasto — no se elimina, se puede seguir viendo en el historial.
              </p>
            </div>
            <div className="modal-foot">
              <button className="btn btn-ghost" onClick={() => setToDisable(null)}>Cancelar</button>
              <button
                className="btn btn-danger"
                onClick={() => disableMutation.mutate(toDisable.id)}
                disabled={disableMutation.isPending}
              >
                Desactivar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
