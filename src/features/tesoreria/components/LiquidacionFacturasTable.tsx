import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle } from 'lucide-react'
import { formatDOP, formatDate } from '@/lib/formatters'
import type { TesoreriaLiquidacion, TesoreriaPendienteFactura } from '@/shared/api/types'

interface LiquidacionFacturasTableProps {
  pendientes: TesoreriaPendienteFactura[]
  isLoading?: boolean
  /** Monto total de la transacción — se reparte automáticamente entre las facturas marcadas. */
  monto: number
  onChange: (liquidaciones: TesoreriaLiquidacion[]) => void
  /**
   * true (Emisiones/Depósitos con party): lo no asignado queda como saldo a favor — se muestra
   * como información neutra, no como advertencia. false: no aplica acá (siempre hay party cuando
   * se usa este componente), se deja por si algún caso futuro lo necesita.
   */
  permiteExceder?: boolean
  emptyMessage?: string
  disabledMessage?: string
}

/**
 * Tabla de "seleccionar facturas a liquidar" — extraída del patrón ya usado en
 * RegistrarPagoPage.tsx (módulo de Pagos) para reutilizarla en Emisiones y Depósitos de
 * Tesorería. Asigna automáticamente el monto a las facturas marcadas (la más antigua primero,
 * con tope por su pendiente) y permite al usuario sobrescribir el monto de cada línea a mano.
 */
