import type { ApiError } from '@/shared/api/types'

/**
 * Niveles de precio A/B/C del artículo (y márgenes A/B/C en modo costo + margen).
 * Regla del BFF (POST/PUT /catalog/items, PUT /catalog/items/:id/precios):
 * - un solo nivel en total → los otros dos se igualan a él;
 * - dos niveles → 400 `PRECIOS_NIVELES_INCOMPLETOS` (`details.faltante`, `details.presentes`);
 * - tres niveles → se guardan tal cual. El 0 es un valor válido.
 * "En total" = lo que se envía + lo que el artículo ya tiene (enviar vacío no borra lo existente).
 * Esta validación es solo informativa/previa: el backend manda.
 */
export type Nivel = 'A' | 'B' | 'C'
export const NIVELES: readonly Nivel[] = ['A', 'B', 'C']
export type NivelesValores = Partial<Record<Nivel, number | null | undefined>>

export type NivelesEstado =
  | { estado: 'ninguno' }
  | { estado: 'uno'; presentes: [Nivel]; valor: number; vacios: Nivel[] }
  | { estado: 'dos'; presentes: Nivel[]; faltante: Nivel }
  | { estado: 'tres' }

/** `true` si hay un número usable (el 0 cuenta). */
export const hayValor = (v: number | null | undefined): v is number =>
  typeof v === 'number' && Number.isFinite(v)

/** Evalúa los tres niveles combinando lo enviado con lo que el artículo ya tiene. */
export function evaluarNiveles(enviados: NivelesValores, existentes?: NivelesValores): NivelesEstado {
  const efectivo: Partial<Record<Nivel, number>> = {}
  for (const n of NIVELES) {
    const v = hayValor(enviados[n]) ? enviados[n] : existentes?.[n]
    if (hayValor(v)) efectivo[n] = v
  }
  const presentes = NIVELES.filter((n) => n in efectivo)
  if (presentes.length === 0) return { estado: 'ninguno' }
  if (presentes.length === 3) return { estado: 'tres' }
  if (presentes.length === 1) {
    return { estado: 'uno', presentes: [presentes[0]], valor: efectivo[presentes[0]]!, vacios: NIVELES.filter((n) => n !== presentes[0]) }
  }
  return { estado: 'dos', presentes, faltante: NIVELES.find((n) => !(n in efectivo))! }
}

/** Nivel faltante de un 400 `PRECIOS_NIVELES_INCOMPLETOS` (`details.faltante`). */
export function faltanteDeError(err: unknown): Nivel | null {
  const e = err as Partial<ApiError> | null | undefined
  if (e?.code !== 'PRECIOS_NIVELES_INCOMPLETOS') return null
  const f = String((e.details as Record<string, unknown> | undefined)?.faltante ?? '').trim().toUpperCase()
  const n = f.slice(-1)
  return n === 'A' || n === 'B' || n === 'C' ? n : null
}

export function etiquetaNivel(n: Nivel, tipo: 'precio' | 'margen' = 'precio'): string {
  return `${tipo === 'precio' ? 'Precio' : 'Margen'} ${n}`
}

/** Aviso cuando se llena un solo nivel (los otros tomarán ese valor). */
export function avisoUnNivel(r: Extract<NivelesEstado, { estado: 'uno' }>, tipo: 'precio' | 'margen' = 'precio'): string {
  const otros = r.vacios.map((n) => etiquetaNivel(n, tipo)).join(' y ')
  return `Solo llenaste ${etiquetaNivel(r.presentes[0], tipo)}: ${otros} tomarán ese mismo valor al guardar.`
}

/** Error cuando faltan niveles (dos llenos, uno vacío). */
export function errorNivelFaltante(faltante: Nivel, tipo: 'precio' | 'margen' = 'precio'): string {
  return `Falta ${etiquetaNivel(faltante, tipo)}: llena los tres niveles, o solo uno para que los demás lo copien.`
}
