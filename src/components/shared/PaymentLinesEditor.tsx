import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { listMetodosPago, listBancos, listDenominaciones } from '@/shared/api/config'
import {
  emptyPaymentLine,
  sumPayments,
  cashAmount,
  sumVuelto,
  PAYMENT_LINES_TOLERANCE,
  type PaymentLineDraft,
  type VueltoLineDraft,
  type PaymentLinesValue,
} from '@/lib/paymentLines'
import { SearchSelect } from '@/shared/ui/SearchSelect'
import { formatDOP } from '@/lib/formatters'
import { Plus, Trash2, ChevronDown, ChevronUp } from 'lucide-react'

interface PaymentLinesEditorProps {
  amountDue: number
  value: PaymentLinesValue
  onChange: (value: PaymentLinesValue) => void
}

export function PaymentLinesEditor({ amountDue, value, onChange }: PaymentLinesEditorProps) {
  const { data: metodos } = useQuery({ queryKey: ['metodos-pago'], queryFn: listMetodosPago, staleTime: 5 * 60_000 })
  const { data: bancos } = useQuery({ queryKey: ['bancos'], queryFn: listBancos, staleTime: 5 * 60_000 })
  const { data: denominaciones } = useQuery({ queryKey: ['denominaciones'], queryFn: listDenominaciones, staleTime: 5 * 60_000 })

  const [metodoSearch, setMetodoSearch] = useState<Record<number, string>>({})
  const [bancoSearch, setBancoSearch] = useState<Record<number, string>>({})
  const [vueltoDenomSearch, setVueltoDenomSearch] = useState<Record<number, string>>({})

  const metodosActivos = (metodos ?? []).filter((m) => !m.disabled)
  const denominacionesActivas = (denominaciones ?? []).filter((d) => d.activo)

  const total = sumPayments(value.payments)
  const totalOk = Math.abs(amountDue - total) <= PAYMENT_LINES_TOLERANCE

  function updateLine(idx: number, patch: Partial<PaymentLineDraft>) {
    const payments = value.payments.map((p, i) => (i === idx ? { ...p, ...patch } : p))
    onChange({ ...value, payments })
  }

  function addLine() {
    onChange({ ...value, payments: [...value.payments, emptyPaymentLine()] })
  }

  function removeLine(idx: number) {
    if (value.payments.length <= 1) return
    onChange({ ...value, payments: value.payments.filter((_, i) => i !== idx) })
  }

  const cash = cashAmount(value.payments, metodos ?? [])
  const tenderedCash = Number(value.tenderedCash) || 0
  const vueltoEsperado = Math.max(0, tenderedCash - cash)
  const vueltoDeclarado = sumVuelto(value.vuelto, denominacionesActivas)
  const vueltoOk = Math.abs(vueltoEsperado - vueltoDeclarado) <= PAYMENT_LINES_TOLERANCE

  function updateVueltoLine(idx: number, patch: Partial<VueltoLineDraft>) {
    const vuelto = value.vuelto.map((v, i) => (i === idx ? { ...v, ...patch } : v))
    onChange({ ...value, vuelto })
  }

  function addVueltoLine() {
    onChange({ ...value, vuelto: [...value.vuelto, { denominacion: '', cantidad: '' }] })
  }

  function removeVueltoLine(idx: number) {
    onChange({ ...value, vuelto: value.vuelto.filter((_, i) => i !== idx) })
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, width: '100%' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {value.payments.map((p, idx) => (
          <div
            key={idx}
            style={{
              border: '1px solid var(--border-default)',
              borderRadius: 'var(--radius-md)',
              padding: 10,
              display: 'flex',
              flexDirection: 'column',
              gap: 8,
            }}
          >
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <div style={{ flex: 1 }}>
                <SearchSelect
                  value={p.modeOfPayment}
                  selectedLabel={p.modeOfPayment}
                  onChange={(val) => updateLine(idx, { modeOfPayment: val })}
                  options={metodosActivos
                    .filter((m) => !metodoSearch[idx] || m.name.toLowerCase().includes(metodoSearch[idx].toLowerCase()))
                    .map((m) => ({ value: m.name, label: m.name }))}
                  onSearch={(q) => setMetodoSearch((prev) => ({ ...prev, [idx]: q }))}
                  placeholder="Método de pago…"
                />
              </div>
              <input
                className="ff-input"
                type="number"
                min="0"
                step="0.01"
                placeholder="Monto"
                value={p.amount}
                onChange={(e) => updateLine(idx, { amount: e.target.value })}
                style={{ width: 120 }}
              />
              <button
                type="button"
                className="btn btn-ghost btn-size-icon-sm"
                onClick={() => removeLine(idx)}
                disabled={value.payments.length <= 1}
                aria-label="Quitar línea de pago"
              >
                <Trash2 size={13} />
              </button>
            </div>

            <button
              type="button"
              className="btn btn-ghost btn-size-xs"
              style={{ alignSelf: 'flex-start' }}
              onClick={() => updateLine(idx, { showDetails: !p.showDetails })}
            >
              {p.showDetails ? <ChevronUp size={12} /> : <ChevronDown size={12} />} Detalles adicionales
            </button>

            {p.showDetails && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <input
                  className="ff-input"
                  placeholder="Número de tarjeta"
                  value={p.cardNumber}
                  onChange={(e) => updateLine(idx, { cardNumber: e.target.value })}
                />
                <input
                  className="ff-input"
                  placeholder="Código de autorización"
                  value={p.authorizationCode}
                  onChange={(e) => updateLine(idx, { authorizationCode: e.target.value })}
                />
                <SearchSelect
                  value={p.bank}
                  selectedLabel={p.bank}
                  onChange={(val) => updateLine(idx, { bank: val })}
                  options={(bancos ?? [])
                    .filter((b) => !bancoSearch[idx] || b.name.toLowerCase().includes(bancoSearch[idx].toLowerCase()))
                    .map((b) => ({ value: b.name, label: b.name }))}
                  onSearch={(q) => setBancoSearch((prev) => ({ ...prev, [idx]: q }))}
                  placeholder="Banco…"
                />
                <input
                  className="ff-input"
                  placeholder="Número de cheque/documento"
                  value={p.checkNumber}
                  onChange={(e) => updateLine(idx, { checkNumber: e.target.value })}
                />
              </div>
            )}
          </div>
        ))}
      </div>

      <button type="button" className="btn btn-secondary btn-size-sm" style={{ alignSelf: 'flex-start' }} onClick={addLine}>
        <Plus size={13} /> Agregar método de pago
      </button>

      <p style={{ fontSize: 13, margin: 0, color: totalOk ? 'var(--color-success)' : 'var(--error-text)' }}>
        Total ingresado: {formatDOP(total)} / Total a cobrar: {formatDOP(amountDue)}
      </p>

      <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer' }}>
        <input
          type="checkbox"
          checked={value.vueltoEnabled}
          onChange={(e) => onChange({ ...value, vueltoEnabled: e.target.checked })}
        />
        Registrar vuelto entregado
      </label>

      {value.vueltoEnabled && (
        <div
          style={{
            border: '1px solid var(--border-default)',
            borderRadius: 'var(--radius-md)',
            padding: 10,
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
          }}
        >
          <div className="ff-wrap">
            <label className="ff-label">Efectivo entregado por el cliente</label>
            <input
              className="ff-input"
              type="number"
              min="0"
              step="0.01"
              value={value.tenderedCash}
              onChange={(e) => onChange({ ...value, tenderedCash: e.target.value })}
              style={{ width: 160 }}
            />
          </div>

          {tenderedCash > 0 && (
            <>
              <p style={{ fontSize: 13, margin: 0 }}>Vuelto a entregar: {formatDOP(vueltoEsperado)}</p>

              {value.vuelto.map((v, idx) => (
                <div key={idx} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <div style={{ flex: 1 }}>
                    <SearchSelect
                      value={v.denominacion}
                      selectedLabel={v.denominacion}
                      onChange={(val) => updateVueltoLine(idx, { denominacion: val })}
                      options={denominacionesActivas
                        .filter(
                          (d) =>
                            !vueltoDenomSearch[idx] ||
                            d.denominacion.toLowerCase().includes(vueltoDenomSearch[idx].toLowerCase()),
                        )
                        .map((d) => ({ value: d.denominacion, label: d.denominacion }))}
                      onSearch={(q) => setVueltoDenomSearch((prev) => ({ ...prev, [idx]: q }))}
                      placeholder="Denominación…"
                    />
                  </div>
                  <input
                    className="ff-input"
                    type="number"
                    min="0"
                    step="1"
                    placeholder="Cantidad"
                    value={v.cantidad}
                    onChange={(e) => updateVueltoLine(idx, { cantidad: e.target.value })}
                    style={{ width: 100 }}
                  />
                  <button
                    type="button"
                    className="btn btn-ghost btn-size-icon-sm"
                    onClick={() => removeVueltoLine(idx)}
                    aria-label="Quitar denominación"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              ))}

              <button
                type="button"
                className="btn btn-secondary btn-size-sm"
                style={{ alignSelf: 'flex-start' }}
                onClick={addVueltoLine}
              >
                <Plus size={13} /> Agregar denominación
              </button>

              <p style={{ fontSize: 13, margin: 0, color: vueltoOk ? 'var(--color-success)' : 'var(--error-text)' }}>
                Total desglosado: {formatDOP(vueltoDeclarado)} / Vuelto esperado: {formatDOP(vueltoEsperado)}
              </p>
            </>
          )}
        </div>
      )}
    </div>
  )
}
