import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { listBundles, getBundle, createBundle, updateBundle, deleteBundle } from '@/shared/api/bundles'
import type { Bundle, BundleComponent } from '@/shared/api/types'
import { PageHeader } from '@/components/shared/PageHeader'
import { ItemSelect } from '@/shared/ui/ItemSelect'
import { formatDOP } from '@/lib/formatters'
import { Plus, Trash2, X, Loader2 } from 'lucide-react'
import { useSortState } from '@/shared/hooks/useSortState'
import { SortableTh } from '@/shared/ui/SortableTh'

export default function BundlesPage() {
  const queryClient = useQueryClient()
  const [showForm, setShowForm] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [toDelete, setToDelete] = useState<Bundle | null>(null)
  const { orderBy, sort } = useSortState()

  const { data, isLoading } = useQuery({
    queryKey: ['bundles', { orderBy }],
    queryFn: () => listBundles({ limit: 100, orderBy: orderBy || undefined }),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteBundle(id),
    onSuccess: () => { toast.success('Combo eliminado'); queryClient.invalidateQueries({ queryKey: ['bundles'] }); setToDelete(null) },
    onError: () => toast.error('Error al eliminar el combo'),
  })

  return (
    <div className="page-container">
      <PageHeader
        title="Combos / Paquetes"
        description="Agrupaciones de artículos que se venden como un solo producto"
        action={
          <button className="btn btn-primary btn-size-sm" onClick={() => { setEditId(null); setShowForm(true) }}>
            <Plus size={14} /> Nuevo Combo
          </button>
        }
      />

      <div className="card">
        <div className="table-wrap">
          <table className="table-config">
            <thead>
              <tr>
                <SortableTh label="Nombre" sortKey="itemName" orderBy={orderBy} onSort={sort} />
                <th>Artículos</th>
                <SortableTh label="Precio A" sortKey="priceA" orderBy={orderBy} onSort={sort} />
                <SortableTh label="Precio B" sortKey="priceB" orderBy={orderBy} onSort={sort} />
                <SortableTh label="Precio C" sortKey="priceC" orderBy={orderBy} onSort={sort} />
                <th style={{ width: 80 }} />
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={6} style={{ textAlign: 'center', padding: 32 }}><Loader2 size={20} className="spin" /></td></tr>
              ) : !data?.items?.length ? (
                <tr><td colSpan={6}><div className="empty-state"><p className="empty-title">Sin combos</p><p className="empty-sub">Crea el primer combo de artículos.</p></div></td></tr>
              ) : (
                data.items.map((b) => (
                  <tr key={b.id}>
                    <td style={{ fontWeight: 500 }}>{b.itemName}</td>
                    <td>
                      {b.totalItems} Artículos
                    </td>
                    <td>{b.prices?.A ? formatDOP(b.prices.A) : '—'}</td>
                    <td>{b.prices?.B ? formatDOP(b.prices.B) : '—'}</td>
                    <td>{b.prices?.C ? formatDOP(b.prices.C) : '—'}</td>
                    <td>
                      <div style={{ display: 'flex', gap: 4 }}>
                        <button className="btn btn-ghost btn-size-icon-sm" onClick={() => { setEditId(b.id); setShowForm(true) }}>
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 3a2.85 2.85 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/></svg>
                        </button>
                        <button className="btn btn-ghost btn-size-icon-sm" style={{ color: 'var(--icon-muted)' }} onClick={() => setToDelete(b)}>
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {showForm && <BundleFormModal editId={editId} onClose={() => { setShowForm(false); setEditId(null) }} />}

      {toDelete && (
        <div className="modal-overlay" onClick={() => setToDelete(null)}>
          <div className="modal-box modal-box-sm" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <h2 className="modal-title">¿Eliminar combo?</h2>
              <button className="modal-close" onClick={() => setToDelete(null)}><X size={16} /></button>
            </div>
            <div className="modal-body">
              <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Se eliminará <strong>{toDelete.itemName}</strong>. Esta acción no se puede deshacer.</p>
            </div>
            <div className="modal-foot">
              <button className="btn btn-secondary" onClick={() => setToDelete(null)}>Cancelar</button>
              <button className="btn btn-danger" onClick={() => deleteMutation.mutate(toDelete.id)} disabled={deleteMutation.isPending}>Eliminar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function BundleFormModal({ editId, onClose }: { editId: string | null; onClose: () => void }) {
  const queryClient = useQueryClient()
  const [name, setName] = useState('')
  const [itemCode, setItemCode] = useState('')
  const [priceA, setPriceA] = useState('')
  const [priceB, setPriceB] = useState('')
  const [priceC, setPriceC] = useState('')
  const [components, setComponents] = useState<{ itemCode: string; itemLabel?: string; qty: number }[]>([])

  const { data: existing, isLoading: loadingExisting } = useQuery({
    queryKey: ['bundle', editId],
    queryFn: () => getBundle(editId!),
    enabled: !!editId,
  })

  const [initialized, setInitialized] = useState(false)
  if (existing && !initialized) {
    setName(existing.itemName)
    setItemCode(existing.id)
    setPriceA(existing.prices?.A?.toString() ?? '')
    setPriceB(existing.prices?.B?.toString() ?? '')
    setPriceC(existing.prices?.C?.toString() ?? '')
    setComponents(existing.components.map((c) => ({ itemCode: c.itemCode, itemLabel: c.itemName, qty: c.qty })))
    setInitialized(true)
  }

  const createMutation = useMutation({
    mutationFn: () => createBundle({
      itemName: name,
      itemCode: itemCode || undefined,
      components: components.map((c) => ({ itemCode: c.itemCode, qty: c.qty })),
      priceA: priceA ? parseFloat(priceA) : undefined,
      priceB: priceB ? parseFloat(priceB) : undefined,
      priceC: priceC ? parseFloat(priceC) : undefined,
    }),
    onSuccess: () => { toast.success('Combo creado'); queryClient.invalidateQueries({ queryKey: ['bundles'] }); onClose() },
    onError: () => toast.error('Error al crear el combo'),
  })

  const updateMutation = useMutation({
    mutationFn: () => updateBundle(editId!, {
      itemName: name,
      itemCode: itemCode || undefined,
      components: components.map((c) => ({ itemCode: c.itemCode, qty: c.qty })),
      priceA: priceA ? parseFloat(priceA) : undefined,
      priceB: priceB ? parseFloat(priceB) : undefined,
      priceC: priceC ? parseFloat(priceC) : undefined,
    }),
    onSuccess: () => { toast.success('Combo actualizado'); queryClient.invalidateQueries({ queryKey: ['bundles'] }); onClose() },
    onError: () => toast.error('Error al actualizar el combo'),
  })

  const isPending = createMutation.isPending || updateMutation.isPending

  function addComponent() {
    setComponents((prev) => [...prev, { itemCode: '', qty: 1 }])
  }

  function updateComponent(index: number, patch: Partial<{ itemCode: string; itemLabel?: string; qty: number }>) {
    setComponents((prev) => prev.map((c, i) => i === index ? { ...c, ...patch } : c))
  }

  function removeComponent(index: number) {
    setComponents((prev) => prev.filter((_, i) => i !== index))
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name) { toast.error('El nombre del combo es requerido'); return }
    if (components.length === 0) { toast.error('Agrega al menos un componente'); return }
    const invalid = components.some((c) => !c.itemCode)
    if (invalid) { toast.error('Todos los componentes deben tener un artículo seleccionado'); return }
    if (editId) updateMutation.mutate()
    else createMutation.mutate()
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" style={{ maxWidth: 640 }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2 className="modal-title">{editId ? 'Editar Combo' : 'Nuevo Combo'}</h2>
          <button className="modal-close" onClick={onClose}><X size={16} /></button>
        </div>
        {loadingExisting ? (
          <div className="modal-body" style={{ textAlign: 'center', padding: 32 }}><Loader2 size={20} className="spin" /></div>
        ) : (
          <form onSubmit={handleSubmit}>
            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div className="form-row">
                <div className="ff-wrap">
                  <label className="ff-label ff-required">Nombre del combo</label>
                  <input className="ff-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej: Combo Oficina Básica" />
                </div>
                <div className="ff-wrap">
                  <label className="ff-label">Código</label>
                  <input className="ff-input" value={itemCode} onChange={(e) => setItemCode(e.target.value)} placeholder="Ej: COMBO-001" />
                </div>
              </div>

              <div className="ff-wrap">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <label className="ff-label" style={{ margin: 0 }}>Componentes</label>
                  <button type="button" className="btn btn-ghost btn-size-sm" onClick={addComponent}>
                    <Plus size={13} /> Agregar
                  </button>
                </div>
                {components.length === 0 ? (
                  <p className="ff-hint">Agrega artículos que formarán parte de este combo.</p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {components.map((comp, idx) => (
                      <div key={idx} style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                        <div className="ff-wrap" style={{ flex: 1 }}>
                          <ItemSelect
                            value={comp.itemCode}
                            selectedLabel={comp.itemLabel}
                            onSelect={(item) => updateComponent(idx, { itemCode: item.id, itemLabel: item.itemName })}
                            onClear={() => updateComponent(idx, { itemCode: '', itemLabel: undefined })}
                            placeholder="Buscar artículo…"
                          />
                        </div>
                        <div className="ff-wrap" style={{ width: 100 }}>
                          <input className="ff-input" type="number" min="1" step="1" value={comp.qty} onChange={(e) => updateComponent(idx, { qty: parseInt(e.target.value) || 0 })} style={{ textAlign: 'right' }} />
                        </div>
                        <button type="button" className="btn btn-ghost btn-size-icon-sm" style={{ marginTop: 2 }} onClick={() => removeComponent(idx)}>
                          <Trash2 size={13} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="form-row">
                <div className="ff-wrap">
                  <label className="ff-label">Precio A</label>
                  <input className="ff-input" type="number" min="0" step="0.01" value={priceA} onChange={(e) => setPriceA(e.target.value)} placeholder="0.00" />
                </div>
                <div className="ff-wrap">
                  <label className="ff-label">Precio B</label>
                  <input className="ff-input" type="number" min="0" step="0.01" value={priceB} onChange={(e) => setPriceB(e.target.value)} placeholder="0.00" />
                </div>
                <div className="ff-wrap">
                  <label className="ff-label">Precio C</label>
                  <input className="ff-input" type="number" min="0" step="0.01" value={priceC} onChange={(e) => setPriceC(e.target.value)} placeholder="0.00" />
                </div>
              </div>
            </div>
            <div className="modal-foot">
              <button type="button" className="btn btn-secondary" onClick={onClose}>Cancelar</button>
              <button type="submit" className="btn btn-primary" disabled={isPending}>
                {isPending ? 'Guardando…' : 'Guardar'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
