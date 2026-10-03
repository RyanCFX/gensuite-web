import { useState, useRef, useEffect, Fragment } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useParams, useNavigate } from 'react-router-dom'
import { getPedido, getPedidoVersion, submitPedido, cancelPedido, amendPedido, downloadPedidoPdf, facturarApartado, cancelarApartado } from '@/shared/api/pedidos'
import { getFacturacionConfig } from '@/shared/api/config'
import { crearDespachoDesdePedido } from '@/shared/api/despachos'
import { PageHeader } from '@/components/shared/PageHeader'
import { DocumentHistoryCard } from '@/components/shared/DocumentHistoryCard'
import { displayId, formatDate, formatMoney } from '@/lib/formatters'
import type { ApiError } from '@/shared/api/types'
import { ArrowLeft, Download, Send, Trash2, GitBranch, FileText, Copy, PackageOpen, AlertTriangle, Ban, Truck, ClipboardCheck, Link2, ChevronRight } from 'lucide-react'
import { toast } from 'sonner'
import { Select, SelectItem } from '@/components/ui/select'
import { SearchSelect } from '@/shared/ui/SearchSelect'
import type { SearchSelectOption } from '@/shared/ui/SearchSelect'
import { ESTADO_FLUJO_BADGE, ESTADO_FLUJO_LABEL } from './estadoFlujo'
import { useResizableColumns } from '@/shared/hooks/useResizableColumns'
import { useOpcionesArray } from '@/shared/hooks/useOpciones'

