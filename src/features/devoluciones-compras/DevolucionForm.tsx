import { useState, useMemo } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useEffectOnActive } from 'keepalive-for-react'
import { toast } from 'sonner'
import { useTabs } from '@/contexts/TabsContext'
import { listCompras, getCompra } from '@/shared/api/compras-gastos'
import { listSuppliers } from '@/shared/api/suppliers'
import { SearchSelect } from '@/shared/ui/SearchSelect'
import type { SearchSelectOption } from '@/shared/ui/SearchSelect'
import {
  getDevolucionCompra,
  createDevolucionCompra,
  updateDevolucionCompra,
} from '@/shared/api/devoluciones-compras'
import type { CreateDevolucionCompraDto } from '@/shared/api/types'
import { PageHeader } from '@/components/shared/PageHeader'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { DatePicker } from '@/shared/ui/DatePicker'
import { Save, X, Building2, FileText, Undo2, Check, AlertTriangle } from 'lucide-react'
import { formatDOP, formatDate, daysSince } from '@/lib/formatters'
import { ConfirmModal } from '@/shared/ui/Modal'
import { useConfirmClose } from '@/shared/hooks/useConfirmClose'
import { useDirtyCheck } from '@/shared/hooks/useDirtyCheck'
import { DEVOLUCION_DIAS_LIMITE_ITBIS } from '@/lib/constants'

interface FormItem {
  itemCode: string
  stockQty: number
  returnQty: number
  rate: number
}

