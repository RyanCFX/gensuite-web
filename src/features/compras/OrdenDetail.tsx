import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useQuery, useQueries, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  getOrdenCompra, submitOrdenCompra, cancelOrdenCompra, amendOrdenCompra,
  cerrarOrdenCompra, reabrirOrdenCompra, ponerEnEsperaOrdenCompra, recibirOrdenCompra, facturarOrdenCompra,
} from '@/shared/api/ordenes-compra'
import { getSupplier } from '@/shared/api/suppliers'
import { getItem } from '@/shared/api/catalog'
import { getCatalogosFiscales, listImpuestosCompras, getFacturacionConfig } from '@/shared/api/config'
import { PageHeader } from '@/components/shared/PageHeader'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { formatDate, formatDOP } from '@/lib/formatters'
import { Send, X, RotateCcw, FileText, Receipt, Truck, Lock, Unlock, PauseCircle } from 'lucide-react'
import { SearchSelect } from '@/shared/ui/SearchSelect'
import type { SearchSelectOption } from '@/shared/ui/SearchSelect'
import { Select, SelectItem } from '@/components/ui/select'
import { DatePicker } from '@/shared/ui/DatePicker'
import { QtyInput } from '@/shared/ui/QtyInput'
import type { CreateInvoiceFromOrdenDto, ReceiptFromOrdenItemOverrideDto } from '@/shared/api/types'

type ConfirmAction = 'submit' | 'cancel' | 'amend' | 'cerrar' | 'reabrir' | 'enEspera' | null

const NCF_REGEX = /^[BE]\d{10}$/

function defaultFacturarForm(): CreateInvoiceFromOrdenDto {
  return {
    dueDate: '',
    ncfProveedor: '',
    billNo: '',
    tipoBienes606: '',
    formaPago606: '',
    retencionItbis: 0,
    retencionIsr: 0,
    tipoPago: 'Contado',
    taxesTemplate: '',
  }
}

