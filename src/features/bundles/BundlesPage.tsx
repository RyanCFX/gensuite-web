import { useState, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { listBundles, getBundle, createBundle, updateBundle, deleteBundle } from '@/shared/api/bundles'
import type { Bundle } from '@/shared/api/types'
import { PageHeader } from '@/components/shared/PageHeader'
import { ItemSelect } from '@/shared/ui/ItemSelect'
import { UomSelect } from '@/shared/ui/UomSelect'
import { formatDOP } from '@/lib/formatters'
import { useDebounce } from '@/lib/useDebounce'
import { Plus, Trash2, X, Loader2, Search, ChevronLeft, ChevronRight } from 'lucide-react'
import { ConfirmModal } from '@/shared/ui/Modal'
import { useConfirmClose } from '@/shared/hooks/useConfirmClose'
import { useDirtyCheck } from '@/shared/hooks/useDirtyCheck'
import { useSortState } from '@/shared/hooks/useSortState'
import { SortableTh } from '@/shared/ui/SortableTh'
import { Select, SelectItem } from '@/components/ui/select'

const PAGE_SIZE = 20

export default function BundlesPage() {
  const queryClient = useQueryClient()
  const [showForm, setShowForm] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [toDelete, setToDelete] = useState<Bundle | null>(null)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'disabled'>('active')
  const [page, setPage] = useState(1)
  const { orderBy, sort } = useSortState()

  const debouncedSearch = useDebounce(search, 300)
  const offset = (page - 1) * PAGE_SIZE

  const handleSearchChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setSearch(e.target.value)
    setPage(1)
  }, [])

  const { data, isLoading } = useQuery({
    queryKey: ['bundles', { search: debouncedSearch, offset, orderBy }],
    queryFn: () => listBundles({
      search: debouncedSearch || undefined,
      limit: PAGE_SIZE,
      offset,
      orderBy: orderBy || undefined,
    }),
  })

  // El backend no soporta filtrar por `disabled` en la query (rechaza la propiedad) —
  // filtramos en el cliente sobre la página ya traída, como workaround temporal.
  const filteredItems = (data?.items ?? []).filter((b) =>
    statusFilter === 'all' ? true : statusFilter === 'disabled' ? b.disabled : !b.disabled,
  )

  const totalPages = data ? Math.ceil(data.meta.total / PAGE_SIZE) : 1

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteBundle(id),
    onSuccess: () => { toast.success('Combo desactivado'); queryClient.invalidateQueries({ queryKey: ['bundles'] }); setToDelete(null) },
    onError: () => toast.error('Error al desactivar el combo'),
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
        <div style={{ display: 'flex', gap: 8, padding: '12px 16px', borderBottom: '1px solid var(--border-default)' }}>
          <div className="search-input-wrap">
            <Search size={14} className="search-input-icon" />
            <input
              className="search-input"
              placeholder="Buscar combo por nombre…"
              value={search}
              onChange={handleSearchChange}
            />
          </div>
          <Select value={statusFilter} onValueChange={(val) => { setStatusFilter(val as 'all' | 'active' | 'disabled'); setPage(1) }}>
            <SelectItem value="all">Todos</SelectItem>
            <SelectItem value="active">Activos</SelectItem>
            <SelectItem value="disabled">Desactivados</SelectItem>
          </Select>
        </div>
        <div className="table-wrap">
          <table className="table-config">
            <thead>
              <tr>
                <SortableTh label="Nombre" sortKey="itemName" orderBy={orderBy} onSort={sort} />
                <th>UdM</th>
                <th>Artículos</th>
                <SortableTh label="Precio A" sortKey="priceA" orderBy={orderBy} onSort={sort} />
                <SortableTh label="Precio B" sortKey="priceB" orderBy={orderBy} onSort={sort} />
                <SortableTh label="Precio C" sortKey="priceC" orderBy={orderBy} onSort={sort} />
                <th>Estado</th>
                <th style={{ width: 80 }} />
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={8} style={{ textAlign: 'center', padding: 32 }}><Loader2 size={20} className="spin" /></td></tr>
              ) : filteredItems.length === 0 ? (
                <tr><td colSpan={8}><div className="empty-state"><p className="empty-title">Sin combos</p><p className="empty-sub">Crea el primer combo de artículos.</p></div></td></tr>
              ) : (
                filteredItems.map((b) => (
                  <tr key={b.id}>
                    <td style={{ fontWeight: 500 }}>{b.itemName}</td>
                    <td>{b.itemUom || 'Nos'}</td>
                    <td title={b.components?.map((c) => `${c.itemName ?? c.itemCode} — ${c.qty} ${c.uom ?? ''}`).join('\n')}>
                      {b.totalItems} Artículos
                    </td>
                    <td>{b.prices?.A ? formatDOP(b.prices.A) : '—'}</td>
                    <td>{b.prices?.B ? formatDOP(b.prices.B) : '—'}</td>
                    <td>{b.prices?.C ? formatDOP(b.prices.C) : '—'}</td>
                    <td>
                      {b.disabled
                        ? <span className="badge badge-neutral">Inactivo</span>
                        : <span className="badge badge-success">Activo</span>}
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: 4 }}>
                        <button className="btn btn-ghost btn-size-icon-sm" onClick={() => { setEditId(b.id); setShowForm(true) }}>
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 3a2.85 2.85 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/></svg>
                        </button>
                        {!b.disabled && (
                          <button className="btn btn-ghost btn-size-icon-sm" style={{ color: 'var(--icon-muted)' }} onClick={() => setToDelete(b)}>
                            <Trash2 size={14} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        {data && data.meta.total > PAGE_SIZE && (
          <div className="pagination">
            <span className="pagination-info">
              Mostrando {offset + 1}–{Math.min(offset + PAGE_SIZE, data.meta.total)} de {data.meta.total}
            </span>
            <div className="pagination-controls">
              <button className="btn btn-ghost btn-size-icon-sm" disabled={page === 1} onClick={() => setPage((p) => p - 1)}>
                <ChevronLeft size={14} />
              </button>
              <span style={{ fontSize: 12, color: 'var(--text-secondary)', padding: '0 8px' }}>
                {page} / {totalPages}
              </span>
              <button className="btn btn-ghost btn-size-icon-sm" disabled={!data.meta.hasMore} onClick={() => setPage((p) => p + 1)}>
                <ChevronRight size={14} />
              </button>
            </div>
          </div>
        )}
      </div>

      {showForm && <BundleFormModal editId={editId} onClose={() => { setShowForm(false); setEditId(null) }} />}

      {toDelete && (
        <div className="modal-overlay" onClick={() => setToDelete(null)}>
          <div className="modal-box modal-box-sm" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <h2 className="modal-title">¿Desactivar combo?</h2>
              <button className="modal-close" onClick={() => setToDelete(null)}><X size={16} /></button>
            </div>
            <div className="modal-body">
              <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Se desactivará <strong>{toDelete.itemName}</strong> y dejará de aparecer en los listados activos. Podrás seguir viéndolo con el filtro "Desactivados".</p>
            </div>
            <div className="modal-foot">
              <button className="btn btn-secondary" onClick={() => setToDelete(null)}>Cancelar</button>
              <button className="btn btn-danger" onClick={() => deleteMutation.mutate(toDelete.id)} disabled={deleteMutation.isPending}>Desactivar</button>
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
  const [itemUom, setItemUom] = useState('')
  const [components, setComponents] = useState<{ itemCode: string; itemLabel?: string; qty: number; stockQty?: number; uom?: string }[]>([])
  const [submitted, setSubmitted] = useState(false)

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
    setItemUom(existing.itemUom ?? '')
    setComponents(existing.components.map((c) => ({ itemCode: c.itemCode, itemLabel: c.itemName, qty: c.qty, stockQty: c.stockQty, uom: c.uom })))
    setInitialized(true)
  }

  const createMutation = useMutation({
    mutationFn: () => createBundle({
      itemName: name,
      itemCode: itemCode || undefined,
      components: components.map((c) => ({ itemCode: c.itemCode, qty: c.qty, uom: c.uom || undefined })),
      priceA: priceA ? parseFloat(priceA) : undefined,
      priceB: priceB ? parseFloat(priceB) : undefined,
      priceC: priceC ? parseFloat(priceC) : undefined,
      itemUom: itemUom || undefined,
    }),
    onSuccess: () => { toast.success('Combo creado'); queryClient.invalidateQueries({ queryKey: ['bundles'] }); onClose() },
    onError: () => toast.error('Error al crear el combo'),
  })

  const updateMutation = useMutation({
    mutationFn: () => updateBundle(editId!, {
      itemName: name,
      components: components.map((c) => ({ itemCode: c.itemCode, qty: c.qty, uom: c.uom || undefined })),
      priceA: priceA ? parseFloat(priceA) : undefined,
      priceB: priceB ? parseFloat(priceB) : undefined,
      priceC: priceC ? parseFloat(priceC) : undefined,
      itemUom: itemUom || undefined,
    }),
    onSuccess: () => { toast.success('Combo actualizado'); queryClient.invalidateQueries({ queryKey: ['bundles'] }); onClose() },
    onError: () => toast.error('Error al actualizar el combo'),
  })

  const isPending = createMutation.isPending || updateMutation.isPending

  const isDirty = useDirtyCheck({ name, itemCode, priceA, priceB, priceC, itemUom, components }, !editId || initialized)
  const { requestClose, confirming, confirmDiscard, cancelDiscard } = useConfirmClose(isDirty, onClose)

  function addComponent() {
    setComponents((prev) => [...prev, { itemCode: '', qty: 1 }])
  }

  function updateComponent(index: number, patch: Partial<{ itemCode: string; itemLabel?: string; qty: number; stockQty?: number; uom?: string }>) {
    setComponents((prev) => prev.map((c, i) => i === index ? { ...c, ...patch } : c))
  }

  function removeComponent(index: number) {
    setComponents((prev) => prev.filter((_, i) => i !== index))
  }

  const duplicateItemCodes = new Set(
    components.filter((c) => components.filter((x) => x.itemCode === c.itemCode).length > 1).map((c) => c.itemCode),
  )

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitted(true)
    if (!name) { toast.error('El nombre del combo es requerido'); return }
    if (components.length < 2) { toast.error('Un combo requiere al menos 2 componentes'); return }
    if (components.some((c) => !c.itemCode)) { toast.error('Todos los componentes deben tener un artículo seleccionado'); return }
    if (components.some((c) => !c.qty || c.qty <= 0)) { toast.error('La cantidad de cada componente debe ser mayor a 0'); return }
    if (duplicateItemCodes.size > 0) { toast.error('No se puede repetir el mismo artículo como componente'); return }
    if (editId) updateMutation.mutate()
    else createMutation.mutate()
  }

  return (
    <>
    <div className="modal-overlay" onClick={requestClose}>
      <div className="modal-box" style={{ maxWidth: 640 }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2 className="modal-title">{editId ? 'Editar Combo' : 'Nuevo Combo'}</h2>
          <button className="modal-close" onClick={requestClose}><X size={16} /></button>
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
                  <input
                    className="ff-input"
                    value={itemCode}
                    onChange={(e) => setItemCode(e.target.value)}
                    placeholder="Ej: COMBO-001"
                    disabled={!!editId}
                    title={editId ? 'El código no se puede modificar una vez creado el combo' : undefined}
                  />
                </div>
                <div className="ff-wrap" style={{ maxWidth: 160 }}>
                  <label className="ff-label">Unidad de Medida del Combo</label>
                  <UomSelect value={itemUom || 'Nos'} onChange={(v) => setItemUom(v)} />
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
                    {submitted && components.length < 2 && (
                      <p className="ff-error">Un combo requiere al menos 2 componentes.</p>
                    )}
                    {components.map((comp, idx) => {
                      const isDuplicate = !!comp.itemCode && duplicateItemCodes.has(comp.itemCode)
                      return (
                        <div key={idx} style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                            <div className="ff-wrap" style={{ flex: 1 }}>
                              <ItemSelect
                                value={comp.itemCode}
                                selectedLabel={comp.itemLabel}
                                onSelect={(item) => updateComponent(idx, { itemCode: item.id, itemLabel: item.itemName, stockQty: undefined })}
                                onClear={() => updateComponent(idx, { itemCode: '', itemLabel: undefined, stockQty: undefined })}
                                placeholder="Buscar artículo…"
                              />
                            </div>
                            <div className="ff-wrap" style={{ width: 90 }}>
                              <input
                                className={`ff-input${submitted && (!comp.qty || comp.qty <= 0) ? ' ff-input-error' : ''}`}
                                type="number"
                                min="1"
                                step="1"
                                value={comp.qty}
                                onChange={(e) => updateComponent(idx, { qty: parseInt(e.target.value) || 0 })}
                                style={{ textAlign: 'right' }}
                              />
                            </div>
                            <div className="ff-wrap" style={{ width: 120 }}>
                              <UomSelect
                                value={comp.uom ?? ''}
                                onChange={(v) => updateComponent(idx, { uom: v })}
                                itemCode={comp.itemCode || undefined}
                              />
                            </div>
                            <button type="button" className="btn btn-ghost btn-size-icon-sm" style={{ marginTop: 2 }} onClick={() => removeComponent(idx)}>
                              <Trash2 size={13} />
                            </button>
                          </div>
                          {isDuplicate && (
                            <p className="ff-error" style={{ margin: 0 }}>Este artículo ya está agregado como componente.</p>
                          )}
                          {comp.stockQty != null && (
                            <p className="ff-hint" style={{ margin: 0 }}>Stock disponible: {comp.stockQty}</p>
                          )}
                        </div>
                      )
                    })}
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
              <button type="button" className="btn btn-secondary" onClick={requestClose}>Cancelar</button>
              <button type="submit" className="btn btn-primary" disabled={isPending}>
                {isPending ? 'Guardando…' : 'Guardar'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
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
