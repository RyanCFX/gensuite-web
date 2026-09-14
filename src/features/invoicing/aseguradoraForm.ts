import { validateCedulaDetailed } from '@/lib/validators/dgii'
import type { AseguradoraInvoiceDto, TipoCoberturaArs } from '@/shared/api/types'

/**
 * Estado y conversiones del panel "Aseguradora (ARS)" del formulario de factura
 * (docs/PROMPT_FARMACIA_V2_FRONTEND.md §3.2/§3.7). Vive fuera de `AseguradoraPanel.tsx` para que
 * ese archivo exporte solo componentes (requisito de react-refresh).
 */
export interface AseguradoraFormState {
  aseguradora: string
  /** Label de la ARS elegida, para que el picker lo muestre sin re-buscar. */
  aseguradoraLabel: string
  numeroAutorizacion: string
  tipoCobertura: TipoCoberturaArs
  /** Texto crudo del input — se convierte a número al enviar. */
  valorCobertura: string
  carnetAfiliado: string
  cedula: string
  numeroSeguroSocial: string
  telefonoPaciente: string
  nombreDoctor: string
  fechaAprobacion: string
  fechaIndicacionReceta: string
  aprobadoPor: string
}

export const EMPTY_ASEGURADORA_FORM: AseguradoraFormState = {
  aseguradora: '',
  aseguradoraLabel: '',
  numeroAutorizacion: '',
  tipoCobertura: 'porciento',
  valorCobertura: '',
  carnetAfiliado: '',
  cedula: '',
  numeroSeguroSocial: '',
  telefonoPaciente: '',
  nombreDoctor: '',
  fechaAprobacion: '',
  fechaIndicacionReceta: '',
  aprobadoPor: '',
}

/** Hidrata el formulario desde el bloque `aseguradora` que devuelve la factura. */
export function aseguradoraFormFromInvoice(
  ars: Partial<AseguradoraInvoiceDto> & { aseguradoraName?: string },
): AseguradoraFormState {
  return {
    aseguradora: ars.aseguradora ?? '',
    aseguradoraLabel: ars.aseguradoraName ?? ars.aseguradora ?? '',
    numeroAutorizacion: ars.numeroAutorizacion ?? '',
    tipoCobertura: ars.tipoCobertura ?? 'porciento',
    valorCobertura: ars.valorCobertura != null ? String(ars.valorCobertura) : '',
    carnetAfiliado: ars.carnetAfiliado ?? '',
    cedula: ars.cedula ?? '',
    numeroSeguroSocial: ars.numeroSeguroSocial ?? '',
    telefonoPaciente: ars.telefonoPaciente ?? '',
    nombreDoctor: ars.nombreDoctor ?? '',
    fechaAprobacion: (ars.fechaAprobacion ?? '').slice(0, 10),
    fechaIndicacionReceta: (ars.fechaIndicacionReceta ?? '').slice(0, 10),
    aprobadoPor: ars.aprobadoPor ?? '',
  }
}

/** Primer error de validación en cliente, o `null` si el panel está completo (§3.2/§3.7). */
export function validarAseguradoraForm(
  f: AseguradoraFormState,
  opts: { customerId?: string } = {},
): string | null {
  if (!f.aseguradora) return 'Selecciona la aseguradora (ARS) de la cobertura'
  if (opts.customerId && opts.customerId === f.aseguradora) {
    return 'La aseguradora no puede ser el cliente de la factura — el cliente es el paciente'
  }
  if (!f.numeroAutorizacion.trim()) return 'El número de autorización de la ARS es obligatorio'
  if (f.numeroAutorizacion.trim().length > 140) return 'El número de autorización no puede pasar de 140 caracteres'
  const valor = Number(f.valorCobertura)
  if (!f.valorCobertura.trim() || !Number.isFinite(valor) || valor <= 0) {
    return 'El valor de cobertura de la ARS debe ser mayor que 0'
  }
  if (f.tipoCobertura === 'porciento' && valor > 100) {
    return 'El porcentaje de cobertura no puede superar 100'
  }
  if (f.cedula.trim() && !validateCedulaDetailed(f.cedula).valid) {
    return `Cédula del paciente inválida: ${validateCedulaDetailed(f.cedula).reason}`
  }
  return null
}

/** Convierte el estado del formulario al bloque `aseguradora` del request. */
export function aseguradoraFormToDto(f: AseguradoraFormState): AseguradoraInvoiceDto {
  const limpio = (v: string) => {
    const t = v.trim()
    return t === '' ? undefined : t
  }
  return {
    aseguradora: f.aseguradora,
    numeroAutorizacion: f.numeroAutorizacion.trim(),
    tipoCobertura: f.tipoCobertura,
    valorCobertura: Number(f.valorCobertura),
    carnetAfiliado: limpio(f.carnetAfiliado),
    cedula: limpio(f.cedula.replace(/[-\s]/g, '')),
    numeroSeguroSocial: limpio(f.numeroSeguroSocial),
    telefonoPaciente: limpio(f.telefonoPaciente),
    nombreDoctor: limpio(f.nombreDoctor),
    fechaAprobacion: limpio(f.fechaAprobacion),
    fechaIndicacionReceta: limpio(f.fechaIndicacionReceta),
    aprobadoPor: limpio(f.aprobadoPor),
  }
}

