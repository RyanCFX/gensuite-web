import { useFeaturesStore } from '@/stores/features.store'
import { reporteVisible } from './catalog'
import { esFeatureAdicional as esAdicionalFn } from './adicionales'
import type { FeatureKey } from './types'
import type { FeatureAdicional } from '@/shared/api/types'

/**
 * Hooks de features por tenant (§2). Misma forma de pensar que `usePuede` (permisos) y que
 * `tenant.vertical` — un dato del tenant resuelto una vez al iniciar sesión.
 *
 * Fail-open mientras el store no está `ready` (igual que el menú antes del primer fetch):
 * ProtectedRoute bloquea la app hasta tener features, así que esto solo afecta al primer
 * render — evita un flash donde todo el menú desaparece un instante.
 */

function listo(): boolean {
  return useFeaturesStore.getState().status === 'ready'
}

export function useFeaturesReady(): boolean {
  return useFeaturesStore((s) => s.status === 'ready')
}

/** `true` si el feature está contratado por el tenant (`features.<key> === true`). */
export function useFeature(key: FeatureKey): boolean {
  const features = useFeaturesStore((s) => s.features)
  const status = useFeaturesStore((s) => s.status)
  if (status !== 'ready') return true
  return features?.[key] === true
}

/** `true` si el reporte está en `reportesHabilitados` (fail-open si no tiene clave en §4.2). */
export function useReporteHabilitado(tipo: string): boolean {
  const reportes = useFeaturesStore((s) => s.reportesHabilitados)
  const status = useFeaturesStore((s) => s.status)
  if (status !== 'ready') return true
  // `catalog.ts` es puro (sin stores): import estático seguro, sin ciclos.
  return reporteVisible(tipo, reportes)
}

/** Límites del plan (§8) — `null` mientras no están cargados. */
export function useLimites() {
  return useFeaturesStore((s) => s.limites)
}

/**
 * Accesos adicionales del usuario (docs/tasks/PROMPT_FEATURES_ADICIONALES_FRONTEND.md §10.3).
 * Lee `featuresAdicionales` del store de `/me/features` SIN lógica de acceso: es solo para la
 * UI (etiqueta "Adicional" + aviso de vencimiento). Nunca gatear nada con esto.
 */
export function useFeaturesAdicionales(): FeatureAdicional[] {
  return useFeaturesStore((s) => s.featuresAdicionales)
}

/** ¿La `key` de feature es un acceso adicional del usuario? Solo decoración (§9). */
export function useEsFeatureAdicional(key: FeatureKey | string | null | undefined): boolean {
  const adicionales = useFeaturesStore((s) => s.featuresAdicionales)
  const status = useFeaturesStore((s) => s.status)
  if (status !== 'ready' || !key) return false
  return esAdicionalFn(key, adicionales)
}

/** Helper para tests y guards: ¿el store ya resolvió features al menos una vez? */
export function hayFeaturesResueltos(): boolean {
  return listo()
}
