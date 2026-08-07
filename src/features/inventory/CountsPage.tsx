import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { listCounts, getCountTemplate, createCount, submitCount, type CountTemplateItem } from '@/shared/api/counts'
import { listWarehouses } from '@/shared/api/inventory'
import { listSucursales } from '@/shared/api/sucursales'
import { listAlmacenes } from '@/shared/api/config'
import { isApiErrorCode, ERROR_CODES } from '@/shared/api/client'
import { formatDate, formatNumber } from '@/lib/formatters'
import type { InventoryCount } from '@/shared/api/types'
import { PageHeader } from '@/components/shared/PageHeader'
import { DepartmentSelect } from '@/components/shared/DepartmentSelect'
import { SearchSelect } from '@/shared/ui/SearchSelect'
import type { SearchSelectOption } from '@/shared/ui/SearchSelect'
import { Plus, ClipboardList, Send, AlertTriangle } from 'lucide-react'

const STATUS_BADGE: Record<string, string> = {
  Draft: 'badge-draft',
  Submitted: 'badge-submitted',
  Cancelled: 'badge-cancelled',
}
const STATUS_LABEL: Record<string, string> = {
  Draft: 'Borrador',
  Submitted: 'Sometido',
  Cancelled: 'Cancelado',
}

interface CountRow extends CountTemplateItem {
  // qty = the counted quantity entered by the user (maps to API field "qty")
  qty: number
}

