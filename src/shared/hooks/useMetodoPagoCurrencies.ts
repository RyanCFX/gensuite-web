import { useMemo } from 'react'
import { useQueries, useQuery } from '@tanstack/react-query'
import { listCuentasBancarias } from '@/shared/api/cuentas-bancarias'
import { getCuenta } from '@/shared/api/cuentas'
import { resolveMetodoPagoCurrency } from '@/lib/paymentLines'
import type { MetodoPago } from '@/shared/api/types'

/** Mapa `nombre de método de pago → moneda real`, resuelta de la Cuenta Bancaria o cuenta
 * contable vinculada a cada uno (nunca del nombre del método) — ver `resolveMetodoPagoCurrency`.
 * Usado por Caja/POS (docs/tasks/70_caja_pos_sin_soporte_multimoneda.md) para solo ofrecer al
 * cajero los métodos que operan en la misma moneda que la factura que se está cobrando. */
export function useMetodoPagoCurrencies(metodos: MetodoPago[], monedaBase: string): Record<string, string> {
  const { data: cuentasBancarias } = useQuery({
    queryKey: ['cuentas-bancarias-activas'],
    queryFn: () => listCuentasBancarias({ estado: 'Activa', limit: 100 }),
    staleTime: 60_000,
  })

  const accountIds = useMemo(
    () => Array.from(new Set(metodos.filter((m) => !m.defaultBankAccount && m.account).map((m) => m.account!))),
    [metodos],
  )
  const cuentaQueries = useQueries({
    queries: accountIds.map((id) => ({
      queryKey: ['cuenta-currency', id],
      queryFn: () => getCuenta(id),
      staleTime: 5 * 60_000,
    })),
  })

  const cuentasResueltas = cuentaQueries.map((q) => q.data?.currency).join(',')

  return useMemo(() => {
    const cuentasBancariasPorId = Object.fromEntries(
      (cuentasBancarias?.items ?? []).map((c) => [c.id, c.currency]),
    )
    const cuentasPorId = Object.fromEntries(
      accountIds.map((id, i) => [id, cuentaQueries[i]?.data?.currency]).filter(([, currency]) => currency),
    ) as Record<string, string>

    const map: Record<string, string> = {}
    for (const m of metodos) {
      map[m.name] = resolveMetodoPagoCurrency(m, cuentasBancariasPorId, cuentasPorId, monedaBase)
    }
    return map
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [metodos, cuentasBancarias, accountIds, cuentasResueltas, monedaBase])
}
