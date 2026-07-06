import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Plus, Pencil, Eye } from 'lucide-react'
import {
  listAttributes,
  getAttribute,
  createAttribute,
  updateAttribute,
} from '@/shared/api/catalog'
import type { ItemAttribute, AttributeValue, CreateAttributeDto, UpdateAttributeDto } from '@/shared/api/types'
import { useSortState } from '@/shared/hooks/useSortState'
import { SortableTh } from '@/shared/ui/SortableTh'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function autoAbbr(value: string): string {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 5)
}

function emptyRow(): AttributeValue {
  return { value: '', abbr: '' }
}

// ─── Types for form state ─────────────────────────────────────────────────────

interface FormState {
  name: string
  numeric: boolean
  values: AttributeValue[]
  fromRange: string
  toRange: string
  increment: string
}

function defaultFormState(): FormState {
  return {
    name: '',
    numeric: false,
    values: [emptyRow(), emptyRow()],
    fromRange: '',
    toRange: '',
    increment: '',
  }
}

function formFromAttribute(attr: ItemAttribute): FormState {
  return {
    name: attr.name,
    numeric: attr.numeric,
    values: attr.values?.length ? attr.values.map((v) => ({ ...v })) : [emptyRow(), emptyRow()],
    fromRange: attr.fromRange != null ? String(attr.fromRange) : '',
    toRange: attr.toRange != null ? String(attr.toRange) : '',
    increment: attr.increment != null ? String(attr.increment) : '',
  }
}

// ─── Detail panel ─────────────────────────────────────────────────────────────

