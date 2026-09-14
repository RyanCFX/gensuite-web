import { useNavigate, useLocation } from 'react-router-dom'

export interface RouteTab {
  label: string
  path: string
}

/** Tabs que navegan entre rutas hermanas (mismo patrón visual que las pestañas Físico/Electrónico
 *  de Secuencias NCF), para grupos del sidebar que se "aplanaron": en vez de un submenú expandible,
 *  el ítem del sidebar lleva directo a la primera pestaña y esta barra permite moverse a las demás. */
export function RouteTabs({ tabs }: { tabs: RouteTab[] }) {
  const navigate = useNavigate()
  const { pathname } = useLocation()

  return (
    <div className="tabs-bar" style={{ marginBottom: 16 }}>
      {tabs.map((t) => (
        <button
          key={t.path}
          type="button"
          className={`tab-btn${pathname === t.path ? ' on' : ''}`}
          onClick={() => navigate(t.path)}
        >
          {t.label}
        </button>
      ))}
    </div>
  )
}
