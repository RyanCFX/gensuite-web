import { useState, useMemo, useEffect } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useEffectOnActive } from 'keepalive-for-react'
import { toast } from 'sonner'
import { useTabs } from '@/contexts/TabsContext'
import { listCompras, getCompra } from '@/shared/api/compras-gastos'
import { getItemLookup } from '@/shared/api/catalog'
import { SearchSelect } from '@/shared/ui/SearchSelect'
import type { SearchSelectOption } from '@/shared/ui/SearchSelect'
import {
  getDevolucionCompra,
  createDevolucionCompra,
  updateDevolucionCompra,
} from '@/shared/api/devoluciones-compras'
import type { CreateDevolucionCompraDto } from '@/shared/api/types'
import { PageHeader } from '@/components/shared/PageHeader'
import { RecargarButton } from '@/components/shared/RecargarButton'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { DatePicker } from '@/shared/ui/DatePicker'
import { Save, X, Building2, FileText, Undo2, Check, AlertTriangle } from 'lucide-react'
import { formatDOP, formatDate, daysSince, todayIso } from '@/lib/formatters'
import { ConfirmModal } from '@/shared/ui/Modal'
import { useConfirmClose } from '@/shared/hooks/useConfirmClose'
import { useDirtyCheck } from '@/shared/hooks/useDirtyCheck'
import { DEVOLUCION_DIAS_LIMITE_ITBIS } from '@/lib/constants'
import { useResizableColumns } from '@/shared/hooks/useResizableColumns'
import { OpcionesSelect } from '@/shared/ui/OpcionesSelect'

const DEVOLUCION_FORM_COLUMNS = [
  { key: 'codigo', width: 120 },
  { key: 'articulo', width: 220 },
  { key: 'stockQty', width: 110 },
  { key: 'precio', width: 110 },
  { key: 'qtyDevolver', width: 130 },
  { key: 'subtotal', width: 110 },
]

interface FormItem {
  itemCode: string
  /** `name` (id de fila) de la línea "Purchase Invoice Item" original — hoy `GET /compras/:id`
   *  no lo expone (verificado contra el servicio real, ver compras.service.ts::mapToResponse),
   *  así que esto queda `undefined` en la práctica. Se deja cableado para que, el día que el
   *  backend lo agregue, `lineaOriginal` viaje solo sin tocar este formulario de nuevo. */
  name?: string
  /** Nombre del artículo — GET /compras/:id no lo trae por línea, se resuelve aparte contra el
   *  catálogo (ver `itemLabels`). */
  itemLabel?: string
  stockQty: number
  returnQty: number
  rate: number
  /** El mismo itemCode aparece más de una vez en la factura original (distintas combinaciones de
   *  dimensión, precio o lote) — sin `name` disponible, el servidor no puede desambiguar y esta
   *  línea puede fallar con 400 al guardar si se selecciona junto a su(s) duplicado(s). */
  ambiguous: boolean
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

  const today = todayIso()
  // Por índice de línea, no por itemCode — una compra puede tener dos líneas del mismo artículo
  // (p. ej. mismo producto a costos distintos), y ambas deben poder devolverse de forma
  // independiente en vez de compartir la misma cantidad tecleada.
  const [qtys, setQtys] = useState<Record<number, string>>({})
  const [postingDate, setPostingDate] = useState('')
  const [reason, setReason] = useState('')

  // GET /compras/:id no devuelve el nombre del artículo por línea — se re-consulta el catálogo
  // (una vez por itemCode único) para poder mostrarlo en la columna "Artículo".
  const [itemLabels, setItemLabels] = useState<Record<string, string>>({})
  useEffect(() => {
    if (!sourceCompra) return
    const codes = [...new Set(sourceCompra.items.map((it) => it.itemCode))]
    let cancelled = false
    Promise.all(codes.map((code) => getItemLookup(code).catch(() => null))).then((catalogItems) => {
      if (cancelled) return
      const next: Record<string, string> = {}
      catalogItems.forEach((ci, idx) => {
        if (ci) next[codes[idx]] = ci.itemName
      })
      setItemLabels(next)
    })
    return () => { cancelled = true }
  }, [sourceCompra])

  const rows: FormItem[] = useMemo(() => {
    if (!sourceCompra) return []
      const devByCode = new Map(
        (isEdit && devolucion ? devolucion.items : []).map((it) => [it.itemCode, it.qty] as const),
      )
      // Cuántas líneas de la factura original comparten el mismo itemCode — si hay más de una,
      // el servidor exige `lineaOriginal` para desambiguar (§6.4); acá solo lo detectamos para
      // avisar en la UI, nunca para bloquear la selección.
      const countByCode = new Map<string, number>()
      for (const it of sourceCompra.items) {
        countByCode.set(it.itemCode, (countByCode.get(it.itemCode) ?? 0) + 1)
      }
      return sourceCompra.items.map((it, idx) => {
        const typed = qtys[idx]
        const parsed = typed !== undefined ? Number(typed) : 0
        const returnQty = isNaN(parsed) ? 0 : Math.min(Math.max(parsed, 0), it.qty)
        // En "Nueva" se precarga la cantidad completa de la factura (editable); en edición, la ya devuelta.
        const initialQty = isEdit ? Math.abs(devByCode.get(it.itemCode) ?? 0) : it.qty
        return {
          itemCode: it.itemCode,
          name: it.id,
          itemLabel: itemLabels[it.itemCode],
          stockQty: it.qty,
          returnQty: typed === undefined ? initialQty : returnQty,
          rate: it.rate,
          ambiguous: (countByCode.get(it.itemCode) ?? 0) > 1,
        }
    })
  }, [sourceCompra, devolucion, isEdit, qtys, itemLabels])

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

