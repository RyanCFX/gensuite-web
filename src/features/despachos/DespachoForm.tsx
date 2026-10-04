// Creación directa de un despacho — venta mostrador sin pedido previo. Único de los 3 caminos de
// creación donde el frontend arma el body completo (§2.2).

import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQuery } from '@tanstack/react-query'
import { toast } from 'sonner'
import { ArrowLeft, Plus, Minus, Trash2 } from 'lucide-react'
import { crearDespacho } from '@/shared/api/despachos'
import { listWarehouses } from '@/shared/api/inventory'
import { getFacturacionConfig } from '@/shared/api/config'
import type { Item, DespachoItemDto, ApiError, DimensionesLinea, ItemDimensionDeclarada } from '@/shared/api/types'
import { isApiErrorCode, ERROR_CODES } from '@/shared/api/client'
import { formatStockInsufficientMessage } from '@/lib/stockAlerts'
import { PageHeader } from '@/components/shared/PageHeader'
import { RecargarButton } from '@/components/shared/RecargarButton'
import { SearchSelect } from '@/shared/ui/SearchSelect'
import type { SearchSelectOption } from '@/shared/ui/SearchSelect'
import { ItemSelect } from '@/shared/ui/ItemSelect'
import { getItemLookup } from '@/shared/api/catalog'
import { DepartmentSelect } from '@/components/shared/DepartmentSelect'
import { CombinacionDimensionSelector, combinacionCompleta } from '@/components/shared/CombinacionDimensionSelector'
import { mergeLineasIguales } from '@/shared/lib/mergeLineasIguales'
import { useResizableColumns } from '@/shared/hooks/useResizableColumns'
import { useOpcionesLista } from '@/shared/hooks/useOpciones'
import { OpcionesSelect } from '@/shared/ui/OpcionesSelect'

interface ItemRow {
  itemCode: string
  itemLabel: string
  qty: number
  warehouse: string
  // Declaración de dimensiones del artículo elegido (§4.2) — determina si mostramos el selector
  // de combinación y si es obligatoria antes de someter (docs/tasks/PROMPT_INVENTORY_DIMENSIONS_FRONTEND.md §0.2).
  usaDimensiones: boolean
  itemDimensiones: ItemDimensionDeclarada[]
  dimensiones: DimensionesLinea
}

function emptyRow(): ItemRow {
  return { itemCode: '', itemLabel: '', qty: 1, warehouse: '', usaDimensiones: false, itemDimensiones: [], dimensiones: {} }
}

