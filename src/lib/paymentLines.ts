import type { MetodoPago, Denominacion, PaymentLine, VueltoLine } from '@/shared/api/types'

export const PAYMENT_LINES_TOLERANCE = 0.01

export interface PaymentLineDraft {
  modeOfPayment: string
  amount: string
  cardNumber: string
  authorizationCode: string
  bank: string
  checkNumber: string
  bankAccount: string
  showDetails: boolean
}

export interface VueltoLineDraft {
  denominacion: string
  cantidad: string
}

export interface PaymentLinesValue {
  payments: PaymentLineDraft[]
  vueltoEnabled: boolean
  tenderedCash: string
  vuelto: VueltoLineDraft[]
}

export function emptyPaymentLine(): PaymentLineDraft {
  return {
    modeOfPayment: '',
    amount: '',
    cardNumber: '',
    authorizationCode: '',
    bank: '',
    checkNumber: '',
    bankAccount: '',
    showDetails: false,
  }
}

export const EMPTY_PAYMENT_LINES_VALUE: PaymentLinesValue = {
  payments: [emptyPaymentLine()],
  vueltoEnabled: false,
  tenderedCash: '',
  vuelto: [],
}

export function sumPayments(payments: PaymentLineDraft[]): number {
  return payments.reduce((sum, p) => sum + (Number(p.amount) || 0), 0)
}

export function cashAmount(payments: PaymentLineDraft[], metodos: MetodoPago[]): number {
  return payments.reduce((sum, p) => {
    const metodo = metodos.find((m) => m.name === p.modeOfPayment)
    return metodo?.type === 'Cash' ? sum + (Number(p.amount) || 0) : sum
  }, 0)
}

/** Moneda real de un método de pago — nunca se asume del nombre. Se deriva de la Cuenta Bancaria
 * asociada (`defaultBankAccount`) si tiene una, o si no de la cuenta contable directa (`account`,
 * resuelta aparte vía `getCuenta` por quien llame esto — ver `useMetodoPagoCurrencies`). Cae a la
 * moneda base si el método no tiene ninguna cuenta asociada (docs/tasks/70_caja_pos_sin_soporte_multimoneda.md:
 * Caja exige que el método opere en la MISMA moneda que la factura, sin conversión). */
export function resolveMetodoPagoCurrency(
  metodo: MetodoPago,
  cuentasBancariasPorId: Record<string, string>,
  cuentasPorId: Record<string, string>,
  monedaBase: string,
): string {
  if (metodo.defaultBankAccount) return cuentasBancariasPorId[metodo.defaultBankAccount] ?? monedaBase
  if (metodo.account) return cuentasPorId[metodo.account] ?? monedaBase
  return monedaBase
}

export function sumVuelto(vuelto: VueltoLineDraft[], denominaciones: { denominacion: string; valor: number }[]): number {
  return vuelto.reduce((sum, v) => {
    const d = denominaciones.find((d) => d.denominacion === v.denominacion)
    return sum + (d ? d.valor * (Number(v.cantidad) || 0) : 0)
  }, 0)
}

export function isPaymentLinesValid(
  value: PaymentLinesValue,
  amountDue: number,
  metodos: MetodoPago[],
  denominaciones: Denominacion[] = [],
): boolean {
  const validPayments = value.payments.filter((p) => p.modeOfPayment && Number(p.amount) > 0)
  if (validPayments.length === 0) return false
  if (validPayments.length !== value.payments.length) return false
  for (const p of validPayments) {
    const metodo = metodos.find((m) => m.name === p.modeOfPayment)
    if (metodo?.requiresBankAccount && !metodo.defaultBankAccount && !p.bankAccount) return false
  }
  const sum = sumPayments(value.payments)
  if (Math.abs(amountDue - sum) > PAYMENT_LINES_TOLERANCE) return false

  if (value.vueltoEnabled) {
    const tenderedCash = Number(value.tenderedCash) || 0
    if (tenderedCash <= 0) return false
    const declaredVuelto = value.vuelto.filter((v) => v.denominacion && Number(v.cantidad) > 0)
    if (declaredVuelto.length === 0) return false
    const cash = cashAmount(value.payments, metodos)
    const vueltoEsperado = Math.max(0, tenderedCash - cash)
    const vueltoDeclarado = sumVuelto(value.vuelto, denominaciones)
    if (Math.abs(vueltoEsperado - vueltoDeclarado) > PAYMENT_LINES_TOLERANCE) return false
  }
  return true
}

/** Método de pago default configurado en Facturacion Config para la moneda de una factura
 *  (docs/tasks/PROMPT_METODO_PAGO_DEFAULT_MULTIMONEDA_FRONTEND.md §3.3, Opción B) — usado para
 *  pre-seleccionar el método de pago al cobrar, dejando que el usuario lo cambie. '' si no hay
 *  ningún default configurado para esa moneda. */
export function resolveDefaultModeOfPago(
  config: { modoPagoCaja?: string | null; modoPagoCajaUsd?: string | null; modoPagoCajaEur?: string | null } | undefined,
  currency: string,
): string {
  if (!config) return ''
  if (currency === 'USD') return config.modoPagoCajaUsd || ''
  if (currency === 'EUR') return config.modoPagoCajaEur || ''
  return config.modoPagoCaja || ''
}

/** Mapea el 400 de "falta modeOfPayment y no hay default configurado" (§4.1 del doc de arriba) a
 *  un texto más amigable. El backend no manda un código de error dedicado para este caso — se
 *  detecta por el texto del mensaje, que siempre lo nombra igual. Cualquier otro mensaje se
 *  devuelve tal cual (el mensaje del backend ya es específico y accionable, ver §4.2). */
export function friendlyPaymentError(message: string | undefined, fallback = 'Error al procesar el cobro'): string {
  if (!message) return fallback
  if (!message.includes('no tiene un método de pago default configurado')) return message
  const moneda = /configurado para (\w+)/.exec(message)?.[1] ?? 'esa moneda'
  return `No se pudo cobrar: esta factura está en ${moneda} y no hay un método de pago seleccionado ni un default configurado para esa moneda. Selecciona un método de pago, o configura uno por defecto en Configuración > Facturación.`
}

export function buildSubmitPayload(
  value: PaymentLinesValue,
): { payments: PaymentLine[]; vuelto?: VueltoLine[]; tenderedCash?: number } {
  const payments: PaymentLine[] = value.payments
    .filter((p) => p.modeOfPayment && Number(p.amount) > 0)
    .map((p) => ({
      modeOfPayment: p.modeOfPayment,
      amount: Number(p.amount),
      ...(p.cardNumber ? { cardNumber: p.cardNumber } : {}),
      ...(p.authorizationCode ? { authorizationCode: p.authorizationCode } : {}),
      ...(p.bank ? { bank: p.bank } : {}),
      ...(p.checkNumber ? { checkNumber: p.checkNumber } : {}),
      ...(p.bankAccount ? { bankAccount: p.bankAccount } : {}),
    }))

  if (!value.vueltoEnabled) return { payments }

  const vuelto: VueltoLine[] = value.vuelto
    .filter((v) => v.denominacion && Number(v.cantidad) > 0)
    .map((v) => ({ denominacion: v.denominacion, cantidad: Number(v.cantidad) }))

  return { payments, vuelto, tenderedCash: Number(value.tenderedCash) || 0 }
}
