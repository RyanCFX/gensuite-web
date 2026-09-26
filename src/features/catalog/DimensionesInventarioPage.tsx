// Catálogo → Dimensiones de Inventario — pantalla nueva de administración,
// docs/tasks/PROMPT_INVENTORY_DIMENSIONS_FRONTEND.md §3. Define las dimensiones configurables de
// la empresa (Marca, Modelo, Año…) y sus valores. Un artículo del catálogo luego ELIGE cuáles usa
// (§4, otra pantalla) — acá el catálogo es único para toda la empresa.
//
// No confundir "Marca" (ejemplo de dimensión que la empresa podría crear) con el campo nativo
// `brand` del artículo — son conceptos distintos (§3, nota de ubicación sugerida).
import { useMemo, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Plus, Pencil, Power, ChevronDown, ChevronRight as ChevronRightSmall } from 'lucide-react'
import { PageHeader } from '@/components/shared/PageHeader'
import { RecargarButton } from '@/components/shared/RecargarButton'
import { Permitido } from '@/components/shared/Permitido'
import { usePuede } from '@/shared/permissions/can'
import { Modal, ConfirmModal } from '@/shared/ui/Modal'
import { FieldTooltip } from '@/shared/ui/FieldTooltip'
import { Select, SelectItem } from '@/components/ui/select'
import { useConfirmClose } from '@/shared/hooks/useConfirmClose'
import { useDirtyCheck } from '@/shared/hooks/useDirtyCheck'
import { mostrarErrorApi } from '@/lib/apiErrors'
import {
  useDimensionesInventario,
  useInvalidateDimensionesInventario,
  useValoresDimension,
} from '@/shared/hooks/useDimensionesInventario'
import {
  createDimension,
  updateDimension,
  toggleDimension,
  createValorDimension,
  updateValorDimension,
} from '@/shared/api/dimensiones-inventario'
import type {
  DimensionInventario,
  DimensionInventarioValor,
  CreateDimensionInventarioDto,
} from '@/shared/api/types'

// ─── Helpers ──────────────────────────────────────────────────────────────────

const CODIGO_REGEX = /^[a-z][a-z0-9_]{1,29}$/
const CODIGO_ERROR =
  'El código solo admite minúsculas sin acentos, números y guión bajo, empezando por una letra (ej: marca, anio).'

/** Slug automático a partir de la etiqueta — minúsculas, sin acentos, espacios → guión bajo. Solo
 *  se usa como sugerencia inicial, editable antes del primer guardado (§3.3). */
function slugify(etiqueta: string): string {
  return etiqueta
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // quitar acentos
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s_]/g, '')
    .replace(/\s+/g, '_')
    .slice(0, 30)
}

// ─── Nueva dimensión — modal de creación ──────────────────────────────────────

interface CreateFormState {
  etiqueta: string
  codigo: string
  codigoTocado: boolean
  tipo: 'Categorica' | 'Ordinal'
  dimensionPadre: string
}

function defaultCreateForm(): CreateFormState {
  return { etiqueta: '', codigo: '', codigoTocado: false, tipo: 'Categorica', dimensionPadre: '' }
}

