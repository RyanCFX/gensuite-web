// Reglas de cuenta bancaria y cheque de un método de pago — única fuente para cobros, pagos, caja,
// notas de crédito y facturas. Los datos vienen de /opciones/metodos-pago y /opciones/cuentas-bancarias.

export interface MetodoPagoReglas {
  name: string
  type?: string | null
  requiresBankAccount?: boolean
  defaultBankAccount?: string | null
  esCheque?: boolean
}

export interface CuentaBancariaReglas {
  tipoCuenta?: string | null
  chequesManuales?: boolean
}

export const TIPO_CUENTA_CHEQUE = 'Cuenta Corriente'

export interface ReglasCuentaBancaria {
  esCheque: boolean
  /** Hay que mostrar el selector de cuenta bancaria. */
  mostrarCuenta: boolean
  /** La cuenta es obligatoria: un cheque siempre; el resto solo si el método la exige y no trae una por defecto. */
  cuentaObligatoria: boolean
  tieneCuentaPorDefecto: boolean
}

export function reglasCuentaBancaria(metodo: MetodoPagoReglas | null | undefined): ReglasCuentaBancaria {
  const esCheque = !!metodo?.esCheque
  const requiere = !!metodo?.requiresBankAccount
  const tieneCuentaPorDefecto = !!metodo?.defaultBankAccount
  return {
    esCheque,
    mostrarCuenta: requiere || esCheque,
    cuentaObligatoria: esCheque || (requiere && !tieneCuentaPorDefecto),
    tieneCuentaPorDefecto,
  }
}

/** Para cheques solo se ofrecen cuentas de tipo "Cuenta Corriente". */
export function cuentasElegibles<T extends CuentaBancariaReglas>(cuentas: T[], metodo: MetodoPagoReglas | null | undefined): T[] {
  return metodo?.esCheque ? cuentas.filter((c) => c.tipoCuenta === TIPO_CUENTA_CHEQUE) : cuentas
}

/** true = el número de cheque se digita; false = lo asigna el sistema. Sin dato, se asume manual. */
export function chequeManual(cuenta: CuentaBancariaReglas | null | undefined): boolean {
  return cuenta?.chequesManuales ?? true
}
