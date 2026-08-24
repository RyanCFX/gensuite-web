import { Landmark } from 'lucide-react'
import { AccountSelect } from '@/components/shared/AccountSelect'

export interface CuentaOverrideRow {
  key: string
  label: string
  value: string
  onChange: (v: string) => void
  /** Cuenta que se usaría si no se reasigna nada — se muestra como referencia, nunca editable acá. */
  cuentaHeredada?: string
  rootType?: 'Asset' | 'Liability' | 'Equity' | 'Income' | 'Expense'
  disabled?: boolean
  disabledReason?: string
}

interface Props {
  rows: CuentaOverrideRow[]
  /** Abre la sección expandida de entrada — úsese al editar un borrador que ya trae overrides. */
  defaultOpen?: boolean
}

export function CuentaOverrideRows({ rows }: { rows: CuentaOverrideRow[] }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {rows.map((row) => (
        <div className="ff-wrap" key={row.key}>
          <label className="ff-label">{row.label}</label>
          <AccountSelect
            value={row.value}
            onChange={row.onChange}
            rootType={row.rootType}
            disabled={row.disabled}
            placeholder={row.cuentaHeredada ? `Usar "${row.cuentaHeredada}" (heredada)` : 'Usar la cuenta por defecto'}
          />
          {row.disabled && row.disabledReason && (
            <p className="ff-hint" title={row.disabledReason}>{row.disabledReason}</p>
          )}
          {!row.disabled && row.cuentaHeredada && (
            <p className="ff-hint">Cuenta heredada actual: {row.cuentaHeredada}</p>
          )}
        </div>
      ))}
    </div>
  )
}

/**
 * Sección colapsada por defecto para reasignar la(s) cuenta(s) contable(s) de un asiento de
 * Tesorería — Emisiones/Depósitos (banco + beneficiario/origen) o Transferencias Internas
 * (pata origen + pata destino). Es una excepción, no un campo de todos los días: el 95% de las
 * transacciones no la toca, por eso vive fuera del flujo principal del formulario.
 */
export function CuentaContableOverrideSection({ rows, defaultOpen = false }: Props) {
  const reasignadas = rows.filter((r) => r.value).length

  return (
    <div className="card" style={{ marginBottom: 16 }}>
      {/* `open` se pasa una sola vez al montar (defaultOpen no cambia después) — un toggle manual
          del usuario en el DOM no es revertido por React porque el valor del prop nunca varía. */}
      <details open={defaultOpen}>
        <summary style={{ cursor: 'pointer', padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 8 }}>
          <Landmark size={15} style={{ color: 'var(--text-tertiary)', flexShrink: 0 }} />
          <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>Cuentas contables (avanzado)</span>
          {reasignadas > 0 && (
            <span className="badge badge-neutral" style={{ fontSize: 11 }}>
              {reasignadas} {reasignadas === 1 ? 'cuenta reasignada' : 'cuentas reasignadas'}
            </span>
          )}
        </summary>
        <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 16, paddingTop: 4 }}>
          <p className="ff-hint" style={{ margin: 0 }}>
            Excepción, no lo habitual — solo para desviar puntualmente este movimiento de la cuenta
            que le tocaría por defecto. Déjalo vacío para heredar el comportamiento normal.
          </p>
          <CuentaOverrideRows rows={rows} />
        </div>
      </details>
    </div>
  )
}
