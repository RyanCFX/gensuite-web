// Registrar entrada — docs/tasks/PROMPT_CARGA_INICIAL_INVENTARIO_FRONTEND.md §3.
// Crea Y confirma en una sola llamada: no hay borrador ni edición (corregir = anular + volver a
// cargar, §7.3). La cantidad se SUMA a lo que ya existe — a diferencia de Apertura de Inventario,
// acá qty:0 NO es válido (§3.1).

import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQuery } from '@tanstack/react-query'
import { toast } from 'sonner'
import { ArrowLeft, AlertTriangle, Plus, Trash2 } from 'lucide-react'
import { crearCargaInicial } from '@/shared/api/cargaInicial'
import { listAlmacenes, getCuentasEmpresa } from '@/shared/api/config'
import { listSucursales } from '@/shared/api/sucursales'
import { getFacturacionConfig } from '@/shared/api/config'
import type { CargaInicialItemDto, CrearCargaInicialDto, CargaInicialInventario, Item } from '@/shared/api/types'
import { isApiErrorCode, ERROR_CODES } from '@/shared/api/client'
import { PageHeader } from '@/components/shared/PageHeader'
import { RecargarButton } from '@/components/shared/RecargarButton'
import { DatePicker } from '@/shared/ui/DatePicker'
import { SearchSelect } from '@/shared/ui/SearchSelect'
import type { SearchSelectOption } from '@/shared/ui/SearchSelect'
import { ItemSelect } from '@/shared/ui/ItemSelect'
import { DepartmentSelect } from '@/components/shared/DepartmentSelect'
import { Modal } from '@/shared/ui/Modal'
import { formatMoney } from '@/lib/formatters'

