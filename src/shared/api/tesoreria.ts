import { client, unwrap, unwrapPaginated } from './client'
import { ENDPOINTS } from './endpoints'
import type {
  ApiError,
  TipoDocumentoBancario,
  CreateBankDocumentTypeDto,
  UpdateBankDocumentTypeDto,
  TesoreriaNaturaleza,
  TesoreriaTipoTransaccion,
  TreasuryTransaction,
  CreateEmisionDto,
  UpdateEmisionDto,
  CreateDepositoDto,
  UpdateDepositoDto,
  CreateTransferenciaInternaDto,
  UpdateTransferenciaInternaDto,
  TesoreriaEstado,
  TesoreriaPendienteFactura,
  MovimientoBancario,
  MovimientosMeta,
  ResumenMovimientos,
  ChequePrintTemplate,
  CreateChequePrintTemplateDto,
  UpdateChequePrintTemplateDto,
  AsientoPreviewRow,
  PaginatedResponse,
  PaginationParams,
} from './types'

// ─── Tipos de Documento Bancario ────────────────────────────────────────────

export interface ListTiposDocumentoParams extends PaginationParams {
  nature?: TesoreriaNaturaleza
  transactionType?: TesoreriaTipoTransaccion
  enabled?: boolean
}

export async function listTiposDocumento(params?: ListTiposDocumentoParams) {
  const res = await client.get<PaginatedResponse<TipoDocumentoBancario>>(
    ENDPOINTS.tesoreria.tiposDocumento.list,
    { params },
  )
  return unwrapPaginated(res)
}

export async function getTipoDocumento(id: string) {
  const res = await client.get<{ success: true; data: TipoDocumentoBancario }>(
    ENDPOINTS.tesoreria.tiposDocumento.byId(id),
  )
  return unwrap(res)
}

export async function createTipoDocumento(data: CreateBankDocumentTypeDto) {
  const res = await client.post<{ success: true; data: TipoDocumentoBancario }>(
    ENDPOINTS.tesoreria.tiposDocumento.list,
    data,
  )
  return unwrap(res)
}

export async function updateTipoDocumento(id: string, data: UpdateBankDocumentTypeDto) {
  const res = await client.put<{ success: true; data: TipoDocumentoBancario }>(
    ENDPOINTS.tesoreria.tiposDocumento.byId(id),
    data,
  )
  return unwrap(res)
}

// No hay DELETE real para este catálogo — la única acción destructiva es deshabilitar.
export async function disableTipoDocumento(id: string) {
  const res = await client.post<{ success: true; data: TipoDocumentoBancario }>(
    ENDPOINTS.tesoreria.tiposDocumento.disable(id),
    {},
  )
  return unwrap(res)
}

// ─── Emisiones (egresos) ────────────────────────────────────────────────────

export interface ListEmisionesParams extends PaginationParams {
  cuentaBancaria?: string
  tipoDocumento?: string
  beneficiario?: string
  fromDate?: string
  toDate?: string
  estado?: TesoreriaEstado
}

export async function listEmisiones(params?: ListEmisionesParams) {
  const res = await client.get<PaginatedResponse<TreasuryTransaction>>(
    ENDPOINTS.tesoreria.emisiones.list,
    { params },
  )
  return unwrapPaginated(res)
}

export async function getEmision(id: string) {
  const res = await client.get<{ success: true; data: TreasuryTransaction }>(
    ENDPOINTS.tesoreria.emisiones.byId(id),
  )
  return unwrap(res)
}

export async function createEmision(data: CreateEmisionDto) {
  const res = await client.post<{ success: true; data: TreasuryTransaction }>(
    ENDPOINTS.tesoreria.emisiones.list,
    data,
  )
  return unwrap(res)
}

/** Solo cabecera de un borrador: descripcion, nota, referencias, branch, department. */
export async function updateEmisionCabecera(id: string, data: UpdateEmisionDto) {
  const res = await client.put<{ success: true; data: TreasuryTransaction }>(
    ENDPOINTS.tesoreria.emisiones.byId(id),
    data,
  )
  return unwrap(res)
}

export async function submitEmision(id: string) {
  const res = await client.post<{ success: true; data: TreasuryTransaction }>(
    ENDPOINTS.tesoreria.emisiones.submit(id),
    {},
  )
  return unwrap(res)
}

export async function cancelEmision(id: string) {
  const res = await client.post<{ success: true; data: TreasuryTransaction }>(
    ENDPOINTS.tesoreria.emisiones.cancel(id),
    {},
  )
  return unwrap(res)
}

/** Preview de los asientos contables (GL) que se generarían al someter esta emisión — solo
 *  funciona mientras siga en Draft, no somete ni persiste nada. */
export async function previewAsientosEmision(id: string) {
  const res = await client.get<{ success: true; data: AsientoPreviewRow[] }>(
    ENDPOINTS.tesoreria.emisiones.previewAsientos(id),
  )
  return unwrap(res)
}

