import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { getAccesoEfectivo } from '@/shared/api/acceso'
import type { ApiError, TrazaEstado } from '@/shared/api/types'

// "¿Por qué no ve esto?" — acceso efectivo con explicación por componente
// (docs/tasks/PROMPT_PERMISOS_V2_Y_DASHBOARD_MODULAR_FRONTEND.md §7.6).

const ESTADO_TEXTO: Record<TrazaEstado, (fuentes: string[]) => string> = {
  otorgado: (f) => f.length > 0 ? `Lo tiene por el perfil ${f.join(', ')}` : 'Otorgado por una excepción del usuario',
  denegado_perfil: (f) => `El perfil ${f.join(', ')} lo excluye`,
  denegado_usuario: () => 'Excepción del usuario: denegado',
  requisito_faltante: () => 'Le falta un permiso previo (ej. ver el listado)',
  sin_otorgar: () => 'Ningún perfil lo incluye',
  no_contratado: () => 'Su empresa no tiene contratado este módulo/reporte',
}

const ESTADO_TONO: Record<TrazaEstado, string> = {
  otorgado: 'success',
  denegado_perfil: 'error',
  denegado_usuario: 'error',
  requisito_faltante: 'warning',
  sin_otorgar: 'neutral',
  no_contratado: 'neutral',
}

function apiMessage(err: unknown, fallback: string): string {
  return (err as ApiError)?.message ?? fallback
}

export function ExplicacionAcceso({ email }: { email: string }) {
  const [abierto, setAbierto] = useState(false)
  const [busqueda, setBusqueda] = useState('')

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['acceso-efectivo', email],
    queryFn: () => getAccesoEfectivo(email, true),
    enabled: abierto,
    retry: false,
  })

  const traza = useMemo(() => {
    const q = busqueda.trim().toLowerCase()
    const items = data?.traza ?? []
    if (!q) return items
    return items.filter((t) =>
      t.key.toLowerCase().includes(q) || t.nombre.toLowerCase().includes(q) || t.pantalla.toLowerCase().includes(q),
    )
  }, [data, busqueda])

  return (
    <>
      <button className="btn btn-secondary btn-size-sm" onClick={() => setAbierto(true)}>
        Ver acceso efectivo
      </button>
      {abierto && (
        <div className="modal-overlay" onClick={() => setAbierto(false)}>
          <div className="modal-box modal-box-lg" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <div>
                <div className="modal-title">Acceso efectivo — {email}</div>
                <div className="modal-sub">¿Por qué ve (o no ve) cada cosa? Buscá, ej. "anular".</div>
              </div>
              <button className="modal-close" onClick={() => setAbierto(false)}>×</button>
            </div>
            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <input
                className="search-input"
                placeholder="Buscar permiso…"
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                autoFocus
              />
              {isLoading ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {Array.from({ length: 5 }).map((_, i) => (
                    <span key={i} className="skeleton-box" style={{ height: 28, width: '100%' }} />
                  ))}
                </div>
              ) : isError ? (
                <div className="inline-alert inline-alert-error">
                  {apiMessage(error, 'No se pudo cargar el acceso efectivo.')}
                </div>
              ) : traza.length === 0 ? (
                <div className="empty-state">
                  <p className="empty-title">Sin resultados</p>
                  <p className="empty-sub">Probá con otra búsqueda.</p>
                </div>
              ) : (
                <div className="table-scroll" style={{ maxHeight: 420 }}>
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Permiso</th>
                        <th>Estado</th>
                        <th>Motivo</th>
                      </tr>
                    </thead>
                    <tbody>
                      {traza.map((t) => (
                        <tr key={t.key}>
                          <td>
                            <span style={{ fontWeight: 500, fontSize: 13 }}>{t.nombre}</span>
                            <div className="td-muted" style={{ fontSize: 11 }}>{t.key}</div>
                          </td>
                          <td>
                            <span className="badge" data-tone={ESTADO_TONO[t.estado]}>{t.estado}</span>
                          </td>
                          <td style={{ fontSize: 13 }} title={t.fuentes.join(', ')}>
                            {ESTADO_TEXTO[t.estado](t.fuentes)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
            <div className="modal-foot">
              <button className="btn btn-ghost" onClick={() => setAbierto(false)}>Cerrar</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
