import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import type { TerminosComercialesDto } from '@/shared/api/types'
import { getCatalogosFiscales } from '@/shared/api/config'
import { SearchSelect } from '@/shared/ui/SearchSelect'
import type { SearchSelectOption } from '@/shared/ui/SearchSelect'
import { AccountSelect } from '@/components/shared/AccountSelect'
import { Select, SelectItem } from '@/components/ui/select'
import { OpcionesSelect } from '@/shared/ui/OpcionesSelect'

// Formulario compartido de "Términos comerciales" — mismo shape (`TerminosComercialesDto`, Fase
// 01 §2.3) que usan tres pantallas distintas: el paso 2 del wizard de "Nueva relación comercial",
// el modal de "Aceptar invitación" (Invitaciones → Recibidas) y la sección "Términos vigentes" del
// detalle de una relación ya activa. Los selects (grupo de cliente/proveedor, cuenta CxC/CxP
// alterna, encargado de CxC, forma de pago por defecto, clasificación fiscal 606) reutilizan los
// mismos catálogos que SupplierFormPanel/CustomerFormPanel — ver
// docs/plans/relaciones_comerciales/ESTADO_Y_PENDIENTES.md.

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



  const { data: catalogos } = useQuery({
    queryKey: ['catalogos-fiscales', { type: 'compra' }],
    queryFn: () => getCatalogosFiscales({ type: 'compra' }),
  })
  const [tipoBienes606Search, setTipoBienes606Search] = useState('')
  const tipoBienes606Options: SearchSelectOption[] = (catalogos?.tipoBienes606 ?? [])
    .filter((t) => !tipoBienes606Search || t.label.toLowerCase().includes(tipoBienes606Search.toLowerCase()))
    .map((t) => ({ value: t.value, label: t.label }))

  const [formaPago606Search, setFormaPago606Search] = useState('')
  const formaPago606Options: SearchSelectOption[] = (catalogos?.formaPago606 ?? [])
    .filter((t) => !formaPago606Search || t.label.toLowerCase().includes(formaPago606Search.toLowerCase()))
    .map((t) => ({ value: t.value, label: t.label }))


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

      <div className="form-row">
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

      <div className="form-row">
        <div className="ff-wrap">
          <label className="ff-label" htmlFor="tc-grupoCliente">Grupo de cliente</label>
          <OpcionesSelect recurso="grupos-clientes" id="tc-grupoCliente" value={value.grupoCliente ?? ''} onChange={(id) => set('grupoCliente', id || undefined)} placeholder="Buscar grupo…" disabled={disabled} />
        </div>
        <div className="ff-wrap">
          <label className="ff-label" htmlFor="tc-cuentaCxcAlterna">Cuenta CxC alterna</label>
          <AccountSelect
            id="tc-cuentaCxcAlterna"
            value={value.cuentaCxcAlterna ?? ''}
            onChange={(id) => set('cuentaCxcAlterna', id || undefined)}
            rootType="Asset"
            disabled={disabled}
            placeholder="Buscar cuenta…"
          />
        </div>
      </div>

      <div className="form-row">
        <div className="ff-wrap">
          <label className="ff-label" htmlFor="tc-encargadoCxc">Encargado de CxC</label>
          <OpcionesSelect recurso="usuarios" id="tc-encargadoCxc" value={value.encargadoCxc ?? ''} onChange={(id) => set('encargadoCxc', id || undefined)} placeholder="Buscar usuario…" disabled={disabled} />
        </div>
        <div className="ff-wrap">
          <label className="ff-label" htmlFor="tc-formaPagoDefault">Forma de pago por defecto</label>
          <Select
            value={value.formaPagoDefault ?? ''}
            onValueChange={(v) => set('formaPagoDefault', v || undefined)}
            placeholder="Sin configurar"
            disabled={disabled}
          >
            <SelectItem value="Contado">Contado</SelectItem>
            <SelectItem value="Crédito">Crédito</SelectItem>
          </Select>
        </div>
      </div>

      <hr style={{ border: 'none', borderTop: '1px solid var(--border-default)', margin: '4px 0' }} />
      <p className="ff-hint" style={{ margin: 0 }}>Lado proveedor (cuando la contraparte también le vende a usted)</p>

      <div className="form-row">
        <div className="ff-wrap">
          <label className="ff-label" htmlFor="tc-grupoProveedor">Grupo de proveedor</label>
          <OpcionesSelect recurso="grupos-proveedores" id="tc-grupoProveedor" value={value.grupoProveedor ?? ''} onChange={(id) => set('grupoProveedor', id || undefined)} placeholder="Buscar grupo…" disabled={disabled} />
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

      <div className="form-row">
        <div className="ff-wrap">
          <label className="ff-label" htmlFor="tc-cuentaCxpAlterna">Cuenta CxP alterna</label>
          <AccountSelect
            id="tc-cuentaCxpAlterna"
            value={value.cuentaCxpAlterna ?? ''}
            onChange={(id) => set('cuentaCxpAlterna', id || undefined)}
            rootType="Liability"
            disabled={disabled}
            placeholder="Buscar cuenta…"
          />
        </div>
        <div className="ff-wrap">
          <label className="ff-label" htmlFor="tc-tipoBienes606">Tipo de bienes (606)</label>
          <SearchSelect
            id="tc-tipoBienes606"
            value={value.tipoBienes606 ?? ''}
            onChange={(id) => set('tipoBienes606', id || undefined)}
            options={tipoBienes606Options}
            onSearch={setTipoBienes606Search}
            selectedLabel={catalogos?.tipoBienes606?.find((t) => t.value === value.tipoBienes606)?.label ?? ''}
            disabled={disabled}
            placeholder="Sin configurar"
          />
        </div>
      </div>

      <div className="ff-wrap">
        <label className="ff-label" htmlFor="tc-formaPago606">Forma de pago (606)</label>
        <SearchSelect
          id="tc-formaPago606"
          value={value.formaPago606 ?? ''}
          onChange={(id) => set('formaPago606', id || undefined)}
          options={formaPago606Options}
          onSearch={setFormaPago606Search}
          selectedLabel={catalogos?.formaPago606?.find((t) => t.value === value.formaPago606)?.label ?? ''}
          disabled={disabled}
          placeholder="Sin configurar"
        />
      </div>
    </div>
  )
}
