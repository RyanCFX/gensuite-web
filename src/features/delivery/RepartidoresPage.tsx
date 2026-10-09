// Repartidores (Driver) — docs/tasks/PROMPT_DELIVERY_FRONTEND.md §4.3.

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Plus, Pencil, Users } from 'lucide-react'
import { listRepartidores, createRepartidor, updateRepartidor } from '@/shared/api/delivery'
import type { ApiError, DeliveryRepartidor, CreateRepartidorDto } from '@/shared/api/types'
import { usePuede } from '@/shared/permissions/can'
import { PageHeader } from '@/components/shared/PageHeader'
import { RecargarButton } from '@/components/shared/RecargarButton'
import { FilterField } from '@/shared/ui/FilterField'
import { SearchInput } from '@/shared/ui/SearchInput'
import { Select, SelectItem } from '@/components/ui/select'
import { Modal } from '@/shared/ui/Modal'
import { useResizableColumns } from '@/shared/hooks/useResizableColumns'
import { useDeliveryPuerta, DrenajeAviso } from '@/shared/hooks/useDelivery'
import { DeliveryErrorAlert } from './viajeUi'
import { DeliveryPagination } from './DeliveryPagination'
import { PhoneInput } from '@/shared/ui/PhoneInput'
import { normalizarTelefonoDo } from '@/lib/formatters'
import { OpcionesSelect } from '@/shared/ui/OpcionesSelect'

const COLUMNS = [
  { key: 'nombre', width: 220 },
  { key: 'telefono', width: 130 },
  { key: 'licencia', width: 130 },
  { key: 'transportista', width: 180 },
  { key: 'vehiculo', width: 130 },
  { key: 'usuario', width: 180 },
  { key: 'estado', width: 110 },
  { key: 'actions', width: 80 },
]

const PAGE_SIZE = 20

type Estado = 'activo' | 'suspendido' | 'retirado'
const ESTADO_LABEL: Record<Estado, string> = { activo: 'Activo', suspendido: 'Suspendido', retirado: 'Retirado' }
const ESTADO_BADGE: Record<Estado, string> = { activo: 'badge-success', suspendido: 'badge-warning', retirado: 'badge-neutral' }

interface FormState {
  nombre: string
  telefono: string
  licencia: string
  usuario: string
  transportista: string
  vehiculoPorDefecto: string
  estado: Estado
}

function formDe(r?: DeliveryRepartidor | null): FormState {
  return {
    nombre: r?.nombre ?? '',
    telefono: normalizarTelefonoDo(r?.telefono ?? ''),
    licencia: r?.licencia ?? '',
    usuario: r?.usuario ?? '',
    transportista: r?.transportista ?? '',
    vehiculoPorDefecto: r?.vehiculoPorDefecto ?? '',
    estado: r?.estado ?? 'activo',
  }
}

