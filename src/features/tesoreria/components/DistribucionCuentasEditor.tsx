import { Plus, Trash2, AlertTriangle } from 'lucide-react'
import { AccountSelect } from '@/components/shared/AccountSelect'
import { formatDOP } from '@/lib/formatters'
import type { TesoreriaLinea } from '@/shared/api/types'

interface DistribucionCuentasEditorProps {
  value: TesoreriaLinea[]
  onChange: (value: TesoreriaLinea[]) => void
  /** Monto total contra el que se valida la suma cuando `sumaExacta` está activo. */
  monto: number
  /** true = la suma debe igualar exactamente `monto` (distribucion). false = suma libre (deducciones). */
  sumaExacta?: boolean
  label: string
  helpText?: string
  addLabel?: string
  disabled?: boolean
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

/**
 * Tabla editable de líneas {cuenta, monto, descripcion} — usada para `distribucion` y
 * `deducciones` en Emisiones, Depósitos y Transferencias Internas. Cuando `sumaExacta` está
 * activo, muestra en tiempo real el diferencial contra `monto` (validación de "distribucion" en
 * los 3 submódulos); cuando no, es una lista libre de comisiones/retenciones sin validación de suma.
 */
export function DistribucionCuentasEditor({ value, onChange, monto, sumaExacta = false, label, helpText, addLabel = 'Agregar línea', disabled }: DistribucionCuentasEditorProps) {
  function addLinea() {
    onChange([...value, { cuenta: '', monto: 0, descripcion: '' }])
  }

  function updateLinea(index: number, patch: Partial<TesoreriaLinea>) {
    onChange(value.map((l, i) => (i === index ? { ...l, ...patch } : l)))
  }

  function removeLinea(index: number) {
    onChange(value.filter((_, i) => i !== index))
  }

  const total = round2(value.reduce((s, l) => s + (l.monto || 0), 0))
  const diff = round2(monto - total)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <label className="ff-label" style={{ margin: 0 }}>{label}</label>
        {!disabled && (
          <button type="button" className="btn btn-ghost btn-size-sm" onClick={addLinea}>
            <Plus size={13} /> {addLabel}
          </button>
        )}
      </div>
      {helpText && <p className="ff-hint" style={{ marginTop: -4 }}>{helpText}</p>}

      {value.length === 0 ? (
        <p style={{ fontSize: 12, color: 'var(--text-tertiary)', margin: 0 }}>Sin líneas agregadas.</p>
      ) : (
        <div className="table-scroll">
          <table className="items-table">
            <thead>
              <tr>
                <th>Cuenta</th>
                <th style={{ width: 140, textAlign: 'right' }}>Monto</th>
                <th>Descripción</th>
                <th style={{ width: 36 }} />
              </tr>
            </thead>
            <tbody>
              {value.map((linea, i) => (
                <tr key={i}>
                  <td>
                    <AccountSelect
                      value={linea.cuenta}
                      onChange={(cuenta) => updateLinea(i, { cuenta })}
                      placeholder="Buscar cuenta…"
                      disabled={disabled}
                    />
                  </td>
                  <td>
                    <input
                      className="items-input"
                      type="number"
                      min="0"
                      step="0.01"
                      style={{ textAlign: 'right' }}
                      value={linea.monto || ''}
                      disabled={disabled}
                      onChange={(e) => updateLinea(i, { monto: parseFloat(e.target.value) || 0 })}
                    />
                  </td>
                  <td>
                    <input
                      className="items-input"
                      type="text"
                      placeholder="Opcional"
                      value={linea.descripcion ?? ''}
                      disabled={disabled}
                      onChange={(e) => updateLinea(i, { descripcion: e.target.value })}
                    />
                  </td>
                  <td>
                    {!disabled && (
                      <button type="button" className="btn btn-ghost btn-size-icon-sm" onClick={() => removeLinea(i)}>
                        <Trash2 size={13} />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {value.length > 0 && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 16, fontSize: 12 }}>
          <span style={{ color: 'var(--text-secondary)' }}>Total: <strong>{formatDOP(total)}</strong></span>
          {sumaExacta && diff !== 0 && (
            <span style={{ display: 'flex', alignItems: 'center', gap: 4, color: 'var(--error-text)' }}>
              <AlertTriangle size={12} />
              {diff > 0 ? `Faltan ${formatDOP(diff)}` : `Excede por ${formatDOP(Math.abs(diff))}`}
            </span>
          )}
        </div>
      )}
    </div>
  )
}

/** Suma exacta contra `monto`, con tolerancia de redondeo — usar antes de enviar `distribucion`. */
export function sumaCoincide(lineas: TesoreriaLinea[], monto: number): boolean {
  const total = round2(lineas.reduce((s, l) => s + (l.monto || 0), 0))
  return round2(monto - total) === 0
}
