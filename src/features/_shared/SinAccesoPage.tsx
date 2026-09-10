import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Lock } from 'lucide-react'

/**
 * Pantalla "sin acceso" (docs/PROMPT_PERMISOS_FRONTEND.md §6). Se muestra cuando el usuario llega
 * a una ruta cuya acción de lectura no tiene. Se renderiza dentro de `AppLayout`, así que el menú
 * sigue visible y puede navegar a otra parte.
 */
export default function SinAccesoPage() {
  const navigate = useNavigate()

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 12,
        padding: '64px 24px',
        textAlign: 'center',
      }}
    >
      <span
        style={{
          display: 'grid',
          placeItems: 'center',
          width: 48,
          height: 48,
          borderRadius: 12,
          background: 'var(--surface-2, #f1f1f1)',
          color: 'var(--text-secondary)',
        }}
      >
        <Lock size={22} />
      </span>
      <h1 style={{ fontSize: 18, fontWeight: 600, margin: 0, color: 'var(--text-primary)' }}>
        No tenés acceso a esta sección
      </h1>
      <p style={{ fontSize: 14, color: 'var(--text-secondary)', margin: 0, maxWidth: 360 }}>
        Tu usuario no tiene permiso para ver esta pantalla. Si creés que es un error, pedile a un
        administrador que revise tus permisos.
      </p>
      <button className="btn btn-secondary btn-size-sm" onClick={() => navigate('/dashboard')} style={{ marginTop: 8 }}>
        <ArrowLeft size={16} /> Ir al Dashboard
      </button>
    </div>
  )
}