export async function getEmisionesPendientes(supplierId: string) {
  const res = await client.get<{ success: true; data: TesoreriaPendienteFactura[] }>(
    ENDPOINTS.tesoreria.emisiones.pendientes(supplierId),
  )
  return unwrap(res)
}

export interface SiguienteChequeResult {
  ultimoCheque: string | null
  siguienteSugerido: string | null
}

export async function getSiguienteCheque(cuentaBancaria: string) {
  const res = await client.get<{ success: true; data: SiguienteChequeResult }>(
    ENDPOINTS.tesoreria.emisiones.siguienteCheque,
    { params: { cuentaBancaria } },
  )
  return unwrap(res)
}

/**
 * Descarga en un Blob URL el PDF del comprobante de una Emisión sometida. El backend decide
 * internamente si usa el motor nativo de ERPNext (Payment Entry + chequePrintTemplate) o el
 * comprobante genérico — el frontend solo muestra lo que reciba.
 *
 * Nota técnica: con `responseType: 'blob'`, si el backend responde un error, axios entrega
 * `error.response.data` como Blob (no como JSON), así que el interceptor global de client.ts NO
 * puede extraer el mensaje real. Por eso este helper intercepta el error acá mismo y lo convierte
 * a un ApiError normal antes de relanzarlo, en vez de dejar que se pierda como "Error desconocido".
 */
export async function getEmisionPdfBlobUrl(id: string): Promise<string> {
  try {
    const res = await client.get<Blob>(ENDPOINTS.tesoreria.emisiones.imprimir(id), {
      responseType: 'blob',
    })
    return URL.createObjectURL(res.data)
  } catch (err) {
    throw await normalizeBlobError(err)
  }
}

async function normalizeBlobError(err: unknown): Promise<ApiError> {
  if (err instanceof Blob) {
    try {
      const text = await err.text()
      const parsed = JSON.parse(text) as { error?: ApiError; message?: string }
      if (parsed.error) return parsed.error
      if (parsed.message) return { code: 'BAD_REQUEST', message: parsed.message, statusCode: 400 }
    } catch {
      // el cuerpo no era JSON — cae al mensaje genérico de abajo
    }
  }
  if (err && typeof err === 'object' && 'message' in err) {
    return err as ApiError
  }
  return { code: 'UNKNOWN_ERROR', message: 'No se pudo generar el PDF', statusCode: 0 }
}

// ─── Depósitos (ingresos) ───────────────────────────────────────────────────

export interface ListDepositosParams extends PaginationParams {
  cuentaBancaria?: string
  tipoDocumento?: string
  origen?: string
  fromDate?: string
  toDate?: string
  estado?: TesoreriaEstado
}

export async function listDepositos(params?: ListDepositosParams) {
  const res = await client.get<PaginatedResponse<TreasuryTransaction>>(
    ENDPOINTS.tesoreria.depositos.list,
    { params },
  )
  return unwrapPaginated(res)
}

export async function getDeposito(id: string) {
  const res = await client.get<{ success: true; data: TreasuryTransaction }>(
    ENDPOINTS.tesoreria.depositos.byId(id),
  )
  return unwrap(res)
}

export async function createDeposito(data: CreateDepositoDto) {
  const res = await client.post<{ success: true; data: TreasuryTransaction }>(
    ENDPOINTS.tesoreria.depositos.list,
    data,
  )
  return unwrap(res)
}

/** Solo cabecera de un borrador: descripcion, nota, referencias, branch, department. */
export async function updateDepositoCabecera(id: string, data: UpdateDepositoDto) {
  const res = await client.put<{ success: true; data: TreasuryTransaction }>(
    ENDPOINTS.tesoreria.depositos.byId(id),
    data,
  )
  return unwrap(res)
}

export async function submitDeposito(id: string) {
  const res = await client.post<{ success: true; data: TreasuryTransaction }>(
    ENDPOINTS.tesoreria.depositos.submit(id),
    {},
  )
  return unwrap(res)
}

export async function cancelDeposito(id: string) {
  const res = await client.post<{ success: true; data: TreasuryTransaction }>(
    ENDPOINTS.tesoreria.depositos.cancel(id),
    {},
  )
  return unwrap(res)
}

/** Preview de los asientos contables (GL) que se generarían al someter este depósito — solo
 *  funciona mientras siga en Draft, no somete ni persiste nada. */
export async function previewAsientosDeposito(id: string) {
  const res = await client.get<{ success: true; data: AsientoPreviewRow[] }>(
    ENDPOINTS.tesoreria.depositos.previewAsientos(id),
  )
  return unwrap(res)
}

/** partyId puede ser un Customer o un Supplier — `tipo` desambigua contra qué doctype liquidar. */
export async function getDepositosPendientes(partyId: string, tipo: 'Customer' | 'Supplier') {
  const res = await client.get<{ success: true; data: TesoreriaPendienteFactura[] }>(
    ENDPOINTS.tesoreria.depositos.pendientes(partyId),
    { params: { tipo } },
  )
  return unwrap(res)
}

