import { useNavigate } from 'react-router-dom'
import { PackageX, ArrowLeft } from 'lucide-react'

/**
 * Pantalla "módulo no contratado" (docs/tasks/80_features_tenant_discriminacion_ui.md §9,
 * `FEATURE_NO_CONTRATADO`): se muestra cuando alguien pega una URL directa a un módulo apagado
 * para su tenant — no debería pasar si el menú está bien gateado (§5/§6); si aparece, es señal
 * de que falta ocultar algo.
 *
 * Mensaje genérico + volver al inicio, nunca un error técnico. Se renderiza dentro de
 * `AppLayout`, así que el menú sigue visible. Difiere de `SinAccesoPage` (esa es por PERMISO del
 * usuario; esta es por PLAN del tenant).
 */
export default function ModuloNoContratadoPage({ detalle }: { detalle?: string }) {
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
        <PackageX size={22} />
      </span>
      <h1 style={{ fontSize: 18, fontWeight: 600, margin: 0, color: 'var(--text-primary)' }}>
        Este módulo no está disponible en tu plan
      </h1>
      <p style={{ fontSize: 14, color: 'var(--text-secondary)', margin: 0, maxWidth: 400 }}>
        {detalle ?? 'La empresa no tiene contratado este módulo. Si creés que es un error, contactá al administrador.'}
      </p>
      <button className="btn btn-secondary btn-size-sm" onClick={() => navigate('/dashboard')} style={{ marginTop: 8 }}>
        <ArrowLeft size={16} /> Ir al inicio
      </button>
    </div>
  )
}
