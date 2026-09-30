import type { AccesoCatalogo, PerfilAcceso } from '@/shared/api/types'
import type { EstadoPantalla } from '@/shared/permissions/acceso'
import { ArbolPermisos } from './ArbolPermisos'
import { ExplicacionAcceso } from './ExplicacionAcceso'

// Pestaña "Acceso" del usuario (docs/tasks/PROMPT_PERMISOS_V2_Y_DASHBOARD_MODULAR_FRONTEND.md
// §7.5): multiselect de perfiles + excepciones del usuario (mismo editor de árbol; acá
// `denegar` es global y gana sobre sus perfiles) + acceso efectivo explicado.

export function AccesoUsuarioTab({ email, perfilesAcceso, perfilesAccesoError, selected, onToggle, catalogo, excepciones, onExcepciones }: {
  email: string
  perfilesAcceso: PerfilAcceso[]
  perfilesAccesoError: boolean
  selected: string[]
  onToggle: (id: string) => void
  catalogo: AccesoCatalogo | null
  excepciones: Record<string, EstadoPantalla> | null
  onExcepciones: (e: Record<string, EstadoPantalla>) => void
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div className="ff-wrap">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <label className="ff-label ff-required">Perfiles de acceso</label>
          <ExplicacionAcceso email={email} />
        </div>
        {perfilesAccesoError ? (
          <p style={{ fontSize: 13, color: 'var(--error-text)' }}>No se pudieron cargar los perfiles de acceso.</p>
        ) : perfilesAcceso.length === 0 ? (
          <p style={{ fontSize: 13, color: 'var(--text-tertiary)' }}>No hay perfiles de acceso. Crealos en Configuración → Acceso.</p>
        ) : (
          <div style={{
            display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, maxHeight: 160,
            overflowY: 'auto', border: '1px solid var(--border-default)',
            borderRadius: 'var(--radius-md)', padding: 12,
          }}>
            {perfilesAcceso.map((p) => (
              <label key={p.id} className="ff-check-wrap" title={p.descripcion}>
                <input
                  type="checkbox" className="ff-check"
                  checked={selected.includes(p.id)}
                  onChange={() => onToggle(p.id)}
                />
                <span style={{ fontSize: 13 }}>
                  {p.nombre}
                  {p.esSistema && <span className="badge badge-info" style={{ marginLeft: 6, fontSize: 10 }}>Sistema</span>}
                </span>
              </label>
            ))}
          </div>
        )}
        <p className="ff-hint">El acceso es la unión de los perfiles (con las excepciones de cada perfil).</p>
      </div>

      <div className="ff-wrap">
        <label className="ff-label">Excepciones de este usuario</label>
        <p className="ff-hint" style={{ marginBottom: 8 }}>
          Un <strong>denegar</strong> acá es global: gana sobre todos sus perfiles.
        </p>
        {!catalogo || !excepciones ? (
          <div className="skeleton-box" style={{ height: 120, width: '100%' }} />
        ) : (
          <ArbolPermisos catalogo={catalogo} estados={excepciones} onChange={onExcepciones} />
        )}
      </div>
    </div>
  )
}
