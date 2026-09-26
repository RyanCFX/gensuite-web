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
  /** Desglose del vuelto en denominaciones — solo tiene contenido cuando hay un sobrepago
   *  válido (suma > total a cobrar con al menos una línea en efectivo); se calcula
   *  automáticamente y el cajero puede ajustarlo. Vacío en cualquier otro caso. */
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
  vuelto: [],
}

export function sumPayments(payments: PaymentLineDraft[]): number {
  return payments.reduce((sum, p) => sum + (Number(p.amount) || 0), 0)
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

export function cashAmount(payments: PaymentLineDraft[], metodos: MetodoPago[]): number {
  return payments.reduce((sum, p) => {
    const metodo = metodos.find((m) => m.name === p.modeOfPayment)
    return metodo?.type === 'Cash' ? sum + (Number(p.amount) || 0) : sum
  }, 0)
}

/** Excedente por encima del total a cobrar (0 si la suma no lo supera fuera de tolerancia). */
export function overpayAmount(payments: PaymentLineDraft[], amountDue: number): number {
  const over = sumPayments(payments) - amountDue
  return over > PAYMENT_LINES_TOLERANCE ? round2(over) : 0
}

/** Faltante por debajo del total a cobrar (0 si está cubierto o dentro de tolerancia). */
export function missingAmount(payments: PaymentLineDraft[], amountDue: number): number {
  const missing = amountDue - sumPayments(payments)
  return missing > PAYMENT_LINES_TOLERANCE ? round2(missing) : 0
}

/** true si hay 1 o más líneas de pago en efectivo (type Cash) con monto > 0. */
export function hasCashPayment(payments: PaymentLineDraft[], metodos: MetodoPago[]): boolean {
  return payments.some((p) => {
    if (!(Number(p.amount) > 0)) return false
    return metodos.find((m) => m.name === p.modeOfPayment)?.type === 'Cash'
  })
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

/** Líneas del desglose de vuelto completas (con denominación y cantidad > 0). */
export function declaredVuelto(value: PaymentLinesValue): VueltoLineDraft[] {
  return value.vuelto.filter((v) => v.denominacion && Number(v.cantidad) > 0)
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
  // El pago parcial (suma < total) se permite — el backend responde fullyPaid=false y cada
  // pantalla lo maneja con su propio flujo. Acá solo se valida el sobrepago.

  // Sobrepago: solo válido con al menos una línea en efectivo, sin superar el efectivo
  // recibido (no se puede devolver más de lo que entró en cash) y con el desglose del vuelto
  // coincidiendo con el excedente.
  // NOTA: el pago parcial (suma < total) NO se valida acá — PorCobrar/Caja/Facturación lo
  // permiten (el backend responde fullyPaid=false) y cada pantalla lo maneja con su propio flujo.
  const over = overpayAmount(value.payments, amountDue)
  if (over > 0) {
    if (!hasCashPayment(value.payments, metodos)) return false
    const cash = cashAmount(value.payments, metodos)
    if (over > cash + PAYMENT_LINES_TOLERANCE) return false
    if (declaredVuelto(value).length === 0) return false
    const vueltoDeclarado = sumVuelto(value.vuelto, denominaciones)
    if (Math.abs(over - vueltoDeclarado) > PAYMENT_LINES_TOLERANCE) return false
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
  amountDue: number,
  metodos: MetodoPago[],
): { payments: PaymentLine[]; vuelto?: VueltoLine[]; tenderedCash?: number } {
  const over = overpayAmount(value.payments, amountDue)
  const cash = cashAmount(value.payments, metodos)
  const canVuelto =
    over > 0 && hasCashPayment(value.payments, metodos) && over <= cash + PAYMENT_LINES_TOLERANCE

  // Solo las líneas válidas, marcando cuáles son en efectivo para el ajuste de abajo.
  const valid = value.payments
    .map((p) => ({
      p,
      isCash: metodos.find((m) => m.name === p.modeOfPayment)?.type === 'Cash',
    }))
    .filter(({ p }) => p.modeOfPayment && Number(p.amount) > 0)

  const payments: PaymentLine[] = valid.map(({ p }) => ({
    modeOfPayment: p.modeOfPayment,
    amount: Number(p.amount),
    ...(p.cardNumber ? { cardNumber: p.cardNumber } : {}),
    ...(p.authorizationCode ? { authorizationCode: p.authorizationCode } : {}),
    ...(p.bank ? { bank: p.bank } : {}),
    ...(p.checkNumber ? { checkNumber: p.checkNumber } : {}),
    ...(p.bankAccount ? { bankAccount: p.bankAccount } : {}),
  }))

  if (!canVuelto) return { payments }

  // Con sobrepago, las líneas se normalizan para que sumen exactamente el total a cobrar:
  // el excedente se absorbe de las líneas en efectivo (de la última a la primera) y viaja como
  // vuelto. `tenderedCash` es el efectivo total recibido (mismo contrato que antes).
  let remaining = over
  for (let i = payments.length - 1; i >= 0 && remaining > PAYMENT_LINES_TOLERANCE; i--) {
    if (!valid[i].isCash) continue
    const take = Math.min(payments[i].amount, remaining)
    payments[i] = { ...payments[i], amount: round2(payments[i].amount - take) }
    remaining = round2(remaining - take)
  }
  const adjusted = payments.filter((l) => l.amount > PAYMENT_LINES_TOLERANCE)

  const vuelto: VueltoLine[] = value.vuelto
    .filter((v) => v.denominacion && Number(v.cantidad) > 0)
    .map((v) => ({ denominacion: v.denominacion, cantidad: Number(v.cantidad) }))

  return { payments: adjusted, vuelto, tenderedCash: round2(cash) }
}
