// Lógica pura de Permisos v2 (sin React): acceso efectivo, filtros bloqueados y
// armado de grants desde el editor de árbol.
// docs/tasks/PROMPT_PERMISOS_V2_Y_DASHBOARD_MODULAR_FRONTEND.md §2.2, §3.3, §7.2–§7.3.
// A propósito sin imports: se prueba con node compilando este archivo solo.

export type AccesoModo = 'off' | 'sombra' | 'activo'

export interface Acceso {
  modo: AccesoModo
  version: string
  modulos: Set<string>
  pantallas: Set<string>
  componentes: Set<string>
  /** Subconjunto de `componentes` por acceso adicional (docs/tasks/
   *  PROMPT_FEATURES_ADICIONALES_FRONTEND.md §2.2). Solo decoración de UI — el permiso real
   *  sigue siendo `componentes`. Nunca derivar acceso de acá. */
  componentesAdicionales: Set<string>
  recursos: Set<string>
  filtrosBloqueados: Record<string, string[]>
}

export interface Grant {
  nivel: 'modulo' | 'pantalla' | 'componente'
  clave: string
  efecto: 'permitir' | 'denegar'
  expiraEn?: string
}

export interface CatalogoComponente {
  key: string
  tipo: string
  nombre: string
  parametro: string | null
  incluirEnCompleta: boolean
  requiere: string[]
  recursos: string[]
  otorgable: boolean
}

export interface CatalogoPantalla {
  key: string
  nombre: string
  componentes: CatalogoComponente[]
}

export interface CatalogoModulo {
  key: string
  nombre: string
  pantallas: CatalogoPantalla[]
}

export const ACCESO_VACIO: Acceso = {
  modo: 'off',
  version: '',
  modulos: new Set(),
  pantallas: new Set(),
  componentes: new Set(),
  componentesAdicionales: new Set(),
  recursos: new Set(),
  filtrosBloqueados: {},
}

/** Pantalla v2 = acción sin el último segmento (`ventas.factura.anular` → `ventas.factura`). */
export function pantallaDeAccion(accionId: string): string {
  const i = accionId.lastIndexOf('.')
  return i === -1 ? accionId : accionId.slice(0, i)
}

/** ¿Puede usar el filtro `param` en la pantalla `pantalla`? En off/sombra siempre sí. */
export function puedeFiltrar(acceso: Acceso | null | undefined, pantalla: string, param: string): boolean {
  if (!acceso || acceso.modo !== 'activo') return true
  return !(acceso.filtrosBloqueados[pantalla] ?? []).includes(param)
}

/** ¿Puede pedir /opciones/:recurso? En off/sombra el backend decide con DocPerm. */
export function puedeConsultar(acceso: Acceso | null | undefined, recurso: string): boolean {
  if (!acceso || acceso.modo !== 'activo') return true
  const key = recurso.startsWith('lookup.') ? recurso : `lookup.${recurso}`
  return acceso.recursos.has(key)
}

/**
 * Quita de `params` los filtros bloqueados (solo en modo activo). No muta el original.
 * Devuelve los params limpios y la lista de params quitados (para avisar en UI).
 */
export function sanearFiltros<T extends object>(
  acceso: Acceso | null | undefined,
  pantalla: string,
  params: T,
): { limpios: T; quitados: string[] } {
  if (!acceso || acceso.modo !== 'activo') return { limpios: params, quitados: [] }
  const bloqueados = new Set(acceso.filtrosBloqueados[pantalla] ?? [])
  if (bloqueados.size === 0) return { limpios: params, quitados: [] }
  const limpios = { ...params } as Record<string, unknown>
  const quitados: string[] = []
  for (const k of Object.keys(limpios)) {
    if (bloqueados.has(k)) {
      delete limpios[k]
      quitados.push(k)
    }
  }
  return { limpios: limpios as T, quitados }
}

// ─── Editor de árbol → grants ────────────────────────────────────────────────

export interface EstadoPantalla {
  /** Componentes marcados (keys del catálogo). Vacío = "Nada" (no emite grants). */
  marcados: Set<string>
  /**
   * "Incluir lo que se agregue en el futuro" (default true cuando todo está marcado):
   * emite `permitir` a nivel pantalla en vez de uno por componente.
   */
  incluirFuturos: boolean
}

