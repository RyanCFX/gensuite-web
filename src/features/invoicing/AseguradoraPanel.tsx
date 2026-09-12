import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ChevronDown, ChevronRight, Loader2, RefreshCw, ShieldCheck } from 'lucide-react'
import { listAseguradoras, nombreAseguradora } from '@/shared/api/aseguradoras'
import { SearchSelect } from '@/shared/ui/SearchSelect'
import type { SearchSelectOption } from '@/shared/ui/SearchSelect'
import { DatePicker } from '@/shared/ui/DatePicker'
import { validateCedulaDetailed } from '@/lib/validators/dgii'
import { formatDOP } from '@/lib/formatters'
import type { AseguradoraFormState } from './aseguradoraForm'

/**
 * Panel "Aseguradora (ARS)" del formulario de factura — vertical farmacia
 * (docs/PROMPT_FARMACIA_V2_FRONTEND.md §3.1/§3.2). El estado vive en el padre: este componente
 * solo dibuja los campos y valida en cliente lo que el servidor también valida (§3.7).
 */

interface Props {
  enabled: boolean
  onEnabledChange: (enabled: boolean) => void
  value: AseguradoraFormState
  onChange: (next: AseguradoraFormState) => void
  /** Marca los campos obligatorios vacíos en rojo (tras intentar guardar). */
  submitted?: boolean
  /** Cliente (paciente) de la factura — para avisar si coincide con la ARS. */
  customerId?: string
  /** Solo lectura: la cobertura ya fue facturada a la ARS (`estadoArs === 'Facturado'`). */
  readOnly?: boolean
  /** Pie con los totales que calculó el servidor. Nunca se calculan acá (§11). */
  footer?: React.ReactNode
}

