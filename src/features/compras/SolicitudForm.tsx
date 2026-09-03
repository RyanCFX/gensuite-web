import { useState, useCallback, useEffect, useMemo, Fragment } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useEffectOnActive } from 'keepalive-for-react'
import { toast } from 'sonner'
import { useTabs } from '@/contexts/TabsContext'
import { createSolicitudCompra, updateSolicitudCompra, getSolicitudCompra } from '@/shared/api/solicitudes-compra'
import { listWarehouses } from '@/shared/api/inventory'
import { listAlmacenes, getFacturacionConfig } from '@/shared/api/config'
import { getUsuario, getUsuarioSucursales } from '@/shared/api/usuarios'
import { listSucursales } from '@/shared/api/sucursales'
import type { CreateSolicitudCompraDto, Item } from '@/shared/api/types'
import { PageHeader } from '@/components/shared/PageHeader'
import { Plus, Trash2 } from 'lucide-react'
import { SearchSelect } from '@/shared/ui/SearchSelect'
import type { SearchSelectOption } from '@/shared/ui/SearchSelect'
import { ItemSelect } from '@/shared/ui/ItemSelect'
import { UomSelect } from '@/shared/ui/UomSelect'
import { QtyInput } from '@/shared/ui/QtyInput'
import { DepartmentSelect } from '@/components/shared/DepartmentSelect'
import { DatePicker } from '@/shared/ui/DatePicker'
import { useAuthStore } from '@/stores/auth.store'
import { isApiErrorCode, ERROR_CODES } from '@/shared/api/client'
import { useDirtyCheck } from '@/shared/hooks/useDirtyCheck'
import { useBeforeUnloadWarning } from '@/shared/hooks/useBeforeUnloadWarning'

const SYSTEM_MANAGER_ROLE = 'System Manager'

interface ItemRow {
  itemCode: string
  itemLabel?: string
  description: string
  qty: number
  rate: number
  warehouse: string
  uom: string
  lineError?: string
}

function emptyItem(defaultWh?: string): ItemRow {
  return { itemCode: '', description: '', qty: 1, rate: 0, warehouse: defaultWh ?? '', uom: 'Nos' }
}

