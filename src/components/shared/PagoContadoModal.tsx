import { useEffect, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { listMetodosPago } from '@/shared/api/config'
import { listCuentasBancarias } from '@/shared/api/cuentas-bancarias'
import { getSiguienteChequeCuenta } from '@/shared/api/tesoreria'
import { Modal } from '@/shared/ui/Modal'
import { Select, SelectItem } from '@/components/ui/select'
import { DatePicker } from '@/shared/ui/DatePicker'
import { formatDOP } from '@/lib/formatters'
import type { PagoContadoDto } from '@/shared/api/types'

interface Props {
  open: boolean
  onClose: () => void
  /** Saldo pendiente de la factura — el backend siempre paga este monto completo, no se pide. */
  outstandingAmount: number
  /** Fecha de posting de la factura — default de `referenceDate` si el usuario no la llena. */
  postingDate: string
  loading: boolean
  onConfirm: (body: PagoContadoDto) => void
}

export function PagoContadoModal({ open, onClose, outstandingAmount, postingDate, loading, onConfirm }: Props) {
  const [modeOfPayment, setModeOfPayment] = useState('')
  const [bankAccount, setBankAccount] = useState('')
  const [referenceDate, setReferenceDate] = useState('')
  const [referenceNo, setReferenceNo] = useState('')
  const referenceNoTocado = useRef(false)
  const [remarks, setRemarks] = useState('')

  // Reinicia el formulario cada vez que el modal pasa de cerrado a abierto — ajustar estado
  // durante el render evita un render de sobra en cascada (mismo patrón que PrintLabelsModal).
  // El ref no puede tocarse durante el render (regla de React), así que su reset va aparte en
  // un efecto normal sincronizado con la misma transición.
  const [wasOpen, setWasOpen] = useState(open)
  if (open !== wasOpen) {
    setWasOpen(open)
    if (open) {
      setModeOfPayment('')
      setBankAccount('')
      setReferenceDate('')
      setReferenceNo('')
      setRemarks('')
    }
  }
  useEffect(() => {
    if (open) referenceNoTocado.current = false
  }, [open])

  const { data: metodos } = useQuery({
    queryKey: ['metodos-pago'],
    queryFn: listMetodosPago,
    enabled: open,
  })
  const metodoSeleccionado = (metodos ?? []).find((m) => m.name === modeOfPayment)
  // Se infiere enteramente de la config del método de pago (Config > Métodos de Pago) — no hay
  // checkbox manual, el backend siempre lo fuerza si el método está marcado como cheque. Elegir
  // una cuenta bancaria por sí solo NO implica cheque (a diferencia del criterio legacy de
  // RegistrarPagoPage) — solo la config del método decide.
  const esCheque = !!metodoSeleccionado?.esCheque
  const showBankAccount = esCheque || !!metodoSeleccionado?.requiresBankAccount

  const { data: cuentasBancarias } = useQuery({
    queryKey: ['cuentas-bancarias-activas'],
    queryFn: () => listCuentasBancarias({ estado: 'Activa', limit: 100 }),
    enabled: open && showBankAccount,
  })

  const cuentaSeleccionada = cuentasBancarias?.items.find((c) => c.id === bankAccount)
  // Un cheque siempre requiere indicar de qué cuenta sale, sin importar defaultBankAccount —
  // ese default solo exime al método de pago cuando NO es cheque (ver PagoContadoDto.esCheque).
  const bankAccountRequired = esCheque || (showBankAccount && !metodoSeleccionado?.defaultBankAccount)
  const cuentaChequesManuales = cuentaSeleccionada?.chequesManuales ?? true

  const { data: siguienteCheque } = useQuery({
    queryKey: ['tesoreria-siguiente-cheque-cuenta', bankAccount],
    queryFn: () => getSiguienteChequeCuenta(bankAccount),
    enabled: open && esCheque && !!bankAccount,
  })

  useEffect(() => {
    if (!esCheque || !siguienteCheque?.siguienteSugerido) return
    // Numeración automática: el campo queda deshabilitado y siempre refleja el número que
    // asignará el backend, sin importar lo que el usuario haya escrito antes.
    if (!cuentaChequesManuales) {
      setReferenceNo(siguienteCheque.siguienteSugerido)
      return
    }
    // Numeración manual: solo se sugiere una vez, como punto de partida editable.
    if (!referenceNoTocado.current && !referenceNo) {
      setReferenceNo(siguienteCheque.siguienteSugerido)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [esCheque, cuentaChequesManuales, siguienteCheque])

  const referenceNoRequired = esCheque && cuentaChequesManuales

  function handleConfirm() {
    if (!modeOfPayment) return
    if (bankAccountRequired && !bankAccount) return
    if (referenceNoRequired && !referenceNo) return
    onConfirm({
      modeOfPayment,
      esCheque: esCheque || undefined,
      bankAccount: bankAccount || undefined,
      referenceDate: referenceDate || undefined,
      // Numeración automática: el backend asigna el número — enviarlo igual sería rechazado.
      referenceNo: esCheque && !cuentaChequesManuales ? undefined : (referenceNo || undefined),
      remarks: remarks || undefined,
    })
  }

  const canConfirm = !!modeOfPayment && (!bankAccountRequired || !!bankAccount) && (!referenceNoRequired || !!referenceNo)

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Pago de contado"
      subtitle="Esta factura es de contado — se pagará el saldo pendiente al someterla."
      footer={
        <>
          <button className="btn btn-secondary btn-size-sm" onClick={onClose} disabled={loading}>
            Cancelar
          </button>
          <button className="btn btn-primary btn-size-sm" onClick={handleConfirm} disabled={loading || !canConfirm}>
            {loading ? <span className="spinner spinner-white spinner-sm" /> : 'Someter y pagar'}
          </button>
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
          Se pagará <strong>{formatDOP(outstandingAmount)}</strong> — el monto total pendiente de la factura.
        </p>

        <div className="ff-wrap">
          <label className="ff-label">Método de Pago <span className="ff-required">*</span></label>
          <Select
            value={modeOfPayment}
            onValueChange={(val) => { setModeOfPayment(val); setBankAccount('') }}
            placeholder="Seleccionar método…"
          >
            {(metodos ?? []).filter((m) => !m.disabled).map((m) => (
              <SelectItem key={m.name} value={m.name}>{m.name}</SelectItem>
            ))}
          </Select>
          {esCheque && (
            <p className="ff-hint">Este método de pago está configurado como cheque — siempre se tratará como tal.</p>
          )}
        </div>

        {showBankAccount && (
          <div className="ff-wrap">
            <label className="ff-label">
              Cuenta Bancaria {bankAccountRequired && <span className="ff-required">*</span>}
            </label>
            <Select
              value={bankAccount}
              onValueChange={(val) => {
                setBankAccount(val)
                referenceNoTocado.current = false
                setReferenceNo('')
              }}
              placeholder={metodoSeleccionado?.defaultBankAccount ? 'Usar cuenta por defecto…' : 'Seleccionar cuenta bancaria…'}
            >
              {(cuentasBancarias?.items ?? [])
                // Un cheque solo puede emitirse contra una cuenta corriente.
                .filter((c) => !esCheque || c.tipoCuenta === 'Cuenta Corriente')
                .map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.accountName}</SelectItem>
                ))}
            </Select>
          </div>
        )}

        <div className="form-row form-row-2">
          <div className="ff-wrap">
            <label className="ff-label">
              {esCheque ? 'Número de Cheque' : 'No. de Referencia'}
              {esCheque && cuentaChequesManuales && <span className="ff-required">*</span>}
            </label>
            <input
              className="ff-input"
              placeholder={esCheque ? 'Número de cheque…' : '# cheque, transferencia…'}
              value={referenceNo}
              disabled={esCheque && !cuentaChequesManuales}
              onChange={(e) => { referenceNoTocado.current = true; setReferenceNo(e.target.value) }}
            />
            {esCheque && !cuentaChequesManuales && (
              <p className="ff-hint" style={{ margin: 0 }}>
                {bankAccount
                  ? 'Numeración automática — se asigna al guardar.'
                  : 'Selecciona la cuenta bancaria para ver el número que se asignará.'}
              </p>
            )}
            {esCheque && cuentaChequesManuales && siguienteCheque?.ultimoCheque && (
              <p className="ff-hint">Último usado: {siguienteCheque.ultimoCheque} — sugerencia editable.</p>
            )}
          </div>
          <div className="ff-wrap">
            <label className="ff-label">Fecha de Referencia</label>
            <DatePicker
              value={referenceDate}
              onChange={setReferenceDate}
              placeholder={postingDate}
              clearable
            />
          </div>
        </div>

        <div className="ff-wrap">
          <label className="ff-label">Notas</label>
          <textarea
            className="ff-textarea"
            rows={2}
            placeholder="Observaciones opcionales…"
            value={remarks}
            onChange={(e) => setRemarks(e.target.value)}
          />
        </div>
      </div>
    </Modal>
  )
}
