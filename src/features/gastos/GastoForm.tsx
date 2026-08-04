import { useState, useCallback, useEffect, useMemo } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { createGasto, updateGasto, getGasto } from '@/shared/api/compras-gastos'
import { listSuppliers } from '@/shared/api/suppliers'
import type { CreateGastoDto } from '@/shared/api/types'
import { PageHeader } from '@/components/shared/PageHeader'
import { getCatalogosFiscales } from '@/shared/api/config'
import { CATEGORIA_GASTO } from '@/lib/constants'
import { Plus, Trash2, Info, AlertCircle, AlertTriangle } from 'lucide-react'
import { SearchSelect } from '@/shared/ui/SearchSelect'
import type { SearchSelectOption } from '@/shared/ui/SearchSelect'
import { ItemSelect } from '@/shared/ui/ItemSelect'
import type { Item } from '@/shared/api/types'
import { getUsuario, getUsuarioSucursales } from '@/shared/api/usuarios'
import { listSucursales } from '@/shared/api/sucursales'
import { getUser } from '@/shared/api/storage'
import { isApiErrorCode, ERROR_CODES } from '@/shared/api/client'
import { DepartmentSelect } from '@/components/shared/DepartmentSelect'

const SYSTEM_MANAGER_ROLE = 'System Manager'

interface ItemRow {
  itemCode: string
  itemLabel?: string
  description: string
  qty: number
  rate: number
  uom: string
}

function emptyItem(): ItemRow {
  return { itemCode: '', description: '', qty: 1, rate: 0, uom: 'Nos' }
}

const NCF_REGEX = /^[BE]\d{10}$/
const B17_MAX = 50

