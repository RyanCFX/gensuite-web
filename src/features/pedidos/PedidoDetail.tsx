import { useState } from 'react'
import { useQuery, useQueries, useMutation, useQueryClient } from '@tanstack/react-query'
import { useParams, useNavigate } from 'react-router-dom'
import { getPedido, submitPedido, cancelPedido, amendPedido, downloadPedidoPdf, facturarApartado, cancelarApartado, confirmarDespachoPedido } from '@/shared/api/pedidos'
import { listMetodosPago, getFacturacionConfig, listAlmacenes } from '@/shared/api/config'
import { crearDespachoDesdePedido } from '@/shared/api/despachos'
import { getItem } from '@/shared/api/catalog'
import { PageHeader } from '@/components/shared/PageHeader'
import { DocumentHistoryCard } from '@/components/shared/DocumentHistoryCard'
import { RelatedDocsCard } from '@/components/shared/RelatedDocsCard'
import { displayId, formatDate, formatMoney } from '@/lib/formatters'
import type { ApiError, ConfirmarStockDespachoItemDto, ConfirmarStockDespachoResult, Item, PedidoItem } from '@/shared/api/types'
import { isApiErrorCode, ERROR_CODES } from '@/shared/api/client'
import { formatStockInsufficientMessage } from '@/lib/stockAlerts'
import { useItemsStock, resolveDisponible } from '@/shared/hooks/useItemsStock'
import { ArrowLeft, Download, Send, Trash2, GitBranch, FileText, History, Copy, PackageOpen, AlertTriangle, Ban, Truck, ClipboardCheck } from 'lucide-react'
import { toast } from 'sonner'
import { Select, SelectItem } from '@/components/ui/select'
import { SearchSelect } from '@/shared/ui/SearchSelect'
import type { SearchSelectOption } from '@/shared/ui/SearchSelect'
import { Modal } from '@/shared/ui/Modal'
import { TrackedComponentEditor } from '@/components/shared/TrackedComponentEditor'
import type { TrackedComponent } from '@/components/shared/ComponentTrackingModal'
import { ESTADO_FLUJO_BADGE, ESTADO_FLUJO_LABEL } from './estadoFlujo'

const STATUS_BADGE: Record<string, string> = {
  draft: 'badge-draft',
  submitted: 'badge-submitted',
  cancelled: 'badge-cancelled',
}
const STATUS_LABEL: Record<string, string> = {
  draft: 'Borrador',
  submitted: 'En Proceso',
  cancelled: 'Cancelado',
}