export default function DevolucionForm() {
  const { id } = useParams<{ id: string }>()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { multiTab, activeId, closeTab } = useTabs()

  const originalInvoiceParam = searchParams.get('originalInvoice') ?? ''
  const isEdit = !!id

  const { data: originalCompra, isLoading: loadingOriginal } = useQuery({
    queryKey: ['compra', originalInvoiceParam],
    queryFn: () => getCompra(originalInvoiceParam),
    enabled: !isEdit && !!originalInvoiceParam,
    staleTime: 60_000,
  })

  const { data: devolucion, isLoading: loadingDevolucion } = useQuery({
    queryKey: ['devolucion', id],
    queryFn: () => getDevolucionCompra(id!),
    enabled: !!id,
    staleTime: 60_000,
  })

  // Con Multipestañas, esta pantalla queda montada (KeepAlive) al cambiar de pestaña — al volver
  // a ella se re-consulta por si la devolución cambió en el servidor mientras el usuario estaba en otra.
  useEffectOnActive(() => {
    if (isEdit) queryClient.invalidateQueries({ queryKey: ['devolucion', id] })
  }, [isEdit, id], true)

  const editOriginalInvoice = devolucion?.originalInvoice ?? ''
  const { data: editOriginalCompra, isLoading: loadingEditOriginal } = useQuery({
    queryKey: ['compra', editOriginalInvoice],
    queryFn: () => getCompra(editOriginalInvoice),
    enabled: !!id && !!editOriginalInvoice,
    staleTime: 60_000,
  })

  const sourceCompra = (isEdit ? editOriginalCompra : originalCompra) ?? null
  const isLoading = isEdit ? (loadingDevolucion || loadingEditOriginal) : loadingOriginal

  // ── Selección de proveedor → factura (solo en "Nueva Devolución" sin factura preseleccionada) ──
  const showPicker = !isEdit && !originalInvoiceParam
  const [supplierId, setSupplierId] = useState('')
  const [supplierLabel, setSupplierLabel] = useState('')
  const [supplierSearch, setSupplierSearch] = useState('')
  const { data: suppliersData, isLoading: loadingSuppliers } = useQuery({
    queryKey: ['supplierSearch-devolucion', supplierSearch],
    queryFn: () => listSuppliers({ search: supplierSearch || undefined, limit: 15 }),
    enabled: showPicker,
  })
  const supplierOptions: SearchSelectOption[] = (suppliersData?.items ?? []).map((s) => ({
    value: s.id,
    label: s.supplierName,
    sublabel: s.rnc ?? s.cedula,
  }))

  const [compraSearch, setCompraSearch] = useState('')
  const { data: comprasSometidas, isLoading: loadingCompras } = useQuery({
    queryKey: ['compras-submitted-picker', supplierId],
    queryFn: () => listCompras({ status: 'submitted', supplier: supplierId, limit: 100 }),
    enabled: showPicker && !!supplierId,
    staleTime: 60_000,
  })
  const compraOptions: SearchSelectOption[] = (comprasSometidas?.items ?? [])
    .filter((c) => !compraSearch || [c.id, c.billNo, c.ncfProveedor].some((v) => v?.toLowerCase().includes(compraSearch.toLowerCase())))
    .map((c) => ({
      value: c.id,
      label: `${c.ncfProveedor ?? c.billNo ?? c.id}`,
      sublabel: `${formatDate(c.postingDate)} — ${formatDOP(c.grandTotal)}`,
    }))

  const today = new Date().toISOString().slice(0, 10)
  const [qtys, setQtys] = useState<Record<string, string>>({})
  const [postingDate, setPostingDate] = useState('')
  const [reason, setReason] = useState('')

  const rows: FormItem[] = useMemo(() => {
    if (!sourceCompra) return []
      const devByCode = new Map(
        (isEdit && devolucion ? devolucion.items : []).map((it) => [it.itemCode, it.qty] as const),
      )
      return sourceCompra.items.map((it) => {
        const typed = qtys[it.itemCode]
        const parsed = typed !== undefined ? Number(typed) : 0
        const returnQty = isNaN(parsed) ? 0 : Math.min(Math.max(parsed, 0), it.qty)
        const initialQty = isEdit ? Math.abs(devByCode.get(it.itemCode) ?? 0) : 0
        return {
          itemCode: it.itemCode,
          stockQty: it.qty,
          returnQty: typed === undefined ? initialQty : returnQty,
          rate: it.rate,
        }
    })
  }, [sourceCompra, devolucion, isEdit, qtys])

  const effectivePostingDate = postingDate || (isEdit ? (devolucion?.postingDate ? String(devolucion.postingDate).slice(0, 10) : today) : (sourceCompra?.postingDate ? String(sourceCompra.postingDate).slice(0, 10) : today))
  const effectiveReason = reason || (isEdit ? devolucion?.reason ?? '' : '')

  const returnedTotal = rows.reduce((acc, it) => acc + it.returnQty * it.rate, 0)

  // Regla fiscal (la controla el backend): pasados los 30 días de la factura de compra original,
  // la devolución ya no reintegra el ITBIS, solo el monto neto antes de impuestos. Aquí solo se
  // avisa con anticipación — el cálculo real siempre lo hace el backend.
  const diasDesdeFactura = daysSince(sourceCompra?.postingDate)
  const facturaVencidaParaItbis = diasDesdeFactura != null && diasDesdeFactura > DEVOLUCION_DIAS_LIMITE_ITBIS

  const isDirty = useDirtyCheck({ items: rows, postingDate: effectivePostingDate, reason: effectiveReason }, !isLoading && rows.length > 0)
  const confirmClose = useConfirmClose(isDirty, () => (isEdit ? navigate(-1) : navigate('/devoluciones-compras')))

  const saveMutation = useMutation({
    mutationFn: (payload: CreateDevolucionCompraDto) =>
      isEdit
        ? updateDevolucionCompra(id!, { items: payload.items, postingDate: payload.postingDate, reason: payload.reason })
        : createDevolucionCompra(payload),
    onSuccess: (result) => {
      toast.success(isEdit ? 'Devolución actualizada' : 'Devolución creada')
      const formTabId = activeId
      queryClient.invalidateQueries({ queryKey: ['devoluciones-compras'] })
      if (isEdit) queryClient.removeQueries({ queryKey: ['devolucion', id] })
      navigate(`/devoluciones-compras/${isEdit ? id : result.id}`)
      // La pestaña del formulario ya no representa nada útil una vez guardado — se cierra sin
      // navegar (ya se navegó arriba) para no arrastrar su estado/cache si el usuario la reabre.
      if (multiTab && formTabId) closeTab(formTabId, { skipNavigate: true })
    },
    onError: (err: { message?: string; code?: string }) => {
      const code = (err as { code?: string })?.code
      if (code === 'VALIDATION_ERROR') {
        toast.error(err?.message ?? 'Uno o más artículos no existen en la factura original.')
      } else {
        toast.error(err?.message ?? 'No se pudo guardar la devolución')
      }
    },
  })

  function handleSave() {
    if (!rows.some((it) => it.returnQty > 0)) {
      return toast.error('Selecciona al menos un artículo para devolver')
    }
    const payload: CreateDevolucionCompraDto = {
      originalInvoice: isEdit ? devolucion!.originalInvoice : originalInvoiceParam,
      items: rows.filter((it) => it.returnQty > 0).map((it) => ({ itemCode: it.itemCode, qty: it.returnQty })),
      postingDate: effectivePostingDate,
      reason: effectiveReason || undefined,
    }
    saveMutation.mutate(payload)
  }

  if (isLoading) {
    return (
      <div className="page-container" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <span className="skeleton-box" style={{ height: 32, width: 200, display: 'block' }} />
        <span className="skeleton-box" style={{ height: 192, width: '100%', display: 'block' }} />
      </div>
    )
  }

  if (!isEdit && !originalInvoiceParam) {
    return (
      <div className="page-container">
        <button className="page-back-link" onClick={() => navigate('/devoluciones-compras')}>← Devoluciones de Compras</button>
        <PageHeader
          title="Nueva Devolución"
          description="Busca al proveedor y luego selecciona la factura de compra a devolver."
        />

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 560 }}>
          <div className="card">
            <div className="card-header" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span
                className="badge badge-info"
                style={{ width: 22, height: 22, borderRadius: '50%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: 0 }}
              >
                1
              </span>
              <span className="card-title">Proveedor</span>
            </div>
            <div className="card-body">
              {supplierId ? (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Building2 size={16} style={{ color: 'var(--icon-muted)' }} />
                    <span style={{ fontWeight: 500 }}>{supplierLabel}</span>
                    <Check size={14} style={{ color: 'var(--success-text)' }} />
                  </div>
                  <button
                    type="button"
                    className="btn btn-ghost btn-size-sm"
                    onClick={() => { setSupplierId(''); setSupplierLabel(''); setCompraSearch('') }}
                  >
                    Cambiar
                  </button>
                </div>
              ) : (
                <SearchSelect
                  value=""
                  onChange={(val) => {
                    if (!val) return
                    const opt = supplierOptions.find((o) => o.value === val)
                    setSupplierId(val)
                    setSupplierLabel(opt?.label ?? val)
                  }}
                  options={supplierOptions}
                  onSearch={setSupplierSearch}
                  selectedLabel=""
                  placeholder="Buscar proveedor por nombre, RNC o cédula…"
                  loading={loadingSuppliers}
                />
              )}
            </div>
          </div>

          <div className="card" style={{ opacity: supplierId ? 1 : 0.5, pointerEvents: supplierId ? 'auto' : 'none' }}>
            <div className="card-header" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span
                className="badge badge-info"
                style={{ width: 22, height: 22, borderRadius: '50%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: 0 }}
              >
                2
              </span>
              <span className="card-title">Factura de Compra</span>
            </div>
            <div className="card-body">
              <SearchSelect
                value=""
                onChange={(val) => val && navigate(`/devoluciones-compras/nueva?originalInvoice=${encodeURIComponent(val)}`)}
                options={compraOptions}
                onSearch={setCompraSearch}
                selectedLabel=""
                placeholder="Buscar factura (NCF, # factura)…"
                loading={loadingCompras}
                disabled={!supplierId}
              />
              {supplierId && comprasSometidas && comprasSometidas.items.length === 0 && (
                <p style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 8 }}>
                  Este proveedor no tiene facturas de compra sometidas.
                </p>
              )}
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (!sourceCompra) {
    return (
      <div style={{ padding: 32, textAlign: 'center', color: 'var(--error-text)' }}>
        <p>No se pudo cargar la factura original para devolver.</p>
        <button className="btn btn-secondary" onClick={() => navigate(-1)} style={{ marginTop: 16 }}>Volver</button>
      </div>
    )
  }

  return (
    <div className="page-container">
      <button className="page-back-link" onClick={() => navigate(-1)}>← Devoluciones de Compras</button>

      <PageHeader
        title={isEdit ? `Editar ${devolucion?.id}` : 'Nueva Devolución'}
        description={
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <Building2 size={13} style={{ color: 'var(--icon-muted)' }} />
            {sourceCompra.supplierName ?? sourceCompra.supplier}
            <span style={{ color: 'var(--text-tertiary)' }}>·</span>
            <FileText size={13} style={{ color: 'var(--icon-muted)' }} />
            {sourceCompra.ncfProveedor ?? sourceCompra.billNo ?? sourceCompra.id}
          </span>
        }
        action={
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {isEdit && <StatusBadge status={devolucion?.status ?? 'draft'} />}
            <button className="btn btn-ghost btn-size-sm" onClick={confirmClose.requestClose}>
              <X size={14} />Cancelar
            </button>
            <button className="btn btn-primary btn-size-sm" onClick={handleSave} disabled={saveMutation.isPending}>
              <Save size={14} />{saveMutation.isPending ? 'Guardando…' : (isEdit ? 'Guardar' : 'Crear')}
            </button>
          </div>
        }
      />

      {facturaVencidaParaItbis && (
        <div className="inline-alert inline-alert-warn">
          <AlertTriangle size={16} />
          Esta factura tiene más de {DEVOLUCION_DIAS_LIMITE_ITBIS} días ({diasDesdeFactura} días) — por regla fiscal,
          la devolución no reintegrará el ITBIS, solo el monto neto antes de impuestos.
        </div>
      )}

      <div className="card">
        <div className="card-header" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Undo2 size={15} style={{ color: 'var(--icon-muted)' }} />
          <span className="card-title">Datos de la Devolución</span>
        </div>
        <div className="fields-grid fields-grid-3">
          <div className="detail-field">
            <span className="detail-label">Fecha de contabilización</span>
            <DatePicker value={effectivePostingDate} onChange={setPostingDate} />
          </div>
          <div className="detail-field" style={{ gridColumn: 'span 2' }}>
            <span className="detail-label">Motivo</span>
            <input
              className="ff-input"
              placeholder="Motivo de la devolución…"
              value={effectiveReason}
              onChange={(e) => setReason(e.target.value)}
            />
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span className="card-title">Artículos a devolver</span>
          <span className="badge badge-info">{rows.filter((it) => it.returnQty > 0).length} seleccionado(s)</span>
        </div>
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>Código</th>
                <th style={{ textAlign: 'right' }}>Stock (qty)</th>
                <th style={{ textAlign: 'right' }}>Precio</th>
                <th style={{ textAlign: 'right' }}>Qty a devolver</th>
                <th style={{ textAlign: 'right' }}>Subtotal</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((it) => (
                <tr key={it.itemCode} style={it.returnQty > 0 ? { background: 'var(--info-bg, var(--surface-sunken))' } : undefined}>
                  <td style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>{it.itemCode}</td>
                  <td style={{ textAlign: 'right' }}>{it.stockQty}</td>
                  <td style={{ textAlign: 'right' }}>{formatDOP(it.rate, { trimZeros: true })}</td>
                  <td style={{ textAlign: 'right' }}>
                    <input
                      type="number"
                      className="ff-input ff-input-sm"
                      style={{ width: 96, textAlign: 'right' }}
                      min={0}
                      max={it.stockQty}
                      step="any"
                      value={it.returnQty === 0 ? '' : it.returnQty}
                      onChange={(e) => {
                        const v = parseFloat(e.target.value)
                        const next = isNaN(v) ? 0 : Math.min(Math.max(v, 0), it.stockQty)
                        setQtys((prev) => ({ ...prev, [it.itemCode]: String(next) }))
                      }}
                    />
                  </td>
                  <td style={{ textAlign: 'right', fontWeight: 500 }}>{formatDOP(it.returnQty * it.rate, { trimZeros: true })}</td>
                </tr>
              ))}
              <tr style={{ background: 'var(--surface-sunken)', fontWeight: 600 }}>
                <td colSpan={4} style={{ textAlign: 'right' }}>Total a devolver</td>
                <td style={{ textAlign: 'right', fontWeight: 700 }}>{formatDOP(returnedTotal)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <ConfirmModal
        open={confirmClose.confirming}
        onClose={confirmClose.cancelDiscard}
        onConfirm={confirmClose.confirmDiscard}
        title="¿Descartar cambios?"
        description="Tienes cambios sin guardar. Si sales, se perderán."
        confirmLabel="Descartar cambios"
        variant="danger"
      />
    </div>
  )
}
