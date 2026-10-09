import type { DeliveryTrackingFactura } from '@/shared/api/types'
import type { TrackingRequisito } from './viajeLib'

export interface TrackingEntry {
  serialsText: string
  batches: { batchId: string; qty: string }[]
}
export type TrackingState = Record<string, TrackingEntry>

export const trackingKey = (r: Pick<TrackingRequisito, 'invoiceId' | 'itemCode'>) => `${r.invoiceId}::${r.itemCode}`
export const emptyTracking = (): TrackingEntry => ({ serialsText: '', batches: [{ batchId: '', qty: '' }] })

/** Arma el `tracking[]` del request a partir del estado capturado (omite lo vacío). */
export function buildTracking(reqs: TrackingRequisito[], state: TrackingState): DeliveryTrackingFactura[] {
  const byInvoice = new Map<string, DeliveryTrackingFactura>()
  for (const r of reqs) {
    const e = state[trackingKey(r)]
    if (!e) continue
    const item: DeliveryTrackingFactura['items'][number] = { itemCode: r.itemCode }
    if (r.tipo === 'serial') {
      const serials = e.serialsText.split(/[\n,]/).map((s) => s.trim()).filter(Boolean)
      if (serials.length === 0) continue
      item.serials = serials
    } else {
      const batches = e.batches
        .map((b) => ({ batchId: b.batchId.trim(), qty: Number(b.qty) }))
        .filter((b) => b.batchId && b.qty > 0)
      if (batches.length === 0) continue
      item.batches = batches
    }
    const f = byInvoice.get(r.invoiceId) ?? { invoiceId: r.invoiceId, items: [] }
    f.items.push(item)
    byInvoice.set(r.invoiceId, f)
  }
  return [...byInvoice.values()]
}

/** `true` si cada requisito tiene al menos un serial/lote capturado. */
export function trackingCompleto(reqs: TrackingRequisito[], state: TrackingState): boolean {
  const built = buildTracking(reqs, state)
  return reqs.every((r) => built.some((f) => f.invoiceId === r.invoiceId && f.items.some((i) => i.itemCode === r.itemCode)))
}

