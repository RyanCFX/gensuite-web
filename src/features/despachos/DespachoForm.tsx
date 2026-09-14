// Creación directa de un despacho — venta mostrador sin pedido previo. Único de los 3 caminos de
// creación donde el frontend arma el body completo (§2.2).

import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQuery } from '@tanstack/react-query'
import { toast } from 'sonner'
import { ArrowLeft, Plus, Trash2 } from 'lucide-react'
import { crearDespacho } from '@/shared/api/despachos'
import { listCustomers } from '@/shared/api/customers'
import { listSucursales } from '@/shared/api/sucursales'
import { listWarehouses } from '@/shared/api/inventory'
import { getFacturacionConfig } from '@/shared/api/config'
import type { Item, DespachoItemDto, ApiError } from '@/shared/api/types'
import { isApiErrorCode, ERROR_CODES } from '@/shared/api/client'
import { formatStockInsufficientMessage } from '@/lib/stockAlerts'
import { PageHeader } from '@/components/shared/PageHeader'
import { SearchSelect } from '@/shared/ui/SearchSelect'
import type { SearchSelectOption } from '@/shared/ui/SearchSelect'
import { ItemSelect } from '@/shared/ui/ItemSelect'
import { DepartmentSelect } from '@/components/shared/DepartmentSelect'

interface ItemRow {
  itemCode: string
  itemLabel: string
  qty: number
  warehouse: string
}

function emptyRow(): ItemRow {
  return { itemCode: '', itemLabel: '', qty: 1, warehouse: '' }
}

