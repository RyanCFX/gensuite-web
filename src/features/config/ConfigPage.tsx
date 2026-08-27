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
  listImpuestosVentas,
  listImpuestosCompras,
  listItemTaxTemplates,
  listTasasImpuesto, createTasaImpuesto, updateTasaImpuesto, deleteTasaImpuesto,
  getFacturacionConfig, updateFacturacionConfig,
  listDenominaciones, createDenominacion, updateDenominacion,
  habilitarPos,
} from '@/shared/api/config'
import { listSucursales } from '@/shared/api/sucursales'
import { listCuentasBancarias } from '@/shared/api/cuentas-bancarias'
import { listCustomerGroups, createCustomerGroup, deleteCustomerGroup } from '@/shared/api/customers'
import { listRoles } from '@/shared/api/usuarios'
import type { CobrosConfig, MetodoPago, TaxLineCategory, TasaImpuesto, TasaImpuestoComponente, CreateTasaImpuestoDto, GrupoCliente, FacturacionConfig, Denominacion, ApiError, UpdateAlmacenDto, FormatoImpresion } from '@/shared/api/types'
import { PageHeader } from '@/components/shared/PageHeader'
import { SearchSelect } from '@/shared/ui/SearchSelect'
import { ConfirmModal } from '@/shared/ui/Modal'
import { useConfirmClose } from '@/shared/hooks/useConfirmClose'
import { useDirtyCheck } from '@/shared/hooks/useDirtyCheck'
import type { SearchSelectOption } from '@/shared/ui/SearchSelect'
import { Select, SelectItem } from '@/components/ui/select'
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
                <label className="ff-label">Tipo de Almacén</label>
                <Select value={newWarehouseType} onValueChange={setNewWarehouseType} placeholder="Estándar">
                  <SelectItem value="">Estándar</SelectItem>
                  <SelectItem value="Transit">Tránsito</SelectItem>
                </Select>
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
  const [showNew, setShowNew] = useState(false)
  const [newName, setNewName] = useState('')
  const [newType, setNewType] = useState<MetodoPago['type']>('Cash')
  const [editTarget, setEditTarget] = useState<MetodoPago | null>(null)
  const [editAccount, setEditAccount] = useState('')
  const [editRequiresBankAccount, setEditRequiresBankAccount] = useState(false)
  const [editDefaultBankAccount, setEditDefaultBankAccount] = useState('')
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
  const editIsDirty = useDirtyCheck({ editAccount, editRequiresBankAccount, editDefaultBankAccount }, !!editTarget)
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
                <label className="ff-label">Cuenta Bancaria / Caja</label>
                <AccountSelect
                  value={editAccount}
                  onChange={setEditAccount}
                  placeholder="Buscar cuenta bancaria o caja…"
                />
                <p className="ff-hint">Ej: "Efectivo RD" → "Cash - JB"</p>
              </div>

              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={editRequiresBankAccount}
                  onChange={(e) => setEditRequiresBankAccount(e.target.checked)}
                />
                Requiere cuenta bancaria
              </label>

              {editRequiresBankAccount && (
                <div className="ff-wrap">
                  <label className="ff-label">Cuenta bancaria por defecto</label>
                  <SearchSelect
                    value={editDefaultBankAccount}
                    onChange={setEditDefaultBankAccount}
                    options={cuentaBancariaOptions}
                    onSearch={setDefaultBankAccountSearch}
                    selectedLabel={cuentaBancariaOptions.find((o) => o.value === editDefaultBankAccount)?.label ?? ''}
                    placeholder="— Sin cuenta por defecto —"
                  />
                  <p className="ff-hint">Opcional. Si se deja vacío, el usuario deberá elegir la cuenta en cada cobro/pago.</p>
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

  const createIsDirty = useDirtyCheck({ newUomName, conversions }, showCreate)
  const createClose = useConfirmClose(createIsDirty, () => setShowCreate(false))
  const editIsDirty = useDirtyCheck({ editName, editConversions }, editing)
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

  return (
    <>
      <div className="card">
        <div className="card-header">
          <span className="card-title">Tasas de Impuesto</span>
          <button className="btn btn-primary btn-size-sm" onClick={openCreate}>
            <Plus size={14} /> Nuevo
          </button>
        </div>
        <div className="card-body" style={{ paddingTop: 0, paddingBottom: 12 }}>
          <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: 0 }}>
            Catálogo central de impuestos base (ej. ITBIS, ISR) y combos (suma de otros impuestos del
            catálogo). Al editar la tasa de un impuesto base, todos los combos que lo usan — y las
            plantillas de impuestos donde estén asignados — se recalculan automáticamente en el servidor.
          </p>
        </div>
        <div>
          {isLoading
            ? <span className="skeleton-box" style={{ height: 128, display: 'block', margin: 16 }} />
            : !data || data.length === 0
              ? (
                  <div className="card-body">
                    <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                      No hay tasas de impuesto configuradas. Crea una con el botón <strong>Nuevo</strong>.
                    </p>
                  </div>
                )
              : (
                  <table className="data-table">
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
                      {data.map((t) => (
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
                )}
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
                  <label className="ff-label">Cuenta Contable (Gastos)</label>
                  <AccountSelect
                    value={formAccountCompras}
                    onChange={setFormAccountCompras}
                    placeholder="Buscar cuenta…"
                    ledgerOnly
                  />
                  <p className="ff-hint">Si se deja vacía, se usa la misma cuenta de Ventas/Artículos.</p>
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
                  <label className="ff-label">Aplica a</label>
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
                  <p className="ff-hint">
                    El servidor gestiona sola la plantilla correspondiente en cada documento — no es necesario configurarla manualmente.
                  </p>
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
  const [flujoCobro, setFlujoCobro] = useState<'directo' | 'caja'>('directo')
  const [requiereUbicacionVenta, setRequiereUbicacionVenta] = useState(false)
  const [requiereSerialLoteCompra, setRequiereSerialLoteCompra] = useState(false)
  const [usaDepartamentos, setUsaDepartamentos] = useState(true)
  const [usaImpuestoDocumento, setUsaImpuestoDocumento] = useState(true)
  const [plantillaImpuestoVentasDefault, setPlantillaImpuestoVentasDefault] = useState('')
  const [plantillaImpuestoComprasDefault, setPlantillaImpuestoComprasDefault] = useState('')
  const [showPosActivar, setShowPosActivar] = useState(false)
  const [posWarehouse, setPosWarehouse] = useState('')
   const [arqueoEfectivoRequerido, setArqueoEfectivoRequerido] = useState(false)
   const [formatoImpresionDefault, setFormatoImpresionDefault] = useState<FormatoImpresion>("a4")
   const [formatosPermitidos, setFormatosPermitidos] = useState<FormatoImpresion[]>(ALL_FORMATOS_IMPRESION)
    const [turnoMaxHoras, setTurnoMaxHoras] = useState(24)
   const [ncfAlertaMinimo, setNcfAlertaMinimo] = useState(50)
   const [modoPagoCaja, setModoPagoCaja] = useState<string | null>(null)
   const [modosPagoConciliar, setModosPagoConciliar] = useState<string[]>([])
   const [rolesCierreCajaAjena, setRolesCierreCajaAjena] = useState<string[]>([])

   useEffect(() => {
     if (data) {
       setSelectedRoles(data.rolesCancelacionFactura ?? [])
       setFlujoCobro(data.flujoCobro ?? "directo")
       setRequiereUbicacionVenta(data.requiereUbicacionVenta ?? false)
       setRequiereSerialLoteCompra(data.requiereSerialLoteCompra ?? false)
       setUsaDepartamentos(data.usaDepartamentos ?? true)
       setUsaImpuestoDocumento(data.usaImpuestoDocumento ?? true)
       setPlantillaImpuestoVentasDefault(data.plantillaImpuestoVentasDefault ?? '')
       setPlantillaImpuestoComprasDefault(data.plantillaImpuestoComprasDefault ?? '')
        setArqueoEfectivoRequerido(data.arqueoEfectivoRequerido ?? false)
        setFormatoImpresionDefault(data.formatoImpresionDefault ?? "a4")
        setFormatosPermitidos(data.formatosPermitidos && data.formatosPermitidos.length > 0 ? data.formatosPermitidos : ALL_FORMATOS_IMPRESION)
        setTurnoMaxHoras(data.turnoMaxHoras ?? 24)
        setNcfAlertaMinimo(data.ncfAlertaMinimo ?? 50)
        setModoPagoCaja(data.modoPagoCaja ?? null)
        setModosPagoConciliar(data.modosPagoConciliar ?? [])
        setRolesCierreCajaAjena(data.rolesCierreCajaAjena ?? [])
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
          <label className="ff-label">Flujo de cobro al someter</label>
          <p className="ff-hint" style={{ marginBottom: 8 }}>
            "Directo": se cobra con un solo método de pago, sin vuelto (comportamiento histórico). "Caja": habilita
            cobrar con múltiples métodos de pago simultáneos y el registro opcional de vuelto.
          </p>
          <div style={{ maxWidth: 240 }}>
            <Select value={flujoCobro} onValueChange={(val) => setFlujoCobro(val as 'directo' | 'caja')}>
              <SelectItem value="directo">Directo</SelectItem>
              <SelectItem value="caja">Caja</SelectItem>
            </Select>
          </div>
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
            <span style={{ fontSize: 13 }}>Requiere Ubicación para Vender</span>
          </label>
          <p className="ff-hint" style={{ marginTop: 4 }}>
            Si está activo, no se podrá vender un artículo de inventario si no tiene una Ubicación asignada dentro
            del almacén desde el cual se factura.
          </p>
        </div>

        <div className="ff-wrap">
          <label className="ff-check-wrap">
            <input
              type="checkbox"
              className="ff-check"
              checked={requiereSerialLoteCompra}
              onChange={(e) => setRequiereSerialLoteCompra(e.target.checked)}
            />
            <span style={{ fontSize: 13 }}>Requiere Serial/Lote al Comprar</span>
          </label>
          <p className="ff-hint" style={{ marginTop: 4 }}>
            Si está activo, al comprar un artículo con tracking de serial/lote se exige capturar los mismos en la
            línea de compra, y al vender solo se podrá elegir un serial/lote que ya exista en el sistema. Si está
            inactivo, la captura es opcional al comprar y se puede crear un serial/lote nuevo automáticamente al vender.
          </p>
        </div>

        <div className="ff-wrap">
          <label className="ff-check-wrap">
            <input
              type="checkbox"
              className="ff-check"
              checked={usaDepartamentos}
              onChange={(e) => setUsaDepartamentos(e.target.checked)}
            />
            <span style={{ fontSize: 13 }}>Usar Departamentos</span>
          </label>
          <p className="ff-hint" style={{ marginTop: 4 }}>
            Si está desactivado, se oculta el selector de Departamento (opcional) en los formularios de Factura,
            Cotización, Pedido, Cobro, Compra y Gasto. No afecta documentos ya guardados con un departamento asignado.
          </p>
        </div>

        <div className="ff-wrap">
          <label className="ff-check-wrap">
            <input
              type="checkbox"
              className="ff-check"
              checked={usaImpuestoDocumento}
              onChange={(e) => setUsaImpuestoDocumento(e.target.checked)}
            />
            <span style={{ fontSize: 13 }}>Permitir Impuesto de Documento</span>
          </label>
          <p className="ff-hint" style={{ marginTop: 4 }}>
            Si está desactivado, se oculta el selector de plantilla de Impuesto de Documento en Factura, Cotización
            y Compra. No afecta documentos ya guardados con una plantilla asignada.
          </p>
        </div>

        <div className="form-row">
          <div className="ff-wrap">
            <label className="ff-label">Plantilla de Impuesto — Ventas (default)</label>
            <Select value={plantillaImpuestoVentasDefault} onValueChange={setPlantillaImpuestoVentasDefault} placeholder="Seleccionar…">
              <SelectItem value="">Sin plantilla</SelectItem>
              {(plantillasVentas ?? []).map((t) => <SelectItem key={t.id} value={t.id}>{t.title}</SelectItem>)}
            </Select>
            <p className="ff-hint">
              Plantilla que aplican Factura, Cotización y Pedido de Venta cuando no se especifica una explícitamente.
              Se generan y gestionan desde "Tasas de Impuesto".
            </p>
          </div>
          <div className="ff-wrap">
            <label className="ff-label">Plantilla de Impuesto — Compras (default)</label>
            <Select value={plantillaImpuestoComprasDefault} onValueChange={setPlantillaImpuestoComprasDefault} placeholder="Seleccionar…">
              <SelectItem value="">Sin plantilla</SelectItem>
              {(plantillasCompras ?? []).map((t) => <SelectItem key={t.id} value={t.id}>{t.title}</SelectItem>)}
            </Select>
            <p className="ff-hint">
              Plantilla que aplican Compra y Gasto cuando no se especifica una explícitamente.
              Se generan y gestionan desde "Tasas de Impuesto".
            </p>
          </div>
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

        {data?.usaModuloPos && (
          <div className="ff-wrap">
            <label className="ff-check-wrap">
              <input
                type="checkbox"
                className="ff-check"
                checked={arqueoEfectivoRequerido}
                onChange={(e) => setArqueoEfectivoRequerido(e.target.checked)}
              />
              <span style={{ fontSize: 13 }}>Arqueo de efectivo obligatorio al cerrar turno</span>
            </label>
            <p className="ff-hint" style={{ marginTop: 4 }}>
              Si está activo, el cajero debe contar y desglosar las denominaciones de efectivo (billetes/monedas) al cerrar su turno;
              si falta, el sistema rechaza el cierre.
            </p>
           </div>
         )}

         {data?.usaModuloPos && (
           <div className="ff-wrap">
             <label className="ff-label">Método de pago de Caja</label>
             <p className="ff-hint" style={{ marginTop: 4 }}>
               El método de pago cuyo cobrado se compara contra el efectivo físico al cuadrar el turno.
               Solo tiene sentido cuando el módulo POS está activo.
             </p>
             <div style={{ maxWidth: 320 }}>
               <SearchSelect
                 value={modoPagoCaja ?? ''}
                 onChange={(val) => setModoPagoCaja(val || null)}
                 options={modoPagoCajaOptions}
                 onSearch={setModoPagoCajaSearch}
                 selectedLabel={modoPagoCaja ?? ''}
                 placeholder="No configurado"
               />
             </div>
            </div>
          )}

          {data?.usaModuloPos && (
            <div className="ff-wrap">
              <label className="ff-label">Métodos de pago a conciliar</label>
              <p className="ff-hint" style={{ marginTop: 4 }}>
                Métodos de pago que requieren que el cajero ingrese el monto contado al cerrar el turno.
                Si no se selecciona ninguno, el backend usa por defecto los métodos de tipo efectivo.
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
             <label className="ff-label">Máximo de horas por turno de caja</label>
             <p className="ff-hint" style={{ marginTop: 4 }}>
               El turno se bloqueará automáticamente al superar este límite. El cajero deberá cerrar y abrir uno nuevo.
               Valor 0.1 equivale a 6 minutos. Default: 24 horas.
             </p>
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
             <label className="ff-label">Roles autorizados para cerrar cajas de otros usuarios</label>
             <p className="ff-hint" style={{ marginBottom: 8 }}>
               Solo usuarios con alguno de estos roles de ERPNext pueden cerrar el turno de OTRO cajero
               (mismas validaciones que cerrar el propio turno). Si esta lista queda vacía, nadie puede cerrar
               turnos ajenos — es el comportamiento por defecto.
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
          <label className="ff-label">Formatos de impresión habilitados</label>
          <p className="ff-hint" style={{ marginBottom: 8 }}>
            Formatos que estarán disponibles al generar el PDF de una factura, cobro o compra. Mínimo uno.
          </p>
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
           <label className="ff-label">Formato de impresión default</label>
          <p className="ff-hint" style={{ marginBottom: 8 }}>
            Cuál de los formatos habilitados se usa cuando no se pide uno explícito al generar el PDF de una factura, cobro o compra.
          </p>
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
          <label className="ff-label">Mínimo de comprobantes para alertar</label>
          <p className="ff-hint" style={{ marginBottom: 8 }}>
            Cuando a una secuencia NCF le queden este número de comprobantes o menos, se marcará como "por agotarse"
            en la pantalla de Secuencias NCF y, si está activo, se enviará un correo automático. Default: 50.
          </p>
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

        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <button
            className="btn btn-primary btn-size-sm"
 onClick={() => saveMutation.mutate({
                rolesCancelacionFactura: selectedRoles,
                flujoCobro,
                requiereUbicacionVenta,
                requiereSerialLoteCompra,
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
                modosPagoConciliar,
                rolesCierreCajaAjena,
              })}
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
    'tasas-impuesto': <TasasImpuestoSection />,
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
