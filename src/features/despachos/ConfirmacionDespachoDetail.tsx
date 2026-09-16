// Detalle/confirmación de una Solicitud de Confirmación de Despacho — docs/tasks/
// 79_confirmacion_despacho_pedido.md §4. Reemplaza al viejo modal embebido en el detalle de
// Pedido (POST /pedidos/:id/confirmar-despacho, eliminado) — la acción vive acá, en Despachos,
// operando sobre el id de la SOLICITUD, no el del pedido.

import { useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useQuery, useQueries, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { ArrowLeft, ClipboardCheck } from 'lucide-react'
import { getConfirmacion, confirmarSolicitud } from '@/shared/api/despachos'
import { getItem } from '@/shared/api/catalog'
import { listAlmacenes } from '@/shared/api/config'
import { PageHeader } from '@/components/shared/PageHeader'
import type { ApiError, ConfirmarStockDespachoItemDto, ConfirmarStockDespachoResult } from '@/shared/api/types'
import { isApiErrorCode, ERROR_CODES } from '@/shared/api/client'
import { formatStockInsufficientMessage } from '@/lib/stockAlerts'
import { useItemsStock, resolveDisponible } from '@/shared/hooks/useItemsStock'
import { usePuede } from '@/shared/permissions/can'
import { SearchSelect } from '@/shared/ui/SearchSelect'
import { TrackedComponentEditor } from '@/components/shared/TrackedComponentEditor'
import type { TrackedComponent } from '@/components/shared/ComponentTrackingModal'

const STATUS_BADGE: Record<string, string> = {
  Pendiente: 'badge-warning',
  Confirmado: 'badge-success',
  Cancelado: 'badge-neutral',
}

export default function ConfirmacionDespachoDetail() {
  const { id } = useParams<{ id: string }>()
  const queryClient = useQueryClient()
  const puedeConfirmar = usePuede('despachos.editar')

  const { data: solicitud, isLoading } = useQuery({
    queryKey: ['despacho-confirmacion', id],
    queryFn: () => getConfirmacion(id!),
    enabled: !!id,
  })

  const [sources, setSources] = useState<Record<number, string>>({})
  const [warehouseSearch, setWarehouseSearch] = useState('')
  const [serialsByItem, setSerialsByItem] = useState<Record<string, string[]>>({})
  const [batchesByItem, setBatchesByItem] = useState<Record<string, { batchId: string; qty: number }[]>>({})

  // Solo se consulta el artículo aparte para resolver serial vs. lote — GET /despachos/confirmaciones/:id
  // ya dice qué líneas lo necesitan (`requiresSerialOrBatch`), no hace falta consultar el resto.
  const codesConTracking = [...new Set((solicitud?.items ?? []).filter((i) => i.requiresSerialOrBatch).map((i) => i.itemCode))]
  const itemQueries = useQueries({
    queries: codesConTracking.map((code) => ({
      queryKey: ['item-tracking-type', code],
      queryFn: () => getItem(code),
      staleTime: 5 * 60_000,
    })),
  })
  const trackingTypeByCode = new Map(
    itemQueries.map((q) => q.data).filter((it): it is NonNullable<typeof it> => !!it).map((it) => [it.id, it.trackingType] as const),
  )

  const { data: almacenesData } = useQuery({
    queryKey: ['almacenes-confirmar-despacho'],
    queryFn: () => listAlmacenes(),
    enabled: !!solicitud,
  })
  const warehouseOptions = (almacenesData ?? [])
    .filter((a) => !a.disabled)
    .filter((a) => !warehouseSearch || a.name.toLowerCase().includes(warehouseSearch.toLowerCase()))
    .map((a) => ({ value: a.id, label: a.name }))

  const stockMap = useItemsStock((solicitud?.items ?? []).map((i) => i.itemCode))

  function isTrackingComplete(itemCode: string, qtyNeeded: number): boolean {
    const item = solicitud?.items.find((i) => i.itemCode === itemCode)
    if (!item?.requiresSerialOrBatch) return true
    if (trackingTypeByCode.get(itemCode) === 'batch') {
      const sum = (batchesByItem[itemCode] ?? []).reduce((s, b) => s + Number(b.qty || 0), 0)
      return sum === qtyNeeded && (batchesByItem[itemCode]?.length ?? 0) > 0
    }
    return (serialsByItem[itemCode]?.length ?? 0) === qtyNeeded
  }

  const allTrackingComplete = (solicitud?.items ?? []).every((it) => isTrackingComplete(it.itemCode, it.qty))

  const confirmarMutation = useMutation({
    mutationFn: (items: ConfirmarStockDespachoItemDto[]) => confirmarSolicitud(id!, { items }),
    onSuccess: (res: ConfirmarStockDespachoResult) => {
      toast.success(res.message, { duration: 6000 })
      queryClient.invalidateQueries({ queryKey: ['despacho-confirmacion', id] })
      queryClient.invalidateQueries({ queryKey: ['despachos-confirmaciones'] })
      if (res.salesOrder) queryClient.invalidateQueries({ queryKey: ['pedido', res.salesOrder] })
    },
    onError: (err: ApiError) => {
      if (isApiErrorCode(err, ERROR_CODES.STOCK_INSUFFICIENT_OR_RESERVED)) {
        toast.error(formatStockInsufficientMessage(err), { duration: 8000 })
        return
      }
      toast.error(err?.message ?? 'Error al confirmar el despacho')
    },
  })

  function handleConfirm() {
    if (!solicitud) return
    // §4.2 — a diferencia de la v1, dto.items debe cubrir TODAS las líneas de la solicitud, tengan
    // o no faltante/tracking (las que no necesitan nada igual deben aparecer, solo con itemCode).
    const payload: ConfirmarStockDespachoItemDto[] = solicitud.items.map((it, i) => {
      const sourceWarehouse = sources[i] || undefined
      const trackingType = trackingTypeByCode.get(it.itemCode)
      return {
        itemCode: it.itemCode,
        ...(sourceWarehouse ? { sourceWarehouse } : {}),
        ...(it.requiresSerialOrBatch && trackingType === 'serial' ? { serials: serialsByItem[it.itemCode] ?? [] } : {}),
        ...(it.requiresSerialOrBatch && trackingType === 'batch' ? { batches: batchesByItem[it.itemCode] ?? [] } : {}),
      }
    })
    confirmarMutation.mutate(payload)
  }

  if (isLoading) return <div className="page-container"><div className="skeleton-box" style={{ width: 280, height: 28 }} /><div className="skeleton-box" style={{ width: '100%', height: 128, marginTop: 12 }} /></div>
  if (!solicitud) return <div className="page-container"><div className="empty-state"><p className="empty-title">Solicitud no encontrada</p></div></div>

  const yaResuelta = solicitud.status !== 'Pendiente'

  return (
    <div className="page-container">
      <PageHeader
        title={
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Link to="/despachos/confirmaciones" className="page-back-link"><ArrowLeft size={14} /></Link>
            Confirmación de despacho — {solicitud.salesOrder}
            <span className={`badge ${STATUS_BADGE[solicitud.status]}`}>{solicitud.status}</span>
          </div>
        }
        description={`Cliente: ${solicitud.customerName}${solicitud.branch ? ` — Sucursal: ${solicitud.branch}` : ''}`}
      />

      {yaResuelta ? (
        <div className="inline-alert inline-alert-info" style={{ marginBottom: 16 }}>
          {solicitud.status === 'Confirmado'
            ? `Esta solicitud ya fue confirmada${solicitud.confirmedBy ? ` por ${solicitud.confirmedBy}` : ''}${solicitud.confirmedAt ? ` el ${solicitud.confirmedAt}` : ''}. El pedido ${solicitud.salesOrder} ya puede someterse desde Pedidos.`
            : 'Esta solicitud fue cancelada — probablemente el pedido se editó y se generó una nueva solicitud vigente. Buscá el pedido en la cola con status=Pendiente.'}
        </div>
      ) : (
        <p className="ff-hint" style={{ marginBottom: 16 }}>
          Confirma la existencia física de los artículos antes de que el pedido pueda someterse (facturarse). Esto
          NO somete el pedido — eso sigue siendo un paso aparte, desde la pantalla de Pedidos.
        </p>
      )}

      <div className="card">
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>Artículo</th>
                <th style={{ textAlign: 'right' }}>Cantidad</th>
                <th>Almacén destino</th>
                {!yaResuelta && <th style={{ width: 260 }}>Traer faltante desde (opcional)</th>}
              </tr>
            </thead>
            <tbody>
              {solicitud.items.map((it, i) => {
                const stock = stockMap.get(it.itemCode)
                const sourceStock = sources[i] ? resolveDisponible(stock, sources[i]) : undefined
                const trackingType = trackingTypeByCode.get(it.itemCode)
                return (
                  <tr key={`${it.itemCode}-${i}`}>
                    <td>
                      <div>{it.itemName || it.itemCode} <span className="td-muted">({it.itemCode})</span></div>
                      {!yaResuelta && it.requiresSerialOrBatch && trackingType && (
                        <div style={{ marginTop: 8 }}>
                          <TrackedComponentEditor
                            component={{
                              itemCode: it.itemCode,
                              itemName: it.itemName,
                              trackingType: trackingType === 'batch' ? 'batch' : 'serial',
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
                    <td style={{ textAlign: 'right' }}>{it.qty} {it.uom}</td>
                    <td className="td-muted">{it.warehouse}</td>
                    {!yaResuelta && (
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
                    )}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {!yaResuelta && puedeConfirmar && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
          <button
            className="btn btn-primary"
            disabled={confirmarMutation.isPending || !allTrackingComplete}
            onClick={handleConfirm}
          >
            <ClipboardCheck size={14} /> {confirmarMutation.isPending ? 'Confirmando…' : 'Confirmar despacho'}
          </button>
        </div>
      )}
    </div>
  )
}
