// Catálogo maestro de Principios Activos (vertical Farmacia) — docs/tasks/
// PROMPT_COMPOSICION_MEDICAMENTOS_FRONTEND.md §5. Mismo patrón que BrandsPage.tsx: una sola
// pantalla, tabla + modal inline de alta/edición, deshabilitar (nunca borra) en vez de eliminar.
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useForm, Controller } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { toast } from 'sonner'
import {
  listPrincipiosActivos,
  createPrincipioActivo,
  updatePrincipioActivo,
  deshabilitarPrincipioActivo,
  fusionarPrincipioActivo,
} from '@/shared/api/principios-activos'
import type { PrincipioActivo, ApiError } from '@/shared/api/types'
import { Plus, Pencil, Ban, GitMerge, ShieldAlert } from 'lucide-react'
import { useSortState } from '@/shared/hooks/useSortState'
import { SortableTh } from '@/shared/ui/SortableTh'
import { SearchSelect } from '@/shared/ui/SearchSelect'
import type { SearchSelectOption } from '@/shared/ui/SearchSelect'
import { Select, SelectItem } from '@/components/ui/select'
import { FilterField } from '@/shared/ui/FilterField'
import { ConfirmModal } from '@/shared/ui/Modal'
import { useConfirmClose } from '@/shared/hooks/useConfirmClose'
import { RecargarButton } from '@/components/shared/RecargarButton'
import { PageHeader } from '@/components/shared/PageHeader'
import { usePuede } from '@/shared/permissions/can'

const principioSchema = z.object({
  nombre: z.string().min(1, 'El nombre es requerido').max(140, 'Máximo 140 caracteres'),
  sinonimosTexto: z.string().optional(),
  codigoAtc: z.string().max(20, 'Máximo 20 caracteres').optional(),
  esControlado: z.boolean(),
  descripcion: z.string().optional(),
})

type PrincipioFormValues = z.infer<typeof principioSchema>

function textoASinonimos(texto?: string): string[] | undefined {
  const lineas = (texto ?? '').split('\n').map((l) => l.trim()).filter(Boolean)
  return lineas.length > 0 ? lineas : undefined
}

