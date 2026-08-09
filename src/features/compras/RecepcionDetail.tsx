import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  getPurchaseReceipt, submitPurchaseReceipt, cancelPurchaseReceipt, amendPurchaseReceipt, facturarPurchaseReceipt,
} from '@/shared/api/purchase-receipt'
import { getSupplier } from '@/shared/api/suppliers'
import { getCatalogosFiscales, listImpuestosCompras, getFacturacionConfig } from '@/shared/api/config'
import { PageHeader } from '@/components/shared/PageHeader'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { Badge } from '@/shared/ui/Badge'
import { formatDate, formatDOP } from '@/lib/formatters'
import { Send, X, RotateCcw, FileText, Receipt } from 'lucide-react'
import { SearchSelect } from '@/shared/ui/SearchSelect'
import type { SearchSelectOption } from '@/shared/ui/SearchSelect'
import { Select, SelectItem } from '@/components/ui/select'
import { DatePicker } from '@/shared/ui/DatePicker'
import type { FacturarPurchaseReceiptDto } from '@/shared/api/types'

type ConfirmAction = 'submit' | 'cancel' | 'amend' | null

const NCF_REGEX = /^[BE]\d{10}$/

function defaultFacturarForm(): FacturarPurchaseReceiptDto {
  return {
    dueDate: '',
    ncfProveedor: '',
    tipoBienes606: '',
    formaPago606: '',
    retencionItbis: 0,
    retencionIsr: 0,
    tipoPago: 'Contado',
    taxesTemplate: '',
  }
}