export function AseguradoraPanel({
  enabled,
  onEnabledChange,
  value,
  onChange,
  submitted = false,
  customerId,
  readOnly = false,
  footer,
}: Props) {
  const [open, setOpen] = useState(true)
  const [arsQuery, setArsQuery] = useState('')

  const { data: arsData, isLoading: arsLoading } = useQuery({
    queryKey: ['aseguradoras-picker', arsQuery],
    // Nunca `/customers`: el servidor rechaza un Customer que no sea aseguradora (§3.2).
    queryFn: () => listAseguradoras({ nombre: arsQuery || undefined, limit: 15 }),
    enabled,
  })
  const arsOptions: SearchSelectOption[] = useMemo(
    () => (arsData?.items ?? []).map((a) => ({ value: a.id, label: nombreAseguradora(a), sublabel: a.rnc })),
    [arsData],
  )

  function set<K extends keyof AseguradoraFormState>(key: K, v: AseguradoraFormState[K]) {
    onChange({ ...value, [key]: v })
  }

  const cedulaError =
    value.cedula.trim().length > 0 && !validateCedulaDetailed(value.cedula).valid
      ? validateCedulaDetailed(value.cedula).reason
      : undefined
  const valorNum = Number(value.valorCobertura)
  const valorError =
    submitted && (!value.valorCobertura.trim() || !Number.isFinite(valorNum) || valorNum <= 0)
      ? 'Debe ser mayor que 0'
      : value.tipoCobertura === 'porciento' && Number.isFinite(valorNum) && valorNum > 100
        ? 'El porcentaje no puede superar 100'
        : undefined
  const aseguradoraEsCliente = !!customerId && customerId === value.aseguradora

  return (
    <div className="card">
      <div className="card-header" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <button
          type="button"
          className="btn btn-ghost btn-size-icon-sm"
          onClick={() => setOpen((o) => !o)}
          aria-label={open ? 'Contraer panel' : 'Expandir panel'}
        >
          {open ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
        </button>
        <ShieldCheck size={15} style={{ color: 'var(--icon-muted)' }} />
        <h2 className="card-title" style={{ flex: 1 }}>Aseguradora (ARS)</h2>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: readOnly ? 'default' : 'pointer' }}>
          <input
            type="checkbox"
            checked={enabled}
            disabled={readOnly}
            onChange={(e) => { onEnabledChange(e.target.checked); if (e.target.checked) setOpen(true) }}
          />
          Esta venta tiene cobertura de seguro
        </label>
      </div>

      {enabled && open && (
        <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {readOnly && (
            <div className="inline-alert">
              Esta cobertura ya fue facturada a la ARS — el bloque es solo de lectura. La única
              salida es una devolución.
            </div>
          )}

          <div className="form-row form-row-3">
            <div className="ff-wrap">
              <label className="ff-label ff-required">Aseguradora</label>
              <SearchSelect
                value={value.aseguradora}
                selectedLabel={value.aseguradoraLabel}
                onChange={(val, opt) => onChange({ ...value, aseguradora: val, aseguradoraLabel: opt?.label ?? '' })}
                options={arsOptions}
                onSearch={setArsQuery}
                loading={arsLoading}
                placeholder="Buscar ARS…"
                error={submitted && !value.aseguradora}
                disabled={readOnly}
              />
              {aseguradoraEsCliente && (
                <p className="ff-hint" style={{ color: 'var(--color-error)' }}>
                  La aseguradora no puede ser el cliente de la factura — el cliente es el paciente.
                </p>
              )}
            </div>

            <div className="ff-wrap">
              <label className="ff-label ff-required">Nro. de autorización</label>
              <input
                className={`ff-input${submitted && !value.numeroAutorizacion.trim() ? ' ff-input-error' : ''}`}
                value={value.numeroAutorizacion}
                maxLength={140}
                disabled={readOnly}
                onChange={(e) => set('numeroAutorizacion', e.target.value)}
                placeholder="Tal cual lo da la plataforma de la ARS"
              />
            </div>

            <div className="ff-wrap">
              <label className="ff-label ff-required">Tipo de cobertura</label>
              <div style={{ display: 'flex', gap: 14, alignItems: 'center', minHeight: 34 }}>
                {(['porciento', 'monto'] as const).map((t) => (
                  <label key={t} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: readOnly ? 'default' : 'pointer' }}>
                    <input
                      type="radio"
                      name="tipoCoberturaArs"
                      checked={value.tipoCobertura === t}
                      disabled={readOnly}
                      onChange={() => set('tipoCobertura', t)}
                    />
                    {t === 'porciento' ? 'Porcentaje' : 'Monto fijo'}
                  </label>
                ))}
              </div>
            </div>

            <div className="ff-wrap">
              <label className="ff-label ff-required">
                {value.tipoCobertura === 'porciento' ? 'Cobertura (%)' : 'Cobertura (RD$)'}
              </label>
              <input
                className={`ff-input${valorError ? ' ff-input-error' : ''}`}
                type="number"
                min="0"
                max={value.tipoCobertura === 'porciento' ? 100 : undefined}
                step={value.tipoCobertura === 'porciento' ? '0.01' : '0.01'}
                value={value.valorCobertura}
                disabled={readOnly}
                onChange={(e) => set('valorCobertura', e.target.value)}
              />
              {valorError && <p className="ff-hint" style={{ color: 'var(--color-error)' }}>{valorError}</p>}
            </div>

            <div className="ff-wrap">
              <label className="ff-label">Carnet de afiliado</label>
              <input className="ff-input" value={value.carnetAfiliado} maxLength={140} disabled={readOnly}
                onChange={(e) => set('carnetAfiliado', e.target.value)} />
            </div>

            <div className="ff-wrap">
              <label className="ff-label">Cédula del paciente</label>
              <input
                className={`ff-input${cedulaError ? ' ff-input-error' : ''}`}
                value={value.cedula}
                inputMode="numeric"
                maxLength={13}
                disabled={readOnly}
                onChange={(e) => set('cedula', e.target.value)}
                placeholder="11 dígitos"
              />
              {cedulaError && <p className="ff-hint" style={{ color: 'var(--color-error)' }}>{cedulaError}</p>}
            </div>

            <div className="ff-wrap">
              <label className="ff-label">Nro. de seguro social</label>
              <input className="ff-input" value={value.numeroSeguroSocial} maxLength={40} disabled={readOnly}
                onChange={(e) => set('numeroSeguroSocial', e.target.value)} />
            </div>

            <div className="ff-wrap">
              <label className="ff-label">Teléfono del paciente</label>
              <input className="ff-input" value={value.telefonoPaciente} maxLength={40} disabled={readOnly}
                onChange={(e) => set('telefonoPaciente', e.target.value)} />
            </div>

            <div className="ff-wrap">
              <label className="ff-label">Nombre del doctor</label>
              <input className="ff-input" value={value.nombreDoctor} maxLength={140} disabled={readOnly}
                onChange={(e) => set('nombreDoctor', e.target.value)} />
            </div>

            <div className="ff-wrap">
              <label className="ff-label">Fecha de aprobación</label>
              <DatePicker className="ff-input" value={value.fechaAprobacion} onChange={(v) => set('fechaAprobacion', v)} clearable disabled={readOnly} />
            </div>

            <div className="ff-wrap">
              <label className="ff-label">Fecha de indicación de la receta</label>
              <DatePicker className="ff-input" value={value.fechaIndicacionReceta} onChange={(v) => set('fechaIndicacionReceta', v)} clearable disabled={readOnly} />
            </div>

            <div className="ff-wrap">
              <label className="ff-label">Aprobado por</label>
              <input className="ff-input" value={value.aprobadoPor} maxLength={140} disabled={readOnly}
                onChange={(e) => set('aprobadoPor', e.target.value)} placeholder="Quien aprobó en la ARS" />
            </div>
          </div>

          {footer}
        </div>
      )}
    </div>
  )
}

