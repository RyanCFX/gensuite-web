// Relaciones Comerciales (B2B) — docs/tasks/relaciones_comerciales/*.md
//
// Nota sobre el shape de las respuestas: los handoffs de cada fase muestran ejemplos reales
// verificados en vivo. Los endpoints de LISTADO paginado (`GET /relaciones`,
// `GET /relaciones/transacciones`) usan el sobre estándar `{ success, data, meta }` del resto del
// BFF. El resto (detalle, acciones POST/PUT, listas sin paginar como candidatos/documentos
// enlazables) devuelve el recurso directamente, sin sobre. `unwrapAny` tolera ambos shapes para no
// romper si el backend termina envolviendo algo que hoy no envuelve.
import { client, unwrapPaginated } from './client'
import { ENDPOINTS } from './endpoints'
import type {
  PaginatedResponse,
  BuscarEmpresaRelacionResponse,
  InvitacionRelacion,
  CrearInvitacionRelacionDto,
  RechazarInvitacionRelacionDto,
  AceptarInvitacionRelacionDto,
  ListInvitacionesRelacionParams,
  InvitacionPublicaResumen,
  AceptarInvitacionPublicaDto,
  RechazarInvitacionPublicaDto,
  BloqueoComercial,
  CrearBloqueoDto,
  RelacionComercialListItem,
  RelacionComercialDetalle,
  ActualizarConfiguracionRelacionDto,
  TerminosComercialesDto,
  MaestrosCandidatosRelacion,
  AdoptarMaestrosDto,
  TransaccionB2BListItem,
  TransaccionB2BDetalle,
  ListTransaccionesParams,
  ResultadoMapeo,
  ConfirmarMapeoDto,
  ConfirmarMapeoResponse,
  CrearArticuloDesdeSocioDto,
  CrearArticuloDesdeSocioResponse,
  FilaMapeoAcumulado,
  EnviarVentaDto,
  AceptarTransaccionDto,
  RechazarTransaccionDto,
  EnviarAProveedorDto,
  EstadoSocioCompraResponse,
  DiffTransaccion,
  IgualarBorradorDto,
  IgualarBorradorResponse,
  IgualarConEnmiendaDto,
  IgualarConEnmiendaResponse,
  DocumentoEnlazable,
  EnlazarYEnviarDto,
  EnlazarTransaccionDto,
  EnlazarTransaccionResponse,
  PaginationParams,
} from './types'

function unwrapAny<T>(res: { data: unknown }): T {
  const body = res.data as unknown
  if (body && typeof body === 'object' && 'success' in (body as Record<string, unknown>) && 'data' in (body as Record<string, unknown>)) {
    return (body as { data: T }).data
  }
  return body as T
}

// ─── Directorio (Fase 03) ───────────────────────────────────────────────────

export async function buscarEmpresaPorRnc(rnc: string) {
  const res = await client.post<{ success: true; data: BuscarEmpresaRelacionResponse }>(
    ENDPOINTS.relaciones.directorioBuscar,
    { rnc },
  )
  return unwrapAny<BuscarEmpresaRelacionResponse>(res)
}

// ─── Invitaciones (Fase 04) ─────────────────────────────────────────────────

export async function crearInvitacionRelacion(data: CrearInvitacionRelacionDto) {
  const res = await client.post(ENDPOINTS.relaciones.invitaciones.list, data)
  return unwrapAny<InvitacionRelacion>(res)
}

export async function listInvitacionesRelacion(params?: ListInvitacionesRelacionParams) {
  const res = await client.get(ENDPOINTS.relaciones.invitaciones.list, { params })
  return unwrapAny<InvitacionRelacion[]>(res)
}

export async function getInvitacionRelacion(id: string) {
  const res = await client.get(ENDPOINTS.relaciones.invitaciones.byId(id))
  return unwrapAny<InvitacionRelacion>(res)
}

export async function cancelarInvitacionRelacion(id: string) {
  const res = await client.post(ENDPOINTS.relaciones.invitaciones.cancelar(id))
  return unwrapAny<InvitacionRelacion>(res)
}

export async function reenviarInvitacionRelacion(id: string) {
  const res = await client.post(ENDPOINTS.relaciones.invitaciones.reenviar(id))
  return unwrapAny<InvitacionRelacion>(res)
}

export async function aceptarInvitacionRelacion(id: string, data?: AceptarInvitacionRelacionDto) {
  const res = await client.post(ENDPOINTS.relaciones.invitaciones.aceptar(id), data ?? {})
  return unwrapAny<InvitacionRelacion>(res)
}

export async function rechazarInvitacionRelacion(id: string, data?: RechazarInvitacionRelacionDto) {
  const res = await client.post(ENDPOINTS.relaciones.invitaciones.rechazar(id), data ?? {})
  return unwrapAny<InvitacionRelacion>(res)
}

// Pantalla pública (sin login)