export default function RecepcionDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const [confirmAction, setConfirmAction] = useState<ConfirmAction>(null)
  const [showFacturar, setShowFacturar] = useState(false)
  const [form, setForm] = useState<FacturarPurchaseReceiptDto>(defaultFacturarForm())

  const { data: receipt, isLoading, isError } = useQuery({
    queryKey: ['purchase-receipt', id],
    queryFn: () => getPurchaseReceipt(id!),
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

  // Defaults 606 del proveedor — igual que al crear una Compra, se usan para
  // pre-llenar el formulario de Facturar, pero el usuario puede editarlos.
  const { data: supplierData } = useQuery({
    queryKey: ['supplier', receipt?.supplier],
    queryFn: () => getSupplier(receipt!.supplier),
    enabled: !!receipt?.supplier,
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

  const submitMutation = useMutation({
    mutationFn: () => submitPurchaseReceipt(id!),
    onSuccess: () => {
      toast.success('Recepción sometida — el inventario ya fue actualizado')
      queryClient.invalidateQueries({ queryKey: ['purchase-receipt', id] })
      queryClient.invalidateQueries({ queryKey: ['purchase-receipts'] })
      setConfirmAction(null)
    },
    onError: (err: { message?: string }) => toast.error(err?.message ?? 'Error al someter la recepción'),
  })

  const cancelMutation = useMutation({
    mutationFn: () => cancelPurchaseReceipt(id!),
    onSuccess: () => {
      toast.success('Recepción anulada')
      queryClient.invalidateQueries({ queryKey: ['purchase-receipt', id] })
      queryClient.invalidateQueries({ queryKey: ['purchase-receipts'] })
      setConfirmAction(null)
    },
    onError: (err: { message?: string }) => toast.error(err?.message ?? 'Error al anular la recepción'),
  })

  const amendMutation = useMutation({
    mutationFn: () => amendPurchaseReceipt(id!),
    onSuccess: (data) => {
      toast.success('Enmienda creada')
      queryClient.invalidateQueries({ queryKey: ['purchase-receipts'] })
      navigate(`/compras/recepciones/${data.id}`)
    },
    onError: (err: { message?: string }) => toast.error(err?.message ?? 'Error al enmendar la recepción'),
  })

  const facturarMutation = useMutation({
    mutationFn: (dto: FacturarPurchaseReceiptDto) => facturarPurchaseReceipt(id!, dto),
    onSuccess: (invoice) => {
      const name = (invoice as { name: string }).name
      toast.success(
        `Factura ${name} generada. No se generó nuevo movimiento de stock — la mercancía ya fue recibida el ${formatDate(receipt!.postingDate)}.`,
      )
      queryClient.invalidateQueries({ queryKey: ['purchase-receipt', id] })
      queryClient.invalidateQueries({ queryKey: ['purchase-receipts'] })
      queryClient.invalidateQueries({ queryKey: ['compras'] })
      setShowFacturar(false)
      navigate(`/compras/${name}`)
    },
    onError: (err: { message?: string }) => toast.error(err?.message ?? 'Error al generar la factura'),
  })

  function handleConfirm() {
    if (confirmAction === 'submit') submitMutation.mutate()
    else if (confirmAction === 'cancel') cancelMutation.mutate()
    else if (confirmAction === 'amend') amendMutation.mutate()
  }

  const isPending = submitMutation.isPending || cancelMutation.isPending || amendMutation.isPending

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
    const dto: FacturarPurchaseReceiptDto = {
      dueDate: form.dueDate || undefined,
      ncfProveedor: form.ncfProveedor || undefined,
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

  if (isError || !receipt) {
    return (
      <div style={{ padding: 32, textAlign: 'center', color: 'var(--error-text)' }}>
        <p>Error al cargar la recepción.</p>
        <button className="btn btn-secondary" onClick={() => navigate(-1)} style={{ marginTop: 16 }}>Volver</button>
      </div>
    )
  }

  const canFacturar = receipt.status === 'submitted' && receipt.perBilled < 100
  const canCancel = receipt.status === 'submitted' && receipt.perBilled === 0
  const grandTotal = receipt.items.reduce((sum, i) => sum + i.amount, 0)

  const confirmMessages: Record<NonNullable<ConfirmAction>, { title: string; description: string; actionLabel: string }> = {
    submit: { title: '¿Someter recepción?', description: 'Esta acción actualizará el inventario. La recepción no podrá editarse después.', actionLabel: 'Someter' },
    cancel: { title: '¿Anular recepción?', description: 'La recepción será anulada y se revertirá el movimiento de inventario.', actionLabel: 'Anular' },
    amend: { title: '¿Enmendar recepción?', description: 'Se creará una nueva recepción basada en esta. La versión actual permanece cancelada.', actionLabel: 'Enmendar' },
  }

  return (
    <div className="page-container">
      <button className="page-back-link" onClick={() => navigate(-1)}>
        ← Recepciones
      </button>

      <PageHeader
        title={`Recepción ${receipt.id}`}
        description={receipt.supplierName}
        action={
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {receipt.status === 'draft' && (
              <>
                <button className="btn btn-secondary btn-size-sm" onClick={() => navigate(`/compras/recepciones/${id}/editar`)}>
                  <FileText size={14} />Editar
                </button>
                <button className="btn btn-primary btn-size-sm" onClick={() => setConfirmAction('submit')}>
                  <Send size={14} />Someter
                </button>
              </>
            )}
            {receipt.status === 'submitted' && (
              <>
                {canFacturar && (
                  <button className="btn btn-primary btn-size-sm" onClick={openFacturar}>
                    <Receipt size={14} />Facturar
                  </button>
                )}
                <button
                  className="btn btn-danger btn-size-sm"
                  onClick={() => setConfirmAction('cancel')}
                  disabled={!canCancel}
                  title={!canCancel ? 'No se puede anular: ya existen facturas generadas desde esta recepción.' : undefined}
                >
                  <X size={14} />Anular
                </button>
              </>
            )}
            {receipt.status === 'cancelled' && (
              <button className="btn btn-secondary btn-size-sm" onClick={() => setConfirmAction('amend')}>
                <RotateCcw size={14} />Enmendar
              </button>
            )}
          </div>
        }
      />

      <div className="page-container" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <StatusBadge status={receipt.status} />
          {receipt.status === 'submitted' && (
            receipt.perBilled >= 100
              ? <Badge variant="success">Completamente facturado</Badge>
              : receipt.perBilled > 0
                ? <Badge variant="warning">{Math.round(receipt.perBilled)}% facturado</Badge>
                : <Badge variant="neutral">Pendiente de facturar</Badge>
          )}
          {receipt.amendedFrom && (
            <span className="badge badge-default">Enmendada de {receipt.amendedFrom}</span>
          )}
        </div>

        <div className="card">
          <div className="card-header">
            <span className="card-title">Información General</span>
          </div>
          <div className="fields-grid fields-grid-3">
            <div className="detail-field">
              <span className="detail-label">Proveedor</span>
              <span className="detail-value">{receipt.supplierName}</span>
            </div>
            <div className="detail-field">
              <span className="detail-label">Fecha</span>
              <span className="detail-value">{formatDate(receipt.postingDate)}</span>
            </div>
            <div className="detail-field">
              <span className="detail-label">Remisión del Proveedor</span>
              <span className="detail-value">{receipt.supplierDeliveryNote ?? '—'}</span>
            </div>
            <div className="detail-field">
              <span className="detail-label">Total Estimado</span>
              <span className="detail-value" style={{ fontSize: 18, fontWeight: 700 }}>{formatDOP(grandTotal)}</span>
            </div>
          </div>
        </div>

        {/* Items */}
        <div className="card">
          <div className="card-header">
            <span className="card-title">Artículos</span>
          </div>
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Código</th>
                  <th>Descripción</th>
                  <th>Almacén</th>
                  <th style={{ textAlign: 'right' }}>Qty</th>
                  <th style={{ textAlign: 'right' }}>Costo</th>
                  <th style={{ textAlign: 'right' }}>Subtotal</th>
                  <th style={{ textAlign: 'right' }}>Facturado</th>
                </tr>
              </thead>
              <tbody>
                {receipt.items.map((item, i) => (
                  <tr key={i}>
                    <td style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>{item.itemCode}</td>
                    <td>{item.itemName}</td>
                    <td className="td-muted">{item.warehouse ?? '—'}</td>
                    <td style={{ textAlign: 'right' }}>{item.qty}</td>
                    <td style={{ textAlign: 'right' }}>{formatDOP(item.rate)}</td>
                    <td style={{ textAlign: 'right', fontWeight: 500 }}>{formatDOP(item.amount)}</td>
                    <td style={{ textAlign: 'right' }} className={item.billedAmt > 0 ? '' : 'td-muted'}>
                      {item.billedAmt > 0 ? formatDOP(item.billedAmt) : '—'}
                    </td>
                  </tr>
                ))}
                <tr style={{ background: 'var(--surface-sunken)', fontWeight: 600 }}>
                  <td colSpan={5} style={{ textAlign: 'right' }}>Total</td>
                  <td style={{ textAlign: 'right', fontWeight: 700 }}>{formatDOP(grandTotal)}</td>
                  <td />
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Confirm Modal */}
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

      {/* Facturar Modal */}
      {showFacturar && (
        <div className="modal-overlay" onClick={() => setShowFacturar(false)}>
          <div className="modal-box" style={{ maxWidth: 640 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <h2 className="modal-title">Facturar Recepción {receipt.id}</h2>
              <button className="modal-close" onClick={() => setShowFacturar(false)}>×</button>
            </div>
            <form onSubmit={handleFacturarSubmit}>
              <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 16, maxHeight: '70vh', overflowY: 'auto' }}>
                <p style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                  Captura los datos fiscales que llegaron con la factura real del proveedor. Esta factura no volverá a afectar
                  inventario — la mercancía ya fue recibida el {formatDate(receipt.postingDate)}.
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