/**
 * Pie del panel con los totales de la cobertura — **todos calculados por el servidor** (§3.5/§11):
 * este componente solo los formatea. `diferencia ≠ 0` bloquea el someter, así que se marca en rojo
 * y se ofrece Recalcular al lado cuando el padre pasa `onRecalcular`.
 */
export function CoberturaArsResumen({
  ars,
  onRecalcular,
  recalculando = false,
}: {
  ars: {
    montoCobertura: number
    montoDistribuido: number
    diferencia: number
    montoPaciente: number
    montoCoberturaDevuelta?: number
    montoCoberturaNeta?: number
  }
  onRecalcular?: () => void
  recalculando?: boolean
}) {
  const hayDiferencia = Math.abs(ars.diferencia ?? 0) > 0.005
  return (
    <div
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: 24,
        alignItems: 'flex-end',
        padding: '12px 0 0',
        borderTop: '1px solid var(--border)',
      }}
    >
      <Dato label="Cobertura ARS" valor={ars.montoCobertura} fuerte />
      <Dato label="Distribuido" valor={ars.montoDistribuido} />
      <div>
        <span className="detail-label">Diferencia</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span
            className="detail-value"
            style={{ fontWeight: 700, color: hayDiferencia ? 'var(--color-error)' : undefined }}
          >
            {formatDOP(ars.diferencia ?? 0)}
          </span>
          {hayDiferencia && onRecalcular && (
            <button type="button" className="btn btn-secondary btn-size-xs" onClick={onRecalcular} disabled={recalculando}>
              {recalculando ? <Loader2 size={12} className="spinner" /> : <RefreshCw size={12} />} Recalcular
            </button>
          )}
        </div>
      </div>
      <Dato label="A cargo del paciente" valor={ars.montoPaciente} fuerte />
      {(ars.montoCoberturaDevuelta ?? 0) > 0 && (
        <>
          <Dato label="Cobertura devuelta" valor={ars.montoCoberturaDevuelta ?? 0} />
          <Dato label="Cobertura neta" valor={ars.montoCoberturaNeta ?? 0} fuerte />
        </>
      )}
      {hayDiferencia && (
        <p style={{ flexBasis: '100%', margin: 0, fontSize: 12, color: 'var(--color-error)' }}>
          No se puede someter con diferencia: recalculá el reparto, o bajá el valor de cobertura si
          no cabe en las líneas.
        </p>
      )}
    </div>
  )
}

function Dato({ label, valor, fuerte = false }: { label: string; valor: number; fuerte?: boolean }) {
  return (
    <div>
      <span className="detail-label">{label}</span>
      <div className="detail-value" style={{ fontWeight: fuerte ? 700 : 500 }}>{formatDOP(valor)}</div>
    </div>
  )
}