function todosLosComponentes(p: CatalogoPantalla): string[] {
  return p.componentes.map((c) => c.key)
}

/** Al marcar un componente, sus requisitos se marcan solos (recursivo). */
export function conRequisitos(
  catalogo: CatalogoModulo[],
  marcados: Set<string>,
  key: string,
): Set<string> {
  const porKey = new Map<string, CatalogoComponente>()
  for (const m of catalogo) for (const p of m.pantallas) for (const c of p.componentes) porKey.set(c.key, c)
  const next = new Set(marcados)
  const pila = [key]
  while (pila.length > 0) {
    const k = pila.pop()!
    if (next.has(k)) continue
    next.add(k)
    for (const req of porKey.get(k)?.requiere ?? []) pila.push(req)
  }
  return next
}

/** Componentes marcados que dependen (directa o transitivamente) de `key`. */
export function dependientesMarcados(
  catalogo: CatalogoModulo[],
  marcados: Set<string>,
  key: string,
): string[] {
  const porKey = new Map<string, CatalogoComponente>()
  for (const m of catalogo) for (const p of m.pantallas) for (const c of p.componentes) porKey.set(c.key, c)
  const dependeDe = (k: string, objetivo: string, vistos: Set<string>): boolean => {
    if (k === objetivo) return true
    if (vistos.has(k)) return false
    vistos.add(k)
    return (porKey.get(k)?.requiere ?? []).some((r) => dependeDe(r, objetivo, vistos))
  }
  return [...marcados].filter((k) => k !== key && dependeDe(k, key, new Set()))
}

/**
 * Grants de UNA pantalla desde su estado. Preferencia por nivel alto: si están todos
 * marcados (o `incluirFuturos`), un `permitir` de pantalla + `denegar` por cada
 * componente no marcado ("Completa excepto…"). Los sensibles (`incluirEnCompleta:
 * false`) NUNCA entran por nivel: marcados llevan su propio `permitir` de componente,
 * sin marcar no emiten nada (otro perfil puede darlos). Si no, un `permitir` por marcado.
 */
export function grantsDePantalla(p: CatalogoPantalla, estado: EstadoPantalla): Grant[] {
  const todas = todosLosComponentes(p)
  const sensibles = new Set(p.componentes.filter((c) => c.incluirEnCompleta === false).map((c) => c.key))
  if (estado.marcados.size === 0) return []
  const noSensibles = todas.filter((k) => !sensibles.has(k))
  const todoMarcado = noSensibles.every((k) => estado.marcados.has(k))
  if (estado.incluirFuturos || todoMarcado) {
    const grants: Grant[] = [{ nivel: 'pantalla', clave: p.key, efecto: 'permitir' }]
    for (const k of todas) {
      if (sensibles.has(k)) {
        if (estado.marcados.has(k)) grants.push({ nivel: 'componente', clave: k, efecto: 'permitir' })
      } else if (!estado.marcados.has(k)) {
        grants.push({ nivel: 'componente', clave: k, efecto: 'denegar' })
      }
    }
    return grants
  }
  return [...estado.marcados].map((clave) => ({ nivel: 'componente', clave, efecto: 'permitir' }) as Grant)
}

/** Excepciones (denegar + sensibles explícitos) de una pantalla en modo nivel alto. */
function excepcionesPantalla(p: CatalogoPantalla, estado: EstadoPantalla): Grant[] {
  const grants: Grant[] = []
  const sensibles = new Set(p.componentes.filter((c) => c.incluirEnCompleta === false).map((c) => c.key))
  for (const k of todosLosComponentes(p)) {
    if (sensibles.has(k)) {
      if (estado.marcados.has(k)) grants.push({ nivel: 'componente', clave: k, efecto: 'permitir' })
    } else if (!estado.marcados.has(k)) {
      grants.push({ nivel: 'componente', clave: k, efecto: 'denegar' })
    }
  }
  return grants
}

/**
 * Grants de un módulo completo. Si TODAS sus pantallas están completas con
 * `incluirFuturos` → un `permitir` de módulo (+ excepciones por pantalla).
 * Si no, grants por pantalla.
 */