export function LiquidacionFacturasTable({
  pendientes,
  isLoading,
  monto,
  onChange,
  permiteExceder = true,
  emptyMessage = 'Sin facturas pendientes',
  disabledMessage,
}: LiquidacionFacturasTableProps) {
  const [checkedIds, setCheckedIds] = useState<Set<string>>(new Set())
  const [manualOverrides, setManualOverrides] = useState<Record<string, number>>({})

  // Si cambia la lista de pendientes (ej. cambió el party), descartar selección anterior.
  useEffect(() => {
    setCheckedIds(new Set())
    setManualOverrides({})
  }, [pendientes])

  function toggle(facturaId: string) {
    setCheckedIds((prev) => {
      const next = new Set(prev)
      if (next.has(facturaId)) next.delete(facturaId)
      else next.add(facturaId)
      return next
    })
    setManualOverrides((prev) => {
      const next = { ...prev }
      delete next[facturaId]
      return next
    })
  }

  function setManual(facturaId: string, value: number) {
    setManualOverrides((prev) => ({ ...prev, [facturaId]: value }))
  }

  // Asignación automática: la más antigua primero, con tope por pendiente, hasta agotar el monto.
  // Las filas editadas a mano conservan su valor y el resto se reparte entre las demás.
  const computedAllocation = useMemo(() => {
    const result: Record<string, number> = {}
    const checked = pendientes
      .filter((p) => checkedIds.has(p.facturaId))
      .slice()
      .sort((a, b) => (a.dueDate < b.dueDate ? -1 : a.dueDate > b.dueDate ? 1 : a.facturaId < b.facturaId ? -1 : 1))
    let remaining = Math.max(0, monto || 0)
    for (const p of checked) {
      if (p.facturaId in manualOverrides) {
        const v = manualOverrides[p.facturaId]
        result[p.facturaId] = v
        remaining = Math.round((remaining - v) * 100) / 100
      }
    }
    for (const p of checked) {
      if (p.facturaId in manualOverrides) continue
      const alloc = Math.round(Math.min(remaining, p.outstandingAmount) * 100) / 100
      result[p.facturaId] = alloc
      remaining = Math.round((remaining - alloc) * 100) / 100
    }
    return result
  }, [pendientes, checkedIds, manualOverrides, monto])

  const checkedRows = pendientes.filter((p) => checkedIds.has(p.facturaId))
  const totalAsignado = checkedRows.reduce((s, p) => s + (computedAllocation[p.facturaId] ?? 0), 0)
  const diff = Math.round((monto - totalAsignado) * 100) / 100

  // Notificar al padre cada vez que cambia la asignación calculada.
  useEffect(() => {
    onChange(
      checkedRows.map((p) => ({ facturaId: p.facturaId, montoAsignado: computedAllocation[p.facturaId] ?? 0 })),
    )
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checkedIds, manualOverrides, monto, pendientes])

  if (disabledMessage) {
    return <p style={{ fontSize: 13, color: 'var(--text-tertiary)', textAlign: 'center', padding: '16px 0' }}>{disabledMessage}</p>
  }

  if (isLoading) {
    return (
      <div style={{ textAlign: 'center', padding: '16px 0' }}>
        <span className="spinner spinner-brand spinner-sm" />
      </div>
    )
  }

  if (pendientes.length === 0) {
    return <p style={{ fontSize: 13, color: 'var(--text-tertiary)', textAlign: 'center', padding: '16px 0' }}>{emptyMessage}</p>
  }

  return (
    <>
      <div style={{ overflowX: 'auto' }}>
        <table className="items-table">
          <thead>
            <tr>
              <th style={{ width: 36 }} />
              <th>Factura</th>
              <th style={{ textAlign: 'right' }}>Total</th>
              <th style={{ textAlign: 'right' }}>Pendiente</th>
              <th style={{ textAlign: 'right', width: 140 }}>Monto a aplicar</th>
            </tr>
          </thead>
          <tbody>
            {pendientes.map((p) => {
              const checked = checkedIds.has(p.facturaId)
              return (
                <tr key={p.facturaId} style={{ opacity: checked ? 1 : 0.6 }}>
                  <td style={{ textAlign: 'center' }}>
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggle(p.facturaId)}
                      style={{ cursor: 'pointer', accentColor: 'var(--color-brand)' }}
                    />
                  </td>
                  <td>
                    <span style={{ fontWeight: 500, fontFamily: 'var(--font-mono)', fontSize: 13 }}>{p.facturaId}</span>
                    <br />
                    <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>Vence {formatDate(p.dueDate)}</span>
                  </td>
                  <td style={{ textAlign: 'right', fontSize: 13 }}>{formatDOP(p.grandTotal)}</td>
                  <td style={{ textAlign: 'right', fontSize: 13, fontWeight: 500, color: 'var(--error-text)' }}>
                    {formatDOP(p.outstandingAmount)}
                  </td>
                  <td>
                    <input
                      className="items-input"
                      type="number"
                      min="0.01"
                      step="0.01"
                      style={{ textAlign: 'right' }}
                      value={(computedAllocation[p.facturaId] ?? 0) || ''}
                      disabled={!checked}
                      onChange={(e) => setManual(p.facturaId, parseFloat(e.target.value) || 0)}
                    />
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {checkedRows.length > 0 && (
        <div style={{ padding: '12px 4px 0', display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'flex-end' }}>
          <div style={{ display: 'flex', gap: 32, fontSize: 13 }}>
            <span style={{ color: 'var(--text-secondary)' }}>Total asignado</span>
            <strong>{formatDOP(totalAsignado)}</strong>
          </div>
          <div style={{ display: 'flex', gap: 32, fontSize: 13 }}>
            <span style={{ color: 'var(--text-secondary)' }}>Monto de la transacción</span>
            <strong>{formatDOP(monto)}</strong>
          </div>
          {diff !== 0 && (
            permiteExceder && diff > 0 ? (
              <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>
                Quedará como saldo a favor: <strong>{formatDOP(diff)}</strong>
              </div>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--error-text)', marginTop: 2 }}>
                <AlertTriangle size={13} />
                {diff > 0 ? `Quedan ${formatDOP(diff)} sin asignar` : `Asignación excede el monto en ${formatDOP(Math.abs(diff))}`}
              </div>
            )
          )}
        </div>
      )}
    </>
  )
}