function DetailPanel({
  attrId,
  onClose,
  onEdit,
}: {
  attrId: string
  onClose: () => void
  onEdit: (attr: ItemAttribute) => void
}) {
  const { data: attr, isLoading } = useQuery({
    queryKey: ['attribute', attrId],
    queryFn: () => getAttribute(attrId),
    staleTime: 30_000,
  })

  return (
    <div className="card" style={{ marginTop: 16 }}>
      <div className="card-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span className="card-title">{isLoading ? 'Cargando…' : attr?.name}</span>
        <div style={{ display: 'flex', gap: 8 }}>
          {attr && (
            <button className="btn btn-secondary btn-size-sm" onClick={() => onEdit(attr)}>
              <Pencil size={13} /> Editar
            </button>
          )}
          <button className="btn btn-ghost btn-size-sm" onClick={onClose}>
            Cerrar
          </button>
        </div>
      </div>

      <div className="card-body">
        {isLoading && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {[200, 160, 180].map((w, i) => (
              <span key={i} className="skeleton-box" style={{ height: 16, width: w }} />
            ))}
          </div>
        )}

        {!isLoading && attr && (
          <>
            <div style={{ display: 'flex', gap: 12, marginBottom: 12, flexWrap: 'wrap' }}>
              <span>
                <strong>Tipo:</strong>{' '}
                <span className={`badge ${attr.numeric ? 'badge-info' : 'badge-neutral'}`}>
                  {attr.numeric ? 'Numérico' : 'Discreto'}
                </span>
              </span>
            </div>

            {attr.numeric ? (
              <div className="inline-alert inline-alert-info">
                Rango: {attr.fromRange} → {attr.toRange}, incremento: {attr.increment}
              </div>
            ) : (
              <>
                {(!attr.values || attr.values.length === 0) ? (
                  <div className="empty-state">Sin valores definidos.</div>
                ) : (
                  <div className="table-scroll">
                    <table className="data-table" style={{ width: '100%' }}>
                      <thead>
                        <tr>
                          <th>Valor</th>
                          <th>Abreviación</th>
                        </tr>
                      </thead>
                      <tbody>
                        {attr.values.map((v, i) => (
                          <tr key={i}>
                            <td>{v.value}</td>
                            <td>
                              <span className="badge badge-neutral">{v.abbr}</span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </>
            )}
          </>
        )}
      </div>
    </div>
  )
}

// ─── Create / Edit Modal ──────────────────────────────────────────────────────

function AttributeModal({
  editTarget,
  onClose,
  onSaved,
}: {
  editTarget: ItemAttribute | null
  onClose: () => void
  onSaved: () => void
}) {
  const isEdit = editTarget !== null
  const [form, setForm] = useState<FormState>(
    editTarget ? formFromAttribute(editTarget) : defaultFormState()
  )
  const [saving, setSaving] = useState(false)
  const [errors, setErrors] = useState<Partial<Record<string, string>>>({})

  function setField<K extends keyof FormState>(key: K, val: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: val }))
    setErrors((prev) => ({ ...prev, [key]: undefined }))
  }

  function updateRow(index: number, field: keyof AttributeValue, val: string) {
    setForm((prev) => {
      const values = prev.values.map((row, i) => {
        if (i !== index) return row
        const updated = { ...row, [field]: val }
        if (field === 'value') {
          // Auto-fill abbr only if abbr hasn't been manually edited
          if (row.abbr === autoAbbr(row.value) || row.abbr === '') {
            updated.abbr = autoAbbr(val)
          }
        }
        return updated
      })
      return { ...prev, values }
    })
  }

  function addRow() {
    setForm((prev) => ({ ...prev, values: [...prev.values, emptyRow()] }))
  }

  function removeRow(index: number) {
    setForm((prev) => ({
      ...prev,
      values: prev.values.filter((_, i) => i !== index),
    }))
  }

  function validate(): boolean {
    const errs: Partial<Record<string, string>> = {}
    if (!form.name.trim()) errs.name = 'El nombre es requerido'
    if (form.numeric) {
      if (form.fromRange === '') errs.fromRange = 'Requerido'
      if (form.toRange === '') errs.toRange = 'Requerido'
      if (form.increment === '') errs.increment = 'Requerido'
    } else {
      const filled = form.values.filter((v) => v.value.trim())
      if (filled.length === 0) errs.values = 'Agrega al menos un valor'
    }
    setErrors(errs)
    return Object.keys(errs).length === 0
  }

  async function handleSubmit() {
    if (!validate()) return
    setSaving(true)
    try {
      if (isEdit && editTarget) {
        const dto: UpdateAttributeDto = { name: form.name.trim() }
        if (!form.numeric) {
          dto.values = form.values.filter((v) => v.value.trim())
        }
        await updateAttribute(editTarget.id, dto)
        toast.success('Atributo actualizado')
      } else {
        const dto: CreateAttributeDto = {
          name: form.name.trim(),
          numeric: form.numeric,
        }
        if (form.numeric) {
          dto.fromRange = Number(form.fromRange)
          dto.toRange = Number(form.toRange)
          dto.increment = Number(form.increment)
        } else {
          dto.values = form.values.filter((v) => v.value.trim())
        }
        await createAttribute(dto)
        toast.success('Atributo creado')
      }
      onSaved()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error al guardar'
      toast.error(msg)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" style={{ maxWidth: 540 }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <span className="modal-title">{isEdit ? 'Editar Atributo' : 'Nuevo Atributo'}</span>
          <button className="modal-close" onClick={onClose} aria-label="Cerrar" />
        </div>

        <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Name */}
          <div className="ff-wrap">
            <label className="ff-label">Nombre *</label>
            <input
              className={`ff-input${errors.name ? ' ff-input-error' : ''}`}
              value={form.name}
              onChange={(e) => setField('name', e.target.value)}
              placeholder="ej. Color, Talla…"
              autoFocus
            />
            {errors.name && <span style={{ color: 'var(--color-danger)', fontSize: 12 }}>{errors.name}</span>}
          </div>

          {/* Numeric toggle — only on create */}
          {!isEdit && (
            <div className="ff-check-wrap">
              <input
                id="attr-numeric"
                type="checkbox"
                className="ff-check"
                checked={form.numeric}
                onChange={(e) => setField('numeric', e.target.checked)}
              />
              <label htmlFor="attr-numeric" className="ff-label" style={{ margin: 0, cursor: 'pointer' }}>
                Valores numéricos (rango)
              </label>
            </div>
          )}

          {/* Numeric range inputs */}
          {form.numeric && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
              <div className="ff-wrap">
                <label className="ff-label">Desde *</label>
                <input
                  className={`ff-input${errors.fromRange ? ' ff-input-error' : ''}`}
                  type="number"
                  value={form.fromRange}
                  onChange={(e) => setField('fromRange', e.target.value)}
                />
                {errors.fromRange && <span style={{ color: 'var(--color-danger)', fontSize: 12 }}>{errors.fromRange}</span>}
              </div>
              <div className="ff-wrap">
                <label className="ff-label">Hasta *</label>
                <input
                  className={`ff-input${errors.toRange ? ' ff-input-error' : ''}`}
                  type="number"
                  value={form.toRange}
                  onChange={(e) => setField('toRange', e.target.value)}
                />
                {errors.toRange && <span style={{ color: 'var(--color-danger)', fontSize: 12 }}>{errors.toRange}</span>}
              </div>
              <div className="ff-wrap">
                <label className="ff-label">Incremento *</label>
                <input
                  className={`ff-input${errors.increment ? ' ff-input-error' : ''}`}
                  type="number"
                  value={form.increment}
                  onChange={(e) => setField('increment', e.target.value)}
                />
                {errors.increment && <span style={{ color: 'var(--color-danger)', fontSize: 12 }}>{errors.increment}</span>}
              </div>
            </div>
          )}

          {/* Discrete values table */}
          {!form.numeric && (
            <div className="ff-wrap">
              <label className="ff-label">Valores</label>
              {errors.values && (
                <span style={{ color: 'var(--color-danger)', fontSize: 12, display: 'block', marginBottom: 6 }}>
                  {errors.values}
                </span>
              )}
              <div className="table-scroll">
                <table className="items-table" style={{ width: '100%' }}>
                  <thead>
                    <tr>
                      <th>Valor</th>
                      <th>Abreviación</th>
                      <th style={{ width: 36 }} />
                    </tr>
                  </thead>
                  <tbody>
                    {form.values.map((row, i) => (
                      <tr key={i}>
                        <td>
                          <input
                            className="items-input"
                            value={row.value}
                            onChange={(e) => updateRow(i, 'value', e.target.value)}
                            placeholder="ej. Rojo"
                          />
                        </td>
                        <td>
                          <input
                            className="items-input"
                            value={row.abbr}
                            onChange={(e) => updateRow(i, 'abbr', e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 5))}
                            placeholder="ej. ROJO"
                            style={{ textTransform: 'uppercase' }}
                          />
                        </td>
                        <td>
                          <button
                            type="button"
                            className="btn btn-ghost btn-size-xs"
                            onClick={() => removeRow(i)}
                            aria-label="Eliminar fila"
                            disabled={form.values.length <= 1}
                          >
                            ×
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <button type="button" className="btn btn-ghost btn-size-sm" style={{ marginTop: 8 }} onClick={addRow}>
                <Plus size={13} /> Agregar valor
              </button>
            </div>
          )}
        </div>

        <div className="modal-foot">
          <button className="btn btn-secondary" onClick={onClose} disabled={saving}>
            Cancelar
          </button>
          <button className="btn btn-primary" onClick={handleSubmit} disabled={saving}>
            {saving ? 'Guardando…' : isEdit ? 'Guardar cambios' : 'Crear atributo'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── AttributesPage ───────────────────────────────────────────────────────────

export default function AttributesPage() {
  const queryClient = useQueryClient()
  const [modalOpen, setModalOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<ItemAttribute | null>(null)
  const [detailId, setDetailId] = useState<string | null>(null)
  const [loadingEdit, setLoadingEdit] = useState<string | null>(null) // id being fetched
  const { orderBy, sort } = useSortState()

  const { data, isLoading, isError } = useQuery({
    queryKey: ['attributes', { orderBy }],
    queryFn: () => listAttributes({ limit: 100, orderBy: orderBy || undefined }),
  })

  // Prefetch on hover
  const { refetch: refetchList } = useQuery({
    queryKey: ['attributes', { orderBy }],
    queryFn: () => listAttributes({ limit: 100, orderBy: orderBy || undefined }),
    enabled: false,
  })

  const attributes = data?.items ?? []

  function openCreate() {
    setEditTarget(null)
    setModalOpen(true)
  }

  // Always fetch the full attribute (with values) before opening the edit modal.
  // The list endpoint returns { id, name, numeric } without values[].
  async function openEdit(attr: ItemAttribute) {
    setLoadingEdit(attr.id)
    try {
      const full = await getAttribute(attr.id)
      setEditTarget(full)
      setModalOpen(true)
      setDetailId(null)
    } catch {
      toast.error('Error al cargar el atributo')
    } finally {
      setLoadingEdit(null)
    }
  }

  function closeModal() {
    setModalOpen(false)
    setEditTarget(null)
  }

  function onSaved() {
    closeModal()
    queryClient.invalidateQueries({ queryKey: ['attributes'] })
    // Invalidate detail cache for edited attribute
    if (editTarget) {
      queryClient.invalidateQueries({ queryKey: ['attribute', editTarget.id] })
    }
    refetchList()
  }

  return (
    <div className="page-container">
      <div className="page-header">
        <h1 className="page-title">Atributos</h1>
        <button className="btn btn-primary" onClick={openCreate}>
          <Plus size={14} /> Nuevo Atributo
        </button>
      </div>

      <div className="card">
        <div className="card-header">
          <span className="card-title">Lista de atributos</span>
        </div>
        <div className="card-body" style={{ padding: 0 }}>
          {isLoading && (
            <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 10 }}>
              {[1, 2, 3].map((i) => (
                <span key={i} className="skeleton-box" style={{ height: 20, width: '100%' }} />
              ))}
            </div>
          )}

          {isError && (
            <div className="inline-alert inline-alert-info" style={{ margin: 16 }}>
              Error al cargar los atributos.
            </div>
          )}

          {!isLoading && !isError && attributes.length === 0 && (
            <div className="empty-state">
              No hay atributos. Crea uno para comenzar.
            </div>
          )}

          {!isLoading && attributes.length > 0 && (
            <div className="table-scroll">
              <table className="data-table" style={{ width: '100%' }}>
                <thead>
                  <tr>
                    <SortableTh label="Nombre" sortKey="name" orderBy={orderBy} onSort={sort} />
                    <th>Tipo</th>
                    <th># Valores</th>
                    <th style={{ width: 120 }}>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {attributes.map((attr) => (
                    <tr
                      key={attr.id}
                      className="table-row-clickable"
                      onClick={() => setDetailId((prev) => prev === attr.id ? null : attr.id)}
                    >
                      <td>{attr.name}</td>
                      <td>
                        <span className={`badge ${attr.numeric ? 'badge-info' : 'badge-neutral'}`}>
                          {attr.numeric ? 'Numérico' : 'Discreto'}
                        </span>
                      </td>
                      <td>
                        {attr.numeric
                          ? '—'
                          : attr.values != null
                            ? attr.values.length
                            : '—'}
                      </td>
                      <td onClick={(e) => e.stopPropagation()}>
                        <div style={{ display: 'flex', gap: 6 }}>
                          <button
                            className="btn btn-ghost btn-size-xs"
                            title="Ver detalle"
                            onClick={() => setDetailId((prev) => prev === attr.id ? null : attr.id)}
                          >
                            <Eye size={13} />
                          </button>
                          <button
                            className="btn btn-ghost btn-size-xs"
                            title="Editar"
                            onClick={() => openEdit(attr)}
                            disabled={loadingEdit === attr.id}
                          >
                            {loadingEdit === attr.id
                              ? <span className="spinner spinner-brand spinner-sm" aria-label="Cargando…" />
                              : <Pencil size={13} />}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Detail panel */}
      {detailId && (
        <DetailPanel
          attrId={detailId}
          onClose={() => setDetailId(null)}
          onEdit={openEdit}
        />
      )}

      {/* Create / edit modal */}
      {modalOpen && (
        <AttributeModal
          editTarget={editTarget}
          onClose={closeModal}
          onSaved={onSaved}
        />
      )}
    </div>
  )
}
