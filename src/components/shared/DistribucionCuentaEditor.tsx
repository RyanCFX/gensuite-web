import { Plus, Trash2 } from 'lucide-react'
import { AccountSelect } from '@/components/shared/AccountSelect'
import { formatDOP } from '@/lib/formatters'
import type { DistribucionCuentaDto } from '@/shared/api/types'

interface DistribucionCuentaEditorProps {
  rows: DistribucionCuentaDto[]
  onChange: (rows: DistribucionCuentaDto[]) => void
  /** Monto que la suma de `rows` debe igualar exactamente (±RD$0.01) — el backend rechaza si no cuadra. */
  targetAmount: number
  /** Etiqueta del monto objetivo, ej. "de la línea" o "del impuesto". */
  targetLabel?: string
}

/** Mini-editor de N filas {cuenta, monto} con un total en vivo comparado contra `targetAmount`.
 *  Usado tanto para dividir la cuenta de una línea (distribucionCuenta) como para redistribuir
 *  un impuesto ya calculado (impuestoDistribucion) — ambos comparten la misma validación de suma
 *  exacta contra un monto ya conocido. */
export function DistribucionCuentaEditor({ rows, onChange, targetAmount, targetLabel = 'objetivo' }: DistribucionCuentaEditorProps) {
  const total = rows.reduce((s, r) => s + (r.monto || 0), 0)
  const matches = Math.abs(total - targetAmount) < 0.01

  function updateRow(idx: number, patch: Partial<DistribucionCuentaDto>) {
    onChange(rows.map((r, i) => (i === idx ? { ...r, ...patch } : r)))
  }
  function addRow() {
    onChange([...rows, { cuenta: '', monto: 0 }])
  }
  function removeRow(idx: number) {
    onChange(rows.filter((_, i) => i !== idx))
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: 8, border: '1px solid var(--border-default)', borderRadius: 6, background: 'var(--surface-sunken)' }}>
      {rows.map((row, idx) => (
        <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <AccountSelect value={row.cuenta} onChange={(v) => updateRow(idx, { cuenta: v })} placeholder="Cuenta…" />
          </div>
          <input
            type="number"
            className="items-input"
            style={{ width: 110, textAlign: 'right', flexShrink: 0 }}
            min="0"
            step="0.01"
            value={row.monto || ''}
            onChange={(e) => updateRow(idx, { monto: parseFloat(e.target.value) || 0 })}
          />
          <button
            type="button"
            className="btn btn-ghost btn-size-icon-xs"
            style={{ flexShrink: 0 }}
            onClick={() => removeRow(idx)}
            disabled={rows.length === 1}
          >
            <Trash2 size={12} />
          </button>
        </div>
      ))}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
        <button type="button" className="btn btn-secondary btn-size-xs" onClick={addRow}>
          <Plus size={12} />Agregar cuenta
        </button>
        <span style={{ fontSize: 11, fontWeight: 600, color: matches ? 'var(--success)' : 'var(--danger)', whiteSpace: 'nowrap' }}>
          {formatDOP(total)} / {formatDOP(targetAmount)} {targetLabel} {matches ? '✓' : ''}
        </span>
      </div>
    </div>
  )
}