  const { widths: colWidths, startResize } = useResizableColumns(DEVOLUCION_FORM_COLUMNS)

  function handleSave() {
    if (!rows.some((it) => it.returnQty > 0)) {
      return toast.error('Selecciona al menos un artículo para devolver')
    }
    const payload: CreateDevolucionCompraDto = {
      originalInvoice: isEdit ? devolucion!.originalInvoice : originalInvoiceParam,
      items: rows
        .filter((it) => it.returnQty > 0)
        .map((it) => ({
          itemCode: it.itemCode,
          qty: it.returnQty,
          // Siempre que tengamos el `name` de la línea original lo mandamos — es inofensivo
          // incluso cuando el itemCode no es ambiguo, y es obligatorio cuando sí lo es (§6.4).
          ...(it.name ? { lineaOriginal: it.name } : {}),
        })),
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
          title={<><span className="page-title-dot" />Nueva Devolución</>}
          description="Busca al proveedor y luego selecciona la factura de compra a devolver."
          action={<RecargarButton label="Actualizar" />}
        />

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 560 }}>
          <div className="card">
            <div className="card-header navy-card-header" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
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
                <OpcionesSelect recurso="proveedores" value="" onChange={(val, opt) => {
                    if (!val) return
                    setSupplierId(val)
                    setSupplierLabel(opt?.label ?? val)
                  }} placeholder="Buscar proveedor por nombre, RNC o cédula…" selectedLabel="" minChars={2} />
              )}
            </div>
          </div>

          <div className="card" style={{ opacity: supplierId ? 1 : 0.5, pointerEvents: supplierId ? 'auto' : 'none' }}>
            <div className="card-header navy-card-header" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
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
        title={<><span className="page-title-dot" />{isEdit ? `Editar ${devolucion?.id}` : 'Nueva Devolución'}</>}
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
            <RecargarButton label="Actualizar" />
            {isEdit && <StatusBadge status={devolucion?.status ?? 'draft'} />}
            <button className="btn btn-ghost btn-size-sm" onClick={confirmClose.requestClose}>
              <X size={14} />Cancelar
            </button>
            <button className="btn btn-navy btn-size-sm" onClick={handleSave} disabled={saveMutation.isPending}>
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
        <div className="card-header navy-card-header" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
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
        <div className="card-header navy-card-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span className="card-title">Artículos a devolver</span>
          <span className="badge badge-info">{rows.filter((it) => it.returnQty > 0).length} seleccionado(s)</span>
        </div>
        <div className="table-scroll">
          <table className="data-table navy-table items-table-resizable">
            <colgroup>
              {DEVOLUCION_FORM_COLUMNS.map((c) => <col key={c.key} style={{ width: colWidths[c.key] }} />)}
            </colgroup>
            <thead>
              <tr>
                <th>
                  Código
                  <span className="col-resize-handle" onMouseDown={startResize('codigo')} />
                </th>
                <th>
                  Artículo
                  <span className="col-resize-handle" onMouseDown={startResize('articulo')} />
                </th>
                <th style={{ textAlign: 'right' }}>
                  Stock (qty)
                  <span className="col-resize-handle" onMouseDown={startResize('stockQty')} />
                </th>
                <th style={{ textAlign: 'right' }}>
                  Precio
                  <span className="col-resize-handle" onMouseDown={startResize('precio')} />
                </th>
                <th style={{ textAlign: 'right' }}>
                  Qty a devolver
                  <span className="col-resize-handle" onMouseDown={startResize('qtyDevolver')} />
                </th>
                <th style={{ textAlign: 'right' }}>
                  Subtotal
                  <span className="col-resize-handle" onMouseDown={startResize('subtotal')} />
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((it, idx) => (
                <tr key={`${it.itemCode}-${idx}`} style={it.returnQty > 0 ? { background: 'var(--info-bg, var(--surface-sunken))' } : undefined}>
                  <td style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                      {it.itemCode}
                      {it.ambiguous && !it.name && (
                        <span title="Este artículo aparece en más de una línea de esta factura — identifíquelo con cuidado antes de devolverlo.">
                          <AlertTriangle size={12} style={{ color: 'var(--warning-text)' }} />
                        </span>
                      )}
                    </span>
                  </td>
                  <td>{it.itemLabel ?? <span className="td-muted">—</span>}</td>
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
                        setQtys((prev) => ({ ...prev, [idx]: String(next) }))
                      }}
                    />
                  </td>
                  <td style={{ textAlign: 'right', fontWeight: 500 }}>{formatDOP(it.returnQty * it.rate, { trimZeros: true })}</td>
                </tr>
              ))}
              <tr style={{ background: 'var(--surface-sunken)', fontWeight: 600 }}>
                <td colSpan={5} style={{ textAlign: 'right' }}>Total a devolver</td>
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
