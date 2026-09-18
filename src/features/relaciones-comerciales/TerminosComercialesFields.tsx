import type { TerminosComercialesDto } from '@/shared/api/types'

// Formulario compartido de "Términos comerciales" — mismo shape (`TerminosComercialesDto`, Fase
// 01 §2.3) que usan tres pantallas distintas: el paso 2 del wizard de "Nueva relación comercial",
// el modal de "Aceptar invitación" (Invitaciones → Recibidas) y la sección "Términos vigentes" del
// detalle de una relación ya activa. Todos los campos son opcionales — texto libre, sin resolver
// contra catálogos reales (fuera de alcance de esta iteración).

interface TerminosComercialesFieldsProps {
  value: TerminosComercialesDto
  onChange: (next: TerminosComercialesDto) => void
  disabled?: boolean
}

function numberOrUndefined(raw: string): number | undefined {
  if (raw.trim() === '') return undefined
  const n = Number(raw)
  return Number.isNaN(n) ? undefined : n
}

export function TerminosComercialesFields({ value, onChange, disabled = false }: TerminosComercialesFieldsProps) {
  function set<K extends keyof TerminosComercialesDto>(key: K, next: TerminosComercialesDto[K]) {
    onChange({ ...value, [key]: next })
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <label className="ff-check-wrap">
        <input
          type="checkbox"
          className="ff-check"
          checked={!!value.tieneCredito}
          disabled={disabled}
          onChange={(e) => set('tieneCredito', e.target.checked)}
        />
        Tiene crédito
      </label>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <div className="ff-wrap">
          <label className="ff-label" htmlFor="tc-diasCredito">Días de crédito (cliente)</label>
          <input
            id="tc-diasCredito"
            type="number"
            min={0}
            className="ff-input"
            disabled={disabled}
            value={value.diasCredito ?? ''}
            onChange={(e) => set('diasCredito', numberOrUndefined(e.target.value))}
          />
        </div>
        <div className="ff-wrap">
          <label className="ff-label" htmlFor="tc-limiteCredito">
            Límite de crédito <span style={{ fontWeight: 400, color: 'var(--text-tertiary)' }}>(sin efecto todavía)</span>
          </label>
          <input
            id="tc-limiteCredito"
            type="number"
            min={0}
            className="ff-input"
            disabled={disabled}
            value={value.limiteCredito ?? ''}
            onChange={(e) => set('limiteCredito', numberOrUndefined(e.target.value))}
          />
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <div className="ff-wrap">
          <label className="ff-label" htmlFor="tc-grupoCliente">Grupo de cliente</label>
          <input
            id="tc-grupoCliente"
            type="text"
            className="ff-input"
            disabled={disabled}
            value={value.grupoCliente ?? ''}
            onChange={(e) => set('grupoCliente', e.target.value || undefined)}
          />
        </div>
        <div className="ff-wrap">
          <label className="ff-label" htmlFor="tc-cuentaCxcAlterna">Cuenta CxC alterna</label>
          <input
            id="tc-cuentaCxcAlterna"
            type="text"
            className="ff-input"
            disabled={disabled}
            value={value.cuentaCxcAlterna ?? ''}
            onChange={(e) => set('cuentaCxcAlterna', e.target.value || undefined)}
          />
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <div className="ff-wrap">
          <label className="ff-label" htmlFor="tc-encargadoCxc">Encargado de CxC (email)</label>
          <input
            id="tc-encargadoCxc"
            type="email"
            className="ff-input"
            disabled={disabled}
            value={value.encargadoCxc ?? ''}
            onChange={(e) => set('encargadoCxc', e.target.value || undefined)}
          />
        </div>
        <div className="ff-wrap">
          <label className="ff-label" htmlFor="tc-formaPagoDefault">Forma de pago por defecto</label>
          <input
            id="tc-formaPagoDefault"
            type="text"
            className="ff-input"
            disabled={disabled}
            value={value.formaPagoDefault ?? ''}
            onChange={(e) => set('formaPagoDefault', e.target.value || undefined)}
          />
        </div>
      </div>

      <hr style={{ border: 'none', borderTop: '1px solid var(--border-default)', margin: '4px 0' }} />
      <p className="ff-hint" style={{ margin: 0 }}>Lado proveedor (cuando la contraparte también le vende a usted)</p>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <div className="ff-wrap">
          <label className="ff-label" htmlFor="tc-grupoProveedor">Grupo de proveedor</label>
          <input
            id="tc-grupoProveedor"
            type="text"
            className="ff-input"
            disabled={disabled}
            value={value.grupoProveedor ?? ''}
            onChange={(e) => set('grupoProveedor', e.target.value || undefined)}
          />
        </div>
        <div className="ff-wrap">
          <label className="ff-label" htmlFor="tc-diasCreditoProveedor">Días de crédito (proveedor)</label>
          <input
            id="tc-diasCreditoProveedor"
            type="number"
            min={0}
            className="ff-input"
            disabled={disabled}
            value={value.diasCreditoProveedor ?? ''}
            onChange={(e) => set('diasCreditoProveedor', numberOrUndefined(e.target.value))}
          />
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <div className="ff-wrap">
          <label className="ff-label" htmlFor="tc-cuentaCxpAlterna">Cuenta CxP alterna</label>
          <input
            id="tc-cuentaCxpAlterna"
            type="text"
            className="ff-input"
            disabled={disabled}
            value={value.cuentaCxpAlterna ?? ''}
            onChange={(e) => set('cuentaCxpAlterna', e.target.value || undefined)}
          />
        </div>
        <div className="ff-wrap">
          <label className="ff-label" htmlFor="tc-tipoBienes606">Tipo de bienes (606)</label>
          <input
            id="tc-tipoBienes606"
            type="text"
            className="ff-input"
            disabled={disabled}
            value={value.tipoBienes606 ?? ''}
            onChange={(e) => set('tipoBienes606', e.target.value || undefined)}
          />
        </div>
      </div>

      <div className="ff-wrap">
        <label className="ff-label" htmlFor="tc-formaPago606">Forma de pago (606)</label>
        <input
          id="tc-formaPago606"
          type="text"
          className="ff-input"
          disabled={disabled}
          value={value.formaPago606 ?? ''}
          onChange={(e) => set('formaPago606', e.target.value || undefined)}
        />
      </div>
    </div>
  )
}
