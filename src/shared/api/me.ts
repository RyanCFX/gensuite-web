import { client, unwrap } from './client'
import { ENDPOINTS } from './endpoints'
import type {
  DocumentPermissions, MeFeatures, MePermissions, MeProfile, PatchMeProfileDto, ChangeMyPasswordDto, ConfiguracionOperativa,
  MfaFactor, TotpEnrollResult, TotpConfirmDto, TotpConfirmResult, LinkedIdentity,
} from './types'

/**
 * `GET /me/permissions` no tiene JSON Schema documentado en openapi.json (solo se menciona
 * `acciones`/`doctypes`/`roles` en prosa) y `vertical` no aparece en absoluto en el schema de
 * esta ruta — normalizamos defensivamente en vez de asumir la forma, igual que ya hace
 * `getPermisosCatalogo()` en `./permisos.ts`. Cualquier valor de `vertical` que no sea
 * literalmente "farmacia" (incluido ausente) se trata como "general".
 */
export function normalizeMePermissions(raw: unknown): MePermissions {
  const d = (raw ?? {}) as Record<string, unknown>
  return {
    email: typeof d.email === 'string' ? d.email : '',
    roles: Array.isArray(d.roles) ? d.roles.filter((r): r is string => typeof r === 'string') : [],
    doctypes: d.doctypes && typeof d.doctypes === 'object' ? (d.doctypes as MePermissions['doctypes']) : {},
    acciones: d.acciones && typeof d.acciones === 'object' ? (d.acciones as Record<string, boolean>) : {},
    vertical: d.vertical === 'farmacia' ? 'farmacia' : 'general',
  }
}

export async function getMePermissions(): Promise<MePermissions> {
  const res = await client.get<{ success: true; data: unknown }>(ENDPOINTS.me.permissions)
  return normalizeMePermissions(res.data.data)
}

export async function getMePermissionsForDoc(doctype: string, name: string): Promise<DocumentPermissions> {
  const res = await client.get<{ success: true; data: unknown }>(ENDPOINTS.me.permissionsByDoc(doctype, name))
  const d = (res.data.data ?? {}) as Record<string, unknown>
  return {
    doctype: typeof d.doctype === 'string' ? d.doctype : doctype,
    name: typeof d.name === 'string' ? d.name : name,
    permisos: d.permisos && typeof d.permisos === 'object' ? (d.permisos as DocumentPermissions['permisos']) : {},
  }
}

// ─── Features por tenant — docs/tasks/80_features_tenant_discriminacion_ui.md §3 ─────────
// `GET /me/features` tampoco tiene JSON Schema en openapi.json (solo prosa en la descripción
// del endpoint) — se normaliza defensivamente igual que los permisos. Garantías que SÍ se
// asumen (las da el backend): `features` trae booleanos por clave, `reportesHabilitados` es un
// array de claves encendidas, `limites` trae contadores ya calculados.

const FEATURE_KEYS = [
  'compras', 'comprasOrdenes', 'comprasSolicitudes', 'devolucionesCompras', 'gastos',
  'proveedores', 'caja', 'contabilidad', 'cuentasPorCobrar', 'cuentasPorPagar', 'tesoreria',
  'inventario', 'productos', 'servicios', 'relacionesComerciales', 'cotizaciones', 'despacho',
  'delivery', 'devoluciones', 'notasCredito', 'notasDebito', 'pedidos',
  // Numeración de documentos — docs/tasks/PROMPT_NUMERACION_DOCUMENTOS_FRONTEND.md §4.6.
  // Tratar como `false` si faltan (tenants o backends más viejos).
  'numeracionCliente', 'numeracionCotizacion', 'numeracionPedido', 'numeracionDespacho',
  'numeracionFacturaVenta', 'numeracionNotaCreditoVenta', 'numeracionProveedor',
  'numeracionSolicitudCompra', 'numeracionSolicitudCotizacion', 'numeracionCotizacionProveedor',
  'numeracionOrdenCompra', 'numeracionRecepcionCompra', 'numeracionFacturaCompra',
  'numeracionMovimientoInventario', 'numeracionAjusteInventario', 'numeracionLote',
  'numeracionPago', 'numeracionAsientoDiario', 'numeracionSolicitudPago', 'numeracionEmpleado',
  'numeracionReclamoGastos', 'numeracionActivo',
] as const