export default function OrdenDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const [confirmAction, setConfirmAction] = useState<ConfirmAction>(null)
  const [showRecibir, setShowRecibir] = useState(false)
  const [showFacturar, setShowFacturar] = useState(false)
  const [form, setForm] = useState<CreateInvoiceFromOrdenDto>(defaultFacturarForm())

  const { data: orden, isLoading, isError } = useQuery({
    queryKey: ['orden-compra', id],
    queryFn: () => getOrdenCompra(id!),
    enabled: !!id,
  })

  const { data: catalogos } = useQuery({
    queryKey: ['catalogos-fiscales'],
    queryFn: getCatalogosFiscales,
    staleTime: 60 * 60_000,
  })

  const { data: taxesTemplates } = useQuery({
    queryKey: ['impuestos-compras'],
    queryFn: listImpuestosCompras,
    staleTime: 5 * 60_000,
  })

  const { data: facturacionConfig } = useQuery({
    queryKey: ['facturacion-config'],
    queryFn: getFacturacionConfig,
    staleTime: 5 * 60_000,
  })
  const usaImpuestoDocumento = facturacionConfig?.usaImpuestoDocumento ?? true

  const { data: supplierData } = useQuery({
    queryKey: ['supplier', orden?.supplier],
    queryFn: () => getSupplier(orden!.supplier),
    enabled: !!orden?.supplier,
    staleTime: 5 * 60_000,
  })

  const [tipoBienes606Search, setTipoBienes606Search] = useState('')
  const tipoBienes606Options: SearchSelectOption[] = (catalogos?.tipoBienes606 ?? [])
    .filter((t) => !tipoBienes606Search || t.label.toLowerCase().includes(tipoBienes606Search.toLowerCase()))
    .map((t) => ({ value: t.value, label: t.label }))

  const [formaPago606Search, setFormaPago606Search] = useState('')
  const formaPago606Options: SearchSelectOption[] = (catalogos?.formaPago606 ?? [])
    .filter((f) => !formaPago606Search || f.label.toLowerCase().includes(formaPago606Search.toLowerCase()))
    .map((f) => ({ value: f.value, label: f.label }))

  const [taxesTemplateSearch, setTaxesTemplateSearch] = useState('')
  const taxesTemplateOptions: SearchSelectOption[] = (taxesTemplates ?? [])
    .filter((t) => !taxesTemplateSearch || t.title.toLowerCase().includes(taxesTemplateSearch.toLowerCase()))
    .map((t) => ({ value: String(t.id), label: t.title }))

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['orden-compra', id] })
    queryClient.invalidateQueries({ queryKey: ['ordenes-compra'] })
    setConfirmAction(null)
  }

  const submitMutation = useMutation({
    mutationFn: () => submitOrdenCompra(id!),
    onSuccess: () => { toast.success('Orden sometida'); invalidate() },
    onError: (err: { message?: string }) => toast.error(err?.message ?? 'Error al someter la orden'),
  })

  const cancelMutation = useMutation({
    mutationFn: () => cancelOrdenCompra(id!),
    onSuccess: () => { toast.success('Orden anulada'); invalidate() },
    onError: (err: { message?: string }) => toast.error(err?.message ?? 'Error al anular la orden'),
  })

  const amendMutation = useMutation({
    mutationFn: () => amendOrdenCompra(id!),
    onSuccess: (data) => { toast.success('Enmienda creada'); queryClient.invalidateQueries({ queryKey: ['ordenes-compra'] }); navigate(`/compras/ordenes/${data.id}`) },
    onError: (err: { message?: string }) => toast.error(err?.message ?? 'Error al enmendar la orden'),
  })

  const cerrarMutation = useMutation({
    mutationFn: () => cerrarOrdenCompra(id!),
    onSuccess: () => { toast.success('Orden cerrada'); invalidate() },
    onError: (err: { message?: string }) => toast.error(err?.message ?? 'Error al cerrar la orden'),
  })

  const reabrirMutation = useMutation({
    mutationFn: () => reabrirOrdenCompra(id!),
    onSuccess: () => { toast.success('Orden reabierta'); invalidate() },
    onError: (err: { message?: string }) => toast.error(err?.message ?? 'Error al reabrir la orden'),
  })

  const enEsperaMutation = useMutation({
    mutationFn: () => ponerEnEsperaOrdenCompra(id!),
    onSuccess: () => { toast.success('Orden puesta en espera'); invalidate() },
    onError: (err: { message?: string }) => toast.error(err?.message ?? 'Error al poner en espera la orden'),
  })

  const recibirMutation = useMutation({
    mutationFn: (dto: { supplierDeliveryNote?: string; items: ReceiptFromOrdenItemOverrideDto[] }) => recibirOrdenCompra(id!, dto),
    onSuccess: (receipt) => {
      toast.success(`Recepción ${receipt.id} generada`)
      queryClient.invalidateQueries({ queryKey: ['orden-compra', id] })
      queryClient.invalidateQueries({ queryKey: ['ordenes-compra'] })
      setShowRecibir(false)
      navigate(`/compras/recepciones/${receipt.id}`)
    },
    onError: (err: { message?: string }) => toast.error(err?.message ?? 'Error al recibir la mercancía'),
  })

  const facturarMutation = useMutation({
    mutationFn: (dto: CreateInvoiceFromOrdenDto) => facturarOrdenCompra(id!, dto),
    onSuccess: (result) => {
      const name = result.data.id ?? result.data.name
      toast.success(`Factura ${name} generada y sometida`)
      if (result.warning) toast.warning(result.warning, { duration: 8000 })
      queryClient.invalidateQueries({ queryKey: ['orden-compra', id] })
      queryClient.invalidateQueries({ queryKey: ['ordenes-compra'] })
      queryClient.invalidateQueries({ queryKey: ['compras'] })
      setShowFacturar(false)
      navigate(`/compras/${name}`)
    },
    onError: (err: { message?: string }) => toast.error(err?.message ?? 'Error al facturar la orden'),
  })

  function handleConfirm() {
    if (confirmAction === 'submit') submitMutation.mutate()
    else if (confirmAction === 'cancel') cancelMutation.mutate()
    else if (confirmAction === 'amend') amendMutation.mutate()
    else if (confirmAction === 'cerrar') cerrarMutation.mutate()
    else if (confirmAction === 'reabrir') reabrirMutation.mutate()
    else if (confirmAction === 'enEspera') enEsperaMutation.mutate()
  }

  const isPending = submitMutation.isPending || cancelMutation.isPending || amendMutation.isPending
    || cerrarMutation.isPending || reabrirMutation.isPending || enEsperaMutation.isPending

  function openFacturar() {
    setForm({
      ...defaultFacturarForm(),
      tipoBienes606: supplierData?.defaultTipoBienes606 ?? '',
      formaPago606: supplierData?.defaultFormaPago606 ?? '',
      tipoPago: supplierData?.defaultTipoPagoProveedor ?? 'Contado',
    })
    setShowFacturar(true)
  }

  function handleFacturarSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (form.ncfProveedor && !NCF_REGEX.test(form.ncfProveedor)) {
      toast.error('NCF inválido (formato: B/E seguido de 10 dígitos)')
      return
    }
    const dto: CreateInvoiceFromOrdenDto = {
      dueDate: form.dueDate || undefined,
      ncfProveedor: form.ncfProveedor || undefined,
      billNo: form.billNo || undefined,
      tipoBienes606: form.tipoBienes606 || undefined,
      formaPago606: form.formaPago606 || undefined,
      retencionItbis: form.retencionItbis || undefined,
      retencionIsr: form.retencionIsr || undefined,
      tipoPago: form.tipoPago,
      taxesTemplate: usaImpuestoDocumento ? (form.taxesTemplate || undefined) : undefined,
    }
    facturarMutation.mutate(dto)
  }

  if (isLoading) {
    return (
      <div className="page-container" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <span className="skeleton-box" style={{ height: 32, width: 200, display: 'block' }} />
        <span className="skeleton-box" style={{ height: 192, width: '100%', display: 'block' }} />
        <span className="skeleton-box" style={{ height: 192, width: '100%', display: 'block' }} />
      </div>
    )
  }

  if (isError || !orden) {
    return (
      <div style={{ padding: 32, textAlign: 'center', color: 'var(--error-text)' }}>
        <p>Error al cargar la orden de compra.</p>
        <button className="btn btn-secondary" onClick={() => navigate(-1)} style={{ marginTop: 16 }}>Volver</button>
      </div>
    )
  }

  const confirmMessages: Record<NonNullable<ConfirmAction>, { title: string; description: string; actionLabel: string }> = {
    submit: { title: '¿Someter orden?', description: 'La orden quedará sometida y disponible para recibir/facturar.', actionLabel: 'Someter' },
    cancel: { title: '¿Anular orden?', description: 'Falla si ya hay recepción o facturación asociada — anúlalas primero.', actionLabel: 'Anular' },
    amend: { title: '¿Enmendar orden?', description: 'Se creará una nueva orden basada en esta. La versión actual quedará anulada.', actionLabel: 'Enmendar' },
    cerrar: { title: '¿Cerrar orden?', description: 'Sale del pendiente SIN cancelarse — para cuando el proveedor nunca va a entregar el resto. No revierte lo ya recibido/facturado.', actionLabel: 'Cerrar' },
    reabrir: { title: '¿Reabrir orden?', description: 'Vuelve a quedar disponible para recibir/facturar.', actionLabel: 'Reabrir' },
    enEspera: { title: '¿Poner en espera?', description: 'La orden queda en espera — usa Reabrir para continuar luego.', actionLabel: 'En Espera' },
  }

  const canCancel = orden.status === 'submitted' && orden.perReceived === 0 && orden.perBilled === 0
  const remanenteReceive = orden.items.filter((it) => it.qty - it.receivedQty > 0)
  const canRecibir = orden.status === 'submitted' && orden.erpStatus !== 'Closed' && orden.erpStatus !== 'On Hold' && remanenteReceive.length > 0
  const canFacturar = orden.status === 'submitted' && orden.erpStatus !== 'Closed' && orden.erpStatus !== 'On Hold' && orden.perBilled < 100

  return (
    <div className="page-container">
      <button className="page-back-link" onClick={() => navigate(-1)}>
        ← Órdenes de Compra
      </button>

      <PageHeader
        title={`Orden ${orden.id}`}
        description={orden.supplierName}
        action={
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {orden.status === 'draft' && (
              <>
                <button className="btn btn-secondary btn-size-sm" onClick={() => navigate(`/compras/ordenes/${id}/editar`)}>
                  <FileText size={14} />Editar
                </button>
                <button className="btn btn-primary btn-size-sm" onClick={() => setConfirmAction('submit')}>
                  <Send size={14} />Someter
                </button>
              </>
            )}
            {orden.status === 'submitted' && (
              <>
                {orden.erpStatus === 'On Hold' || orden.erpStatus === 'Closed' ? (
                  <button className="btn btn-secondary btn-size-sm" onClick={() => setConfirmAction('reabrir')}>
                    <Unlock size={14} />Reabrir
                  </button>
                ) : (
                  <>
                    {canRecibir && (
                      <button className="btn btn-secondary btn-size-sm" onClick={() => setShowRecibir(true)}>
                        <Truck size={14} />Recibir
                      </button>
                    )}
                    {canFacturar && (
                      <button className="btn btn-primary btn-size-sm" onClick={openFacturar}>
                        <Receipt size={14} />Facturar
                      </button>
                    )}
                    <button className="btn btn-secondary btn-size-sm" onClick={() => setConfirmAction('enEspera')}>
                      <PauseCircle size={14} />En Espera
                    </button>
                    <button className="btn btn-secondary btn-size-sm" onClick={() => setConfirmAction('cerrar')}>
                      <Lock size={14} />Cerrar
                    </button>
                  </>
                )}
                <button
                  className="btn btn-danger btn-size-sm"
                  onClick={() => setConfirmAction('cancel')}
                  disabled={!canCancel}
                  title={!canCancel ? 'No se puede anular una orden con recepción o facturación asociada' : undefined}
                >
                  <X size={14} />Anular
                </button>
              </>
            )}
            {orden.status === 'cancelled' && (
              <button className="btn btn-secondary btn-size-sm" onClick={() => setConfirmAction('amend')}>
                <RotateCcw size={14} />Enmendar
              </button>
            )}
          </div>
        }
      />

      <div className="page-container" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <StatusBadge status={orden.erpStatus} />
          {orden.amendedFrom && (
            <span className="badge badge-default">Enmienda de {orden.amendedFrom}</span>
          )}
        </div>

        <div className="card">
          <div className="card-header">
            <span className="card-title">Información General</span>
          </div>
          <div className="fields-grid fields-grid-3">
            <div className="detail-field">
              <span className="detail-label">Proveedor</span>
              <span className="detail-value">{orden.supplierName}</span>
            </div>
            <div className="detail-field">
              <span className="detail-label">Fecha</span>
              <span className="detail-value">{formatDate(orden.transactionDate)}</span>
            </div>
            <div className="detail-field">
              <span className="detail-label">Fecha de Entrega Esperada</span>
              <span className="detail-value">{formatDate(orden.scheduleDate)}</span>
            </div>
            <div className="detail-field">
              <span className="detail-label">Total</span>
              <span className="detail-value" style={{ fontSize: 18, fontWeight: 700 }}>{formatDOP(orden.grandTotal)}</span>
            </div>
            <div className="detail-field">
              <span className="detail-label">% Recibido</span>
              <span className="detail-value">{Math.round(orden.perReceived)}%</span>
            </div>
            <div className="detail-field">
              <span className="detail-label">% Facturado</span>
              <span className="detail-value">{Math.round(orden.perBilled)}%</span>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <span className="card-title">Artículos</span>
          </div>
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Código</th>
                  <th style={{ textAlign: 'right' }}>Qty</th>
                  <th style={{ textAlign: 'right' }}>Precio</th>
                  <th style={{ textAlign: 'right' }}>Subtotal</th>
                  <th style={{ textAlign: 'right' }}>Recibido</th>
                  <th style={{ textAlign: 'right' }}>Facturado</th>
                  <th>Almacén</th>
                  <th>Origen</th>
                </tr>
              </thead>
              <tbody>
                {orden.items.map((item) => (
                  <tr key={item.id}>
                    <td style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>{item.itemCode}</td>
                    <td style={{ textAlign: 'right' }}>{item.qty} {item.uom}</td>
                    <td style={{ textAlign: 'right' }}>{formatDOP(item.rate)}</td>
                    <td style={{ textAlign: 'right', fontWeight: 500 }}>{formatDOP(item.amount)}</td>
                    <td style={{ textAlign: 'right' }}>{item.receivedQty}</td>
                    <td style={{ textAlign: 'right' }}>{formatDOP(item.billedAmt)}</td>
                    <td className="td-muted">{item.warehouse ?? '—'}</td>
                    <td className="td-muted" style={{ fontSize: 11 }}>{item.materialRequest ?? '—'}</td>
                  </tr>
                ))}
                <tr style={{ background: 'var(--surface-sunken)', fontWeight: 600 }}>
                  <td colSpan={3} style={{ textAlign: 'right' }}>Total</td>
                  <td style={{ textAlign: 'right', fontWeight: 700 }}>{formatDOP(orden.grandTotal)}</td>
                  <td colSpan={4} />
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {confirmAction && (
        <div className="modal-overlay" onClick={() => setConfirmAction(null)}>
          <div className="modal-box modal-box-sm" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <h2 className="modal-title">{confirmMessages[confirmAction].title}</h2>
              <button className="modal-close" onClick={() => setConfirmAction(null)}>×</button>
            </div>
            <div className="modal-body">
              <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                {confirmMessages[confirmAction].description}
              </p>
            </div>
            <div className="modal-foot">
              <button className="btn btn-secondary" disabled={isPending} onClick={() => setConfirmAction(null)}>Cancelar</button>
              <button className="btn btn-primary" onClick={handleConfirm} disabled={isPending}>
                {isPending ? 'Procesando…' : confirmMessages[confirmAction].actionLabel}
              </button>
            </div>
          </div>
        </div>
      )}

      {showRecibir && (
        <RecibirModal
          items={remanenteReceive}
          loading={recibirMutation.isPending}
          onClose={() => setShowRecibir(false)}
          onConfirm={(dto) => recibirMutation.mutate(dto)}
        />
      )}

      {showFacturar && (
        <div className="modal-overlay" onClick={() => setShowFacturar(false)}>
          <div className="modal-box" style={{ maxWidth: 640 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <h2 className="modal-title">Facturar Orden {orden.id}</h2>
              <button className="modal-close" onClick={() => setShowFacturar(false)}>×</button>
            </div>
            <form onSubmit={handleFacturarSubmit}>
              <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 16, maxHeight: '70vh', overflowY: 'auto' }}>
                <p style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                  Se facturará todo el remanente pendiente de esta orden ({formatDOP(orden.grandTotal - orden.items.reduce((s, i) => s + i.billedAmt, 0))} restante).
                </p>
                <div className="form-row form-row-2">
                  <div className="ff-wrap">
                    <label className="ff-label">Fecha de Vencimiento</label>
                    <DatePicker
                      className="ff-input"
                      value={form.dueDate ?? ''}
                      onChange={(v) => setForm((f) => ({ ...f, dueDate: v }))}
                      clearable
                    />
                  </div>
                  <div className="ff-wrap">
                    <label className="ff-label">NCF Proveedor</label>
                    <input
                      className="ff-input"
                      placeholder="B01XXXXXXXXXX"
                      value={form.ncfProveedor ?? ''}
                      onChange={(e) => setForm((f) => ({ ...f, ncfProveedor: e.target.value.toUpperCase() }))}
                    />
                  </div>
                  <div className="ff-wrap">
                    <label className="ff-label">N° Factura del Proveedor</label>
                    <input
                      className="ff-input"
                      placeholder="N° de factura del vendedor"
                      value={form.billNo ?? ''}
                      onChange={(e) => setForm((f) => ({ ...f, billNo: e.target.value }))}
                    />
                  </div>
                  <div className="ff-wrap">
                    <label className="ff-label">Tipo de Bienes 606</label>
                    <SearchSelect
                      value={form.tipoBienes606 ?? ''}
                      onChange={(val) => setForm((f) => ({ ...f, tipoBienes606: val }))}
                      options={tipoBienes606Options}
                      onSearch={setTipoBienes606Search}
                      selectedLabel={catalogos?.tipoBienes606?.find((t) => t.value === form.tipoBienes606)?.label ?? form.tipoBienes606}
                      placeholder="Seleccionar tipo"
                    />
                  </div>
                  <div className="ff-wrap">
                    <label className="ff-label">Forma de Pago 606</label>
                    <SearchSelect
                      value={form.formaPago606 ?? ''}
                      onChange={(val) => setForm((f) => ({ ...f, formaPago606: val }))}
                      options={formaPago606Options}
                      onSearch={setFormaPago606Search}
                      selectedLabel={catalogos?.formaPago606?.find((fp) => fp.value === form.formaPago606)?.label ?? form.formaPago606}
                      placeholder="Seleccionar forma"
                    />
                  </div>
                  <div className="ff-wrap">
                    <label className="ff-label">Tipo de Pago</label>
                    <Select
                      value={form.tipoPago ?? 'Contado'}
                      onValueChange={(val) => setForm((f) => ({ ...f, tipoPago: val as 'Contado' | 'Crédito' }))}
                    >
                      <SelectItem value="Contado">Contado</SelectItem>
                      <SelectItem value="Crédito">Crédito</SelectItem>
                    </Select>
                  </div>
                  {usaImpuestoDocumento && (
                    <div className="ff-wrap">
                      <label className="ff-label">Impuesto del Documento</label>
                      <SearchSelect
                        value={form.taxesTemplate ?? ''}
                        onChange={(val) => setForm((f) => ({ ...f, taxesTemplate: val }))}
                        options={taxesTemplateOptions}
                        onSearch={setTaxesTemplateSearch}
                        selectedLabel={taxesTemplates?.find((t) => String(t.id) === form.taxesTemplate)?.title ?? ''}
                        placeholder="Usar el default de la compañía"
                      />
                    </div>
                  )}
                  <div className="ff-wrap">
                    <label className="ff-label">Retención ITBIS (RD$)</label>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      className="ff-input"
                      value={form.retencionItbis ?? 0}
                      onChange={(e) => setForm((f) => ({ ...f, retencionItbis: parseFloat(e.target.value) || 0 }))}
                    />
                  </div>
                  <div className="ff-wrap">
                    <label className="ff-label">Retención ISR (RD$)</label>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      className="ff-input"
                      value={form.retencionIsr ?? 0}
                      onChange={(e) => setForm((f) => ({ ...f, retencionIsr: parseFloat(e.target.value) || 0 }))}
                    />
                  </div>
                </div>
              </div>
              <div className="modal-foot">
                <button type="button" className="btn btn-secondary" disabled={facturarMutation.isPending} onClick={() => setShowFacturar(false)}>
                  Cancelar
                </button>
                <button type="submit" className="btn btn-primary" disabled={facturarMutation.isPending}>
                  {facturarMutation.isPending ? 'Generando…' : 'Generar Factura'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Recibir ────────────────────────────────────────────────────────────────

interface RecibirLine {
  purchaseOrderItem: string
  itemCode: string
  uom?: string
  remanente: number
  qty: number
  serialsText: string
  batches: { batchId: string; qty: number }[]
}

interface RecibirModalProps {
  items: { id: string; itemCode: string; qty: number; receivedQty: number; uom?: string }[]
  loading: boolean
  onClose: () => void
  onConfirm: (dto: { supplierDeliveryNote?: string; items: ReceiptFromOrdenItemOverrideDto[] }) => void
}

function RecibirModal({ items, loading, onClose, onConfirm }: RecibirModalProps) {
  const [supplierDeliveryNote, setSupplierDeliveryNote] = useState('')
  const [lines, setLines] = useState<RecibirLine[]>(
    items.map((it) => ({
      purchaseOrderItem: it.id,
      itemCode: it.itemCode,
      uom: it.uom,
      remanente: it.qty - it.receivedQty,
      qty: it.qty - it.receivedQty,
      serialsText: '',
      batches: [],
    })),
  )

  // Se consulta el tracking (serial/lote) de cada artículo para saber si hay que pedirlo —
  // la orden de compra no trae esa info, solo el catálogo la conoce.
  const trackingQueries = useQueries({
    queries: items.map((it) => ({
      queryKey: ['item-tracking', it.itemCode],
      queryFn: () => getItem(it.itemCode),
      staleTime: 5 * 60_000,
    })),
  })

  function updateLine(idx: number, patch: Partial<RecibirLine>) {
    setLines((prev) => prev.map((l, i) => (i === idx ? { ...l, ...patch } : l)))
  }

  function addBatchRow(idx: number) {
    setLines((prev) => prev.map((l, i) => (i === idx ? { ...l, batches: [...l.batches, { batchId: '', qty: 0 }] } : l)))
  }

  function updateBatch(idx: number, batchIdx: number, patch: Partial<{ batchId: string; qty: number }>) {
    setLines((prev) => prev.map((l, i) => (i === idx ? { ...l, batches: l.batches.map((b, bi) => (bi === batchIdx ? { ...b, ...patch } : b)) } : l)))
  }

  function removeBatchRow(idx: number, batchIdx: number) {
    setLines((prev) => prev.map((l, i) => (i === idx ? { ...l, batches: l.batches.filter((_, bi) => bi !== batchIdx) } : l)))
  }

  function handleConfirm() {
    const activeLines = lines.filter((l) => l.qty > 0)
    if (activeLines.length === 0) { toast.error('Indica una cantidad mayor a cero en al menos un artículo'); return }

    const payload: ReceiptFromOrdenItemOverrideDto[] = []
    for (const line of activeLines) {
      const idx = lines.indexOf(line)
      const tracking = trackingQueries[idx]?.data?.trackingType ?? 'none'
      if (tracking === 'serial') {
        const serials = line.serialsText.split(/[\n,]/).map((s) => s.trim()).filter(Boolean)
        if (serials.length !== Math.round(line.qty)) {
          toast.error(`${line.itemCode}: debe capturar ${Math.round(line.qty)} serial(es) (ingresó ${serials.length})`)
          return
        }
        payload.push({ purchaseOrderItem: line.purchaseOrderItem, qty: line.qty, serials })
      } else if (tracking === 'batch') {
        const sum = line.batches.reduce((s, b) => s + b.qty, 0)
        if (Math.round(sum) !== Math.round(line.qty)) {
          toast.error(`${line.itemCode}: la suma de lotes (${sum}) debe ser igual a la cantidad (${line.qty})`)
          return
        }
        payload.push({ purchaseOrderItem: line.purchaseOrderItem, qty: line.qty, batches: line.batches })
      } else {
        payload.push({ purchaseOrderItem: line.purchaseOrderItem, qty: line.qty })
      }
    }
    onConfirm({ supplierDeliveryNote: supplierDeliveryNote || undefined, items: payload })
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box" style={{ maxWidth: 680 }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2 className="modal-title">Recibir Mercancía</h2>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 16, maxHeight: '70vh', overflowY: 'auto' }}>
          <div className="ff-wrap">
            <label className="ff-label">N° de Remisión del Proveedor</label>
            <input
              className="ff-input"
              placeholder="Opcional"
              value={supplierDeliveryNote}
              onChange={(e) => setSupplierDeliveryNote(e.target.value)}
            />
          </div>

          {lines.map((line, idx) => {
            const tracking = trackingQueries[idx]?.data?.trackingType ?? 'none'
            return (
              <div key={line.purchaseOrderItem} className="card" style={{ margin: 0 }}>
                <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end' }}>
                    <div style={{ flex: 1 }}>
                      <span style={{ fontWeight: 500, fontFamily: 'var(--font-mono)', fontSize: 13 }}>{line.itemCode}</span>
                      <p style={{ fontSize: 11, color: 'var(--text-tertiary)', margin: 0 }}>Remanente: {line.remanente} {line.uom}</p>
                    </div>
                    <div className="ff-wrap" style={{ width: 140, margin: 0 }}>
                      <label className="ff-label">Cantidad a Recibir</label>
                      <QtyInput
                        className="ff-input"
                        style={{ textAlign: 'right' }}
                        max={line.remanente}
                        uom={line.uom}
                        value={line.qty}
                        onChange={(v) => updateLine(idx, { qty: Math.min(v, line.remanente) })}
                      />
                    </div>
                  </div>

                  {tracking === 'serial' && line.qty > 0 && (
                    <div className="ff-wrap">
                      <label className="ff-label">Seriales (uno por línea o separados por coma) <span className="ff-required">*</span></label>
                      <textarea
                        className="ff-textarea"
                        rows={2}
                        value={line.serialsText}
                        onChange={(e) => updateLine(idx, { serialsText: e.target.value })}
                        placeholder="SN-0001, SN-0002…"
                      />
                    </div>
                  )}

                  {tracking === 'batch' && line.qty > 0 && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <label className="ff-label" style={{ margin: 0 }}>Lotes <span className="ff-required">*</span></label>
                        <button type="button" className="btn btn-ghost btn-size-sm" onClick={() => addBatchRow(idx)}>+ Agregar lote</button>
                      </div>
                      {line.batches.map((b, bi) => (
                        <div key={bi} style={{ display: 'flex', gap: 8 }}>
                          <input
                            className="ff-input"
                            placeholder="Lote"
                            value={b.batchId}
                            onChange={(e) => updateBatch(idx, bi, { batchId: e.target.value })}
                          />
                          <input
                            className="ff-input"
                            type="number"
                            min="0"
                            step="0.001"
                            style={{ width: 120, textAlign: 'right' }}
                            value={b.qty}
                            onChange={(e) => updateBatch(idx, bi, { qty: parseFloat(e.target.value) || 0 })}
                          />
                          <button type="button" className="btn btn-ghost btn-size-icon-sm" onClick={() => removeBatchRow(idx, bi)}>×</button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
        <div className="modal-foot">
          <button className="btn btn-secondary" onClick={onClose} disabled={loading}>Cancelar</button>
          <button className="btn btn-primary" onClick={handleConfirm} disabled={loading}>
            {loading ? 'Generando…' : 'Generar Recepción'}
          </button>
        </div>
      </div>
    </div>
  )
}
