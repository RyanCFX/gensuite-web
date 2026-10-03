import { useMemo } from 'react'
import { useOpcionesArray } from '@/shared/hooks/useOpciones'

/** Mapa `nombre de método de pago → moneda`, tomada de `currency` de `/opciones/metodos-pago`
 * (moneda de la cuenta contable asociada). `null` = sin moneda definida → moneda base.
 * Usado por Caja/POS (docs/tasks/70_caja_pos_sin_soporte_multimoneda.md) para solo ofrecer al
 * cajero los métodos que operan en la misma moneda que la factura que se está cobrando. */
export function useMetodoPagoCurrencies(metodos: { name: string }[], monedaBase: string): Record<string, string> {
  const { data } = useOpcionesArray('metodos-pago', { limit: 100, staleTime: 60_000 })

  return useMemo(() => {
    const porNombre = new Map((data ?? []).map((m) => [m.name, m.currencyCode]))
    const map: Record<string, string> = {}
    for (const m of metodos) map[m.name] = porNombre.get(m.name) ?? monedaBase
    return map
  }, [metodos, data, monedaBase])
}
