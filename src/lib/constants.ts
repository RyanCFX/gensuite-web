export const NCF_TYPES = [
  { value: 'B01', label: 'B01 — Crédito Fiscal' },
  { value: 'B02', label: 'B02 — Consumidor Final' },
  { value: 'B14', label: 'B14 — Regímenes Especiales' },
  { value: 'B15', label: 'B15 — Gubernamental' },
  { value: 'B16', label: 'B16 — Proveedores Informales' },
] as const

export const NCF_TYPES_COMPRA = [
  { value: 'B01', label: 'B01 — Crédito Fiscal' },
  { value: 'B13', label: 'B13 — Pago al Exterior' },
  { value: 'B14', label: 'B14 — Regímenes Especiales' },
  { value: 'B15', label: 'B15 — Gubernamental' },
  { value: 'B16', label: 'B16 — Proveedores Informales' },
  { value: 'B17', label: 'B17 — Gastos Menores (≤ RD$50)' },
  { value: 'E31', label: 'E31 — Exportación' },
] as const

export const TIPO_BIENES_606 = [
  { value: '01', label: '01 — Gastos de Personal' },
  { value: '02', label: '02 — Gastos por Trabajo, Suministros y Servicios' },
  { value: '03', label: '03 — Arrendamientos' },
  { value: '04', label: '04 — Gastos de Activos Fijos' },
  { value: '05', label: '05 — Adquisición de Activos' },
  { value: '06', label: '06 — Gastos de Representación' },
  { value: '07', label: '07 — Otras Deducciones Admitidas' },
  { value: '08', label: '08 — Gastos con Efectos Patrimoniales' },
  { value: '09', label: '09 — Pagos Computables por Terceros' },
  { value: '10', label: '10 — Gastos en Regímenes Especiales' },
  { value: '11', label: '11 — Compras y Gastos que Serán Parte del Costo de Venta' },
  { value: '12', label: '12 — Beneficios Laborales' },
  { value: '13', label: '13 — Compras de Bienes' },
] as const

export const FORMA_PAGO_606 = [
  { value: '01', label: '01 — Efectivo' },
  { value: '02', label: '02 — Cheques/Transferencias/Depósitos' },
  { value: '03', label: '03 — Tarjeta de Crédito/Débito' },
  { value: '04', label: '04 — Compra a Crédito' },
  { value: '05', label: '05 — Permuta' },
  { value: '06', label: '06 — Nota de Crédito' },
  { value: '07', label: '07 — Mixto' },
  { value: '08', label: '08 — Otras Formas de Pago' },
] as const

export const DOC_STATUS_LABELS: Record<string, string> = {
  Draft: 'Borrador',
  Submitted: 'Sometido',
  Cancelled: 'Cancelado',
  Ordered: 'Ordenado',
  Lost: 'Perdido',
  // Algunos BFF (ej. Gastos) devuelven el status en minúscula — se mapean
  // a las mismas etiquetas para evitar mostrar el valor crudo sin traducir.
  draft: 'Borrador',
  submitted: 'Sometido',
  cancelled: 'Cancelado',
}

export const DOC_STATUS_COLOR: Record<string, string> = {
  Draft: 'badge--gray',
  Submitted: 'badge--green',
  Cancelled: 'badge--red',
  Ordered: 'badge--blue',
  Lost: 'badge--orange',
  draft: 'badge--gray',
  submitted: 'badge--green',
  cancelled: 'badge--red',
}

export const TIPO_IDENTIFICACION = [
  { value: 'RNC', label: 'RNC (Empresa)' },
  { value: 'Cedula', label: 'Cédula' },
  { value: 'Pasaporte', label: 'Pasaporte' },
  { value: 'NIT', label: 'NIT (Extranjero)' },
] as const

export const REGIMENES_FISCALES = [
  { value: 'Ordinario', label: 'Régimen Ordinario' },
  { value: 'Simplificado', label: 'Régimen Simplificado' },
  { value: 'RST', label: 'RST' },
] as const

export const CATEGORIA_GASTO = [
  { value: 'Operativo', label: 'Operativo' },
  { value: 'Administrativo', label: 'Administrativo' },
  { value: 'Ventas', label: 'Ventas' },
  { value: 'Financiero', label: 'Financiero' },
] as const

export const PAYMENT_STATUS_LABELS: Record<string, string> = {
  paid: 'Pagado',
  unpaid: 'Pendiente',
  overdue: 'Vencido',
  partial: 'Parcial',
}

export const STOCK_STATUS_LABELS: Record<string, string> = {
  in_stock: 'En stock',
  low_stock: 'Stock bajo',
  out_of_stock: 'Sin stock',
}

export const STOCK_STATUS_COLOR: Record<string, string> = {
  in_stock: 'badge--green',
  low_stock: 'badge--orange',
  out_of_stock: 'badge--red',
}

export const SEMAFORO_COLOR: Record<string, string> = {
  verde: 'semaforo--verde',
  amarillo: 'semaforo--amarillo',
  rojo: 'semaforo--rojo',
}

export const ERROR_MESSAGES: Record<string, string> = {
  UNAUTHORIZED: 'Sesión expirada. Por favor inicia sesión nuevamente.',
  TENANT_MISMATCH: 'Error de autenticación. Recarga la página.',
  TENANT_NOT_FOUND: 'Organización no encontrada.',
  NOT_FOUND: 'El recurso solicitado no existe.',
  CONFLICT: 'No se puede realizar esta operación. El documento puede estar en uso.',
  BAD_REQUEST: 'Datos inválidos. Revisa el formulario.',
  FORBIDDEN: 'No tienes permisos para realizar esta acción.',
  SERVICE_UNAVAILABLE: 'Esta función no está disponible. Contacta al administrador.',
  TOO_MANY_REQUESTS: 'Demasiadas solicitudes. Espera un momento.',
  INTERNAL_ERROR: 'Error interno del servidor. Intenta de nuevo.',
  UNKNOWN_ERROR: 'Error inesperado. Intenta de nuevo.',
}

export const TENANT_SLUG = import.meta.env.VITE_TENANT_SLUG ?? 'tenant1'
export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'https://gensapi.ryancfx.click/api/v1'
