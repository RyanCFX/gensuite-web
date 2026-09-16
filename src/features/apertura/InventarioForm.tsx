// Cargar inventario inicial — docs/tasks/PROMPT_APERTURA_INVENTARIO_FRONTEND.md §4.
// Crea Y confirma en una sola llamada, igual que Ventas/Compras: no hay borrador ni edición
// (corregir = anular + volver a cargar, §7). Sin /importar (§6) — la grilla ya acepta muchas
// líneas en una sola llamada.

import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQuery } from '@tanstack/react-query'
import { toast } from 'sonner'
import { ArrowLeft, AlertTriangle, Info, Plus, Trash2 } from 'lucide-react'
import { crearAperturaInventario } from '@/shared/api/apertura'
import { listAlmacenes } from '@/shared/api/config'
import { listSucursales } from '@/shared/api/sucursales'
import { getFacturacionConfig } from '@/shared/api/config'
import type { AperturaInventarioItemDto, CrearAperturaInventarioDto, AperturaInventario, Item } from '@/shared/api/types'
import { isApiErrorCode, ERROR_CODES } from '@/shared/api/client'
import { PageHeader } from '@/components/shared/PageHeader'
import { DatePicker } from '@/shared/ui/DatePicker'
import { SearchSelect } from '@/shared/ui/SearchSelect'
import type { SearchSelectOption } from '@/shared/ui/SearchSelect'
import { ItemSelect } from '@/shared/ui/ItemSelect'
import { DepartmentSelect } from '@/components/shared/DepartmentSelect'
import { Modal } from '@/shared/ui/Modal'
import { formatMoney } from '@/lib/formatters'
import { today, usePreflightGate } from './lib'

interface LineItem {
  itemCode: string
  itemLabel?: string
  warehouse: string
  qty: number | ''
  valuationRate: number | ''
}

function emptyRow(): LineItem {
  return { itemCode: '', warehouse: '', qty: '', valuationRate: '' }
}