export function normalizeMeFeatures(raw: unknown): MeFeatures {
  const d = (raw ?? {}) as Record<string, unknown>
  const rawFeatures = (d.features ?? {}) as Record<string, unknown>
  const features = {} as MeFeatures['features']
  for (const key of FEATURE_KEYS) {
    // El backend garantiza booleano siempre — cualquier otra cosa se trata como apagado
    // (fail-closed en esta capa; ProtectedRoute hace fail-open mientras carga).
    features[key] = rawFeatures[key] === true
  }
  const reportes = Array.isArray(d.reportesHabilitados)
    ? (d.reportesHabilitados as unknown[]).filter((r): r is MeFeatures['reportesHabilitados'][number] => typeof r === 'string')
    : []
  const rawLimites = (d.limites ?? {}) as Record<string, unknown>
  const numOrNull = (v: unknown): number | null =>
    typeof v === 'number' && Number.isFinite(v) ? v : null
  const numOrZero = (v: unknown): number =>
    typeof v === 'number' && Number.isFinite(v) ? v : 0
  return {
    features,
    reportesHabilitados: reportes,
    // Acceso adicional (docs/tasks/PROMPT_FEATURES_ADICIONALES_FRONTEND.md §2.1): lista
    // informativa SOLO para la UI — nunca derivar acceso de acá. Defensivo: ausente → [].
    featuresAdicionales: normalizeFeaturesAdicionales(d.featuresAdicionales),
    limites: {
      maxUsuarios: numOrNull(rawLimites.maxUsuarios),
      maxSucursales: numOrNull(rawLimites.maxSucursales),
      usuariosActuales: numOrZero(rawLimites.usuariosActuales),
      sucursalesActuales: numOrZero(rawLimites.sucursalesActuales),
    },
  }
}

/** Normaliza `featuresAdicionales` (§2.1): entradas `{key,nombre,tipo,origen,expiraEn}`.
 *  Descarta entradas sin `key` string; `expiraEn` solo se conserva si es string ISO o null. */
export function normalizeFeaturesAdicionales(raw: unknown): MeFeatures['featuresAdicionales'] {
  if (!Array.isArray(raw)) return []
  const out: MeFeatures['featuresAdicionales'] = []
  for (const item of raw) {
    if (typeof item !== 'object' || item === null) continue
    const r = item as Record<string, unknown>
    if (typeof r.key !== 'string' || !r.key) continue
    const expiraEn = r.expiraEn
    out.push({
      key: r.key,
      nombre: typeof r.nombre === 'string' && r.nombre ? r.nombre : r.key,
      tipo: typeof r.tipo === 'string' ? r.tipo : 'modulo',
      origen: typeof r.origen === 'string' ? r.origen : 'adicional',
      expiraEn: typeof expiraEn === 'string' || expiraEn === null ? (expiraEn as string | null) : null,
    })
  }
  return out
}

export async function getMeFeatures(): Promise<MeFeatures> {
  const res = await client.get<{ success: true; data: unknown }>(ENDPOINTS.me.features)
  return normalizeMeFeatures(res.data.data)
}

// ─── Perfil propio — docs/tasks/PROMPT_IDENTIDAD_GLOBAL_FRONTEND.md §7.1 ────────────────────

export async function getMeProfile(): Promise<MeProfile> {
  const res = await client.get<{ success: true; data: MeProfile }>(ENDPOINTS.me.profile)
  return unwrap(res)
}

export async function patchMeProfile(data: PatchMeProfileDto): Promise<Partial<MeProfile>> {
  const res = await client.patch<{ success: true; data: Partial<MeProfile> }>(ENDPOINTS.me.profile, data)
  return unwrap(res)
}

/** Revoca TODAS las demás sesiones (incluida la actual) — el caller debe forzar logout completo
 *  del lado del cliente después de esto, no solo confiar en que el `access_token` expire (§7.2). */
