// Detalle de un Despacho — docs/tasks/PROMPT_DESPACHO_RESERVAS_ABASTECIMIENTO_FRONTEND.md §2.5-§2.13.

import { useState, useEffect } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { useQuery, useQueries, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { ArrowLeft, Pencil, Wrench, Send, Ban, Receipt, RotateCcw, Download, AlertTriangle, PackageCheck, Trash2 } from 'lucide-react'
import {
  getDespacho, updateDespacho, asignarTrackingDespacho, submitDespacho, cancelarDespacho,
  facturarDespacho, devolucionDespacho, downloadDespachoPdf, confirmarStockDespacho, deleteDespacho,
} from '@/shared/api/despachos'
import { getItemLookup } from '@/shared/api/catalog'
import { listWarehouses } from '@/shared/api/inventory'
import type { ComponentTracking, DespachoItemDto, ApiError, ConfirmarStockDespachoResult, DimensionesLinea, ItemDimensionDeclarada } from '@/shared/api/types'
import { CombinacionDimensionSelector, combinacionCompleta } from '@/components/shared/CombinacionDimensionSelector'
import { isApiErrorCode, ERROR_CODES } from '@/shared/api/client'
import { formatStockInsufficientMessage } from '@/lib/stockAlerts'
import { useItemsStock, resolveDisponible } from '@/shared/hooks/useItemsStock'
import { usePuede } from '@/shared/permissions/can'
import { formatDate } from '@/lib/formatters'
import { Modal, ConfirmModal } from '@/shared/ui/Modal'
import { ComponentTrackingModal } from '@/components/shared/ComponentTrackingModal'
import type { TrackedComponent } from '@/components/shared/ComponentTrackingModal'
import { SearchSelect } from '@/shared/ui/SearchSelect'
import { useResizableColumns } from '@/shared/hooks/useResizableColumns'
import { DESPACHO_STATUS_BADGE, DESPACHO_STATUS_LABEL, DELIVERY_STATUS_LABEL, extractInvoiceId } from './lib'
import { useOpcionesArray } from '@/shared/hooks/useOpciones'

const DESPACHO_ITEMS_COLUMNS = [
  { key: 'articulo', width: 240 },
  { key: 'cantidad', width: 110 },
  { key: 'almacen', width: 140 },
  { key: 'origen', width: 140 },
]

const CONFIRMAR_STOCK_COLUMNS = [
  { key: 'articulo', width: 240 },
  { key: 'pendiente', width: 100 },
  { key: 'almacenDestino', width: 160 },
  { key: 'traerDesde', width: 260 },
]

const EDIT_DESPACHO_COLUMNS = [
  { key: 'articulo', width: 240 },
  { key: 'cantidad', width: 140 },
  { key: 'almacen', width: 260 },
  { key: 'dimension', width: 160 },
]

export default function DespachoDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { widths: itemsColWidths, startResize: startItemsResize } = useResizableColumns(DESPACHO_ITEMS_COLUMNS)

  const puedeEditar = usePuede('despachos.editar')
  const puedeSometer = usePuede('despachos.someter')
  const puedeCancelar = usePuede('despachos.cancelar')
  const puedeFacturar = usePuede('despachos.facturar')
  const puedeDevolver = usePuede('despachos.devolver')
  const puedeImprimir = usePuede('despachos.imprimir')

  const [editOpen, setEditOpen] = useState(false)
  const [trackingOpen, setTrackingOpen] = useState(false)
  const [confirmarStockOpen, setConfirmarStockOpen] = useState(false)
  const [confirmSubmit, setConfirmSubmit] = useState(false)
  const [confirmCancel, setConfirmCancel] = useState(false)
  const [cancelReason, setCancelReason] = useState('')
  const [confirmFacturar, setConfirmFacturar] = useState(false)
  const [confirmDevolucion, setConfirmDevolucion] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [facturaRedirect, setFacturaRedirect] = useState<{ id: string; msg: string } | null>(null)
  const [downloading, setDownloading] = useState(false)

  const { data: despacho, isLoading, isError } = useQuery({
    queryKey: ['despacho', id],
    queryFn: () => getDespacho(id!),
    enabled: !!id,
  })

  function invalidateAll() {
    queryClient.invalidateQueries({ queryKey: ['despacho', id] })
    queryClient.invalidateQueries({ queryKey: ['despachos'] })
    queryClient.invalidateQueries({ queryKey: ['despachos-pendientes'] })
  }

  // Detección proactiva de líneas con serial/lote (§2.8). El shape documentado del despacho no
  // trae un campo "ya tiene bundle asignado" por línea, así que mostramos el CTA siempre que haya
  // artículos con tracking — "Someter" queda igual habilitado; si falta asignar, ERPNext lo
  // rechaza al someter con su propio mensaje (§2.11), que se muestra tal cual sin traducir.
  const uniqueItemCodes = [...new Set((despacho?.items ?? []).map((i) => i.itemCode))]
  const itemQueries = useQueries({
    queries: uniqueItemCodes.map((code) => ({
      queryKey: ['item-tracking-type', code],
      queryFn: () => getItemLookup(code),
      staleTime: 5 * 60_000,
      enabled: despacho?.status === 'draft',
    })),
  })
  const trackedItemCodes = new Set(
    itemQueries
      .map((q) => q.data)
      .filter((it): it is NonNullable<typeof it> => !!it && !!it.trackingType && it.trackingType !== 'none')
      .map((it) => it.id),
  )
  const trackedLines = (despacho?.items ?? []).filter((i) => trackedItemCodes.has(i.itemCode))
  const trackedComponents: TrackedComponent[] = trackedLines.map((l) => {
    const item = itemQueries.find((q) => q.data?.id === l.itemCode)?.data
    return {
      itemCode: l.itemCode,
      itemName: l.itemName,
      trackingType: (item?.trackingType as 'serial' | 'batch') ?? 'serial',
      qtyNeeded: l.qty,
      warehouse: l.warehouse,
    }
  })

  const submitMutation = useMutation({
    mutationFn: () => submitDespacho(id!),
    onSuccess: () => { toast.success('Despacho sometido — salida de inventario registrada'); invalidateAll(); setConfirmSubmit(false) },
    onError: (err: ApiError) => {
      setConfirmSubmit(false)
      if (isApiErrorCode(err, ERROR_CODES.STOCK_INSUFFICIENT_OR_RESERVED)) {
        toast.error(formatStockInsufficientMessage(err), { duration: 8000 })
        return
      }
      toast.error(err?.message ?? 'Error al someter el despacho')
    },
  })

  const cancelMutation = useMutation({
    mutationFn: () => cancelarDespacho(id!, { reason: cancelReason.trim() }),
    onSuccess: () => { toast.success('Despacho cancelado'); invalidateAll(); setConfirmCancel(false); setCancelReason('') },
    onError: (err: { message?: string }) => toast.error(err?.message ?? 'Error al cancelar el despacho'),
  })

  const facturarMutation = useMutation({
    mutationFn: () => facturarDespacho(id!),
    onSuccess: (res) => {
      toast.success(res.message)
      invalidateAll()
      setConfirmFacturar(false)
      navigate(`/facturas/${res.invoiceId}`)
    },
    onError: (err: { message?: string }) => { toast.error(err?.message ?? 'Error al facturar el despacho'); setConfirmFacturar(false) },
  })

  // Regla crítica §2.10: si el despacho ya tiene una factura sometida encima, el servidor rechaza
  // con 400 y hay que redirigir a Devoluciones con el invoiceId extraído — no es un error genérico.
  const devolucionMutation = useMutation({
    mutationFn: () => devolucionDespacho(id!),
    onSuccess: (nuevo) => {
      toast.success(`Devolución ${nuevo.id} creada en Borrador`)
      invalidateAll()
      setConfirmDevolucion(false)
      navigate(`/despachos/${nuevo.id}`)
    },
    onError: (err: { message?: string }) => {
      setConfirmDevolucion(false)
      const msg = err?.message ?? 'Error al crear la devolución'
      const invoiceId = extractInvoiceId(msg)
      if (invoiceId) {
        setFacturaRedirect({ id: invoiceId, msg })
        return
      }
      toast.error(msg)
    },
  })

  const trackingMutation = useMutation({
    mutationFn: (tracking: ComponentTracking[]) => asignarTrackingDespacho(id!, { items: tracking }),
    onSuccess: () => { toast.success('Serial/lote asignado'); invalidateAll(); setTrackingOpen(false) },
    onError: (err: { message?: string }) => toast.error(err?.message ?? 'Error al asignar serial/lote'),
  })

  const editMutation = useMutation({
    mutationFn: (items: DespachoItemDto[]) => updateDespacho(id!, { items }),
    onSuccess: () => { toast.success('Despacho actualizado'); invalidateAll(); setEditOpen(false) },
    onError: (err: { message?: string }) => toast.error(err?.message ?? 'Error al actualizar el despacho'),
  })

  // docs/tasks/75_almacen_venta_confirmar_stock_uoms_permitidas.md §2 — no somete el despacho,
  // solo resuelve el faltante de stock. "Someter" sigue siendo un paso separado después.
  const confirmarStockMutation = useMutation({
    mutationFn: (items: { itemCode: string; sourceWarehouse: string }[]) => confirmarStockDespacho(id!, { items }),
    onSuccess: (res: ConfirmarStockDespachoResult) => {
      toast.success(res.message)
      invalidateAll()
      setConfirmarStockOpen(false)
    },
    onError: (err: ApiError) => {
      if (isApiErrorCode(err, ERROR_CODES.STOCK_INSUFFICIENT_OR_RESERVED)) {
        toast.error(formatStockInsufficientMessage(err), { duration: 8000 })
        return
      }
      toast.error(err?.message ?? 'Error al confirmar el stock')
    },
  })

  // DELETE /despachos/:id — solo para Borrador (nunca sometido). Un despacho sometido se cancela
  // con cancelarDespacho, nunca se elimina — docs/tasks/75_....md §2.4.
  const deleteMutation = useMutation({
    mutationFn: () => deleteDespacho(id!),
    onSuccess: () => {
      toast.success('Despacho eliminado')
      queryClient.invalidateQueries({ queryKey: ['despachos'] })
      queryClient.invalidateQueries({ queryKey: ['despachos-pendientes'] })
      navigate('/despachos')
    },
    onError: (err: { message?: string }) => { toast.error(err?.message ?? 'Error al eliminar el despacho'); setConfirmDelete(false) },
  })

  async function handleDownload() {
    setDownloading(true)
    try {
      await downloadDespachoPdf(id!)
    } catch {
      toast.error('Error al descargar el PDF')
    } finally {
      setDownloading(false)
    }
  }

  if (isLoading) {
    return (
      <div className="page-container">
        <span className="skeleton-box" style={{ height: 28, width: 240, display: 'block', marginBottom: 16 }} />
        <span className="skeleton-box" style={{ height: 220, width: '100%', display: 'block' }} />
      </div>
    )
  }

  if (isError || !despacho) {
    return (
      <div className="page-container">
        <a className="page-back-link" onClick={() => navigate('/despachos')}><ArrowLeft size={14} /> Despachos</a>
        <div style={{ textAlign: 'center', padding: '48px 0', color: 'var(--text-tertiary)' }}>No se encontró el despacho</div>
      </div>
    )
  }

  const cancelReasonValid = cancelReason.trim().length >= 10 && cancelReason.trim().length <= 500

  return (
    <div className="page-container">
      <a className="page-back-link" onClick={() => navigate('/despachos')}><ArrowLeft size={14} /> Despachos</a>

      <div className="page-header">
        <div>
          <h1 className="page-title" style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span className="page-title-dot" />
            {despacho.id}
            <span className={`badge ${DESPACHO_STATUS_BADGE[despacho.status]}`}>{DESPACHO_STATUS_LABEL[despacho.status]}</span>
            <span className="badge badge-neutral" title="Estado nativo de ERPNext — informativo">{DELIVERY_STATUS_LABEL[despacho.deliveryStatus]}</span>
            {despacho.isReturn && <span className="badge badge-cancelled">Devolución</span>}
          </h1>
          <p className="page-sub">
            {despacho.customerName} · {formatDate(despacho.postingDate)}
            {despacho.isReturn && despacho.returnAgainst && (
              <> · Devolución de <Link to={`/despachos/${despacho.returnAgainst}`}>{despacho.returnAgainst}</Link></>
            )}
          </p>
        </div>
      </div>

      {despacho.status === 'draft' && trackedLines.length > 0 && (
        <div className="inline-alert inline-alert-info" style={{ marginBottom: 16 }}>
          <Wrench size={16} />
          <span>
            Este despacho tiene {trackedLines.length} línea(s) con artículos de serial/lote — asigná el
            tracking antes de someter, o el servidor lo rechazará.
          </span>
        </div>
      )}

      <div className="doc-actions-bar" style={{ background: 'transparent', border: 'none', padding: 0, marginBottom: 16 }}>
        {despacho.status === 'draft' && puedeEditar && (
          <button className="btn btn-ghost btn-size-md" onClick={() => setEditOpen(true)}>
            <Pencil size={14} /> Editar
          </button>
        )}
        {despacho.status === 'draft' && puedeEditar && trackedLines.length > 0 && (
          <button className="btn btn-ghost btn-size-md" onClick={() => setTrackingOpen(true)}>
            <Wrench size={14} /> Asignar serial/lote
          </button>
        )}
        {despacho.status === 'draft' && puedeEditar && (
          <button className="btn btn-ghost btn-size-md" onClick={() => setConfirmarStockOpen(true)}>
            <PackageCheck size={14} /> Confirmar stock
          </button>
        )}
        {despacho.status === 'draft' && puedeSometer && (
          <button className="btn btn-navy btn-size-md" onClick={() => setConfirmSubmit(true)} disabled={submitMutation.isPending}>
            <Send size={14} /> Someter
          </button>
        )}
        {despacho.status === 'draft' && puedeEditar && (
          <button className="btn btn-danger btn-size-md" onClick={() => setConfirmDelete(true)} disabled={deleteMutation.isPending}>
            <Trash2 size={14} /> Eliminar
          </button>
        )}
        {despacho.status === 'submitted' && puedeCancelar && (
          <button className="btn btn-danger btn-size-md" onClick={() => setConfirmCancel(true)} disabled={cancelMutation.isPending}>
            <Ban size={14} /> Cancelar
          </button>
        )}
        {despacho.status === 'submitted' && !despacho.salesInvoice && puedeFacturar && (
          <button className="btn btn-navy btn-size-md" onClick={() => setConfirmFacturar(true)} disabled={facturarMutation.isPending}>
            <Receipt size={14} /> Facturar
          </button>
        )}
        {despacho.status === 'submitted' && !despacho.isReturn && puedeDevolver && (
          <button className="btn btn-secondary btn-size-md" onClick={() => setConfirmDevolucion(true)} disabled={devolucionMutation.isPending}>
            <RotateCcw size={14} /> Crear Devolución
          </button>
        )}
        {despacho.status === 'submitted' && puedeImprimir && (
          <button className="btn btn-ghost btn-size-md" onClick={handleDownload} disabled={downloading}>
            <Download size={14} /> {downloading ? 'Descargando…' : 'Descargar PDF'}
          </button>
        )}
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-header navy-card-header"><h2 className="card-title">Información del Despacho</h2></div>
        <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div className="fields-grid">
            <div className="detail-field">
              <span className="detail-label">Cliente</span>
              <span className="detail-value">{despacho.customerName} ({despacho.customer})</span>
            </div>
            <div className="detail-field">
              <span className="detail-label">Fecha</span>
              <span className="detail-value">{formatDate(despacho.postingDate)}</span>
            </div>
            {despacho.salesOrder && (
              <div className="detail-field">
                <span className="detail-label">Pedido de origen</span>
                <span className="detail-value"><Link to={`/pedidos/${despacho.salesOrder}`}>{despacho.salesOrder}</Link></span>
              </div>
            )}
            {despacho.salesInvoice && (
              <div className="detail-field">
                <span className="detail-label">Factura de origen</span>
                <span className="detail-value"><Link to={`/facturas/${despacho.salesInvoice}`}>{despacho.salesInvoice}</Link></span>
              </div>
            )}
            {despacho.branch && (
              <div className="detail-field">
                <span className="detail-label">Sucursal</span>
                <span className="detail-value">{despacho.branch}</span>
              </div>
            )}
            {despacho.department && (
              <div className="detail-field">
                <span className="detail-label">Departamento</span>
                <span className="detail-value">{despacho.department}</span>
              </div>
            )}
          </div>

          {despacho.perBilled > 0 && despacho.perBilled < 100 && (
            <div className="detail-field">
              <span className="detail-label">% Facturado</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ flex: 1, maxWidth: 240, height: 6, borderRadius: 4, background: 'var(--border-subtle)', overflow: 'hidden' }}>
                  <div style={{ width: `${despacho.perBilled}%`, height: '100%', background: 'var(--brand-primary)' }} />
                </div>
                <span style={{ fontSize: 13 }}>{despacho.perBilled}%</span>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="card">
        <div className="table-scroll">
          <table className="data-table navy-table items-table-resizable">
            <colgroup>
              {DESPACHO_ITEMS_COLUMNS.map((c) => <col key={c.key} style={{ width: itemsColWidths[c.key] }} />)}
            </colgroup>
            <thead>
              <tr>
                <th>
                  Artículo
                  <span className="col-resize-handle" onMouseDown={startItemsResize('articulo')} />
                </th>
                <th style={{ textAlign: 'right' }}>
                  Cantidad
                  <span className="col-resize-handle" onMouseDown={startItemsResize('cantidad')} />
                </th>
                <th>
                  Almacén
                  <span className="col-resize-handle" onMouseDown={startItemsResize('almacen')} />
                </th>
                <th>
                  Origen
                  <span className="col-resize-handle" onMouseDown={startItemsResize('origen')} />
                </th>
              </tr>
            </thead>
            <tbody>
              {despacho.items.map((it, i) => (
                <tr key={i}>
                  <td>{it.itemName} <span className="td-muted">({it.itemCode})</span></td>
                  <td style={{ textAlign: 'right' }}>{it.qty} {it.uom}</td>
                  <td className="td-muted">{it.warehouse}</td>
                  <td className="td-muted">
                    {it.againstSalesInvoice ? <Link to={`/facturas/${it.againstSalesInvoice}`}>{it.againstSalesInvoice}</Link>
                      : it.againstSalesOrder ? <Link to={`/pedidos/${it.againstSalesOrder}`}>{it.againstSalesOrder}</Link>
                      : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {editOpen && (
        <EditDespachoModal
          items={despacho.items}
          onClose={() => setEditOpen(false)}
          onSave={(items) => editMutation.mutate(items)}
          loading={editMutation.isPending}
        />
      )}

      {confirmarStockOpen && (
        <ConfirmarStockModal
          items={despacho.items}
          onClose={() => setConfirmarStockOpen(false)}
          onConfirm={(items) => confirmarStockMutation.mutate(items)}
          loading={confirmarStockMutation.isPending}
        />
      )}

      {trackingOpen && (
        <ComponentTrackingModal
          bundleName={despacho.id}
          title="Asignar serial/lote"
          description="Selecciona exactamente la cantidad requerida de serial/lote para cada artículo antes de someter."
          components={trackedComponents}
          onConfirm={(tracking) => trackingMutation.mutate(tracking)}
          onClose={() => setTrackingOpen(false)}
          confirmLabel={trackingMutation.isPending ? 'Guardando…' : 'Asignar'}
        />
      )}

      <ConfirmModal
        open={confirmSubmit}
        onClose={() => setConfirmSubmit(false)}
        onConfirm={() => submitMutation.mutate()}
        title="Someter Despacho"
        description={`¿Confirmas someter ${despacho.id}? Acá ocurre la salida física real de inventario.`}
        confirmLabel="Someter"
        variant="default"
        loading={submitMutation.isPending}
      />

      <ConfirmModal
        open={confirmFacturar}
        onClose={() => setConfirmFacturar(false)}
        onConfirm={() => facturarMutation.mutate()}
        title="Facturar Despacho"
        description={`Se generará una factura en Borrador por lo despachado en ${despacho.id}. El NCF se asigna recién al someterla.`}
        confirmLabel="Facturar"
        variant="default"
        loading={facturarMutation.isPending}
      />

      <ConfirmModal
        open={confirmDevolucion}
        onClose={() => setConfirmDevolucion(false)}
        onConfirm={() => devolucionMutation.mutate()}
        title="Crear Devolución"
        description={`Se creará un nuevo despacho de devolución (en Borrador, cantidades en negativo) contra ${despacho.id} para que lo ajustes antes de someter.`}
        confirmLabel="Crear Devolución"
        variant="default"
        loading={devolucionMutation.isPending}
      />

      <ConfirmModal
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={() => deleteMutation.mutate()}
        title="Eliminar Despacho"
        description={`¿Confirmas eliminar ${despacho.id}? Es un Borrador — nunca se sometió, así que no hay salida de inventario que revertir. Esta acción no se puede deshacer.`}
        confirmLabel="Eliminar"
        variant="danger"
        loading={deleteMutation.isPending}
      />

      {confirmCancel && (
        <Modal
          open
          onClose={() => setConfirmCancel(false)}
          title="Cancelar Despacho"
          subtitle={`¿Confirmas cancelar ${despacho.id}?`}
          footer={
            <>
              <button className="btn btn-ghost" onClick={() => setConfirmCancel(false)}>Volver</button>
              <button
                className="btn btn-danger"
                onClick={() => cancelMutation.mutate()}
                disabled={!cancelReasonValid || cancelMutation.isPending}
              >
                <Ban size={14} /> Confirmar cancelación
              </button>
            </>
          }
        >
          <div className="ff-wrap">
            <label className="ff-label ff-required" htmlFor="cancelReason">Motivo de cancelación</label>
            <textarea
              id="cancelReason"
              className="ff-textarea"
              rows={3}
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              placeholder="Describe el motivo de la cancelación (mínimo 10 caracteres)"
              maxLength={500}
            />
            <p className="ff-hint">{cancelReason.trim().length}/500 caracteres (mínimo 10)</p>
          </div>
        </Modal>
      )}

      <Modal
        open={!!facturaRedirect}
        onClose={() => setFacturaRedirect(null)}
        title="Este despacho ya fue facturado"
        subtitle={facturaRedirect?.msg}
        footer={
          <>
            <button className="btn btn-ghost" onClick={() => setFacturaRedirect(null)}>Cerrar</button>
            <button className="btn btn-primary" onClick={() => facturaRedirect && navigate(`/devoluciones/nueva?invoiceId=${facturaRedirect.id}`)}>
              Ir a Devoluciones
            </button>
          </>
        }
      >
        <div className="inline-alert inline-alert-info" style={{ margin: 0 }}>
          <AlertTriangle size={16} />
          <span>
            La devolución de mercancía ya facturada emite la Nota de Crédito fiscal desde el módulo de
            Devoluciones, no desde Despachos.
          </span>
        </div>
      </Modal>
    </div>
  )
}

// docs/tasks/75_almacen_venta_confirmar_stock_uoms_permitidas.md §2.3 — un selector de almacén
// origen por línea (cualquier almacén de la compañía, a propósito no restringido a la sucursal
// del despacho). Solo hace falta elegir origen para las líneas que realmente tienen faltante en
// el almacén destino — se marcan las demás como "ya disponible" y su origen queda vacío/opcional
// (mandarlas igual no rompe nada: el backend las marca `transferido: false`).
function ConfirmarStockModal({
  items, onClose, onConfirm, loading,
}: {
  items: { itemCode: string; itemName: string; qty: number; warehouse: string }[]
  onClose: () => void
  onConfirm: (items: { itemCode: string; sourceWarehouse: string }[]) => void
  loading: boolean
}) {
  const [sources, setSources] = useState<Record<number, string>>({})
  const [warehouseSearch, setWarehouseSearch] = useState('')
  const { widths: colWidths, startResize } = useResizableColumns(CONFIRMAR_STOCK_COLUMNS)

  const { data: almacenesData } = useOpcionesArray('almacenes', { limit: 100 })
  const warehouseOptions = (almacenesData ?? [])
    .filter((a) => !a.disabled)
    .filter((a) => !warehouseSearch || a.name.toLowerCase().includes(warehouseSearch.toLowerCase()))
    .map((a) => ({ value: a.id, label: a.name }))

  const stockMap = useItemsStock(items.map((i) => i.itemCode))

  const rowsToConfirm = Object.entries(sources).filter(([, w]) => !!w)

  return (
    <Modal
      open
      onClose={onClose}
      title="Confirmar stock"
      subtitle="Elige de qué almacén traer el faltante de cada línea — el sistema calcula exactamente cuánto falta y transfiere. Esto NO somete el despacho; sigue siendo un paso aparte."
      size="lg"
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose}>Cancelar</button>
          <button
            className="btn btn-primary"
            disabled={loading || rowsToConfirm.length === 0}
            onClick={() => onConfirm(rowsToConfirm.map(([idx, sourceWarehouse]) => ({ itemCode: items[Number(idx)].itemCode, sourceWarehouse })))}
          >
            {loading ? 'Confirmando…' : 'Confirmar stock'}
          </button>
        </>
      }
    >
      <div className="table-scroll">
        <table className="data-table items-table-resizable">
          <colgroup>
            {CONFIRMAR_STOCK_COLUMNS.map((c) => <col key={c.key} style={{ width: colWidths[c.key] }} />)}
          </colgroup>
          <thead>
            <tr>
              <th>
                Artículo
                <span className="col-resize-handle" onMouseDown={startResize('articulo')} />
              </th>
              <th style={{ textAlign: 'right' }}>
                Pendiente
                <span className="col-resize-handle" onMouseDown={startResize('pendiente')} />
              </th>
              <th>
                Almacén destino
                <span className="col-resize-handle" onMouseDown={startResize('almacenDestino')} />
              </th>
              <th>
                Traer faltante desde
                <span className="col-resize-handle" onMouseDown={startResize('traerDesde')} />
              </th>
            </tr>
          </thead>
          <tbody>
            {items.map((it, i) => {
              const info = resolveDisponible(stockMap.get(it.itemCode), it.warehouse)
              const yaDisponible = info !== undefined && info.disponible >= it.qty
              const sourceStock = sources[i] ? resolveDisponible(stockMap.get(it.itemCode), sources[i]) : undefined
              return (
                <tr key={i}>
                  <td>{it.itemName} <span className="td-muted">({it.itemCode})</span></td>
                  <td style={{ textAlign: 'right' }}>{it.qty}</td>
                  <td className="td-muted">
                    {it.warehouse}
                    {info !== undefined && (
                      <><br /><span style={{ fontSize: 11 }}>Disponible ahí: {info.disponible}</span></>
                    )}
                  </td>
                  <td>
                    {yaDisponible ? (
                      <span className="badge badge-success">Ya disponible en destino</span>
                    ) : (
                      <>
                        <SearchSelect
                          value={sources[i] ?? ''}
                          onChange={(v) => setSources((prev) => ({ ...prev, [i]: v }))}
                          options={warehouseOptions.filter((o) => o.value !== it.warehouse)}
                          onSearch={setWarehouseSearch}
                          selectedLabel={almacenesData?.find((a) => a.id === sources[i])?.name ?? sources[i]}
                          placeholder="Elegir almacén origen"
                        />
                        {sourceStock !== undefined && (
                          <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>Disponible ahí: {sourceStock.disponible}</span>
                        )}
                      </>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </Modal>
  )
}

function EditDespachoModal({
  items, onClose, onSave, loading,
}: {
  items: { itemCode: string; itemName: string; qty: number; warehouse: string; dimensiones?: DimensionesLinea }[]
  onClose: () => void
  onSave: (items: DespachoItemDto[]) => void
  loading: boolean
}) {
  const [rows, setRows] = useState(items.map((i) => ({
    itemCode: i.itemCode,
    itemName: i.itemName,
    qty: i.qty,
    warehouse: i.warehouse,
    dimensiones: i.dimensiones,
    itemDimensionesDeclaradas: undefined as ItemDimensionDeclarada[] | undefined,
  })))
  const [warehouseSearch, setWarehouseSearch] = useState('')
  const { widths: colWidths, startResize } = useResizableColumns(EDIT_DESPACHO_COLUMNS)

  const { data: warehousesData } = useQuery({
    queryKey: ['warehouses'],
    queryFn: () => listWarehouses(),
  })
  const warehouseOptions = (warehousesData ?? [])
    .filter((w) => !warehouseSearch || w.name.toLowerCase().includes(warehouseSearch.toLowerCase()))
    .map((w) => ({ value: w.id, label: w.name }))

  // GET /despachos/:id ya trae la combinación de cada línea (§10.2, actualizado 2026-09-27) —
  // solo hace falta consultar el catálogo para saber qué dimensiones declara cada artículo y así
  // poder mostrar el selector.
  useEffect(() => {
    let cancelled = false
    Promise.all(items.map((i) => getItemLookup(i.itemCode).catch(() => null))).then((catalogItems) => {
      if (cancelled) return
      setRows((prev) => prev.map((r, i) => {
        const catalogItem = catalogItems[i]
        return catalogItem?.usaDimensiones ? { ...r, itemDimensionesDeclaradas: catalogItem.dimensiones } : r
      }))
    })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function updateRow(idx: number, patch: Partial<{ qty: number; warehouse: string; dimensiones: DimensionesLinea }>) {
    setRows((prev) => prev.map((r, i) => (i === idx ? { ...r, ...patch } : r)))
  }

  const lineasIncompletas = rows.some(
    (r) => (r.itemDimensionesDeclaradas?.length ?? 0) > 0 && !combinacionCompleta(r.itemDimensionesDeclaradas ?? [], r.dimensiones ?? {}),
  )

  return (
    <Modal
      open
      onClose={onClose}
      title="Editar Despacho"
      subtitle="Solo cantidad y almacén — no se pueden agregar líneas nuevas. Útil para una entrega parcial."
      size="lg"
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose}>Cancelar</button>
          <button
            className="btn btn-primary"
            disabled={loading || lineasIncompletas || rows.some((r) => !r.qty || r.qty <= 0)}
            onClick={() => onSave(rows.map((r) => ({
              itemCode: r.itemCode,
              qty: r.qty,
              warehouse: r.warehouse || undefined,
              ...(r.itemDimensionesDeclaradas?.length ? { dimensiones: r.dimensiones } : {}),
            })))}
          >
            {loading ? 'Guardando…' : 'Guardar'}
          </button>
        </>
      }
    >
      <div className="table-scroll">
        <table className="data-table items-table-resizable">
          <colgroup>
            {EDIT_DESPACHO_COLUMNS.map((c) => <col key={c.key} style={{ width: colWidths[c.key] }} />)}
          </colgroup>
          <thead>
            <tr>
              <th>
                Artículo
                <span className="col-resize-handle" onMouseDown={startResize('articulo')} />
              </th>
              <th>
                Cantidad
                <span className="col-resize-handle" onMouseDown={startResize('cantidad')} />
              </th>
              <th>
                Almacén
                <span className="col-resize-handle" onMouseDown={startResize('almacen')} />
              </th>
              <th>
                Dimensión
                <span className="col-resize-handle" onMouseDown={startResize('dimension')} />
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={`${r.itemCode}-${i}`}>
                <td>{r.itemName} <span className="td-muted">({r.itemCode})</span></td>
                <td>
                  <input
                    className="items-input"
                    type="number"
                    min="0.01"
                    step="0.01"
                    value={r.qty}
                    onChange={(e) => updateRow(i, { qty: parseFloat(e.target.value) || 0 })}
                  />
                </td>
                <td>
                  <SearchSelect
                    value={r.warehouse}
                    onChange={(v) => updateRow(i, { warehouse: v })}
                    options={warehouseOptions}
                    onSearch={setWarehouseSearch}
                    selectedLabel={warehousesData?.find((w) => w.id === r.warehouse)?.name ?? r.warehouse}
                  />
                </td>
                <td>
                  {r.itemDimensionesDeclaradas && r.itemDimensionesDeclaradas.length > 0 ? (
                    <CombinacionDimensionSelector
                      itemDimensiones={r.itemDimensionesDeclaradas}
                      value={r.dimensiones ?? {}}
                      onChange={(next) => updateRow(i, { dimensiones: next })}
                      compact
                    />
                  ) : (
                    <span className="td-muted" style={{ fontSize: 12 }}>—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Modal>
  )
}