export default function CountsPage() {
  const queryClient = useQueryClient()

  const [showNewDialog, setShowNewDialog] = useState(false)
  const [selectedWarehouse, setSelectedWarehouse] = useState<string>('')
  const [countRows, setCountRows] = useState<CountRow[]>([])
  const [templateLoading, setTemplateLoading] = useState(false)
  const [submitTarget, setSubmitTarget] = useState<InventoryCount | null>(null)
  const [branch, setBranch] = useState<string>('')
  const [department, setDepartment] = useState<string>('')
  const [mixedBranchError, setMixedBranchError] = useState<string | null>(null)

  const { data: warehouses } = useQuery({
    queryKey: ['warehouses'],
    queryFn: listWarehouses,
  })

  const { data: sucursales } = useQuery({
    queryKey: ['sucursales', 'for-count'],
    queryFn: () => listSucursales({ limit: 100 }),
    enabled: showNewDialog,
  })

  const { data: almacenes } = useQuery({
    queryKey: ['almacenes', 'for-count'],
    queryFn: () => listAlmacenes(),
    enabled: showNewDialog,
  })

  // Mapa almacén (warehouse) -> sucursal, para detectar mezcla de sucursales en las líneas
  const warehouseToBranch = useMemo(() => {
    const map = new Map<string, string>()
    almacenes?.forEach((a) => {
      if (a.branch) map.set(a.id, a.branch)
    })
    return map
  }, [almacenes])

  const [warehouseSearch, setWarehouseSearch] = useState('')
  const warehouseOptions: SearchSelectOption[] = (warehouses ?? [])
    .filter((w) => !warehouseSearch || w.name.toLowerCase().includes(warehouseSearch.toLowerCase()))
    .map((w) => ({ value: w.name, label: w.name }))

  const [branchSearch, setBranchSearch] = useState('')
  const branchOptions: SearchSelectOption[] = (sucursales?.items ?? [])
    .filter((s) => !branchSearch || s.name.toLowerCase().includes(branchSearch.toLowerCase()))
    .map((s) => ({ value: s.id, label: s.name }))

  const usedBranches = useMemo(() => {
    const set = new Set<string>()
    countRows.forEach((r) => {
      const wh = r.warehouse || selectedWarehouse
      const b = warehouseToBranch.get(wh)
      if (b) set.add(b)
    })
    return set
  }, [countRows, selectedWarehouse, warehouseToBranch])

  const hasMixedBranches = usedBranches.size > 1

  const { data, isLoading, isError } = useQuery({
    queryKey: ['counts'],
    queryFn: () => listCounts({ limit: 50 }),
  })

  const createMutation = useMutation({
    mutationFn: createCount,
    onSuccess: () => {
      toast.success('Conteo guardado como borrador')
      queryClient.invalidateQueries({ queryKey: ['counts'] })
      setShowNewDialog(false)
      setSelectedWarehouse('')
      setCountRows([])
      setBranch('')
      setDepartment('')
      setMixedBranchError(null)
    },
    onError: (error) => {
      if (isApiErrorCode(error, ERROR_CODES.MIXED_BRANCH_COUNT)) {
        setMixedBranchError(
          `${error.message} Sugerencia: divide este conteo en dos conteos separados, uno por cada sucursal.`,
        )
        toast.error(error.message)
        return
      }
      toast.error('Error al guardar el conteo')
    },
  })

  const submitMutation = useMutation({
    mutationFn: (id: string) => submitCount(id),
    onSuccess: () => {
      toast.success('Conteo sometido. Inventario ajustado.')
      queryClient.invalidateQueries({ queryKey: ['counts'] })
      setSubmitTarget(null)
    },
    onError: () => toast.error('Error al someter el conteo'),
  })

  async function handleWarehouseSelect(wh: string) {
    setSelectedWarehouse(wh)
    setTemplateLoading(true)
    try {
      const items = await getCountTemplate(wh)
      setCountRows(items.map((item) => ({ ...item, qty: item.actualQty })))
    } catch {
      toast.error('Error al cargar la plantilla del almacén')
    } finally {
      setTemplateLoading(false)
    }
  }

  function handleQtyChange(itemCode: string, val: string) {
    const parsed = parseFloat(val)
    setCountRows((rows) =>
      rows.map((r) => r.itemCode === itemCode ? { ...r, qty: isNaN(parsed) ? 0 : parsed } : r),
    )
  }

  function handleSaveDraft() {
    if (!selectedWarehouse) return
    const today = new Date().toISOString().slice(0, 10)
    createMutation.mutate({
      postingDate: today,                         // required by BFF
      branch: branch || undefined,
      department: department || undefined,
      items: countRows.map((r) => ({
        itemCode: r.itemCode,
        warehouse: r.warehouse || selectedWarehouse,  // warehouse at item level
        qty: r.qty,                               // API field is "qty" not "countedQty"
        valuationRate: r.valuationRate,
      })),
    })
  }

  function closeNewDialog() {
    setShowNewDialog(false)
    setSelectedWarehouse('')
    setCountRows([])
    setBranch('')
    setDepartment('')
    setMixedBranchError(null)
  }

  return (
    <div className="page-container">
      <PageHeader
        title="Conteos de Inventario"
        description="Gestiona los conteos físicos de inventario"
        action={
          <button className="btn btn-primary" onClick={() => setShowNewDialog(true)}>
            <Plus size={16} /> Nuevo Conteo
          </button>
        }
      />

      <div className="card">
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Almacén</th>
                <th>Estado</th>
                <th>Artículos</th>
                <th>Fecha</th>
                <th style={{ width: 96 }} />
              </tr>
            </thead>
            <tbody>
              {isLoading
                ? Array.from({ length: 5 }).map((_, i) => (
                    <tr key={i}>
                      {Array.from({ length: 6 }).map((__, j) => (
                        <td key={j}><div className="skeleton-box" style={{ height: 14, width: '100%' }} /></td>
                      ))}
                    </tr>
                  ))
                : isError
                  ? (
                      <tr>
                        <td colSpan={6} style={{ textAlign: 'center', padding: '32px 0', color: 'var(--error-text)' }}>
                          Error al cargar los conteos
                        </td>
                      </tr>
                    )
                  : data?.items.length === 0
                    ? (
                        <tr>
                          <td colSpan={6}>
                            <div className="empty-state">
                              <div className="empty-title">Sin conteos</div>
                              <p className="empty-sub">Crea tu primer conteo físico de inventario.</p>
                              <button className="btn btn-primary btn-size-sm" onClick={() => setShowNewDialog(true)}>
                                <Plus size={14} /> Nuevo Conteo
                              </button>
                            </div>
                          </td>
                        </tr>
                      )
                    : data?.items.map((count) => (
                        <tr key={count.id}>
                          <td style={{ fontFamily: 'monospace', fontSize: 12 }}>{count.id}</td>
                          <td>{count.postingDate ?? "—"}</td>
                          <td>
                            <span className={`badge ${STATUS_BADGE[count.status] ?? 'badge-neutral'}`}>
                              {STATUS_LABEL[count.status] ?? count.status}
                            </span>
                          </td>
                          <td className="td-muted">{count.items?.length ?? 0} artículos</td>
                          <td>{formatDate(count.createdAt)}</td>
                          <td>
                            {count.status === 'Draft' && (
                              <button
                                className="btn btn-secondary btn-size-sm"
                                onClick={() => setSubmitTarget(count)}
                              >
                                <Send size={13} /> Someter
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
            </tbody>
          </table>
        </div>
      </div>

      {showNewDialog && (
        <div className="modal-overlay" onClick={closeNewDialog}>
          <div className="modal-box modal-box-lg" onClick={(e) => e.stopPropagation()} style={{ display: 'flex', flexDirection: 'column', maxHeight: '90vh' }}>
            <div className="modal-head">
              <h2 className="modal-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <ClipboardList size={18} /> Nuevo Conteo de Inventario
              </h2>
              <button className="modal-close" type="button" onClick={closeNewDialog}>×</button>
            </div>
            <p className="modal-sub" style={{ padding: '0 20px 12px', color: 'var(--text-secondary)', fontSize: 13 }}>
              Selecciona un almacén y registra las cantidades contadas.
            </p>

            <div style={{ flex: 1, overflowY: 'auto', padding: '0 20px' }}>
              <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 16 }}>
                <div className="ff-wrap">
                  <label className="ff-label">Almacén</label>
                  <div style={{ maxWidth: 260 }}>
                    <SearchSelect
                      value={selectedWarehouse}
                      onChange={handleWarehouseSelect}
                      options={warehouseOptions}
                      onSearch={setWarehouseSearch}
                      selectedLabel={selectedWarehouse}
                      placeholder="Seleccionar almacén"
                    />
                  </div>
                </div>

                <div className="ff-wrap">
                  <label className="ff-label">Sucursal (opcional)</label>
                  <div style={{ maxWidth: 260 }}>
                    <SearchSelect
                      value={branch}
                      onChange={setBranch}
                      options={branchOptions}
                      onSearch={setBranchSearch}
                      selectedLabel={sucursales?.items.find((s) => s.id === branch)?.name ?? ''}
                      placeholder="Auto (según almacenes)"
                    />
                  </div>
                </div>

                <div className="ff-wrap">
                  <label className="ff-label">Departamento (opcional)</label>
                  <DepartmentSelect value={department} onChange={setDepartment} />
                </div>
              </div>

              {hasMixedBranches && (
                <div className="inline-alert inline-alert-warn" style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <AlertTriangle size={16} />
                  <span>Estás mezclando almacenes de sucursales distintas — esto no se puede guardar en un solo conteo.</span>
                </div>
              )}

              {mixedBranchError && (
                <div className="inline-alert inline-alert-warn" style={{ marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <AlertTriangle size={16} />
                  <span>{mixedBranchError}</span>
                </div>
              )}

              {templateLoading && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {Array.from({ length: 5 }).map((_, i) => (
                    <div key={i} className="skeleton-box" style={{ height: 40, width: '100%' }} />
                  ))}
                </div>
              )}

              {!templateLoading && countRows.length > 0 && (
                <div className="table-scroll" style={{ marginBottom: 16 }}>
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Artículo</th>
                        <th style={{ textAlign: 'right' }}>Stock Actual</th>
                        <th style={{ textAlign: 'right', width: 144 }}>Cantidad Contada</th>
                      </tr>
                    </thead>
                    <tbody>
                      {countRows.map((row) => (
                        <tr key={row.itemCode}>
                          <td>
                            <span style={{ fontWeight: 500 }}>{row.itemName}</span>
                            <span className="td-muted" style={{ marginLeft: 6, fontSize: 11 }}>({row.itemCode})</span>
                          </td>
                          <td style={{ textAlign: 'right' }}>{formatNumber(row.actualQty)}</td>
                          <td>
                            <input
                              type="number"
                              min="0"
                              step="1"
                              value={row.qty}
                              onChange={(e) => handleQtyChange(row.itemCode, e.target.value)}
                              className="items-input"
                              style={{ textAlign: 'right', width: 112, marginLeft: 'auto', display: 'block' }}
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="modal-foot">
              <button className="btn btn-ghost" onClick={closeNewDialog}>Cancelar</button>
              <button
                className="btn btn-primary"
                onClick={handleSaveDraft}
                disabled={!selectedWarehouse || countRows.length === 0 || createMutation.isPending}
              >
                {createMutation.isPending ? 'Guardando…' : 'Guardar Borrador'}
              </button>
            </div>
          </div>
        </div>
      )}

      {submitTarget && (
        <div className="modal-overlay" onClick={() => setSubmitTarget(null)}>
          <div className="modal-box modal-box-sm" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <h2 className="modal-title">¿Someter conteo?</h2>
              <button className="modal-close" type="button" onClick={() => setSubmitTarget(null)}>×</button>
            </div>
            <div className="modal-body">
              <p style={{ fontSize: 14 }}>
                Esta acción ajusta el inventario del almacén <strong>{submitTarget.id}</strong> con las cantidades contadas.
                Esta operación no se puede deshacer.
              </p>
            </div>
            <div className="modal-foot">
              <button className="btn btn-ghost" onClick={() => setSubmitTarget(null)}>Cancelar</button>
              <button
                className="btn btn-primary"
                onClick={() => submitMutation.mutate(submitTarget.id)}
                disabled={submitMutation.isPending}
              >
                Someter y Ajustar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