export async function getInvitacionRelacionPorToken(token: string) {
  const res = await client.get(ENDPOINTS.relaciones.invitaciones.porToken(token))
  return unwrapAny<InvitacionPublicaResumen>(res)
}

export async function aceptarInvitacionRelacionPorToken(token: string, data?: AceptarInvitacionPublicaDto) {
  const res = await client.post(ENDPOINTS.relaciones.invitaciones.porTokenAceptar(token), data ?? {})
  return unwrapAny<InvitacionPublicaResumen>(res)
}

export async function rechazarInvitacionRelacionPorToken(token: string, data?: RechazarInvitacionPublicaDto) {
  const res = await client.post(ENDPOINTS.relaciones.invitaciones.porTokenRechazar(token), data ?? {})
  return unwrapAny<InvitacionPublicaResumen>(res)
}

// ─── Bloqueos ────────────────────────────────────────────────────────────────

export async function listBloqueosComerciales(incluirLevantados = false) {
  const res = await client.get(ENDPOINTS.relaciones.bloqueos.list, { params: { incluirLevantados } })
  return unwrapAny<BloqueoComercial[]>(res)
}

export async function crearBloqueoComercial(data: CrearBloqueoDto) {
  const res = await client.post(ENDPOINTS.relaciones.bloqueos.list, data)
  return unwrapAny<BloqueoComercial>(res)
}

export async function levantarBloqueoComercial(id: string) {
  const res = await client.post(ENDPOINTS.relaciones.bloqueos.levantar(id))
  return unwrapAny<BloqueoComercial>(res)
}

// ─── Relaciones — activación y configuración (Fase 05) ──────────────────────

export type ListRelacionesParams = PaginationParams

export async function listRelacionesComerciales(params?: ListRelacionesParams) {
  const res = await client.get<PaginatedResponse<RelacionComercialListItem>>(ENDPOINTS.relaciones.list, {
    params: { limit: 20, offset: 0, ...params },
  })
  return unwrapPaginated(res)
}

export async function getRelacionComercial(id: string) {
  const res = await client.get(ENDPOINTS.relaciones.byId(id))
  return unwrapAny<RelacionComercialDetalle>(res)
}

export async function actualizarConfiguracionRelacion(id: string, data: ActualizarConfiguracionRelacionDto) {
  const res = await client.put(ENDPOINTS.relaciones.configuracion(id), data)
  return unwrapAny<RelacionComercialDetalle>(res)
}

export async function actualizarTerminosRelacion(id: string, data: TerminosComercialesDto) {
  const res = await client.put(ENDPOINTS.relaciones.terminos(id), data)
  return unwrapAny<RelacionComercialDetalle>(res)
}

export async function reintentarActivacionRelacion(id: string) {
  const res = await client.post(ENDPOINTS.relaciones.reintentarActivacion(id))
  return unwrapAny<RelacionComercialDetalle>(res)
}

export async function getMaestrosCandidatosRelacion(id: string) {
  const res = await client.get(ENDPOINTS.relaciones.maestrosCandidatos(id))
  return unwrapAny<MaestrosCandidatosRelacion>(res)
}

export async function adoptarMaestrosRelacion(id: string, data: AdoptarMaestrosDto) {
  const res = await client.post(ENDPOINTS.relaciones.adoptarMaestros(id), data)
  return unwrapAny<RelacionComercialDetalle>(res)
}

export async function suspenderRelacion(id: string) {
  const res = await client.post(ENDPOINTS.relaciones.suspender(id))
  return unwrapAny<RelacionComercialDetalle>(res)
}

export async function reactivarRelacion(id: string) {
  const res = await client.post(ENDPOINTS.relaciones.reactivar(id))
  return unwrapAny<RelacionComercialDetalle>(res)
}

export async function terminarRelacion(id: string) {
  const res = await client.post(ENDPOINTS.relaciones.terminar(id))
  return unwrapAny<RelacionComercialDetalle>(res)
}

// ─── Mapeo de catálogo (Fase 07) ────────────────────────────────────────────

export async function getMapeoTransaccion(uid: string) {
  const res = await client.get(ENDPOINTS.relaciones.transacciones.mapeo(uid))
  return unwrapAny<ResultadoMapeo>(res)
}

export async function confirmarMapeoTransaccion(uid: string, data: ConfirmarMapeoDto) {
  const res = await client.put(ENDPOINTS.relaciones.transacciones.mapeo(uid), data)
  return unwrapAny<ConfirmarMapeoResponse>(res)
}

export async function crearArticuloDesdeSocio(uid: string, data: CrearArticuloDesdeSocioDto) {
  const res = await client.post(ENDPOINTS.relaciones.transacciones.crearArticulo(uid), data)
  return unwrapAny<CrearArticuloDesdeSocioResponse>(res)
}

export async function getMapeoAcumuladoRelacion(id: string) {
  const res = await client.get(ENDPOINTS.relaciones.mapeoAcumulado(id))
  return unwrapAny<{ filas: FilaMapeoAcumulado[] }>(res)
}

