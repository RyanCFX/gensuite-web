import { client, unwrap } from './client'
import { ENDPOINTS } from './endpoints'
import { queryClient, registrarVersionReferencia } from './queryClient'
import type { EcfConfig, FacturacionConfig, Usuario, UsuarioAlmacenesPermitidos, UsuarioSucursales } from './types'

// GET /me/bootstrap: permisos + acceso + features + config de facturación + config e-CF + datos del
// propio usuario en UNA respuesta (con ETag). Reemplaza el arranque de 5-6 GET. `facturacion`/`ecf`
// vienen null sin permiso de config; un bloque que falla viene null y su error en `errores`.

export interface MeBootstrap {
  permisos: unknown
  acceso: unknown | null
  features: unknown
  facturacion: FacturacionConfig | null
  ecf: EcfConfig | null
  usuario: {
    email: string
    maxDiscountPct: number
    branches: string[]
    defaultBranch: string | null
    allBranches: boolean
    almacenesPermitidos: string[]
  } | null
  referenceVersion: string
  errores: Record<string, unknown>
}

let enCurso: Promise<MeBootstrap | null> | null = null

/** Una sola llamada compartida por quienes arrancan a la vez (permisos y features). Devuelve null si
 *  el backend no lo expone o falla: el llamador cae a los endpoints individuales de siempre. */
export function cargarBootstrap(): Promise<MeBootstrap | null> {
  if (enCurso) return enCurso
  enCurso = (async () => {
    try {
      const res = await client.get<{ success: true; data: MeBootstrap }>(ENDPOINTS.me.bootstrap)
      const data = unwrap(res)
      sembrarCache(data)
      return data
    } catch {
      return null
    } finally {
      // Se libera en el siguiente tick para que quien llegue en el mismo montaje reutilice el resultado.
      setTimeout(() => { enCurso = null }, 0)
    }
  })()
  return enCurso
}

/** Siembra la caché de React Query con lo que ya trajo el bootstrap, con las mismas claves que usan
 *  las pantallas: así no repiten esas consultas. */
function sembrarCache(b: MeBootstrap) {
  registrarVersionReferencia(b.referenceVersion)
  if (b.facturacion) queryClient.setQueryData(['facturacion-config'], b.facturacion)
  if (b.ecf) queryClient.setQueryData(['ecf-config'], b.ecf)
  if (b.usuario) {
    const email = b.usuario.email
    // Los formularios solo leen `maxDiscountPct` de `currentUser`.
    queryClient.setQueryData(['currentUser', email], { email, maxDiscountPct: b.usuario.maxDiscountPct } as Usuario)
    queryClient.setQueryData<UsuarioSucursales>(['usuarioSucursales', email], {
      branches: b.usuario.branches,
      defaultBranch: b.usuario.defaultBranch,
    })
    queryClient.setQueryData<UsuarioAlmacenesPermitidos>(['usuarioAlmacenesPermitidos', email], {
      warehouses: b.usuario.almacenesPermitidos,
    })
  }
}
