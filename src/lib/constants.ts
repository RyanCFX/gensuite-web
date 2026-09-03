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
  // Estados de devolución post-sometida (ruta devoluciones) que indican disponibilidad de saldo:
  available: 'Disponible',
  partially_used: 'Parcialmente usada',
  fully_used: 'Agotada',
  // erpStatus nativo de Solicitud de Compra (Material Request):
  Pending: 'Pendiente',
  Stopped: 'Detenida',
  'Partially Ordered': 'Parcialmente ordenada',
  // erpStatus nativo de Orden de Compra (Purchase Order):
  'On Hold': 'En espera',
  'To Receive and Bill': 'Por recibir y facturar',
  'To Bill': 'Por facturar',
  'To Receive': 'Por recibir',
  Completed: 'Completada',
  Closed: 'Cerrada',
  Delivered: 'Entregada',
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

// Motivos de anulación de comprobantes fiscales — Formato 608 DGII.
// Lista fija por norma legal, no viene de un endpoint de catálogo.
export const MOTIVOS_ANULACION_DGII = [
  { value: '1', label: 'Deterioro de factura preimpresa' },
  { value: '2', label: 'Errores de impresión' },
  { value: '3', label: 'Impresión defectuosa' },
  { value: '4', label: 'Corrección de la información' },
  { value: '5', label: 'Cambio de productos' },
  { value: '6', label: 'Devolución de productos' },
  { value: '7', label: 'Omisión de productos' },
  { value: '8', label: 'Errores en secuencia de NCF' },
  { value: '9', label: 'Por cese de operaciones' },
  { value: '10', label: 'Pérdida o hurto de talonarios' },
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
export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? '/api/v1'

/** Días desde la fecha de la factura/compra original a partir de los cuales el backend, por
 *  regla fiscal, ya no devuelve el ITBIS en una devolución — solo el monto neto antes de
 *  impuestos (aplica igual a devoluciones de venta y de compra). Puramente informativo para
 *  avisarle al usuario antes de crear la devolución; el backend es quien controla el cálculo real. */
export const DEVOLUCION_DIAS_LIMITE_ITBIS = 30
