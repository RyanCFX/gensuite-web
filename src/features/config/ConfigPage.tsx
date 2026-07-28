import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useTabs } from '@/contexts/TabsContext'
import { toast } from 'sonner'
import axios from 'axios'
import {
  getCobrosConfig, updateCobrosConfig,
  listAlmacenes, createAlmacen, deleteAlmacen, updateAlmacen,
  listMetodosPago, createMetodoPago, updateMetodoPago,
  listUOMs, createUOM, getUOM, updateUOM,
  listListasPrecio,
  getNcfSeries,
  getPerfil, updatePerfil,
  listImpuestosVentas, createImpuestoVentas, updateImpuestoVentas, deleteImpuestoVentas,
  listImpuestosCompras, createImpuestoCompras, updateImpuestoCompras, deleteImpuestoCompras,
  listItemTaxTemplates, createItemTaxTemplate, updateItemTaxTemplate, deleteItemTaxTemplate,
  listGruposProveedores, createGrupoProveedor,
  getFacturacionConfig, updateFacturacionConfig,
  listDenominaciones, createDenominacion, updateDenominacion,
  habilitarPos,
} from '@/shared/api/config'
import { listSucursales } from '@/shared/api/sucursales'
import { listCustomerGroups, createCustomerGroup, deleteCustomerGroup } from '@/shared/api/customers'
import { listRoles } from '@/shared/api/usuarios'
import type { CobrosConfig, MetodoPago, TaxTemplate, TaxTemplateLine, TaxChargeType, TaxLineCategory, TaxLineAddDeduct, CreateTaxTemplateDto, ItemTaxTemplate, ItemTaxLine, CreateItemTaxTemplateDto, GrupoCliente, FacturacionConfig, Denominacion, ApiError } from '@/shared/api/types'
import { PageHeader } from '@/components/shared/PageHeader'
import { SearchSelect } from '@/shared/ui/SearchSelect'
import { AccountSelect } from '@/components/shared/AccountSelect'
import { formatDate } from '@/lib/formatters'
import { Plus, Trash2, Save, FileWarning, X, Pencil, ChevronLeft, ChevronRight } from 'lucide-react'
import EjercicioFiscalSection from './EjercicioFiscalSection'

function is503(error: unknown): boolean {
  if (axios.isAxiosError(error) && error.response?.status === 503) return true
  return false
}

function ServiceUnavailableBanner({ message }: { message: string }) {
  return (
    <div className="service-unavailable">
      <div className="service-unavailable-icon">
        <FileWarning size={24} />
      </div>
      <p style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)' }}>Función no disponible</p>
      <p style={{ fontSize: 13, color: 'var(--text-secondary)', maxWidth: 360 }}>{message}</p>
    </div>
  )
}