export default function PrincipiosActivosPage() {
  const queryClient = useQueryClient()
  const puedeCrear = usePuede('farmacia.principios-activos.crear')
  const puedeEditar = usePuede('farmacia.principios-activos.editar')
  const puedeEliminar = usePuede('farmacia.principios-activos.eliminar')
  const puedeFusionar = usePuede('farmacia.principios-activos.fusionar')

  const [search, setSearch] = useState('')
  const [soloActivos, setSoloActivos] = useState(true)
  const [esControladoFilter, setEsControladoFilter] = useState<'all' | 'true' | 'false'>('all')
  const { orderBy, sort } = useSortState()

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<PrincipioActivo | null>(null)
  const [toDisable, setToDisable] = useState<PrincipioActivo | null>(null)
  const [toFusionar, setToFusionar] = useState<PrincipioActivo | null>(null)
  const [fusionDestino, setFusionDestino] = useState('')
  const [fusionDestinoSearch, setFusionDestinoSearch] = useState('')
  const [fusionConfirmado, setFusionConfirmado] = useState(false)
  const [duplicado, setDuplicado] = useState<PrincipioActivo | null>(null)

  const { data, isLoading, isError } = useQuery({
    queryKey: [
      'principios-activos',
      { search, soloActivos, esControladoFilter, orderBy },
    ],
    queryFn: () =>
      listPrincipiosActivos({
        search: search || undefined,
        soloActivos: soloActivos || undefined,
        esControlado: esControladoFilter === 'all' ? undefined : esControladoFilter === 'true',
        incluirConteo: true,
        limit: 100,
        orderBy: orderBy || undefined,
      }),
  })

  // Catálogo completo para el selector de destino de fusión — reutiliza el mismo listado.
  const { data: fusionDestinoData } = useQuery({
    queryKey: ['principios-activos-fusion-destino', fusionDestinoSearch],
    queryFn: () => listPrincipiosActivos({ search: fusionDestinoSearch || undefined, soloActivos: true, limit: 20 }),
    enabled: !!toFusionar,
  })
  const fusionDestinoOptions: SearchSelectOption[] = (fusionDestinoData?.items ?? [])
    .filter((p) => p.id !== toFusionar?.id)
    .map((p) => ({ value: p.id, label: p.nombre }))

  const {
    register,
    control,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<PrincipioFormValues>({
    resolver: zodResolver(principioSchema),
    defaultValues: { nombre: '', sinonimosTexto: '', codigoAtc: '', esControlado: false, descripcion: '' },
  })

  const { requestClose, confirming, confirmDiscard, cancelDiscard } = useConfirmClose(isDirty, closeDialog)

  const createMutation = useMutation({
    mutationFn: createPrincipioActivo,
    onSuccess: () => {
      toast.success('Principio activo creado')
      queryClient.invalidateQueries({ queryKey: ['principios-activos'] })
      closeDialog()
    },
    onError: (err: ApiError) => {
      // 409 — manejo especial obligatorio (§5.2/§11): nunca tratarlo como error genérico.
      const candidato = err.details?.candidato as PrincipioActivo | undefined
      if (err.statusCode === 409 && candidato) {
        setDuplicado(candidato)
        return
      }
      toast.error(err?.message ?? 'Error al crear el principio activo')
    },
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Parameters<typeof updatePrincipioActivo>[1] }) =>
      updatePrincipioActivo(id, data),
    onSuccess: () => {
      toast.success('Principio activo actualizado')
      queryClient.invalidateQueries({ queryKey: ['principios-activos'] })
      closeDialog()
    },
    onError: (err: ApiError) => {
      const candidato = err.details?.candidato as PrincipioActivo | undefined
      if (err.statusCode === 409 && candidato) {
        setDuplicado(candidato)
        return
      }
      toast.error(err?.message ?? 'Error al actualizar')
    },
  })

  const disableMutation = useMutation({
    mutationFn: (id: string) => deshabilitarPrincipioActivo(id),
    onSuccess: (result) => {
      toast.success(result.message)
      if (result.advertencia) toast.info(result.advertencia, { duration: 8000 })
      queryClient.invalidateQueries({ queryKey: ['principios-activos'] })
      setToDisable(null)
    },
    onError: (err: ApiError) => toast.error(err?.message ?? 'Error al deshabilitar'),
  })

  const fusionarMutation = useMutation({
    mutationFn: () => fusionarPrincipioActivo(toFusionar!.id, { destino: fusionDestino }),
    onSuccess: (result) => {
      toast.success(`Se reasignaron ${result.articulosAfectados} artículo(s) a "${fusionDestinoData?.items.find((p) => p.id === fusionDestino)?.nombre ?? fusionDestino}".`)
      queryClient.invalidateQueries({ queryKey: ['principios-activos'] })
      cerrarFusion()
    },
    onError: (err: ApiError) => toast.error(err?.message ?? 'Error al fusionar'),
  })

  function openCreate() {
    setEditTarget(null)
    reset({ nombre: '', sinonimosTexto: '', codigoAtc: '', esControlado: false, descripcion: '' })
    setDialogOpen(true)
  }

  function openEdit(p: PrincipioActivo) {
    setEditTarget(p)
    reset({
      nombre: p.nombre,
      sinonimosTexto: (p.sinonimos ?? []).join('\n'),
      codigoAtc: p.codigoAtc ?? '',
      esControlado: p.esControlado,
      descripcion: p.descripcion ?? '',
    })
    setDialogOpen(true)
  }

  function closeDialog() {
    setDialogOpen(false)
    setEditTarget(null)
    reset()
  }

  function cerrarFusion() {
    setToFusionar(null)
    setFusionDestino('')
    setFusionDestinoSearch('')
    setFusionConfirmado(false)
  }

  function onSubmit(values: PrincipioFormValues) {
    const payload = {
      nombre: values.nombre,
      sinonimos: textoASinonimos(values.sinonimosTexto),
      codigoAtc: values.codigoAtc || undefined,
      esControlado: values.esControlado,
      descripcion: values.descripcion || undefined,
    }
    if (editTarget) {
      updateMutation.mutate({ id: editTarget.id, data: payload })
    } else {
      createMutation.mutate(payload)
    }
  }

  return (
    <div className="page-container">
      <PageHeader
        title={<><span className="page-title-dot" />Principios Activos</>}
        description={data ? `${data.meta.total} principios activos` : undefined}
        action={
          <>
            <RecargarButton />
            {puedeCrear && (
              <button className="btn btn-navy" onClick={openCreate}>
                <Plus size={16} />
                Nuevo Principio Activo
              </button>
            )}
          </>
        }
      />

      <div className="card filter-card-navy" style={{ marginBottom: 20 }}>
        <div className="card-body">
          <div className="filter-bar" style={{ margin: 0 }}>
            <div className="filter-bar-left">
              <input
                className="search-input"
                placeholder="Buscar por nombre o sinónimo…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              <FilterField label="Controlado">
                <Select
                  value={esControladoFilter}
                  onValueChange={(val) => setEsControladoFilter(val as 'all' | 'true' | 'false')}
                >
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="true">Solo controladas</SelectItem>
                  <SelectItem value="false">Solo no controladas</SelectItem>
                </Select>
              </FilterField>
              <label className="ff-check-wrap" style={{ marginLeft: 8 }}>
                <input type="checkbox" checked={soloActivos} onChange={(e) => setSoloActivos(e.target.checked)} />
                Solo activos
              </label>
            </div>
          </div>
        </div>
      </div>

      <div className="card navy-table-card">
        <div className="table-scroll">
          <table className="data-table navy-table">
            <thead>
              <tr>
                <SortableTh label="Nombre" sortKey="nombre" orderBy={orderBy} onSort={sort} />
                <th>Sinónimos</th>
                <th>Código ATC</th>
                <th>Artículos</th>
                <th>Estado</th>
                <th style={{ width: 120 }} />
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
                        <td colSpan={6} style={{ textAlign: 'center', padding: '32px 0', color: 'var(--error-text)' }}>
                          Error al cargar los principios activos
                        </td>
                      </tr>
                    )
                  : data?.items.length === 0
                    ? (
                        <tr>
                          <td colSpan={6}>
                            <div className="empty-state">
                              <p className="empty-title">Sin principios activos</p>
                              <p className="empty-sub">
                                {search || esControladoFilter !== 'all'
                                  ? 'No se encontraron resultados con esos filtros.'
                                  : 'Todavía no cargaste ningún principio activo.'}
                              </p>
                              {puedeCrear && !search && esControladoFilter === 'all' && (
                                <button className="btn btn-navy" style={{ marginTop: 12 }} onClick={openCreate}>
                                  <Plus size={16} /> Nuevo Principio Activo
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      )
                    : data?.items.map((p) => (
                        <tr key={p.id}>
                          <td style={{ fontWeight: 500, display: 'flex', alignItems: 'center', gap: 6 }}>
                            {p.nombre}
                            {p.esControlado && (
                              <span title="Sustancia controlada" className="badge badge-warning">
                                <ShieldAlert size={11} style={{ marginRight: 2 }} /> Controlada
                              </span>
                            )}
                          </td>
                          <td className="td-muted">{(p.sinonimos ?? []).join(', ') || '—'}</td>
                          <td className="td-muted" style={{ fontFamily: 'monospace' }}>{p.codigoAtc ?? '—'}</td>
                          <td className="td-muted">{p.cantidadArticulos ?? '—'}</td>
                          <td>
                            {p.deshabilitado
                              ? <span className="badge badge-neutral">Deshabilitado</span>
                              : <span className="badge badge-success">Activo</span>}
                          </td>
                          <td>
                            <div style={{ display: 'flex', gap: 4 }}>
                              {puedeEditar && (
                                <button className="btn btn-ghost btn-size-icon-sm" type="button" onClick={() => openEdit(p)} title="Editar">
                                  <Pencil size={13} />
                                </button>
                              )}
                              {puedeFusionar && !p.deshabilitado && (
                                <button
                                  className="btn btn-ghost btn-size-icon-sm"
                                  type="button"
                                  onClick={() => setToFusionar(p)}
                                  title="Fusionar con otro principio"
                                >
                                  <GitMerge size={13} />
                                </button>
                              )}
                              {puedeEliminar && !p.deshabilitado && (
                                <button
                                  className="btn btn-ghost btn-size-icon-sm"
                                  type="button"
                                  style={{ color: 'var(--color-error)' }}
                                  onClick={() => setToDisable(p)}
                                  title="Deshabilitar"
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
      </div>

      {/* ─── Alta/edición ─────────────────────────────────────────────────── */}
      {dialogOpen && (
        <div className="modal-overlay" onClick={requestClose}>
          <div className="modal-box" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <h2 className="modal-title">{editTarget ? 'Editar Principio Activo' : 'Nuevo Principio Activo'}</h2>
              <button className="modal-close" type="button" onClick={requestClose}>×</button>
            </div>
            <form onSubmit={handleSubmit(onSubmit)}>
              <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div className="ff-wrap">
                  <label className="ff-label ff-required" htmlFor="paNombre">Principio activo</label>
                  <input id="paNombre" className={`ff-input${errors.nombre ? ' ff-input-error' : ''}`} {...register('nombre')} />
                  {errors.nombre && <p className="ff-error">{errors.nombre.message}</p>}
                  {editTarget && (
                    <p className="ff-hint">
                      Este nombre es también el identificador del registro — si lo cambias, la URL de este
                      principio activo cambiará al guardar.
                    </p>
                  )}
                </div>

                <div className="ff-wrap">
                  <label className="ff-label" htmlFor="paSinonimos">Sinónimos</label>
                  <textarea
                    id="paSinonimos"
                    className="ff-input"
                    rows={3}
                    placeholder={'Uno por línea, ej.:\nParacetamol'}
                    {...register('sinonimosTexto')}
                  />
                </div>

                <div className="ff-wrap">
                  <label className="ff-label" htmlFor="paCodigoAtc">Código ATC</label>
                  <input id="paCodigoAtc" className={`ff-input${errors.codigoAtc ? ' ff-input-error' : ''}`} {...register('codigoAtc')} />
                  {errors.codigoAtc && <p className="ff-error">{errors.codigoAtc.message}</p>}
                </div>

                <Controller
                  name="esControlado"
                  control={control}
                  render={({ field }) => (
                    <label className="ff-check-wrap">
                      <input type="checkbox" checked={field.value} onChange={(e) => field.onChange(e.target.checked)} />
                      Sustancia controlada
                    </label>
                  )}
                />

                <div className="ff-wrap">
                  <label className="ff-label" htmlFor="paDescripcion">Descripción / notas</label>
                  <textarea id="paDescripcion" className="ff-input" rows={3} {...register('descripcion')} />
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

      {/* ─── 409 duplicado (§5.2/§11) — manejo especial, nunca error genérico ────────────── */}
      {duplicado && (
        <div className="modal-overlay" onClick={() => setDuplicado(null)}>
          <div className="modal-box modal-box-sm" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <h2 className="modal-title">Ya existe este principio activo</h2>
              <button className="modal-close" type="button" onClick={() => setDuplicado(null)}>×</button>
            </div>
            <div className="modal-body">
              <p style={{ fontSize: 14 }}>
                Ya existe <strong>{duplicado.nombre}</strong> con el mismo nombre normalizado — ¿querías usar
                ese en vez de crear uno nuevo?
              </p>
            </div>
            <div className="modal-foot">
              <button className="btn btn-ghost" onClick={() => setDuplicado(null)}>Cerrar</button>
              <button
                className="btn btn-primary"
                onClick={() => { setDuplicado(null); openEdit(duplicado) }}
              >
                Ver / Editar &quot;{duplicado.nombre}&quot;
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Deshabilitar ─────────────────────────────────────────────────── */}
      {toDisable && (
        <div className="modal-overlay" onClick={() => setToDisable(null)}>
          <div className="modal-box modal-box-sm" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <h2 className="modal-title">¿Deshabilitar principio activo?</h2>
              <button className="modal-close" type="button" onClick={() => setToDisable(null)}>×</button>
            </div>
            <div className="modal-body">
              <p style={{ fontSize: 14 }}>
                Se deshabilitará <strong>{toDisable.nombre}</strong>. Deja de aparecer en nuevas búsquedas por
                principio, pero los artículos que ya lo usan no se modifican. Podés revertirlo editándolo de nuevo.
              </p>
            </div>
            <div className="modal-foot">
              <button className="btn btn-ghost" onClick={() => setToDisable(null)}>Cancelar</button>
              <button
                className="btn btn-danger"
                onClick={() => disableMutation.mutate(toDisable.id)}
                disabled={disableMutation.isPending}
              >
                Deshabilitar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Fusionar duplicados (§5.8) ───────────────────────────────────── */}
      {toFusionar && (
        <div className="modal-overlay" onClick={cerrarFusion}>
          <div className="modal-box modal-box-sm" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <h2 className="modal-title">Fusionar &quot;{toFusionar.nombre}&quot;</h2>
              <button className="modal-close" type="button" onClick={cerrarFusion}>×</button>
            </div>
            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div className="ff-wrap">
                <label className="ff-label">Fusionar con (destino)</label>
                <SearchSelect
                  value={fusionDestino}
                  onChange={(val) => setFusionDestino(val)}
                  options={fusionDestinoOptions}
                  onSearch={setFusionDestinoSearch}
                  selectedLabel={fusionDestinoData?.items.find((p) => p.id === fusionDestino)?.nombre ?? ''}
                  placeholder="Buscar principio activo destino…"
                />
              </div>
              <div className="inline-alert inline-alert-warn">
                Todas las composiciones que usan <strong>{toFusionar.nombre}</strong> pasarán a usar el destino
                elegido, y <strong>{toFusionar.nombre}</strong> quedará deshabilitado. Esto es irreversible en la
                práctica.
              </div>
              <label className="ff-check-wrap">
                <input type="checkbox" checked={fusionConfirmado} onChange={(e) => setFusionConfirmado(e.target.checked)} />
                Entiendo que esta acción es irreversible
              </label>
            </div>
            <div className="modal-foot">
              <button className="btn btn-ghost" onClick={cerrarFusion}>Cancelar</button>
              <button
                className="btn btn-danger"
                disabled={!fusionDestino || !fusionConfirmado || fusionarMutation.isPending}
                onClick={() => fusionarMutation.mutate()}
              >
                Fusionar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