export default function DespachoForm() {
  const navigate = useNavigate()

  const [customerId, setCustomerId] = useState('')
  const [customerLabel, setCustomerLabel] = useState('')
  const [branch, setBranch] = useState('')
  const [department, setDepartment] = useState('')
  const [notes, setNotes] = useState('')
  const [items, setItems] = useState<ItemRow[]>([emptyRow()])
  const [notesOpen, setNotesOpen] = useState(false)
  const ITEMS_COLUMNS = [
    { key: 'codigo', width: 100 },
    { key: 'articulo', width: 240 },
    { key: 'cantidad', width: 100 },
    { key: 'almacen', width: 200 },
    { key: 'combination', width: 160 },
    { key: 'actions', width: 64 },
  ]
  const { widths: colWidths, startResize } = useResizableColumns(ITEMS_COLUMNS)

  const { data: facturacionConfig } = useQuery({
    queryKey: ['facturacion-config'],
    queryFn: getFacturacionConfig,
  })
  const usaDepartamentos = facturacionConfig?.usaDepartamentos ?? true


  const { data: sucursalesData } = useOpcionesLista('sucursales', { limit: 100 })
  const mostrarSucursal = (sucursalesData?.items.length ?? 0) > 1

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
      if (isApiErrorCode(err, ERROR_CODES.SALE_WAREHOUSE_MISMATCH)) {
        toast.error(err?.message ?? '', { duration: 8000 })
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
      return prev.map((r, i) => (i === idx
        ? {
            ...r,
            itemCode: item.id,
            itemLabel: item.itemName,
            usaDimensiones: !!item.usaDimensiones,
            itemDimensiones: item.dimensiones ?? [],
            dimensiones: {},
          }
        : r))
    })
    // El picker puede no traer `dimensiones` — solo el detalle las garantiza (§4.3). Si faltan,
    // se completan para habilitar el selector de combinación.
    if (!item.dimensiones || item.dimensiones.length === 0) {
      getItemLookup(item.id).then((detail) => {
        if (!detail?.usaDimensiones || !detail.dimensiones || detail.dimensiones.length === 0) return
        const dims = detail.dimensiones
        setItems((prev) => prev.map((r, i) =>
          i === idx && r.itemCode === item.id && !(r.itemDimensiones?.length)
            ? { ...r, usaDimensiones: true, itemDimensiones: dims }
            : r,
        ))
      }).catch(() => {})
    }
    if (wasLastRow) setItems((prev) => [...prev, emptyRow()])
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!customerId) { toast.error('Selecciona un cliente'); return }
    const validRows = items.filter((r) => r.itemCode)
    if (validRows.length === 0) { toast.error('Agrega al menos un artículo'); return }
    const invalid = validRows.find((r) => !r.qty || r.qty <= 0)
    if (invalid) { toast.error('Todas las líneas necesitan una cantidad mayor a cero'); return }

    // §0.2/§11: un artículo con dimensiones exige la combinación completa en toda línea que mueva
    // stock — bloqueamos el submit acá para no dejarle al usuario un 400 confuso del servidor.
    const incompleta = validRows.find((r) => r.usaDimensiones && !combinacionCompleta(r.itemDimensiones, r.dimensiones))
    if (incompleta) {
      toast.error(`Completa la dimensión del artículo "${incompleta.itemLabel || incompleta.itemCode}" antes de continuar`)
      return
    }

    // §5.1: fusionamos líneas del mismo artículo con la misma combinación exacta antes de someter.
    const mergedRows = mergeLineasIguales(validRows, {
      getItemCode: (r) => r.itemCode,
      getDimensiones: (r) => r.dimensiones,
      sumQty: (base, extra) => ({ ...base, qty: base.qty + extra.qty }),
    })

    const dto = {
      customer: customerId,
      branch: branch || undefined,
      department: usaDepartamentos ? (department || undefined) : undefined,
      items: mergedRows.map((r): DespachoItemDto => ({
        itemCode: r.itemCode,
        qty: r.qty,
        warehouse: r.warehouse || undefined,
        // §5/§10.1: siempre mandar dimensiones cuando el artículo las usa.
        dimensiones: r.usaDimensiones ? r.dimensiones : undefined,
      })),
      notes: notes || undefined,
    }
    createMutation.mutate(dto)
  }

  return (
    <div className="page-container">
      <a className="page-back-link" onClick={() => navigate('/despachos')}><ArrowLeft size={14} /> Despachos</a>

      <PageHeader
        title={<><span className="page-title-dot" />Nuevo despacho</>}
        description="Venta mostrador sin pedido previo — el operador arma las líneas a mano. Queda en Borrador para revisar antes de someter."
        action={<RecargarButton label="Actualizar" />}
      />

      <form onSubmit={handleSubmit}>
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="card-header navy-card-header"><h2 className="card-title">Datos generales</h2></div>
          <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div className="form-row">
              <div className="ff-wrap">
                <label className="ff-label ff-required">Cliente</label>
                <OpcionesSelect recurso="clientes" value={customerId} onChange={(id, opt) => { setCustomerId(id); setCustomerLabel(opt?.label ?? '') }} placeholder="Buscar cliente…" error={!customerId} selectedLabel={customerLabel} minChars={2} />
              </div>
              {mostrarSucursal && (
                <div className="ff-wrap">
                  <label className="ff-label">Sucursal</label>
                  <OpcionesSelect recurso="sucursales" value={branch} onChange={setBranch} placeholder="Opcional" />
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
          <div className="items-table-wrap">
            <table className="items-table navy-table items-table-resizable">
                <colgroup>
                  {ITEMS_COLUMNS.map((c) => <col key={c.key} style={{ width: colWidths[c.key] }} />)}
                </colgroup>
                <thead>
                  <tr>
                    <th>
                      Código
                      <span className="col-resize-handle" onMouseDown={startResize('codigo')} />
                    </th>
                    <th>
                      Artículo
                      <span className="col-resize-handle" onMouseDown={startResize('articulo')} />
                    </th>
                    <th style={{ textAlign: 'right' }}>
                      Cantidad
                      <span className="col-resize-handle" onMouseDown={startResize('cantidad')} />
                    </th>
                    <th>
                      Almacén
                      <span className="col-resize-handle" onMouseDown={startResize('almacen')} />
                    </th>
                     <th>
                      Dimensión
                      <span className="col-resize-handle" onMouseDown={startResize('combination')} />
                    </th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {items.map((row, idx) => (
                    <tr key={idx}>
                      <td>
                        <span className="td-muted" style={{ fontSize: 12 }}>{row.itemCode || '—'}</span>
                      </td>
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
                      <td>
                        {row.usaDimensiones && (
                          <CombinacionDimensionSelector
                            itemDimensiones={row.itemDimensiones}
                            value={row.dimensiones}
                            onChange={(next) => updateRow(idx, { dimensiones: next })}
                            compact
                          />
                        )}
                      </td>
                      <td onClick={(e) => e.stopPropagation()} className="actions-cell" style={{ position: 'relative', verticalAlign: 'middle' }}>
                        <div style={{ position: 'absolute', inset: 0, display: 'flex', gap: 8, justifyContent: 'center', alignItems: 'center' }}>
                          <button
                            type="button"
                            className="btn btn-ghost btn-size-icon-xs"
                            onClick={() => setItems((prev) => prev.filter((_, i) => i !== idx))}
                            disabled={items.length === 1}
                            title="Eliminar"
                            style={{ color: 'var(--error-text)' }}
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 16px', borderTop: '1px solid var(--border)' }}>
              <button type="button" className="btn btn-ghost btn-size-sm" onClick={() => setItems((prev) => [...prev, emptyRow()])}>
                <Plus size={14} /> Agregar artículo
              </button>
            </div>
        </div>

        <div className="card" style={{ marginBottom: 16 }}>
          <div
            className="card-header navy-card-header"
            style={{ cursor: 'pointer' }}
            onClick={() => setNotesOpen((o) => !o)}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <h2 className="card-title">Notas</h2>
              <button
                type="button"
                className="navy-header-toggle-btn icon-swap"
                aria-expanded={notesOpen}
                aria-label={notesOpen ? 'Ocultar notas' : 'Mostrar notas'}
                onClick={(e) => { e.stopPropagation(); setNotesOpen((o) => !o) }}
              >
                {notesOpen ? <Minus size={13} /> : <Plus size={13} />}
              </button>
            </div>
            {!notesOpen && (
              <span className="navy-header-hint">
                Agrega comentarios para aclarar datos del despacho.
              </span>
            )}
          </div>
          {notesOpen && (
            <div className="card-body">
              <textarea className="ff-input" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
            </div>
          )}
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
