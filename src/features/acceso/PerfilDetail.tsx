import { useMemo, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { RecargarButton } from '@/components/shared/RecargarButton'
import {
  getPerfilAcceso, getAccesoCatalogo, patchPerfilAcceso, putPerfilGrants,
} from '@/shared/api/acceso'
import type { ApiError } from '@/shared/api/types'
import { usePermissionsStore } from '@/stores/permissions.store'
import {
  estadoDesdeGrants,
  grantsDelArbol,
  type EstadoPantalla,
} from '@/shared/permissions/acceso'
import { ArbolPermisos } from './ArbolPermisos'

function apiMessage(err: unknown, fallback: string): string {
  return (err as ApiError)?.message ?? fallback
}

export function PerfilDetail({ perfilId, onBack }: { perfilId: string; onBack: () => void }) {
  const queryClient = useQueryClient()
  const [nombre, setNombre] = useState<string | null>(null)
  const [descripcion, setDescripcion] = useState<string | null>(null)
  const [estados, setEstados] = useState<Record<string, EstadoPantalla> | null>(null)
  const [motivo, setMotivo] = useState('')

  const perfilQuery = useQuery({
    queryKey: ['acceso-perfil', perfilId],
    queryFn: () => getPerfilAcceso(perfilId),
    retry: false,
  })
  const catalogoQuery = useQuery({
    queryKey: ['acceso-catalogo'],
    queryFn: () => getAccesoCatalogo(true),
    retry: false,
    staleTime: 60_000,
  })

  const perfil = perfilQuery.data
  const catalogo = catalogoQuery.data

  // Estado inicial del editor desde los grants guardados (una sola vez por perfil).
  const iniciales = useMemo(
    () => (catalogo && perfil ? estadoDesdeGrants(catalogo.modulos, perfil.grants) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- seed inicial al cargar
    [catalogo, perfil?.id],
  )
  const edicion = estados ?? iniciales
  const soloLectura = !!perfil?.esSistema

  const datosCambiados =
    perfil !== undefined &&
    ((nombre !== null && nombre !== perfil.nombre) || (descripcion !== null && (descripcion !== (perfil.descripcion ?? ''))))
  const grantsActuales = useMemo(
    () => (catalogo && edicion ? grantsDelArbol(catalogo.modulos, edicion) : []),
    [catalogo, edicion],
  )
  const grantsCambiados =
    perfil !== undefined &&
    JSON.stringify([...grantsActuales].sort((a, b) => a.clave.localeCompare(b.clave))) !==
      JSON.stringify([...perfil.grants].sort((a, b) => a.clave.localeCompare(b.clave)))

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!perfil) return
      if (datosCambiados) {
        await patchPerfilAcceso(perfil.id, {
          ...(nombre !== null && nombre !== perfil.nombre ? { nombre } : {}),
          ...(descripcion !== null && descripcion !== (perfil.descripcion ?? '') ? { descripcion } : {}),
        })
      }
      if (grantsCambiados) {
        await putPerfilGrants(perfil.id, grantsActuales, motivo.trim() || undefined)
      }
    },
    onSuccess: () => {
      toast.success('Perfil guardado')
      queryClient.invalidateQueries({ queryKey: ['acceso-perfil', perfilId] })
      queryClient.invalidateQueries({ queryKey: ['acceso-perfiles'] })
      // Si se editó el propio acceso, la UI lo refleja al instante (§2.1).
      usePermissionsStore.getState().refreshSilencioso()
      setMotivo('')
    },
    onError: (err) => toast.error(apiMessage(err, 'No se pudo guardar el perfil')),
  })

  if (perfilQuery.isLoading || catalogoQuery.isLoading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div className="skeleton-box" style={{ height: 28, width: '30%' }} />
        <div className="skeleton-box" style={{ height: 200, width: '100%' }} />
      </div>
    )
  }

  if (perfilQuery.isError) {
    return (
      <div>
        <button className="page-back-link" onClick={onBack} style={{ marginBottom: 12 }}>← Perfiles</button>
        <div className="inline-alert inline-alert-error">
          {apiMessage(perfilQuery.error, 'No se encontró el perfil: volvé a la lista.')}
        </div>
      </div>
    )
  }

  if (catalogoQuery.isError || !catalogo || !perfil || !edicion) {
    return (
      <div>
        <button className="page-back-link" onClick={onBack} style={{ marginBottom: 12 }}>← Perfiles</button>
        <div className="inline-alert inline-alert-error">
          {apiMessage(catalogoQuery.error, 'No se pudo cargar el catálogo de permisos.')}
        </div>
      </div>
    )
  }

  return (
    <div>
      <button className="page-back-link" onClick={onBack} style={{ marginBottom: 12 }}>← Perfiles</button>
      <div className="page-header">
        <div>
          <h1 className="page-title">
            {perfil.nombre}
            {perfil.esSistema && <span className="badge badge-info" style={{ marginLeft: 8 }}>Sistema</span>}
          </h1>
          <p className="page-sub">
            {perfil.totalUsuarios} {perfil.totalUsuarios === 1 ? 'usuario' : 'usuarios'} ·{' '}
            {perfil.esSistema
              ? 'Tiene todo lo contratado, incluida la gestión de permisos. No se puede editar ni eliminar.'
              : 'Un grant denegar acá es una excepción dentro de ESTE perfil.'}
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          <RecargarButton label="Actualizar" />
          {!soloLectura && (
            <button
              className="btn btn-primary"
              disabled={(!datosCambiados && !grantsCambiados) || saveMutation.isPending}
              onClick={() => saveMutation.mutate()}
            >
              Guardar
            </button>
          )}
        </div>
      </div>

      {!soloLectura && (
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="card-body fields-grid fields-grid-2">
            <div className="ff-wrap">
              <label className="ff-label" htmlFor="perfil-nombre">Nombre</label>
              <input
                id="perfil-nombre"
                className="ff-input"
                value={nombre ?? perfil.nombre}
                onChange={(e) => setNombre(e.target.value)}
                maxLength={150}
              />
            </div>
            <div className="ff-wrap">
              <label className="ff-label" htmlFor="perfil-desc">Descripción</label>
              <input
                id="perfil-desc"
                className="ff-input"
                value={descripcion ?? perfil.descripcion ?? ''}
                onChange={(e) => setDescripcion(e.target.value)}
              />
            </div>
            <div className="ff-wrap" style={{ gridColumn: '1 / -1' }}>
              <label className="ff-label" htmlFor="perfil-motivo">Motivo del cambio (opcional, queda en auditoría)</label>
              <input
                id="perfil-motivo"
                className="ff-input"
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
                placeholder="Ej. Cajeros ahora pueden ver reportes de caja"
              />
            </div>
          </div>
        </div>
      )}

      <ArbolPermisos catalogo={catalogo} estados={edicion} onChange={setEstados} readOnly={soloLectura} />

      {(() => {
        // §9.3: un perfil con `inventario` o `catalogo.items` pero sin ningún
        // `catalogo.datos-articulo.*` deja precios/costos/existencias en `null` para esa gente.
        const compConAcceso = (prefijo: string) =>
          Object.values(edicion).some((e) => [...e.marcados].some((k) => k === prefijo || k.startsWith(`${prefijo}.`)))
        const pantallaConAcceso = (key: string) => {
          const e = edicion[key]
          return !!e && e.marcados.size > 0
        }
        const tieneInventarioOItems =
          ['inventario', 'catalogo.items'].some((p) => pantallaConAcceso(p) || compConAcceso(p))
        const tieneDatosArticulo =
          pantallaConAcceso('catalogo.datos-articulo') || compConAcceso('catalogo.datos-articulo')
        if (!tieneInventarioOItems || tieneDatosArticulo) return null
        return (
          <div className="inline-alert inline-alert-warn" style={{ marginTop: 16, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <span>
              Este perfil no incluye 'Datos del artículo': quienes lo usen verán precios, costos y
              existencias como no disponibles. Agregá el acceso a 'Datos del artículo' para que vean
              esa información.
            </span>
            {!soloLectura && (
              <button
                type="button"
                className="btn btn-secondary btn-size-sm"
                onClick={() => {
                  const pant = catalogo.modulos
                    .find((m) => m.key === 'catalogo')
                    ?.pantallas.find((p) => p.key === 'catalogo.datos-articulo')
                  if (!pant) return
                  setEstados({
                    ...edicion,
                    'catalogo.datos-articulo': {
                      marcados: new Set(pant.componentes.map((c) => c.key)),
                      incluirFuturos: true,
                    },
                  })
                }}
              >
                Agregar todos
              </button>
            )}
          </div>
        )
      })()}

      <div className="card" style={{ marginTop: 16 }}>
        <div className="card-header">
          <h3 className="card-title">Usuarios con este perfil ({perfil.usuarios.length})</h3>
        </div>
        {perfil.usuarios.length === 0 ? (
          <div className="card-body">
            <div className="empty-state">
              <p className="empty-title">Sin usuarios</p>
              <p className="empty-sub">Asigná este perfil desde la pestaña Acceso de cada usuario.</p>
            </div>
          </div>
        ) : (
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Nombre</th>
                  <th>Correo</th>
                </tr>
              </thead>
              <tbody>
                {perfil.usuarios.map((u) => (
                  <tr key={u.email}>
                    <td style={{ fontWeight: 500 }}>{u.firstName} {u.lastName}</td>
                    <td className="td-muted">{u.email}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
