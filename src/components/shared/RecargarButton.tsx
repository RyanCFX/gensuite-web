import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { RotateCw } from 'lucide-react'

// Botón genérico para refrescar los datos de la pantalla actual sin recargar la página completa —
// "Recargar" en pantallas de tabla, "Actualizar" en pantallas de formulario.
// Solo re-pide las queries ACTIVAS (las de la pantalla visible: las pestañas ocultas están
// desuscritas, ver ScreenQueryGate) y se salta las globales del layout (`meta.global`: config de
// facturación, turno de caja…), que no pertenecen a la pantalla.
export function RecargarButton({ label = 'Recargar' }: { label?: string }) {
  const queryClient = useQueryClient()
  const [loading, setLoading] = useState(false)

  async function handleClick() {
    setLoading(true)
    try {
      await queryClient.refetchQueries({ type: 'active', predicate: (q) => !q.meta?.global })
    } finally {
      setLoading(false)
    }
  }

  return (
    <button type="button" className="btn btn-ghost btn-size-sm" onClick={handleClick} disabled={loading}>
      <RotateCw size={14} className={loading ? 'spin' : undefined} />
      {label}
    </button>
  )
}
