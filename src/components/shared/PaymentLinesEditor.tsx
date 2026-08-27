import { useState, useEffect, useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import { listMetodosPago, listBancos, listDenominaciones } from '@/shared/api/config'
import { listCuentasBancarias } from '@/shared/api/cuentas-bancarias'
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

function calcularVuelto(monto: number, denominaciones: { denominacion: string; valor: number }[]): VueltoLineDraft[] {
  const sorted = [...denominaciones].sort((a, b) => b.valor - a.valor)
  const resultado: VueltoLineDraft[] = []
  let restante = monto
  for (const d of sorted) {
    if (restante <= 0) break
    const cantidad = Math.floor(restante / d.valor)
    if (cantidad > 0) {
      resultado.push({ denominacion: d.denominacion, cantidad: String(cantidad) })
      restante = restante - d.valor * cantidad
      restante = Math.round(restante * 100) / 100
    }
  }
  return resultado
}

interface PaymentLinesEditorProps {
  amountDue: number
  value: PaymentLinesValue
  onChange: (value: PaymentLinesValue) => void
}

export function PaymentLinesEditor({ amountDue, value, onChange }: PaymentLinesEditorProps) {
  const { data: metodos } = useQuery({ queryKey: ['metodos-pago'], queryFn: listMetodosPago, staleTime: 5 * 60_000 })
  const { data: bancos } = useQuery({ queryKey: ['bancos'], queryFn: listBancos, staleTime: 5 * 60_000 })
  const { data: denominaciones } = useQuery({ queryKey: ['denominaciones'], queryFn: listDenominaciones, staleTime: 5 * 60_000 })
  const { data: cuentasBancarias } = useQuery({
    queryKey: ['cuentas-bancarias-activas'],
    queryFn: () => listCuentasBancarias({ estado: 'Activa', limit: 100 }),
    staleTime: 60_000,
  })

  const [metodoSearch, setMetodoSearch] = useState<Record<number, string>>({})
  const [bancoSearch, setBancoSearch] = useState<Record<number, string>>({})
  const [bankAccountSearch, setBankAccountSearch] = useState<Record<number, string>>({})
  const [vueltoDenomSearch, setVueltoDenomSearch] = useState<Record<number, string>>({})
  const prevTenderedCashRef = useRef<string>('')

  const metodosActivos = (metodos ?? []).filter((m) => !m.disabled)
  const denominacionesActivas = (denominaciones ?? []).filter((d) => d.activo)

  const total = sumPayments(value.payments)
  const totalOk = Math.abs(amountDue - total) <= PAYMENT_LINES_TOLERANCE

  useEffect(() => {
    if (!value.vueltoEnabled) return
    const tendered = Number(value.tenderedCash) || 0
    if (tendered <= 0) return
    const cash = cashAmount(value.payments, metodos ?? [])
    const vueltoEsperado = tendered - cash
    if (vueltoEsperado <= 0) return
    if (prevTenderedCashRef.current === value.tenderedCash) return
    prevTenderedCashRef.current = value.tenderedCash
    const autoVuelto = calcularVuelto(vueltoEsperado, denominacionesActivas)
    if (autoVuelto.length > 0) {
      onChange({ ...value, vuelto: autoVuelto })
    }
  }, [value, denominacionesActivas, metodos, onChange])

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
  const vueltoEsperado = tenderedCash - cash
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
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24, width: '100%' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <span className="form-section-title">Métodos de pago</span>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {value.payments.map((p, idx) => (
            <div
              key={idx}
              style={{
                border: '1px solid var(--border-default)',
                borderRadius: 'var(--radius-lg)',
                background: 'var(--surface-sunken)',
                padding: 16,
                display: 'flex',
                flexDirection: 'column',
                gap: 12,
              }}
            >
              <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end' }}>
                <div style={{ flex: 1 }} className="ff-wrap">
                  <label className="ff-label">Método de pago</label>
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
                <div className="ff-wrap" style={{ width: 140 }}>
                  <label className="ff-label">Monto</label>
                  <input
                    className="ff-input"
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="0.00"
                    value={p.amount}
                    onChange={(e) => updateLine(idx, { amount: e.target.value })}
                  />
                </div>
                <button
                  type="button"
                  className="btn btn-ghost btn-size-icon-sm"
                  onClick={() => removeLine(idx)}
                  disabled={value.payments.length <= 1}
                  aria-label="Quitar línea de pago"
                  style={{ marginBottom: 2 }}
                >
                  <Trash2 size={13} />
                </button>
              </div>

              {(() => {
                const metodo = metodosActivos.find((m) => m.name === p.modeOfPayment)
                if (!metodo?.requiresBankAccount) return null
                return (
                  <div className="ff-wrap">
                    <label className="ff-label">
                      Cuenta Bancaria{!metodo.defaultBankAccount && <span className="ff-required"> *</span>}
                    </label>
                    <SearchSelect
                      value={p.bankAccount}
                      error={!metodo.defaultBankAccount && !p.bankAccount}
                      onChange={(val) => updateLine(idx, { bankAccount: val })}
                      options={(cuentasBancarias?.items ?? [])
                        .filter((c) => !bankAccountSearch[idx] || c.accountName.toLowerCase().includes(bankAccountSearch[idx].toLowerCase()))
                        .map((c) => ({ value: c.id, label: c.accountName, sublabel: c.bank }))}
                      onSearch={(q) => setBankAccountSearch((prev) => ({ ...prev, [idx]: q }))}
                      selectedLabel={cuentasBancarias?.items.find((c) => c.id === p.bankAccount)?.accountName ?? ''}
                      placeholder={metodo.defaultBankAccount ? 'Usar cuenta por defecto…' : 'Seleccionar cuenta bancaria…'}
                    />
                  </div>
                )
              })()}

              <button
                type="button"
                className="btn btn-ghost btn-size-xs"
                style={{ alignSelf: 'flex-start' }}
                onClick={() => updateLine(idx, { showDetails: !p.showDetails })}
              >
                {p.showDetails ? <ChevronUp size={12} /> : <ChevronDown size={12} />} Detalles adicionales
              </button>

              {p.showDetails && (
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr 1fr',
                    gap: 12,
                    paddingTop: 12,
                    borderTop: '1px solid var(--border-subtle)',
                  }}
                >
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

        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '10px 14px',
            borderRadius: 'var(--radius-md)',
            background: totalOk ? 'var(--success-bg, rgba(34,197,94,0.08))' : 'var(--error-bg, rgba(239,68,68,0.08))',
            fontSize: 13,
          }}
        >
          <span>Total ingresado: <strong>{formatDOP(total)}</strong></span>
          <span style={{ color: totalOk ? 'var(--color-success)' : 'var(--error-text)', fontWeight: 600 }}>
            Total a cobrar: {formatDOP(amountDue)}
          </span>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 14, paddingTop: 4, borderTop: '1px solid var(--border-subtle)' }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer', paddingTop: 10 }}>
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
              borderRadius: 'var(--radius-lg)',
              background: 'var(--surface-sunken)',
              padding: 16,
              display: 'flex',
              flexDirection: 'column',
              gap: 14,
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
                style={{ width: 200 }}
              />
            </div>

            {tenderedCash > 0 && (
              <>
                <p style={{ fontSize: 13, margin: 0, color: vueltoEsperado < 0 ? 'var(--color-error)' : undefined }}>
                  Vuelto a entregar: {formatDOP(vueltoEsperado)}
                  {vueltoEsperado < 0 && (
                    <span style={{ display: 'block', fontSize: 12, color: 'var(--color-error)', marginTop: 2 }}>
                      El efectivo entregado es menor al total de pagos en efectivo
                    </span>
                  )}
                </p>

                {value.vuelto.length > 0 && (
                  <p style={{ fontSize: 11, color: 'var(--text-tertiary)', margin: 0 }}>
                    Desglose calculado automáticamente. Puedes ajustar las cantidades manualmente si es necesario.
                  </p>
                )}

                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {value.vuelto.map((v, idx) => (
                    <div key={idx} style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
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
                        style={{ width: 110 }}
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
                </div>

                <button
                  type="button"
                  className="btn btn-secondary btn-size-sm"
                  style={{ alignSelf: 'flex-start' }}
                  onClick={addVueltoLine}
                >
                  <Plus size={13} /> Agregar denominación
                </button>

                <p style={{ fontSize: 13, margin: 0, color: vueltoEsperado >= 0 && vueltoOk ? 'var(--color-success)' : 'var(--error-text)' }}>
                  Total desglosado: {formatDOP(vueltoDeclarado)} / Vuelto esperado: {formatDOP(vueltoEsperado)}
                  {vueltoEsperado >= 0 && !vueltoOk && (
                    <span style={{ display: 'block', fontSize: 12, color: 'var(--color-error)', marginTop: 2 }}>
                      El desglose no coincide con el vuelto esperado
                    </span>
                  )}
                </p>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
