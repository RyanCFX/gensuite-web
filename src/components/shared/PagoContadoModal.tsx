import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { listMetodosPago } from '@/shared/api/config'
import { listCuentasBancarias } from '@/shared/api/cuentas-bancarias'
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
  const [remarks, setRemarks] = useState('')

  // Reinicia el formulario cada vez que el modal pasa de cerrado a abierto — ajustar estado
  // durante el render evita un render de sobra en cascada (mismo patrón que PrintLabelsModal).
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

  const { data: metodos } = useQuery({
    queryKey: ['metodos-pago'],
    queryFn: listMetodosPago,
    enabled: open,
  })
  const metodoSeleccionado = (metodos ?? []).find((m) => m.name === modeOfPayment)
  // Se infiere enteramente de la config del método de pago (Config > Métodos de Pago) — no hay
  // checkbox manual, el backend siempre lo fuerza si el método está marcado como cheque.
  const esCheque = !!metodoSeleccionado?.esCheque

  const showBankAccount = esCheque || !!metodoSeleccionado?.requiresBankAccount
  // Un cheque siempre requiere indicar de qué cuenta sale, sin importar defaultBankAccount —
  // ese default solo exime al método de pago cuando NO es cheque (ver PagoContadoDto.esCheque).
  const bankAccountRequired = esCheque || (showBankAccount && !metodoSeleccionado?.defaultBankAccount)

  const { data: cuentasBancarias } = useQuery({
    queryKey: ['cuentas-bancarias-activas'],
    queryFn: () => listCuentasBancarias({ estado: 'Activa', limit: 100 }),
    enabled: open && showBankAccount,
  })

  function handleConfirm() {
    if (!modeOfPayment) return
    if (bankAccountRequired && !bankAccount) return
    onConfirm({
      modeOfPayment,
      esCheque: esCheque || undefined,
      bankAccount: bankAccount || undefined,
      referenceDate: referenceDate || undefined,
      referenceNo: referenceNo || undefined,
      remarks: remarks || undefined,
    })
  }

  const canConfirm = !!modeOfPayment && (!bankAccountRequired || !!bankAccount)

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
              onValueChange={setBankAccount}
              placeholder={metodoSeleccionado?.defaultBankAccount ? 'Usar cuenta por defecto…' : 'Seleccionar cuenta bancaria…'}
            >
              {(cuentasBancarias?.items ?? []).map((c) => (
                <SelectItem key={c.id} value={c.id}>{c.accountName}</SelectItem>
              ))}
            </Select>
          </div>
        )}

        <div className="form-row form-row-2">
          <div className="ff-wrap">
            <label className="ff-label">{esCheque ? 'Número de Cheque' : 'No. de Referencia'}</label>
            <input
              className="ff-input"
              placeholder={esCheque ? 'Número de cheque…' : '# cheque, transferencia…'}
              value={referenceNo}
              onChange={(e) => setReferenceNo(e.target.value)}
            />
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
