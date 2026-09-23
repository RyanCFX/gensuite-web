import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate, Link } from 'react-router-dom'
import { toast } from 'sonner'
import { useTabs } from '@/contexts/TabsContext'
import { createTransferencia } from '@/shared/api/transferencias'
import { listAlmacenes } from '@/shared/api/config'
import { listUbicaciones } from '@/shared/api/ubicaciones'
import { getUsuarioAlmacenesPermitidos } from '@/shared/api/usuarios'
import { getCachedUser } from '@/shared/api/storage'
import { ItemSelect } from '@/shared/ui/ItemSelect'
import { SearchSelect } from '@/shared/ui/SearchSelect'
import type { SearchSelectOption } from '@/shared/ui/SearchSelect'
import type { Item, ApiError } from '@/shared/api/types'
import { isApiErrorCode, ERROR_CODES } from '@/shared/api/client'
import { formatStockInsufficientMessage } from '@/lib/stockAlerts'
import { ArrowLeft, Save, Plus, Trash2, Loader2 } from 'lucide-react'
import { RecargarButton } from '@/components/shared/RecargarButton'
import { useDirtyCheck } from '@/shared/hooks/useDirtyCheck'
import { useBeforeUnloadWarning } from '@/shared/hooks/useBeforeUnloadWarning'

interface LineItem {
  itemCode: string
  itemLabel?: string
  qty: number
}