export default function RepartidoresPage() {
  const queryClient = useQueryClient()
  const puerta = useDeliveryPuerta()
  const puedeCrear = usePuede('delivery.repartidores.crear') && puerta.operativo
  const puedeEditar = usePuede('delivery.repartidores.editar') && puerta.operativo
  const puedeVerUsuarios = usePuede('usuarios.listar')

  const [estado, setEstado] = useState('todos')
  const [q, setQ] = useState('')
  const [page, setPage] = useState(1)
  const offset = (page - 1) * PAGE_SIZE
  const { widths: colWidths, startResize } = useResizableColumns(COLUMNS)

  const [modalOpen, setModalOpen] = useState(false)
  const [editando, setEditando] = useState<DeliveryRepartidor | null>(null)
  const [form, setForm] = useState<FormState>(formDe())
  const [error, setError] = useState<ApiError | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ['delivery-repartidores', { estado, q, offset }],
    queryFn: () => listRepartidores({
      estado: estado === 'todos' ? undefined : estado,
      q: q || undefined,
      limit: PAGE_SIZE,
      offset,
    }),
  })
  const items = data?.items ?? []
  const total = data?.meta.total ?? 0

  function abrir(r: DeliveryRepartidor | null) {
    setEditando(r)
    setForm(formDe(r))
    setError(null)
    setModalOpen(true)
  }

  const guardar = useMutation({
    mutationFn: () => {
      const base: CreateRepartidorDto = { nombre: form.nombre.trim(), estado: form.estado }
      const opc = ['telefono', 'licencia', 'usuario', 'transportista'] as const
      for (const k of opc) {
        const v = form[k].trim()
        if (v) base[k] = v
      }
      const vehiculo = form.vehiculoPorDefecto.trim()
      if (vehiculo) base.vehiculoPorDefecto = vehiculo
      if (!editando) return createRepartidor(base)
      // Editar: solo lo que cambió (vaciar un campo no se envía — el BFF no documenta "borrar").
      const original = formDe(editando)
      const patch: Partial<CreateRepartidorDto> = {}
      if (base.nombre && base.nombre !== original.nombre) patch.nombre = base.nombre
      if (form.estado !== original.estado) patch.estado = form.estado
      for (const k of opc) {
        const v = form[k].trim()
        if (v && v !== original[k]) patch[k] = v
      }
      // Vehículo por defecto: "" lo quita (PUT) — por eso se envía aunque quede vacío.
      if (vehiculo !== original.vehiculoPorDefecto) patch.vehiculoPorDefecto = vehiculo
      return updateRepartidor(editando.id, patch)
    },
    onSuccess: () => {
      toast.success(editando ? 'Repartidor actualizado' : 'Repartidor creado')
      queryClient.invalidateQueries({ queryKey: ['delivery-repartidores'] })
      setModalOpen(false)
    },
    // El 403 por falta de rol de administración en ERPNext se muestra tal cual (message del BFF).
    onError: (err: ApiError) => setError(err),
  })

  const valido = form.nombre.trim().length > 0

  function set<K extends keyof FormState>(k: K, v: FormState[K]) {
    setForm((f) => ({ ...f, [k]: v }))
  }

  return (
    <div className="page-container">
      <PageHeader
        title={<><span className="page-title-dot" />Repartidores</>}
        description="Personas (o empresas externas) que entregan las ventas con delivery."
        action={
          <>
            <RecargarButton />
            {puedeCrear && (
              <button className="btn btn-navy" onClick={() => abrir(null)}>
                <Plus size={16} /> Nuevo repartidor
              </button>
            )}
          </>
        }
      />

      {puerta.drenaje && <DrenajeAviso />}

      <div className="card filter-card-navy" style={{ marginBottom: 20 }}>
        <div className="card-body">
          <div className="filter-bar" style={{ margin: 0 }}>
            <div className="filter-bar-left" style={{ flexWrap: 'wrap', gap: 10 }}>
              <FilterField label="Estado">
                <Select value={estado} onValueChange={(v) => { setEstado(v); setPage(1) }} clearable={false}>
                  <SelectItem value="todos">Todos</SelectItem>
                  <SelectItem value="activo">Activo</SelectItem>
                  <SelectItem value="suspendido">Suspendido</SelectItem>
                  <SelectItem value="retirado">Retirado</SelectItem>
                </Select>
              </FilterField>
              <FilterField label="Buscar">
                <SearchInput variant="field" placeholder="Nombre, teléfono, licencia…" value={q} onChange={(v) => { setQ(v); setPage(1) }} />
              </FilterField>
            </div>
          </div>
        </div>
      </div>

      <div className="card navy-table-card">
        <div className="table-scroll">
          <table className="data-table navy-table items-table-resizable">
            <colgroup>
              {COLUMNS.map((c) => <col key={c.key} style={{ width: colWidths[c.key] }} />)}
            </colgroup>
            <thead>
              <tr>
                <th>Nombre<span className="col-resize-handle" onMouseDown={startResize('nombre')} /></th>
                <th>Teléfono<span className="col-resize-handle" onMouseDown={startResize('telefono')} /></th>
                <th>Licencia<span className="col-resize-handle" onMouseDown={startResize('licencia')} /></th>
                <th>Transportista<span className="col-resize-handle" onMouseDown={startResize('transportista')} /></th>
                <th>Vehículo<span className="col-resize-handle" onMouseDown={startResize('vehiculo')} /></th>
                <th>Usuario<span className="col-resize-handle" onMouseDown={startResize('usuario')} /></th>
                <th>Estado<span className="col-resize-handle" onMouseDown={startResize('estado')} /></th>
                <th />
              </tr>
            </thead>
            <tbody>
              {isLoading
                ? Array.from({ length: 5 }).map((_, i) => (
                    <tr key={i}>{COLUMNS.map((c) => <td key={c.key}><div className="skeleton-box" style={{ height: 14, width: '100%' }} /></td>)}</tr>
                  ))
                : items.length === 0
                  ? (
                      <tr>
                        <td colSpan={COLUMNS.length}>
                          <div className="empty-state">
                            <span className="empty-icon"><Users size={20} /></span>
                            <p className="empty-title">Sin repartidores</p>
                          </div>
                        </td>
                      </tr>
                    )
                  : items.map((r) => (
                      <tr key={r.id}>
                        <td style={{ fontWeight: 600 }}>{r.nombre}</td>
                        <td className="td-muted">{r.telefono ?? '—'}</td>
                        <td className="td-muted">{r.licencia ?? '—'}</td>
                        <td className="td-muted">{r.transportista ?? '—'}</td>
                        <td className="td-muted">{r.vehiculoPorDefecto ?? '—'}</td>
                        <td className="td-muted">{r.usuario ?? '—'}</td>
                        <td><span className={`badge ${ESTADO_BADGE[r.estado] ?? 'badge-neutral'}`}>{ESTADO_LABEL[r.estado] ?? r.estado}</span></td>
                        <td style={{ textAlign: 'right' }}>
                          {puedeEditar && (
                            <button className="btn btn-ghost btn-size-icon-sm" title="Editar" onClick={() => abrir(r)}>
                              <Pencil size={14} />
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
            </tbody>
          </table>
        </div>
      </div>

      <DeliveryPagination page={page} pageSize={PAGE_SIZE} total={total} hasMore={data?.meta.hasMore} onPage={setPage} />

      <Modal
        open={modalOpen}
        onClose={() => !guardar.isPending && setModalOpen(false)}
        title={editando ? 'Editar repartidor' : 'Nuevo repartidor'}
        subtitle={editando?.id}
        footer={
          <>
            <button className="btn btn-ghost" onClick={() => setModalOpen(false)} disabled={guardar.isPending}>Cancelar</button>
            <button className="btn btn-primary" disabled={!valido || guardar.isPending} onClick={() => { setError(null); guardar.mutate() }}>
              {guardar.isPending ? <span className="spinner spinner-white spinner-sm" /> : 'Guardar'}
            </button>
          </>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div className="ff-wrap">
            <label className="ff-label ff-required">Nombre completo</label>
            <input className="ff-input" value={form.nombre} onChange={(e) => set('nombre', e.target.value)} />
          </div>
          <div className="form-row">
            <div className="ff-wrap">
              <label className="ff-label">Teléfono</label>
              <PhoneInput value={form.telefono} onChange={(v) => set('telefono', v)} />
            </div>
            <div className="ff-wrap">
              <label className="ff-label">Licencia</label>
              <input className="ff-input" value={form.licencia} onChange={(e) => set('licencia', e.target.value)} />
            </div>
          </div>
          {puedeVerUsuarios && (
            <div className="ff-wrap">
              <label className="ff-label">Usuario del sistema</label>
              <OpcionesSelect
                recurso="usuarios"
                value={form.usuario}
                onChange={(v, opt) => {
                  set('usuario', v)
                  // El nombre viene solo del usuario elegido (el label es su nombre completo).
                  if (v && opt?.label) set('nombre', opt.label)
                }}
                placeholder="Buscar usuario…"
              />
            </div>
          )}
          <div className="ff-wrap">
            <label className="ff-label">Transportista externo</label>
            {/* Debe ser un proveedor ya registrado: se manda su ID. */}
            <OpcionesSelect
              recurso="proveedores"
              value={form.transportista}
              onChange={(v) => set('transportista', v)}
              placeholder="Proveedor (empresa o motoconcho externo, opcional)"
              selectedLabel={editando?.transportista && editando.transportista === form.transportista ? editando.transportista : undefined}
            />
          </div>
          <div className="ff-wrap">
            <label className="ff-label">Vehículo por defecto</label>
            <OpcionesSelect
              recurso="vehiculos"
              value={form.vehiculoPorDefecto}
              onChange={(v) => set('vehiculoPorDefecto', v)}
              placeholder="Se preselecciona al crear viajes (opcional)"
              selectedLabel={form.vehiculoPorDefecto || undefined}
            />
          </div>
          <div className="ff-wrap">
            <label className="ff-label">Estado</label>
            <Select value={form.estado} onValueChange={(v) => set('estado', v as Estado)} clearable={false}>
              <SelectItem value="activo">Activo</SelectItem>
              <SelectItem value="suspendido">Suspendido</SelectItem>
              <SelectItem value="retirado">Retirado</SelectItem>
            </Select>
          </div>
          {error && <DeliveryErrorAlert err={error} />}
        </div>
      </Modal>
    </div>
  )
}
