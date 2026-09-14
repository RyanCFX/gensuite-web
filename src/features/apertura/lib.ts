// Helpers compartidos del módulo de Facturas de Apertura (Migración de Saldos).
// docs/tasks/PROMPT_APERTURA_FRONTEND.md

import { useQuery } from '@tanstack/react-query'
import { getAperturaPreflight } from '@/shared/api/apertura'

/** Letra (B/E) + 2 dígitos de tipo + 8-10 dígitos de secuencial (§4.2). */
export const NCF_ORIGINAL_REGEX = /^[BE]\d{10,12}$/

/** Los 11 tipos de comprobante DGII que el backend reconoce (§4.2). */
export const TIPOS_NCF_DGII = ['B01', 'B02', 'B03', 'B04', 'B11', 'B12', 'B13', 'B14', 'B15', 'B16', 'B17'] as const

export function anioActual(): number {
  return new Date().getFullYear()
}

/** Rango por defecto sugerido en la UI: 3 años atrás — hoy (mismo default que asume el backend). */
export function anioDesdeDefault(): number {
  return anioActual() - 3
}

export function today(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** Convierte un rango de años (selects "¿desde qué año?" / "¿hasta qué año?") en las fechas
 *  explícitas que exige mandar siempre el backend (§3.1) — nunca confiar en sus defaults. */
export function rangoAnioToFechas(desdeAnio: number, hastaAnio: number): { desde: string; hasta: string } {
  return { desde: `${desdeAnio}-01-01`, hasta: `${hastaAnio}-12-31` }
}

/** Opciones de año para los selects de rango, de más reciente a más antiguo. */
export function opcionesAnio(spanAtras = 8, spanAdelante = 1): number[] {
  const actual = anioActual()
  const years: number[] = []
  for (let y = actual + spanAdelante; y >= actual - spanAtras; y--) years.push(y)
  return years
}

/** Diagnóstico rápido (rango default de 3 años) usado por los formularios de carga para no dejar
 *  que el usuario llene un formulario que el servidor va a rechazar (§3.1) — no reemplaza a la
 *  pantalla de Diagnóstico, que deja elegir el rango real a migrar. */
export function usePreflightGate() {
  const rango = rangoAnioToFechas(anioDesdeDefault(), anioActual())
  const { data, isLoading } = useQuery({
    queryKey: ['apertura-preflight', rango.desde, rango.hasta],
    queryFn: () => getAperturaPreflight(rango),
    staleTime: 30_000,
  })
  return { listo: data?.listo ?? true, isLoading, preflight: data }
}
