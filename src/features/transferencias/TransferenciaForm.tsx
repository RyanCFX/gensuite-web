import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate, Link } from 'react-router-dom'
import { toast } from 'sonner'
import { createTransferencia } from '@/shared/api/transferencias'
import { listAlmacenes } from '@/shared/api/config'
import { getUsuarioAlmacenesPermitidos } from '@/shared/api/usuarios'
import { getUser } from '@/shared/api/storage'
import { ItemSelect } from '@/shared/ui/ItemSelect'
import type { Item } from '@/shared/api/types'
import { ArrowLeft, Save, Plus, Trash2 } from 'lucide-react'

interface LineItem {
  itemCode: string
  itemLabel?: string
  qty: number
}

export default function TransferenciaForm() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const currentUserEmail = getUser()?.email

  const [fromWarehouse, setFromWarehouse] = useState('')
  const [toWarehouse, setToWarehouse] = useState('')
  const [items, setItems] = useState<LineItem[]>([{ itemCode: '', qty: 1 }])
  const [notes, setNotes] = useState('')
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
    ? warehouses.filter((w) => myWarehouses.warehouses.includes(w.name))
    : warehouses

  const createMutation = useMutation({
    mutationFn: () => createTransferencia({
      fromWarehouse,
      toWarehouse,
      items: items.map((i) => ({ itemCode: i.itemCode, qty: i.qty })),
      notes: notes || undefined,
    }),
    onSuccess: (t) => {
      toast.success('Transferencia creada — el stock está en tránsito')
      queryClient.invalidateQueries({ queryKey: ['transferencias'] })
      navigate(`/transferencias/${t.id}`)
    },
    onError: (err: { message?: string }) => {
      const msg = err?.message ?? ''
      if (msg.toLowerCase().includes('tránsito') || msg.toLowerCase().includes('transito')) {
        setConfigError(msg)
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

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitted(true)
    setConfigError(null)

    if (!fromWarehouse) { toast.error('Selecciona el almacén de origen'); return }
    if (!toWarehouse) { toast.error('Selecciona el almacén de destino'); return }
    if (fromWarehouse === toWarehouse) { toast.error('El almacén origen y destino no pueden ser el mismo'); return }
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
                <select
                  className={`ff-select${submitted && !fromWarehouse ? ' ff-input-error' : ''}`}
                  value={fromWarehouse}
                  onChange={(e) => setFromWarehouse(e.target.value)}
                >
                  <option value="">Selecciona un almacén…</option>
                  {originWarehouses.map((w) => (
                    <option key={w.name} value={w.name}>{w.name}</option>
                  ))}
                </select>
              </div>
              <div className="ff-wrap">
                <label className="ff-label ff-required">Almacén Destino</label>
                <select
                  className={`ff-select${submitted && (!toWarehouse || toWarehouse === fromWarehouse) ? ' ff-input-error' : ''}`}
                  value={toWarehouse}
                  onChange={(e) => setToWarehouse(e.target.value)}
                >
                  <option value="">Selecciona un almacén…</option>
                  {warehouses.map((w) => (
                    <option key={w.name} value={w.name} disabled={w.name === fromWarehouse}>{w.name}</option>
                  ))}
                </select>
                {submitted && toWarehouse && toWarehouse === fromWarehouse && (
                  <p className="ff-error">El almacén origen y destino no pueden ser el mismo.</p>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card-header"><h2 className="card-title">Artículos</h2></div>
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
          <div className="card-header"><h2 className="card-title">Notas</h2></div>
          <div className="card-body">
            <textarea className="ff-textarea" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Observaciones sobre esta transferencia…" rows={3} />
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button type="button" className="btn btn-secondary" onClick={() => navigate('/transferencias')}>Cancelar</button>
          <button type="submit" className="btn btn-primary" disabled={createMutation.isPending}>
            <Save size={15} />
            {createMutation.isPending ? 'Guardando…' : 'Crear Transferencia'}
          </button>
        </div>
      </form>
    </div>
  )
}