const ITEMS_COLUMNS = [
  { key: 'codigo', width: 100 },
  { key: 'descripcion', width: 220 },
  { key: 'notas', width: 160 },
  { key: 'cantidad', width: 90 },
  { key: 'precio', width: 110 },
  { key: 'descuento', width: 72 },
  { key: 'importe', width: 110 },
  { key: 'impuesto', width: 100 },
  { key: 'udm', width: 90 },
]

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
  const { id, version } = useParams<{ id: string; version?: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const [stockWarning, setStockWarning] = useState<string | null>(null)
  const [cancelApartadoOpen, setCancelApartadoOpen] = useState(false)
  const [relatedOpen, setRelatedOpen] = useState(false)
  const relatedRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!relatedOpen) return
    const onDown = (e: PointerEvent) => {
      if (relatedRef.current && !relatedRef.current.contains(e.target as Node)) setRelatedOpen(false)
    }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setRelatedOpen(false) }
    document.addEventListener('pointerdown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [relatedOpen])
  const [apartadoReason, setApartadoReason] = useState('')
  const [apartadoRemanente, setApartadoRemanente] = useState<'' | 'saldo_favor' | 'devolucion'>('')
  const [apartadoModeOfPayment, setApartadoModeOfPayment] = useState('')
  const { widths: itemsColWidths, startResize: startItemsResize } = useResizableColumns(ITEMS_COLUMNS)

  // Una entrada del historial con el mismo id que el documento actual es una revisión de borrador
  // anterior (no un documento amendado aparte) — GET /pedidos/:id/versions/:sequence devuelve un
  // snapshot liviano (DraftVersion: id/sequence/savedAt/status/items/grandTotal), no el pedido
  // completo. Viéndola aquí es de solo lectura: no hay acciones ni mutaciones.
  const isHistoricalVersion = !!version

  const { data: versionData, isLoading: loadingVersion } = useQuery({
    queryKey: ['pedido-version', id, version],
    queryFn: () => getPedidoVersion(id!, Number(version)),
    enabled: isHistoricalVersion && !!id,
  })

  const { data: pedido, isLoading } = useQuery({
    queryKey: ['pedido', id],
    queryFn: () => getPedido(id!),
    enabled: !isHistoricalVersion && !!id,
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

  const { data: metodos } = useOpcionesArray('metodos-pago', { limit: 100, enabled: cancelApartadoOpen, staleTime: 5 * 60_000 })
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
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['pedidos'] })
      queryClient.invalidateQueries({ queryKey: ['pedido', id] })
      toast.success('Apartado cancelado')
      // docs/tasks/PROMPT_INVENTORY_DIMENSIONS_FRONTEND.md §9.3 — la reversión del movimiento al
      // almacén de apartados de una línea con dimensiones puede fallar sin bloquear la cancelación;
      // se muestra el/los texto(s) libres del servidor tal cual, sin asumir un set fijo de mensajes
      // conocidos, igual que ya se hace con el `warning` de someter un apartado (§9.1).
      const warnings = (result as unknown as { warnings?: string[] }).warnings ?? []
      warnings.forEach((w) => toast.info(w, { duration: 8000 }))
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

  if (isHistoricalVersion) {
    if (loadingVersion) {
      return <div className="page-container"><div className="skeleton-box" style={{ width: 280, height: 28 }} /><div className="skeleton-box" style={{ width: '100%', height: 128, marginTop: 12 }} /></div>
    }
    if (!versionData) {
      return (
        <div className="page-container">
          <div className="empty-state">
            <p className="empty-title">Versión no encontrada</p>
            <button className="btn btn-ghost btn-size-sm" onClick={() => navigate(`/pedidos/${id}`)}>Ver versión actual</button>
          </div>
        </div>
      )
    }
    return (
      <div className="page-container">
        <PageHeader
          title={
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              Pedido {displayId(versionData.id, versionData.sequence)}
              <span className={`badge ${STATUS_BADGE[versionData.status] ?? 'badge-neutral'}`}>{STATUS_LABEL[versionData.status] ?? versionData.status}</span>
              <span className="badge badge-neutral" title="Estás viendo una revisión anterior de este borrador, de solo lectura">
                Histórica · versión {versionData.sequence}
              </span>
            </div>
          }
          description={`Guardada el ${formatDate(versionData.savedAt)}`}
          action={<a className="page-back-link" onClick={() => navigate(`/pedidos/${id}`)}><ArrowLeft size={14} /> Pedidos</a>}
        />

        <div className="inline-alert inline-alert-info" style={{ marginBottom: 16 }}>
          <span>Estás viendo una revisión anterior de este borrador — es solo de lectura.</span>
          <a className="page-back-link" onClick={() => navigate(`/pedidos/${id}`)}>Ver versión actual</a>
        </div>

        <div className="card">
          <div className="items-table-wrap">
            <table className="data-table navy-table">
              <thead>
                <tr>
                  <th>Código</th>
                  <th>Descripción</th>
                  <th style={{ textAlign: 'right' }}>Cant.</th>
                  <th style={{ textAlign: 'right' }}>Precio Unit.</th>
                  <th style={{ textAlign: 'right' }}>Importe</th>
                </tr>
              </thead>
              <tbody>
                {versionData.items.map((item, i) => (
                  <tr key={i}>
                    <td style={{ fontFamily: 'var(--font-body)', fontSize: 12 }}>{item.itemCode || '—'}</td>
                    <td>{item.description || item.itemName || '—'}</td>
                    <td style={{ textAlign: 'right' }}>{item.qty}</td>
                    <td style={{ textAlign: 'right' }}>{formatMoney(item.rate)}</td>
                    <td style={{ textAlign: 'right', fontWeight: 500 }}>{formatMoney(item.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="items-total-row navy-totals">
              <div className="items-total-line total-row-highlight" style={{ fontWeight: 700, justifyContent: 'flex-end', gap: 24 }}>
                <span style={{ fontSize: 18, color: '#FCB124', textAlign: 'right' }}>Total</span>
                <span style={{ fontSize: 18, color: '#FCB124', textAlign: 'left', minWidth: 170 }}>{formatMoney(versionData.grandTotal)}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (isLoading) return <div className="page-container"><div className="skeleton-box" style={{ width: 280, height: 28 }} /><div className="skeleton-box" style={{ width: '100%', height: 128, marginTop: 12 }} /></div>
  if (!pedido) return <div className="page-container"><div className="empty-state"><p className="empty-title">Pedido no encontrado</p></div></div>

  const subtotal = pedido.items.reduce((s, i) => s + i.amount, 0)
  const grossTotal = pedido.items.reduce((s, i) => s + i.qty * i.rate, 0)
  const totalDiscount = grossTotal - subtotal
  const taxAmount = pedido.taxAmount ?? 0
  const total = pedido.grandTotal ?? subtotal + taxAmount

  const relatedRows = [
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
  ].filter((r) => r.links.length > 0)


  return (
    <div className="page-container">
      <a className="page-back-link" onClick={() => navigate('/pedidos')}>
        <ArrowLeft size={14} /> Pedidos
      </a>
      <PageHeader
        title={
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span className="page-title-dot" />
            Pedido {displayId(pedido.id, pedido.sequence)}
            {pedido.estadoFlujo ? (
              <span className={`badge ${ESTADO_FLUJO_BADGE[pedido.estadoFlujo]}`}>{ESTADO_FLUJO_LABEL[pedido.estadoFlujo]}</span>
            ) : (
              <span className={`badge ${STATUS_BADGE[pedido.status] ?? 'badge-neutral'}`}>{STATUS_LABEL[pedido.status] ?? pedido.status}</span>
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

      <div className="doc-actions-bar" style={{ background: 'transparent', border: 'none', padding: 0, marginBottom: 16 }}>
        <button
          className="btn btn-secondary btn-size-md"
          onClick={() => navigate(`/pedidos/nuevo?duplicate=${id}`)}
          disabled={isPending}
        >
          <Copy size={14} /> Duplicar
        </button>
        {relatedRows.length > 0 && (
          <div className="dropdown" ref={relatedRef} style={{ display: 'flex' }}>
            <button
              className="btn btn-secondary btn-size-md"
              aria-haspopup="true"
              aria-expanded={relatedOpen}
              onClick={() => setRelatedOpen((o) => !o)}
            >
              <Link2 size={14} /> Documentos relacionados
              <ChevronRight size={11} style={{ transform: 'rotate(90deg)' }} aria-hidden="true" />
            </button>
            <div
              className={`dropdown-panel${relatedOpen ? ' open' : ''}`}
              role="menu"
              style={{ left: 0, right: 'auto' }}
            >
              {relatedRows.map((row) => (
                <Fragment key={row.label}>
                  <div className="dd-header">
                    <div className="dd-name" style={{ fontSize: 11 }}>{row.label}</div>
                  </div>
                  {row.links.map((l) => (
                    <button
                      key={l.to}
                      className="dd-item"
                      role="menuitem"
                      onClick={() => { setRelatedOpen(false); navigate(l.to) }}
                    >
                      {l.code}
                    </button>
                  ))}
                </Fragment>
              ))}
            </div>
          </div>
        )}
        {pedido.status === 'draft' && (
          <>
            {pendienteConfirmarDespacho && (
              <button
                className="btn btn-navy btn-size-md"
                onClick={() => navigate(`/despachos/confirmaciones?search=${encodeURIComponent(id!)}`)}
                disabled={isPending}
                title="La confirmación se hace desde Despachos, no desde este detalle."
              >
                <ClipboardCheck size={14} /> Ir a confirmar despacho
              </button>
            )}
            <button
              className="btn btn-navy btn-size-md"
              onClick={() => submitMutation.mutate()}
              disabled={isPending || pendienteConfirmarDespacho}
              title={pendienteConfirmarDespacho ? 'Primero confirma la existencia física de los artículos' : undefined}
            >
              <Send size={14} /> {pedido.isLayaway ? 'Someter Apartado' : 'Facturar'}
            </button>
            <button className="btn btn-ghost btn-size-md" onClick={() => navigate(`/pedidos/${id}/editar`)} disabled={isPending}>
              <FileText size={14} /> Editar
            </button>
            {pedido.isLayaway ? (
              <button className="btn btn-danger btn-size-md" onClick={openCancelApartadoModal} disabled={isPending}>
                <Ban size={14} /> Cancelar Apartado
              </button>
            ) : (
              <button className="btn btn-danger btn-size-md" onClick={() => cancelMutation.mutate()} disabled={isPending}>
                <Trash2 size={14} /> Cancelar
              </button>
            )}
          </>
        )}
        {pedido.status === 'submitted' && (
          <>
            {pedido.isLayaway && !pedido.facturaId && (
              <button className="btn btn-navy btn-size-md" onClick={() => facturarApartadoMutation.mutate()} disabled={isPending}>
                <Send size={14} /> Facturar Apartado
              </button>
            )}
            {despachoHabilitado && (pedido.invoices?.length ?? (pedido.facturaId ? 1 : 0)) === 0 && (
              <button
                className="btn btn-navy btn-size-md"
                onClick={() => despacharPedidoMutation.mutate()}
                disabled={despacharPedidoMutation.isPending}
              >
                <Truck size={14} /> {despacharPedidoMutation.isPending ? 'Creando despacho…' : 'Despachar'}
              </button>
            )}
            <button className="btn btn-ghost btn-size-md" onClick={() => amendMutation.mutate()} disabled={isPending}>
              <GitBranch size={14} /> Enmendar
            </button>
            <button
              className="btn btn-secondary btn-size-md"
              onClick={() => downloadMutation.mutate()}
              disabled={downloadMutation.isPending}
            >
              {downloadMutation.isPending
                ? <><span className="spinner" /> Descargando…</>
                : <><Download size={14} /> Descargar PDF</>}
            </button>
            {pedido.isLayaway && (
              <button className="btn btn-danger btn-size-md" onClick={openCancelApartadoModal} disabled={isPending}>
                <Ban size={14} /> Cancelar Apartado
              </button>
            )}
          </>
        )}
        {['completed', 'to deliver and bill'].includes(pedido.status) && (
          <>
            <button
              className="btn btn-secondary btn-size-md"
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

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-header navy-card-header"><h2 className="card-title">Información General</h2></div>
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
                <span className="detail-value" style={{ fontFamily: 'var(--font-body)' }}>{pedido.clienteOcasionalRnc}</span>
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
            <div className="detail-field" style={{ gridColumn: '1 / -1', marginTop: 16, paddingTop: 16, borderTop: '1px solid var(--border)' }}>
              <span className="detail-label">Notas</span>
              <span className="detail-value" style={{ whiteSpace: 'pre-line' }}>{pedido.notes}</span>
            </div>
          )}
        </div>
      </div>

      <div className="card">
        <div className="items-table-wrap">
          <table className="items-table navy-table items-table-resizable">
            <colgroup>
              {ITEMS_COLUMNS.map((c) => <col key={c.key} style={{ width: itemsColWidths[c.key] }} />)}
            </colgroup>
            <thead>
              <tr>
                <th>
                  Código
                  <span className="col-resize-handle" onMouseDown={startItemsResize('codigo')} />
                </th>
                <th>
                  Descripción
                  <span className="col-resize-handle" onMouseDown={startItemsResize('descripcion')} />
                </th>
                <th>
                  Notas
                  <span className="col-resize-handle" onMouseDown={startItemsResize('notas')} />
                </th>
                <th style={{ textAlign: 'right' }}>
                  Cant.
                  <span className="col-resize-handle" onMouseDown={startItemsResize('cantidad')} />
                </th>
                <th style={{ textAlign: 'right' }}>
                  Precio Unit.
                  <span className="col-resize-handle" onMouseDown={startItemsResize('precio')} />
                </th>
                <th style={{ textAlign: 'right' }}>
                  Dto. %
                  <span className="col-resize-handle" onMouseDown={startItemsResize('descuento')} />
                </th>
                <th style={{ textAlign: 'right' }}>
                  Importe
                  <span className="col-resize-handle" onMouseDown={startItemsResize('importe')} />
                </th>
                <th style={{ textAlign: 'right' }}>
                  Impuesto
                  <span className="col-resize-handle" onMouseDown={startItemsResize('impuesto')} />
                </th>
                <th>
                  UDM
                  <span className="col-resize-handle" onMouseDown={startItemsResize('udm')} />
                </th>
              </tr>
            </thead>
            <tbody>
              {pedido.items.map((item, i) => (
                <tr key={i}>
                  <td style={{ fontFamily: 'var(--font-body)', fontSize: 12 }}>{item.itemCode || '—'}</td>
                  <td>{item.description || item.itemName || '—'}</td>
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
          <div className="items-total-row navy-totals">
            <div className="items-total-line" style={{ fontSize: 14, justifyContent: 'flex-end', gap: 24 }}>
              <span style={{ textAlign: 'right' }}>Subtotal</span>
              <span style={{ textAlign: 'left', minWidth: 170 }}>{formatMoney(grossTotal, pedido.currency)}</span>
            </div>
            <div className="items-total-line" style={{ fontSize: 14, justifyContent: 'flex-end', gap: 24 }}>
              <span style={{ textAlign: 'right' }}>Descuento</span>
              <span style={{ textAlign: 'left', minWidth: 170 }}>-{formatMoney(totalDiscount, pedido.currency)}</span>
            </div>
            {/*<div className="items-total-line"><span>Subtotal neto</span><span>{formatMoney(subtotal, pedido.currency)}</span></div>*/}
            <div className="items-total-line" style={{ fontSize: 14, justifyContent: 'flex-end', gap: 24 }}>
              <span style={{ textAlign: 'right' }}>Impuesto</span>
              <span style={{ textAlign: 'left', minWidth: 170 }}>{formatMoney(taxAmount, pedido.currency)}</span>
            </div>
            <div className="items-total-line total-row-highlight" style={{ fontWeight: 700, justifyContent: 'flex-end', gap: 24 }}>
              <span style={{ fontSize: 18, color: '#FCB124', textAlign: 'right' }}>Total</span>
              <span style={{ fontSize: 18, color: '#FCB124', textAlign: 'left', minWidth: 170 }}>{formatMoney(total, pedido.currency)}</span>
            </div>
          </div>
        </div>
      </div>

      <DocumentHistoryCard history={pedido.history} currentDocId={pedido.id} basePath="/pedidos" />

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
