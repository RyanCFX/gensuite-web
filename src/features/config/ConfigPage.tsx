import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { usePermissionsStore } from '@/stores/permissions.store'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useTabs } from '@/contexts/TabsContext'
import { toast } from 'sonner'
import { Permitido } from '@/components/shared/Permitido'
import { EcfTabs } from '@/shared/ui/EcfTabs'
import { ImpuestosTabs } from '@/shared/ui/ImpuestosTabs'
import axios from 'axios'
import {
  getCobrosConfig, updateCobrosConfig,
  listAlmacenes, createAlmacen, deleteAlmacen, updateAlmacen,
  listMetodosPago, createMetodoPago, updateMetodoPago,
  listUOMs, createUOM, getUOM, updateUOM,
  listListasPrecio,
  getNcfSeries,
  getPerfil, updatePerfil,
  listImpuestosVentas,
  listImpuestosCompras,
  listItemTaxTemplates,
  listTasasImpuesto, createTasaImpuesto, updateTasaImpuesto, deleteTasaImpuesto,
  getFacturacionConfig, updateFacturacionConfig,
  listDenominaciones, createDenominacion, updateDenominacion,
  habilitarPos,
  deshabilitarPos,
  habilitarDespacho,
  deshabilitarDespacho,
  actualizarDespachoFuturo,
  habilitarFarmacia,
  getEcfConfig, updateEcfConfig,
} from '@/shared/api/config'
import { listSucursales } from '@/shared/api/sucursales'
import { listCuentasBancarias } from '@/shared/api/cuentas-bancarias'
import { listCustomerGroups, createCustomerGroup, deleteCustomerGroup } from '@/shared/api/customers'
import { listRoles } from '@/shared/api/usuarios'
import type { CobrosConfig, MetodoPago, TaxLineCategory, TasaImpuesto, TasaImpuestoComponente, CreateTasaImpuestoDto, GrupoCliente, FacturacionConfig, Denominacion, ApiError, UpdateAlmacenDto, FormatoImpresion, EcfTipoElectronico, PosDeshabilitarBloqueos, HabilitarFarmaciaResult, DesactivarDespachoBloqueos, UpdateDespachoFuturoDto } from '@/shared/api/types'
import { PageHeader } from '@/components/shared/PageHeader'
import { SearchSelect } from '@/shared/ui/SearchSelect'
import { FieldTooltip } from '@/shared/ui/FieldTooltip'
import { ConfirmModal, Modal } from '@/shared/ui/Modal'
import { useConfirmClose } from '@/shared/hooks/useConfirmClose'
import { useDirtyCheck } from '@/shared/hooks/useDirtyCheck'
import type { SearchSelectOption } from '@/shared/ui/SearchSelect'
import { Select, SelectItem } from '@/components/ui/select'
import { AccountSelect } from '@/components/shared/AccountSelect'
import { formatDate } from '@/lib/formatters'
import { Plus, Trash2, Save, FileWarning, X, Pencil, ChevronLeft, ChevronRight, Info, ChevronDown, Check, Search } from 'lucide-react'
import EjercicioFiscalSection from './EjercicioFiscalSection'
import { DGII_UOM_CODES, dgiiUomLabel, ECF_TIPOS, TIPO_PAGO_DEFAULT_OPTIONS, TIPO_INGRESOS_DEFAULT_OPTIONS } from '@/lib/dgii'

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
  const [editTarget, setEditTarget] = useState<{ id: string; name: string; branch?: string | null; warehouseType?: string } | null>(null)
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

  const [branchFilterSearch, setBranchFilterSearch] = useState('')
  const [newBranchSearch, setNewBranchSearch] = useState('')
  const [editBranchSearch, setEditBranchSearch] = useState('')
  const branchOptionsFor = (search: string): SearchSelectOption[] => {
    const q = search.toLowerCase()
    return sucursales
      .filter((s) => !q || s.name.toLowerCase().includes(q))
      .map((s) => ({ value: s.name, label: s.name }))
  }

  const createMutation = useMutation({
    mutationFn: () => createAlmacen({ warehouseName: newName, branch: newBranch || undefined, warehouseType: newWarehouseType || undefined, account: newAccount || undefined }),
    onSuccess: () => { toast.success('Almacén creado'); queryClient.invalidateQueries({ queryKey: ['almacenes'] }); setShowNew(false); setNewName(''); setNewBranch(''); setNewWarehouseType(''); setNewAccount('') },
    onError: () => toast.error('Error al crear el almacén'),
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, data: d }: { id: string; data: UpdateAlmacenDto }) =>
      updateAlmacen(id, d),
    onSuccess: () => { toast.success('Almacén actualizado'); queryClient.invalidateQueries({ queryKey: ['almacenes'] }); setEditTarget(null) },
    onError: () => toast.error('Error al actualizar el almacén'),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteAlmacen(id),
    onSuccess: () => { toast.success('Almacén eliminado'); queryClient.invalidateQueries({ queryKey: ['almacenes'] }); setToDelete(null) },
    onError: () => toast.error('Error al eliminar el almacén'),
  })

  function openEdit(a: { id: string; name: string; branch?: string | null; warehouseType?: string; account?: string | null }) {
    setEditTarget(a)
    setEditWarehouseAccount(a.account ?? '')
    setEditWarehouseType(a.warehouseType ?? '')
    setEditBranch(a.branch ?? '')
    setToDelete(null)
  }

  const newIsDirty = useDirtyCheck({ newName, newBranch, newWarehouseType, newAccount }, showNew)
  const newClose = useConfirmClose(newIsDirty, () => setShowNew(false))
  const editIsDirty = useDirtyCheck({ editWarehouseAccount, editBranch, editWarehouseType }, !!editTarget)
  const editClose = useConfirmClose(editIsDirty, () => setEditTarget(null))

  return (
    <>
      <div className="card">
        <div className="card-header">
          <span className="card-title">Almacenes</span>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <div style={{ width: 200 }}>
              <SearchSelect
                value={branchFilter}
                onChange={setBranchFilter}
                options={branchOptionsFor(branchFilterSearch)}
                onSearch={setBranchFilterSearch}
                selectedLabel={branchFilter}
                placeholder="Todas las sucursales"
              />
            </div>
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
        <div className="modal-overlay" onClick={newClose.requestClose}>
          <div className="modal-box modal-box-sm" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <h2 className="modal-title">Nuevo Almacén</h2>
              <button className="modal-close" onClick={newClose.requestClose}><X size={16} /></button>
            </div>
            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div className="ff-wrap">
                <label className="ff-label">Nombre del almacén</label>
                <input className="ff-input" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Almacén Principal" />
              </div>
              <div className="ff-wrap">
                <label className="ff-label">Sucursal</label>
                <SearchSelect
                  value={newBranch}
                  onChange={setNewBranch}
                  options={branchOptionsFor(newBranchSearch)}
                  onSearch={setNewBranchSearch}
                  selectedLabel={newBranch}
                  placeholder="Sin asignar"
                />
              </div>
              <div className="ff-wrap">
                <label className="ff-label">
                  Tipo de Almacén
                  <FieldTooltip>"Tránsito" se usa como punto intermedio en transferencias entre almacenes.</FieldTooltip>
                </label>
                <Select value={newWarehouseType} onValueChange={setNewWarehouseType} placeholder="Estándar">
                  <SelectItem value="">Estándar</SelectItem>
                  <SelectItem value="Transit">Tránsito</SelectItem>
                </Select>
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
              <button className="btn btn-secondary" onClick={newClose.requestClose}>Cancelar</button>
              <button className="btn btn-primary" onClick={() => createMutation.mutate()} disabled={!newName || createMutation.isPending}>
                {createMutation.isPending ? 'Creando…' : 'Crear'}
              </button>
            </div>
          </div>
        </div>
      )}
      <ConfirmModal
        open={newClose.confirming}
        onClose={newClose.cancelDiscard}
        onConfirm={newClose.confirmDiscard}
        title="¿Descartar cambios?"
        description="Tienes cambios sin guardar en este formulario. Si continúas, se perderán."
        confirmLabel="Descartar cambios"
        variant="danger"
      />

      {editTarget && (
        <div className="modal-overlay" onClick={editClose.requestClose}>
          <div className="modal-box modal-box-sm" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <h2 className="modal-title">Editar Almacén</h2>
              <button className="modal-close" onClick={editClose.requestClose}><X size={16} /></button>
            </div>
            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div className="ff-wrap">
                <label className="ff-label">Sucursal</label>
                <SearchSelect
                  value={editBranch}
                  onChange={setEditBranch}
                  options={branchOptionsFor(editBranchSearch)}
                  onSearch={setEditBranchSearch}
                  selectedLabel={editBranch}
                  placeholder="Sin asignar"
                />
              </div>
              <div className="ff-wrap">
                <label className="ff-label">Tipo de Almacén</label>
                <Select value={editWarehouseType} onValueChange={setEditWarehouseType} placeholder="Estándar">
                  <SelectItem value="">Estándar</SelectItem>
                  <SelectItem value="Transit">Tránsito</SelectItem>
                </Select>
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
              <button className="btn btn-secondary" onClick={editClose.requestClose}>Cancelar</button>
              <button
                className="btn btn-primary"
                onClick={() => updateMutation.mutate({ id: editTarget.id, data: { account: editWarehouseAccount, branch: editBranch, warehouseType: editWarehouseType || null } })}
                disabled={updateMutation.isPending}
              >
                {updateMutation.isPending ? 'Guardando…' : 'Guardar'}
              </button>
            </div>
          </div>
        </div>
      )}
      <ConfirmModal
        open={editClose.confirming}
        onClose={editClose.cancelDiscard}
        onConfirm={editClose.confirmDiscard}
        title="¿Descartar cambios?"
        description="Tienes cambios sin guardar en este formulario. Si continúas, se perderán."
        confirmLabel="Descartar cambios"
        variant="danger"
      />

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
  const [search, setSearch] = useState('')
  const [showNew, setShowNew] = useState(false)
  const [newName, setNewName] = useState('')
  const [newType, setNewType] = useState<MetodoPago['type']>('Cash')
  const [editTarget, setEditTarget] = useState<MetodoPago | null>(null)
  const [editAccount, setEditAccount] = useState('')
  const [editRequiresBankAccount, setEditRequiresBankAccount] = useState(false)
  const [editDefaultBankAccount, setEditDefaultBankAccount] = useState('')
  const [editEsCheque, setEditEsCheque] = useState(false)
  const [defaultBankAccountSearch, setDefaultBankAccountSearch] = useState('')

  const { data, isLoading } = useQuery({ queryKey: ['metodos-pago'], queryFn: listMetodosPago })

  const { data: cuentasBancariasData } = useQuery({
    queryKey: ['cuentas-bancarias-activas'],
    queryFn: () => listCuentasBancarias({ estado: 'Activa', limit: 100 }),
    enabled: !!editTarget && !!editRequiresBankAccount,
  })
  const cuentaBancariaOptions: SearchSelectOption[] = (cuentasBancariasData?.items ?? [])
    .filter((c) => !defaultBankAccountSearch || c.accountName.toLowerCase().includes(defaultBankAccountSearch.toLowerCase()))
    .map((c) => ({ value: c.id, label: c.accountName, sublabel: c.bank }))

  const newIsDirty = useDirtyCheck({ newName, newType }, showNew)
  const newClose = useConfirmClose(newIsDirty, () => setShowNew(false))
  const editIsDirty = useDirtyCheck({ editAccount, editRequiresBankAccount, editDefaultBankAccount, editEsCheque }, !!editTarget)
  const editClose = useConfirmClose(editIsDirty, () => setEditTarget(null))

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
    setEditAccount(m.account ?? '')
    setEditRequiresBankAccount(!!m.requiresBankAccount)
    setEditDefaultBankAccount(m.defaultBankAccount ?? '')
    setEditEsCheque(!!m.esCheque)
    setShowNew(false)
  }

  const metodos = (data ?? []).filter((m) => !search || m.name.toLowerCase().includes(search.toLowerCase()))

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title"><span className="page-title-dot" />Métodos de Pago</h1>
          <p className="page-sub">Efectivo, tarjetas, transferencias y demás formas de cobro/pago disponibles</p>
        </div>
        <button className="btn btn-navy" onClick={() => setShowNew(true)}>
          <Plus size={16} />Nuevo Método de Pago
        </button>
      </div>

      <div className="card filter-card-navy" style={{ marginBottom: 20 }}>
        <div className="card-body">
          <div className="filter-bar" style={{ margin: 0 }}>
            <div className="filter-bar-left">
              <div className="search-input-wrap">
                <Search size={14} className="search-input-icon" />
                <input
                  className="search-input"
                  placeholder="Buscar por nombre…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="card navy-table-card">
        <div className="table-scroll">
          <table className="data-table navy-table">
            <thead>
              <tr>
                <th>Nombre</th>
                <th>Tipo</th>
                <th>Estado</th>
                <th style={{ width: 48 }} />
              </tr>
            </thead>
            <tbody>
              {isLoading
                ? Array.from({ length: 4 }).map((_, i) => (
                    <tr key={i}>
                      {Array.from({ length: 4 }).map((__, j) => (
                        <td key={j}><div className="skeleton-box" style={{ height: 14, width: '100%' }} /></td>
                      ))}
                    </tr>
                  ))
                : metodos.length === 0
                  ? (
                      <tr>
                        <td colSpan={4}>
                          <div className="empty-state">
                            <p className="empty-title">Sin métodos de pago</p>
                            <p className="empty-sub">Crea el primer método de pago para comenzar.</p>
                          </div>
                        </td>
                      </tr>
                    )
                  : metodos.map((m) => (
                      <tr key={m.name}>
                        <td style={{ fontWeight: 500 }}>
                          {m.name}
                          {m.esCheque && <span className="badge badge-info" style={{ marginLeft: 6 }}>Cheque</span>}
                        </td>
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
        </div>
      </div>

      {showNew && (
        <div className="modal-overlay" onClick={newClose.requestClose}>
          <div className="modal-box modal-box-sm" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <h2 className="modal-title">Nuevo Método de Pago</h2>
              <button className="modal-close" onClick={newClose.requestClose}><X size={16} /></button>
            </div>
            <div className="modal-body">
              <div className="ff-wrap">
                <label className="ff-label">Nombre</label>
                <input className="ff-input" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Efectivo" />
              </div>
              <div className="ff-wrap">
                <label className="ff-label">Tipo</label>
                <Select value={newType} onValueChange={(val) => setNewType(val as MetodoPago['type'])}>
                  <SelectItem value="Cash">Cash</SelectItem>
                  <SelectItem value="Bank">Bank</SelectItem>
                  <SelectItem value="General">General</SelectItem>
                </Select>
              </div>
            </div>
            <div className="modal-foot">
              <button className="btn btn-secondary" onClick={newClose.requestClose}>Cancelar</button>
              <button className="btn btn-primary" onClick={() => createMutation.mutate()} disabled={!newName || createMutation.isPending}>
                {createMutation.isPending ? 'Creando…' : 'Crear'}
              </button>
            </div>
          </div>
        </div>
      )}

      <ConfirmModal
        open={newClose.confirming}
        onClose={newClose.cancelDiscard}
        onConfirm={newClose.confirmDiscard}
        title="¿Descartar cambios?"
        description="Tienes cambios sin guardar en este formulario. Si continúas, se perderán."
        confirmLabel="Descartar cambios"
        variant="danger"
      />

      {editTarget && (
        <div className="modal-overlay" onClick={editClose.requestClose}>
          <div className="modal-box modal-box-sm" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <h2 className="modal-title">Editar Método de Pago</h2>
              <button className="modal-close" onClick={editClose.requestClose}><X size={16} /></button>
            </div>
            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div className="ff-wrap">
                <label className="ff-label">
                  Cuenta Bancaria / Caja
                  <FieldTooltip>Ej: "Efectivo RD" → "Cash - JB"</FieldTooltip>
                </label>
                <AccountSelect
                  value={editAccount}
                  onChange={setEditAccount}
                  placeholder="Buscar cuenta bancaria o caja…"
                />
              </div>

              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={editEsCheque}
                  onChange={(e) => {
                    setEditEsCheque(e.target.checked)
                    if (e.target.checked) setEditRequiresBankAccount(true)
                  }}
                />
                Es cheque
                {editEsCheque && (
                  <FieldTooltip>
                    Todo pago con este método (en Compras, Gastos y Pagos a proveedores) se tratará
                    siempre como pago con cheque — se pedirá cuenta bancaria y número de cheque, y
                    quedará registrado en el historial de cheques.
                  </FieldTooltip>
                )}
              </label>

              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: editEsCheque ? 'default' : 'pointer' }}>
                <input
                  type="checkbox"
                  checked={editRequiresBankAccount}
                  disabled={editEsCheque}
                  onChange={(e) => setEditRequiresBankAccount(e.target.checked)}
                />
                Requiere cuenta bancaria
                {editEsCheque && (
                  <FieldTooltip>Requerida automáticamente — todo cheque necesita indicar de qué cuenta sale.</FieldTooltip>
                )}
              </label>

              {editRequiresBankAccount && (
                <div className="ff-wrap">
                  <label className="ff-label">
                    Cuenta bancaria por defecto
                    <FieldTooltip>Opcional. Si se deja vacío, el usuario deberá elegir la cuenta en cada cobro/pago.</FieldTooltip>
                  </label>
                  <SearchSelect
                    value={editDefaultBankAccount}
                    onChange={setEditDefaultBankAccount}
                    options={cuentaBancariaOptions}
                    onSearch={setDefaultBankAccountSearch}
                    selectedLabel={cuentaBancariaOptions.find((o) => o.value === editDefaultBankAccount)?.label ?? ''}
                    placeholder="— Sin cuenta por defecto —"
                  />
                </div>
              )}
            </div>
            <div className="modal-foot">
              <button className="btn btn-secondary" onClick={editClose.requestClose}>Cancelar</button>
              <button
                className="btn btn-primary"
                onClick={() => updateMutation.mutate({
                  id: editTarget.name,
                  data: {
                    account: editAccount || undefined,
                    requiresBankAccount: editRequiresBankAccount,
                    defaultBankAccount: editRequiresBankAccount ? (editDefaultBankAccount || undefined) : undefined,
                    esCheque: editEsCheque,
                  },
                })}
                disabled={updateMutation.isPending}
              >
                {updateMutation.isPending ? 'Guardando…' : 'Guardar'}
              </button>
            </div>
          </div>
        </div>
      )}

      <ConfirmModal
        open={editClose.confirming}
        onClose={editClose.cancelDiscard}
        onConfirm={editClose.confirmDiscard}
        title="¿Descartar cambios?"
        description="Tienes cambios sin guardar en este formulario. Si continúas, se perderán."
        confirmLabel="Descartar cambios"
        variant="danger"
      />
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
  const [newCodigoDgii, setNewCodigoDgii] = useState('')
  const [newMustBeWholeNumber, setNewMustBeWholeNumber] = useState(false)
  const [conversions, setConversions] = useState<UomConversionRow[]>([])
  const [convErrors, setConvErrors] = useState<Record<number, string>>({})
  const [detailId, setDetailId] = useState<string | null>(null)
  const [editing, setEditing] = useState(false)
  const [editName, setEditName] = useState('')
  const [editCodigoDgii, setEditCodigoDgii] = useState('')
  const [editMustBeWholeNumber, setEditMustBeWholeNumber] = useState(false)
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
      codigoDgii: newCodigoDgii || undefined,
      mustBeWholeNumber: newMustBeWholeNumber,
    }),
    onSuccess: () => {
      toast.success('Unidad creada')
      queryClient.invalidateQueries({ queryKey: ['uom'] })
      setShowCreate(false)
      setNewUomName('')
      setNewCodigoDgii('')
      setNewMustBeWholeNumber(false)
      setConversions([])
      setConvErrors({})
    },
    onError: () => toast.error('Error al crear la unidad'),
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, dto }: { id: string; dto: Parameters<typeof updateUOM>[1] }) =>
      updateUOM(id, dto),
    onSuccess: (result) => {
      toast.success('Unidad actualizada')
      if (result?.warning) toast.warning(result.warning)
      queryClient.invalidateQueries({ queryKey: ['uom'] })
      setEditing(false)
      setDetailId(null)
    },
    onError: () => toast.error('Error al actualizar la unidad'),
  })

  function openEdit() {
    if (!detailData) return
    setEditName(detailId ?? '')
    setEditCodigoDgii(detailData.codigoDgii ?? '')
    setEditMustBeWholeNumber(detailData.mustBeWholeNumber ?? false)
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
    if (editCodigoDgii !== (detailData?.codigoDgii ?? '')) dto.codigoDgii = editCodigoDgii
    if (editMustBeWholeNumber !== (detailData?.mustBeWholeNumber ?? false)) dto.mustBeWholeNumber = editMustBeWholeNumber
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

  const createIsDirty = useDirtyCheck({ newUomName, newCodigoDgii, newMustBeWholeNumber, conversions }, showCreate)
  const createClose = useConfirmClose(createIsDirty, () => setShowCreate(false))
  const editIsDirty = useDirtyCheck({ editName, editCodigoDgii, editMustBeWholeNumber, editConversions }, editing)
  const detailClose = useConfirmClose(editIsDirty, () => { setDetailId(null); setEditing(false) })
  const editCancelClose = useConfirmClose(editIsDirty, () => setEditing(false))

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
            <button className="btn btn-primary btn-size-sm" onClick={() => { setNewUomName(''); setNewCodigoDgii(''); setConversions([]); setConvErrors({}); setShowCreate(true) }}>
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
                        <th>Código DGII</th>
                        <th>Solo enteros</th>
                        <th style={{ width: 100 }} />
                      </tr>
                    </thead>
                    <tbody>
                      {pageUoms.length === 0
                        ? (
                            <tr>
                              <td colSpan={4} style={{ textAlign: 'center', color: 'var(--text-secondary)', padding: '24px 0' }}>
                                Sin resultados para "{search}"
                              </td>
                            </tr>
                          )
                        : pageUoms.map(u => (
                            <tr key={u.name}>
                              <td style={{ fontWeight: 500 }}>{u.name}</td>
                              <td>
                                {u.codigoDgii
                                  ? <span className="badge badge--gray">{u.codigoDgii} — {u.abreviaturaDgii}</span>
                                  : <span style={{ color: 'var(--text-tertiary)' }}>—</span>}
                              </td>
                              <td>
                                {u.mustBeWholeNumber
                                  ? <span className="badge badge-info">Sí</span>
                                  : <span style={{ color: 'var(--text-tertiary)' }}>No</span>}
                              </td>
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
        <div className="modal-overlay" onClick={createClose.requestClose}>
          <div className="modal-box" style={{ maxWidth: 560 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <h2 className="modal-title">Nueva Unidad de Medida</h2>
              <button className="modal-close" onClick={createClose.requestClose}><X size={16} /></button>
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

              <div className="ff-wrap">
                <label className="ff-label">
                  Código DGII
                  <FieldTooltip>
                    Unidad de medida que exige la DGII en cada línea de un comprobante electrónico.
                    Opcional — sin código, esta unidad sigue siendo válida para todo lo demás.
                  </FieldTooltip>
                </label>
                <Select value={newCodigoDgii} onValueChange={setNewCodigoDgii} placeholder="Ninguno">
                  <SelectItem value="">Ninguno</SelectItem>
                  {DGII_UOM_CODES.map((c) => (
                    <SelectItem key={c.codigo} value={c.codigo}>{dgiiUomLabel(c.codigo)}</SelectItem>
                  ))}
                </Select>
              </div>

              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={newMustBeWholeNumber}
                  onChange={(e) => setNewMustBeWholeNumber(e.target.checked)}
                />
                Solo cantidades enteras (sin decimales)
                <FieldTooltip>Ej: "Unidad", "Caja". UOMs continuas (Kg, Litro, Metro) deben dejarlo desmarcado.</FieldTooltip>
              </label>

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
              <button className="btn btn-secondary" onClick={createClose.requestClose}>Cancelar</button>
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
      <ConfirmModal
        open={createClose.confirming}
        onClose={createClose.cancelDiscard}
        onConfirm={createClose.confirmDiscard}
        title="¿Descartar cambios?"
        description="Tienes cambios sin guardar en este formulario. Si continúas, se perderán."
        confirmLabel="Descartar cambios"
        variant="danger"
      />

      {/* Detail / Edit modal */}
      {detailId && (
        <div className="modal-overlay" onClick={detailClose.requestClose}>
          <div className="modal-box" style={{ maxWidth: 480 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <h2 className="modal-title">{editing ? 'Editar UOM' : detailId}</h2>
              <button className="modal-close" onClick={detailClose.requestClose}><X size={16} /></button>
            </div>

            {editing ? (
              <>
                <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  <div className="ff-wrap">
                    <label className="ff-label">Nombre</label>
                    <input className="ff-input" value={editName} onChange={(e) => setEditName(e.target.value)} />
                  </div>

                  <div className="ff-wrap">
                    <label className="ff-label">
                      Código DGII
                      <FieldTooltip>Unidad de medida que exige la DGII en cada línea de un comprobante electrónico.</FieldTooltip>
                    </label>
                    <Select value={editCodigoDgii} onValueChange={setEditCodigoDgii} placeholder="Ninguno">
                      <SelectItem value="">Ninguno</SelectItem>
                      {DGII_UOM_CODES.map((c) => (
                        <SelectItem key={c.codigo} value={c.codigo}>{dgiiUomLabel(c.codigo)}</SelectItem>
                      ))}
                    </Select>
                  </div>

                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={editMustBeWholeNumber}
                      onChange={(e) => setEditMustBeWholeNumber(e.target.checked)}
                    />
                    Solo cantidades enteras (sin decimales)
                    <FieldTooltip>Ej: "Unidad", "Caja". UOMs continuas (Kg, Litro, Metro) deben dejarlo desmarcado.</FieldTooltip>
                  </label>

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
                  <button className="btn btn-secondary" onClick={editCancelClose.requestClose}>Cancelar</button>
                  <button className="btn btn-primary" onClick={handleUpdate} disabled={updateMutation.isPending}>
                    {updateMutation.isPending ? 'Guardando…' : 'Guardar'}
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="modal-body">
                  {!isDetailLoading && detailData && (
                    <div className="fields-grid fields-grid-2" style={{ marginBottom: 16 }}>
                      <div className="detail-field">
                        <span className="detail-label">Código DGII</span>
                        <span className="detail-value">
                          {detailData.codigoDgii ? `${detailData.codigoDgii} — ${detailData.abreviaturaDgii}` : '—'}
                        </span>
                      </div>
                      <div className="detail-field">
                        <span className="detail-label">Solo cantidades enteras</span>
                        <span className="detail-value">{detailData.mustBeWholeNumber ? 'Sí' : 'No'}</span>
                      </div>
                    </div>
                  )}
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
      <ConfirmModal
        open={detailClose.confirming || editCancelClose.confirming}
        onClose={detailClose.confirming ? detailClose.cancelDiscard : editCancelClose.cancelDiscard}
        onConfirm={detailClose.confirming ? detailClose.confirmDiscard : editCancelClose.confirmDiscard}
        title="¿Descartar cambios?"
        description="Tienes cambios sin guardar en este formulario. Si continúas, se perderán."
        confirmLabel="Descartar cambios"
        variant="danger"
      />
    </>
  )
}

// ---- Listas de Precio Section ----
function ListasPrecioSection() {
  const [search, setSearch] = useState('')
  const { data, isLoading } = useQuery({ queryKey: ['listas-precio'], queryFn: listListasPrecio })

  const listas = (data ?? []).filter((l) => !search || l.name.toLowerCase().includes(search.toLowerCase()))

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title"><span className="page-title-dot" />Listas de Precio</h1>
          <p className="page-sub">Listas de precio de compra/venta disponibles para artículos y clientes</p>
        </div>
      </div>

      <div className="card filter-card-navy" style={{ marginBottom: 20 }}>
        <div className="card-body">
          <div className="filter-bar" style={{ margin: 0 }}>
            <div className="filter-bar-left">
              <div className="search-input-wrap">
                <Search size={14} className="search-input-icon" />
                <input
                  className="search-input"
                  placeholder="Buscar por nombre…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="card navy-table-card">
        <div className="table-scroll">
          <table className="data-table navy-table">
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
              {isLoading
                ? Array.from({ length: 4 }).map((_, i) => (
                    <tr key={i}>
                      {Array.from({ length: 5 }).map((__, j) => (
                        <td key={j}><div className="skeleton-box" style={{ height: 14, width: '100%' }} /></td>
                      ))}
                    </tr>
                  ))
                : listas.length === 0
                  ? (
                      <tr>
                        <td colSpan={5}>
                          <div className="empty-state">
                            <p className="empty-title">Sin listas de precio</p>
                            <p className="empty-sub">No hay listas de precio configuradas.</p>
                          </div>
                        </td>
                      </tr>
                    )
                  : listas.map((l) => (
                      <tr key={l.name}>
                        <td style={{ fontWeight: 500 }}>{l.name}</td>
                        <td className="td-muted">{l.currency}</td>
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
        </div>
      </div>
    </>
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

// ---- Tax Templates Section (shared for ventas/compras, solo lectura) ----
const TAX_CATEGORY_OPTIONS: { value: TaxLineCategory; label: string }[] = [
  { value: 'Total', label: 'Total' },
  { value: 'Valuation', label: 'Costo del artículo' },
  { value: 'Valuation and Total', label: 'Total y costo' },
]

interface TaxTemplatesSectionProps {
  kind: 'ventas' | 'compras'
}

function TaxTemplatesSection({ kind }: TaxTemplatesSectionProps) {
  const queryKey = kind === 'ventas' ? 'impuestos-ventas' : 'impuestos-compras'
  const listFn = kind === 'ventas' ? listImpuestosVentas : listImpuestosCompras

  const { data, isLoading } = useQuery({ queryKey: [queryKey], queryFn: listFn })

  const label = kind === 'ventas' ? 'Ventas' : 'Compras'
  const sectionDescription = kind === 'ventas'
    ? 'Impuesto aplicado al TOTAL de cotizaciones y facturas de venta completas (ej. ITBIS 18% sobre el monto total del documento). Esta lista es solo de referencia — las plantillas se generan y gestionan automáticamente desde "Tasas de Impuesto".'
    : 'Impuesto aplicado al TOTAL de compras completas. Incluye campos adicionales para retenciones y afectación al costo del inventario (landed cost). Esta lista es solo de referencia — las plantillas se generan y gestionan automáticamente desde "Tasas de Impuesto".'

  return (
    <div className="card">
      <div className="card-header">
        <span className="card-title">Plantillas de Impuesto — {label}</span>
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
                    No hay plantillas generadas todavía. Se crean automáticamente al marcar "Aplica a — {label}" en una Tasa de Impuesto.
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
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
      </div>
    </div>
  )
}

// ---- Item Tax Templates Section (impuesto por artículo — solo lectura) ----
function ItemTaxTemplatesSection() {
  const { data, isLoading } = useQuery({ queryKey: ['item-tax-templates'], queryFn: listItemTaxTemplates })

  return (
    <div className="card">
      <div className="card-header">
        <span className="card-title">Impuestos por Artículo</span>
      </div>
      <div className="card-body" style={{ paddingTop: 0, paddingBottom: 12 }}>
        <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: 0 }}>
          Impuesto asociado a un artículo específico — se usa para excepciones donde un artículo individual
          tiene una tasa distinta al general (ej. exento de ITBIS). Esta lista es solo de referencia — las
          plantillas se generan y gestionan automáticamente desde "Tasas de Impuesto".
        </p>
      </div>
      <div>
        {isLoading
          ? <span className="skeleton-box" style={{ height: 128, display: 'block', margin: 16 }} />
          : !data || data.length === 0
            ? (
                <div className="card-body">
                  <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                    No hay plantillas generadas todavía. Se crean automáticamente al crear una Tasa de Impuesto — todo impuesto aplica siempre a Artículos.
                  </p>
                </div>
              )
            : (
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Título</th>
                      <th>Tasas</th>
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
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
      </div>
    </div>
  )
}

// ---- Tasas de Impuesto Section (catálogo de impuestos base + combos) ----
function emptyComponente(): TasaImpuestoComponente {
  return { impuestoBaseId: '', factor: 100 }
}

function TasasImpuestoSection() {
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const { data, isLoading } = useQuery({ queryKey: ['tasas-impuesto'], queryFn: listTasasImpuesto })
  const { data: facturacionConfig } = useQuery({ queryKey: ['facturacion-config'], queryFn: getFacturacionConfig })
  const usaImpuestoDocumento = facturacionConfig?.usaImpuestoDocumento ?? true

  const [showForm, setShowForm] = useState(false)
  const [editTarget, setEditTarget] = useState<TasaImpuesto | null>(null)
  const [toDelete, setToDelete] = useState<TasaImpuesto | null>(null)

  const [formNombre, setFormNombre] = useState('')
  const [formAccount, setFormAccount] = useState('')
  const [formAccountCompras, setFormAccountCompras] = useState('')
  const [formEsCombo, setFormEsCombo] = useState(false)
  const [formTasa, setFormTasa] = useState(18)
  const [formComponentes, setFormComponentes] = useState<TasaImpuestoComponente[]>([emptyComponente()])
  const [formDescripcion, setFormDescripcion] = useState('')
  const [formAplicaVentas, setFormAplicaVentas] = useState(false)
  const [formAplicaCompras, setFormAplicaCompras] = useState(false)

  function openCreate() {
    setEditTarget(null)
    setFormNombre('')
     setFormAccount('')
    setFormAccountCompras('')
    setFormEsCombo(false)
    setFormTasa(18)
    setFormComponentes([emptyComponente()])
    setFormDescripcion('')
    setFormAplicaVentas(false)
    setFormAplicaCompras(false)
    setShowForm(true)
  }

  function openEdit(t: TasaImpuesto) {
    setEditTarget(t)
    setFormNombre(t.nombre)
    setFormAccount(t.account)
    setFormAccountCompras(t.accountCompras ?? '')
    setFormEsCombo(t.esCombo)
    setFormTasa(t.tasa ?? 0)
    setFormComponentes(t.componentes && t.componentes.length > 0 ? t.componentes.map((c) => ({ ...c })) : [emptyComponente()])
    setFormDescripcion(t.descripcion ?? '')
    setFormAplicaVentas(!!t.aplicaVentas)
    setFormAplicaCompras(!!t.aplicaCompras)
    setShowForm(true)
  }

  function closeForm() {
    setShowForm(false)
    setEditTarget(null)
  }

  const formIsDirty = useDirtyCheck({ formNombre, formAccount, formAccountCompras, formEsCombo, formTasa, formComponentes, formDescripcion, formAplicaVentas, formAplicaCompras }, showForm)
  const formClose = useConfirmClose(formIsDirty, closeForm)

  function updateComponente(idx: number, patch: Partial<TasaImpuestoComponente>) {
    setFormComponentes((prev) => prev.map((c, i) => i === idx ? { ...c, ...patch } : c))
  }

  // El impuesto que se está editando no puede ser su propio componente.
  const baseOptions = (data ?? []).filter((t) => t.id !== editTarget?.id)

  // Preview visual con las tasas ya cargadas en el listado — el backend recalcula el valor real al guardar.
  const previewTasa = formComponentes.reduce((sum, c) => {
    const base = (data ?? []).find((t) => t.id === c.impuestoBaseId)
    if (!base || base.tasa == null) return sum
    return sum + (c.factor ?? 100) / 100 * base.tasa
  }, 0)

  const saveMutation = useMutation({
    mutationFn: () => {
      const dto: CreateTasaImpuestoDto = {
        nombre: formNombre,
        account: formAccount,
        accountCompras: formAccountCompras,
        esCombo: formEsCombo,
        ...(formEsCombo
          ? { componentes: formComponentes.filter((c) => c.impuestoBaseId) }
          : { tasa: formTasa }),
        descripcion: formDescripcion || undefined,
        aplicaArticulos: true,
        aplicaVentas: formAplicaVentas,
        aplicaCompras: formAplicaCompras,
      }
      return editTarget ? updateTasaImpuesto(editTarget.id, dto) : createTasaImpuesto(dto)
    },
    onSuccess: () => {
      toast.success(editTarget ? 'Tasa de impuesto actualizada' : 'Tasa de impuesto creada')
      // Invalida todo el listado: el backend puede haber recalculado en cascada otros combos.
      queryClient.invalidateQueries({ queryKey: ['tasas-impuesto'] })
      closeForm()
    },
    onError: (err: ApiError) => toast.error(err?.message ?? 'Error al guardar la tasa de impuesto'),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteTasaImpuesto(id),
    onSuccess: () => {
      toast.success('Tasa de impuesto eliminada')
      queryClient.invalidateQueries({ queryKey: ['tasas-impuesto'] })
      setToDelete(null)
    },
    onError: (err: ApiError) => toast.error(err?.message ?? 'Error al eliminar la tasa de impuesto'),
  })

  const formValid = !!formNombre.trim() && !!formAccount
    && (formEsCombo ? formComponentes.some((c) => c.impuestoBaseId) : true)

  const tasas = (data ?? []).filter((t) => !search || t.nombre.toLowerCase().includes(search.toLowerCase()))

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title"><span className="page-title-dot" />Tasas de Impuesto</h1>
          <p className="page-sub">
            Catálogo central de impuestos base (ej. ITBIS, ISR) y combos — al editar la tasa de un
            impuesto base, los combos y plantillas que lo usan se recalculan automáticamente.
          </p>
        </div>
        <button className="btn btn-navy" onClick={openCreate}>
          <Plus size={16} /> Nueva Tasa de Impuesto
        </button>
      </div>

      <div className="card filter-card-navy" style={{ marginBottom: 20 }}>
        <div className="card-body">
          <div className="filter-bar" style={{ margin: 0 }}>
            <div className="filter-bar-left">
              <div className="search-input-wrap">
                <Search size={14} className="search-input-icon" />
                <input
                  className="search-input"
                  placeholder="Buscar por nombre…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="card navy-table-card">
        <div className="table-scroll">
          <table className="data-table navy-table">
            <thead>
              <tr>
                <th>Nombre</th>
                <th>Cuenta</th>
                <th>Tipo</th>
                <th>Tasa</th>
                <th>Descripción</th>
                <th style={{ width: 80 }} />
              </tr>
            </thead>
            <tbody>
              {isLoading
                ? Array.from({ length: 4 }).map((_, i) => (
                    <tr key={i}>
                      {Array.from({ length: 6 }).map((__, j) => (
                        <td key={j}><div className="skeleton-box" style={{ height: 14, width: '100%' }} /></td>
                      ))}
                    </tr>
                  ))
                : tasas.length === 0
                  ? (
                      <tr>
                        <td colSpan={6}>
                          <div className="empty-state">
                            <p className="empty-title">Sin tasas de impuesto</p>
                            <p className="empty-sub">Crea la primera tasa de impuesto para comenzar.</p>
                          </div>
                        </td>
                      </tr>
                    )
                  : tasas.map((t) => (
                      <tr key={t.id}>
                        <td style={{ fontWeight: 500 }}>{t.nombre}</td>
                        <td className="td-muted">
                          {t.accountCompras && t.accountCompras !== t.account
                            ? `Ventas: ${t.account} · Compras: ${t.accountCompras}`
                            : t.account}
                        </td>
                        <td>
                          <span className={`badge ${t.esCombo ? 'badge-info' : 'badge-default'}`}>
                            {t.esCombo ? 'Combo' : 'Base'}
                          </span>
                        </td>
                        <td>{t.tasa != null ? `${t.tasa}%` : '—'}</td>
                        <td className="td-muted">{t.descripcion || '—'}</td>
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
        </div>
      </div>

      {/* Create / Edit modal */}
      {showForm && (
        <div className="modal-overlay" onClick={formClose.requestClose}>
          <div className="modal-box" style={{ maxWidth: 640 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <h2 className="modal-title">{editTarget ? 'Editar' : 'Nueva'} Tasa de Impuesto</h2>
              <button className="modal-close" onClick={formClose.requestClose}><X size={16} /></button>
            </div>
            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div className="form-row">
                <div className="ff-wrap">
                  <label className="ff-label ff-required">Nombre</label>
                  <input
                    className="ff-input"
                    value={formNombre}
                    onChange={(e) => setFormNombre(e.target.value)}
                    placeholder="ITBIS, ISR, ITBIS+ISR…"
                  />
                </div>
                <div className="ff-wrap">
                  <label className="ff-label ff-required">Cuenta Contable (Ventas)</label>
                  <AccountSelect
                    value={formAccount}
                    onChange={setFormAccount}
                    placeholder="Buscar cuenta…"
                    ledgerOnly
                    soloImpuesto
                  />
                </div>
                <div className="ff-wrap">
                  <label className="ff-label">
                    Cuenta Contable (Gastos)
                    <FieldTooltip>Si se deja vacía, se usa la misma cuenta de Ventas/Artículos.</FieldTooltip>
                  </label>
                  <AccountSelect
                    value={formAccountCompras}
                    onChange={setFormAccountCompras}
                    placeholder="Buscar cuenta…"
                    ledgerOnly
                  />
                </div>
              </div>

              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={formEsCombo}
                  onChange={(e) => setFormEsCombo(e.target.checked)}
                  style={{ width: 16, height: 16 }}
                />
                Es Combo (suma de otras tasas del catálogo)
              </label>

              {!formEsCombo && (
                <div className="ff-wrap" style={{ maxWidth: 160 }}>
                  <label className="ff-label ff-required">Tasa (%)</label>
                  <input
                    className="ff-input"
                    type="number"
                    min="0"
                    step="0.01"
                    value={formTasa}
                    onChange={(e) => setFormTasa(parseFloat(e.target.value) || 0)}
                  />
                </div>
              )}

              {formEsCombo && (
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <label className="ff-label" style={{ marginBottom: 0 }}>Componentes</label>
                    <button
                      type="button"
                      className="btn btn-secondary btn-size-sm"
                      onClick={() => setFormComponentes((prev) => [...prev, emptyComponente()])}
                    >
                      <Plus size={14} /> Agregar componente
                    </button>
                  </div>
                  <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', overflow: 'hidden' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                      <thead>
                        <tr style={{ background: 'var(--surface-sunken)' }}>
                          <th style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 500, color: 'var(--text-secondary)', fontSize: 11 }}>Impuesto base</th>
                          <th style={{ padding: '8px 12px', textAlign: 'right', fontWeight: 500, color: 'var(--text-secondary)', fontSize: 11, width: 100 }}>Factor %</th>
                          <th style={{ width: 36 }} />
                        </tr>
                      </thead>
                      <tbody>
                        {formComponentes.map((c, idx) => (
                          <tr key={idx} style={{ borderTop: '1px solid var(--border)' }}>
                            <td style={{ padding: '6px 8px', minWidth: 200 }}>
                              <Select value={c.impuestoBaseId} onValueChange={(v) => updateComponente(idx, { impuestoBaseId: v })}>
                                {baseOptions.map((opt) => (
                                  <SelectItem key={opt.id} value={opt.id}>{opt.nombre}</SelectItem>
                                ))}
                              </Select>
                            </td>
                            <td style={{ padding: '6px 8px' }}>
                              <input
                                className="ff-input"
                                type="number"
                                min="0"
                                step="1"
                                style={{ fontSize: 12, padding: '4px 8px', textAlign: 'right' }}
                                value={c.factor ?? 100}
                                onChange={(e) => updateComponente(idx, { factor: parseFloat(e.target.value) || 0 })}
                              />
                            </td>
                            <td style={{ padding: '4px 6px', textAlign: 'center' }}>
                              <button
                                type="button"
                                className="btn btn-ghost btn-size-icon-sm"
                                style={{ color: 'var(--icon-muted)' }}
                                onClick={() => setFormComponentes((prev) => prev.filter((_, i) => i !== idx))}
                                disabled={formComponentes.length === 1}
                              >
                                <Trash2 size={13} />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 8 }}>
                    Tasa resultante (previsualización): <strong>{previewTasa.toFixed(2)}%</strong> — el valor real lo calcula el servidor al guardar.
                  </p>
                </div>
              )}

              <div className="ff-wrap">
                <label className="ff-label">Descripción</label>
                <input
                  className="ff-input"
                  value={formDescripcion}
                  onChange={(e) => setFormDescripcion(e.target.value)}
                  placeholder="Impuesto al Valor Agregado"
                />
              </div>

              {usaImpuestoDocumento && (
                <div className="ff-wrap">
                  <label className="ff-label">
                    Aplica a
                    <FieldTooltip>El servidor gestiona sola la plantilla correspondiente en cada documento — no es necesario configurarla manualmente.</FieldTooltip>
                  </label>
                  <div style={{ display: 'flex', gap: 20 }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={formAplicaVentas}
                        onChange={(e) => setFormAplicaVentas(e.target.checked)}
                        style={{ width: 16, height: 16 }}
                      />
                      Ventas
                    </label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={formAplicaCompras}
                        onChange={(e) => setFormAplicaCompras(e.target.checked)}
                        style={{ width: 16, height: 16 }}
                      />
                      Compras
                    </label>
                  </div>
                </div>
              )}
            </div>
            <div className="modal-foot">
              <button className="btn btn-secondary" onClick={formClose.requestClose}>Cancelar</button>
              <button
                className="btn btn-primary"
                onClick={() => saveMutation.mutate()}
                disabled={!formValid || saveMutation.isPending}
              >
                {saveMutation.isPending ? 'Guardando…' : 'Guardar'}
              </button>
            </div>
          </div>
        </div>
      )}
      <ConfirmModal
        open={formClose.confirming}
        onClose={formClose.cancelDiscard}
        onConfirm={formClose.confirmDiscard}
        title="¿Descartar cambios?"
        description="Tienes cambios sin guardar en este formulario. Si continúas, se perderán."
        confirmLabel="Descartar cambios"
        variant="danger"
      />

      {/* Delete confirm */}
      {toDelete && (
        <div className="modal-overlay" onClick={() => setToDelete(null)}>
          <div className="modal-box modal-box-sm" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <h2 className="modal-title">¿Eliminar tasa de impuesto?</h2>
              <button className="modal-close" onClick={() => setToDelete(null)}><X size={16} /></button>
            </div>
            <div className="modal-body">
              <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                Se eliminará <strong>{toDelete.nombre}</strong>. Esta acción no se puede deshacer.
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

// Solo se registra en el menú si vertical === "farmacia" (ver AppLayout.tsx); si alguien entra
// directo por URL en un tenant general, el propio POST responde 403.
// El backend NO expone un GET de estado del vertical (docs/PROMPT_FARMACIA_V2_FRONTEND.md §9):
// el checklist es una lista de tareas para el admin, no un diagnóstico en vivo.
const LINK_STYLE: React.CSSProperties = { color: 'var(--color-brand)', textDecoration: 'underline' }

/** Fila de resultado del provisionamiento — se omite si el backend no devolvió ese campo. */
function ResultadoFarmacia({ label, valor }: { label: string; valor?: string }) {
  if (!valor) return null
  return (
    <div className="detail-field">
      <span className="detail-label">{label}</span>
      <span className="detail-value" style={{ fontFamily: 'monospace', fontSize: 12 }}>{valor}</span>
    </div>
  )
}

function FarmaciaArsConfigSection() {
  const esFarmacia = usePermissionsStore((s) => s.vertical) === 'farmacia'
  const [resultado, setResultado] = useState<HabilitarFarmaciaResult | null>(null)

  const habilitarMutation = useMutation({
    mutationFn: habilitarFarmacia,
    onSuccess: (data) => {
      setResultado(data)
      toast.success('Farmacia ARS habilitada/reparada correctamente')
    },
    onError: (err: { message?: string }) => toast.error(err?.message ?? 'Error al habilitar Farmacia ARS'),
  })

  const checklist: { texto: React.ReactNode; hecho?: boolean }[] = [
    {
      texto: <>Vertical <strong>farmacia</strong> fijado por el operador para tu empresa.</>,
      hecho: esFarmacia,
    },
    {
      texto: <>Ejecutar <strong>Habilitar / Reparar</strong> (el botón de abajo) — idempotente.</>,
      hecho: habilitarMutation.isSuccess || undefined,
    },
    {
      texto: (
        <>
          Dar de alta las ARS en{' '}
          <Link to="/farmacia/aseguradoras" style={LINK_STYLE}>Aseguradoras</Link>{' '}
          (nacen con crédito fiscal, precondición para facturar el lote consolidado).
        </>
      ),
    },
    {
      texto: (
        <>
          Medicamentos con plantilla de impuesto <strong>exenta</strong> (Ley 253-12) y creados como{' '}
          <em>producto</em> desde el catálogo del sistema — nunca creados a mano por fuera de este
          catálogo, o no aparecen en los selectores.
        </>
      ),
    },
    {
      texto: (
        <>
          Rangos NCF/e-NCF para <strong>B02/E32</strong> (paciente), <strong>B01/E31</strong>{' '}
          (consolidada a la ARS) y <strong>B04/E34</strong> (notas de crédito) en{' '}
          <Link to="/config/ecf" style={LINK_STYLE}>Configuración → e-CF</Link>
          .
        </>
      ),
    },
    {
      texto: <>Usuarios con sus perfiles normales (Ventas, Cajero POS, Contabilidad).</>,
    },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div className="ff-wrap">
        <label className="ff-label">Puesta en marcha de Farmacia ARS</label>
        <p className="ff-hint" style={{ marginBottom: 10 }}>
          La cobertura de la aseguradora vive dentro de la factura de venta normal: no hay pantallas
          de preaprobación ni de despacho. Esta es la lista de tareas para dejar el vertical operativo.
        </p>
        <ol style={{ margin: 0, paddingLeft: 20, display: 'flex', flexDirection: 'column', gap: 8, fontSize: 13 }}>
          {checklist.map((item, i) => (
            <li key={i} style={{ lineHeight: 1.5 }}>
              {item.hecho === true && <Check size={13} style={{ color: 'var(--success-text)', marginRight: 4, verticalAlign: 'middle' }} />}
              {item.texto}
            </li>
          ))}
        </ol>
      </div>

      <div className="ff-wrap">
        <label className="ff-label">Habilitar / Reparar configuración</label>
        <p className="ff-hint" style={{ marginBottom: 8 }}>
          Provisiona (de forma idempotente) la cuenta puente contable, el modo de pago "Cobertura ARS",
          el grupo de clientes "ARS", los perfiles de rol, el ítem de reclasificación del lote y la
          plantilla de impresión "Factura Farmacia". Puede ejecutarse varias veces sin riesgo — útil
          si algo quedó a medias en un intento anterior.
        </p>
        <Permitido accion="config.farmacia.habilitar">
          <button
            className="btn btn-secondary btn-size-sm"
            onClick={() => habilitarMutation.mutate()}
            disabled={habilitarMutation.isPending}
          >
            {habilitarMutation.isPending ? 'Procesando…' : 'Habilitar / Reparar'}
          </button>
        </Permitido>

        {resultado && Object.values(resultado).some(Boolean) && (
          <div className="fields-grid" style={{ marginTop: 14 }}>
            <ResultadoFarmacia label="Cuenta CxC ARS provisional" valor={resultado.cuentaCxcArsProvisional} />
            <ResultadoFarmacia label='Modo de pago "Cobertura ARS"' valor={resultado.modoPagoCoberturaArs} />
            <ResultadoFarmacia label='Grupo de clientes "ARS"' valor={resultado.customerGroupArs} />
            <ResultadoFarmacia label="Ítem de cobertura del lote" valor={resultado.itemCoberturaLote} />
            <ResultadoFarmacia label="Rol dispensador de controlados" valor={resultado.rolDispensadorControlados} />
            <ResultadoFarmacia label="Plantilla de factura" valor={resultado.plantillaFactura} />
          </div>
        )}
      </div>
    </div>
  )
}

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

  const formIsDirty = useDirtyCheck({ formName, formPriceTier }, showForm)
  const formClose = useConfirmClose(formIsDirty, () => setShowForm(false))

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
        <div className="modal-overlay" onClick={formClose.requestClose}>
          <div className="modal-box modal-box-sm" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <h2 className="modal-title">Nuevo Grupo</h2>
              <button className="modal-close" onClick={formClose.requestClose}><X size={16} /></button>
            </div>
            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div className="ff-wrap">
                <label className="ff-label ff-required">Nombre</label>
                <input className="ff-input" value={formName} onChange={(e) => setFormName(e.target.value)} placeholder="Ej: Mayoristas" />
              </div>
              <div className="ff-wrap">
                <label className="ff-label">Nivel de precio por defecto</label>
                <Select value={formPriceTier} onValueChange={setFormPriceTier}>
                  {PRICE_TIER_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                </Select>
                <p style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 4 }}>
                  Los clientes de este grupo usarán este nivel de precio al crear cotizaciones/facturas.
                </p>
              </div>
            </div>
            <div className="modal-foot">
              <button className="btn btn-secondary" onClick={formClose.requestClose}>Cancelar</button>
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
      <ConfirmModal
        open={formClose.confirming}
        onClose={formClose.cancelDiscard}
        onConfirm={formClose.confirmDiscard}
        title="¿Descartar cambios?"
        description="Tienes cambios sin guardar en este formulario. Si continúas, se perderán."
        confirmLabel="Descartar cambios"
        variant="danger"
      />

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

const ALL_FORMATOS_IMPRESION: FormatoImpresion[] = ['a4', 'carta', 'a6', 'pos']
const FORMATO_IMPRESION_LABELS: Record<FormatoImpresion, string> = {
  a4: 'Página completa — A4',
  carta: 'Página completa — Carta',
  a6: 'Página completa — A6',
  pos: 'Ticket POS (80mm)',
}

// ---- Facturación Config Section ----
function FacturacionConfigSection() {
  const queryClient = useQueryClient()
  const { data, isLoading } = useQuery({ queryKey: ['facturacion-config'], queryFn: getFacturacionConfig })
   const { data: roles } = useQuery({ queryKey: ['roles'], queryFn: listRoles, staleTime: 5 * 60_000 })
   const { data: almacenes } = useQuery({ queryKey: ['almacenes-all'], queryFn: () => listAlmacenes(), staleTime: 5 * 60_000 })
   const { data: metodosPago } = useQuery({ queryKey: ['metodos-pago-config'], queryFn: listMetodosPago, staleTime: 5 * 60_000 })
   const { data: plantillasVentas } = useQuery({ queryKey: ['impuestos-ventas'], queryFn: listImpuestosVentas, staleTime: 5 * 60_000 })
   const { data: plantillasCompras } = useQuery({ queryKey: ['impuestos-compras'], queryFn: listImpuestosCompras, staleTime: 5 * 60_000 })
  const [selectedRoles, setSelectedRoles] = useState<string[]>([])
  const [posWarehouseSearch, setPosWarehouseSearch] = useState('')
  const posWarehouseOptions: SearchSelectOption[] = (almacenes ?? [])
    .filter((a) => !a.disabled)
    .filter((a) => !posWarehouseSearch || a.name.toLowerCase().includes(posWarehouseSearch.toLowerCase()))
    .map((a) => ({ value: a.id, label: a.name }))
  const [modoPagoCajaSearch, setModoPagoCajaSearch] = useState('')
  const modoPagoCajaOptions: SearchSelectOption[] = (metodosPago ?? [])
    .filter((m) => !modoPagoCajaSearch || m.name.toLowerCase().includes(modoPagoCajaSearch.toLowerCase()))
    .map((m) => ({ value: m.name, label: m.name }))
  const [modoPagoCajaUsdSearch, setModoPagoCajaUsdSearch] = useState('')
  const modoPagoCajaUsdOptions: SearchSelectOption[] = (metodosPago ?? [])
    .filter((m) => !modoPagoCajaUsdSearch || m.name.toLowerCase().includes(modoPagoCajaUsdSearch.toLowerCase()))
    .map((m) => ({ value: m.name, label: m.name }))
  const [modoPagoCajaEurSearch, setModoPagoCajaEurSearch] = useState('')
  const modoPagoCajaEurOptions: SearchSelectOption[] = (metodosPago ?? [])
    .filter((m) => !modoPagoCajaEurSearch || m.name.toLowerCase().includes(modoPagoCajaEurSearch.toLowerCase()))
    .map((m) => ({ value: m.name, label: m.name }))
  const [flujoCobro, setFlujoCobro] = useState<'directo' | 'caja'>('directo')
  const [requiereUbicacionVenta, setRequiereUbicacionVenta] = useState(false)
  const [requiereSerialLoteCompra, setRequiereSerialLoteCompra] = useState(false)
  const [actualizarCostoEnCompra, setActualizarCostoEnCompra] = useState(true)
  const [usaDepartamentos, setUsaDepartamentos] = useState(true)
  const [usaImpuestoDocumento, setUsaImpuestoDocumento] = useState(true)
  const [plantillaImpuestoVentasDefault, setPlantillaImpuestoVentasDefault] = useState('')
  const [plantillaImpuestoComprasDefault, setPlantillaImpuestoComprasDefault] = useState('')
  const [showPosActivar, setShowPosActivar] = useState(false)
  const [posWarehouse, setPosWarehouse] = useState('')
  const [showDeshabilitarPosConfirm, setShowDeshabilitarPosConfirm] = useState(false)
  const [posBloqueos, setPosBloqueos] = useState<PosDeshabilitarBloqueos | null>(null)
  const [showDeshabilitarDespachoConfirm, setShowDeshabilitarDespachoConfirm] = useState(false)
  const [despachoBloqueos, setDespachoBloqueos] = useState<DesactivarDespachoBloqueos | null>(null)
  const [despachoFuturoHabilitado, setDespachoFuturoHabilitado] = useState(true)
  const [despachoFuturoBloqueaVenta, setDespachoFuturoBloqueaVenta] = useState(true)
  const [despachoConfirmarStockAsignaSeriales, setDespachoConfirmarStockAsignaSeriales] = useState(false)
   const [pedidoRequiereConfirmacionDespacho, setPedidoRequiereConfirmacionDespacho] = useState(false)
   const [pedidoConduceIncluyePrecios, setPedidoConduceIncluyePrecios] = useState(true)
   const [arqueoEfectivoRequerido, setArqueoEfectivoRequerido] = useState(false)
   const [formatoImpresionDefault, setFormatoImpresionDefault] = useState<FormatoImpresion>("a4")
   const [formatosPermitidos, setFormatosPermitidos] = useState<FormatoImpresion[]>(ALL_FORMATOS_IMPRESION)
    const [turnoMaxHoras, setTurnoMaxHoras] = useState(24)
   const [ncfAlertaMinimo, setNcfAlertaMinimo] = useState(50)
   const [modoPagoCaja, setModoPagoCaja] = useState<string | null>(null)
   const [modoPagoCajaUsd, setModoPagoCajaUsd] = useState<string | null>(null)
   const [modoPagoCajaEur, setModoPagoCajaEur] = useState<string | null>(null)
   const [modosPagoConciliar, setModosPagoConciliar] = useState<string[]>([])
   const [rolesCierreCajaAjena, setRolesCierreCajaAjena] = useState<string[]>([])
   const [redondearTotales, setRedondearTotales] = useState(true)
   const [tasaFijaCxc, setTasaFijaCxc] = useState(false)
   const [tasaFijaCxp, setTasaFijaCxp] = useState(false)
   const [permitirPagoMonedaDistintaBanco, setPermitirPagoMonedaDistintaBanco] = useState(false)
   const [tasasActualizacionAutomatica, setTasasActualizacionAutomatica] = useState(false)
   const [tasasHoraActualizacion, setTasasHoraActualizacion] = useState('06:00')
   const [tasasProveedor, setTasasProveedor] = useState<'Banco Central RD' | 'Currency Exchange Settings'>('Banco Central RD')

   useEffect(() => {
     if (data) {
       setSelectedRoles(data.rolesCancelacionFactura ?? [])
       setFlujoCobro(data.flujoCobro ?? "directo")
       setRequiereUbicacionVenta(data.requiereUbicacionVenta ?? false)
       setRequiereSerialLoteCompra(data.requiereSerialLoteCompra ?? false)
       setActualizarCostoEnCompra(data.actualizarCostoEnCompra ?? true)
       setUsaDepartamentos(data.usaDepartamentos ?? true)
       setUsaImpuestoDocumento(data.usaImpuestoDocumento ?? true)
       setPlantillaImpuestoVentasDefault(data.plantillaImpuestoVentasDefault ?? '')
       setPlantillaImpuestoComprasDefault(data.plantillaImpuestoComprasDefault ?? '')
        setDespachoFuturoHabilitado(data.despachoFuturoHabilitado ?? true)
        setDespachoFuturoBloqueaVenta(data.despachoFuturoBloqueaVenta ?? true)
        setDespachoConfirmarStockAsignaSeriales(data.despachoConfirmarStockAsignaSeriales ?? false)
        setPedidoRequiereConfirmacionDespacho(data.pedidoRequiereConfirmacionDespacho ?? false)
        setPedidoConduceIncluyePrecios(data.pedidoConduceIncluyePrecios ?? true)
        setArqueoEfectivoRequerido(data.arqueoEfectivoRequerido ?? false)
        setFormatoImpresionDefault(data.formatoImpresionDefault ?? "a4")
        setFormatosPermitidos(data.formatosPermitidos && data.formatosPermitidos.length > 0 ? data.formatosPermitidos : ALL_FORMATOS_IMPRESION)
        setTurnoMaxHoras(data.turnoMaxHoras ?? 24)
        setNcfAlertaMinimo(data.ncfAlertaMinimo ?? 50)
        setModoPagoCaja(data.modoPagoCaja ?? null)
        setModoPagoCajaUsd(data.modoPagoCajaUsd ?? null)
        setModoPagoCajaEur(data.modoPagoCajaEur ?? null)
        setModosPagoConciliar(data.modosPagoConciliar ?? [])
        setRolesCierreCajaAjena(data.rolesCierreCajaAjena ?? [])
        setRedondearTotales(!(data.redondeoTotalDeshabilitado ?? false))
        setTasaFijaCxc(data.tasaFijaCxc ?? false)
        setTasaFijaCxp(data.tasaFijaCxp ?? false)
        setPermitirPagoMonedaDistintaBanco(data.permitirPagoMonedaDistintaBanco ?? false)
        setTasasActualizacionAutomatica(data.tasasActualizacionAutomatica ?? false)
        setTasasHoraActualizacion(data.tasasHoraActualizacion ?? '06:00')
        setTasasProveedor(data.tasasProveedor ?? 'Banco Central RD')
      }
    }, [data])

   // undefined = nunca se guardó explícitamente -> preseleccionar la plantilla que ya viene
   // isDefault:true en ERPNext. null = el usuario la borró a propósito -> respetar "sin plantilla".
   // No depende del estado local del selector para no pelear con un borrado que el usuario
   // todavía no ha guardado.
   useEffect(() => {
     if (data && data.plantillaImpuestoVentasDefault === undefined) {
       const actual = plantillasVentas?.find((t) => t.isDefault)
       if (actual) setPlantillaImpuestoVentasDefault(actual.id)
     }
   }, [data, plantillasVentas])

   useEffect(() => {
     if (data && data.plantillaImpuestoComprasDefault === undefined) {
       const actual = plantillasCompras?.find((t) => t.isDefault)
       if (actual) setPlantillaImpuestoComprasDefault(actual.id)
     }
   }, [data, plantillasCompras])

   function toggleFormatoPermitido(formato: FormatoImpresion) {
     setFormatosPermitidos((prev) => {
       const next = prev.includes(formato) ? prev.filter((f) => f !== formato) : [...prev, formato]
       if (next.length === 0) return prev
       if (!next.includes(formatoImpresionDefault)) {
         setFormatoImpresionDefault(next[0])
       }
       return next
     })
   }

   const saveMutation = useMutation({
     mutationFn: (dto: Partial<FacturacionConfig>) => updateFacturacionConfig(dto),
     onSuccess: () => {
       toast.success('Configuración de facturación actualizada')
       queryClient.invalidateQueries({ queryKey: ['facturacion-config'] })
     },
     onError: (err: ApiError) => {
       toast.error(err?.message ?? 'Error al guardar')
     },
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

  const deshabilitarPosMutation = useMutation({
    mutationFn: () => deshabilitarPos(),
    onSuccess: () => {
      toast.success('Módulo POS desactivado')
      setShowDeshabilitarPosConfirm(false)
      queryClient.invalidateQueries({ queryKey: ['facturacion-config'] })
    },
    onError: (err: ApiError) => {
      setShowDeshabilitarPosConfirm(false)
      if (err?.statusCode === 409 && err.details) {
        setPosBloqueos(err.details as unknown as PosDeshabilitarBloqueos)
        return
      }
      toast.error(err?.message ?? 'Error al desactivar el módulo POS')
    },
  })

  // Idempotente del lado servidor — no hace falta lógica extra si el usuario hace doble click.
  const habilitarDespachoMutation = useMutation({
    mutationFn: () => habilitarDespacho(),
    onSuccess: (res) => {
      toast.success(res.message)
      queryClient.invalidateQueries({ queryKey: ['facturacion-config'] })
    },
    onError: (err: ApiError) => toast.error(err?.message ?? 'Error al activar el despacho'),
  })

  const deshabilitarDespachoMutation = useMutation({
    mutationFn: () => deshabilitarDespacho(),
    onSuccess: (res) => {
      toast.success(res.message)
      setShowDeshabilitarDespachoConfirm(false)
      queryClient.invalidateQueries({ queryKey: ['facturacion-config'] })
    },
    onError: (err: ApiError) => {
      setShowDeshabilitarDespachoConfirm(false)
      if (err?.statusCode === 409 && err.details) {
        setDespachoBloqueos(err.details as unknown as DesactivarDespachoBloqueos)
        return
      }
      toast.error(err?.message ?? 'Error al desactivar el despacho')
    },
  })

  // Los 3 campos son independientes — mandar solo los que el usuario tocó respecto al último
  // valor conocido del servidor (§2.1: el backend responde 400 si no se manda ninguno).
  const actualizarDespachoFuturoMutation = useMutation({
    mutationFn: (dto: UpdateDespachoFuturoDto) => actualizarDespachoFuturo(dto),
    onSuccess: () => {
      toast.success('Configuración de despacho a futuro actualizada')
      queryClient.invalidateQueries({ queryKey: ['facturacion-config'] })
    },
    onError: (err: ApiError) => toast.error(err?.message ?? 'Error al guardar la configuración de despacho a futuro'),
  })

  const despachoFuturoDirty = !!data && (
    despachoFuturoHabilitado !== (data.despachoFuturoHabilitado ?? true) ||
    despachoFuturoBloqueaVenta !== (data.despachoFuturoBloqueaVenta ?? true) ||
    despachoConfirmarStockAsignaSeriales !== (data.despachoConfirmarStockAsignaSeriales ?? false)
  )

  function guardarDespachoFuturo() {
    if (!data) return
    const dto: UpdateDespachoFuturoDto = {}
    if (despachoFuturoHabilitado !== (data.despachoFuturoHabilitado ?? true)) dto.futuroHabilitado = despachoFuturoHabilitado
    if (despachoFuturoBloqueaVenta !== (data.despachoFuturoBloqueaVenta ?? true)) dto.futuroBloqueaVenta = despachoFuturoBloqueaVenta
    if (despachoConfirmarStockAsignaSeriales !== (data.despachoConfirmarStockAsignaSeriales ?? false)) dto.confirmarStockAsignaSeriales = despachoConfirmarStockAsignaSeriales
    actualizarDespachoFuturoMutation.mutate(dto)
  }

  if (isLoading) return <span className="skeleton-box" style={{ height: 200, display: 'block' }} />

  function toggleRole(name: string) {
    setSelectedRoles((prev) => (prev.includes(name) ? prev.filter((r) => r !== name) : [...prev, name]))
  }

  function toggleCierreCajaAjenaRole(name: string) {
    setRolesCierreCajaAjena((prev) => (prev.includes(name) ? prev.filter((r) => r !== name) : [...prev, name]))
  }

  return (
    <div className="card">
      <div className="card-header">
        <span className="card-title">Configuración de Facturación</span>
      </div>
      <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        <div className="ff-wrap">
          <label className="ff-label">
            Flujo de cobro al someter
            <FieldTooltip>
              "Directo": se cobra con un solo método de pago, sin vuelto (comportamiento histórico). "Caja": habilita
              cobrar con múltiples métodos de pago simultáneos y el registro opcional de vuelto.
            </FieldTooltip>
          </label>
          <div style={{ maxWidth: 240 }}>
            <Select value={flujoCobro} onValueChange={(val) => setFlujoCobro(val as 'directo' | 'caja')}>
              <SelectItem value="directo">Directo</SelectItem>
              <SelectItem value="caja">Caja</SelectItem>
            </Select>
          </div>
        </div>
        <div className="ff-wrap">
          <label className="ff-label">
            Roles autorizados para cancelar facturas sometidas
            <FieldTooltip>Solo usuarios con alguno de estos roles pueden cancelar una factura ya sometida (con NCF asignado).</FieldTooltip>
          </label>
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
                <label key={role.id} className="ff-check-wrap">
                  <input
                    type="checkbox"
                    className="ff-check"
                    checked={selectedRoles.includes(role.id)}
                    onChange={() => toggleRole(role.id)}
                  />
                  <span style={{ fontSize: 13 }}>{role.label}</span>
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
            <span style={{ fontSize: 13 }}>
              Requiere Ubicación para Vender
              <FieldTooltip>
                Si está activo, no se podrá vender un artículo de inventario si no tiene una Ubicación asignada dentro
                del almacén desde el cual se factura.
              </FieldTooltip>
            </span>
          </label>
        </div>

        <div className="ff-wrap">
          <label className="ff-check-wrap">
            <input
              type="checkbox"
              className="ff-check"
              checked={requiereSerialLoteCompra}
              onChange={(e) => setRequiereSerialLoteCompra(e.target.checked)}
            />
            <span style={{ fontSize: 13 }}>
              Requiere Serial/Lote al Comprar
              <FieldTooltip>
                Si está activo, al comprar un artículo con tracking de serial/lote se exige capturar los mismos en la
                línea de compra, y al vender solo se podrá elegir un serial/lote que ya exista en el sistema. Si está
                inactivo, la captura es opcional al comprar y se puede crear un serial/lote nuevo automáticamente al vender.
              </FieldTooltip>
            </span>
          </label>
        </div>

        <div className="ff-wrap">
          <label className="ff-check-wrap">
            <input
              type="checkbox"
              className="ff-check"
              checked={actualizarCostoEnCompra}
              onChange={(e) => setActualizarCostoEnCompra(e.target.checked)}
            />
            <span style={{ fontSize: 13 }}>
              Actualizar costo del artículo al comprar
              <FieldTooltip>
                Si está activo, cada compra sometida actualiza el "Costo de Valoración" del artículo con el precio de esa
                compra. Si lo desactivas, el costo se mantiene fijo hasta que lo edites manualmente — útil si preferís
                controlar el costo de tus artículos a mano en vez de que se mueva con cada compra. No afecta el precio de
                venta en modo "Sobre Costo": ese sigue recalculándose con cada compra sin importar este ajuste. Un
                artículo puntual puede tener su propia excepción a esta regla desde su ficha (Catálogo).
              </FieldTooltip>
            </span>
          </label>
        </div>

        <div className="ff-wrap">
          <label className="ff-check-wrap">
            <input
              type="checkbox"
              className="ff-check"
              checked={usaDepartamentos}
              onChange={(e) => setUsaDepartamentos(e.target.checked)}
            />
            <span style={{ fontSize: 13 }}>
              Usar Departamentos
              <FieldTooltip>
                Si está desactivado, se oculta el selector de Departamento (opcional) en los formularios de Factura,
                Cotización, Pedido, Cobro, Compra y Gasto. No afecta documentos ya guardados con un departamento asignado.
              </FieldTooltip>
            </span>
          </label>
        </div>

        <div className="ff-wrap">
          <label className="ff-check-wrap">
            <input
              type="checkbox"
              className="ff-check"
              checked={usaImpuestoDocumento}
              onChange={(e) => setUsaImpuestoDocumento(e.target.checked)}
            />
            <span style={{ fontSize: 13 }}>
              Permitir Impuesto de Documento
              <FieldTooltip>
                Si está desactivado, se oculta el selector de plantilla de Impuesto de Documento en Factura, Cotización
                y Compra. No afecta documentos ya guardados con una plantilla asignada.
              </FieldTooltip>
            </span>
          </label>
        </div>

        <div className="ff-wrap">
          <label className="ff-check-wrap">
            <input
              type="checkbox"
              className="ff-check"
              checked={redondearTotales}
              onChange={(e) => setRedondearTotales(e.target.checked)}
            />
            <span style={{ fontSize: 13 }}>
              Redondear totales a la unidad
              <FieldTooltip>
                Si está activo (default), el total con centavos de cada factura/compra se redondea al peso más cercano
                y ese es el monto que se cobra o queda pendiente (ej. RD$168.57 se cobra como RD$169.00) — pensado para
                ventas en efectivo, que no manejan centavos físicos. Si se desactiva, se cobra el monto exacto con
                centavos — más apropiado si el negocio solo cobra con tarjeta, cheque o transferencia. Cambiarlo no
                afecta facturas o compras ya sometidas, solo las que se sometan después de guardar.
              </FieldTooltip>
            </span>
          </label>
        </div>

        <div className="form-row">
          <div className="ff-wrap">
            <label className="ff-label">
              Plantilla de Impuesto — Ventas (default)
              <FieldTooltip>
                Plantilla que aplican Factura, Cotización y Pedido de Venta cuando no se especifica una explícitamente.
                Se generan y gestionan desde "Tasas de Impuesto".
              </FieldTooltip>
            </label>
            <Select value={plantillaImpuestoVentasDefault} onValueChange={setPlantillaImpuestoVentasDefault} placeholder="Seleccionar…">
              <SelectItem value="">Sin plantilla</SelectItem>
              {(plantillasVentas ?? []).map((t) => <SelectItem key={t.id} value={t.id}>{t.title}</SelectItem>)}
            </Select>
          </div>
          <div className="ff-wrap">
            <label className="ff-label">
              Plantilla de Impuesto — Compras (default)
              <FieldTooltip>
                Plantilla que aplican Compra y Gasto cuando no se especifica una explícitamente.
                Se generan y gestionan desde "Tasas de Impuesto".
              </FieldTooltip>
            </label>
            <Select value={plantillaImpuestoComprasDefault} onValueChange={setPlantillaImpuestoComprasDefault} placeholder="Seleccionar…">
              <SelectItem value="">Sin plantilla</SelectItem>
              {(plantillasCompras ?? []).map((t) => <SelectItem key={t.id} value={t.id}>{t.title}</SelectItem>)}
            </Select>
          </div>
        </div>

        <div className="ff-wrap" style={{ borderTop: '1px solid var(--border-default)', paddingTop: 16 }}>
          <label className="ff-label">Módulo POS</label>
          <p className="ff-hint" style={{ marginBottom: 8 }}>
            Permite abrir turnos de caja y cobrar ventas al contado con pago parcial sin crear un Payment Entry
            aparte. Es opcional — si no se activa, todo sigue funcionando igual que hoy.
          </p>

          {data?.usaModuloPos ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'flex-start' }}>
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
              <Permitido accion="config.pos.deshabilitar">
                <button className="btn btn-secondary btn-size-sm" onClick={() => setShowDeshabilitarPosConfirm(true)}>
                  Desactivar módulo POS
                </button>
              </Permitido>
            </div>
          ) : !showPosActivar ? (
            <button className="btn btn-secondary btn-size-sm" onClick={() => setShowPosActivar(true)}>
              Activar módulo POS
            </button>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxWidth: 320 }}>
              <div className="ff-wrap">
                <label className="ff-label">Almacén por defecto para el POS</label>
                <SearchSelect
                  value={posWarehouse}
                  onChange={setPosWarehouse}
                  options={posWarehouseOptions}
                  onSearch={setPosWarehouseSearch}
                  selectedLabel={(almacenes ?? []).find((a) => a.id === posWarehouse)?.name ?? ''}
                  placeholder="Seleccionar almacén"
                />
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

        <div className="ff-wrap" style={{ borderTop: '1px solid var(--border-default)', paddingTop: 16 }}>
          <label className="ff-label">Despacho (Delivery Note)</label>
          <p className="ff-hint" style={{ marginBottom: 8 }}>
            Separa la entrega física de inventario de la factura. Al activarlo, las facturas nuevas
            dejan de descontar inventario; la salida física se registra con un despacho (Delivery Note).
          </p>

          {data?.despachoHabilitado ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'flex-start' }}>
              <div className="inline-alert inline-alert-success" style={{ alignItems: 'flex-start' }}>
                <span>Despacho activado.</span>
              </div>
              <Permitido accion="config.despacho.deshabilitar">
                <button className="btn btn-secondary btn-size-sm" onClick={() => setShowDeshabilitarDespachoConfirm(true)}>
                  Desactivar
                </button>
              </Permitido>

              <Permitido accion="config.despacho.configurar">
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 4, width: '100%' }}>
                  <div className="ff-wrap">
                    <label className="ff-check-wrap">
                      <input
                        type="checkbox"
                        className="ff-check"
                        checked={despachoFuturoHabilitado}
                        onChange={(e) => setDespachoFuturoHabilitado(e.target.checked)}
                      />
                      <span style={{ fontSize: 13, fontWeight: 600 }}>
                        Permitir despacho a futuro
                        <FieldTooltip>
                          Si está activo, al facturar se puede elegir despachar ahora o después. Si está apagado, toda
                          venta nueva se despacha de inmediato (se confirma que exista stock físico antes de facturar).
                        </FieldTooltip>
                      </span>
                    </label>
                  </div>

                  <div className="ff-wrap" style={{ opacity: despachoFuturoHabilitado ? 1 : 0.5 }}>
                    <label className="ff-check-wrap">
                      <input
                        type="checkbox"
                        className="ff-check"
                        checked={despachoFuturoBloqueaVenta}
                        disabled={!despachoFuturoHabilitado}
                        onChange={(e) => setDespachoFuturoBloqueaVenta(e.target.checked)}
                      />
                      <span style={{ fontSize: 13, fontWeight: 600 }}>
                        El despacho a futuro reserva el stock
                        <FieldTooltip>
                          Si está activo, mientras una venta a futuro no se despache, esas unidades no se le pueden
                          vender a otro cliente. Si está apagado, la venta a futuro queda solo como una promesa — el
                          mismo stock sigue disponible para cualquier otro cliente hasta que alguien lo despache primero.
                        </FieldTooltip>
                      </span>
                    </label>
                  </div>

                  {/* Sin atenuar por despachoFuturoHabilitado: este switch controla las ventas
                      INMEDIATAS (§4.2 del prompt) — son todas las ventas cuando el despacho a
                      futuro está apagado, así que acá es donde más importa, no menos. */}
                  <div className="ff-wrap">
                    <label className="ff-check-wrap">
                      <input
                        type="checkbox"
                        className="ff-check"
                        checked={despachoConfirmarStockAsignaSeriales}
                        onChange={(e) => setDespachoConfirmarStockAsignaSeriales(e.target.checked)}
                      />
                      <span style={{ fontSize: 13, fontWeight: 600 }}>
                        Auto-asignar seriales/lotes al confirmar stock
                        <FieldTooltip>
                          Solo aplica a ventas inmediatas (no a futuro). Si está activo, al someter la factura el
                          sistema elige automáticamente los seriales/lotes disponibles. Si está apagado (recomendado si
                          necesitás elegir manualmente cuál unidad exacta se vende), hay que asignarlos a mano antes de
                          someter.
                        </FieldTooltip>
                      </span>
                    </label>
                  </div>

                  <button
                    className="btn btn-navy btn-size-sm"
                    onClick={guardarDespachoFuturo}
                    disabled={!despachoFuturoDirty || actualizarDespachoFuturoMutation.isPending}
                  >
                    {actualizarDespachoFuturoMutation.isPending ? 'Guardando…' : 'Guardar'}
                  </button>
                </div>
              </Permitido>
            </div>
          ) : (
            <Permitido accion="config.despacho.habilitar">
              <button
                className="btn btn-secondary btn-size-sm"
                onClick={() => habilitarDespachoMutation.mutate()}
                disabled={habilitarDespachoMutation.isPending}
              >
                {habilitarDespachoMutation.isPending ? 'Activando…' : 'Activar'}
              </button>
            </Permitido>
          )}
        </div>

        <div className="ff-wrap" style={{ borderTop: '1px solid var(--border-default)', paddingTop: 16 }}>
          <label className="ff-label">Pedidos</label>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div>
              <label className="ff-check-wrap" style={{ opacity: data?.despachoHabilitado ? 1 : 0.5 }}>
                <input
                  type="checkbox"
                  className="ff-check"
                  checked={pedidoRequiereConfirmacionDespacho}
                  disabled={!data?.despachoHabilitado}
                  onChange={(e) => setPedidoRequiereConfirmacionDespacho(e.target.checked)}
                />
                <span style={{ fontSize: 13, fontWeight: 600 }}>
                  Pedido requiere confirmación de despacho
                  <FieldTooltip>
                    {data?.despachoHabilitado
                      ? 'Un pedido inmediato (no apartado, no despacho a futuro) no se puede facturar sin que despacho confirme antes la existencia física de los artículos.'
                      : 'Requiere el módulo de Despacho activado arriba.'}
                  </FieldTooltip>
                </span>
              </label>
            </div>
            <div>
              <label className="ff-check-wrap">
                <input
                  type="checkbox"
                  className="ff-check"
                  checked={pedidoConduceIncluyePrecios}
                  onChange={(e) => setPedidoConduceIncluyePrecios(e.target.checked)}
                />
                <span style={{ fontSize: 13, fontWeight: 600 }}>
                  Conduce incluye precios
                  <FieldTooltip>
                    Si está apagado, el PDF del Pedido omite columnas de precio/ITBIS/total y la sección de
                    totales — queda como un conduce sin montos (descripción, cantidad, nota).
                  </FieldTooltip>
                </span>
              </label>
            </div>
          </div>
        </div>

        {data?.usaModuloPos && (
          <div className="ff-wrap">
            <label className="ff-check-wrap">
              <input
                type="checkbox"
                className="ff-check"
                checked={arqueoEfectivoRequerido}
                onChange={(e) => setArqueoEfectivoRequerido(e.target.checked)}
              />
              <span style={{ fontSize: 13 }}>
                Arqueo de efectivo obligatorio al cerrar turno
                <FieldTooltip>
                  Si está activo, el cajero debe contar y desglosar las denominaciones de efectivo (billetes/monedas) al cerrar su turno;
                  si falta, el sistema rechaza el cierre.
                </FieldTooltip>
              </span>
            </label>
           </div>
         )}

         <div style={{ display: 'flex', flexWrap: 'wrap', gap: 24 }}>
           <div className="ff-wrap" style={{ maxWidth: 320 }}>
               <label className="ff-label">
                 Método de Pago Default (DOP)
                 <FieldTooltip>
                   {data?.usaModuloPos
                     ? 'Se usa para comparar el efectivo físico en caja al cerrar turno, y como método de pago por defecto al cobrar una factura en pesos si no se especifica ninguno.'
                     : 'Método de pago que se usa por defecto al cobrar una factura en pesos si no se especifica ninguno.'}
                 </FieldTooltip>
               </label>
               <SearchSelect
                 value={modoPagoCaja ?? ''}
                 onChange={(val) => setModoPagoCaja(val || null)}
                 options={modoPagoCajaOptions}
                 onSearch={setModoPagoCajaSearch}
                 selectedLabel={modoPagoCaja ?? ''}
                 placeholder="No configurado"
               />
             </div>

             {data?.monedasHabilitadas?.includes('USD') && (
               <div className="ff-wrap" style={{ maxWidth: 320 }}>
                 <label className="ff-label">
                   Método de Pago Default (USD)
                   <FieldTooltip>
                     Método de pago que se usa por defecto al cobrar una factura en dólares si no se
                     especifica ninguno. Opcional — si no se configura, hay que elegir el método de pago
                     manualmente en cada cobro en USD.
                   </FieldTooltip>
                 </label>
                 <SearchSelect
                   value={modoPagoCajaUsd ?? ''}
                   onChange={(val) => setModoPagoCajaUsd(val || null)}
                   options={modoPagoCajaUsdOptions}
                   onSearch={setModoPagoCajaUsdSearch}
                   selectedLabel={modoPagoCajaUsd ?? ''}
                   placeholder="No configurado"
                 />
               </div>
             )}

             {data?.monedasHabilitadas?.includes('EUR') && (
               <div className="ff-wrap" style={{ maxWidth: 320 }}>
                 <label className="ff-label">
                   Método de Pago Default (EUR)
                   <FieldTooltip>
                     Método de pago que se usa por defecto al cobrar una factura en euros si no se
                     especifica ninguno. Opcional — si no se configura, hay que elegir el método de pago
                     manualmente en cada cobro en EUR.
                   </FieldTooltip>
                 </label>
                 <SearchSelect
                   value={modoPagoCajaEur ?? ''}
                   onChange={(val) => setModoPagoCajaEur(val || null)}
                   options={modoPagoCajaEurOptions}
                   onSearch={setModoPagoCajaEurSearch}
                   selectedLabel={modoPagoCajaEur ?? ''}
                   placeholder="No configurado"
                 />
               </div>
             )}
            </div>

          {data?.usaModuloPos && (
            <div className="ff-wrap">
              <label className="ff-label">
                Métodos de pago a conciliar
                <FieldTooltip>
                  Métodos de pago que requieren que el cajero ingrese el monto contado al cerrar el turno.
                  Si no se selecciona ninguno, el backend usa por defecto los métodos de tipo efectivo.
                </FieldTooltip>
              </label>
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
                {(metodosPago ?? []).length === 0 ? (
                  <p style={{ fontSize: 13, color: 'var(--text-tertiary)', gridColumn: '1 / -1' }}>
                    No hay métodos de pago disponibles.
                  </p>
                ) : (
                  (metodosPago ?? []).map((m) => (
                    <label key={m.name} className="ff-check-wrap">
                      <input
                        type="checkbox"
                        className="ff-check"
                        checked={modosPagoConciliar.includes(m.name)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setModosPagoConciliar((prev) => [...prev, m.name])
                          } else {
                            setModosPagoConciliar((prev) => prev.filter((n) => n !== m.name))
                          }
                        }}
                      />
                      <span style={{ fontSize: 13 }}>{m.name}</span>
                    </label>
                  ))
                )}
              </div>
            </div>
          )}

 {data?.usaModuloPos && (
           <div className="ff-wrap">
             <label className="ff-label">
               Máximo de horas por turno de caja
               <FieldTooltip>
                 El turno se bloqueará automáticamente al superar este límite. El cajero deberá cerrar y abrir uno nuevo.
                 Valor 0.1 equivale a 6 minutos. Default: 24 horas.
               </FieldTooltip>
             </label>
<div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <input
                  type="number"
                  min={0.1}
                  step={0.1}
                  className="ff-input"
                  style={{ width: 120 }}
                  value={turnoMaxHoras}
                  onChange={(e) => setTurnoMaxHoras(parseFloat(e.target.value) || 0.1)}
                />
                <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>horas</span>
              </div>
            </div>
          )}

         {data?.usaModuloPos && (
           <div className="ff-wrap">
             <label className="ff-label">
               Roles autorizados para cerrar cajas de otros usuarios
               <FieldTooltip>
                 Solo usuarios con alguno de estos roles pueden cerrar el turno de OTRO cajero
                 (mismas validaciones que cerrar el propio turno). Si esta lista queda vacía, nadie puede cerrar
                 turnos ajenos — es el comportamiento por defecto.
               </FieldTooltip>
             </label>
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
                   <label key={role.id} className="ff-check-wrap">
                     <input
                       type="checkbox"
                       className="ff-check"
                       checked={rolesCierreCajaAjena.includes(role.id)}
                       onChange={() => toggleCierreCajaAjenaRole(role.id)}
                     />
                     <span style={{ fontSize: 13 }}>{role.label}</span>
                   </label>
                 ))
               )}
             </div>
             {rolesCierreCajaAjena.length === 0 && (
               <p className="ff-hint" style={{ marginTop: 6, color: 'var(--color-warning)' }}>
                 Sin roles seleccionados: ningún usuario podrá cerrar el turno de otro cajero.
               </p>
             )}
           </div>
         )}

         <div className="ff-wrap">
          <label className="ff-label">
            Formatos de impresión habilitados
            <FieldTooltip>Formatos que estarán disponibles al generar el PDF de una factura, cobro o compra. Mínimo uno.</FieldTooltip>
          </label>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {ALL_FORMATOS_IMPRESION.map((formato) => (
              <label key={formato} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer', userSelect: 'none' }}>
                <input
                  type="checkbox"
                  checked={formatosPermitidos.includes(formato)}
                  onChange={() => toggleFormatoPermitido(formato)}
                />
                {FORMATO_IMPRESION_LABELS[formato]}
              </label>
            ))}
          </div>
        </div>

        <div className="ff-wrap">
           <label className="ff-label">
            Formato de impresión default
            <FieldTooltip>Cuál de los formatos habilitados se usa cuando no se pide uno explícito al generar el PDF de una factura, cobro o compra.</FieldTooltip>
          </label>
          <div style={{ maxWidth: 240 }}>
            <Select
              value={formatoImpresionDefault}
              onValueChange={(val) => setFormatoImpresionDefault(val as FormatoImpresion)}
            >
              {ALL_FORMATOS_IMPRESION.filter((f) => formatosPermitidos.includes(f)).map((formato) => (
                <SelectItem key={formato} value={formato}>{FORMATO_IMPRESION_LABELS[formato]}</SelectItem>
              ))}
            </Select>
          </div>
        </div>

        <div className="ff-wrap">
          <label className="ff-label">
            Mínimo de comprobantes para alertar
            <FieldTooltip>
              Cuando a una secuencia NCF le queden este número de comprobantes o menos, se marcará como "por agotarse"
              en la pantalla de Secuencias NCF y, si está activo, se enviará un correo automático. Default: 50.
            </FieldTooltip>
          </label>
          <input
            type="number"
            min={0}
            step={1}
            className="ff-input"
            style={{ width: 120 }}
            value={ncfAlertaMinimo}
            onChange={(e) => setNcfAlertaMinimo(Math.max(0, parseInt(e.target.value, 10) || 0))}
          />
        </div>

        <hr style={{ border: 'none', borderTop: '1px solid var(--border-default)', margin: '4px 0' }} />

        <div className="ff-wrap">
          <label className="ff-label" style={{ fontSize: 14, fontWeight: 600 }}>Multimoneda</label>
          <p className="ff-hint" style={{ marginBottom: 12 }}>
            Moneda base: <strong>{data?.monedaBase ?? 'DOP'}</strong> (no editable) — Monedas habilitadas:{' '}
            <strong>{(data?.monedasHabilitadas ?? ['DOP']).join(', ')}</strong>{' '}
            — <Link to="/config/monedas">gestionar monedas y tasas</Link>
          </p>

          {!data?.multimonedaHabilitada && (
            <p className="ff-hint" style={{ color: 'var(--warning-text, #b45309)', marginBottom: 12 }}>
              Habilite USD o EUR primero (en <Link to="/config/monedas">Monedas</Link>) para poder configurar tasa fija u otras opciones de multimoneda.
            </p>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, opacity: data?.multimonedaHabilitada ? 1 : 0.5 }}>
            <label className="ff-check-wrap" style={{ cursor: data?.multimonedaHabilitada ? 'pointer' : 'default' }}>
              <input
                type="checkbox"
                className="ff-check"
                checked={tasaFijaCxc}
                disabled={!data?.multimonedaHabilitada}
                onChange={(e) => setTasaFijaCxc(e.target.checked)}
              />
              <span style={{ fontSize: 13 }}>
                Tasa Fija en Cuentas por Cobrar
                <br />
                <span className="td-muted" style={{ fontSize: 12 }}>
                  Al cobrar una factura en moneda extranjera, usar siempre la tasa con la que se emitió, no la tasa del día.
                </span>
              </span>
            </label>

            <label className="ff-check-wrap" style={{ cursor: data?.multimonedaHabilitada ? 'pointer' : 'default' }}>
              <input
                type="checkbox"
                className="ff-check"
                checked={tasaFijaCxp}
                disabled={!data?.multimonedaHabilitada}
                onChange={(e) => setTasaFijaCxp(e.target.checked)}
              />
              <span style={{ fontSize: 13 }}>Tasa Fija en Cuentas por Pagar</span>
            </label>

            <label className="ff-check-wrap" style={{ cursor: data?.multimonedaHabilitada ? 'pointer' : 'default' }}>
              <input
                type="checkbox"
                className="ff-check"
                checked={permitirPagoMonedaDistintaBanco}
                disabled={!data?.multimonedaHabilitada}
                onChange={(e) => setPermitirPagoMonedaDistintaBanco(e.target.checked)}
              />
              <span style={{ fontSize: 13 }}>
                Permitir pago en moneda distinta a la cuenta bancaria
                <br />
                <span className="td-muted" style={{ fontSize: 12 }}>
                  Ej. transferir 2,000 DOP a una cuenta que opera en dólares.
                </span>
              </span>
            </label>

            <hr style={{ border: 'none', borderTop: '1px solid var(--border-default)', margin: '4px 0' }} />

            <label className="ff-check-wrap">
              <input
                type="checkbox"
                className="ff-check"
                checked={tasasActualizacionAutomatica}
                onChange={(e) => setTasasActualizacionAutomatica(e.target.checked)}
              />
              <span style={{ fontSize: 13 }}>Actualización automática de tasas</span>
            </label>

            {tasasActualizacionAutomatica && (
              <div className="form-row form-row-3">
                <div className="ff-wrap">
                  <label className="ff-label">Hora</label>
                  <input
                    type="time"
                    className="ff-input"
                    value={tasasHoraActualizacion}
                    onChange={(e) => setTasasHoraActualizacion(e.target.value)}
                  />
                </div>
                <div className="ff-wrap">
                  <label className="ff-label">Proveedor</label>
                  <Select value={tasasProveedor} onValueChange={(v) => setTasasProveedor(v as typeof tasasProveedor)}>
                    <SelectItem value="Banco Central RD">Banco Central RD</SelectItem>
                    <SelectItem value="Currency Exchange Settings">Currency Exchange Settings</SelectItem>
                  </Select>
                </div>
              </div>
            )}

            <p className="ff-hint" style={{ margin: 0 }}>
              Última actualización: {data?.tasasUltimaActualizacion ? formatDate(data.tasasUltimaActualizacion) : 'nunca'}
              {data?.tasasUltimoError && (
                <><br /><span style={{ color: 'var(--error-text)' }}>Último error: {data.tasasUltimoError}</span></>
              )}
            </p>
          </div>
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <button
            className="btn btn-primary btn-size-sm"
 onClick={() => saveMutation.mutate({
                rolesCancelacionFactura: selectedRoles,
                flujoCobro,
                requiereUbicacionVenta,
                requiereSerialLoteCompra,
                actualizarCostoEnCompra,
                usaDepartamentos,
                usaImpuestoDocumento,
                plantillaImpuestoVentasDefault: plantillaImpuestoVentasDefault || null,
                plantillaImpuestoComprasDefault: plantillaImpuestoComprasDefault || null,
                arqueoEfectivoRequerido,
                formatoImpresionDefault,
                formatosPermitidos,
                turnoMaxHoras,
                ncfAlertaMinimo,
                modoPagoCaja,
                modoPagoCajaUsd,
                modoPagoCajaEur,
                modosPagoConciliar,
                rolesCierreCajaAjena,
                redondeoTotalDeshabilitado: !redondearTotales,
                tasaFijaCxc,
                tasaFijaCxp,
                permitirPagoMonedaDistintaBanco,
                tasasActualizacionAutomatica,
                tasasHoraActualizacion,
                tasasProveedor,
                pedidoRequiereConfirmacionDespacho,
                pedidoConduceIncluyePrecios,
              })}
            disabled={saveMutation.isPending}
          >
            <Save size={14} /> Guardar
          </button>
        </div>
      </div>

      <ConfirmModal
        open={showDeshabilitarPosConfirm}
        onClose={() => setShowDeshabilitarPosConfirm(false)}
        onConfirm={() => deshabilitarPosMutation.mutate()}
        title="¿Desactivar el módulo POS?"
        description="Se desactivarán los turnos de caja y la cola de cobro para tu empresa. Los turnos y facturas ya registrados se conservan."
        confirmLabel="Desactivar módulo POS"
        loading={deshabilitarPosMutation.isPending}
      />

      <PosBloqueosModal bloqueos={posBloqueos} onClose={() => setPosBloqueos(null)} />

      <ConfirmModal
        open={showDeshabilitarDespachoConfirm}
        onClose={() => setShowDeshabilitarDespachoConfirm(false)}
        onConfirm={() => deshabilitarDespachoMutation.mutate()}
        title="¿Desactivar el despacho?"
        description="Las facturas nuevas volverán a descontar inventario al someterse. Los despachos ya sometidos se conservan como histórico."
        confirmLabel="Desactivar despacho"
        loading={deshabilitarDespachoMutation.isPending}
      />

      <DespachoBloqueosModal bloqueos={despachoBloqueos} onClose={() => setDespachoBloqueos(null)} />
    </div>
  )
}

// Lista los documentos que bloquean POST /config/despacho/deshabilitar (409), agrupados con
// enlaces a la pantalla donde el usuario debe resolver cada uno — docs/tasks/
// PROMPT_DESPACHO_RESERVAS_ABASTECIMIENTO_FRONTEND.md §8.3.
function DespachoBloqueosModal({ bloqueos, onClose }: { bloqueos: DesactivarDespachoBloqueos | null; onClose: () => void }) {
  if (!bloqueos) return null
  const { despachosBorrador, pedidosPendientes, facturasPendientesDespacho, reservasVivas } = bloqueos
  const nada = despachosBorrador.length === 0 && pedidosPendientes.length === 0 && facturasPendientesDespacho.length === 0 && reservasVivas.length === 0

  return (
    <Modal
      open
      onClose={onClose}
      title="No se puede desactivar el despacho"
      subtitle="Resuelve estos pendientes y vuelve a intentarlo."
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {nada && <p className="ff-hint" style={{ margin: 0 }}>No hay detalle de los documentos que bloquean la desactivación.</p>}
        {despachosBorrador.length > 0 && (
          <div>
            <p style={{ fontWeight: 600, fontSize: 13, marginBottom: 6 }}>Despachos en Borrador ({despachosBorrador.length})</p>
            <ul style={{ margin: 0, paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 4 }}>
              {despachosBorrador.map((id) => (
                <li key={id} style={{ fontSize: 13 }}>
                  <Link to={`/despachos/${encodeURIComponent(id)}`}>{id}</Link>
                </li>
              ))}
            </ul>
          </div>
        )}
        {pedidosPendientes.length > 0 && (
          <div>
            <p style={{ fontWeight: 600, fontSize: 13, marginBottom: 6 }}>Pedidos pendientes de despacho ({pedidosPendientes.length})</p>
            <ul style={{ margin: 0, paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 4 }}>
              {pedidosPendientes.map((id) => (
                <li key={id} style={{ fontSize: 13 }}>
                  <Link to={`/pedidos/${encodeURIComponent(id)}`}>{id}</Link>
                </li>
              ))}
            </ul>
          </div>
        )}
        {facturasPendientesDespacho.length > 0 && (
          <div>
            <p style={{ fontWeight: 600, fontSize: 13, marginBottom: 6 }}>Facturas pendientes de despachar ({facturasPendientesDespacho.length})</p>
            <ul style={{ margin: 0, paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 4 }}>
              {facturasPendientesDespacho.map((id) => (
                <li key={id} style={{ fontSize: 13 }}>
                  <Link to={`/facturas/${encodeURIComponent(id)}`}>{id}</Link>
                </li>
              ))}
            </ul>
          </div>
        )}
        {reservasVivas.length > 0 && (
          <div>
            <p style={{ fontWeight: 600, fontSize: 13, marginBottom: 6 }}>
              Reservas de stock vivas ({reservasVivas.length}) — <Link to="/reportes/despacho-reservas">ver reporte de Reservas</Link>
            </p>
            <ul style={{ margin: 0, paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 4 }}>
              {reservasVivas.map((r) => (
                <li key={r.id} style={{ fontSize: 13 }}>
                  {r.id} — {r.status}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </Modal>
  )
}

// Lista los documentos que bloquean POST /config/pos/deshabilitar (409), agrupados con enlaces
// a la pantalla donde el usuario debe resolver cada uno.
function PosBloqueosModal({ bloqueos, onClose }: { bloqueos: PosDeshabilitarBloqueos | null; onClose: () => void }) {
  if (!bloqueos) return null
  const { turnosAbiertos, cierresBorrador, colaCaja, posConSaldo } = bloqueos
  const nada = turnosAbiertos.length === 0 && cierresBorrador.length === 0 && colaCaja.length === 0 && posConSaldo.length === 0

  return (
    <Modal
      open
      onClose={onClose}
      title="No se puede desactivar el módulo POS"
      subtitle="Resuelve estos pendientes y vuelve a intentarlo."
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {nada && <p className="ff-hint" style={{ margin: 0 }}>No hay detalle de los documentos que bloquean la desactivación.</p>}
        {turnosAbiertos.length > 0 && (
          <div>
            <p style={{ fontWeight: 600, fontSize: 13, marginBottom: 6 }}>Cajas abiertas ({turnosAbiertos.length})</p>
            <ul style={{ margin: 0, paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 4 }}>
              {turnosAbiertos.map((t) => (
                <li key={t.id} style={{ fontSize: 13 }}>
                  <Link to={`/turnos/${encodeURIComponent(t.id)}`}>{t.id}</Link> — {t.cajero}
                </li>
              ))}
            </ul>
          </div>
        )}
        {cierresBorrador.length > 0 && (
          <div>
            <p style={{ fontWeight: 600, fontSize: 13, marginBottom: 6 }}>Cierres de turno sin someter ({cierresBorrador.length})</p>
            <ul style={{ margin: 0, paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 4 }}>
              {cierresBorrador.map((t) => (
                <li key={t.id} style={{ fontSize: 13 }}>
                  <Link to={`/turnos/${encodeURIComponent(t.id)}`}>{t.id}</Link> — {t.cajero}
                </li>
              ))}
            </ul>
          </div>
        )}
        {colaCaja.length > 0 && (
          <div>
            <p style={{ fontWeight: 600, fontSize: 13, marginBottom: 6 }}>
              Facturas en la cola de caja sin cobrar ({colaCaja.length}) — <Link to="/caja/por-cobrar">ir a Cola de Caja</Link>
            </p>
            <ul style={{ margin: 0, paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 4 }}>
              {colaCaja.map((id) => (
                <li key={id} style={{ fontSize: 13 }}>
                  <Link to={`/facturas/${encodeURIComponent(id)}`}>{id}</Link>
                </li>
              ))}
            </ul>
          </div>
        )}
        {posConSaldo.length > 0 && (
          <div>
            <p style={{ fontWeight: 600, fontSize: 13, marginBottom: 6 }}>
              Facturas POS con saldo pendiente ({posConSaldo.length}) — <Link to="/caja/pendientes">ir a Cobros Pendientes</Link>
            </p>
            <ul style={{ margin: 0, paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 4 }}>
              {posConSaldo.map((id) => (
                <li key={id} style={{ fontSize: 13 }}>
                  <Link to={`/facturas/${encodeURIComponent(id)}`}>{id}</Link>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </Modal>
  )
}

// ---- Facturación Electrónica (e-CF) Section ----
// F0-F1 ya aterrizaron en el backend (cimientos + config). Todavía no existe ninguna fase de
// emisión real (F3-F6) — esta pantalla es solo scaffolding de configuración para adelantar
// trabajo. No hay endpoints de emisión/consulta/anulación de e-CF que probar todavía.
function EcfConfigSection() {
  const queryClient = useQueryClient()
  const { data, isLoading } = useQuery({ queryKey: ['ecf-config'], queryFn: getEcfConfig })

  const [habilitado, setHabilitado] = useState(false)
  const [tiposElectronicos, setTiposElectronicos] = useState<EcfTipoElectronico[]>([])
  const [tipoPagoDefault, setTipoPagoDefault] = useState<1 | 2 | 3>(1)
  const [tipoIngresosDefault, setTipoIngresosDefault] = useState('01')
  const [diasLimiteAprobacionComercial, setDiasLimiteAprobacionComercial] = useState(3)
  const [adjuntarPdfa, setAdjuntarPdfa] = useState(false)
  const [umbralAlertaSecuencia, setUmbralAlertaSecuencia] = useState(50)
  const [emitirAlSometer, setEmitirAlSometer] = useState(true)
  const [bloquearSubmitSiVegaCaido, setBloquearSubmitSiVegaCaido] = useState(true)
  const [showAdvanced, setShowAdvanced] = useState(false)
  // 400 al habilitar e-CF en modo live sin certificación DGII completa (F9 §3.1).
  const [certRequiredMsg, setCertRequiredMsg] = useState('')

  useEffect(() => {
    if (data) {
      setHabilitado(data.habilitado ?? false)
      setTiposElectronicos(data.tiposElectronicos ?? [])
      setTipoPagoDefault(data.tipoPagoDefault ?? 1)
      setTipoIngresosDefault(data.tipoIngresosDefault ?? '01')
      setDiasLimiteAprobacionComercial(data.diasLimiteAprobacionComercial ?? 3)
      setAdjuntarPdfa(data.adjuntarPdfa ?? false)
      setUmbralAlertaSecuencia(data.umbralAlertaSecuencia ?? 50)
      setEmitirAlSometer(data.emitirAlSometer ?? true)
      setBloquearSubmitSiVegaCaido(data.bloquearSubmitSiVegaCaido ?? true)
    }
  }, [data])

  const saveMutation = useMutation({
    mutationFn: () => updateEcfConfig({
      habilitado,
      tiposElectronicos,
      tipoPagoDefault,
      tipoIngresosDefault: tipoIngresosDefault as '01' | '02' | '03' | '04' | '05' | '06',
      diasLimiteAprobacionComercial,
      adjuntarPdfa,
      umbralAlertaSecuencia,
      emitirAlSometer,
      bloquearSubmitSiVegaCaido,
    }),
    onSuccess: () => {
      toast.success('Configuración de facturación electrónica actualizada')
      setCertRequiredMsg('')
      queryClient.invalidateQueries({ queryKey: ['ecf-config'] })
    },
    onError: (err: ApiError) => {
      if (err?.statusCode === 400 && /certificaci[oó]n/i.test(err.message ?? '')) {
        setCertRequiredMsg(err.message)
        return
      }
      toast.error(err?.message ?? 'Error al guardar')
    },
  })

  function toggleTipoElectronico(typeId: EcfTipoElectronico) {
    setTiposElectronicos((prev) => (prev.includes(typeId) ? prev.filter((t) => t !== typeId) : [...prev, typeId]))
  }

  if (isLoading) return <span className="skeleton-box" style={{ height: 200, display: 'block' }} />

  const provisioning = data?.provisioning

  return (
    <div className="card">
      <div className="card-header">
        <span className="card-title">Facturación Electrónica (e-CF)</span>
      </div>
      <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        {data?.note && (
          <div className="inline-alert inline-alert-info">
            <Info size={15} />
            <span>{data.note}</span>
          </div>
        )}

        {certRequiredMsg && (
          <div className="inline-alert inline-alert-warn" style={{ alignItems: 'flex-start' }}>
            <FileWarning size={15} style={{ flexShrink: 0, marginTop: 1 }} />
            <span>
              {certRequiredMsg}{' '}
              <Link to="/config/ecf/admin">Ver progreso de certificación</Link>.
            </span>
          </div>
        )}

        <div className="ff-wrap">
          <label className="ff-check-wrap">
            <input
              type="checkbox"
              className="ff-check"
              checked={habilitado}
              onChange={(e) => setHabilitado(e.target.checked)}
            />
            <span style={{ fontSize: 13, fontWeight: 500 }}>
              Habilitar facturación electrónica
              <FieldTooltip>
                Si está apagado, tu empresa sigue facturando 100% igual que hoy (NCF físico). El resto de esta
                pantalla solo tiene efecto cuando esté activo.
              </FieldTooltip>
            </span>
          </label>
        </div>

        <div className="ff-wrap" style={{ opacity: habilitado ? 1 : 0.5 }}>
          <label className="ff-label">
            Tipos de comprobante electrónico
            <FieldTooltip>
              Solo los tipos marcados aquí se emiten electrónicamente. Un tipo no marcado sigue emitiéndose
              físico — la migración puede ser gradual, por tipo, no todo o nada.
            </FieldTooltip>
          </label>
          <div style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: 8,
            border: '1px solid var(--border-default)',
            borderRadius: 'var(--radius-md)',
            padding: 12,
          }}>
            {ECF_TIPOS.map((t) => (
              <label key={t.typeId} className="ff-check-wrap">
                <input
                  type="checkbox"
                  className="ff-check"
                  disabled={!habilitado}
                  checked={tiposElectronicos.includes(t.typeId)}
                  onChange={() => toggleTipoElectronico(t.typeId)}
                />
                <span style={{ fontSize: 13 }}>{t.typeId} — {t.label}</span>
              </label>
            ))}
          </div>
        </div>

        <div className="form-row" style={{ opacity: habilitado ? 1 : 0.5 }}>
          <div className="ff-wrap">
            <label className="ff-label">Tipo de Pago por defecto</label>
            <Select
              value={String(tipoPagoDefault)}
              onValueChange={(val) => setTipoPagoDefault(Number(val) as 1 | 2 | 3)}
              disabled={!habilitado}
            >
              {TIPO_PAGO_DEFAULT_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={String(o.value)}>{o.label}</SelectItem>
              ))}
            </Select>
          </div>
          <div className="ff-wrap">
            <label className="ff-label">Tipo de Ingresos por defecto</label>
            <Select value={tipoIngresosDefault} onValueChange={setTipoIngresosDefault} disabled={!habilitado}>
              {TIPO_INGRESOS_DEFAULT_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
              ))}
            </Select>
          </div>
        </div>

        <div className="form-row" style={{ opacity: habilitado ? 1 : 0.5 }}>
          <div className="ff-wrap">
            <label className="ff-label">
              Días límite para aprobación comercial
              <FieldTooltip>Solo relevante para comprobantes recibidos de terceros (fase futura).</FieldTooltip>
            </label>
            <input
              type="number"
              min={0}
              step={1}
              className="ff-input"
              style={{ width: 120 }}
              value={diasLimiteAprobacionComercial}
              disabled={!habilitado}
              onChange={(e) => setDiasLimiteAprobacionComercial(Math.max(0, parseInt(e.target.value, 10) || 0))}
            />
          </div>
          <div className="ff-wrap">
            <label className="ff-label">
              Umbral de alerta de secuencia
              <FieldTooltip>Mismo criterio que la alerta de NCF físico, aplicado a los rangos electrónicos.</FieldTooltip>
            </label>
            <input
              type="number"
              min={0}
              step={1}
              className="ff-input"
              style={{ width: 120 }}
              value={umbralAlertaSecuencia}
              disabled={!habilitado}
              onChange={(e) => setUmbralAlertaSecuencia(Math.max(0, parseInt(e.target.value, 10) || 0))}
            />
          </div>
        </div>

        <div className="ff-wrap" style={{ opacity: habilitado ? 1 : 0.5 }}>
          <label className="ff-check-wrap">
            <input
              type="checkbox"
              className="ff-check"
              checked={adjuntarPdfa}
              disabled={!habilitado}
              onChange={(e) => setAdjuntarPdfa(e.target.checked)}
            />
            <span style={{ fontSize: 13 }}>
              Adjuntar PDF de archivo fiscal automáticamente
              <FieldTooltip>
                Cuando un comprobante es aceptado por la DGII, adjunta automáticamente su PDF/A (fase futura, pero
                el campo ya se puede configurar).
              </FieldTooltip>
            </span>
          </label>
        </div>

        {/* Sección avanzada, colapsada por default */}
        <div style={{ borderTop: '1px solid var(--border-default)', paddingTop: 12 }}>
          <button
            type="button"
            className="btn btn-ghost btn-size-sm"
            onClick={() => setShowAdvanced((v) => !v)}
            style={{ display: 'flex', alignItems: 'center', gap: 4 }}
          >
            <ChevronDown size={14} style={{ transform: showAdvanced ? 'rotate(180deg)' : undefined, transition: 'transform .15s' }} />
            Avanzado
          </button>
          {showAdvanced && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginTop: 12, opacity: habilitado ? 1 : 0.5 }}>
              <div className="ff-wrap">
                <label className="ff-check-wrap">
                  <input
                    type="checkbox"
                    className="ff-check"
                    checked={emitirAlSometer}
                    disabled={!habilitado}
                    onChange={(e) => setEmitirAlSometer(e.target.checked)}
                  />
                  <span style={{ fontSize: 13 }}>
                    Emitir al someter
                    <FieldTooltip>
                      Si está activo (caso normal), la emisión del e-CF ocurre automáticamente al someter el
                      documento. Desactivarlo es un modo excepcional/de depuración.
                    </FieldTooltip>
                  </span>
                </label>
              </div>
              <div className="ff-wrap">
                <label className="ff-check-wrap">
                  <input
                    type="checkbox"
                    className="ff-check"
                    checked={bloquearSubmitSiVegaCaido}
                    disabled={!habilitado}
                    onChange={(e) => setBloquearSubmitSiVegaCaido(e.target.checked)}
                  />
                  <span style={{ fontSize: 13 }}>
                    Bloquear sometimiento si Vega no responde
                    <FieldTooltip>
                      Si Vega/DGII no responde: activo = se bloquea la facturación (default seguro); inactivo =
                      se activa contingencia automáticamente y se sigue facturando.
                    </FieldTooltip>
                  </span>
                </label>
              </div>
            </div>
          )}
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button
            className="btn btn-primary btn-size-sm"
            onClick={() => saveMutation.mutate()}
            disabled={saveMutation.isPending}
          >
            <Save size={14} /> Guardar
          </button>
        </div>

        {/* Estado de conexión con Vega — solo lectura */}
        <div style={{ borderTop: '1px solid var(--border-default)', paddingTop: 16 }}>
          <label className="ff-label">Estado de conexión con Vega</label>
          <p className="ff-hint" style={{ marginBottom: 8 }}>
            Gestionado por soporte — todavía no hay un flujo de auto-servicio para conectar tu empresa a Vega
            desde aquí.
          </p>
          {!provisioning?.provisionado ? (
            <div className="empty-state" style={{ padding: '20px 0' }}>
              <p className="empty-title">Tu empresa aún no está conectada a Vega</p>
              <p className="empty-sub">Contacta a soporte para activar la facturación electrónica.</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', fontSize: 13 }}>
                <span><strong>Ambiente activo:</strong> {provisioning.activeMode === 'live' ? 'Producción (live)' : provisioning.activeMode === 'test' ? 'Pruebas (test)' : 'No configurado'}</span>
                <span><strong>API Key test:</strong> {provisioning.hasApiKeyTest ? 'Configurada' : 'No configurada'}</span>
                <span><strong>API Key live:</strong> {provisioning.hasApiKeyLive ? 'Configurada' : 'No configurada'}</span>
              </div>
              {provisioning.clientes.length === 0 ? (
                <p style={{ fontSize: 13, color: 'var(--text-tertiary)' }}>Sin RNC emisores conectados todavía.</p>
              ) : (
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Compañía</th>
                      <th>RNC</th>
                      <th>Certificado vence</th>
                      <th>Etapa de certificación</th>
                      <th>Contingencia</th>
                    </tr>
                  </thead>
                  <tbody>
                    {provisioning.clientes.map((c, i) => (
                      <tr key={i}>
                        <td>{c.company}</td>
                        <td>{c.rnc}</td>
                        <td>{c.certificateExpiresAt ? formatDate(c.certificateExpiresAt) : '—'}</td>
                        <td>{c.certificationStage ?? '—'}</td>
                        <td>{c.contingencyMode ? 'Activa' : 'Inactiva'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}
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

  const newIsDirty = useDirtyCheck({ newDenominacion, newValor, newActivo }, showNew)
  const newClose = useConfirmClose(newIsDirty, () => setShowNew(false))
  const editIsDirty = useDirtyCheck({ editValor, editActivo }, !!editTarget)
  const editClose = useConfirmClose(editIsDirty, () => setEditTarget(null))

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
        <div className="modal-overlay" onClick={newClose.requestClose}>
          <div className="modal-box modal-box-sm" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <h2 className="modal-title">Nueva Denominación</h2>
              <button className="modal-close" onClick={newClose.requestClose}><X size={16} /></button>
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
              <button className="btn btn-secondary" onClick={newClose.requestClose}>Cancelar</button>
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
      <ConfirmModal
        open={newClose.confirming}
        onClose={newClose.cancelDiscard}
        onConfirm={newClose.confirmDiscard}
        title="¿Descartar cambios?"
        description="Tienes cambios sin guardar en este formulario. Si continúas, se perderán."
        confirmLabel="Descartar cambios"
        variant="danger"
      />

      {editTarget && (
        <div className="modal-overlay" onClick={editClose.requestClose}>
          <div className="modal-box modal-box-sm" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <h2 className="modal-title">Editar Denominación</h2>
              <button className="modal-close" onClick={editClose.requestClose}><X size={16} /></button>
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
              <button className="btn btn-secondary" onClick={editClose.requestClose}>Cancelar</button>
              <button className="btn btn-primary" onClick={() => updateMutation.mutate()} disabled={updateMutation.isPending}>
                {updateMutation.isPending ? 'Guardando…' : 'Guardar'}
              </button>
            </div>
          </div>
        </div>
      )}
      <ConfirmModal
        open={editClose.confirming}
        onClose={editClose.cancelDiscard}
        onConfirm={editClose.confirmDiscard}
        title="¿Descartar cambios?"
        description="Tienes cambios sin guardar en este formulario. Si continúas, se perderán."
        confirmLabel="Descartar cambios"
        variant="danger"
      />
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
  'tasas-impuesto': 'Tasas de Impuesto',
  'ejercicio-fiscal': 'Ejercicio Fiscal',
  perfil: 'Mi Perfil',
  'grupos-clientes': 'Grupos de Clientes',
  facturacion: 'Configuración de Facturación',
  denominaciones: 'Denominaciones',
  ecf: 'Facturación Electrónica',
  farmacia: 'Farmacia ARS',
}

const IMPUESTOS_SECTIONS = new Set([
  'tasas-impuesto', 'impuestos-ventas', 'impuestos-compras', 'impuestos-articulo',
])

/** Secciones rediseñadas con la misma estructura de las vistas de tabla (Facturas, Cotizaciones,
 * Clientes, etc.) — cada una arma su propio encabezado (título + descripción + acción) y su
 * propia tabla "navy", así que no usan el `<PageHeader>` genérico de acá ni el ancho angosto
 * (760px) pensado para los formularios de configuración simples. */
const NAVY_LIST_SECTIONS = new Set([
  'metodos-pago', 'listas-precio', 'tasas-impuesto', 'ejercicio-fiscal',
])

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
    'tasas-impuesto': <TasasImpuestoSection />,
    'ejercicio-fiscal': <EjercicioFiscalSection />,
    perfil: <PerfilSection />,
    'grupos-clientes': <GruposClientesSection />,
    facturacion: <FacturacionConfigSection />,
    denominaciones: <DenominacionesSection />,
    ecf: <EcfConfigSection />,
    farmacia: <FarmaciaArsConfigSection />,
  }

  const isNavyList = NAVY_LIST_SECTIONS.has(seccion)

  return (
    <div className="page-container">
      {!isNavyList && <PageHeader title={title} />}
      {seccion === 'ecf' && <EcfTabs />}
      {IMPUESTOS_SECTIONS.has(seccion) && <ImpuestosTabs />}
      <div style={isNavyList ? undefined : { maxWidth: 760 }}>
        {sectionMap[seccion] ?? (
          <div style={{ textAlign: 'center', color: 'var(--text-tertiary)', padding: '48px 0' }}>
            Sección no encontrada.
          </div>
        )}
      </div>
    </div>
  )
}