export default function InventarioForm() {
  const navigate = useNavigate()
  const { listo, isLoading: loadingPreflight } = usePreflightGate()

  const [fechaApertura, setFechaApertura] = useState(today())
  const [remarks, setRemarks] = useState('')
  const [branch, setBranch] = useState('')
  const [department, setDepartment] = useState('')
  const [items, setItems] = useState<LineItem[]>([emptyRow()])
  const [branchQuery, setBranchQuery] = useState('')
  const [warehouseSearch, setWarehouseSearch] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [created, setCreated] = useState<AperturaInventario | null>(null)

  const { data: facturacionConfig } = useQuery({
    queryKey: ['facturacion-config'],
    queryFn: getFacturacionConfig,
    staleTime: 5 * 60_000,
  })
  const usaDepartamentos = facturacionConfig?.usaDepartamentos ?? true

  const { data: sucursalesData } = useQuery({
    queryKey: ['sucursales-all'],
    queryFn: () => listSucursales({ limit: 100 }),
    staleTime: 60_000,
  })
  const mostrarSucursal = (sucursalesData?.items.length ?? 0) > 1
  const branchOptions: SearchSelectOption[] = (sucursalesData?.items ?? [])
    .filter((s) => !branchQuery || s.name.toLowerCase().includes(branchQuery.toLowerCase()))
    .map((s) => ({ value: s.name, label: s.name }))

  const { data: almacenes } = useQuery({
    queryKey: ['almacenes-all'],
    queryFn: () => listAlmacenes(),
    staleTime: 60_000,
  })
  const warehouseOptions: SearchSelectOption[] = (almacenes ?? [])
    .filter((a) => !a.disabled && (!warehouseSearch || a.name.toLowerCase().includes(warehouseSearch.toLowerCase())))
    .map((a) => ({ value: a.id, label: a.name }))

  // Mapa almacén -> sucursal, para detectar mezcla de sucursales en las líneas (§5) — el mismo
  // criterio que ya usa CountsPage para MIXED_BRANCH_COUNT, aplicado acá al código de error propio
  // de esta pantalla (MIXED_BRANCH_APERTURA_INVENTARIO).
  const warehouseToBranch = useMemo(() => {
    const map = new Map<string, string>()
    almacenes?.forEach((a) => { if (a.branch) map.set(a.id, a.branch) })
    return map
  }, [almacenes])

  const usedBranches = useMemo(() => {
    const set = new Set<string>()
    items.forEach((row) => {
      const b = warehouseToBranch.get(row.warehouse)
      if (b) set.add(b)
    })
    return set
  }, [items, warehouseToBranch])
  const hasMixedBranches = usedBranches.size > 1

  const montoTotalPreview = items.reduce((sum, r) => {
    const qty = typeof r.qty === 'number' ? r.qty : 0
    const rate = typeof r.valuationRate === 'number' ? r.valuationRate : 0
    return sum + qty * rate
  }, 0)

  const createMutation = useMutation({
    mutationFn: (dto: CrearAperturaInventarioDto) => crearAperturaInventario(dto),
    onSuccess: (data) => {
      setCreated(data)
    },
    onError: (err: unknown) => {
      const msg = (err as { message?: string })?.message ?? 'Error al cargar el inventario inicial'
      if (isApiErrorCode(err, ERROR_CODES.MIXED_BRANCH_APERTURA_INVENTARIO)) {
        toast.error(`${msg} Separa esta carga en varios documentos, uno por sucursal.`)
        return
      }
      if (isApiErrorCode(err, ERROR_CODES.BRANCH_REQUIRED)) {
        toast.error(msg)
        return
      }
      toast.error(msg)
    },
  })

  function updateItem(index: number, patch: Partial<LineItem>) {
    setItems((prev) => prev.map((it, i) => (i === index ? { ...it, ...patch } : it)))
  }
  function selectCatalogItem(index: number, item: Item) {
    updateItem(index, { itemCode: item.id, itemLabel: item.itemName })
  }
  function addRow() { setItems((prev) => [...prev, emptyRow()]) }
  function removeRow(index: number) { setItems((prev) => prev.filter((_, i) => i !== index)) }

  function resetForm() {
    setFechaApertura(today())
    setRemarks('')
    setBranch('')
    setDepartment('')
    setItems([emptyRow()])
    setSubmitted(false)
    setCreated(null)
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitted(true)

    const validRows = items.filter((r) => r.itemCode)
    if (validRows.length === 0) {
      toast.error('Agrega al menos un artículo')
      return
    }
    if (fechaApertura > today()) {
      toast.error('La fecha de apertura no puede ser futura.')
      return
    }
    for (let i = 0; i < validRows.length; i++) {
      const row = validRows[i]
      const num = i + 1
      if (!row.warehouse) { toast.error(`Línea ${num}: selecciona un almacén`); return }
      if (row.qty === '' || row.qty < 0) { toast.error(`Línea ${num}: la cantidad no puede ser negativa (0 es válido)`); return }
      if (row.valuationRate === '' || row.valuationRate <= 0) { toast.error(`Línea ${num}: el costo unitario debe ser mayor a cero`); return }
    }

    const itemsDto: AperturaInventarioItemDto[] = validRows.map((r) => ({
      itemCode: r.itemCode,
      warehouse: r.warehouse,
      qty: Number(r.qty),
      valuationRate: Number(r.valuationRate),
    }))

    const dto: CrearAperturaInventarioDto = {
      fechaApertura,
      remarks: remarks || undefined,
      items: itemsDto,
      branch: branch || undefined,
      department: department || undefined,
    }
    createMutation.mutate(dto)
  }

  return (
    <div className="page-container">
      <a className="page-back-link" onClick={() => navigate('/apertura/inventario')}>
        <ArrowLeft size={14} /> Inventario — Apertura
      </a>

      <PageHeader
        title="Cargar inventario inicial"
        description="Migra el saldo físico (stock por artículo/almacén) que existía en el sistema anterior."
      />

      {!loadingPreflight && !listo && (
        <div className="inline-alert inline-alert-error" style={{ marginBottom: 16 }}>
          <AlertTriangle size={16} />
          Tu empresa todavía no está lista para migrar saldos —{' '}
          <a onClick={() => navigate('/apertura/diagnostico')} style={{ cursor: 'pointer', textDecoration: 'underline' }}>
            revisa el Diagnóstico
          </a>{' '}
          antes de continuar. El servidor rechazará este formulario.
        </div>
      )}

      <form onSubmit={handleSubmit}>
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="card-header"><h2 className="card-title">Datos generales</h2></div>
          <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div className="form-row form-row-3">
              <div className="ff-wrap">
                <label className="ff-label ff-required">Fecha de apertura</label>
                <DatePicker value={fechaApertura} onChange={setFechaApertura} max={today()} />
              </div>
              {mostrarSucursal && (
                <div className="ff-wrap">
                  <label className="ff-label">Sucursal</label>
                  <SearchSelect
                    value={branch}
                    onChange={setBranch}
                    options={branchOptions}
                    onSearch={setBranchQuery}
                    selectedLabel={branch}
                    placeholder="Auto (según almacenes)"
                  />
                </div>
              )}
              {usaDepartamentos && (
                <div className="ff-wrap">
                  <label className="ff-label">Departamento</label>
                  <DepartmentSelect value={department} onChange={setDepartment} placeholder="Opcional" />
                </div>
              )}
              <div className="ff-wrap" style={{ gridColumn: 'span 2' }}>
                <label className="ff-label">Notas</label>
                <input
                  className="ff-input"
                  placeholder="Apertura de inventario — saldo inicial del sistema anterior"
                  value={remarks}
                  onChange={(e) => setRemarks(e.target.value)}
                />
              </div>
            </div>
          </div>
        </div>

        <div className="card" style={{ marginBottom: 16 }}>
          <div className="card-header"><h2 className="card-title">Artículos</h2></div>
          <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <p className="ff-hint" style={{ display: 'flex', gap: 6, alignItems: 'flex-start', margin: 0 }}>
              <Info size={13} style={{ flexShrink: 0, marginTop: 2 }} />
              La cantidad es el saldo TOTAL que existe de ese artículo en ese almacén — no una cantidad a sumar.
              Si te equivocaste, anula este documento y carga uno nuevo con la cantidad correcta.
            </p>

            {hasMixedBranches && (
              <div className="inline-alert inline-alert-warn" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <AlertTriangle size={16} />
                <span>Estás mezclando almacenes de sucursales distintas — un documento de apertura de inventario no puede mezclarlas. Separa esta carga en varios documentos, uno por sucursal.</span>
              </div>
            )}

            <div className="items-table-wrap">
              <table className="items-table">
                <thead>
                  <tr>
                    <th style={{ minWidth: 220 }}>Artículo</th>
                    <th style={{ minWidth: 180 }}>Almacén</th>
                    <th style={{ textAlign: 'right', width: 120 }}>Cantidad</th>
                    <th style={{ textAlign: 'right', width: 140 }}>Costo unitario</th>
                    <th style={{ textAlign: 'right', width: 120 }}>Importe</th>
                    <th style={{ width: 40 }} />
                  </tr>
                </thead>
                <tbody>
                  {items.map((row, index) => {
                    const qty = typeof row.qty === 'number' ? row.qty : 0
                    const rate = typeof row.valuationRate === 'number' ? row.valuationRate : 0
                    const rowBranch = warehouseToBranch.get(row.warehouse)
                    const rowMixed = hasMixedBranches && rowBranch && usedBranches.has(rowBranch)
                    return (
                      <tr key={index}>
                        <td>
                          <ItemSelect
                            value={row.itemCode}
                            selectedLabel={row.itemLabel}
                            typeFilter="product"
                            onSelect={(item) => selectCatalogItem(index, item)}
                            onClear={() => updateItem(index, { itemCode: '', itemLabel: undefined })}
                          />
                        </td>
                        <td>
                          <SearchSelect
                            value={row.warehouse}
                            onChange={(v) => updateItem(index, { warehouse: v })}
                            options={warehouseOptions}
                            onSearch={setWarehouseSearch}
                            selectedLabel={warehouseOptions.find((w) => w.value === row.warehouse)?.label ?? ''}
                            placeholder="Almacén"
                            error={rowMixed ? true : (submitted && !!row.itemCode && !row.warehouse)}
                          />
                        </td>
                        <td>
                          <input
                            className={`items-input${submitted && row.itemCode && (row.qty === '' || row.qty < 0) ? ' items-input-error' : ''}`}
                            type="number"
                            min="0"
                            step="1"
                            placeholder="0"
                            value={row.qty}
                            onChange={(e) => updateItem(index, { qty: e.target.value === '' ? '' : parseFloat(e.target.value) })}
                            style={{ textAlign: 'right' }}
                          />
                        </td>
                        <td>
                          <input
                            className={`items-input${submitted && row.itemCode && (row.valuationRate === '' || row.valuationRate <= 0) ? ' items-input-error' : ''}`}
                            type="number"
                            min="0.01"
                            step="0.01"
                            placeholder="0.00"
                            value={row.valuationRate}
                            onChange={(e) => updateItem(index, { valuationRate: e.target.value === '' ? '' : parseFloat(e.target.value) })}
                            style={{ textAlign: 'right' }}
                          />
                        </td>
                        <td style={{ textAlign: 'right' }}>{formatMoney(qty * rate)}</td>
                        <td>
                          <button type="button" className="btn btn-ghost btn-size-icon-sm" onClick={() => removeRow(index)} disabled={items.length === 1}>
                            <Trash2 size={13} />
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
                {items.some((r) => r.itemCode) && (
                  <tfoot>
                    <tr>
                      <td colSpan={4} style={{ textAlign: 'right', fontWeight: 600 }}>Total</td>
                      <td style={{ textAlign: 'right', fontWeight: 700 }}>{formatMoney(montoTotalPreview)}</td>
                      <td />
                    </tr>
                  </tfoot>
                )}
              </table>
              <div style={{ padding: '8px 16px', borderTop: '1px solid var(--border)' }}>
                <button type="button" className="btn btn-ghost btn-size-sm" onClick={addRow}><Plus size={14} /> Agregar artículo</button>
              </div>
            </div>
          </div>
        </div>

        <div className="doc-actions-bar">
          <button type="button" className="btn btn-ghost" onClick={() => navigate('/apertura/inventario')}>Cancelar</button>
          <button type="submit" className="btn btn-navy" disabled={createMutation.isPending || (!loadingPreflight && !listo)}>
            {createMutation.isPending ? 'Cargando…' : 'Cargar inventario inicial'}
          </button>
        </div>
      </form>

      <Modal
        open={!!created}
        onClose={() => setCreated(null)}
        title="Inventario inicial cargado"
        subtitle={created ? created.id : undefined}
        footer={
          <>
            <button className="btn btn-secondary" onClick={() => created && navigate(`/apertura/inventario/${created.id}`)}>
              Ver documento
            </button>
            <button className="btn btn-navy" onClick={resetForm}>Cargar otro</button>
          </>
        }
      >
        {created && (
          <p style={{ margin: 0 }}>
            Se cargó y confirmó el saldo inicial de <strong>{created.items.length}</strong> artículo(s) por un total de{' '}
            <strong>{formatMoney(created.montoTotal)}</strong>, contabilizado contra{' '}
            <strong>{created.cuentaApertura}</strong>.
          </p>
        )}
      </Modal>
    </div>
  )
}