// ─── Transferencias Internas ────────────────────────────────────────────────

export interface ListTransferenciasInternasParams extends PaginationParams {
  /** Solo filtra por cuenta ORIGEN — el destino no se puede filtrar en v1. */
  cuentaBancaria?: string
  fromDate?: string
  toDate?: string
  estado?: TesoreriaEstado
}

export async function listTransferenciasInternas(params?: ListTransferenciasInternasParams) {
  const res = await client.get<PaginatedResponse<TreasuryTransaction>>(
    ENDPOINTS.tesoreria.transferenciasInternas.list,
    { params },
  )
  return unwrapPaginated(res)
}

export async function getTransferenciaInterna(id: string) {
  const res = await client.get<{ success: true; data: TreasuryTransaction }>(
    ENDPOINTS.tesoreria.transferenciasInternas.byId(id),
  )
  return unwrap(res)
}

export async function createTransferenciaInterna(data: CreateTransferenciaInternaDto) {
  const res = await client.post<{ success: true; data: TreasuryTransaction }>(
    ENDPOINTS.tesoreria.transferenciasInternas.list,
    data,
  )
  return unwrap(res)
}

/** Solo cabecera de un borrador: descripcion, nota, referencias. */
export async function updateTransferenciaInternaCabecera(id: string, data: UpdateTransferenciaInternaDto) {
  const res = await client.put<{ success: true; data: TreasuryTransaction }>(
    ENDPOINTS.tesoreria.transferenciasInternas.byId(id),
    data,
  )
  return unwrap(res)
}

export async function submitTransferenciaInterna(id: string) {
  const res = await client.post<{ success: true; data: TreasuryTransaction }>(
    ENDPOINTS.tesoreria.transferenciasInternas.submit(id),
    {},
  )
  return unwrap(res)
}

export async function cancelTransferenciaInterna(id: string) {
  const res = await client.post<{ success: true; data: TreasuryTransaction }>(
    ENDPOINTS.tesoreria.transferenciasInternas.cancel(id),
    {},
  )
  return unwrap(res)
}

/** Preview de los asientos contables (GL) que se generarían al someter esta transferencia — solo
 *  funciona mientras siga en Draft, no somete ni persiste nada. */
export async function previewAsientosTransferenciaInterna(id: string) {
  const res = await client.get<{ success: true; data: AsientoPreviewRow[] }>(
    ENDPOINTS.tesoreria.transferenciasInternas.previewAsientos(id),
  )
  return unwrap(res)
}

// ─── Movimientos (libro de banco) ───────────────────────────────────────────
// Vista de solo lectura sobre GL Entry — cuentaBancaria es requerido en ambos endpoints.

export interface MovimientosParams {
  cuentaBancaria: string
  fromDate?: string
  toDate?: string
  limit?: number
  offset?: number
}

export async function getMovimientos(params: MovimientosParams) {
  const res = await client.get<{ success: true; data: MovimientoBancario[]; meta: MovimientosMeta }>(
    ENDPOINTS.tesoreria.movimientos.list,
    { params },
  )
  return { items: res.data.data, meta: res.data.meta }
}

export async function getResumenMovimientos(params: { cuentaBancaria: string; fromDate?: string; toDate?: string }) {
  const res = await client.get<{ success: true; data: ResumenMovimientos }>(
    ENDPOINTS.tesoreria.movimientos.resumen,
    { params },
  )
  return unwrap(res)
}

// ─── Plantillas de Impresión de Cheque ──────────────────────────────────────

export async function listChequePrintTemplates(params?: PaginationParams) {
  const res = await client.get<PaginatedResponse<ChequePrintTemplate>>(
    ENDPOINTS.tesoreria.chequePrintTemplates.list,
    { params },
  )
  return unwrapPaginated(res)
}

export async function getChequePrintTemplate(id: string) {
  const res = await client.get<{ success: true; data: ChequePrintTemplate }>(
    ENDPOINTS.tesoreria.chequePrintTemplates.byId(id),
  )
  return unwrap(res)
}

export async function createChequePrintTemplate(data: CreateChequePrintTemplateDto) {
  const res = await client.post<{ success: true; data: ChequePrintTemplate }>(
    ENDPOINTS.tesoreria.chequePrintTemplates.list,
    data,
  )
  return unwrap(res)
}

export async function updateChequePrintTemplate(id: string, data: UpdateChequePrintTemplateDto) {
  const res = await client.put<{ success: true; data: ChequePrintTemplate }>(
    ENDPOINTS.tesoreria.chequePrintTemplates.byId(id),
    data,
  )
  return unwrap(res)
}

export async function regenerarChequePrintTemplate(id: string) {
  const res = await client.post<{ success: true; data: ChequePrintTemplate }>(
    ENDPOINTS.tesoreria.chequePrintTemplates.regenerar(id),
    {},
  )
  return unwrap(res)
}
