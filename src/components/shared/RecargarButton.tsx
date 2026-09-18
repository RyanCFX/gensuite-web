import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { RotateCw } from 'lucide-react'

// Botón genérico para refrescar los datos de la pantalla actual sin recargar la página completa —
// "Recargar" en pantallas de tabla, "Actualizar" en pantallas de formulario (mismo mecanismo:
// invalida TODAS las queries de React Query, pero solo se re-piden las que están montadas/activas
// en la pantalla actual — listado, filtros, catálogos de selects, etc.).
export function RecargarButton({ label = 'Recargar' }: { label?: string }) {
  const queryClient = useQueryClient()
  const [loading, setLoading] = useState(false)

  async function handleClick() {
    setLoading(true)
    try {
      await queryClient.invalidateQueries()
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
