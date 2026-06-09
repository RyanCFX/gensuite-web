import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import axios from 'axios'
import {
  getCobrosConfig, updateCobrosConfig,
  listAlmacenes, createAlmacen, deleteAlmacen, updateAlmacen,
  listMetodosPago, createMetodoPago, updateMetodoPago,
  listUOMs, createUOM,
  listListasPrecio,
  getNcfSeries,
  getPerfil, updatePerfil,
  listImpuestosVentas, createImpuestoVentas, updateImpuestoVentas, deleteImpuestoVentas,
  listImpuestosCompras, createImpuestoCompras, updateImpuestoCompras, deleteImpuestoCompras,
} from '@/shared/api/config'
import type { CobrosConfig, MetodoPago, TaxTemplate, TaxTemplateLine, TaxChargeType, CreateTaxTemplateDto } from '@/shared/api/types'
import { PageHeader } from '@/components/shared/PageHeader'
import { AccountSelect } from '@/components/shared/AccountSelect'
import { formatDate } from '@/lib/formatters'
import { Plus, Trash2, Save, FileWarning, X, Pencil } from 'lucide-react'
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
  const [toDelete, setToDelete] = useState<string | null>(null)
  const [editTarget, setEditTarget] = useState<{ name: string; warehouseName: string } | null>(null)
  const [editWarehouseAccount, setEditWarehouseAccount] = useState('')

  const { data, isLoading } = useQuery({ queryKey: ['almacenes'], queryFn: listAlmacenes })

  const createMutation = useMutation({
    mutationFn: () => createAlmacen({ warehouseName: newName }),
    onSuccess: () => { toast.success('Almacén creado'); queryClient.invalidateQueries({ queryKey: ['almacenes'] }); setShowNew(false); setNewName('') },
    onError: () => toast.error('Error al crear el almacén'),
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, data: d }: { id: string; data: Partial<{ warehouseName: string; account: string }> }) =>
      updateAlmacen(id, d),
    onSuccess: () => { toast.success('Almacén actualizado'); queryClient.invalidateQueries({ queryKey: ['almacenes'] }); setEditTarget(null) },
    onError: () => toast.error('Error al actualizar el almacén'),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteAlmacen(id),
    onSuccess: () => { toast.success('Almacén eliminado'); queryClient.invalidateQueries({ queryKey: ['almacenes'] }); setToDelete(null) },
    onError: () => toast.error('Error al eliminar el almacén'),
  })

  function openEdit(a: { name: string; warehouseName: string }) {
    setEditTarget(a)
    setEditWarehouseAccount('')
    setToDelete(null)
  }

  return (
    <>
      <div className="card">
        <div className="card-header">
          <span className="card-title">Almacenes</span>
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
                      <th>Estado</th>
                      <th style={{ width: 80 }} />
                    </tr>
                  </thead>
                  <tbody>
                    {data?.map((a) => (
                      <tr key={a.name}>
                        <td style={{ fontWeight: 500 }}>{a.warehouseName}</td>
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
            <div className="modal-body">
              <div className="ff-wrap">
                <label className="ff-label">Nombre del almacén</label>
                <input className="ff-input" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Almacén Principal" />
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
                onClick={() => updateMutation.mutate({ id: editTarget.name, data: { account: editWarehouseAccount || undefined } })}
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
function UomSection() {
  const queryClient = useQueryClient()
  const [showNew, setShowNew] = useState(false)
  const [newUom, setNewUom] = useState('')

  const { data, isLoading } = useQuery({ queryKey: ['uom'], queryFn: listUOMs })

  const createMutation = useMutation({
    mutationFn: () => createUOM({ uomName: newUom, mustBeWholeNumber: false }),
    onSuccess: () => { toast.success('Unidad creada'); queryClient.invalidateQueries({ queryKey: ['uom'] }); setShowNew(false); setNewUom('') },
    onError: () => toast.error('Error al crear la unidad'),
  })

  return (
    <>
      <div className="card">
        <div className="card-header">
          <span className="card-title">Unidades de Medida</span>
          <button className="btn btn-primary btn-size-sm" onClick={() => setShowNew(true)}>
            <Plus size={14} />Nueva
          </button>
        </div>
        <div className="card-body">
          {isLoading
            ? <span className="skeleton-box" style={{ height: 80, display: 'block' }} />
            : (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {data?.map((u) => <span key={u.name} className="badge badge-default">{u.name}</span>)}
                </div>
              )}
        </div>
      </div>

      {showNew && (
        <div className="modal-overlay" onClick={() => setShowNew(false)}>
          <div className="modal-box modal-box-sm" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <h2 className="modal-title">Nueva Unidad de Medida</h2>
              <button className="modal-close" onClick={() => setShowNew(false)}><X size={16} /></button>
            </div>
            <div className="modal-body">
              <div className="ff-wrap">
                <label className="ff-label">Nombre</label>
                <input className="ff-input" value={newUom} onChange={(e) => setNewUom(e.target.value)} placeholder="Caja, Litro, Kg…" />
              </div>
            </div>
            <div className="modal-foot">
              <button className="btn btn-secondary" onClick={() => setShowNew(false)}>Cancelar</button>
              <button className="btn btn-primary" onClick={() => createMutation.mutate()} disabled={!newUom || createMutation.isPending}>
                {createMutation.isPending ? 'Creando…' : 'Crear'}
              </button>
            </div>
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
                      <td style={{ fontWeight: 500 }}>{l.priceListName}</td>
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
function PerfilSection() {
  const queryClient = useQueryClient()
  const { data, isLoading } = useQuery({ queryKey: ['perfil'], queryFn: getPerfil })

  const [form, setForm] = useState<Record<string, string>>({})

  useEffect(() => {
    if (data && typeof data === 'object') {
      setForm(data as Record<string, string>)
    }
  }, [data])

  const saveMutation = useMutation({
    mutationFn: () => updatePerfil(form),
    onSuccess: () => { toast.success('Perfil actualizado'); queryClient.invalidateQueries({ queryKey: ['perfil'] }) },
    onError: () => toast.error('Error al actualizar el perfil'),
  })

  if (isLoading) return <span className="skeleton-box" style={{ height: 192, display: 'block' }} />

  return (
    <div className="card">
      <div className="card-header">
        <span className="card-title">Mi Perfil</span>
      </div>
      <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {Object.entries(form).map(([key, value]) => (
          <div key={key} className="ff-wrap">
            <label className="ff-label" style={{ textTransform: 'capitalize' }}>
              {key.replace(/([A-Z])/g, ' $1').trim()}
            </label>
            <input
              className="ff-input"
              value={value ?? ''}
              onChange={(e) => setForm((prev) => ({ ...prev, [key]: e.target.value }))}
            />
          </div>
        ))}
        <div>
          <button className="btn btn-primary" onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
            <Save size={16} />
            {saveMutation.isPending ? 'Guardando…' : 'Guardar Perfil'}
          </button>
        </div>
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
      toast.success(editTarget ? 'Template actualizado' : 'Template creado')
      queryClient.invalidateQueries({ queryKey: [queryKey] })
      closeForm()
    },
    onError: () => toast.error('Error al guardar el template'),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteFn(id),
    onSuccess: () => {
      toast.success('Template eliminado')
      queryClient.invalidateQueries({ queryKey: [queryKey] })
      setToDelete(null)
    },
    onError: () => toast.error('Error al eliminar el template'),
  })

  const label = kind === 'ventas' ? 'Ventas' : 'Compras'

  return (
    <>
      <div className="card">
        <div className="card-header">
          <span className="card-title">Templates de Impuesto — {label}</span>
          <button className="btn btn-primary btn-size-sm" onClick={openCreate}>
            <Plus size={14} /> Nuevo
          </button>
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
                              <span key={i} style={{ display: 'block', fontSize: 12 }}>
                                {l.description || l.chargeType} — {l.rate}%
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
              <h2 className="modal-title">{editTarget ? 'Editar Template' : 'Nuevo Template'} — {label}</h2>
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
                    Template por defecto
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
                        <th style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 500, color: 'var(--text-secondary)', fontSize: 11 }}>Descripción</th>
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
                          <td style={{ padding: '6px 8px' }}>
                            <input
                              className="ff-input"
                              style={{ fontSize: 12, padding: '4px 8px' }}
                              placeholder="ITBIS por Pagar - ACC"
                              value={line.accountHead}
                              onChange={(e) => updateTaxLine(idx, { accountHead: e.target.value })}
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
                              placeholder="Opcional"
                              value={line.description ?? ''}
                              onChange={(e) => updateTaxLine(idx, { description: e.target.value })}
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
                disabled={!formTitle || formTaxes.some((l) => !l.accountHead) || saveMutation.isPending}
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
  'ejercicio-fiscal': 'Ejercicio Fiscal',
  perfil: 'Mi Perfil',
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
    'ejercicio-fiscal': <EjercicioFiscalSection />,
    perfil: <PerfilSection />,
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
