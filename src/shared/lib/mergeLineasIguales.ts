// Fusión de líneas idénticas (mismo artículo + misma combinación de dimensión de inventario) antes
// de someter un documento — docs/tasks/PROMPT_INVENTORY_DIMENSIONS_FRONTEND.md §5.1. Reutilizado
// en Facturación, Pedidos, Cotizaciones y Despachos: dos líneas del mismo `itemCode` con la MISMA
// `dimensiones` exacta se funden en una sola con la cantidad sumada, para no dejarle al servidor un
// único error de "stock insuficiente" sobre la suma sin que el usuario entienda por qué.
import type { DimensionesLinea } from '@/shared/api/types'

/** `true` si dos combinaciones tienen exactamente las mismas claves y valores (orden no importa). */
function mismaCombinacion(a?: DimensionesLinea, b?: DimensionesLinea): boolean {
  const aKeys = Object.keys(a ?? {})
  const bKeys = Object.keys(b ?? {})
  if (aKeys.length !== bKeys.length) return false
  return aKeys.every((k) => a?.[k] === b?.[k])
}

/**
 * Fusiona filas consecutivas o no del mismo `itemCode` con la misma `dimensiones` exacta, sumando
 * `qty`. Conserva el resto de los campos de la PRIMERA fila del grupo (rate, descuento, almacén,
 * etc.) — el llamador es responsable de que esos campos ya sean consistentes entre las filas a
 * fusionar si le importa (en la práctica, dos líneas de la misma combinación casi siempre comparten
 * también almacén/tarifa, y si no, fusionarlas igual es preferible a dejar pasar el error confuso
 * de stock que describe §5.1).
 *
 * `getItemCode`/`getDimensiones` extraen esos campos de la fila genérica `T` de cada formulario
 * (cada uno con su propio shape de línea) y `sumQty` devuelve una copia de la fila base con la
 * cantidad sumada de la fila que se está fusionando.
 */
export function mergeLineasIguales<T>(
  rows: T[],
  opts: {
    getItemCode: (row: T) => string | undefined
    getDimensiones: (row: T) => DimensionesLinea | undefined
    sumQty: (base: T, extra: T) => T
  },
): T[] {
  const { getItemCode, getDimensiones, sumQty } = opts
  const merged: T[] = []

  for (const row of rows) {
    const itemCode = getItemCode(row)
    const dims = getDimensiones(row)
    // Filas sin dimensiones (artículo que no las usa) nunca se fusionan por este criterio — se
    // dejan tal cual, igual que antes de esta función existir.
    if (itemCode && dims && Object.keys(dims).length > 0) {
      const existingIndex = merged.findIndex((m) => {
        const mCode = getItemCode(m)
        const mDims = getDimensiones(m)
        return mCode === itemCode && mDims && Object.keys(mDims).length > 0 && mismaCombinacion(mDims, dims)
      })
      if (existingIndex !== -1) {
        merged[existingIndex] = sumQty(merged[existingIndex], row)
        continue
      }
    }
    merged.push(row)
  }

  return merged
}