export default function DespachoForm() {
  const navigate = useNavigate()

  const [customerId, setCustomerId] = useState('')
  const [customerLabel, setCustomerLabel] = useState('')
  const [customerQuery, setCustomerQuery] = useState('')
  const [branch, setBranch] = useState('')
  const [branchQuery, setBranchQuery] = useState('')
  const [department, setDepartment] = useState('')
  const [notes, setNotes] = useState('')
  const [items, setItems] = useState<ItemRow[]>([emptyRow()])

  const { data: facturacionConfig } = useQuery({
    queryKey: ['facturacion-config'],
    queryFn: getFacturacionConfig,
    staleTime: 5 * 60_000,
  })
  const usaDepartamentos = facturacionConfig?.usaDepartamentos ?? true

  const { data: customersData, isLoading: customersLoading } = useQuery({
    queryKey: ['customerSearch-despacho', customerQuery],
    queryFn: () => listCustomers({ search: customerQuery || undefined, limit: 15 }),
  })
  const customerOptions: SearchSelectOption[] = (customersData?.items ?? []).map((c) => ({ value: c.id, label: c.customerName }))

  const { data: sucursalesData } = useQuery({ queryKey: ['sucursales-all'], queryFn: () => listSucursales({ limit: 100 }) })
  const mostrarSucursal = (sucursalesData?.items.length ?? 0) > 1
  const branchOptions: SearchSelectOption[] = (sucursalesData?.items ?? [])
    .filter((s) => !branchQuery || s.name.toLowerCase().includes(branchQuery.toLowerCase()))
    .map((s) => ({ value: s.name, label: s.name }))

  const { data: warehousesData } = useQuery({ queryKey: ['warehouses'], queryFn: () => listWarehouses() })
  const [warehouseSearch, setWarehouseSearch] = useState('')
  const warehouseOptions: SearchSelectOption[] = (warehousesData ?? [])
    .filter((w) => !warehouseSearch || w.name.toLowerCase().includes(warehouseSearch.toLowerCase()))
    .map((w) => ({ value: w.id, label: w.name }))

  const createMutation = useMutation({
    mutationFn: crearDespacho,
    onSuccess: (despacho) => {
      toast.success(`Despacho ${despacho.id} creado en Borrador`)
      navigate(`/despachos/${despacho.id}`)
    },
    onError: (err: ApiError) => {
      if (isApiErrorCode(err, ERROR_CODES.STOCK_INSUFFICIENT_OR_RESERVED)) {
        toast.error(formatStockInsufficientMessage(err), { duration: 8000 })
        return
      }
      toast.error(err?.message ?? 'Error al crear el despacho')
    },
  })

  function updateRow(idx: number, patch: Partial<ItemRow>) {
    setItems((prev) => prev.map((r, i) => (i === idx ? { ...r, ...patch } : r)))
  }

  function selectCatalogItem(idx: number, item: Item) {
    let wasLastRow = false
    setItems((prev) => {
      wasLastRow = idx === prev.length - 1
      return prev.map((r, i) => (i === idx ? { ...r, itemCode: item.id, itemLabel: item.itemName } : r))
    })
    if (wasLastRow) setItems((prev) => [...prev, emptyRow()])
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!customerId) { toast.error('Selecciona un cliente'); return }
    const validRows = items.filter((r) => r.itemCode)
    if (validRows.length === 0) { toast.error('Agrega al menos un artículo'); return }
    const invalid = validRows.find((r) => !r.qty || r.qty <= 0)
    if (invalid) { toast.error('Todas las líneas necesitan una cantidad mayor a cero'); return }

    const dto = {
      customer: customerId,
      branch: branch || undefined,
      department: usaDepartamentos ? (department || undefined) : undefined,
      items: validRows.map((r): DespachoItemDto => ({
        itemCode: r.itemCode,
        qty: r.qty,
        warehouse: r.warehouse || undefined,
      })),
      notes: notes || undefined,
    }
    createMutation.mutate(dto)
  }

  return (
    <div className="page-container">
      <a className="page-back-link" onClick={() => navigate('/despachos')}><ArrowLeft size={14} /> Despachos</a>

      <PageHeader
        title="Nuevo despacho"
        description="Venta mostrador sin pedido previo — el operador arma las líneas a mano. Queda en Borrador para revisar antes de someter."
      />

      <form onSubmit={handleSubmit}>
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="card-header"><h2 className="card-title">Datos generales</h2></div>
          <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div className="form-row form-row-3">
              <div className="ff-wrap">
                <label className="ff-label ff-required">Cliente</label>
                <SearchSelect
                  value={customerId}
                  selectedLabel={customerLabel}
                  onChange={(id, opt) => { setCustomerId(id); setCustomerLabel(opt?.label ?? '') }}
                  options={customerOptions}
                  onSearch={setCustomerQuery}
                  loading={customersLoading}
                  placeholder="Buscar cliente…"
                  error={!customerId}
                />
              </div>
              {mostrarSucursal && (
                <div className="ff-wrap">
                  <label className="ff-label">Sucursal</label>
                  <SearchSelect
                    value={branch}
                    onChange={setBranch}
                    options={branchOptions}
                    onSearch={setBranchQuery}
                    placeholder="Opcional"
                  />
                </div>
              )}
              {usaDepartamentos && (
                <div className="ff-wrap">
                  <label className="ff-label">Departamento</label>
                  <DepartmentSelect value={department} onChange={setDepartment} placeholder="Opcional" />
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="card" style={{ marginBottom: 16 }}>
          <div className="card-header">
            <span className="card-title">Artículos</span>
            <button type="button" className="btn btn-secondary btn-size-sm" onClick={() => setItems((prev) => [...prev, emptyRow()])}>
              <Plus size={14} /> Agregar
            </button>
          </div>
          <div className="card-body" style={{ padding: 0 }}>
            <div className="items-table-wrap" style={{ border: 'none', borderRadius: 0 }}>
              <table className="items-table">
                <thead>
                  <tr>
                    <th style={{ minWidth: 240 }}>Artículo</th>
                    <th style={{ width: '15%', textAlign: 'right' }}>Cantidad</th>
                    <th style={{ width: '30%' }}>Almacén</th>
                    <th style={{ width: 64 }} />
                  </tr>
                </thead>
                <tbody>
                  {items.map((row, idx) => (
                    <tr key={idx}>
                      <td style={{ minWidth: 240 }}>
                        <ItemSelect
                          value={row.itemCode}
                          selectedLabel={row.itemLabel}
                          onSelect={(item) => selectCatalogItem(idx, item)}
                          onClear={() => updateRow(idx, { itemCode: '', itemLabel: '' })}
                          placeholder="Buscar artículo…"
                          typeFilter="product"
                        />
                      </td>
                      <td>
                        <input
                          className="items-input"
                          type="number"
                          min="0.01"
                          step="0.01"
                          style={{ textAlign: 'right' }}
                          value={row.qty}
                          onChange={(e) => updateRow(idx, { qty: parseFloat(e.target.value) || 0 })}
                        />
                      </td>
                      <td>
                        <SearchSelect
                          value={row.warehouse}
                          onChange={(v) => updateRow(idx, { warehouse: v })}
                          options={warehouseOptions}
                          onSearch={setWarehouseSearch}
                          selectedLabel={warehousesData?.find((w) => w.id === row.warehouse)?.name ?? ''}
                          placeholder="Default del usuario"
                          className="items-input"
                        />
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <button
                          type="button"
                          className="btn btn-ghost btn-size-icon-sm"
                          onClick={() => setItems((prev) => prev.filter((_, i) => i !== idx))}
                          disabled={items.length === 1}
                        >
                          <Trash2 size={14} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <div className="card" style={{ marginBottom: 16 }}>
          <div className="card-header"><h2 className="card-title">Notas</h2></div>
          <div className="card-body">
            <textarea className="ff-input" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
        </div>

        <div className="doc-actions-bar">
          <button type="button" className="btn btn-ghost" onClick={() => navigate('/despachos')}>Cancelar</button>
          <button type="submit" className="btn btn-navy" disabled={createMutation.isPending}>
            {createMutation.isPending ? 'Creando…' : 'Crear despacho'}
          </button>
        </div>
      </form>
    </div>
  )
}
