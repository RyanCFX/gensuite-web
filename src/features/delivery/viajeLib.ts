// Helpers puros de viajes/entregas de delivery (sin componentes).
import type { ApiError, DeliveryViajeEstado } from '@/shared/api/types'

export const VIAJE_ESTADO_LABEL: Record<DeliveryViajeEstado, string> = {
  borrador: 'Borrador',
  programado: 'Programado',
  en_ruta: 'En ruta',
  completado: 'Completado',
  cancelado: 'Cancelado',
}

/** Convierte un `datetime-local` ("2026-10-08T14:30") a ISO; vacío → undefined. */
export function localInputToIso(v: string): string | undefined {
  if (!v) return undefined
  const d = new Date(v)
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString()
}

/** ISO → valor para `<input type="datetime-local">` en hora local. */
export function isoToLocalInput(iso?: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`
}

// ─── Detalle de errores (faltantes de stock) ─────────────────────────────────

type Rec = Record<string, unknown>

function asArray(v: unknown): Rec[] {
  return Array.isArray(v) ? (v.filter((x) => x && typeof x === 'object') as Rec[]) : []
}

/** Líneas legibles de `details.faltantes[]` (409 STOCK_INSUFFICIENT_OR_RESERVED). */
export function lineasFaltantes(err: unknown): string[] {
  const d = (err as Partial<ApiError> | null)?.details as Rec | undefined
  return asArray(d?.faltantes).map((f) => {
    const art = String(f.itemCode ?? f.item ?? '?')
    const alm = f.warehouse ? ` en ${String(f.warehouse)}` : ''
    const sol = f.solicitado ?? f.qty
    const disp = f.disponible
    const falt = f.faltante
    const partes: string[] = []
    if (sol != null) partes.push(`pedido ${String(sol)}`)
    if (disp != null) partes.push(`disponible ${String(disp)}`)
    if (falt != null) partes.push(`faltan ${String(falt)}`)
    return `${art}${alm}${partes.length ? ` — ${partes.join(', ')}` : ''}`
  })
}

/** Requisitos de tracking (factura × artículo) a partir de `details` de DELIVERY_TRACKING_PENDIENTE. */
export interface TrackingRequisito {
  invoiceId: string
  itemCode: string
  qty?: number
  tipo: 'serial' | 'lote'
}

export function requisitosDesdeError(err: unknown): TrackingRequisito[] {
  const d = (err as Partial<ApiError> | null)?.details as Rec | undefined
  if (!d) return []
  const out: TrackingRequisito[] = []
  const visit = (node: unknown, depth: number) => {
    if (depth > 4 || !node || typeof node !== 'object') return
    if (Array.isArray(node)) { node.forEach((n) => visit(n, depth + 1)); return }
    const o = node as Rec
    if (typeof o.invoiceId === 'string') {
      const items = asArray(o.items ?? o.articulos ?? o.pendientes ?? (o.itemCode ? [o] : []))
      for (const it of items) {
        if (typeof it.itemCode !== 'string') continue
        const t = String(it.tipo ?? '').toLowerCase()
        out.push({
          invoiceId: o.invoiceId,
          itemCode: it.itemCode,
          qty: typeof it.qty === 'number' ? it.qty : undefined,
          tipo: t === 'lote' || t === 'batch' ? 'lote' : 'serial',
        })
      }
      return
    }
    Object.values(o).forEach((v) => visit(v, depth + 1))
  }
  visit(d, 0)
  return out
}

/** `details.viaje` (id del viaje que quedó en borrador) si el error lo trae. */
export function viajeDeError(err: unknown): string | undefined {
  const d = (err as Partial<ApiError> | null)?.details as Rec | undefined
  const v = d?.viaje
  if (typeof v === 'string') return v
  if (v && typeof v === 'object' && typeof (v as Rec).id === 'string') return (v as Rec).id as string
  return undefined
}

/** `details` de DELIVERY_FACTURA_YA_DESPACHADA: despacho y viaje existentes. */
export function viajeExistenteDeError(err: unknown): { despacho?: string; viaje?: string } {
  const d = (err as Partial<ApiError> | null)?.details as Rec | undefined
  if (!d) return {}
  const pick = (k: string) => {
    const v = d[k]
    if (typeof v === 'string') return v
    if (v && typeof v === 'object' && typeof (v as Rec).id === 'string') return (v as Rec).id as string
    return undefined
  }
  return { despacho: pick('despacho'), viaje: pick('viaje') ?? pick('trip') }
}

/** Cómo interpretar la respuesta de despachar (§4.2). */
export type DespachoResultado = 'ok' | 'ya_despachado' | 'dns_pendiente'

export function interpretarDespacho(v: { estado?: string; yaDespachado?: boolean } | null | undefined): DespachoResultado {
  if (v?.estado === 'dns_sometidos_trip_pendiente') return 'dns_pendiente'
  if (v?.yaDespachado) return 'ya_despachado'
  return 'ok'
}