export default function PedidoDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const [stockWarning, setStockWarning] = useState<string | null>(null)
  const [cancelApartadoOpen, setCancelApartadoOpen] = useState(false)
  const [apartadoReason, setApartadoReason] = useState('')
  const [apartadoRemanente, setApartadoRemanente] = useState<'' | 'saldo_favor' | 'devolucion'>('')
  const [apartadoModeOfPayment, setApartadoModeOfPayment] = useState('')
  const [confirmarDespachoOpen, setConfirmarDespachoOpen] = useState(false)

  const { data: pedido, isLoading } = useQuery({
    queryKey: ['pedido', id],
    queryFn: () => getPedido(id!),
    enabled: !!id,
  })

  const { data: facturacionConfig } = useQuery({
    queryKey: ['facturacion-config'],
    queryFn: getFacturacionConfig,
    staleTime: 5 * 60_000,
  })
  const monedaBase = facturacionConfig?.monedaBase ?? 'DOP'
  const despachoHabilitado = facturacionConfig?.despachoHabilitado ?? false

  // docs/tasks/79_confirmacion_despacho_pedido.md §4.1 — solo aplica a un pedido inmediato
  // (nunca apartado ni despacho a futuro) en Borrador, con el tenant exigiéndolo.
  const requiereConfirmacionDespacho = facturacionConfig?.pedidoRequiereConfirmacionDespacho ?? false
  const elegibleParaConfirmarDespacho = !!pedido
    && requiereConfirmacionDespacho
    && pedido.status === 'draft'
    && !pedido.isLayaway
    && !pedido.despachoFuturo
  const pendienteConfirmarDespacho = elegibleParaConfirmarDespacho && !pedido?.despachoConfirmado

  const { data: metodos } = useQuery({
    queryKey: ['metodos-pago'],
    queryFn: listMetodosPago,
    enabled: cancelApartadoOpen,
    staleTime: 5 * 60_000,
  })
  const [modeOfPaymentSearch, setModeOfPaymentSearch] = useState('')
  const modeOfPaymentOptions: SearchSelectOption[] = (metodos ?? [])
    .filter((m) => !m.disabled)
    .filter((m) => !modeOfPaymentSearch || m.name.toLowerCase().includes(modeOfPaymentSearch.toLowerCase()))
    .map((m) => ({ value: m.name, label: m.name }))

  const submitMutation = useMutation({
    mutationFn: () => submitPedido(id!),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['pedidos'] })
      queryClient.invalidateQueries({ queryKey: ['pedido', id] })
      if (result.isLayaway) {
        toast.success(result.message ?? 'Apartado sometido correctamente')
        setStockWarning(result.stockReserved === false ? (result.warning ?? 'El stock no pudo reservarse.') : null)
      } else {
        toast.success('Pedido facturado correctamente')
        if (result.facturaId) navigate(`/facturas/${result.facturaId}`)
      }
    },
    onError: (err: { message?: string }) => toast.error(err?.message ?? 'Error al someter el pedido'),
  })

  // Detección de líneas cuyo artículo exige serial/lote AL CONFIRMAR DESPACHO (no en la compra) —
  // §9 del prompt. Igual patrón que DespachoDetail: se resuelve por itemCode único, solo mientras
  // hace falta mostrar la acción (nunca en un pedido que ya no la necesita).
  const uniquePedidoItemCodes = [...new Set((pedido?.items ?? []).map((i) => i.itemCode))]
  const pedidoItemQueries = useQueries({
    queries: uniquePedidoItemCodes.map((code) => ({
      queryKey: ['item-asignar-serial-despacho', code],
      queryFn: () => getItem(code),
      staleTime: 5 * 60_000,
      enabled: elegibleParaConfirmarDespacho,
    })),
  })
  const itemsConSerialEnDespacho = new Map(
    pedidoItemQueries
      .map((q) => q.data)
      .filter((it): it is NonNullable<typeof it> => !!it?.custom_asignar_serial_en_despacho && !!it.trackingType && it.trackingType !== 'none')
      .map((it) => [it.id, it] as const),
  )

  const confirmarDespachoMutation = useMutation({
    mutationFn: (items: ConfirmarStockDespachoItemDto[]) => confirmarDespachoPedido(id!, { items }),
    onSuccess: (res: ConfirmarStockDespachoResult) => {
      toast.success(res.message, { duration: 6000 })
      queryClient.invalidateQueries({ queryKey: ['pedido', id] })
      queryClient.invalidateQueries({ queryKey: ['pedidos'] })
      setConfirmarDespachoOpen(false)
    },
    onError: (err: ApiError) => {
      if (isApiErrorCode(err, ERROR_CODES.STOCK_INSUFFICIENT_OR_RESERVED)) {
        toast.error(formatStockInsufficientMessage(err), { duration: 8000 })
        return
      }
      toast.error(err?.message ?? 'Error al confirmar el despacho')
    },
  })

  const cancelMutation = useMutation({
    mutationFn: () => cancelPedido(id!),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['pedidos'] }); queryClient.invalidateQueries({ queryKey: ['pedido', id] }); toast.success('Pedido cancelado') },
    onError: () => toast.error('Error al cancelar el pedido'),
  })

  // §4.2 — solo mientras el pedido no tenga factura todavía; si ya la tiene, se prefiere despachar
  // desde ahí (§3.3) para que delivered_qty quede exacto — el botón se oculta en ese caso.
  const despacharPedidoMutation = useMutation({
    mutationFn: () => crearDespachoDesdePedido(id!),
    onSuccess: (despacho) => {
      toast.success(`Despacho ${despacho.id} creado en Borrador — revísalo y somételo`)
      navigate(`/despachos/${despacho.id}`)
    },
    onError: (err: { message?: string }) => toast.error(err?.message ?? 'Error al crear el despacho'),
  })

  const cancelarApartadoMutation = useMutation({
    mutationFn: () => cancelarApartado(id!, {
      reason: apartadoReason.trim(),
      remanente: apartadoRemanente || undefined,
      modeOfPayment: apartadoRemanente === 'devolucion' ? apartadoModeOfPayment : undefined,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pedidos'] })
      queryClient.invalidateQueries({ queryKey: ['pedido', id] })
      toast.success('Apartado cancelado')
      setCancelApartadoOpen(false)
      setApartadoReason('')
      setApartadoRemanente('')
      setApartadoModeOfPayment('')
    },
    onError: (err: ApiError) => {
      if (err?.statusCode === 409) {
        toast.error('El apartado ya está cancelado.')
        queryClient.invalidateQueries({ queryKey: ['pedido', id] })
        setCancelApartadoOpen(false)
        return
      }
      toast.error(err?.message ?? 'Error al cancelar el apartado')
    },
  })

  function openCancelApartadoModal() {
    setApartadoReason('')
    setApartadoRemanente('')
    setApartadoModeOfPayment('')
    setCancelApartadoOpen(true)
  }

  const apartadoReasonValid = apartadoReason.trim().length >= 10 && apartadoReason.trim().length <= 500
  const apartadoModeValid = apartadoRemanente !== 'devolucion' || !!apartadoModeOfPayment
  const canConfirmCancelApartado = apartadoReasonValid && apartadoModeValid

  const facturarApartadoMutation = useMutation({
    mutationFn: () => facturarApartado(id!),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['pedidos'] })
      queryClient.invalidateQueries({ queryKey: ['pedido', id] })
      toast.success(result.message ?? 'Factura generada desde el apartado')
      navigate(`/facturas/${result.facturaId}`)
    },
    onError: (err: { message?: string }) => toast.error(err?.message ?? 'Error al facturar el apartado'),
  })

  const amendMutation = useMutation({
    mutationFn: () => amendPedido(id!),
    onSuccess: (result) => { queryClient.invalidateQueries({ queryKey: ['pedidos'] }); toast.success('Enmienda creada'); navigate(`/pedidos/${(result as any).newId}`) },
    onError: () => toast.error('Error al crear enmienda'),
  })

  const downloadMutation = useMutation({
    mutationFn: () => downloadPedidoPdf(id!, `pedido-${id}.pdf`),
    onError: () => toast.error('No se pudo descargar el PDF'),
  })

  const isPending = submitMutation.isPending || cancelMutation.isPending || amendMutation.isPending
    || downloadMutation.isPending || facturarApartadoMutation.isPending || cancelarApartadoMutation.isPending
    || confirmarDespachoMutation.isPending

  if (isLoading) return <div className="page-container"><div className="skeleton-box" style={{ width: 280, height: 28 }} /><div className="skeleton-box" style={{ width: '100%', height: 128, marginTop: 12 }} /></div>
  if (!pedido) return <div className="page-container"><div className="empty-state"><p className="empty-title">Pedido no encontrado</p></div></div>

  const subtotal = pedido.items.reduce((s, i) => s + i.amount, 0)
  const grossTotal = pedido.items.reduce((s, i) => s + i.qty * i.rate, 0)
  const totalDiscount = grossTotal - subtotal
  const taxAmount = pedido.taxAmount ?? 0
  const total = pedido.grandTotal ?? subtotal + taxAmount

  return (
    <div className="page-container">
      <PageHeader
        title={
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            Pedido {displayId(pedido.id, pedido.sequence)}
            <span className={`badge ${STATUS_BADGE[pedido.status] ?? 'badge-neutral'}`}>{STATUS_LABEL[pedido.status] ?? pedido.status}</span>
            {pedido.estadoFlujo && (
              <span className={`badge ${ESTADO_FLUJO_BADGE[pedido.estadoFlujo]}`}>{ESTADO_FLUJO_LABEL[pedido.estadoFlujo]}</span>
            )}
            {pedido.sequence > 0 && <span className="badge badge-info">seq {pedido.sequence}</span>}
            {pedido.amendedFrom && <span className="badge badge-neutral">Enmienda</span>}
            {pedido.currency && pedido.currency !== monedaBase && (
              <span className="badge badge-info" title={pedido.conversionRate != null ? `Tasa ${pedido.conversionRate}` : undefined}>
                {pedido.currency}
              </span>
            )}
            {pedido.isLayaway && (
              <span className={`badge ${pedido.layawayVencido ? 'badge-error' : 'badge-info'}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                <PackageOpen size={12} /> Apartado
                {pedido.layawayVencido
                  ? ' — Vencido'
                  : pedido.layawayDiasRestantes != null ? ` — ${pedido.layawayDiasRestantes} días restantes` : ''}
              </span>
            )}
          </div>
        }
        description={`Cliente: ${pedido.customerName}`}
        action={
          <a className="page-back-link" onClick={() => navigate('/pedidos')}><ArrowLeft size={14} /> Pedidos</a>
        }
      />

      {stockWarning && (
        <div className="inline-alert inline-alert-warn" style={{ marginBottom: 16 }}>
          <AlertTriangle size={16} />
          <span>{stockWarning}</span>
        </div>
      )}

      {pedido.isLayaway && pedido.status === 'submitted' && !pedido.facturaId && (
        <div className="inline-alert inline-alert-info" style={{ marginBottom: 16 }}>
          <PackageOpen size={16} />
          <span>Apartado activo, pendiente de anticipo/facturación.</span>
        </div>
      )}

      <div className="doc-actions-bar">
        <button
          className="btn btn-secondary btn-size-sm"
          onClick={() => navigate(`/pedidos/nuevo?duplicate=${id}`)}
          disabled={isPending}
        >
          <Copy size={14} /> Duplicar
        </button>
        {pedido.status === 'draft' && (
          <>
            {pendienteConfirmarDespacho && (
              <button
                className="btn btn-navy btn-size-sm"
                onClick={() => setConfirmarDespachoOpen(true)}
                disabled={isPending}
              >
                <ClipboardCheck size={14} /> Confirmar despacho
              </button>
            )}
            <button
              className="btn btn-primary btn-size-sm"
              onClick={() => submitMutation.mutate()}
              disabled={isPending || pendienteConfirmarDespacho}
              title={pendienteConfirmarDespacho ? 'Primero confirma la existencia física de los artículos' : undefined}
            >
              <Send size={14} /> {pedido.isLayaway ? 'Someter Apartado' : 'Facturar'}
            </button>
            <button className="btn btn-ghost btn-size-sm" onClick={() => navigate(`/pedidos/${id}/editar`)} disabled={isPending}>
              <FileText size={14} /> Editar
            </button>
            {pedido.isLayaway ? (
              <button className="btn btn-danger btn-size-sm" onClick={openCancelApartadoModal} disabled={isPending}>
                <Ban size={14} /> Cancelar Apartado
              </button>
            ) : (
              <button className="btn btn-danger btn-size-sm" onClick={() => cancelMutation.mutate()} disabled={isPending}>
                <Trash2 size={14} /> Cancelar
              </button>
            )}
          </>
        )}
        {pedido.status === 'submitted' && (
          <>
            {pedido.isLayaway && !pedido.facturaId && (
              <button className="btn btn-primary btn-size-sm" onClick={() => facturarApartadoMutation.mutate()} disabled={isPending}>
                <Send size={14} /> Facturar Apartado
              </button>
            )}
            {despachoHabilitado && (pedido.invoices?.length ?? (pedido.facturaId ? 1 : 0)) === 0 && (
              <button
                className="btn btn-navy btn-size-sm"
                onClick={() => despacharPedidoMutation.mutate()}
                disabled={despacharPedidoMutation.isPending}
              >
                <Truck size={14} /> {despacharPedidoMutation.isPending ? 'Creando despacho…' : 'Despachar'}
              </button>
            )}
            <button className="btn btn-ghost btn-size-sm" onClick={() => amendMutation.mutate()} disabled={isPending}>
              <GitBranch size={14} /> Enmendar
            </button>
            <button
              className="btn btn-secondary btn-size-sm"
              onClick={() => downloadMutation.mutate()}
              disabled={downloadMutation.isPending}
            >
              {downloadMutation.isPending
                ? <><span className="spinner" /> Descargando…</>
                : <><Download size={14} /> Descargar PDF</>}
            </button>
            {pedido.isLayaway && (
              <button className="btn btn-danger btn-size-sm" onClick={openCancelApartadoModal} disabled={isPending}>
                <Ban size={14} /> Cancelar Apartado
              </button>
            )}
          </>
        )}
        {['completed', 'to deliver and bill'].includes(pedido.status) && (
          <>
            <button
              className="btn btn-secondary btn-size-sm"
              onClick={() => downloadMutation.mutate()}
              disabled={downloadMutation.isPending}
            >
              {downloadMutation.isPending
                ? <><span className="spinner" /> Descargando…</>
                : <><Download size={14} /> Descargar PDF</>}
            </button>
          </>
        )}
        {(() => {
          const n = pedido.invoices?.length ?? (pedido.facturaId ? 1 : 0)
          if (n === 0) return null
          return (
            <span className="badge badge-success" style={{ marginLeft: 8 }}>
              <FileText size={12} /> {n > 1 ? `${n} facturas generadas` : 'Factura generada'}
            </span>
          )
        })()}
      </div>

      <RelatedDocsCard
        rows={[
          {
            label: 'Cotización',
            links: pedido.quotation
              ? [{ code: pedido.quotation, to: `/cotizaciones/${pedido.quotation}` }]
              : [],
          },
          (() => {
            const facturas = pedido.invoices ?? (pedido.facturaId ? [pedido.facturaId] : [])
            return {
              label: facturas.length > 1 ? 'Facturas' : 'Factura',
              links: facturas.map((f) => ({ code: f, to: `/facturas/${f}` })),
            }
          })(),
        ]}
      />

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-header"><h2 className="card-title">Información General</h2></div>
        <div className="card-body">
          <div className="fields-grid">
            <div className="detail-field">
              <span className="detail-label">Cliente</span>
              <span className="detail-value">
                {pedido.esClienteOcasional ? (
                  <span>
                    {pedido.clienteOcasionalNombre ?? pedido.customerName}
                    <span style={{ fontSize: 11, color: 'var(--text-tertiary)', marginLeft: 6 }}>(ocasional)</span>
                  </span>
                ) : (
                  pedido.customerName
                )}
              </span>
            </div>
            {pedido.esClienteOcasional && pedido.clienteOcasionalRnc && (
              <div className="detail-field">
                <span className="detail-label">RNC / Cédula</span>
                <span className="detail-value" style={{ fontFamily: 'monospace' }}>{pedido.clienteOcasionalRnc}</span>
              </div>
            )}
            {pedido.esClienteOcasional && pedido.clienteOcasionalDireccion && (
              <div className="detail-field">
                <span className="detail-label">Dirección</span>
                <span className="detail-value">{pedido.clienteOcasionalDireccion}</span>
              </div>
            )}
            <div className="detail-field">
              <span className="detail-label">Fecha</span>
              <span className="detail-value">{formatDate(pedido.transactionDate)}</span>
            </div>
            {pedido.deliveryDate && (
              <div className="detail-field">
                <span className="detail-label">Entrega estimada</span>
                <span className="detail-value">{formatDate(pedido.deliveryDate)}</span>
              </div>
            )}
            <div className="detail-field">
              <span className="detail-label">Estado</span>
              <span className="detail-value"><span className={`badge ${STATUS_BADGE[pedido.status]}`}>{STATUS_LABEL[pedido.status]}</span></span>
            </div>
          </div>
          {pedido.notes && (
            <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid var(--border)' }}>
              <p style={{ fontSize: 11, color: 'var(--text-secondary)', marginBottom: 4 }}>Notas</p>
              <p style={{ fontSize: 13, whiteSpace: 'pre-line' }}>{pedido.notes}</p>
            </div>
          )}
        </div>
      </div>

      <div className="card">
        <div className="card-header"><h2 className="card-title">Artículos</h2></div>
        <div className="items-table-wrap">
          <table className="items-table">
            <thead>
              <tr>
                <th>Código</th>
                <th>Descripción</th>
                <th>Notas</th>
                <th style={{ textAlign: 'right' }}>Cant.</th>
                <th style={{ textAlign: 'right' }}>Precio Unit.</th>
                <th style={{ textAlign: 'right', width: 72 }}>Dto. %</th>
                <th style={{ textAlign: 'right' }}>Importe</th>
                <th style={{ textAlign: 'right' }}>Impuesto</th>
                <th>UDM</th>
              </tr>
            </thead>
            <tbody>
              {pedido.items.map((item, i) => (
                <tr key={i}>
                  <td style={{ fontFamily: 'monospace', fontSize: 12 }}>{item.itemCode || '—'}</td>
                  <td>{item.description || '—'}</td>
                  <td style={{ fontSize: 12, color: 'var(--text-tertiary)', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={item.notes ?? ''}>{item.notes ?? '—'}</td>
                  <td style={{ textAlign: 'right' }}>{item.qty}</td>
                  <td style={{ textAlign: 'right' }}>{formatMoney(item.rate, pedido.currency)}</td>
                  <td style={{ textAlign: 'right' }}>{item.discountPct ? `${item.discountPct}%` : '—'}</td>
                  <td style={{ textAlign: 'right', fontWeight: 500 }}>{formatMoney(item.amount, pedido.currency)}</td>
                  <td style={{ textAlign: 'right' }} title={`${item.taxRate}%`}>{formatMoney(item.taxAmount, pedido.currency)}</td>
                  <td>{item.uom || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="items-total-row">
            <div className="items-total-line"><span>Subtotal bruto</span><span>{formatMoney(grossTotal, pedido.currency)}</span></div>
            {totalDiscount > 0 && <div className="items-total-line" style={{ color: 'var(--text-danger)' }}><span>Descuento total</span><span>-{formatMoney(totalDiscount, pedido.currency)}</span></div>}
            {/*<div className="items-total-line"><span>Subtotal neto</span><span>{formatMoney(subtotal, pedido.currency)}</span></div>*/}
            <div className="items-total-line"><span>Impuesto</span><span>{formatMoney(taxAmount, pedido.currency)}</span></div>
            <div className="items-total-line" style={{ fontWeight: 700, fontSize: 15 }}><span>Total</span><span>{formatMoney(total, pedido.currency)}</span></div>
          </div>
        </div>
      </div>

      {pedido.history && pedido.history.length > 0 && (
        <div className="card" style={{ marginTop: 16 }}>
          <div className="card-header"><h2 className="card-title" style={{ display: 'flex', alignItems: 'center', gap: 6 }}><History size={15} /> Historial de versiones</h2></div>
          <div className="card-body">
            <DocumentHistoryCard history={pedido.history} currentDocId={pedido.id} basePath="/pedidos" />
          </div>
        </div>
      )}

      {/* Modal: confirmar despacho (§4.5) */}
      {confirmarDespachoOpen && (
        <ConfirmarDespachoPedidoModal
          items={pedido.items}
          itemsConSerialEnDespacho={itemsConSerialEnDespacho}
          onClose={() => setConfirmarDespachoOpen(false)}
          onConfirm={(items) => confirmarDespachoMutation.mutate(items)}
          loading={confirmarDespachoMutation.isPending}
        />
      )}

      {/* Modal: cancelar apartado */}
      {cancelApartadoOpen && (
        <div className="modal-overlay" onClick={() => setCancelApartadoOpen(false)}>
          <div className="modal-box modal-box-sm" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <h2 className="modal-title" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <Ban size={16} style={{ color: 'var(--error-text)' }} /> Cancelar apartado
              </h2>
              <button className="modal-close" onClick={() => setCancelApartadoOpen(false)}>×</button>
            </div>
            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div className="ff-wrap">
                <label className="ff-label ff-required" htmlFor="apartadoReason">Motivo de cancelación</label>
                <textarea
                  id="apartadoReason"
                  className="ff-textarea"
                  rows={3}
                  value={apartadoReason}
                  onChange={(e) => setApartadoReason(e.target.value)}
                  placeholder="Describe el motivo de la cancelación (mínimo 10 caracteres)"
                  maxLength={500}
                />
                <p className="ff-hint">{apartadoReason.trim().length}/500 caracteres (mínimo 10)</p>
              </div>

              <div className="ff-wrap">
                <label className="ff-label" htmlFor="apartadoRemanente">¿Qué hacer con el anticipo?</label>
                <Select
                  value={apartadoRemanente}
                  onValueChange={(val) => setApartadoRemanente(val as '' | 'saldo_favor' | 'devolucion')}
                  placeholder="Usar default configurado"
                >
                  <SelectItem value="saldo_favor">Saldo a favor</SelectItem>
                  <SelectItem value="devolucion">Devolución en efectivo</SelectItem>
                </Select>
              </div>

              {apartadoRemanente === 'devolucion' && (
                <div className="ff-wrap">
                  <label className="ff-label ff-required" htmlFor="apartadoModeOfPayment">Método de pago de la devolución</label>
                  <SearchSelect
                    id="apartadoModeOfPayment"
                    value={apartadoModeOfPayment}
                    onChange={setApartadoModeOfPayment}
                    options={modeOfPaymentOptions}
                    onSearch={setModeOfPaymentSearch}
                    selectedLabel={apartadoModeOfPayment}
                    placeholder="Seleccionar…"
                  />
                </div>
              )}
            </div>
            <div className="modal-foot">
              <button className="btn btn-secondary" onClick={() => setCancelApartadoOpen(false)}>Volver</button>
              <button
                className="btn btn-danger"
                onClick={() => cancelarApartadoMutation.mutate()}
                disabled={!canConfirmCancelApartado || cancelarApartadoMutation.isPending}
              >
                <Ban size={14} /> Confirmar cancelación
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// docs/tasks/79_confirmacion_despacho_pedido.md §4.5. Reutiliza el mismo patrón de
// DespachoDetail.ConfirmarStockModal (§75) para el almacén origen del faltante, y
// TrackedComponentEditor (§ComponentTrackingModal) para serial/lote de artículos que lo exigen al
// confirmar despacho — combinados en UN solo request (a diferencia de Despachos, que separa
// confirmar-stock y asignar-tracking en dos llamadas distintas).
function ConfirmarDespachoPedidoModal({
  items, itemsConSerialEnDespacho, onClose, onConfirm, loading,
}: {
  items: PedidoItem[]
  itemsConSerialEnDespacho: Map<string, Item>
  onClose: () => void
  onConfirm: (items: ConfirmarStockDespachoItemDto[]) => void
  loading: boolean
}) {
  const [sources, setSources] = useState<Record<number, string>>({})
  const [warehouseSearch, setWarehouseSearch] = useState('')
  const [serialsByItem, setSerialsByItem] = useState<Record<string, string[]>>({})
  const [batchesByItem, setBatchesByItem] = useState<Record<string, { batchId: string; qty: number }[]>>({})

  const { data: almacenesData } = useQuery({
    queryKey: ['almacenes-confirmar-despacho-pedido'],
    queryFn: () => listAlmacenes(),
  })
  const warehouseOptions = (almacenesData ?? [])
    .filter((a) => !a.disabled)
    .filter((a) => !warehouseSearch || a.name.toLowerCase().includes(warehouseSearch.toLowerCase()))
    .map((a) => ({ value: a.id, label: a.name }))

  const stockMap = useItemsStock(items.map((i) => i.itemCode))

  function isTrackingComplete(itemCode: string, qtyNeeded: number): boolean {
    const item = itemsConSerialEnDespacho.get(itemCode)
    if (!item) return true
    if (item.trackingType === 'serial') return (serialsByItem[itemCode]?.length ?? 0) === qtyNeeded
    const sum = (batchesByItem[itemCode] ?? []).reduce((s, b) => s + Number(b.qty || 0), 0)
    return sum === qtyNeeded && (batchesByItem[itemCode]?.length ?? 0) > 0
  }

  const allTrackingComplete = items.every((it) => isTrackingComplete(it.itemCode, it.qty))

  function handleConfirm() {
    const payload: ConfirmarStockDespachoItemDto[] = items
      .map((it, i) => {
        const trackedItem = itemsConSerialEnDespacho.get(it.itemCode)
        const sourceWarehouse = sources[i] || undefined
        if (!trackedItem && !sourceWarehouse) return null
        return {
          itemCode: it.itemCode,
          ...(sourceWarehouse ? { sourceWarehouse } : {}),
          ...(trackedItem?.trackingType === 'serial' ? { serials: serialsByItem[it.itemCode] ?? [] } : {}),
          ...(trackedItem?.trackingType === 'batch' ? { batches: batchesByItem[it.itemCode] ?? [] } : {}),
        }
      })
      .filter((x): x is ConfirmarStockDespachoItemDto => !!x)
    onConfirm(payload)
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Confirmar despacho"
      subtitle="Confirma la existencia física de los artículos antes de facturar el pedido. Esto NO somete el pedido — sigue siendo un paso aparte."
      size="lg"
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose}>Cancelar</button>
          <button
            className="btn btn-primary"
            disabled={loading || !allTrackingComplete}
            onClick={handleConfirm}
          >
            {loading ? 'Confirmando…' : 'Confirmar despacho'}
          </button>
        </>
      }
    >
      <div className="table-scroll">
        <table className="data-table">
          <thead>
            <tr>
              <th>Artículo</th>
              <th style={{ textAlign: 'right' }}>Cantidad</th>
              <th style={{ width: 260 }}>Traer faltante desde (opcional)</th>
            </tr>
          </thead>
          <tbody>
            {items.map((it, i) => {
              const stock = stockMap.get(it.itemCode)
              const sourceStock = sources[i] ? resolveDisponible(stock, sources[i]) : undefined
              const trackedItem = itemsConSerialEnDespacho.get(it.itemCode)
              return (
                <tr key={i}>
                  <td>
                    <div>{it.description || it.itemCode} <span className="td-muted">({it.itemCode})</span></div>
                    {trackedItem && (
                      <div style={{ marginTop: 8 }}>
                        <TrackedComponentEditor
                          component={{
                            itemCode: it.itemCode,
                            itemName: it.description,
                            trackingType: trackedItem.trackingType === 'batch' ? 'batch' : 'serial',
                            qtyNeeded: it.qty,
                          } as TrackedComponent}
                          serials={serialsByItem[it.itemCode] ?? []}
                          onChangeSerials={(s) => setSerialsByItem((prev) => ({ ...prev, [it.itemCode]: s }))}
                          batches={batchesByItem[it.itemCode] ?? []}
                          onChangeBatches={(b) => setBatchesByItem((prev) => ({ ...prev, [it.itemCode]: b }))}
                        />
                      </div>
                    )}
                  </td>
                  <td style={{ textAlign: 'right' }}>{it.qty}</td>
                  <td>
                    <SearchSelect
                      value={sources[i] ?? ''}
                      onChange={(v) => setSources((prev) => ({ ...prev, [i]: v }))}
                      options={warehouseOptions}
                      onSearch={setWarehouseSearch}
                      selectedLabel={almacenesData?.find((a) => a.id === sources[i])?.name ?? sources[i]}
                      placeholder="Dejar vacío si ya hay stock suficiente"
                    />
                    {sourceStock !== undefined && (
                      <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>Disponible ahí: {sourceStock.disponible}</span>
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
