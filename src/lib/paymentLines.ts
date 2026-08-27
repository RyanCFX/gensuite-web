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
