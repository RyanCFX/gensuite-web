import { useCallback } from 'react'
import { usePermissionsStore } from '@/stores/permissions.store'
import {
  puedeConsultar as puedeConsultarFn,
  puedeFiltrar as puedeFiltrarFn,
  sanearFiltros as sanearFiltrosFn,
  type Acceso,
  type AccesoModo,
} from './acceso'

/** Acceso v2 efectivo del usuario (modo off si el backend aún no lo expone). */
export function useAcceso(): Acceso {
  return usePermissionsStore((s) => s.acceso)
}

export function useAccesoModo(): AccesoModo {
  return usePermissionsStore((s) => s.acceso.modo)
}

/** `true` solo en modo `activo`. */
export function useAccesoV2Activo(): boolean {
  return usePermissionsStore((s) => s.acceso.modo === 'activo')
}

/** ¿Puede pedir /opciones/:recurso? (en off/sombra siempre sí: decide el backend). */
export function usePuedeConsultar(recurso: string): boolean {
  const acceso = usePermissionsStore((s) => s.acceso)
  return puedeConsultarFn(acceso, recurso)
}

export interface FiltrosPantalla {
  modo: AccesoModo
  /** Params bloqueados de esta pantalla (vacío fuera de modo activo). */
  bloqueados: string[]
  puedeFiltrar: (param: string) => boolean
  /** Quita los bloqueados antes de llamar al API; avisa cuáles quitó. */
  sanear: <T extends object>(params: T) => { limpios: T; quitados: string[] }
}

/**
 * Hook por pantalla con filtros (docs §3.3): esconder controles bloqueados y sanear
 * params (URL, defaults, exportar) antes de llamar al API.
 * `pantalla` = clave v2 (`ventas.factura`), no la ruta.
 */
export function useFiltrosPantalla(pantalla: string): FiltrosPantalla {
  const acceso = usePermissionsStore((s) => s.acceso)
  const puedeFiltrar = useCallback((param: string) => puedeFiltrarFn(acceso, pantalla, param), [acceso, pantalla])
  const sanear = useCallback(
    <T extends object>(params: T) => sanearFiltrosFn(acceso, pantalla, params),
    [acceso, pantalla],
  )
  return {
    modo: acceso.modo,
    bloqueados: acceso.modo === 'activo' ? (acceso.filtrosBloqueados[pantalla] ?? []) : [],
    puedeFiltrar,
    sanear,
  }
}