export default function TransferenciaForm() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { multiTab, activeId, closeTab } = useTabs()
  const currentUserEmail = getCachedUser()?.email

  const [fromAlmacen, setFromAlmacen] = useState('')
  const [fromAlmacenLabel, setFromAlmacenLabel] = useState('')
  const [fromUbicacion, setFromUbicacion] = useState('')
  const [fromUbicacionLabel, setFromUbicacionLabel] = useState('')
  const [toAlmacen, setToAlmacen] = useState('')
  const [toAlmacenLabel, setToAlmacenLabel] = useState('')
  const [toUbicacion, setToUbicacion] = useState('')
  const [toUbicacionLabel, setToUbicacionLabel] = useState('')
  const [items, setItems] = useState<LineItem[]>([{ itemCode: '', qty: 1 }])
  const [notes, setNotes] = useState('')
  const [notesOpen, setNotesOpen] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [configError, setConfigError] = useState<string | null>(null)

  const { data: warehousesData } = useQuery({
    queryKey: ['almacenes-all'],
    queryFn: () => listAlmacenes(),
  })
  const warehouses = warehousesData ?? []

  const { data: myWarehouses } = useQuery({
    queryKey: ['usuarioAlmacenesPermitidos', currentUserEmail],
    queryFn: () => getUsuarioAlmacenesPermitidos(currentUserEmail!),
    enabled: !!currentUserEmail,
    staleTime: 60_000,
  })

  // Origen: preferimos limitarlo a los almacenes que el usuario tiene permitidos,
  // pero si esa lista aún no carga o viene vacía mostramos todos (el backend valida igual).
  const originWarehouses = myWarehouses?.warehouses.length
    ? warehouses.filter((w) => myWarehouses.warehouses.includes(w.id))
    : warehouses

  const [fromWarehouseSearch, setFromWarehouseSearch] = useState('')
  const fromWarehouseOptions: SearchSelectOption[] = originWarehouses
    .filter((w) => !fromWarehouseSearch || w.name.toLowerCase().includes(fromWarehouseSearch.toLowerCase()))
    .map((w) => ({ value: w.id, label: w.name }))

  const [toWarehouseSearch, setToWarehouseSearch] = useState('')
  const toWarehouseOptions: SearchSelectOption[] = warehouses
    .filter((w) => !toWarehouseSearch || w.name.toLowerCase().includes(toWarehouseSearch.toLowerCase()))
    .map((w) => ({ value: w.id, label: w.name }))

  // Ubicación/Rack (opcional) dentro del almacén elegido — solo se cargan una vez que hay
  // almacén seleccionado. Si el usuario no elige una ubicación específica, la transferencia
  // aplica al almacén completo.
  const [fromUbicacionSearch, setFromUbicacionSearch] = useState('')
  const { data: fromUbicacionesData } = useQuery({
    queryKey: ['ubicaciones-by-warehouse', fromAlmacen],
    queryFn: () => listUbicaciones({ warehouse: fromAlmacen, includeDisabled: false }),
    enabled: !!fromAlmacen,
  })
  const fromUbicaciones = fromUbicacionesData?.items ?? []
  const fromUbicacionOptions: SearchSelectOption[] = fromUbicaciones
    .filter((u) => !fromUbicacionSearch || u.ubicacionName.toLowerCase().includes(fromUbicacionSearch.toLowerCase()))
    .map((u) => ({ value: u.id, label: u.ubicacionName }))

  const [toUbicacionSearch, setToUbicacionSearch] = useState('')
  const { data: toUbicacionesData } = useQuery({
    queryKey: ['ubicaciones-by-warehouse', toAlmacen],
    queryFn: () => listUbicaciones({ warehouse: toAlmacen, includeDisabled: false }),
    enabled: !!toAlmacen,
  })
  const toUbicaciones = toUbicacionesData?.items ?? []
  const toUbicacionOptions: SearchSelectOption[] = toUbicaciones
    .filter((u) => !toUbicacionSearch || u.ubicacionName.toLowerCase().includes(toUbicacionSearch.toLowerCase()))
    .map((u) => ({ value: u.id, label: u.ubicacionName }))

  // Warehouse real que se manda al backend: si eligieron una ubicación/rack específico se usa
  // su `warehouseReal` (el Warehouse real en ERPNext); si no, el almacén completo (`w.id`).
  const fromWarehouse = fromUbicacion
    ? fromUbicaciones.find((u) => u.id === fromUbicacion)?.warehouseReal ?? ''
    : fromAlmacen
  const toWarehouse = toUbicacion
    ? toUbicaciones.find((u) => u.id === toUbicacion)?.warehouseReal ?? ''
    : toAlmacen

  function handleFromAlmacenChange(value: string, option: SearchSelectOption | null) {
    setFromAlmacen(value)
    setFromAlmacenLabel(option?.label ?? '')
    setFromUbicacion('')
    setFromUbicacionLabel('')
  }
  function handleToAlmacenChange(value: string, option: SearchSelectOption | null) {
    setToAlmacen(value)
    setToAlmacenLabel(option?.label ?? '')
    setToUbicacion('')
    setToUbicacionLabel('')
  }

  const createMutation = useMutation({
    mutationFn: () => createTransferencia({
      fromWarehouse,
      toWarehouse,
      items: items.map((i) => ({ itemCode: i.itemCode, qty: i.qty })),
      notes: notes || undefined,
    }),
    onSuccess: (t) => {
      toast.success('Transferencia creada — el stock está en tránsito')
      const formTabId = activeId
      queryClient.invalidateQueries({ queryKey: ['transferencias'] })
      navigate(`/transferencias/${t.id}`)
      // La pestaña del formulario ya no representa nada útil una vez guardado — se cierra sin
      // navegar (ya se navegó arriba) para no arrastrar su estado/cache si el usuario la reabre.
      if (multiTab && formTabId) closeTab(formTabId, { skipNavigate: true })
    },
    onError: (err: ApiError) => {
      const msg = err?.message ?? ''
      if (msg.toLowerCase().includes('tránsito') || msg.toLowerCase().includes('transito')) {
        setConfigError(msg)
        return
      }
      if (isApiErrorCode(err, ERROR_CODES.STOCK_INSUFFICIENT_OR_RESERVED)) {
        toast.error(formatStockInsufficientMessage(err), { duration: 8000 })
        return
      }
      toast.error(msg || 'Error al crear la transferencia')
    },
  })

  function updateItem(index: number, patch: Partial<LineItem>) {
    setItems((prev) => prev.map((it, i) => i === index ? { ...it, ...patch } : it))
  }
  function addRow() { setItems((prev) => [...prev, { itemCode: '', qty: 1 }]) }
  function removeRow(index: number) { setItems((prev) => prev.filter((_, i) => i !== index)) }

  const isDirty = useDirtyCheck({ fromAlmacen, fromUbicacion, toAlmacen, toUbicacion, items, notes }, true)
  useBeforeUnloadWarning(isDirty)

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitted(true)
    setConfigError(null)

    if (!fromAlmacen) { toast.error('Selecciona el almacén de origen'); return }
    if (!toAlmacen) { toast.error('Selecciona el almacén de destino'); return }
    if (fromWarehouse === toWarehouse) { toast.error('El almacén/ubicación origen y destino no pueden ser el mismo'); return }
    if (items.length === 0) { toast.error('Agrega al menos un artículo'); return }
    for (let i = 0; i < items.length; i++) {
      if (!items[i].itemCode) { toast.error(`Línea ${i + 1}: selecciona un artículo`); return }
      if (!items[i].qty || items[i].qty <= 0) { toast.error(`Línea ${i + 1}: la cantidad debe ser mayor a 0`); return }
    }

    createMutation.mutate()
  }

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <a className="page-back-link" onClick={() => navigate('/transferencias')}><ArrowLeft size={14} /> Transferencias</a>
          <h1 className="page-title">Nueva Transferencia</h1>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          <RecargarButton label="Actualizar" />
        </div>
      </div>

      {configError && (
        <div className="inline-alert inline-alert-warn" style={{ marginBottom: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <span>{configError}</span>
          <Link to="/config/empresa" className="btn btn-secondary btn-size-sm" style={{ alignSelf: 'flex-start' }}>
            Ir a Configuración → Empresa
          </Link>
        </div>
      )}

      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
        <div className="card">
          <div className="card-header"><h2 className="card-title">Información General</h2></div>
          <div className="card-body">
            <div className="form-row">
              <div className="ff-wrap">
                <label className="ff-label ff-required">Almacén Origen</label>
                <SearchSelect
                  value={fromAlmacen}
                  onChange={handleFromAlmacenChange}
                  options={fromWarehouseOptions}
                  onSearch={setFromWarehouseSearch}
                  selectedLabel={fromAlmacenLabel}
                  placeholder="Selecciona un almacén…"
                  error={submitted && !fromAlmacen}
                />
              </div>
              <div className="ff-wrap">
                <label className="ff-label ff-required">Almacén Destino</label>
                <SearchSelect
                  value={toAlmacen}
                  onChange={handleToAlmacenChange}
                  options={toWarehouseOptions}
                  onSearch={setToWarehouseSearch}
                  selectedLabel={toAlmacenLabel}
                  placeholder="Selecciona un almacén…"
                  error={submitted && !toAlmacen}
                />
              </div>
            </div>
            <div className="form-row">
              <div className="ff-wrap">
                <label className="ff-label">Ubicación / Rack (opcional)</label>
                <SearchSelect
                  value={fromUbicacion}
                  onChange={(value, option) => { setFromUbicacion(value); setFromUbicacionLabel(option?.label ?? '') }}
                  options={fromUbicacionOptions}
                  onSearch={setFromUbicacionSearch}
                  selectedLabel={fromUbicacionLabel}
                  placeholder={fromAlmacen ? 'Todo el almacén (opcional elegir rack)…' : 'Selecciona primero un almacén…'}
                  disabled={!fromAlmacen}
                />
              </div>
              <div className="ff-wrap">
                <label className="ff-label">Ubicación / Rack (opcional)</label>
                <SearchSelect
                  value={toUbicacion}
                  onChange={(value, option) => { setToUbicacion(value); setToUbicacionLabel(option?.label ?? '') }}
                  options={toUbicacionOptions}
                  onSearch={setToUbicacionSearch}
                  selectedLabel={toUbicacionLabel}
                  placeholder={toAlmacen ? 'Todo el almacén (opcional elegir rack)…' : 'Selecciona primero un almacén…'}
                  disabled={!toAlmacen}
                />
              </div>
            </div>
            {submitted && fromWarehouse && fromWarehouse === toWarehouse && (
              <p className="ff-error">El almacén/ubicación origen y destino no pueden ser el mismo.</p>
            )}
          </div>
        </div>

        <div className="card">
          <div className="items-table-wrap">
            <table className="items-table">
              <thead>
                <tr>
                  <th style={{ minWidth: 240 }}>Artículo</th>
                  <th style={{ textAlign: 'right', width: 120 }}>Cantidad</th>
                  <th style={{ width: 40 }} />
                </tr>
              </thead>
              <tbody>
                {items.map((item, index) => (
                  <tr key={index}>
                    <td>
                      <ItemSelect
                        value={item.itemCode}
                        selectedLabel={item.itemLabel}
                        typeFilter="product"
                        onSelect={(catalogItem: Item) => updateItem(index, { itemCode: catalogItem.id, itemLabel: catalogItem.itemName })}
                        onClear={() => updateItem(index, { itemCode: '', itemLabel: undefined })}
                      />
                    </td>
                    <td>
                      <input
                        className={`items-input${submitted && (!item.qty || item.qty <= 0) ? ' items-input-error' : ''}`}
                        type="number"
                        min="0"
                        step="1"
                        value={item.qty}
                        onChange={(e) => updateItem(index, { qty: parseFloat(e.target.value) || 0 })}
                        style={{ textAlign: 'right' }}
                      />
                    </td>
                    <td>
                      <button type="button" className="btn btn-ghost btn-size-icon-sm" onClick={() => removeRow(index)} disabled={items.length === 1}>
                        <Trash2 size={13} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div style={{ padding: '8px 16px', borderTop: '1px solid var(--border)' }}>
              <button type="button" className="btn btn-ghost btn-size-sm" onClick={addRow}><Plus size={14} /> Agregar artículo</button>
            </div>
          </div>
        </div>

        <div className="card">
          <div
            className="card-header navy-card-header"
            style={{ cursor: 'pointer' }}
            onClick={() => setNotesOpen((o) => !o)}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <h2 className="card-title">Notas Adicionales</h2>
              <button
                type="button"
                className="navy-header-toggle-btn"
                aria-expanded={notesOpen}
                aria-label={notesOpen ? 'Ocultar notas' : 'Mostrar notas'}
                onClick={(e) => { e.stopPropagation(); setNotesOpen((o) => !o) }}
              >
                <Plus size={13} />
              </button>
            </div>
            {!notesOpen && (
              <span className="navy-header-hint">
                Agrega comentarios para aclarar detalles de esta transferencia.
              </span>
            )}
          </div>
          {notesOpen && (
            <div className="card-body">
              <textarea className="ff-textarea" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Observaciones sobre esta transferencia…" rows={3} />
            </div>
          )}
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
          <button type="button" className="btn btn-ghost" onClick={() => navigate('/transferencias')}>Cancelar</button>
          <button type="submit" className="btn btn-navy" disabled={createMutation.isPending}>
            {createMutation.isPending
              ? <Loader2 size={15} style={{ animation: 'spin 1s linear infinite' }} />
              : <Save size={15} />}
            {createMutation.isPending ? 'Guardando…' : 'Crear Transferencia'}
          </button>
        </div>
      </form>
    </div>
  )
}