// ---- Cobros Config Section ----
function CobrosConfigSection() {
  const queryClient = useQueryClient()
  const { data, isLoading } = useQuery({ queryKey: ['cobros-config'], queryFn: getCobrosConfig })
  const [form, setForm] = useState<Partial<CobrosConfig>>({})

  useEffect(() => { if (data) setForm(data) }, [data])

  const saveMutation = useMutation({
    mutationFn: (dto: Partial<CobrosConfig>) => updateCobrosConfig(dto),
    onSuccess: () => { toast.success('Configuración de cobros actualizada'); queryClient.invalidateQueries({ queryKey: ['cobros-config'] }) },
    onError: () => toast.error('Error al guardar'),
  })

  if (isLoading) return <span className="skeleton-box" style={{ height: 256, display: 'block' }} />

  function setNum(key: keyof CobrosConfig, val: number) {
    setForm((prev) => ({ ...prev, [key]: val }))
  }

  return (
    <div className="card">
      <div className="card-header">
        <span className="card-title">Configuración de Cobranza</span>
      </div>
      <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        <div className="ff-wrap">
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
            <label className="ff-label">Alerta Amarilla — límite de crédito usado</label>
            <span style={{ fontWeight: 600, fontSize: 13 }}>{form.limiteCreditoAmarilloPct ?? 70}%</span>
          </div>
          <input
            type="range" min={1} max={100} step={1}
            value={form.limiteCreditoAmarilloPct ?? 70}
            onChange={(e) => setNum('limiteCreditoAmarilloPct', parseInt(e.target.value))}
            style={{ width: '100%', accentColor: 'var(--warning-text)' }}
          />
        </div>
        <div className="ff-wrap">
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
            <label className="ff-label">Alerta Roja — límite de crédito usado</label>
            <span style={{ fontWeight: 600, fontSize: 13 }}>{form.limiteCreditoRojoPct ?? 90}%</span>
          </div>
          <input
            type="range" min={1} max={100} step={1}
            value={form.limiteCreditoRojoPct ?? 90}
            onChange={(e) => setNum('limiteCreditoRojoPct', parseInt(e.target.value))}
            style={{ width: '100%', accentColor: 'var(--error-text)' }}
          />
        </div>
        <div className="ff-wrap">
          <label className="ff-label">Días para alerta de vencimiento</label>
          <input
            type="number" min={0}
            className="ff-input"
            style={{ width: 128 }}
            value={form.diasAlertaVencimiento ?? 7}
            onChange={(e) => setNum('diasAlertaVencimiento', parseInt(e.target.value) || 0)}
          />
        </div>

        <div>
          <button className="btn btn-primary" onClick={() => saveMutation.mutate(form)} disabled={saveMutation.isPending}>
            <Save size={16} />
            {saveMutation.isPending ? 'Guardando…' : 'Guardar'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ---- Almacenes Section ----
function AlmacenesSection() {
  const queryClient = useQueryClient()
  const [showNew, setShowNew] = useState(false)
  const [newName, setNewName] = useState('')
  const [newBranch, setNewBranch] = useState('')
  const [newWarehouseType, setNewWarehouseType] = useState('')
  const [newAccount, setNewAccount] = useState('')
  const [toDelete, setToDelete] = useState<string | null>(null)
  const [editTarget, setEditTarget] = useState<{ name: string; branch?: string | null; warehouseType?: string } | null>(null)
  const [editWarehouseAccount, setEditWarehouseAccount] = useState('')
  const [editBranch, setEditBranch] = useState('')
  const [editWarehouseType, setEditWarehouseType] = useState('')
  const [branchFilter, setBranchFilter] = useState('')

  const { data, isLoading } = useQuery({
    queryKey: ['almacenes', { branch: branchFilter }],
    queryFn: () => listAlmacenes({ branch: branchFilter || undefined }),
  })

  const { data: sucursalesData } = useQuery({
    queryKey: ['sucursales-all'],
    queryFn: () => listSucursales({ limit: 100 }),
  })
  const sucursales = sucursalesData?.items ?? []

  const createMutation = useMutation({
    mutationFn: () => createAlmacen({ warehouseName: newName, branch: newBranch || undefined, warehouseType: newWarehouseType || undefined, account: newAccount || undefined }),
    onSuccess: () => { toast.success('Almacén creado'); queryClient.invalidateQueries({ queryKey: ['almacenes'] }); setShowNew(false); setNewName(''); setNewBranch(''); setNewWarehouseType(''); setNewAccount('') },
    onError: () => toast.error('Error al crear el almacén'),
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, data: d }: { id: string; data: Partial<{ warehouseName: string; account: string; branch: string; warehouseType: string }> }) =>
      updateAlmacen(id, d),
    onSuccess: () => { toast.success('Almacén actualizado'); queryClient.invalidateQueries({ queryKey: ['almacenes'] }); setEditTarget(null) },
    onError: () => toast.error('Error al actualizar el almacén'),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteAlmacen(id),
    onSuccess: () => { toast.success('Almacén eliminado'); queryClient.invalidateQueries({ queryKey: ['almacenes'] }); setToDelete(null) },
    onError: () => toast.error('Error al eliminar el almacén'),
  })

  function openEdit(a: { name: string; branch?: string | null; warehouseType?: string }) {
    setEditTarget(a)
    setEditWarehouseAccount('')
    setEditWarehouseType(a.warehouseType ?? '')
    setEditBranch(a.branch ?? '')
    setToDelete(null)
  }

  return (
    <>
      <div className="card">
        <div className="card-header">
          <span className="card-title">Almacenes</span>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <select className="filter-select" value={branchFilter} onChange={(e) => setBranchFilter(e.target.value)}>
              <option value="">Todas las sucursales</option>
              {sucursales.map((s) => (
                <option key={s.id} value={s.name}>{s.name}</option>
              ))}
            </select>
            <button className="btn btn-primary btn-size-sm" onClick={() => setShowNew(true)}>
              <Plus size={14} />Nuevo
            </button>
          </div>
        </div>
        <div>
          {isLoading
            ? <span className="skeleton-box" style={{ height: 128, display: 'block', margin: 16 }} />
            : (
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Nombre</th>
                      <th>Sucursal</th>
                      <th>Tipo</th>
                      <th>Cuenta</th>
                      <th>Estado</th>
                      <th style={{ width: 80 }} />
                    </tr>
                  </thead>
                  <tbody>
                    {data?.map((a) => (
                      <tr key={a.name}>
                        <td style={{ fontWeight: 500 }}>{a.name}</td>
                        <td className="td-muted">{a.branch ?? '—'}</td>
                        <td className="td-muted">{a.warehouseType === 'Transit' ? <span className="badge badge-neutral">Tránsito</span> : (a.warehouseType ?? '—')}</td>
                        <td className="td-muted">{a.account ?? '—'}</td>
                        <td>
                          {a.disabled
                            ? <span className="badge badge-error">Inactivo</span>
                            : <span className="badge badge-success">Activo</span>}
                        </td>
                        <td>
                          <div style={{ display: 'flex', gap: 4 }}>
                            <button
                              className="btn btn-ghost btn-size-icon-sm"
                              onClick={() => openEdit(a)}
                            >
                              <Pencil size={13} />
                            </button>
                            <button
                              className="btn btn-ghost btn-size-icon-sm"
                              style={{ color: 'var(--icon-muted)' }}
                              onClick={() => setToDelete(a.name)}
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
        </div>
      </div>

      {showNew && (
        <div className="modal-overlay" onClick={() => setShowNew(false)}>
          <div className="modal-box modal-box-sm" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <h2 className="modal-title">Nuevo Almacén</h2>
              <button className="modal-close" onClick={() => setShowNew(false)}><X size={16} /></button>
            </div>
            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div className="ff-wrap">
                <label className="ff-label">Nombre del almacén</label>
                <input className="ff-input" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Almacén Principal" />
              </div>
              <div className="ff-wrap">
                <label className="ff-label">Sucursal</label>
                <select className="ff-select" value={newBranch} onChange={(e) => setNewBranch(e.target.value)}>
                  <option value="">Sin asignar</option>
                  {sucursales.map((s) => (
                    <option key={s.id} value={s.name}>{s.name}</option>
                  ))}
                </select>
              </div>
              <div className="ff-wrap">
                <label className="ff-label">Tipo de Almacén</label>
                <select className="ff-select" value={newWarehouseType} onChange={(e) => setNewWarehouseType(e.target.value)}>
                  <option value="">Estándar</option>
                  <option value="Transit">Tránsito</option>
                </select>
                <p className="ff-hint">"Tránsito" se usa como punto intermedio en transferencias entre almacenes.</p>
              </div>
              <div className="ff-wrap">
                <label className="ff-label">Cuenta de Inventario</label>
                <AccountSelect
                  value={newAccount}
                  onChange={setNewAccount}
                  placeholder="Buscar cuenta de inventario…"
                  rootType="Asset"
                />
              </div>
            </div>
            <div className="modal-foot">
              <button className="btn btn-secondary" onClick={() => setShowNew(false)}>Cancelar</button>
              <button className="btn btn-primary" onClick={() => createMutation.mutate()} disabled={!newName || createMutation.isPending}>
                {createMutation.isPending ? 'Creando…' : 'Crear'}
              </button>
            </div>
          </div>
        </div>
      )}

      {editTarget && (
        <div className="modal-overlay" onClick={() => setEditTarget(null)}>
          <div className="modal-box modal-box-sm" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <h2 className="modal-title">Editar Almacén</h2>
              <button className="modal-close" onClick={() => setEditTarget(null)}><X size={16} /></button>
            </div>
            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div className="ff-wrap">
                <label className="ff-label">Sucursal</label>
                <select className="ff-select" value={editBranch} onChange={(e) => setEditBranch(e.target.value)}>
                  <option value="">Sin asignar</option>
                  {sucursales.map((s) => (
                    <option key={s.id} value={s.name}>{s.name}</option>
                  ))}
                </select>
              </div>
              <div className="ff-wrap">
                <label className="ff-label">Tipo de Almacén</label>
                <select className="ff-select" value={editWarehouseType} onChange={(e) => setEditWarehouseType(e.target.value)}>
                  <option value="">Estándar</option>
                  <option value="Transit">Tránsito</option>
                </select>
              </div>
              <div className="ff-wrap">
                <label className="ff-label">Cuenta de Inventario</label>
                <AccountSelect
                  value={editWarehouseAccount}
                  onChange={setEditWarehouseAccount}
                  placeholder="Buscar cuenta de inventario…"
                  rootType="Asset"
                />
              </div>
            </div>
            <div className="modal-foot">
              <button className="btn btn-secondary" onClick={() => setEditTarget(null)}>Cancelar</button>
              <button
                className="btn btn-primary"
                onClick={() => updateMutation.mutate({ id: editTarget.name, data: { account: editWarehouseAccount || undefined, branch: editBranch || undefined, warehouseType: editWarehouseType || undefined } })}
                disabled={updateMutation.isPending}
              >
                {updateMutation.isPending ? 'Guardando…' : 'Guardar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {toDelete && (
        <div className="modal-overlay" onClick={() => setToDelete(null)}>
          <div className="modal-box modal-box-sm" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <h2 className="modal-title">¿Eliminar almacén?</h2>
              <button className="modal-close" onClick={() => setToDelete(null)}><X size={16} /></button>
            </div>
            <div className="modal-body">
              <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Esta acción no se puede deshacer.</p>
            </div>
            <div className="modal-foot">
              <button className="btn btn-secondary" onClick={() => setToDelete(null)}>Cancelar</button>
              <button
                className="btn btn-danger"
                onClick={() => toDelete && deleteMutation.mutate(toDelete)}
                disabled={deleteMutation.isPending}
              >
                Eliminar
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

// ---- Metodos de Pago Section ----
function MetodosPagoSection() {
  const queryClient = useQueryClient()
  const [showNew, setShowNew] = useState(false)
  const [newName, setNewName] = useState('')
  const [newType, setNewType] = useState<MetodoPago['type']>('Cash')
  const [editTarget, setEditTarget] = useState<MetodoPago | null>(null)
  const [editAccount, setEditAccount] = useState('')

  const { data, isLoading } = useQuery({ queryKey: ['metodos-pago'], queryFn: listMetodosPago })

  const createMutation = useMutation({
    mutationFn: () => createMetodoPago({ name: newName, type: newType }),
    onSuccess: () => { toast.success('Método de pago creado'); queryClient.invalidateQueries({ queryKey: ['metodos-pago'] }); setShowNew(false); setNewName('') },
    onError: () => toast.error('Error al crear el método'),
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, data: d }: { id: string; data: Partial<MetodoPago & { account?: string }> }) =>
      updateMetodoPago(id, d),
    onSuccess: () => { toast.success('Método de pago actualizado'); queryClient.invalidateQueries({ queryKey: ['metodos-pago'] }); setEditTarget(null) },
    onError: () => toast.error('Error al actualizar el método'),
  })

  function openEdit(m: MetodoPago) {
    setEditTarget(m)
    setEditAccount('')
    setShowNew(false)
  }

  return (
    <>
      <div className="card">
        <div className="card-header">
          <span className="card-title">Métodos de Pago</span>
          <button className="btn btn-primary btn-size-sm" onClick={() => setShowNew(true)}>
            <Plus size={14} />Nuevo
          </button>
        </div>
        <div>
          {isLoading
            ? <span className="skeleton-box" style={{ height: 128, display: 'block', margin: 16 }} />
            : (
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Nombre</th>
                      <th>Tipo</th>
                      <th>Estado</th>
                      <th style={{ width: 48 }} />
                    </tr>
                  </thead>
                  <tbody>
                    {data?.map((m) => (
                      <tr key={m.name}>
                        <td style={{ fontWeight: 500 }}>{m.name}</td>
                        <td className="td-muted">{m.type}</td>
                        <td>
                          {m.disabled
                            ? <span className="badge badge-error">Inactivo</span>
                            : <span className="badge badge-success">Activo</span>}
                        </td>
                        <td>
                          <button className="btn btn-ghost btn-size-icon-sm" onClick={() => openEdit(m)}>
                            <Pencil size={13} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
        </div>
      </div>

      {showNew && (
        <div className="modal-overlay" onClick={() => setShowNew(false)}>
          <div className="modal-box modal-box-sm" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <h2 className="modal-title">Nuevo Método de Pago</h2>
              <button className="modal-close" onClick={() => setShowNew(false)}><X size={16} /></button>
            </div>
            <div className="modal-body">
              <div className="ff-wrap">
                <label className="ff-label">Nombre</label>
                <input className="ff-input" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Efectivo" />
              </div>
              <div className="ff-wrap">
                <label className="ff-label">Tipo</label>
                <select className="ff-select" value={newType} onChange={(e) => setNewType(e.target.value as MetodoPago['type'])}>
                  <option value="Cash">Cash</option>
                  <option value="Bank">Bank</option>
                  <option value="General">General</option>
                </select>
              </div>
            </div>
            <div className="modal-foot">
              <button className="btn btn-secondary" onClick={() => setShowNew(false)}>Cancelar</button>
              <button className="btn btn-primary" onClick={() => createMutation.mutate()} disabled={!newName || createMutation.isPending}>
                {createMutation.isPending ? 'Creando…' : 'Crear'}
              </button>
            </div>
          </div>
        </div>
      )}

      {editTarget && (
        <div className="modal-overlay" onClick={() => setEditTarget(null)}>
          <div className="modal-box modal-box-sm" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <h2 className="modal-title">Editar Método de Pago</h2>
              <button className="modal-close" onClick={() => setEditTarget(null)}><X size={16} /></button>
            </div>
            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div className="ff-wrap">
                <label className="ff-label">Cuenta Bancaria / Caja</label>
                <AccountSelect
                  value={editAccount}
                  onChange={setEditAccount}
                  placeholder="Buscar cuenta bancaria o caja…"
                />
                <p className="ff-hint">Ej: "Efectivo RD" → "Cash - JB"</p>
              </div>
            </div>
            <div className="modal-foot">
              <button className="btn btn-secondary" onClick={() => setEditTarget(null)}>Cancelar</button>
              <button
                className="btn btn-primary"
                onClick={() => updateMutation.mutate({ id: editTarget.name, data: { account: editAccount || undefined } })}
                disabled={updateMutation.isPending}
              >
                {updateMutation.isPending ? 'Guardando…' : 'Guardar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

// ---- UOM Section ----
const UOM_PAGE_SIZE = 10

interface UomConversionRow {
  toUom: string
  factor: string // string para el input, se convierte a number al enviar
  searchQuery: string // para filtrar el SearchSelect de cada fila
}

function UomSection() {
  const queryClient = useQueryClient()
  const [showCreate, setShowCreate] = useState(false)
  const [newUomName, setNewUomName] = useState('')
  const [conversions, setConversions] = useState<UomConversionRow[]>([])
  const [convErrors, setConvErrors] = useState<Record<number, string>>({})
  const [detailId, setDetailId] = useState<string | null>(null)
  const [editing, setEditing] = useState(false)
  const [editName, setEditName] = useState('')
  const [editConversions, setEditConversions] = useState<UomConversionRow[]>([])
  const [editConvErrors, setEditConvErrors] = useState<Record<number, string>>({})
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')

  const { data, isLoading } = useQuery({ queryKey: ['uom'], queryFn: listUOMs })
  const uoms = data ?? []

  // Filtrado + paginación client-side
  const sortedUoms = [...uoms]
    .sort((a, b) => a.name.localeCompare(b.name))
    .filter(u => !search || u.name.toLowerCase().includes(search.toLowerCase()))
  const totalPages = Math.max(1, Math.ceil(sortedUoms.length / UOM_PAGE_SIZE))
  const offset = (page - 1) * UOM_PAGE_SIZE
  const pageUoms = sortedUoms.slice(offset, offset + UOM_PAGE_SIZE)

  const { data: detailData, isLoading: isDetailLoading } = useQuery({
    queryKey: ['uom', detailId],
    queryFn: () => getUOM(detailId!),
    enabled: !!detailId,
  })

  const createMutation = useMutation({
    mutationFn: () => createUOM({
      name: newUomName,
      conversions: conversions.length
        ? conversions.map(c => ({ toUom: c.toUom, factor: Number(c.factor) }))
        : undefined,
    }),
    onSuccess: () => {
      toast.success('Unidad creada')
      queryClient.invalidateQueries({ queryKey: ['uom'] })
      setShowCreate(false)
      setNewUomName('')
      setConversions([])
      setConvErrors({})
    },
    onError: () => toast.error('Error al crear la unidad'),
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, dto }: { id: string; dto: Parameters<typeof updateUOM>[1] }) =>
      updateUOM(id, dto),
    onSuccess: () => {
      toast.success('Unidad actualizada')
      queryClient.invalidateQueries({ queryKey: ['uom'] })
      setEditing(false)
      setDetailId(null)
    },
    onError: () => toast.error('Error al actualizar la unidad'),
  })

  function openEdit() {
    if (!detailData) return
    setEditName(detailId ?? '')
    setEditConversions(
      detailData.conversions.map(c => ({ toUom: c.toUom, factor: String(c.factor), searchQuery: '' }))
    )
    setEditConvErrors({})
    setEditing(true)
  }

  function handleUpdate() {
    if (!detailId) return
    const errors: Record<number, string> = {}
    const seenUoms = new Set<string>()
    editConversions.forEach((row, idx) => {
      if (!row.toUom && !row.factor) return
      if (!row.toUom) { errors[idx] = 'Selecciona la UOM destino'; return }
      if (!row.factor || Number(row.factor) <= 0) { errors[idx] = 'El factor debe ser mayor a 0'; return }
      if (seenUoms.has(row.toUom)) { errors[idx] = 'UOM duplicada'; return }
      seenUoms.add(row.toUom)
    })
    if (Object.keys(errors).length) { setEditConvErrors(errors); return }

    const dto: Parameters<typeof updateUOM>[1] = {}
    if (editName && editName !== detailId) dto.name = editName
    const validConversions = editConversions.filter(r => r.toUom && r.factor)
    if (validConversions.length) {
      dto.conversions = validConversions.map(r => ({ toUom: r.toUom, factor: Number(r.factor) }))
    }
    if (Object.keys(dto).length === 0) { setEditing(false); return }
    updateMutation.mutate({ id: detailId, dto })
  }

  function addConversionRow() {
    setConversions(prev => [...prev, { toUom: '', factor: '', searchQuery: '' }])
  }

  function removeConversionRow(idx: number) {
    setConversions(prev => prev.filter((_, i) => i !== idx))
    setConvErrors(prev => {
      const next = { ...prev }
      delete next[idx]
      return next
    })
  }

  function updateConversionRow(idx: number, field: keyof UomConversionRow, value: string) {
    setConversions(prev => prev.map((r, i) => i === idx ? { ...r, [field]: value } : r))
    setConvErrors(prev => { const next = { ...prev }; delete next[idx]; return next })
  }

  function validateAndSave() {
    const errors: Record<number, string> = {}
    const seenUoms = new Set<string>()
    conversions.forEach((row, idx) => {
      if (!row.toUom && !row.factor) return // vacía, se ignora (si el user la dejó vacía)
      if (!row.toUom) { errors[idx] = 'Selecciona la UOM destino'; return }
      if (!row.factor || Number(row.factor) <= 0) { errors[idx] = 'El factor debe ser mayor a 0'; return }
      if (seenUoms.has(row.toUom)) { errors[idx] = 'UOM duplicada en la tabla'; return }
      seenUoms.add(row.toUom)
    })
    if (Object.keys(errors).length) { setConvErrors(errors); return }
    // filtrar filas completamente vacías
    setConversions(prev => prev.filter(r => r.toUom || r.factor))
    createMutation.mutate()
  }

  // UOMs disponibles para seleccionar como destino (excluye la UOM que se está creando)
  const availableUoms = uoms.filter(u => u.name !== newUomName)

  return (
    <>
      <div className="card">
        <div className="card-header">
          <span className="card-title">Unidades de Medida</span>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input
              className="ff-input"
              style={{ width: 200 }}
              placeholder="Buscar…"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1) }}
            />
            <button className="btn btn-primary btn-size-sm" onClick={() => { setNewUomName(''); setConversions([]); setConvErrors({}); setShowCreate(true) }}>
              <Plus size={14} />Nueva
            </button>
          </div>
        </div>
        <div>
          {isLoading
            ? <span className="skeleton-box" style={{ height: 128, display: 'block', margin: 16 }} />
            : (
                <>
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Nombre</th>
                        <th style={{ width: 100 }} />
                      </tr>
                    </thead>
                    <tbody>
                      {pageUoms.length === 0
                        ? (
                            <tr>
                              <td colSpan={2} style={{ textAlign: 'center', color: 'var(--text-secondary)', padding: '24px 0' }}>
                                Sin resultados para "{search}"
                              </td>
                            </tr>
                          )
                        : pageUoms.map(u => (
                            <tr key={u.name}>
                              <td style={{ fontWeight: 500 }}>{u.name}</td>
                              <td>
                                <button className="btn btn-ghost btn-size-sm" onClick={() => setDetailId(u.name)}>
                                  Ver detalle
                                </button>
                              </td>
                            </tr>
                          ))
                      }
                    </tbody>
                  </table>
                  {sortedUoms.length > UOM_PAGE_SIZE && (
                    <div className="pagination">
                      <span className="pagination-info">
                        Mostrando {offset + 1}–{Math.min(offset + UOM_PAGE_SIZE, sortedUoms.length)} de {sortedUoms.length}
                      </span>
                      <div className="pagination-controls">
                        <button
                          className="btn btn-ghost btn-size-icon-sm"
                          disabled={page === 1}
                          onClick={() => setPage(p => p - 1)}
                        >
                          <ChevronLeft size={14} />
                        </button>
                        <span style={{ fontSize: 12, color: 'var(--text-secondary)', padding: '0 8px' }}>
                          {page} / {totalPages}
                        </span>
                        <button
                          className="btn btn-ghost btn-size-icon-sm"
                          disabled={page === totalPages}
                          onClick={() => setPage(p => p + 1)}
                        >
                          <ChevronRight size={14} />
                        </button>
                      </div>
                    </div>
                  )}
                </>
              )}
        </div>
      </div>

      {/* Create modal */}
      {showCreate && (
        <div className="modal-overlay" onClick={() => setShowCreate(false)}>
          <div className="modal-box" style={{ maxWidth: 560 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <h2 className="modal-title">Nueva Unidad de Medida</h2>
              <button className="modal-close" onClick={() => setShowCreate(false)}><X size={16} /></button>
            </div>
            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div className="ff-wrap">
                <label className="ff-label">Nombre <span className="ff-required">*</span></label>
                <input
                  className="ff-input"
                  value={newUomName}
                  onChange={(e) => setNewUomName(e.target.value)}
                  placeholder="Caja, Litro, Kg…"
                  autoFocus
                />
              </div>

              {/* Conversions table */}
              <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                  <span className="ff-label" style={{ margin: 0 }}>Factores de conversión <span style={{ fontWeight: 400, color: 'var(--text-secondary)' }}>(opcional)</span></span>
                  <button type="button" className="btn btn-ghost btn-size-sm" onClick={addConversionRow}>
                    <Plus size={13} />Agregar conversión
                  </button>
                </div>
                {conversions.length > 0 && (
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid var(--border-default)' }}>
                        <th style={{ textAlign: 'left', padding: '4px 8px', color: 'var(--text-secondary)', fontWeight: 500 }}>
                          1 {newUomName || '[esta UOM]'} =
                        </th>
                        <th style={{ textAlign: 'left', padding: '4px 8px', color: 'var(--text-secondary)', fontWeight: 500 }}>Otra UOM</th>
                        <th style={{ width: 36 }} />
                      </tr>
                    </thead>
                    <tbody>
                      {conversions.map((row, idx) => {
                        const filteredOptions = availableUoms
                          .filter(u => !row.searchQuery || u.name.toLowerCase().includes(row.searchQuery.toLowerCase()))
                          .map(u => ({ value: u.name, label: u.name }))
                        return (
                          <tr key={idx}>
                            <td style={{ padding: '4px 8px 4px 0' }}>
                              <input
                                className={`ff-input${convErrors[idx] ? ' ff-input-error' : ''}`}
                                type="number"
                                min="0.0001"
                                step="0.0001"
                                value={row.factor}
                                onChange={(e) => updateConversionRow(idx, 'factor', e.target.value)}
                                placeholder="Ej: 12"
                                style={{ width: '100%' }}
                              />
                            </td>
                            <td style={{ padding: '4px 8px' }}>
                              <SearchSelect
                                value={row.toUom}
                                options={filteredOptions}
                                onSearch={(q) => setConversions(prev => prev.map((r, i) => i === idx ? { ...r, searchQuery: q } : r))}
                                onChange={(val) => updateConversionRow(idx, 'toUom', val)}
                                placeholder="Buscar UOM…"
                                error={!!convErrors[idx]}
                              />
                              {convErrors[idx] && <p className="ff-error" style={{ marginTop: 2 }}>{convErrors[idx]}</p>}
                            </td>
                            <td style={{ padding: '4px 0 4px 4px', verticalAlign: 'top' }}>
                              <button type="button" className="btn btn-ghost btn-size-icon-sm" onClick={() => removeConversionRow(idx)}>
                                <Trash2 size={13} />
                              </button>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                )}
                {conversions.length === 0 && (
                  <p className="ff-hint">Sin conversiones. Útil si esta UOM equivale a múltiples otras (ej: 1 Caja = 12 Nos).</p>
                )}
              </div>
            </div>
            <div className="modal-foot">
              <button className="btn btn-secondary" onClick={() => setShowCreate(false)}>Cancelar</button>
              <button
                className="btn btn-primary"
                onClick={validateAndSave}
                disabled={!newUomName || createMutation.isPending}
              >
                {createMutation.isPending ? 'Creando…' : 'Crear'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Detail / Edit modal */}
      {detailId && (
        <div className="modal-overlay" onClick={() => { setDetailId(null); setEditing(false) }}>
          <div className="modal-box" style={{ maxWidth: 480 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <h2 className="modal-title">{editing ? 'Editar UOM' : detailId}</h2>
              <button className="modal-close" onClick={() => { setDetailId(null); setEditing(false) }}><X size={16} /></button>
            </div>

            {editing ? (
              <>
                <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  <div className="ff-wrap">
                    <label className="ff-label">Nombre</label>
                    <input className="ff-input" value={editName} onChange={(e) => setEditName(e.target.value)} />
                  </div>

                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                      <span className="ff-label" style={{ margin: 0 }}>
                        Factores de conversión
                        <span style={{ fontWeight: 400, color: 'var(--text-secondary)' }}> (opcional)</span>
                      </span>
                      <button
                        type="button"
                        className="btn btn-ghost btn-size-sm"
                        onClick={() => setEditConversions(prev => [...prev, { toUom: '', factor: '', searchQuery: '' }])}
                      >
                        <Plus size={13} />Agregar
                      </button>
                    </div>

                    {editConversions.length > 0 ? (
                      <>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                          <thead>
                            <tr style={{ borderBottom: '1px solid var(--border-default)' }}>
                              <th style={{ textAlign: 'left', padding: '4px 8px 4px 0', color: 'var(--text-secondary)', fontWeight: 500 }}>
                                1 {editName || detailId} =
                              </th>
                              <th style={{ textAlign: 'left', padding: '4px 8px', color: 'var(--text-secondary)', fontWeight: 500 }}>Otra UOM</th>
                              <th style={{ width: 36 }} />
                            </tr>
                          </thead>
                          <tbody>
                            {editConversions.map((row, idx) => {
                              const opts = uoms
                                .filter(u => u.name !== detailId && (!row.searchQuery || u.name.toLowerCase().includes(row.searchQuery.toLowerCase())))
                                .map(u => ({ value: u.name, label: u.name }))
                              return (
                                <tr key={idx}>
                                  <td style={{ padding: '4px 8px 4px 0' }}>
                                    <input
                                      className={`ff-input${editConvErrors[idx] ? ' ff-input-error' : ''}`}
                                      type="number"
                                      min="0.0001"
                                      step="0.0001"
                                      value={row.factor}
                                      onChange={(e) => setEditConversions(prev => prev.map((r, i) => i === idx ? { ...r, factor: e.target.value } : r))}
                                      placeholder="Ej: 24"
                                      style={{ width: '100%' }}
                                    />
                                  </td>
                                  <td style={{ padding: '4px 8px' }}>
                                    <SearchSelect
                                      value={row.toUom}
                                      options={opts}
                                      onSearch={(q) => setEditConversions(prev => prev.map((r, i) => i === idx ? { ...r, searchQuery: q } : r))}
                                      onChange={(val) => {
                                        setEditConversions(prev => prev.map((r, i) => i === idx ? { ...r, toUom: val } : r))
                                        setEditConvErrors(prev => { const n = { ...prev }; delete n[idx]; return n })
                                      }}
                                      placeholder="Buscar UOM…"
                                      error={!!editConvErrors[idx]}
                                    />
                                    {editConvErrors[idx] && <p className="ff-error" style={{ marginTop: 2 }}>{editConvErrors[idx]}</p>}
                                  </td>
                                  <td style={{ padding: '4px 0 4px 4px', verticalAlign: 'top' }}>
                                    <button
                                      type="button"
                                      className="btn btn-ghost btn-size-icon-sm"
                                      onClick={() => setEditConversions(prev => prev.filter((_, i) => i !== idx))}
                                    >
                                      <Trash2 size={13} />
                                    </button>
                                  </td>
                                </tr>
                              )
                            })}
                          </tbody>
                        </table>
                        <p className="ff-hint" style={{ marginTop: 6, color: 'var(--color-warning, #b45309)' }}>
                          Los factores enviados se crearán o actualizarán. Los de otras UOM destino no se eliminan.
                        </p>
                      </>
                    ) : (
                      <p className="ff-hint">Sin conversiones. Los factores existentes no se modificarán.</p>
                    )}
                  </div>
                </div>
                <div className="modal-foot">
                  <button className="btn btn-secondary" onClick={() => setEditing(false)}>Cancelar</button>
                  <button className="btn btn-primary" onClick={handleUpdate} disabled={updateMutation.isPending}>
                    {updateMutation.isPending ? 'Guardando…' : 'Guardar'}
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="modal-body">
                  {isDetailLoading
                    ? <span className="skeleton-box" style={{ height: 80, display: 'block' }} />
                    : detailData?.conversions.length
                      ? (
                          <table className="data-table">
                            <thead>
                              <tr>
                                <th>1 {detailId} equivale a</th>
                                <th>UOM destino</th>
                              </tr>
                            </thead>
                            <tbody>
                              {detailData.conversions.map((c, i) => (
                                <tr key={i}>
                                  <td>{c.factor}</td>
                                  <td>{c.toUom}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        )
                      : <p style={{ color: 'var(--text-secondary)', fontSize: 14 }}>Esta UOM no tiene conversiones configuradas.</p>
                  }
                </div>
                <div className="modal-foot">
                  <button className="btn btn-secondary" onClick={() => setDetailId(null)}>Cerrar</button>
                  <button className="btn btn-primary" onClick={openEdit} disabled={isDetailLoading}>
                    <Pencil size={13} /> Editar
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  )
}

// ---- Listas de Precio Section ----
function ListasPrecioSection() {
  const { data, isLoading } = useQuery({ queryKey: ['listas-precio'], queryFn: listListasPrecio })

  return (
    <div className="card">
      <div className="card-header">
        <span className="card-title">Listas de Precio</span>
      </div>
      <div>
        {isLoading
          ? <span className="skeleton-box" style={{ height: 128, display: 'block', margin: 16 }} />
          : (
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Nombre</th>
                    <th>Moneda</th>
                    <th>Compra</th>
                    <th>Venta</th>
                    <th>Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {data?.map((l) => (
                    <tr key={l.name}>
                      <td style={{ fontWeight: 500 }}>{l.name}</td>
                      <td>{l.currency}</td>
                      <td>{l.buying ? 'Sí' : '—'}</td>
                      <td>{l.selling ? 'Sí' : '—'}</td>
                      <td>
                        {l.enabled
                          ? <span className="badge badge-success">Activa</span>
                          : <span className="badge badge-default">Inactiva</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
      </div>
    </div>
  )
}

// ---- NCF Series Section ----
function NcfSection() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['ncf-series'],
    queryFn: getNcfSeries,
    retry: false,
  })

  if (is503(error)) {
    return <ServiceUnavailableBanner message="Las secuencias NCF requieren configuración adicional (dgii-compliance). Contacta al administrador." />
  }
  if (isLoading) return <span className="skeleton-box" style={{ height: 192, display: 'block' }} />

  return (
    <div className="card">
      <div className="card-header">
        <span className="card-title">Secuencias NCF</span>
      </div>
      <div>
        <table className="data-table">
          <thead>
            <tr>
              <th>Tipo NCF</th>
              <th>Prefijo</th>
              <th style={{ textAlign: 'right' }}>Número Actual</th>
              <th>Válido Desde</th>
              <th>Válido Hasta</th>
            </tr>
          </thead>
          <tbody>
            {!data || data.length === 0
              ? (
                  <tr>
                    <td colSpan={5} style={{ textAlign: 'center', color: 'var(--text-tertiary)', padding: '24px 0' }}>
                      No hay secuencias NCF configuradas
                    </td>
                  </tr>
                )
              : data.map((s) => (
                  <tr key={s.ncfType}>
                    <td style={{ fontFamily: 'var(--font-mono)' }}>{s.ncfType}</td>
                    <td style={{ fontFamily: 'var(--font-mono)' }}>{String(s.id)}</td>
                    <td style={{ textAlign: 'right' }}>{s.nextNcf === -1 ? "Agotada" : s.nextNcf}</td>
                    <td>{formatDate(String(s.start))}</td>
                    <td>{formatDate(s.expirationDate)}</td>
                  </tr>
                ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ---- Perfil Section ----

// Campos que el usuario no puede editar directamente desde este formulario.
const PERFIL_DISABLED_FIELDS = new Set(['email', 'fullName', 'timeZone'])
// Campos que no se muestran en absoluto (no aplican a este formulario).
const PERFIL_HIDDEN_FIELDS = new Set(['language'])
// Overrides de label para campos cuyo nombre auto-generado no es el deseado.
const PERFIL_LABEL_OVERRIDES: Record<string, string> = {
  timeZone: 'Zona Horaria',
}

function PerfilSection() {
  const queryClient = useQueryClient()
  const { data, isLoading } = useQuery({ queryKey: ['perfil'], queryFn: getPerfil })
  const { multiTab, toggleMultiTab } = useTabs()

  const [form, setForm] = useState<Record<string, string>>({})

  useEffect(() => {
    if (data && typeof data === 'object') {
      const rest = { ...(data as Record<string, string>) }
      delete rest.roles
      // eslint-disable-next-line react-hooks/set-state-in-effect -- precarga el form al llegar el perfil del backend
      setForm(rest)
    }
  }, [data])

  const saveMutation = useMutation({
    mutationFn: () => updatePerfil({
      firstName: form.firstName,
      lastName: form.lastName,
    }),
    onSuccess: () => { toast.success('Perfil actualizado'); queryClient.invalidateQueries({ queryKey: ['perfil'] }) },
    onError: () => toast.error('Error al actualizar el perfil'),
  })

  // El nombre completo no se edita directamente — se deriva en vivo de Nombre + Apellido.
  function updateNamePart(key: 'firstName' | 'lastName', value: string) {
    setForm((prev) => {
      const next = { ...prev, [key]: value }
      next.fullName = [next.firstName, next.lastName].filter(Boolean).join(' ').trim()
      return next
    })
  }

  if (isLoading) return <span className="skeleton-box" style={{ height: 192, display: 'block' }} />

  return (
    <div className="card">
      <div className="card-header">
        <span className="card-title">Mi Perfil</span>
      </div>
      <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {Object.entries(form)
          .filter(([key]) => !PERFIL_HIDDEN_FIELDS.has(key))
          .map(([key, value]) => {
            const isDisabled = PERFIL_DISABLED_FIELDS.has(key)
            const isNamePart = key === 'firstName' || key === 'lastName'
            return (
              <div key={key} className="ff-wrap">
                <label className="ff-label" style={{ textTransform: 'capitalize' }}>
                  {PERFIL_LABEL_OVERRIDES[key] ?? key.replace(/([A-Z])/g, ' $1').trim()}
                </label>
                <input
                  className="ff-input"
                  value={value ?? ''}
                  disabled={isDisabled}
                  onChange={(e) => (
                    isNamePart
                      ? updateNamePart(key as 'firstName' | 'lastName', e.target.value)
                      : setForm((prev) => ({ ...prev, [key]: e.target.value }))
                  )}
                />
              </div>
            )
          })}
        <div>
          <button className="btn btn-primary" onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
            <Save size={16} />
            {saveMutation.isPending ? 'Guardando…' : 'Guardar Perfil'}
          </button>
        </div>
        <div style={{ borderTop: '1px solid var(--border-default)', margin: '4px 0' }} />
        <label className="ff-check-wrap" style={{ cursor: 'pointer' }} onClick={toggleMultiTab}>
          <input type="checkbox" className="ff-check" checked={multiTab} readOnly />
          <span style={{ fontSize: 13, fontWeight: 500 }}>Multipestañas</span>
          <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
            {multiTab ? 'Activado — navegación por pestañas internas' : 'Desactivado — navegación simple'}
          </span>
        </label>
      </div>
    </div>
  )
}

// ---- Tax Templates Section (shared for ventas/compras) ----
const CHARGE_TYPE_OPTIONS: TaxChargeType[] = [
  'On Net Total',
  'Actual',
  'On Previous Row Amount',
  'On Previous Row Total',
  'On Item Quantity',
]

function emptyTaxLine(): TaxTemplateLine {
  return { chargeType: 'On Net Total', accountHead: '', rate: 18, description: '' }
}

const TAX_CATEGORY_OPTIONS: { value: TaxLineCategory; label: string }[] = [
  { value: 'Total', label: 'Total' },
  { value: 'Valuation', label: 'Costo del artículo' },
  { value: 'Valuation and Total', label: 'Total y costo' },
]

const TAX_ADD_DEDUCT_OPTIONS: { value: TaxLineAddDeduct; label: string }[] = [
  { value: 'Add', label: 'Sumar' },
  { value: 'Deduct', label: 'Restar (retención)' },
]

interface TaxTemplatesSectionProps {
  kind: 'ventas' | 'compras'
}

function TaxTemplatesSection({ kind }: TaxTemplatesSectionProps) {
  const queryClient = useQueryClient()
  const queryKey = kind === 'ventas' ? 'impuestos-ventas' : 'impuestos-compras'
  const listFn = kind === 'ventas' ? listImpuestosVentas : listImpuestosCompras
  const createFn = kind === 'ventas' ? createImpuestoVentas : createImpuestoCompras
  const updateFn = kind === 'ventas' ? updateImpuestoVentas : updateImpuestoCompras
  const deleteFn = kind === 'ventas' ? deleteImpuestoVentas : deleteImpuestoCompras

  const { data, isLoading } = useQuery({ queryKey: [queryKey], queryFn: listFn })

  // ── Form state ────────────────────────────────────────────────────────────
  const [showForm, setShowForm] = useState(false)
  const [editTarget, setEditTarget] = useState<TaxTemplate | null>(null)
  const [toDelete, setToDelete] = useState<TaxTemplate | null>(null)

  const [formTitle, setFormTitle] = useState('')
  const [formDefault, setFormDefault] = useState(false)
  const [formTaxes, setFormTaxes] = useState<TaxTemplateLine[]>([emptyTaxLine()])

  function openCreate() {
    setEditTarget(null)
    setFormTitle('')
    setFormDefault(false)
    setFormTaxes([emptyTaxLine()])
    setShowForm(true)
  }

  function openEdit(t: TaxTemplate) {
    setEditTarget(t)
    setFormTitle(t.title)
    setFormDefault(t.isDefault)
    setFormTaxes(t.taxes.length > 0 ? t.taxes.map((l) => ({ ...l })) : [emptyTaxLine()])
    setShowForm(true)
  }

  function closeForm() {
    setShowForm(false)
    setEditTarget(null)
  }

  function updateTaxLine(idx: number, patch: Partial<TaxTemplateLine>) {
    setFormTaxes((prev) => prev.map((l, i) => i === idx ? { ...l, ...patch } : l))
  }

  const saveMutation = useMutation({
    mutationFn: () => {
      const dto: CreateTaxTemplateDto = {
        title: formTitle,
        isDefault: formDefault,
        taxes: formTaxes,
      }
      return editTarget ? updateFn(editTarget.id, dto) : createFn(dto)
    },
    onSuccess: () => {
      toast.success(editTarget ? 'Plantilla actualizada' : 'Plantilla creada')
      queryClient.invalidateQueries({ queryKey: [queryKey] })
      closeForm()
    },
    onError: () => toast.error('Error al guardar el template'),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteFn(id),
    onSuccess: () => {
      toast.success('Plantilla eliminada')
      queryClient.invalidateQueries({ queryKey: [queryKey] })
      setToDelete(null)
    },
    onError: () => toast.error('Error al eliminar el template'),
  })

  const label = kind === 'ventas' ? 'Ventas' : 'Compras'
  const sectionDescription = kind === 'ventas'
    ? 'Impuesto aplicado al TOTAL de cotizaciones y facturas de venta completas (ej. ITBIS 18% sobre el monto total del documento). No confundir con el impuesto por artículo, que se configura en "Impuestos por Artículo".'
    : 'Impuesto aplicado al TOTAL de compras completas. Incluye campos adicionales para retenciones (ej. ITBIS/ISR retenido al proveedor, que se RESTA del monto a pagar) y afectación al costo del inventario (landed cost). No confundir con el impuesto por artículo, que se configura en "Impuestos por Artículo".'

  return (
    <>
      <div className="card">
        <div className="card-header">
          <span className="card-title">Plantillas de Impuesto — {label}</span>
          <button className="btn btn-primary btn-size-sm" onClick={openCreate}>
            <Plus size={14} /> Nuevo
          </button>
        </div>
        <div className="card-body" style={{ paddingTop: 0, paddingBottom: 12 }}>
          <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: 0 }}>{sectionDescription}</p>
        </div>
        <div>
          {isLoading
            ? <span className="skeleton-box" style={{ height: 128, display: 'block', margin: 16 }} />
            : !data || data.length === 0
              ? (
                  <div className="card-body">
                    <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                      No hay templates configurados. Crea uno con el botón <strong>Nuevo</strong>.
                    </p>
                  </div>
                )
              : (
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Título</th>
                        <th>Líneas</th>
                        <th>Por defecto</th>
                        <th style={{ width: 80 }} />
                      </tr>
                    </thead>
                    <tbody>
                      {data.map((t) => (
                        <tr key={t.id}>
                          <td style={{ fontWeight: 500 }}>{t.title}</td>
                          <td className="td-muted">
                            {t.taxes.map((l, i) => (
                              <span key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, padding: '2px 0' }}>
                                {l.description || l.chargeType} — {l.rate}%
                                {kind === 'compras' && l.category && (
                                  <span className="badge badge-neutral" style={{ fontSize: 10 }}>{TAX_CATEGORY_OPTIONS.find((o) => o.value === l.category)?.label ?? l.category}</span>
                                )}
                                {kind === 'compras' && l.addDeductTax === 'Deduct' && (
                                  <span className="badge badge-warning" style={{ fontSize: 10 }}>Retención</span>
                                )}
                              </span>
                            ))}
                          </td>
                          <td>
                            {t.isDefault
                              ? <span className="badge badge-success">Sí</span>
                              : <span className="badge badge-neutral">No</span>}
                          </td>
                          <td>
                            <div style={{ display: 'flex', gap: 4 }}>
                              <button className="btn btn-ghost btn-size-icon-sm" onClick={() => openEdit(t)}>
                                <Pencil size={13} />
                              </button>
                              <button
                                className="btn btn-ghost btn-size-icon-sm"
                                style={{ color: 'var(--icon-muted)' }}
                                onClick={() => setToDelete(t)}
                              >
                                <Trash2 size={14} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
        </div>
      </div>

      {/* Create / Edit modal */}
      {showForm && (
        <div className="modal-overlay" onClick={closeForm}>
          <div className="modal-box" style={{ maxWidth: 680 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <h2 className="modal-title">{editTarget ? 'Editar Plantilla' : 'Nueva Plantilla'} — {label}</h2>
              <button className="modal-close" onClick={closeForm}><X size={16} /></button>
            </div>
            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div style={{ display: 'flex', gap: 16 }}>
                <div className="ff-wrap" style={{ flex: 1 }}>
                  <label className="ff-label ff-required">Título</label>
                  <input
                    className="ff-input"
                    value={formTitle}
                    onChange={(e) => setFormTitle(e.target.value)}
                    placeholder="ITBIS 18%"
                  />
                </div>
                <div className="ff-wrap" style={{ alignSelf: 'center', paddingTop: 20 }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={formDefault}
                      onChange={(e) => setFormDefault(e.target.checked)}
                      style={{ width: 16, height: 16 }}
                    />
                    Plantilla por defecto
                  </label>
                </div>
              </div>

              {/* Tax lines table */}
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <label className="ff-label" style={{ marginBottom: 0 }}>Líneas de impuesto</label>
                  <button
                    type="button"
                    className="btn btn-secondary btn-size-sm"
                    onClick={() => setFormTaxes((prev) => [...prev, emptyTaxLine()])}
                  >
                    <Plus size={14} /> Agregar línea
                  </button>
                </div>
                <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', overflow: 'hidden' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                    <thead>
                      <tr style={{ background: 'var(--surface-sunken)' }}>
                        <th style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 500, color: 'var(--text-secondary)', fontSize: 11 }}>Tipo de cargo</th>
                        <th style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 500, color: 'var(--text-secondary)', fontSize: 11 }}>Cuenta GL</th>
                        <th style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 500, color: 'var(--text-secondary)', fontSize: 11, width: 80 }}>Tasa %</th>
                        <th style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 500, color: 'var(--text-secondary)', fontSize: 11 }}>Descripción *</th>
                        {kind === 'compras' && (
                          <>
                            <th style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 500, color: 'var(--text-secondary)', fontSize: 11 }}>Afecta</th>
                            <th style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 500, color: 'var(--text-secondary)', fontSize: 11 }}>Tipo</th>
                          </>
                        )}
                        <th style={{ width: 36 }} />
                      </tr>
                    </thead>
                    <tbody>
                      {formTaxes.map((line, idx) => (
                        <tr key={idx} style={{ borderTop: '1px solid var(--border)' }}>
                          <td style={{ padding: '6px 8px' }}>
                            <select
                              className="ff-select"
                              style={{ fontSize: 12, padding: '4px 8px' }}
                              value={line.chargeType}
                              onChange={(e) => updateTaxLine(idx, { chargeType: e.target.value as TaxChargeType })}
                            >
                              {CHARGE_TYPE_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
                            </select>
                          </td>
                          <td style={{ padding: '6px 8px', minWidth: 220 }}>
                            <AccountSelect
                              value={line.accountHead}
                              onChange={(id) => updateTaxLine(idx, { accountHead: id })}
                              placeholder="Buscar cuenta GL…"
                              ledgerOnly
                            />
                          </td>
                          <td style={{ padding: '6px 8px' }}>
                            <input
                              className="ff-input"
                              type="number"
                              min="0"
                              step="0.01"
                              style={{ fontSize: 12, padding: '4px 8px', textAlign: 'right' }}
                              value={line.rate}
                              onChange={(e) => updateTaxLine(idx, { rate: parseFloat(e.target.value) || 0 })}
                            />
                          </td>
                          <td style={{ padding: '6px 8px' }}>
                            <input
                              className="ff-input"
                              style={{ fontSize: 12, padding: '4px 8px' }}
                              placeholder="Ej: ITBIS 18%"
                              value={line.description ?? ''}
                              onChange={(e) => updateTaxLine(idx, { description: e.target.value })}
                            />
                          </td>
                          {kind === 'compras' && (
                            <>
                              <td style={{ padding: '6px 8px' }}>
                                <select
                                  className="ff-select"
                                  style={{ fontSize: 12, padding: '4px 8px' }}
                                  value={line.category ?? ''}
                                  onChange={(e) => updateTaxLine(idx, { category: (e.target.value || undefined) as TaxLineCategory | undefined })}
                                >
                                  <option value="">—</option>
                                  {TAX_CATEGORY_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                                </select>
                              </td>
                              <td style={{ padding: '6px 8px' }}>
                                <select
                                  className="ff-select"
                                  style={{ fontSize: 12, padding: '4px 8px' }}
                                  value={line.addDeductTax ?? ''}
                                  onChange={(e) => updateTaxLine(idx, { addDeductTax: (e.target.value || undefined) as TaxLineAddDeduct | undefined })}
                                >
                                  <option value="">—</option>
                                  {TAX_ADD_DEDUCT_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                                </select>
                              </td>
                            </>
                          )}
                          <td style={{ padding: '4px 6px', textAlign: 'center' }}>
                            <button
                              type="button"
                              className="btn btn-ghost btn-size-icon-sm"
                              style={{ color: 'var(--icon-muted)' }}
                              onClick={() => setFormTaxes((prev) => prev.filter((_, i) => i !== idx))}
                              disabled={formTaxes.length === 1}
                            >
                              <Trash2 size={13} />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
            <div className="modal-foot">
              <button className="btn btn-secondary" onClick={closeForm}>Cancelar</button>
              <button
                className="btn btn-primary"
                onClick={() => saveMutation.mutate()}
                disabled={!formTitle || formTaxes.some((l) => !l.accountHead || !l.description?.trim()) || saveMutation.isPending}
              >
                {saveMutation.isPending ? 'Guardando…' : 'Guardar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirm */}
      {toDelete && (
        <div className="modal-overlay" onClick={() => setToDelete(null)}>
          <div className="modal-box modal-box-sm" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <h2 className="modal-title">¿Eliminar template?</h2>
              <button className="modal-close" onClick={() => setToDelete(null)}><X size={16} /></button>
            </div>
            <div className="modal-body">
              <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                Se eliminará <strong>{toDelete.title}</strong>. Esta acción no se puede deshacer.
              </p>
            </div>
            <div className="modal-foot">
              <button className="btn btn-secondary" onClick={() => setToDelete(null)}>Cancelar</button>
              <button
                className="btn btn-danger"
                onClick={() => deleteMutation.mutate(toDelete.id)}
                disabled={deleteMutation.isPending}
              >
                Eliminar
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

// ---- Item Tax Templates Section (impuesto por artículo — distinto del de documento) ----
function emptyItemTaxLine(): ItemTaxLine {
  return { taxType: '', rate: 18, notApplicable: false }
}

function ItemTaxTemplatesSection() {
  const queryClient = useQueryClient()
  const { data, isLoading } = useQuery({ queryKey: ['item-tax-templates'], queryFn: listItemTaxTemplates })

  const [showForm, setShowForm] = useState(false)
  const [editTarget, setEditTarget] = useState<ItemTaxTemplate | null>(null)
  const [toDelete, setToDelete] = useState<ItemTaxTemplate | null>(null)

  const [formTitle, setFormTitle] = useState('')
  const [formTaxes, setFormTaxes] = useState<ItemTaxLine[]>([emptyItemTaxLine()])

  function openCreate() {
    setEditTarget(null)
    setFormTitle('')
    setFormTaxes([emptyItemTaxLine()])
    setShowForm(true)
  }

  function openEdit(t: ItemTaxTemplate) {
    setEditTarget(t)
    setFormTitle(t.title)
    setFormTaxes(t.taxes.length > 0 ? t.taxes.map((l) => ({ ...l })) : [emptyItemTaxLine()])
    setShowForm(true)
  }

  function closeForm() {
    setShowForm(false)
    setEditTarget(null)
  }

  function updateTaxLine(idx: number, patch: Partial<ItemTaxLine>) {
    setFormTaxes((prev) => prev.map((l, i) => i === idx ? { ...l, ...patch } : l))
  }

  const saveMutation = useMutation({
    mutationFn: () => {
      const dto: CreateItemTaxTemplateDto = { title: formTitle, taxes: formTaxes }
      return editTarget ? updateItemTaxTemplate(editTarget.id, dto) : createItemTaxTemplate(dto)
    },
    onSuccess: () => {
      toast.success(editTarget ? 'Plantilla actualizada' : 'Plantilla creada')
      queryClient.invalidateQueries({ queryKey: ['item-tax-templates'] })
      closeForm()
    },
    onError: () => toast.error('Error al guardar el template'),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteItemTaxTemplate(id),
    onSuccess: () => {
      toast.success('Plantilla eliminada')
      queryClient.invalidateQueries({ queryKey: ['item-tax-templates'] })
      setToDelete(null)
    },
    onError: () => toast.error('Error al eliminar el template'),
  })

  return (
    <>
      <div className="card">
        <div className="card-header">
          <span className="card-title">Impuestos por Artículo</span>
          <button className="btn btn-primary btn-size-sm" onClick={openCreate}>
            <Plus size={14} /> Nuevo
          </button>
        </div>
        <div className="card-body" style={{ paddingTop: 0, paddingBottom: 12 }}>
          <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: 0 }}>
            Impuesto asociado a un artículo específico — se usa para excepciones donde un artículo individual
            tiene una tasa distinta al general (ej. exento de ITBIS). Se asigna por artículo en "Impuesto de
            Compra"/"Impuesto de Venta" dentro del formulario de cada artículo, NO aquí.
          </p>
        </div>
        <div>
          {isLoading
            ? <span className="skeleton-box" style={{ height: 128, display: 'block', margin: 16 }} />
            : !data || data.length === 0
              ? (
                  <div className="card-body">
                    <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                      No hay templates configurados. Crea uno con el botón <strong>Nuevo</strong>.
                    </p>
                  </div>
                )
              : (
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Título</th>
                        <th>Tasas</th>
                        <th style={{ width: 80 }} />
                      </tr>
                    </thead>
                    <tbody>
                      {data.map((t) => (
                        <tr key={t.id}>
                          <td style={{ fontWeight: 500 }}>{t.title}</td>
                          <td className="td-muted">
                            {t.taxes.map((l, i) => (
                              <span key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, padding: '2px 0' }}>
                                {l.taxType} — {l.notApplicable ? 'Exento' : `${l.rate}%`}
                              </span>
                            ))}
                          </td>
                          <td>
                            <div style={{ display: 'flex', gap: 4 }}>
                              <button className="btn btn-ghost btn-size-icon-sm" onClick={() => openEdit(t)}>
                                <Pencil size={13} />
                              </button>
                              <button
                                className="btn btn-ghost btn-size-icon-sm"
                                style={{ color: 'var(--icon-muted)' }}
                                onClick={() => setToDelete(t)}
                              >
                                <Trash2 size={14} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
        </div>
      </div>

      {/* Create / Edit modal */}
      {showForm && (
        <div className="modal-overlay" onClick={closeForm}>
          <div className="modal-box" style={{ maxWidth: 640 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <h2 className="modal-title">{editTarget ? 'Editar Plantilla' : 'Nueva Plantilla'} — Impuesto por Artículo</h2>
              <button className="modal-close" onClick={closeForm}><X size={16} /></button>
            </div>
            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div className="ff-wrap">
                <label className="ff-label ff-required">Título</label>
                <input
                  className="ff-input"
                  value={formTitle}
                  onChange={(e) => setFormTitle(e.target.value)}
                  placeholder="ITBIS 18% Artículo"
                />
              </div>

              {/* Tax lines table */}
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <label className="ff-label" style={{ marginBottom: 0 }}>Tasas</label>
                  <button
                    type="button"
                    className="btn btn-secondary btn-size-sm"
                    onClick={() => setFormTaxes((prev) => [...prev, emptyItemTaxLine()])}
                  >
                    <Plus size={14} /> Agregar tasa
                  </button>
                </div>
                <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', overflow: 'hidden' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                    <thead>
                      <tr style={{ background: 'var(--surface-sunken)' }}>
                        <th style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 500, color: 'var(--text-secondary)', fontSize: 11 }}>Cuenta GL</th>
                        <th style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 500, color: 'var(--text-secondary)', fontSize: 11, width: 80 }}>Tasa %</th>
                        <th style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 500, color: 'var(--text-secondary)', fontSize: 11 }}>Exento</th>
                        <th style={{ width: 36 }} />
                      </tr>
                    </thead>
                    <tbody>
                      {formTaxes.map((line, idx) => (
                        <tr key={idx} style={{ borderTop: '1px solid var(--border)' }}>
                          <td style={{ padding: '6px 8px', minWidth: 220 }}>
                            <AccountSelect
                              value={line.taxType}
                              onChange={(id) => updateTaxLine(idx, { taxType: id })}
                              placeholder="Buscar cuenta GL…"
                              ledgerOnly
                            />
                          </td>
                          <td style={{ padding: '6px 8px' }}>
                            <input
                              className="ff-input"
                              type="number"
                              min="0"
                              step="0.01"
                              style={{ fontSize: 12, padding: '4px 8px', textAlign: 'right' }}
                              value={line.rate}
                              onChange={(e) => updateTaxLine(idx, { rate: parseFloat(e.target.value) || 0 })}
                              disabled={line.notApplicable}
                            />
                          </td>
                          <td style={{ padding: '6px 8px', textAlign: 'center' }}>
                            <input
                              type="checkbox"
                              checked={!!line.notApplicable}
                              onChange={(e) => updateTaxLine(idx, { notApplicable: e.target.checked })}
                              style={{ width: 16, height: 16 }}
                              title="Exento — el artículo queda excluido de este impuesto"
                            />
                          </td>
                          <td style={{ padding: '4px 6px', textAlign: 'center' }}>
                            <button
                              type="button"
                              className="btn btn-ghost btn-size-icon-sm"
                              style={{ color: 'var(--icon-muted)' }}
                              onClick={() => setFormTaxes((prev) => prev.filter((_, i) => i !== idx))}
                              disabled={formTaxes.length === 1}
                            >
                              <Trash2 size={13} />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
            <div className="modal-foot">
              <button className="btn btn-secondary" onClick={closeForm}>Cancelar</button>
              <button
                className="btn btn-primary"
                onClick={() => saveMutation.mutate()}
                disabled={!formTitle || formTaxes.some((l) => !l.taxType) || saveMutation.isPending}
              >
                {saveMutation.isPending ? 'Guardando…' : 'Guardar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirm */}
      {toDelete && (
        <div className="modal-overlay" onClick={() => setToDelete(null)}>
          <div className="modal-box modal-box-sm" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <h2 className="modal-title">¿Eliminar template?</h2>
              <button className="modal-close" onClick={() => setToDelete(null)}><X size={16} /></button>
            </div>
            <div className="modal-body">
              <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                Se eliminará <strong>{toDelete.title}</strong>. Esta acción no se puede deshacer.
              </p>
            </div>
            <div className="modal-foot">
              <button className="btn btn-secondary" onClick={() => setToDelete(null)}>Cancelar</button>
              <button
                className="btn btn-danger"
                onClick={() => deleteMutation.mutate(toDelete.id)}
                disabled={deleteMutation.isPending}
              >
                Eliminar
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

// ---- Grupos de Clientes ----
const PRICE_TIER_OPTIONS = [
  { value: '', label: 'Sin nivel' },
  { value: 'A', label: 'A — Minorista' },
  { value: 'B', label: 'B — Medio mayoreo' },
  { value: 'C', label: 'C — Mayorista' },
]

function GruposClientesSection() {
  const queryClient = useQueryClient()
  const { data: grupos, isLoading } = useQuery({ queryKey: ['customer-groups'], queryFn: listCustomerGroups })
  const [showForm, setShowForm] = useState(false)
  const [formName, setFormName] = useState('')
  const [formPriceTier, setFormPriceTier] = useState<string>('')
  const [toDelete, setToDelete] = useState<GrupoCliente | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  const createMutation = useMutation({
    mutationFn: () => createCustomerGroup({ name: formName, priceTier: formPriceTier as 'A' | 'B' | 'C' | undefined, parentGroup: 'All Customer Groups' }),
    onSuccess: () => {
      toast.success('Grupo creado')
      queryClient.invalidateQueries({ queryKey: ['customer-groups'] })
      setShowForm(false)
      setFormName('')
      setFormPriceTier('')
    },
    onError: () => toast.error('Error al crear el grupo'),
  })

  const deleteMutation = useMutation({
    mutationFn: () => deleteCustomerGroup(toDelete!.name),
    onSuccess: () => {
      toast.success('Grupo eliminado')
      queryClient.invalidateQueries({ queryKey: ['customer-groups'] })
      setToDelete(null)
      setDeleteError(null)
    },
    onError: (err: { response?: { status?: number; data?: { message?: string } } }) => {
      if (err.response?.status === 409) {
        setDeleteError(err.response.data?.message ?? 'No se puede eliminar el grupo porque tiene clientes asignados.')
      } else {
        toast.error('Error al eliminar el grupo')
        setToDelete(null)
      }
    },
  })

  return (
    <>
      <div className="card">
        <div className="card-header">
          <span className="card-title">Grupos de Clientes</span>
          <button className="btn btn-primary btn-size-sm" onClick={() => { setShowForm(true); setToDelete(null) }}>
            <Plus size={14} /> Nuevo
          </button>
        </div>
        <div>
          {isLoading
            ? <span className="skeleton-box" style={{ height: 128, display: 'block', margin: 16 }} />
            : (
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Nombre</th>
                      <th>Nivel de precio</th>
                      <th style={{ width: 80 }} />
                    </tr>
                  </thead>
                  <tbody>
                    {!grupos?.length ? (
                      <tr>
                        <td colSpan={3} style={{ textAlign: 'center', padding: '32px 0', color: 'var(--text-tertiary)' }}>
                          No hay grupos de clientes.
                        </td>
                      </tr>
                    ) : grupos.map((g) => (
                      <tr key={g.name}>
                        <td style={{ fontWeight: 500 }}>{g.name}</td>
                        <td>
                          <span className="badge" style={{ background: g.priceTier ? 'var(--accent-bg)' : 'var(--surface-sunken)', color: g.priceTier ? 'var(--accent)' : 'var(--text-tertiary)' }}>
                            {g.priceTier ? `Nivel ${g.priceTier}` : 'Sin nivel'}
                          </span>
                        </td>
                        <td>
                          <button
                            className="btn btn-ghost btn-size-icon-sm"
                            style={{ color: 'var(--icon-muted)' }}
                            onClick={() => { setToDelete(g); setDeleteError(null); setShowForm(false) }}
                          >
                            <Trash2 size={14} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
        </div>
      </div>

      {/* Create modal */}
      {showForm && (
        <div className="modal-overlay" onClick={() => setShowForm(false)}>
          <div className="modal-box modal-box-sm" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <h2 className="modal-title">Nuevo Grupo</h2>
              <button className="modal-close" onClick={() => setShowForm(false)}><X size={16} /></button>
            </div>
            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div className="ff-wrap">
                <label className="ff-label ff-required">Nombre</label>
                <input className="ff-input" value={formName} onChange={(e) => setFormName(e.target.value)} placeholder="Ej: Mayoristas" />
              </div>
              <div className="ff-wrap">
                <label className="ff-label">Nivel de precio por defecto</label>
                <select className="ff-select" value={formPriceTier} onChange={(e) => setFormPriceTier(e.target.value)}>
                  {PRICE_TIER_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
                <p style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 4 }}>
                  Los clientes de este grupo usarán este nivel de precio al crear cotizaciones/facturas.
                </p>
              </div>
            </div>
            <div className="modal-foot">
              <button className="btn btn-secondary" onClick={() => setShowForm(false)}>Cancelar</button>
              <button
                className="btn btn-primary"
                onClick={() => createMutation.mutate()}
                disabled={!formName || createMutation.isPending}
              >
                {createMutation.isPending ? 'Guardando…' : 'Guardar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirm */}
      {toDelete && (
        <div className="modal-overlay" onClick={() => { setToDelete(null); setDeleteError(null) }}>
          <div className="modal-box modal-box-sm" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <h2 className="modal-title">¿Eliminar grupo?</h2>
              <button className="modal-close" onClick={() => { setToDelete(null); setDeleteError(null) }}><X size={16} /></button>
            </div>
            <div className="modal-body">
              {deleteError ? (
                <div className="inline-alert inline-alert-danger" style={{ marginBottom: 12 }}>
                  <FileWarning size={14} />
                  {deleteError}
                </div>
              ) : (
                <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                  Se eliminará <strong>{toDelete.name}</strong>. Esta acción no se puede deshacer.
                </p>
              )}
            </div>
            <div className="modal-foot">
              <button className="btn btn-secondary" onClick={() => { setToDelete(null); setDeleteError(null) }}>Cancelar</button>
              {!deleteError ? (
                <button className="btn btn-danger" onClick={() => deleteMutation.mutate()} disabled={deleteMutation.isPending}>
                  {deleteMutation.isPending ? 'Eliminando…' : 'Eliminar'}
                </button>
              ) : (
                <button className="btn btn-primary" onClick={() => { setDeleteError(null); setToDelete(null) }}>Entendido</button>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  )
}

// ---- Facturación Config Section ----
function FacturacionConfigSection() {
  const queryClient = useQueryClient()
  const { data, isLoading } = useQuery({ queryKey: ['facturacion-config'], queryFn: getFacturacionConfig })
  const { data: roles } = useQuery({ queryKey: ['roles'], queryFn: listRoles, staleTime: 5 * 60_000 })
  const { data: almacenes } = useQuery({ queryKey: ['almacenes-all'], queryFn: () => listAlmacenes(), staleTime: 5 * 60_000 })
  const [selectedRoles, setSelectedRoles] = useState<string[]>([])
  const [flujoCobro, setFlujoCobro] = useState<'directo' | 'caja'>('directo')
  const [requiereUbicacionVenta, setRequiereUbicacionVenta] = useState(false)
  const [showPosActivar, setShowPosActivar] = useState(false)
  const [posWarehouse, setPosWarehouse] = useState('')

  useEffect(() => {
    if (data) {
      setSelectedRoles(data.rolesCancelacionFactura ?? [])
      setFlujoCobro(data.flujoCobro ?? 'directo')
      setRequiereUbicacionVenta(data.requiereUbicacionVenta ?? false)
    }
  }, [data])

  const saveMutation = useMutation({
    mutationFn: (dto: Partial<FacturacionConfig>) => updateFacturacionConfig(dto),
    onSuccess: () => {
      toast.success('Configuración de facturación actualizada')
      queryClient.invalidateQueries({ queryKey: ['facturacion-config'] })
    },
    onError: () => toast.error('Error al guardar'),
  })

  const habilitarPosMutation = useMutation({
    mutationFn: () => habilitarPos({ warehouse: posWarehouse }),
    onSuccess: () => {
      toast.success('Módulo POS activado correctamente')
      setShowPosActivar(false)
      setPosWarehouse('')
      queryClient.invalidateQueries({ queryKey: ['facturacion-config'] })
    },
    onError: (err: ApiError) => {
      toast.error(err?.message ?? 'Error al activar el módulo POS')
    },
  })

  if (isLoading) return <span className="skeleton-box" style={{ height: 200, display: 'block' }} />

  function toggleRole(name: string) {
    setSelectedRoles((prev) => (prev.includes(name) ? prev.filter((r) => r !== name) : [...prev, name]))
  }

  return (
    <div className="card">
      <div className="card-header">
        <span className="card-title">Configuración de Facturación</span>
      </div>
      <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        <div className="ff-wrap">
          <label className="ff-label">Flujo de cobro al someter</label>
          <p className="ff-hint" style={{ marginBottom: 8 }}>
            "Directo": se cobra con un solo método de pago, sin vuelto (comportamiento histórico). "Caja": habilita
            cobrar con múltiples métodos de pago simultáneos y el registro opcional de vuelto.
          </p>
          <select
            className="ff-select"
            style={{ maxWidth: 240 }}
            value={flujoCobro}
            onChange={(e) => setFlujoCobro(e.target.value as 'directo' | 'caja')}
          >
            <option value="directo">Directo</option>
            <option value="caja">Caja</option>
          </select>
        </div>
        <div className="ff-wrap">
          <label className="ff-label">Roles autorizados para cancelar facturas sometidas</label>
          <p className="ff-hint" style={{ marginBottom: 8 }}>
            Solo usuarios con alguno de estos roles de ERPNext pueden cancelar una factura ya sometida (con NCF asignado).
          </p>
          <div style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: 8,
            maxHeight: 200,
            overflowY: 'auto',
            border: '1px solid var(--border-default)',
            borderRadius: 'var(--radius-md)',
            padding: 12,
          }}>
            {(roles ?? []).length === 0 ? (
              <p style={{ fontSize: 13, color: 'var(--text-tertiary)', gridColumn: '1 / -1' }}>
                No hay roles disponibles.
              </p>
            ) : (
              (roles ?? []).map((role) => (
                <label key={role} className="ff-check-wrap">
                  <input
                    type="checkbox"
                    className="ff-check"
                    checked={selectedRoles.includes(role)}
                    onChange={() => toggleRole(role)}
                  />
                  <span style={{ fontSize: 13 }}>{role}</span>
                </label>
              ))
            )}
          </div>
        </div>
        <div className="ff-wrap">
          <label className="ff-check-wrap">
            <input
              type="checkbox"
              className="ff-check"
              checked={requiereUbicacionVenta}
              onChange={(e) => setRequiereUbicacionVenta(e.target.checked)}
            />
            <span style={{ fontSize: 13 }}>Requiere Ubicación para Vender</span>
          </label>
          <p className="ff-hint" style={{ marginTop: 4 }}>
            Si está activo, no se podrá vender un artículo de inventario si no tiene una Ubicación asignada dentro
            del almacén desde el cual se factura.
          </p>
        </div>

        <div className="ff-wrap" style={{ borderTop: '1px solid var(--border-default)', paddingTop: 16 }}>
          <label className="ff-label">Módulo POS</label>
          <p className="ff-hint" style={{ marginBottom: 8 }}>
            Permite abrir turnos de caja y cobrar ventas al contado con pago parcial sin crear un Payment Entry
            aparte. Es opcional — si no se activa, todo sigue funcionando igual que hoy.
          </p>

          {data?.usaModuloPos ? (
            <div className="inline-alert inline-alert-success" style={{ alignItems: 'flex-start' }}>
              <span>
                Módulo POS activo.
                {data.posProfileDefault && (
                  <>
                    {' '}Perfil: <strong>{data.posProfileDefault}</strong>
                  </>
                )}
              </span>
            </div>
          ) : !showPosActivar ? (
            <button className="btn btn-secondary btn-size-sm" onClick={() => setShowPosActivar(true)}>
              Activar módulo POS
            </button>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxWidth: 320 }}>
              <div className="ff-wrap">
                <label className="ff-label">Almacén por defecto para el POS</label>
                <select
                  className="ff-select"
                  value={posWarehouse}
                  onChange={(e) => setPosWarehouse(e.target.value)}
                >
                  <option value="">Seleccionar almacén</option>
                  {(almacenes ?? []).filter((a) => !a.disabled).map((a) => (
                    <option key={a.id} value={a.id}>{a.name}</option>
                  ))}
                </select>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  className="btn btn-secondary btn-size-sm"
                  onClick={() => { setShowPosActivar(false); setPosWarehouse('') }}
                  disabled={habilitarPosMutation.isPending}
                >
                  Cancelar
                </button>
                <button
                  className="btn btn-primary btn-size-sm"
                  onClick={() => habilitarPosMutation.mutate()}
                  disabled={!posWarehouse || habilitarPosMutation.isPending}
                >
                  {habilitarPosMutation.isPending ? 'Activando…' : 'Confirmar activación'}
                </button>
              </div>
            </div>
          )}
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button
            className="btn btn-primary btn-size-sm"
            onClick={() => saveMutation.mutate({ rolesCancelacionFactura: selectedRoles, flujoCobro, requiereUbicacionVenta })}
            disabled={saveMutation.isPending}
          >
            <Save size={14} /> Guardar
          </button>
        </div>
      </div>
    </div>
  )
}

// ---- Denominaciones Section ----
function DenominacionesSection() {
  const queryClient = useQueryClient()
  const [showNew, setShowNew] = useState(false)
  const [newDenominacion, setNewDenominacion] = useState('')
  const [newValor, setNewValor] = useState(0)
  const [newActivo, setNewActivo] = useState(true)
  const [editTarget, setEditTarget] = useState<Denominacion | null>(null)
  const [editValor, setEditValor] = useState(0)
  const [editActivo, setEditActivo] = useState(true)

  const { data, isLoading } = useQuery({ queryKey: ['denominaciones'], queryFn: listDenominaciones })

  const createMutation = useMutation({
    mutationFn: () => createDenominacion({ denominacion: newDenominacion, valor: newValor, activo: newActivo }),
    onSuccess: () => {
      toast.success('Denominación creada')
      queryClient.invalidateQueries({ queryKey: ['denominaciones'] })
      setShowNew(false)
      setNewDenominacion('')
      setNewValor(0)
      setNewActivo(true)
    },
    onError: () => toast.error('Error al crear la denominación'),
  })

  const updateMutation = useMutation({
    mutationFn: () => updateDenominacion(editTarget!.id, { valor: editValor, activo: editActivo }),
    onSuccess: () => {
      toast.success('Denominación actualizada')
      queryClient.invalidateQueries({ queryKey: ['denominaciones'] })
      setEditTarget(null)
    },
    onError: () => toast.error('Error al actualizar la denominación'),
  })

  function openEdit(d: Denominacion) {
    setEditTarget(d)
    setEditValor(d.valor)
    setEditActivo(d.activo)
    setShowNew(false)
  }

  return (
    <>
      <div className="card">
        <div className="card-header">
          <span className="card-title">Denominaciones</span>
          <button className="btn btn-primary btn-size-sm" onClick={() => setShowNew(true)}>
            <Plus size={14} />Nueva
          </button>
        </div>
        <div>
          {isLoading
            ? <span className="skeleton-box" style={{ height: 128, display: 'block', margin: 16 }} />
            : (
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Denominación</th>
                      <th>Valor</th>
                      <th>Estado</th>
                      <th style={{ width: 48 }} />
                    </tr>
                  </thead>
                  <tbody>
                    {data?.map((d) => (
                      <tr key={d.id}>
                        <td style={{ fontWeight: 500 }}>{d.denominacion}</td>
                        <td className="td-muted">{d.valor}</td>
                        <td>
                          {d.activo
                            ? <span className="badge badge-success">Activo</span>
                            : <span className="badge badge-error">Inactivo</span>}
                        </td>
                        <td>
                          <button className="btn btn-ghost btn-size-icon-sm" onClick={() => openEdit(d)}>
                            <Pencil size={13} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
        </div>
      </div>

      {showNew && (
        <div className="modal-overlay" onClick={() => setShowNew(false)}>
          <div className="modal-box modal-box-sm" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <h2 className="modal-title">Nueva Denominación</h2>
              <button className="modal-close" onClick={() => setShowNew(false)}><X size={16} /></button>
            </div>
            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div className="ff-wrap">
                <label className="ff-label">Nombre</label>
                <input className="ff-input" value={newDenominacion} onChange={(e) => setNewDenominacion(e.target.value)} placeholder="RD$2000" />
              </div>
              <div className="ff-wrap">
                <label className="ff-label">Valor</label>
                <input className="ff-input" type="number" min="0" step="0.01" value={newValor} onChange={(e) => setNewValor(Number(e.target.value) || 0)} />
              </div>
              <label className="ff-check-wrap">
                <input type="checkbox" className="ff-check" checked={newActivo} onChange={(e) => setNewActivo(e.target.checked)} />
                <span style={{ fontSize: 13 }}>Activo</span>
              </label>
            </div>
            <div className="modal-foot">
              <button className="btn btn-secondary" onClick={() => setShowNew(false)}>Cancelar</button>
              <button
                className="btn btn-primary"
                onClick={() => createMutation.mutate()}
                disabled={!newDenominacion || newValor <= 0 || createMutation.isPending}
              >
                {createMutation.isPending ? 'Creando…' : 'Crear'}
              </button>
            </div>
          </div>
        </div>
      )}

      {editTarget && (
        <div className="modal-overlay" onClick={() => setEditTarget(null)}>
          <div className="modal-box modal-box-sm" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <h2 className="modal-title">Editar Denominación</h2>
              <button className="modal-close" onClick={() => setEditTarget(null)}><X size={16} /></button>
            </div>
            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div className="ff-wrap">
                <label className="ff-label">Valor</label>
                <input className="ff-input" type="number" min="0" step="0.01" value={editValor} onChange={(e) => setEditValor(Number(e.target.value) || 0)} />
              </div>
              <label className="ff-check-wrap">
                <input type="checkbox" className="ff-check" checked={editActivo} onChange={(e) => setEditActivo(e.target.checked)} />
                <span style={{ fontSize: 13 }}>Activo</span>
              </label>
            </div>
            <div className="modal-foot">
              <button className="btn btn-secondary" onClick={() => setEditTarget(null)}>Cancelar</button>
              <button className="btn btn-primary" onClick={() => updateMutation.mutate()} disabled={updateMutation.isPending}>
                {updateMutation.isPending ? 'Guardando…' : 'Guardar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

// ---- Main ConfigPage ----
const SECTION_TITLES: Record<string, string> = {
  cobros: 'Configuración de Cobranza',
  almacenes: 'Almacenes',
  'metodos-pago': 'Métodos de Pago',
  uom: 'Unidades de Medida',
  'listas-precio': 'Listas de Precio',
  ncf: 'Secuencias NCF',
  'impuestos-ventas': 'Impuestos — Ventas',
  'impuestos-compras': 'Impuestos — Compras',
  'impuestos-articulo': 'Impuestos por Artículo',
  'ejercicio-fiscal': 'Ejercicio Fiscal',
  perfil: 'Mi Perfil',
  'grupos-clientes': 'Grupos de Clientes',
  facturacion: 'Configuración de Facturación',
  denominaciones: 'Denominaciones',
}

export default function ConfigPage() {
  const { seccion = 'cobros' } = useParams<{ seccion?: string }>()
  const title = SECTION_TITLES[seccion] ?? 'Configuración'

  const sectionMap: Record<string, React.ReactNode> = {
    cobros: <CobrosConfigSection />,
    almacenes: <AlmacenesSection />,
    'metodos-pago': <MetodosPagoSection />,
    uom: <UomSection />,
    'listas-precio': <ListasPrecioSection />,
    ncf: <NcfSection />,
    'impuestos-ventas': <TaxTemplatesSection kind="ventas" />,
    'impuestos-compras': <TaxTemplatesSection kind="compras" />,
    'impuestos-articulo': <ItemTaxTemplatesSection />,
    'ejercicio-fiscal': <EjercicioFiscalSection />,
    perfil: <PerfilSection />,
    'grupos-clientes': <GruposClientesSection />,
    facturacion: <FacturacionConfigSection />,
    denominaciones: <DenominacionesSection />,
  }

  return (
    <div className="page-container">
      <PageHeader title={title} />
      <div style={{ maxWidth: 760 }}>
        {sectionMap[seccion] ?? (
          <div style={{ textAlign: 'center', color: 'var(--text-tertiary)', padding: '48px 0' }}>
            Sección no encontrada.
          </div>
        )}
      </div>
    </div>
  )
}
