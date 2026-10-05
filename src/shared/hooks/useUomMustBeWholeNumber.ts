import { useOpcionesArray } from '@/shared/hooks/useOpciones'

/** Resuelve si una UOM exige cantidades enteras (sin decimales) contra el catálogo de UOM
 *  (GET /config/uom, campo `mustBeWholeNumber`). Usa la misma queryKey ['uom'] que ya usa el
 *  resto de la app, así que no dispara un fetch nuevo si el catálogo ya está en caché. */
export function useUomMustBeWholeNumber(uom?: string): boolean {
  const { data: uoms } = useOpcionesArray('uom', { limit: 100})
  if (!uom) return false
  return uoms?.find((u) => u.name === uom)?.mustBeWholeNumber ?? false
}
