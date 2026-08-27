import { useNavigate } from 'react-router-dom'
import { Search, LayoutDashboard } from 'lucide-react'

/**
 * Se muestra cuando el usuario cierra su última pestaña con Multipestañas activo —
 * en vez de forzar de vuelta al Dashboard, invita a navegar desde el menú o el buscador.
 * TabsContext navega aquí (y no crea una pestaña para esta ruta, ver TabsContext.tsx).
 */
export default function StartPage() {
  const navigate = useNavigate()

  const openSearch = () => {
    document.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true }),
    )
  }

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 20,
        minHeight: 'calc(100vh - var(--navbar-height, 56px))',
        padding: 24,
        textAlign: 'center',
      }}
    >
      <svg width="112" height="112" viewBox="0 0 120 120" fill="none" aria-hidden="true">
        <circle cx="60" cy="60" r="46" stroke="var(--border-default)" strokeWidth="2" />
        <g stroke="var(--text-tertiary)" strokeWidth="2" strokeLinecap="round">
          <path d="M60 8 V18" />
          <path d="M60 102 V112" />
          <path d="M8 60 H18" />
          <path d="M102 60 H112" />
        </g>
        <path
          d="M79 41 L67 67 L41 79 L53 53 Z"
          fill="var(--color-primary, #4f46e5)"
          opacity="0.9"
        />
        <circle
          cx="60"
          cy="60"
          r="5"
          fill="var(--surface-app)"
          stroke="var(--color-primary, #4f46e5)"
          strokeWidth="2"
        />
        <path
          d="M97 22 L99 28 L105 30 L99 32 L97 38 L95 32 L89 30 L95 28 Z"
          fill="var(--text-tertiary)"
          opacity="0.55"
        />
        <path
          d="M19 88 L20.4 92 L24.4 93.4 L20.4 94.8 L19 98.8 L17.6 94.8 L13.6 93.4 L17.6 92 Z"
          fill="var(--text-tertiary)"
          opacity="0.45"
        />
      </svg>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxWidth: 380 }}>
        <h1 style={{ fontSize: 18, fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>
          Sin pestañas abiertas
        </h1>
        <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: 0, lineHeight: 1.5 }}>
          Elige una sección en el menú de la izquierda o busca lo que necesitas — cliente,
          factura, artículo — para retomar por donde quieras.
        </p>
      </div>

      <div style={{ display: 'flex', gap: 10 }}>
        <button className="btn btn-primary" onClick={openSearch}>
          <Search size={14} /> Buscar
          <kbd
            style={{
              marginLeft: 4,
              padding: '1px 5px',
              borderRadius: 3,
              border: '1px solid rgba(255,255,255,0.35)',
              fontSize: 10,
              fontFamily: 'inherit',
            }}
          >
            Ctrl+K
          </kbd>
        </button>
        <button className="btn btn-secondary" onClick={() => navigate('/dashboard')}>
          <LayoutDashboard size={14} /> Ir al Dashboard
        </button>
      </div>
    </div>
  )
}