export default function SolicitudForm() {
  const navigate = useNavigate()
  const { id } = useParams<{ id?: string }>()
  const queryClient = useQueryClient()
  const { multiTab, activeId, closeTab } = useTabs()
  const isEdit = !!id
  const authUser = useAuthStore((s) => s.user)
  const defaultWh = authUser?.defaultWarehouse ?? ''

  const [transactionDate, setTransactionDate] = useState(new Date().toISOString().split('T')[0])
  const [scheduleDate, setScheduleDate] = useState('')
  const [items, setItems] = useState<ItemRow[]>([emptyItem(defaultWh)])
  const [branch, setBranch] = useState('')
  const [branchError, setBranchError] = useState(false)
  const [department, setDepartment] = useState('')
  const [warehouseSearch, setWarehouseSearch] = useState('')

  const { data: facturacionConfig } = useQuery({
    queryKey: ['facturacion-config'],
    queryFn: getFacturacionConfig,
    staleTime: 5 * 60_000,
  })
  const usaDepartamentos = facturacionConfig?.usaDepartamentos ?? true

  // Sin sucursal elegida: todos los almacenes del tenant. Con sucursal: solo los de esa sucursal.
  const { data: warehousesAll } = useQuery({
    queryKey: ['warehouses'],
    queryFn: listWarehouses,
    enabled: !branch,
  })
  const { data: warehousesForBranch } = useQuery({
    queryKey: ['almacenes', { branch }],
    queryFn: () => listAlmacenes({ branch }),
    enabled: !!branch,
  })
  const warehouses = branch ? warehousesForBranch : warehousesAll

  const warehouseSelectOptions: SearchSelectOption[] = useMemo(() => {
    const q = warehouseSearch.toLowerCase()
    return (warehouses ?? [])
      .filter((w) => !q || w.name.toLowerCase().includes(q))
      .map((w) => ({ value: w.id, label: w.name }))
  }, [warehouses, warehouseSearch])

  // ── Sucursal (branch) selector ────────────────────────────────────────────
  const { data: currentUserDetail } = useQuery({
    queryKey: ['currentUser', authUser?.email],
    queryFn: () => getUsuario(authUser!.email),
    enabled: !!authUser?.email,
    staleTime: 5 * 60_000,
  })
  const isSystemManager = currentUserDetail?.roles?.includes(SYSTEM_MANAGER_ROLE) ?? false
  const { data: myBranches, refetch: refetchMyBranches } = useQuery({
    queryKey: ['usuarioSucursales', authUser?.email],
    queryFn: () => getUsuarioSucursales(authUser!.email),
    enabled: !!authUser?.email,
    staleTime: 60_000,
  })
  const { data: allSucursales } = useQuery({
    queryKey: ['sucursales-all'],
    queryFn: () => listSucursales({ limit: 100 }),
    enabled: isSystemManager,
    staleTime: 60_000,
  })
  const branchOptions = isSystemManager
    ? (allSucursales?.items.map((s) => s.name) ?? [])
    : (myBranches?.branches ?? [])
  const [branchSearch, setBranchSearch] = useState('')
  const branchSelectOptions: SearchSelectOption[] = branchOptions
    .filter((b) => !branchSearch || b.toLowerCase().includes(branchSearch.toLowerCase()))
    .map((b) => ({ value: b, label: b }))

  useEffect(() => {
    if (myBranches?.defaultBranch && !branch) setBranch(myBranches.defaultBranch)
  }, [myBranches])

  const { data: solicitudData, isLoading: loadingEdit } = useQuery({
    queryKey: ['solicitud-compra', id],
    queryFn: () => getSolicitudCompra(id!),
    enabled: isEdit,
  })

  useEffectOnActive(() => {
    if (isEdit) queryClient.invalidateQueries({ queryKey: ['solicitud-compra', id] })
  }, [isEdit, id], true)

  useEffect(() => {
    if (!solicitudData) return
    setTransactionDate(solicitudData.transactionDate.split('T')[0])
    setScheduleDate(solicitudData.scheduleDate?.split('T')[0] ?? '')
    setItems(
      solicitudData.items.map((si) => ({
        itemCode: si.itemCode,
        itemLabel: si.itemName,
        description: si.itemName ?? '',
        qty: si.qty,
        rate: si.rate || 0,
        warehouse: si.warehouse ?? '',
        uom: si.uom || 'Nos',
      })),
    )
    setBranch(solicitudData.items[0]?.branch ?? '')
    setDepartment(solicitudData.items[0]?.department ?? '')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [solicitudData])

  const isDirty = useDirtyCheck({
    transactionDate,
    scheduleDate,
    items,
    branch,
    department,
  }, !isEdit || !loadingEdit)
  useBeforeUnloadWarning(isDirty)

  const saveMutation = useMutation({
    mutationFn: (dto: CreateSolicitudCompraDto) =>
      isEdit ? updateSolicitudCompra(id!, dto) : createSolicitudCompra(dto),
    onSuccess: (data) => {
      toast.success(isEdit ? 'Solicitud actualizada' : 'Solicitud creada')
      const formTabId = activeId
      queryClient.invalidateQueries({ queryKey: ['solicitudes-compra'] })
      if (isEdit) queryClient.removeQueries({ queryKey: ['solicitud-compra', id] })
      navigate(`/compras/solicitudes/${data.id}`)
      if (multiTab && formTabId) closeTab(formTabId, { skipNavigate: true })
    },
    onError: (error) => {
      const apiErr = error as { code?: string; message?: string; statusCode?: number }
      if (isApiErrorCode(error, ERROR_CODES.BRANCH_REQUIRED)) {
        setBranchError(true)
        toast.error(apiErr?.message || 'Selecciona una sucursal')
        return
      }
      if (apiErr?.message?.toLowerCase().includes('no tienes acceso a la sucursal')) {
        refetchMyBranches()
        toast.error(`${apiErr.message} Tus sucursales asignadas se actualizaron, vuelve a intentar.`)
        return
      }
      if (apiErr?.statusCode === 400 && apiErr?.message) {
        const msg = apiErr.message
        let matched = false
        setItems((prev) => prev.map((row) => {
          if (row.itemCode && msg.includes(row.itemCode)) {
            matched = true
            return { ...row, lineError: msg }
          }
          return row
        }))
        if (!matched) toast.error(msg)
      } else {
        toast.error('Error al guardar la solicitud')
      }
    },
  })

  const grandTotal = items.reduce((sum, i) => sum + i.qty * i.rate, 0)

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!transactionDate) { toast.error('Ingresa la fecha'); return }

    setItems((prev) => prev.map((i) => ({ ...i, lineError: undefined })))

    let hasError = false
    for (const item of items) {
      const idx = items.indexOf(item)
      if (!item.itemCode || item.qty <= 0) {
        hasError = true
        setItems((prev) => prev.map((r, i) => i === idx ? { ...r, lineError: 'Selecciona un artículo y una cantidad mayor a cero' } : r))
      }
    }
    if (hasError) return

    const dto: CreateSolicitudCompraDto = {
      transactionDate,
      scheduleDate: scheduleDate || undefined,
      branch: branch || undefined,
      department: usaDepartamentos ? (department || undefined) : undefined,
      items: items.filter((i) => i.itemCode).map((i) => ({
        itemCode: i.itemCode,
        description: i.description || undefined,
        qty: i.qty,
        rate: i.rate || undefined,
        uom: i.uom || undefined,
        warehouse: i.warehouse || undefined,
      })),
    }
    saveMutation.mutate(dto)
  }

  const updateItem = useCallback((idx: number, patch: Partial<ItemRow>) => {
    setItems((prev) => prev.map((row, i) => (i === idx ? { ...row, ...patch } : row)))
  }, [])

  const selectCatalogItem = useCallback((idx: number, catalogItem: Item) => {
    setItems((prev) => prev.map((row, i) => {
      if (i !== idx) return row
      return {
        ...row,
        itemCode: catalogItem.id,
        itemLabel: catalogItem.itemName,
        description: catalogItem.internalDescription ?? catalogItem.itemName,
        rate: catalogItem.valuationRate ?? catalogItem.standardRate ?? 0,
        uom: catalogItem.stockUom ?? row.uom,
      }
    }))
  }, [])

  const clearCatalogItem = useCallback((idx: number) => {
    updateItem(idx, { itemCode: '', itemLabel: undefined, description: '', rate: 0 })
  }, [updateItem])

  if (isEdit && loadingEdit) {
    return (
      <div className="page-container">
        <span className="skeleton-box" style={{ height: 32, width: 200, display: 'block', marginBottom: 16 }} />
        <span className="skeleton-box" style={{ height: 256, width: '100%', display: 'block' }} />
      </div>
    )
  }

  return (
    <div className="page-container">
      <button className="page-back-link" onClick={() => navigate(-1)}>
        ← Volver
      </button>

      <PageHeader
        title={isEdit ? 'Editar Solicitud de Compra' : 'Nueva Solicitud de Compra'}
        description="Pedido interno de intención — sin proveedor ni precio obligatorios"
      />

      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div className="card">
            <div className="card-header">
              <span className="card-title">Información General</span>
            </div>
            <div className="card-body">
              <div className="form-row form-row-3">
                <div className="ff-wrap">
                  <label className="ff-label">Fecha <span className="ff-required">*</span></label>
                  <DatePicker className="ff-input" value={transactionDate} onChange={setTransactionDate} />
                </div>

                <div className="ff-wrap">
                  <label className="ff-label">Fecha Necesaria</label>
                  <DatePicker className="ff-input" value={scheduleDate} onChange={setScheduleDate} clearable min={transactionDate} />
                  <p className="ff-hint">Default para las líneas que no traigan la suya propia.</p>
                </div>

                <div className="ff-wrap">
                  <label className="ff-label">Sucursal</label>
                  <SearchSelect
                    value={branch}
                    onChange={(val) => { setBranch(val); setBranchError(false) }}
                    options={branchSelectOptions}
                    onSearch={setBranchSearch}
                    selectedLabel={branch}
                    placeholder="Sin especificar"
                    error={branchError}
                  />
                </div>

                {usaDepartamentos && (
                  <div className="ff-wrap">
                    <label className="ff-label">Departamento</label>
                    <DepartmentSelect value={department} onChange={setDepartment} placeholder="Buscar departamento…" />
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="card">
            <div className="card-header">
              <span className="card-title">Artículos</span>
              <button
                type="button"
                className="btn btn-secondary btn-size-sm"
                onClick={() => setItems((prev) => [...prev, emptyItem(defaultWh)])}
              >
                <Plus size={14} />
                Agregar
              </button>
            </div>
            <div className="card-body" style={{ padding: 0 }}>
              <div className="items-table-wrap" style={{ border: 'none', borderRadius: 0 }}>
                <table className="items-table">
                  <thead>
                    <tr>
                      <th style={{ minWidth: 180 }}>Artículo</th>
                      <th>Descripción</th>
                      <th style={{ width: '9%', textAlign: 'right' }}>Qty</th>
                      <th style={{ width: '13%', textAlign: 'right' }}>Precio Estimado</th>
                      <th style={{ width: '16%' }}>Almacén</th>
                      <th style={{ width: '8%' }}>UOM</th>
                      <th style={{ width: '40px' }} />
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((item, idx) => (
                      <Fragment key={idx}>
                        <tr>
                          <td>
                            <ItemSelect
                              value={item.itemCode}
                              selectedLabel={item.itemLabel}
                              onSelect={(catalogItem) => selectCatalogItem(idx, catalogItem)}
                              onClear={() => clearCatalogItem(idx)}
                              typeFilter="product"
                            />
                          </td>
                          <td>
                            <input
                              className="items-input"
                              value={item.description}
                              onChange={(e) => updateItem(idx, { description: e.target.value })}
                              placeholder="Descripción"
                            />
                          </td>
                          <td>
                            <QtyInput
                              className="items-input"
                              style={{ textAlign: 'right' }}
                              value={item.qty}
                              uom={item.uom}
                              onChange={(v) => updateItem(idx, { qty: v })}
                            />
                          </td>
                          <td>
                            <input
                              className="items-input"
                              type="number"
                              min="0"
                              step="0.01"
                              style={{ textAlign: 'right' }}
                              value={item.rate || ''}
                              placeholder="Opcional"
                              onChange={(e) => updateItem(idx, { rate: parseFloat(e.target.value) || 0 })}
                            />
                          </td>
                          <td>
                            <SearchSelect
                              value={item.warehouse}
                              onChange={(val) => updateItem(idx, { warehouse: val })}
                              options={warehouseSelectOptions}
                              onSearch={setWarehouseSearch}
                              selectedLabel={warehouses?.find((w) => w.id === item.warehouse)?.name ?? ''}
                              placeholder="Almacén"
                              className="items-input"
                            />
                          </td>
                          <td>
                            <UomSelect
                              value={item.uom}
                              itemCode={item.itemCode || undefined}
                              onChange={(v) => updateItem(idx, { uom: v })}
                              className="items-input"
                            />
                          </td>
                          <td>
                            <button
                              type="button"
                              className="btn btn-ghost btn-size-icon-sm"
                              disabled={items.length === 1}
                              onClick={() => setItems((prev) => prev.filter((_, i) => i !== idx))}
                            >
                              <Trash2 size={14} />
                            </button>
                          </td>
                        </tr>
                        {item.lineError && (
                          <tr>
                            <td colSpan={7} style={{ color: 'var(--error-text)', fontSize: 12, paddingTop: 0 }}>
                              {item.lineError}
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    ))}
                  </tbody>
                </table>
                <div className="items-total-row">
                  <div className="items-total-line" style={{ fontWeight: 700, fontSize: 15 }}>
                    <span>Total Estimado</span>
                    <strong>{new Intl.NumberFormat('es-DO', { style: 'currency', currency: 'DOP' }).format(grandTotal)}</strong>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <button type="button" className="btn btn-secondary" onClick={() => navigate(-1)}>Cancelar</button>
            <button type="submit" className="btn btn-primary" disabled={saveMutation.isPending}>
              {saveMutation.isPending ? 'Guardando…' : 'Guardar Borrador'}
            </button>
          </div>
        </div>
      </form>
    </div>
  )
}