function CreateDimensionModal({
  dimensionesActivas,
  onClose,
  onSaved,
}: {
  dimensionesActivas: DimensionInventario[]
  onClose: () => void
  onSaved: () => void
}) {
  const [form, setForm] = useState<CreateFormState>(defaultCreateForm())
  const [errors, setErrors] = useState<{ etiqueta?: string; codigo?: string }>({})
  const [saving, setSaving] = useState(false)

  const isDirty = useDirtyCheck(form, true)
  const { requestClose, confirming, confirmDiscard, cancelDiscard } = useConfirmClose(isDirty, onClose)

  function setEtiqueta(etiqueta: string) {
    setForm((prev) => ({
      ...prev,
      etiqueta,
      // Mientras el usuario no haya tocado el código a mano, lo regeneramos desde la etiqueta.
      codigo: prev.codigoTocado ? prev.codigo : slugify(etiqueta),
    }))
    setErrors((prev) => ({ ...prev, etiqueta: undefined }))
  }

  function setCodigo(codigo: string) {
    setForm((prev) => ({ ...prev, codigo, codigoTocado: true }))
    setErrors((prev) => ({ ...prev, codigo: undefined }))
  }

  function validate(): boolean {
    const errs: { etiqueta?: string; codigo?: string } = {}
    if (!form.etiqueta.trim()) errs.etiqueta = 'La etiqueta es requerida'
    else if (form.etiqueta.trim().length > 60) errs.etiqueta = 'Máximo 60 caracteres'
    if (!form.codigo.trim()) errs.codigo = 'El código es requerido'
    else if (!CODIGO_REGEX.test(form.codigo.trim())) errs.codigo = CODIGO_ERROR
    setErrors(errs)
    return Object.keys(errs).length === 0
  }

  async function handleSubmit() {
    if (!validate()) return
    setSaving(true)
    try {
      const dto: CreateDimensionInventarioDto = {
        codigo: form.codigo.trim(),
        etiqueta: form.etiqueta.trim(),
        tipo: form.tipo,
        dimensionPadre: form.dimensionPadre || undefined,
      }
      await createDimension(dto)
      toast.success('Dimensión creada')
      onSaved()
    } catch (err: unknown) {
      mostrarErrorApi(err, 'Error al crear la dimensión')
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <Modal
        open
        onClose={requestClose}
        title="Nueva dimensión"
        footer={
          <>
            <button className="btn btn-secondary" onClick={requestClose} disabled={saving}>
              Cancelar
            </button>
            <button className="btn btn-primary" onClick={handleSubmit} disabled={saving}>
              {saving ? 'Guardando…' : 'Crear dimensión'}
            </button>
          </>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="ff-wrap">
            <label className="ff-label">Etiqueta *</label>
            <input
              className={`ff-input${errors.etiqueta ? ' ff-input-error' : ''}`}
              value={form.etiqueta}
              onChange={(e) => setEtiqueta(e.target.value)}
              placeholder="ej. Marca, Año…"
              maxLength={60}
              autoFocus
            />
            {errors.etiqueta && <span style={{ color: 'var(--color-danger)', fontSize: 12 }}>{errors.etiqueta}</span>}
          </div>

          <div className="ff-wrap">
            <label className="ff-label">Código *</label>
            <input
              className={`ff-input${errors.codigo ? ' ff-input-error' : ''}`}
              value={form.codigo}
              onChange={(e) => setCodigo(e.target.value)}
              placeholder="ej. marca, anio…"
            />
            {errors.codigo
              ? <span style={{ color: 'var(--color-danger)', fontSize: 12 }}>{errors.codigo}</span>
              : <span style={{ color: 'var(--text-tertiary)', fontSize: 12 }}>No se podrá cambiar después de crear la dimensión.</span>}
          </div>

          <div className="ff-wrap">
            <label className="ff-label" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              Tipo
              <FieldTooltip>Ordinal habilita rangos desde/hasta en las combinaciones permitidas de un artículo (ej. años)</FieldTooltip>
            </label>
            <Select value={form.tipo} onValueChange={(v) => setForm((prev) => ({ ...prev, tipo: v as 'Categorica' | 'Ordinal' }))} clearable={false}>
              <SelectItem value="Categorica">Categórica</SelectItem>
              <SelectItem value="Ordinal">Ordinal</SelectItem>
            </Select>
          </div>

          <div className="ff-wrap">
            <label className="ff-label">Dimensión padre (opcional)</label>
            <Select
              value={form.dimensionPadre}
              onValueChange={(v) => setForm((prev) => ({ ...prev, dimensionPadre: v }))}
              placeholder="Ninguna…"
            >
              {dimensionesActivas.map((d) => (
                <SelectItem key={d.codigo} value={d.codigo}>{d.etiqueta}</SelectItem>
              ))}
            </Select>
          </div>
        </div>
      </Modal>

      <ConfirmModal
        open={confirming}
        onClose={cancelDiscard}
        onConfirm={confirmDiscard}
        title="¿Descartar cambios?"
        description="Tienes cambios sin guardar en este formulario. Si continúas, se perderán."
        confirmLabel="Descartar cambios"
        variant="danger"
      />
    </>
  )
}

// ─── Editar dimensión (solo etiqueta/orden) ───────────────────────────────────

function EditDimensionModal({
  target,
  onClose,
  onSaved,
}: {
  target: DimensionInventario
  onClose: () => void
  onSaved: () => void
}) {
  const [etiqueta, setEtiqueta] = useState(target.etiqueta)
  const [orden, setOrden] = useState(String(target.orden))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | undefined>()

  const isDirty = useDirtyCheck({ etiqueta, orden }, true)
  const { requestClose, confirming, confirmDiscard, cancelDiscard } = useConfirmClose(isDirty, onClose)

  async function handleSubmit() {
    if (!etiqueta.trim()) {
      setError('La etiqueta es requerida')
      return
    }
    setSaving(true)
    try {
      await updateDimension(target.codigo, {
        etiqueta: etiqueta.trim(),
        orden: orden.trim() === '' ? undefined : Number(orden),
      })
      toast.success('Dimensión actualizada')
      onSaved()
    } catch (err: unknown) {
      mostrarErrorApi(err, 'Error al actualizar la dimensión')
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <Modal
        open
        onClose={requestClose}
        title={`Editar «${target.etiqueta}»`}
        size="sm"
        footer={
          <>
            <button className="btn btn-secondary" onClick={requestClose} disabled={saving}>
              Cancelar
            </button>
            <button className="btn btn-primary" onClick={handleSubmit} disabled={saving}>
              {saving ? 'Guardando…' : 'Guardar cambios'}
            </button>
          </>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="ff-wrap">
            <label className="ff-label">Código</label>
            <input className="ff-input" value={target.codigo} disabled />
            <span style={{ color: 'var(--text-tertiary)', fontSize: 12 }}>El código no se puede cambiar.</span>
          </div>
          <div className="ff-wrap">
            <label className="ff-label">Etiqueta *</label>
            <input
              className={`ff-input${error ? ' ff-input-error' : ''}`}
              value={etiqueta}
              onChange={(e) => { setEtiqueta(e.target.value); setError(undefined) }}
              maxLength={60}
              autoFocus
            />
            {error && <span style={{ color: 'var(--color-danger)', fontSize: 12 }}>{error}</span>}
          </div>
          <div className="ff-wrap">
            <label className="ff-label">Orden</label>
            <input
              className="ff-input"
              type="number"
              value={orden}
              onChange={(e) => setOrden(e.target.value)}
            />
          </div>
        </div>
      </Modal>

      <ConfirmModal
        open={confirming}
        onClose={cancelDiscard}
        onConfirm={confirmDiscard}
        title="¿Descartar cambios?"
        description="Tienes cambios sin guardar en este formulario. Si continúas, se perderán."
        confirmLabel="Descartar cambios"
        variant="danger"
      />
    </>
  )
}

// ─── Valores de una dimensión — modal de gestión ──────────────────────────────

function emptyValorForm(): { valor: string; padre: string; ordenNumerico: string } {
  return { valor: '', padre: '', ordenNumerico: '' }
}

function ValorEditRow({
  dimension,
  valor,
  onSaved,
}: {
  dimension: DimensionInventario
  valor: DimensionInventarioValor
  onSaved: () => void
}) {
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState({
    valor: valor.valor,
    ordenNumerico: valor.ordenNumerico != null ? String(valor.ordenNumerico) : '',
    activo: valor.activo,
  })
  const [saving, setSaving] = useState(false)
  const puedeEditar = usePuede('catalogo.dimensiones.editar')

  async function handleSave() {
    if (!form.valor.trim()) {
      toast.error('El valor es requerido')
      return
    }
    setSaving(true)
    try {
      await updateValorDimension(dimension.codigo, valor.id, {
        valor: form.valor.trim(),
        ordenNumerico: dimension.tipo === 'Ordinal' && form.ordenNumerico.trim() !== '' ? Number(form.ordenNumerico) : undefined,
        activo: form.activo,
      })
      toast.success('Valor actualizado')
      setEditing(false)
      onSaved()
    } catch (err: unknown) {
      mostrarErrorApi(err, 'Error al actualizar el valor')
    } finally {
      setSaving(false)
    }
  }

  if (!editing) {
    return (
      <tr>
        <td>{valor.valor}</td>
        <td style={{ fontFamily: 'monospace', fontSize: 12, color: 'var(--text-tertiary)' }}>{valor.id}</td>
        {dimension.tipo === 'Ordinal' && <td>{valor.ordenNumerico ?? '—'}</td>}
        <td>
          <span className={`badge ${valor.activo ? 'badge-success' : 'badge-neutral'}`}>
            {valor.activo ? 'Activo' : 'Inactivo'}
          </span>
        </td>
        <td>
          {puedeEditar && (
            <button className="btn btn-ghost btn-size-xs" onClick={() => setEditing(true)} title="Editar">
              <Pencil size={13} />
            </button>
          )}
        </td>
      </tr>
    )
  }

  return (
    <tr>
      <td>
        <input className="items-input" value={form.valor} onChange={(e) => setForm((p) => ({ ...p, valor: e.target.value }))} />
      </td>
      <td style={{ fontFamily: 'monospace', fontSize: 12, color: 'var(--text-tertiary)' }}>{valor.id}</td>
      {dimension.tipo === 'Ordinal' && (
        <td>
          <input
            className="items-input"
            type="number"
            value={form.ordenNumerico}
            onChange={(e) => setForm((p) => ({ ...p, ordenNumerico: e.target.value }))}
          />
        </td>
      )}
      <td>
        <div className="ff-check-wrap" style={{ margin: 0 }}>
          <input
            id={`activo-${valor.id}`}
            type="checkbox"
            className="ff-check"
            checked={form.activo}
            onChange={(e) => setForm((p) => ({ ...p, activo: e.target.checked }))}
          />
          <label htmlFor={`activo-${valor.id}`} className="ff-label" style={{ margin: 0 }}>Activo</label>
        </div>
      </td>
      <td>
        <div style={{ display: 'flex', gap: 6 }}>
          <button className="btn btn-secondary btn-size-xs" onClick={() => setEditing(false)} disabled={saving}>
            Cancelar
          </button>
          <button className="btn btn-primary btn-size-xs" onClick={handleSave} disabled={saving}>
            {saving ? 'Guardando…' : 'Guardar'}
          </button>
        </div>
      </td>
    </tr>
  )
}

function ValoresPanel({ dimension }: { dimension: DimensionInventario }) {
  const [search, setSearch] = useState('')
  const [form, setForm] = useState(emptyValorForm())
  const [creating, setCreating] = useState(false)
  const puedeEditar = usePuede('catalogo.dimensiones.editar')
  const { invalidarValores } = useInvalidateDimensionesInventario()

  const tienePadre = !!dimension.dimensionPadre

  // Valores ACTIVOS de la dimensión padre — para el selector "valor padre" (§3.6).
  const { items: valoresPadre } = useValoresDimension(dimension.dimensionPadre, {})

  const { items: valores, isLoading } = useValoresDimension(dimension.codigo, { search: search || undefined })

  async function handleCreate() {
    if (!form.valor.trim()) {
      toast.error('El valor es requerido')
      return
    }
    setCreating(true)
    try {
      await createValorDimension(dimension.codigo, {
        valor: form.valor.trim(),
        padre: tienePadre ? (form.padre || undefined) : undefined,
        ordenNumerico: dimension.tipo === 'Ordinal' && form.ordenNumerico.trim() !== '' ? Number(form.ordenNumerico) : undefined,
      })
      toast.success('Valor agregado')
      setForm(emptyValorForm())
      invalidarValores(dimension.codigo)
    } catch (err: unknown) {
      mostrarErrorApi(err, 'Error al crear el valor')
    } finally {
      setCreating(false)
    }
  }

  function onRowSaved() {
    invalidarValores(dimension.codigo)
  }

  return (
    <div style={{ padding: '12px 16px', background: 'var(--surface-sunken)', borderTop: '1px solid var(--border-subtle)' }}>
      {puedeEditar && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: 12 }}>
          <div className="ff-wrap" style={{ minWidth: 160 }}>
            <label className="ff-label">Nuevo valor</label>
            <input
              className="ff-input"
              value={form.valor}
              onChange={(e) => setForm((p) => ({ ...p, valor: e.target.value }))}
              placeholder="ej. Honda"
            />
          </div>
          {tienePadre && (
            <div className="ff-wrap" style={{ minWidth: 160 }}>
              <label className="ff-label">Valor padre</label>
              <Select
                value={form.padre}
                onValueChange={(v) => setForm((p) => ({ ...p, padre: v }))}
                placeholder="Ninguno…"
              >
                {valoresPadre.map((v) => (
                  <SelectItem key={v.id} value={v.id}>{v.valor}</SelectItem>
                ))}
              </Select>
            </div>
          )}
          {dimension.tipo === 'Ordinal' && (
            <div className="ff-wrap" style={{ minWidth: 120 }}>
              <label className="ff-label">Orden numérico</label>
              <input
                className="ff-input"
                type="number"
                value={form.ordenNumerico}
                onChange={(e) => setForm((p) => ({ ...p, ordenNumerico: e.target.value }))}
              />
            </div>
          )}
          <button className="btn btn-navy btn-size-sm" onClick={handleCreate} disabled={creating}>
            <Plus size={13} /> {creating ? 'Agregando…' : 'Agregar valor'}
          </button>
        </div>
      )}

      <div className="ff-wrap" style={{ maxWidth: 260, marginBottom: 8 }}>
        <input
          className="ff-input"
          placeholder="Buscar valor…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {isLoading && <div className="skeleton-box" style={{ height: 60, width: '100%' }} />}

      {!isLoading && valores.length === 0 && (
        <div className="empty-state">Sin valores todavía.</div>
      )}

      {!isLoading && valores.length > 0 && (
        <div className="table-scroll">
          <table className="items-table" style={{ width: '100%' }}>
            <thead>
              <tr>
                <th>Valor</th>
                <th>Id</th>
                {dimension.tipo === 'Ordinal' && <th>Orden numérico</th>}
                <th>Estado</th>
                <th style={{ width: 60 }} />
              </tr>
            </thead>
            <tbody>
              {valores.map((v) => (
                <ValorEditRow key={v.id} dimension={dimension} valor={v} onSaved={onRowSaved} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ─── Página principal ─────────────────────────────────────────────────────────

export default function DimensionesInventarioPage() {
  const queryClient = useQueryClient()
  const { dimensiones, activas, espaciosLibres, isLoading, error } = useDimensionesInventario()
  const [createOpen, setCreateOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<DimensionInventario | null>(null)
  const [toToggle, setToToggle] = useState<DimensionInventario | null>(null)
  const [expanded, setExpanded] = useState<string | null>(null)

  const etiquetaPadre = useMemo(() => {
    const map = new Map<string, string>()
    for (const d of dimensiones) map.set(d.codigo, d.etiqueta)
    return map
  }, [dimensiones])

  function invalidateAll() {
    queryClient.invalidateQueries({ queryKey: ['dimensiones-inventario'] })
  }

  function onCreateSaved() {
    setCreateOpen(false)
    invalidateAll()
  }

  function onEditSaved() {
    setEditTarget(null)
    invalidateAll()
  }

  const toggleMutation = useMutation({
    mutationFn: (codigo: string) => toggleDimension(codigo),
    onSuccess: (data) => {
      toast.success(data.activo ? 'Dimensión activada' : 'Dimensión desactivada')
      setToToggle(null)
      invalidateAll()
    },
    onError: (err: unknown) => {
      mostrarErrorApi(err, 'Error al cambiar el estado de la dimensión')
      setToToggle(null)
    },
  })

  const ordenadas = useMemo(() => [...dimensiones].sort((a, b) => a.orden - b.orden), [dimensiones])

  const sinEspacios = espaciosLibres === 0

  return (
    <div className="page-container">
      <PageHeader
        title={<><span className="page-title-dot" />Dimensiones de Inventario</>}
        description={!isLoading ? `${dimensiones.length} dimensiones` : undefined}
        action={
          <>
            <RecargarButton />
            <Permitido accion="catalogo.dimensiones.crear">
              {sinEspacios ? (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                  <button className="btn btn-navy" disabled>
                    <Plus size={14} /> Nueva dimensión
                  </button>
                  <FieldTooltip>
                    No quedan espacios de dimensión libres en esta empresa. Ampliarlos es una tarea de mantenimiento programada — contacte a soporte.
                  </FieldTooltip>
                </span>
              ) : (
                <button className="btn btn-navy" onClick={() => setCreateOpen(true)}>
                  <Plus size={14} /> Nueva dimensión
                </button>
              )}
            </Permitido>
          </>
        }
      />

      <div className="card navy-table-card">
        <div className="card-header">
          <span className="card-title">Lista de dimensiones</span>
        </div>
        <div className="card-body" style={{ padding: 0 }}>
          {isLoading && (
            <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 10 }}>
              {[1, 2, 3].map((i) => (
                <span key={i} className="skeleton-box" style={{ height: 20, width: '100%' }} />
              ))}
            </div>
          )}

          {!isLoading && error && (
            <div className="inline-alert inline-alert-info" style={{ margin: 16 }}>
              Error al cargar las dimensiones.
            </div>
          )}

          {!isLoading && !error && ordenadas.length === 0 && (
            <div className="empty-state">No hay dimensiones. Crea una para comenzar.</div>
          )}

          {!isLoading && !error && ordenadas.length > 0 && (
            <div className="table-scroll">
              <table className="data-table navy-table" style={{ width: '100%' }}>
                <thead>
                  <tr>
                    <th style={{ width: 28 }} />
                    <th>Código</th>
                    <th>Etiqueta</th>
                    <th>Tipo</th>
                    <th>Dimensión padre</th>
                    <th>Orden</th>
                    <th>Estado</th>
                    <th style={{ width: 140 }}>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {ordenadas.map((d) => (
                    <>
                      <tr
                        key={d.codigo}
                        className="table-row-clickable"
                        onClick={() => setExpanded((prev) => (prev === d.codigo ? null : d.codigo))}
                      >
                        <td>
                          {expanded === d.codigo ? <ChevronDown size={14} /> : <ChevronRightSmall size={14} />}
                        </td>
                        <td style={{ fontFamily: 'monospace', fontSize: 12 }}>{d.codigo}</td>
                        <td>{d.etiqueta}</td>
                        <td>
                          <span className={`badge ${d.tipo === 'Ordinal' ? 'badge-info' : 'badge-neutral'}`}>
                            {d.tipo === 'Ordinal' ? 'Ordinal' : 'Categórica'}
                          </span>
                        </td>
                        <td>{d.dimensionPadre ? (etiquetaPadre.get(d.dimensionPadre) ?? d.dimensionPadre) : '—'}</td>
                        <td>{d.orden}</td>
                        <td>
                          <span className={`badge ${d.activo ? 'badge-success' : 'badge-neutral'}`}>
                            {d.activo ? 'Activo' : 'Inactivo'}
                          </span>
                        </td>
                        <td onClick={(e) => e.stopPropagation()}>
                          <div style={{ display: 'flex', gap: 6 }}>
                            <Permitido accion="catalogo.dimensiones.editar">
                              <button className="btn btn-ghost btn-size-xs" title="Editar" onClick={() => setEditTarget(d)}>
                                <Pencil size={13} />
                              </button>
                              <button
                                className="btn btn-ghost btn-size-xs"
                                title={d.activo ? 'Desactivar' : 'Activar'}
                                onClick={() => (d.activo ? setToToggle(d) : toggleMutation.mutate(d.codigo))}
                              >
                                <Power size={13} />
                              </button>
                            </Permitido>
                          </div>
                        </td>
                      </tr>
                      {expanded === d.codigo && (
                        <tr key={`${d.codigo}-valores`}>
                          <td colSpan={8} style={{ padding: 0 }}>
                            <ValoresPanel dimension={d} />
                          </td>
                        </tr>
                      )}
                    </>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {createOpen && (
        <CreateDimensionModal
          dimensionesActivas={activas}
          onClose={() => setCreateOpen(false)}
          onSaved={onCreateSaved}
        />
      )}

      {editTarget && (
        <EditDimensionModal
          target={editTarget}
          onClose={() => setEditTarget(null)}
          onSaved={onEditSaved}
        />
      )}

      <ConfirmModal
        open={!!toToggle}
        onClose={() => setToToggle(null)}
        onConfirm={() => toToggle && toggleMutation.mutate(toToggle.codigo)}
        title="Desactivar dimensión"
        description={toToggle ? `¿Desactivar «${toToggle.etiqueta}»? Los artículos que ya la usan seguirán funcionando con su configuración actual. No podrás usarla en artículos nuevos hasta reactivarla.` : ''}
        confirmLabel="Desactivar"
        variant="danger"
        loading={toggleMutation.isPending}
      />
    </div>
  )
}
