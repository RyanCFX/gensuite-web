import { client, unwrap, unwrapPaginated } from './client'
import { ENDPOINTS } from './endpoints'
import type { PaginatedResponse, PaginationMeta } from './types'

// Auditoría de Transacciones — docs/tasks/PROMPT_AUDITORIA_TRANSACCIONES_FRONTEND.md §3-§4.
//
// Pantalla 100% lectura. El `openapi.json` del repo TODAVÍA NO documenta estos endpoints
// (verificado: no existe `/auditoria/transacciones` en el spec) — los shapes de abajo siguen la
// semántica del documento con normalización defensiva. Cuando el backend publique el spec,
// cotejar nombres exactos acá (gana el spec en forma, el doc en reglas de negocio).

export interface AuditoriaTransaccion {
  id: string
  accion: string
  /** Texto ya resuelto en español para mostrar — NUNCA mostrar `accion` crudo. */
  label: string
  actorEmail: string
  doctype: string
  docname: string
  /** Puede venir null — mostrar solo label + doctype/docname, sin romper layout. */
  resumen: string | null
  /** URL absoluta completa ya resuelta por el servidor. Navegar tal cual (§6). */
  link: string
  createdAt: string
}

export interface AuditoriaTransaccionDetail extends AuditoriaTransaccion {
  /** Objeto libre con ids relacionados — shape varía por tipo de transacción. */
  metadata: Record<string, unknown>
  /**
   * Historial fino best-effort desde ERPNext. `null` = "no se pudo traer" — mostrar estado
   * "Detalle fino no disponible", NUNCA error ni carga infinita.
   */
  versiones: unknown[] | null
}

export interface AuditoriaListParams {
  limit?: number
  offset?: number
  /** Búsqueda libre: matchea resumen + docname. */
  search?: string
  /** Rango fecha/hora ISO, filtra por createdAt, inclusivo. */
  desde?: string
  hasta?: string
  /** Email EXACTO del actor. Protegido por el filtro sensible (§1/§3). */
  usuario?: string
  /** Acción exacta (ej. "gastos.someter"). */
  accion?: string
  /** Doctype ERPNext exacto (ej. "Sales Invoice"). */
  doctype?: string
}

function asString(v: unknown, fallback = ''): string {
  return typeof v === 'string' ? v : fallback
}

function normalizeRow(raw: unknown): AuditoriaTransaccion {
  const d = (raw ?? {}) as Record<string, unknown>
  const resumen = d.resumen
  return {
    id: asString(d.id),
    accion: asString(d.accion),
    label: asString(d.label, asString(d.accion)),
    actorEmail: asString(d.actorEmail, asString(d.actor_email)),
    doctype: asString(d.doctype),
    docname: asString(d.docname),
    resumen: typeof resumen === 'string' ? resumen : null,
    link: asString(d.link),
    createdAt: asString(d.createdAt, asString(d.created_at)),
  }
}

function normalizeDetail(raw: unknown): AuditoriaTransaccionDetail {
  const base = normalizeRow(raw)
  const d = (raw ?? {}) as Record<string, unknown>
  const metadata =
    d.metadata && typeof d.metadata === 'object' && !Array.isArray(d.metadata)
      ? (d.metadata as Record<string, unknown>)
      : {}
  const versionesRaw = d.versiones
  return {
    ...base,
    metadata,
    versiones: Array.isArray(versionesRaw) ? versionesRaw : null,
  }
}

export interface AuditoriaListResult {
  items: AuditoriaTransaccion[]
  meta: PaginationMeta
}

export async function listAuditoriaTransacciones(
  params: AuditoriaListParams = {},
): Promise<AuditoriaListResult> {
  // El backend valida `@Max(100)` y responde 400 si limit > 100 (no recorta) — se capa en el
  // cliente para no disparar nunca ese 400. `orderBy` se acepta pero se ignora (siempre
  // createdAt descendente): no se expone orden en la UI a propósito.
  const limit = params.limit !== undefined ? Math.min(params.limit, 100) : undefined
  const res = await client.get<PaginatedResponse<unknown>>(ENDPOINTS.auditoria.transacciones.list, {
    params: { ...params, limit },
  })
  const { items, meta } = unwrapPaginated(res)
  return { items: items.map(normalizeRow), meta }
}

export async function getAuditoriaTransaccion(id: string): Promise<AuditoriaTransaccionDetail> {
  const res = await client.get<{ success: true; data: unknown }>(
    ENDPOINTS.auditoria.transacciones.byId(id),
  )
  return normalizeDetail(unwrap(res))
}

/**
 * Navegación al documento real vía `link` (§6):
 * - Si el dominio coincide con el frontend → pathname para router interno (sin full reload).
 * - Si no coincide → URL completa como fallback (nunca ignorar en silencio).
 * - Nunca "arreglar" el link agregando ids a mano (Nota de Débito / Stock Entry apuntan
 *   intencionalmente a lista o formulario de creación).
 */
export function resolverDestinoLink(link: string): { pathname: string | null; href: string } {
  if (!link) return { pathname: null, href: link }
  try {
    const url = new URL(link, window.location.origin)
    if (url.origin === window.location.origin) {
      return { pathname: `${url.pathname}${url.search}${url.hash}`, href: link }
    }
    return { pathname: null, href: link }
  } catch {
    return { pathname: null, href: link }
  }
}

/** Claves de Permisos v2 / features de este módulo (§1). Centralizadas para no hardcodear strings. */
export const AUDITORIA_PANTALLA = 'administracion.auditoria'
export const AUDITORIA_ACCION_LISTAR = 'administracion.auditoria.listar'
export const AUDITORIA_FILTRO_USUARIO = 'administracion.auditoria.filtro.usuario'