export async function actualizarMapeoAcumuladoRelacion(id: string, filas: FilaMapeoAcumulado[]) {
  const res = await client.put(ENDPOINTS.relaciones.mapeoAcumulado(id), { filas })
  return unwrapAny<{ filas: FilaMapeoAcumulado[] }>(res)
}

// ─── Transacciones — bandeja (Fase 06) ──────────────────────────────────────

export async function listTransaccionesB2B(params?: ListTransaccionesParams) {
  const res = await client.get<PaginatedResponse<TransaccionB2BListItem>>(ENDPOINTS.relaciones.transacciones.list, {
    params: { limit: 20, offset: 0, ...params },
  })
  return unwrapPaginated(res)
}

export async function getTransaccionB2B(uid: string) {
  const res = await client.get(ENDPOINTS.relaciones.transacciones.byId(uid))
  return unwrapAny<TransaccionB2BDetalle>(res)
}

export async function reintentarTransaccionB2B(uid: string) {
  const res = await client.post(ENDPOINTS.relaciones.transacciones.reintentar(uid))
  return unwrapAny<TransaccionB2BDetalle>(res)
}

export async function cancelarTransaccionB2B(uid: string) {
  const res = await client.post(ENDPOINTS.relaciones.transacciones.cancelar(uid))
  return unwrapAny<TransaccionB2BDetalle>(res)
}

// ─── Flujo de venta (Fase 08) ────────────────────────────────────────────────

export async function enviarVentaASocio(invoiceId: string, data?: EnviarVentaDto) {
  const res = await client.post(ENDPOINTS.relaciones.ventas.enviar(invoiceId), data ?? {})
  return unwrapAny<TransaccionB2BDetalle>(res)
}

export async function aceptarTransaccionB2B(uid: string, data: AceptarTransaccionDto) {
  const res = await client.post(ENDPOINTS.relaciones.transacciones.aceptar(uid), data)
  return unwrapAny<Record<string, unknown>>(res)
}

export async function rechazarTransaccionB2B(uid: string, data: RechazarTransaccionDto) {
  const res = await client.post(ENDPOINTS.relaciones.transacciones.rechazar(uid), data)
  return unwrapAny<{ success: true }>(res)
}

// ─── Flujo de compra (Fase 09) ───────────────────────────────────────────────

export async function enviarCompraAProveedor(id: string, data?: EnviarAProveedorDto) {
  const res = await client.post(ENDPOINTS.compras.enviarAProveedor(id), data ?? {})
  return unwrapAny<TransaccionB2BDetalle>(res)
}

export async function cancelarEnvioCompra(id: string) {
  const res = await client.post(ENDPOINTS.compras.cancelarEnvio(id))
  return unwrapAny<{ success: true }>(res)
}

export async function getEstadoSocioCompra(id: string) {
  const res = await client.get(ENDPOINTS.compras.estadoSocio(id))
  return unwrapAny<EstadoSocioCompraResponse>(res)
}

// ─── Diferencias e Igualar (Fase 10) ─────────────────────────────────────────

export async function getDiffTransaccion(uid: string) {
  const res = await client.get(ENDPOINTS.relaciones.transacciones.diff(uid))
  return unwrapAny<DiffTransaccion>(res)
}

export async function igualarBorradorTransaccion(uid: string, data?: IgualarBorradorDto) {
  const res = await client.post(ENDPOINTS.relaciones.transacciones.igualar(uid), data ?? {})
  return unwrapAny<IgualarBorradorResponse>(res)
}

export async function igualarConEnmiendaTransaccion(uid: string, data: IgualarConEnmiendaDto) {
  const res = await client.post(ENDPOINTS.relaciones.transacciones.igualarConEnmienda(uid), data)
  return unwrapAny<IgualarConEnmiendaResponse>(res)
}

// ─── Enlazar documentos existentes (Fase 11) ─────────────────────────────────

export async function getDocumentosEnlazables(id: string, params?: { desde?: string; hasta?: string }) {
  const res = await client.get(ENDPOINTS.relaciones.documentosEnlazables(id), { params })
  return unwrapAny<DocumentoEnlazable[]>(res)
}

export async function enlazarYEnviarCompra(id: string, data: EnlazarYEnviarDto) {
  const res = await client.post(ENDPOINTS.compras.enlazarYEnviar(id), data)
  return unwrapAny<TransaccionB2BDetalle>(res)
}

export async function getCandidatosEnlaceTransaccion(uid: string, params?: { desde?: string; hasta?: string }) {
  const res = await client.get(ENDPOINTS.relaciones.transacciones.candidatosEnlace(uid), { params })
  return unwrapAny<DocumentoEnlazable[]>(res)
}

export async function enlazarTransaccionB2B(uid: string, data: EnlazarTransaccionDto) {
  const res = await client.post(ENDPOINTS.relaciones.transacciones.enlazar(uid), data)
  return unwrapAny<EnlazarTransaccionResponse>(res)
}