export default function GastoForm() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { id } = useParams<{ id?: string }>()
  const isEdit = !!id

  const [supplierId, setSupplierId] = useState('')
  const [supplierLabel, setSupplierLabel] = useState('')
  const [supplierQuery, setSupplierQuery] = useState('')
  const [postingDate, setPostingDate] = useState(new Date().toISOString().split('T')[0])
  const [dueDate, setDueDate] = useState('')
  const [items, setItems] = useState<ItemRow[]>([emptyItem()])

  const [ncfProveedor, setNcfProveedor] = useState('')
  const [tipoComprobante, setTipoComprobante] = useState<string>('')
  const [tipoBienes606, setTipoBienes606] = useState('')
  const [formaPago606, setFormaPago606] = useState('')
  const [categoriaGasto, setCategoriaGasto] = useState<string>('')
  const [esDeducible, setEsDeducible] = useState(true)
  const [retencionIsr, setRetencionIsr] = useState(0)
  const [retencionItbis, setRetencionItbis] = useState(0)
  const [branch, setBranch] = useState('')
  const [branchSearch, setBranchSearch] = useState('')
  const [branchError, setBranchError] = useState(false)
  const [department, setDepartment] = useState('')
  const [serverMessage, setServerMessage] = useState<string | null>(null)

  const currentUserEmail = getUser()?.email
  const { data: currentUser } = useQuery({
    queryKey: ['currentUser', currentUserEmail],
    queryFn: () => getUsuario(currentUserEmail!),
    enabled: !!currentUserEmail,
    staleTime: 5 * 60_000,
  })

  // ── Sucursal (branch) selector ────────────────────────────────────────────
  const isSystemManager = currentUser?.roles?.includes(SYSTEM_MANAGER_ROLE) ?? false
  const { data: myBranches } = useQuery({
    queryKey: ['usuarioSucursales', currentUserEmail],
    queryFn: () => getUsuarioSucursales(currentUserEmail!),
    enabled: !!currentUserEmail,
    staleTime: 60_000,
  })
  const { data: allSucursales } = useQuery({
    queryKey: ['sucursales-all'],
    queryFn: () => listSucursales({ limit: 100 }),
    enabled: isSystemManager,
    staleTime: 60_000,
  })
  const branchOptions = useMemo(
    () => (isSystemManager ? (allSucursales?.items.map((s) => s.name) ?? []) : (myBranches?.branches ?? [])),
    [isSystemManager, allSucursales, myBranches],
  )
  const branchSelectOptions: SearchSelectOption[] = useMemo(() => {
    const q = branchSearch.toLowerCase()
    return branchOptions
      .filter((b) => !q || b.toLowerCase().includes(q))
      .map((b) => ({ value: b, label: b }))
  }, [branchOptions, branchSearch])

  useEffect(() => {
    if (myBranches?.defaultBranch && !branch) setBranch(myBranches.defaultBranch)
  }, [myBranches])

  // Si solo hay una sucursal disponible, se selecciona sola y el select se bloquea.
  useEffect(() => {
    if (branchOptions.length === 1 && branch !== branchOptions[0]) setBranch(branchOptions[0])
  }, [branchOptions, branch])

  const { data: gastoData, isLoading: loadingEdit } = useQuery({
    queryKey: ['gasto', id],
    queryFn: () => getGasto(id!),
    enabled: isEdit,
  })

  // Precarga del formulario al editar un gasto en Draft.
  /* eslint-disable react-hooks/set-state-in-effect -- sincroniza el form local
     con la data del servidor una sola vez, cuando llega la respuesta de edición */
  useEffect(() => {
    if (!gastoData) return
    if (gastoData.status !== 'draft') {
      toast.error('Solo se pueden editar gastos en borrador')
      navigate(`/gastos/${gastoData.id}`, { replace: true })
      return
    }

    // Extraer y mostrar el mensaje del servidor (ej. cambio automático de cuenta contable)
    const rawMsg = (gastoData as { message?: string }).message
    setServerMessage(rawMsg ?? null)

    setSupplierId(gastoData.supplier)
    setSupplierLabel(gastoData.supplierName)
    setPostingDate(gastoData.postingDate.split('T')[0])
    setDueDate(gastoData.dueDate ? gastoData.dueDate.split('T')[0] : '')
    setItems(
      gastoData.items.length > 0
        ? gastoData.items.map((i) => ({
            itemCode: i.itemCode,
            itemLabel: i.itemName,
            description: i.description ?? '',
            qty: i.qty,
            rate: i.rate,
            uom: i.uom ?? 'Nos',
          }))
        : [emptyItem()],
    )
    setNcfProveedor(gastoData.ncfProveedor ?? '')
    setTipoComprobante(gastoData.tipoComprobante ?? '')
    setTipoBienes606(gastoData.tipoBienes606 ?? '')
    setFormaPago606(gastoData.formaPago606 ?? '')
    setCategoriaGasto(gastoData.categoriaGasto ?? '')
    setEsDeducible(gastoData.esDeducible ?? true)
    setRetencionIsr(gastoData.retencionIsr ?? 0)
    setRetencionItbis(gastoData.retencionItbis ?? 0)
    setBranch(gastoData.branch ?? '')
    setDepartment(gastoData.department ?? '')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gastoData])
  /* eslint-enable react-hooks/set-state-in-effect */

  const { data: catalogos } = useQuery({
    queryKey: ['catalogos-fiscales'],
    queryFn: getCatalogosFiscales,
    staleTime: 60 * 60_000,
  })

  const { data: suppliersData, isLoading: suppliersLoading } = useQuery({
    queryKey: ['supplierSearch', supplierQuery],
    queryFn: () => listSuppliers({ search: supplierQuery || undefined, limit: 15 }),
    enabled: true,
  })

  const supplierOptions: SearchSelectOption[] = (suppliersData?.items ?? []).map((s) => ({
    value: s.id,
    label: s.supplierName,
    sublabel: s.rnc ?? s.cedula,
  }))

  const saveMutation = useMutation({
    mutationFn: (dto: CreateGastoDto) => (isEdit ? updateGasto(id!, dto) : createGasto(dto)),
    onSuccess: (data) => {
      toast.success(isEdit ? 'Gasto actualizado' : 'Gasto creado')
      queryClient.invalidateQueries({ queryKey: ['gastos'] })
      queryClient.invalidateQueries({ queryKey: ['gasto', data.id] })
      navigate(`/gastos/${data.id}`)
    },
    onError: (error) => {
      if (isApiErrorCode(error, ERROR_CODES.BRANCH_REQUIRED)) {
        setBranchError(true)
        toast.error((error as { message?: string })?.message ?? 'Selecciona una sucursal')
        return
      }
      const apiErr = error as { message?: string }
      toast.error(apiErr?.message ?? 'Error al guardar el gasto')
    },
  })

  const subtotal = items.reduce((sum, i) => sum + i.qty * i.rate, 0)
  const grandTotal = subtotal
  const ncfValid = !ncfProveedor || NCF_REGEX.test(ncfProveedor)
  const isB17 = tipoComprobante === 'B17'
  const b17Error = isB17 && grandTotal > B17_MAX

  const updateItem = useCallback((idx: number, field: keyof ItemRow, value: string | number) => {
    setItems((prev) => prev.map((row, i) => i === idx ? { ...row, [field]: value } : row))
  }, [])

  const selectCatalogItem = useCallback((idx: number, catalogItem: Item) => {
    setItems((prev) => prev.map((row, i) => {
      if (i !== idx) return row
      return {
        ...row,
        itemCode: catalogItem.id,
        itemLabel: catalogItem.itemName,
        description: catalogItem.internalDescription ?? catalogItem.itemName,
        rate: catalogItem.standardRate ?? 0,
      }
    }))
  }, [])

  const clearCatalogItem = useCallback((idx: number) => {
    setItems((prev) => prev.map((row, i) =>
      i === idx ? { ...row, itemCode: '', itemLabel: undefined, description: '', rate: 0 } : row,
    ))
  }, [])

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!supplierId) { toast.error('Selecciona un proveedor'); return }
    if (ncfProveedor && !NCF_REGEX.test(ncfProveedor)) { toast.error('NCF inválido (formato: B/E seguido de 10 dígitos)'); return }
    // La regla B17 y los campos 606 requeridos se validan al Someter, no al
    // guardar el borrador — un Draft debe poder guardarse siempre.

    const dto: CreateGastoDto = {
      supplier: supplierId,
      postingDate,
      dueDate: dueDate || undefined,
      items: items.map((i) => ({
        itemCode: i.itemCode,
        description: i.description,
        qty: i.qty,
        rate: i.rate,
        uom: i.uom || undefined,
      })),
      ncfProveedor: ncfProveedor || undefined,
      tipoComprobante: tipoComprobante as CreateGastoDto['tipoComprobante'] || undefined,
      tipoBienes606: tipoBienes606 || undefined,
      formaPago606: formaPago606 || undefined,
      categoriaGasto: categoriaGasto as CreateGastoDto['categoriaGasto'] || undefined,
      esDeducible,
      retencionIsr: retencionIsr || undefined,
      retencionItbis: retencionItbis || undefined,
      branch: branch || undefined,
      department: department || undefined,
    }
    saveMutation.mutate(dto)
  }

  return (
    <div className="page-container">
      <button className="page-back-link" onClick={() => navigate(-1)}>
        ← Volver
      </button>

      <PageHeader
        title={isEdit ? 'Editar Gasto' : 'Nuevo Gasto'}
        description="Registra un gasto sin movimiento de inventario"
      />

      {isEdit && serverMessage && (
        <div className="inline-alert inline-alert-info">
          <AlertTriangle size={16} />
          <span dangerouslySetInnerHTML={{ __html: serverMessage }} />
        </div>
      )}

      {isEdit && loadingEdit ? (
        <span className="skeleton-box" style={{ height: 256, width: '100%', display: 'block' }} />
      ) : (
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* Header */}
          <div className="card">
            <div className="card-header">
              <span className="card-title">Información General</span>
            </div>
            <div className="card-body">
              <div className="form-row form-row-3">
                <div className="ff-wrap">
                  <label className="ff-label">Proveedor <span className="ff-required">*</span></label>
                  <SearchSelect
                    id="supplier"
                    value={supplierId}
                    selectedLabel={supplierLabel}
                    onChange={(newId, opt) => { setSupplierId(newId === '' ? '' : (opt?.value ?? newId)); setSupplierLabel(opt?.label ?? '') }}
                    options={supplierOptions}
                    onSearch={setSupplierQuery}
                    loading={suppliersLoading}
                    placeholder="Buscar proveedor…"
                    error={!supplierId}
                  />
                </div>
                <div className="ff-wrap">
                  <label className="ff-label">Fecha <span className="ff-required">*</span></label>
                  <input type="date" className="ff-input" value={postingDate} onChange={(e) => setPostingDate(e.target.value)} required />
                </div>
                <div className="ff-wrap">
                  <label className="ff-label">Fecha Vencimiento</label>
                  <input type="date" className="ff-input" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
                </div>
                <div className="ff-wrap">
                  <label className="ff-label">Sucursal <span className="ff-required">*</span></label>
                  <SearchSelect
                    id="branch"
                    value={branch}
                    selectedLabel={branch}
                    error={!branch || branchError}
                    onChange={(val) => { setBranch(val); setBranchError(false) }}
                    options={branchSelectOptions}
                    onSearch={setBranchSearch}
                    placeholder="Sin especificar"
                    disabled={branchOptions.length === 1}
                  />
                  {branchError && <span className="ff-error">Debes seleccionar una sucursal para continuar</span>}
                </div>
                <div className="ff-wrap">
                  <label className="ff-label">Departamento</label>
                  <DepartmentSelect id="department" value={department} onChange={setDepartment} />
                </div>
              </div>
            </div>
          </div>

          {/* Items */}
          <div className="card">
            <div className="card-header">
              <span className="card-title">Artículos / Conceptos</span>
              <button type="button" className="btn btn-secondary btn-size-sm" onClick={() => setItems((prev) => [...prev, emptyItem()])}>
                <Plus size={14} />Agregar
              </button>
            </div>
            <div className="card-body" style={{ padding: 0 }}>
              <div className="items-table-wrap" style={{ border: 'none', borderRadius: 0 }}>
                <table className="items-table">
                  <thead>
                    <tr>
                      <th style={{ minWidth: 180 }}>Artículo / Concepto</th>
                      <th>Descripción</th>
                      <th style={{ width: '10%', textAlign: 'right' }}>Qty</th>
                      <th style={{ width: '12%', textAlign: 'right' }}>Precio</th>
                      <th style={{ width: '40px' }} />
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((item, idx) => (
                      <tr key={idx}>
                        <td style={{ minWidth: 180 }}>
                          <ItemSelect
                            value={item.itemCode}
                            selectedLabel={item.itemLabel}
                            onSelect={(catalogItem) => selectCatalogItem(idx, catalogItem)}
                            onClear={() => clearCatalogItem(idx)}
                            placeholder="Buscar concepto…"
                            typeFilter="product"
                          />
                        </td>
                        <td>
                          <input className="items-input" placeholder="Descripción" value={item.description} onChange={(e) => updateItem(idx, 'description', e.target.value)} />
                        </td>
                        <td>
                          <input className="items-input" type="number" min="0.001" step="0.001" style={{ textAlign: 'right' }} value={item.qty} onChange={(e) => updateItem(idx, 'qty', parseFloat(e.target.value) || 0)} />
                        </td>
                        <td>
                          <input className="items-input" type="number" min="0" step="0.01" style={{ textAlign: 'right' }} value={item.rate} onChange={(e) => updateItem(idx, 'rate', parseFloat(e.target.value) || 0)} />
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          <button type="button" className="btn btn-ghost btn-size-icon-sm" style={{ color: 'var(--icon-muted)' }} onClick={() => setItems((prev) => prev.filter((_, i) => i !== idx))} disabled={items.length === 1}>
                            <Trash2 size={14} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                {b17Error && (
                  <div style={{ padding: '12px 16px' }}>
                    <div className="inline-alert inline-alert-error">
                      <AlertCircle size={16} />
                      Gastos Menores no pueden superar RD$50.00. Total actual: {new Intl.NumberFormat('es-DO', { style: 'currency', currency: 'DOP' }).format(grandTotal)}
                    </div>
                  </div>
                )}

                <div className="items-total-row">
                  <div className="items-total-line">
                    <span>Subtotal</span>
                    <span>{new Intl.NumberFormat('es-DO', { style: 'currency', currency: 'DOP' }).format(subtotal)}</span>
                  </div>
                  <div className="items-total-line" style={{ fontWeight: 700, fontSize: 15 }}>
                    <span>Total</span>
                    <strong>{new Intl.NumberFormat('es-DO', { style: 'currency', currency: 'DOP' }).format(grandTotal)}</strong>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* DGII + Gasto info */}
          <div className="dgii-section">
            <div className="dgii-section-title">
              <Info size={14} />
              Información DGII y Clasificación
            </div>
            <div className="form-row form-row-3">
              <div className="ff-wrap">
                <label className="ff-label">NCF Proveedor</label>
                <input
                  className={`ff-input${!ncfValid ? ' ff-input-error' : ''}`}
                  placeholder="B13XXXXXXXXXX"
                  value={ncfProveedor}
                  onChange={(e) => {
                    const val = e.target.value.toUpperCase()
                    setNcfProveedor(val)
                    if (val.length >= 3) {
                      setTipoComprobante(val.slice(0, 3))
                    } else {
                      setTipoComprobante('')
                    }
                  }}
                />
                {!ncfValid && <span className="ff-error">Formato inválido.</span>}
              </div>

              <div className="ff-wrap">
                <label className="ff-label">Tipo Comprobante</label>
                <select
                  className={`ff-select${isB17 && b17Error ? ' ff-input-error' : ''}`}
                  value={tipoComprobante}
                  onChange={(e) => setTipoComprobante(e.target.value)}
                >
                  <option value="">Seleccionar</option>
                  {(catalogos?.ncfTypesCompra ?? []).map((t) => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </select>
              </div>

              <div className="ff-wrap">
                <label className="ff-label">Tipo de Bienes 606</label>
                <select className="ff-select" value={tipoBienes606} onChange={(e) => setTipoBienes606(e.target.value)}>
                  <option value="">Seleccionar tipo</option>
                  {tipoBienes606 && !(catalogos?.tipoBienes606 ?? []).some((t) => t.value === tipoBienes606) && (
                    <option value={tipoBienes606}>{tipoBienes606}</option>
                  )}
                  {(catalogos?.tipoBienes606 ?? []).map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </div>

              <div className="ff-wrap">
                <label className="ff-label">Forma de Pago 606</label>
                <select className="ff-select" value={formaPago606} onChange={(e) => setFormaPago606(e.target.value)}>
                  <option value="">Seleccionar forma</option>
                  {formaPago606 && !(catalogos?.formaPago606 ?? []).some((f) => f.value === formaPago606) && (
                    <option value={formaPago606}>{formaPago606}</option>
                  )}
                  {(catalogos?.formaPago606 ?? []).map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
                </select>
              </div>

              <div className="ff-wrap">
                <label className="ff-label">Categoría de Gasto</label>
                <select className="ff-select" value={categoriaGasto} onChange={(e) => setCategoriaGasto(e.target.value)}>
                  <option value="">Seleccionar categoría</option>
                  {CATEGORIA_GASTO.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
                </select>
              </div>

              <div className="ff-wrap">
                <label className="ff-label">Retención ISR (RD$)</label>
                <input type="number" min="0" step="0.01" className="ff-input" value={retencionIsr} onChange={(e) => setRetencionIsr(parseFloat(e.target.value) || 0)} />
              </div>

              <div className="ff-wrap">
                <label className="ff-label">Retención ITBIS (RD$)</label>
                <input type="number" min="0" step="0.01" className="ff-input" value={retencionItbis} onChange={(e) => setRetencionItbis(parseFloat(e.target.value) || 0)} />
              </div>

              <div className="ff-wrap" style={{ justifyContent: 'flex-end' }}>
                <label className="ff-check-wrap">
                  <input
                    type="checkbox"
                    className="ff-check"
                    checked={esDeducible}
                    onChange={(e) => setEsDeducible(e.target.checked)}
                  />
                  <span className="ff-label">Es deducible fiscalmente</span>
                </label>
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <button type="button" className="btn btn-secondary" onClick={() => navigate(-1)}>Cancelar</button>
            <button type="submit" className="btn btn-primary" disabled={saveMutation.isPending}>
              {saveMutation.isPending ? 'Guardando…' : isEdit ? 'Guardar Cambios' : 'Guardar Borrador'}
            </button>
          </div>
        </div>
      </form>
      )}
    </div>
  )
}
