// Vehículos — docs/tasks/PROMPT_DELIVERY_FRONTEND.md §4.3. id = placa.

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Plus, Pencil, Car } from 'lucide-react'
import { listVehiculos, createVehiculo, updateVehiculo } from '@/shared/api/delivery'
import type { ApiError, DeliveryVehiculo } from '@/shared/api/types'
import { usePuede } from '@/shared/permissions/can'
import { PageHeader } from '@/components/shared/PageHeader'
import { RecargarButton } from '@/components/shared/RecargarButton'
import { FilterField } from '@/shared/ui/FilterField'
import { SearchInput } from '@/shared/ui/SearchInput'
import { Modal } from '@/shared/ui/Modal'
import { useResizableColumns } from '@/shared/hooks/useResizableColumns'
import { useDeliveryPuerta, DrenajeAviso } from '@/shared/hooks/useDelivery'
import { DeliveryErrorAlert } from './viajeUi'
import { DeliveryPagination } from './DeliveryPagination'

const COLUMNS = [
  { key: 'placa', width: 140 },
  { key: 'marca', width: 180 },
  { key: 'modelo', width: 180 },
  { key: 'color', width: 140 },
  { key: 'actions', width: 80 },
]

const PAGE_SIZE = 20

interface FormState { placa: string; marca: string; modelo: string; color: string }
const vacio = (): FormState => ({ placa: '', marca: '', modelo: '', color: '' })

export default function VehiculosPage() {
  const queryClient = useQueryClient()
  const puerta = useDeliveryPuerta()
  const puedeCrear = usePuede('config.delivery.gestionar') && puerta.operativo
  const puedeEditar = usePuede('config.delivery.gestionar') && puerta.operativo

  const [q, setQ] = useState('')
  const [page, setPage] = useState(1)
  const offset = (page - 1) * PAGE_SIZE
  const { widths: colWidths, startResize } = useResizableColumns(COLUMNS)

  const [modalOpen, setModalOpen] = useState(false)
  const [editando, setEditando] = useState<DeliveryVehiculo | null>(null)
  const [form, setForm] = useState<FormState>(vacio())
  const [error, setError] = useState<ApiError | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ['delivery-vehiculos', { q, offset }],
    queryFn: () => listVehiculos({ search: q || undefined, limit: PAGE_SIZE, offset }),
  })
  const items = data?.items ?? []
  const total = data?.meta.total ?? 0

  function abrir(v: DeliveryVehiculo | null) {
    setEditando(v)
    setForm(v ? { placa: v.placa, marca: v.marca ?? '', modelo: v.modelo ?? '', color: v.color ?? '' } : vacio())
    setError(null)
    setModalOpen(true)
  }

  const guardar = useMutation({
    mutationFn: () => {
      const marca = form.marca.trim()
      const modelo = form.modelo.trim()
      const color = form.color.trim()
      if (!editando) {
        return createVehiculo({ placa: form.placa.trim(), marca, modelo, ...(color ? { color } : {}) })
      }
      return updateVehiculo(editando.id, {
        ...(marca && marca !== editando.marca ? { marca } : {}),
        ...(modelo && modelo !== editando.modelo ? { modelo } : {}),
        ...(color && color !== (editando.color ?? '') ? { color } : {}),
      })
    },
    onSuccess: () => {
      toast.success(editando ? 'Vehículo actualizado' : 'Vehículo creado')
      queryClient.invalidateQueries({ queryKey: ['delivery-vehiculos'] })
      setModalOpen(false)
    },
    onError: (err: ApiError) => setError(err),
  })

  const valido = (editando || form.placa.trim()) && form.marca.trim() && form.modelo.trim()

  return (
    <div className="page-container">
      <PageHeader
        title={<><span className="page-title-dot" />Vehículos</>}
        description="Vehículos disponibles para los viajes de delivery."
        action={
          <>
            <RecargarButton />
            {puedeCrear && (
              <button className="btn btn-navy" onClick={() => abrir(null)}>
                <Plus size={16} /> Nuevo vehículo
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
              <FilterField label="Buscar">
                <SearchInput variant="field" placeholder="Placa, marca, modelo…" value={q} onChange={(v) => { setQ(v); setPage(1) }} />
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
                <th>Placa<span className="col-resize-handle" onMouseDown={startResize('placa')} /></th>
                <th>Marca<span className="col-resize-handle" onMouseDown={startResize('marca')} /></th>
                <th>Modelo<span className="col-resize-handle" onMouseDown={startResize('modelo')} /></th>
                <th>Color<span className="col-resize-handle" onMouseDown={startResize('color')} /></th>
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
                            <span className="empty-icon"><Car size={20} /></span>
                            <p className="empty-title">Sin vehículos</p>
                          </div>
                        </td>
                      </tr>
                    )
                  : items.map((v) => (
                      <tr key={v.id}>
                        <td style={{ fontWeight: 600 }}>{v.placa}</td>
                        <td>{v.marca ?? '—'}</td>
                        <td>{v.modelo ?? '—'}</td>
                        <td className="td-muted">{v.color ?? '—'}</td>
                        <td style={{ textAlign: 'right' }}>
                          {puedeEditar && (
                            <button className="btn btn-ghost btn-size-icon-sm" title="Editar" onClick={() => abrir(v)}>
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
        title={editando ? 'Editar vehículo' : 'Nuevo vehículo'}
        subtitle={editando?.placa}
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
            <label className="ff-label ff-required">Placa</label>
            <input className="ff-input" value={form.placa} disabled={!!editando} onChange={(e) => setForm((f) => ({ ...f, placa: e.target.value }))} />
            {editando && <span className="ff-hint">La placa identifica al vehículo y no se puede cambiar.</span>}
          </div>
          <div className="form-row">
            <div className="ff-wrap">
              <label className="ff-label ff-required">Marca</label>
              <input className="ff-input" value={form.marca} onChange={(e) => setForm((f) => ({ ...f, marca: e.target.value }))} />
            </div>
            <div className="ff-wrap">
              <label className="ff-label ff-required">Modelo</label>
              <input className="ff-input" value={form.modelo} onChange={(e) => setForm((f) => ({ ...f, modelo: e.target.value }))} />
            </div>
          </div>
          <div className="ff-wrap">
            <label className="ff-label">Color</label>
            <input className="ff-input" value={form.color} onChange={(e) => setForm((f) => ({ ...f, color: e.target.value }))} />
          </div>
          {error && <DeliveryErrorAlert err={error} />}
        </div>
      </Modal>
    </div>
  )
}