export async function changeMyPassword(data: ChangeMyPasswordDto): Promise<{ message: string }> {
  const res = await client.post<{ success: true; data: { message: string } }>(ENDPOINTS.me.password, data)
  return unwrap(res)
}

// ─── 2FA — mi perfil de seguridad (§5.3) ─────────────────────────────────────────────────────

export async function listMyMfaFactors(): Promise<MfaFactor[]> {
  const res = await client.get<{ success: true; data: MfaFactor[] }>(ENDPOINTS.me.mfaFactors)
  return unwrap(res)
}

export async function enrollTotp(label?: string): Promise<TotpEnrollResult> {
  const res = await client.post<{ success: true; data: TotpEnrollResult }>(ENDPOINTS.me.mfaTotp, label ? { label } : undefined)
  return unwrap(res)
}

export async function confirmTotp(data: TotpConfirmDto): Promise<TotpConfirmResult> {
  const res = await client.post<{ success: true; data: TotpConfirmResult }>(ENDPOINTS.me.mfaTotpConfirm, data)
  return unwrap(res)
}

export async function enableEmailMfa(): Promise<{ message: string }> {
  const res = await client.post<{ success: true; data: { message: string } }>(ENDPOINTS.me.mfaEmail)
  return unwrap(res)
}

export async function deleteMfaFactor(factorId: string): Promise<{ message: string }> {
  const res = await client.delete<{ success: true; data: { message: string } }>(ENDPOINTS.me.mfaFactor(factorId))
  return unwrap(res)
}

// ─── Cuentas vinculadas (Google) — §8.4 ──────────────────────────────────────────────────────

export async function listMyIdentities(): Promise<LinkedIdentity[]> {
  const res = await client.get<{ success: true; data: LinkedIdentity[] }>(ENDPOINTS.me.identities)
  return unwrap(res)
}

export async function unlinkIdentity(identityId: string): Promise<{ message: string }> {
  const res = await client.delete<{ success: true; data: { message: string } }>(ENDPOINTS.me.identity(identityId))
  return unwrap(res)
}

// ─── Configuración operativa — docs/tasks/PROMPT_DELIVERY_FRONTEND.md §1/§7 ───
// `GET /me/configuracion-operativa`: lectura para TODOS los usuarios (facturación +
// eCF operativos). Claves ausentes se tratan como `false`/undefined.

/** Normaliza defensivamente: cualquier clave que falte se trata como false. */
export function normalizeConfiguracionOperativa(raw: unknown): ConfiguracionOperativa {
  const d = (raw ?? {}) as Record<string, unknown>
  // El BFF puede devolver `{ facturacion, ecf }` o el bloque plano — se aceptan ambas.
  const f = ((d.facturacion ?? d) ?? {}) as Record<string, unknown>
  const b = (v: unknown): boolean | undefined => (typeof v === 'boolean' ? v : undefined)
  return {
    usaModuloPos: b(f.usaModuloPos),
    flujoCobro: f.flujoCobro === 'directo' || f.flujoCobro === 'caja' ? f.flujoCobro : undefined,
    despachoHabilitado: b(f.despachoHabilitado),
    despachoFuturoHabilitado: b(f.despachoFuturoHabilitado),
    despachoFuturoBloqueaVenta: b(f.despachoFuturoBloqueaVenta),
    deliveryHabilitado: b(f.deliveryHabilitado),
    deliveryConfirmarEntregaConciliaCobro: b(f.deliveryConfirmarEntregaConciliaCobro),
    deliveryConciliarCobroConfirmaEntrega: b(f.deliveryConciliarCobroConfirmaEntrega),
    deliveryPermiteDiferencias: b(f.deliveryPermiteDiferencias),
  }
}

export async function getConfiguracionOperativa(): Promise<ConfiguracionOperativa> {
  const res = await client.get<{ success: true; data: unknown }>(ENDPOINTS.me.configuracionOperativa)
  return normalizeConfiguracionOperativa(res.data.data)
}