export function grantsDeModulo(
  m: CatalogoModulo,
  estados: Record<string, EstadoPantalla>,
): Grant[] {
  const pantallas = m.pantallas
  const todasCompletas = pantallas.length > 0 && pantallas.every((p) => {
    const e = estados[p.key]
    if (!e || !e.incluirFuturos) return false
    const noSensibles = p.componentes.filter((c) => c.incluirEnCompleta !== false).map((c) => c.key)
    return noSensibles.every((k) => e.marcados.has(k))
  })
  if (todasCompletas) {
    return [
      { nivel: 'modulo', clave: m.key, efecto: 'permitir' },
      ...pantallas.flatMap((p) => excepcionesPantalla(p, estados[p.key])),
    ]
  }
  return pantallas.flatMap((p) => grantsDePantalla(p, estados[p.key] ?? { marcados: new Set(), incluirFuturos: true }))
}

/** Grants de todo el árbol (perfil o excepciones de usuario). */
export function grantsDelArbol(
  catalogo: CatalogoModulo[],
  estados: Record<string, EstadoPantalla>,
): Grant[] {
  return catalogo.flatMap((m) => grantsDeModulo(m, estados))
}

// ─── Grants → estado del editor (editar un perfil existente) ─────────────────

function grantVigente(g: Grant, ahora: number): boolean {
  if (!g.expiraEn) return true
  const t = Date.parse(g.expiraEn)
  return Number.isNaN(t) || t > ahora
}

/**
 * Reconstruye el estado del editor desde grants guardados + catálogo. Los grants
 * vencidos se ignoran. Un `denegar` de usuario/perfil quita la clave de marcados;
 * un `permitir` de pantalla/módulo marca todo el subárbol (menos denegados).
 */
export function estadoDesdeGrants(
  catalogo: CatalogoModulo[],
  grants: Grant[],
): Record<string, EstadoPantalla> {
  const ahora = Date.now()
  const vigentes = grants.filter((g) => grantVigente(g, ahora))
  const permitirPantalla = new Set(vigentes.filter((g) => g.efecto === 'permitir' && g.nivel === 'pantalla').map((g) => g.clave))
  const permitirModulo = new Set(vigentes.filter((g) => g.efecto === 'permitir' && g.nivel === 'modulo').map((g) => g.clave))
  const permitirComp = new Set(vigentes.filter((g) => g.efecto === 'permitir' && g.nivel === 'componente').map((g) => g.clave))
  const denegados = new Set(vigentes.filter((g) => g.efecto === 'denegar').map((g) => g.clave))

  const estados: Record<string, EstadoPantalla> = {}
  for (const m of catalogo) {
    const moduloPermitido = permitirModulo.has(m.key)
    for (const p of m.pantallas) {
      const todas = todosLosComponentes(p)
      const sensibles = new Set(p.componentes.filter((c) => c.incluirEnCompleta === false).map((c) => c.key))
      const marcados = new Set<string>()
      if (moduloPermitido || permitirPantalla.has(p.key)) {
        // Nivel alto: no sensibles enteros + sensibles con permitir explícito, menos denegados.
        for (const k of todas) {
          if (denegados.has(k)) continue
          if (!sensibles.has(k) || permitirComp.has(k)) marcados.add(k)
        }
      } else {
        for (const k of todas) if (permitirComp.has(k) && !denegados.has(k)) marcados.add(k)
      }
      // nivelAlto si vino de pantalla/módulo (incluye futuros), no si son componentes sueltos
      estados[p.key] = { marcados, incluirFuturos: moduloPermitido || permitirPantalla.has(p.key) }
    }
  }
  return estados
}

// ─── Códigos de error nuevos (§9) ────────────────────────────────────────────

export const ERRORES_ACCESO_403 = new Set([
  'PERMISO_INSUFICIENTE',
  'FILTRO_NO_PERMITIDO',
  'RECURSO_NO_PERMITIDO',
  'WIDGET_NO_PERMITIDO',
  'WIDGET_NO_CONTRATADO',
  // Datos del artículo (docs/tasks/PROMPT_DATOS_ARTICULO_FRONTEND.md §7): filtro u orden
  // sobre un dato restringido.
  'DATO_NO_PERMITIDO',
])

/** ¿Es un 403 de acceso que amerita refrescar /me/acceso + /me/permissions? */
export function esErrorDeAcceso(code: unknown): boolean {
  return typeof code === 'string' && ERRORES_ACCESO_403.has(code)
}