function today(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

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

export default function CargaInicialForm() {
  const navigate = useNavigate()

  const [postingDate, setPostingDate] = useState(today())
  const [remarks, setRemarks] = useState('')
  const [branch, setBranch] = useState('')
  const [department, setDepartment] = useState('')
  const [items, setItems] = useState<LineItem[]>([emptyRow()])
  const [branchQuery, setBranchQuery] = useState('')
  const [warehouseSearch, setWarehouseSearch] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [created, setCreated] = useState<CargaInicialInventario | null>(null)

  // §5 — cuenta de ajuste de inventario (Company.stock_adjustment_account), DISTINTA de la cuenta
  // puente 14-03 APERTURA TEMPORAL que usa Apertura de Inventario. Se verifica de antemano para
  // deshabilitar el botón con un aviso explícito en vez de dejar que el usuario llene todo el
  // formulario y recién ahí se entere.
  const { data: cuentasEmpresa, isLoading: loadingCuentas } = useQuery({
    queryKey: ['cuentas-empresa'],
    queryFn: getCuentasEmpresa,
    staleTime: 60_000,
  })
  const cuentaAjusteConfigurada = !!cuentasEmpresa?.stockAdjustmentAccount

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

  // Mapa almacén -> sucursal, para detectar mezcla de sucursales en las líneas (§4) — mismo
  // criterio que ya usa CountsPage/Apertura de Inventario, aplicado al código de error propio de
  // esta pantalla (MIXED_BRANCH_CARGA_INICIAL).
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

  const totalValuePreview = items.reduce((sum, r) => {
    const qty = typeof r.qty === 'number' ? r.qty : 0
    const rate = typeof r.valuationRate === 'number' ? r.valuationRate : 0
    return sum + qty * rate
  }, 0)

  const createMutation = useMutation({
    mutationFn: (dto: CrearCargaInicialDto) => crearCargaInicial(dto),
    onSuccess: (data) => setCreated(data),
    onError: (err: unknown) => {
      const msg = (err as { message?: string })?.message ?? 'Error al registrar la entrada'
      if (isApiErrorCode(err, ERROR_CODES.MIXED_BRANCH_CARGA_INICIAL)) {
        toast.error(`${msg} Separa esta carga en varios documentos, uno por sucursal.`)
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
    setPostingDate(today())
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
    for (let i = 0; i < validRows.length; i++) {
      const row = validRows[i]
      const num = i + 1
      if (!row.warehouse) { toast.error(`Línea ${num}: selecciona un almacén`); return }
      // qty debe ser ESTRICTAMENTE positivo acá — a diferencia de Apertura de Inventario, 0 no es válido.
      if (row.qty === '' || row.qty <= 0) { toast.error(`Línea ${num}: la cantidad debe ser mayor a cero`); return }
      if (row.valuationRate === '' || row.valuationRate <= 0) { toast.error(`Línea ${num}: el costo unitario debe ser mayor a cero`); return }
    }

    const itemsDto: CargaInicialItemDto[] = validRows.map((r) => ({
      itemCode: r.itemCode,
      warehouse: r.warehouse,
      qty: Number(r.qty),
      valuationRate: Number(r.valuationRate),
    }))

    const dto: CrearCargaInicialDto = {
      postingDate,
      remarks: remarks || undefined,
      items: itemsDto,
      branch: branch || undefined,
      department: department || undefined,
    }
    createMutation.mutate(dto)
  }

  return (
    <div className="page-container">
      <a className="page-back-link" onClick={() => navigate('/inventario/carga-inicial')}>
        <ArrowLeft size={14} /> Carga Inicial — Inventario
      </a>

      <PageHeader
        title="Registrar entrada"
        description="Agrega existencias a un almacén sin que haya una compra de por medio — hallazgos, donaciones, ajustes puntuales."
        action={<RecargarButton label="Actualizar" />}
      />

      {!loadingCuentas && !cuentaAjusteConfigurada && (
        <div className="inline-alert inline-alert-error" style={{ marginBottom: 16 }}>
          <AlertTriangle size={16} />
          No hay una cuenta de ajuste de inventario configurada (Company.stock_adjustment_account) —{' '}
          <a onClick={() => navigate('/config/empresa')} style={{ cursor: 'pointer', textDecoration: 'underline' }}>
            configúrela en Empresa
          </a>{' '}
          antes de registrar una entrada. El servidor rechazará este formulario.
        </div>
      )}

      <form onSubmit={handleSubmit}>
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="card-header"><h2 className="card-title">Datos generales</h2></div>
          <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div className="form-row form-row-3">
              <div className="ff-wrap">
                <label className="ff-label ff-required">Fecha</label>
                <DatePicker value={postingDate} onChange={setPostingDate} />
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
                  placeholder="Ej. Hallazgo de auditoría física — enero 2026"
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
            {hasMixedBranches && (
              <div className="inline-alert inline-alert-warn" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <AlertTriangle size={16} />
                <span>Estás mezclando almacenes de sucursales distintas — un documento no puede mezclarlas. Separa esta carga en varios documentos, uno por sucursal.</span>
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
                            className={`items-input${submitted && row.itemCode && (row.qty === '' || row.qty <= 0) ? ' items-input-error' : ''}`}
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
                      <td style={{ textAlign: 'right', fontWeight: 700 }}>{formatMoney(totalValuePreview)}</td>
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
          <button type="button" className="btn btn-ghost" onClick={() => navigate('/inventario/carga-inicial')}>Cancelar</button>
          <button type="submit" className="btn btn-navy" disabled={createMutation.isPending || (!loadingCuentas && !cuentaAjusteConfigurada)}>
            {createMutation.isPending ? 'Registrando…' : 'Registrar entrada'}
          </button>
        </div>
      </form>

      <Modal
        open={!!created}
        onClose={() => setCreated(null)}
        title="Entrada registrada"
        subtitle={created ? created.id : undefined}
        footer={
          <>
            <button className="btn btn-secondary" onClick={() => created && navigate(`/inventario/carga-inicial/${created.id}`)}>
              Ver documento
            </button>
            <button className="btn btn-navy" onClick={resetForm}>Registrar otra</button>
          </>
        }
      >
        {created && (
          <p style={{ margin: 0 }}>
            Se registró y confirmó la entrada de <strong>{created.items.length}</strong> artículo(s) por un total de{' '}
            <strong>{formatMoney(created.totalValue)}</strong>.
          </p>
        )}
      </Modal>
    </div>
  )
}
