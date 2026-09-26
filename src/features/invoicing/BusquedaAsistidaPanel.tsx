// Panel de "Otras opciones con la misma composición" para el mostrador/POS (vertical Farmacia) —
// docs/tasks/PROMPT_COMPOSICION_MEDICAMENTOS_FRONTEND.md §9. `coincidencias` (búsqueda textual
// normal) NUNCA se mezcla con `equivalentes` — este panel solo pinta la sección de equivalentes,
// separada de la lista de resultados de siempre del buscador de artículos (§2 regla 4).
import { useQuery } from '@tanstack/react-query'
import { useDebounce } from '@/lib/useDebounce'
import { buscarAsistida } from '@/shared/api/farmacia'
import { EquivalenteCard } from '@/shared/ui/EquivalenteCard'
import type { EquivalenteResponseDto } from '@/shared/api/types'
import { usePuede } from '@/shared/permissions/can'

export function BusquedaAsistidaPanel({
  query,
  onAgregar,
}: {
  query: string
  /** Siempre una elección explícita del usuario (§2 regla 1). El shape que llega es el resumen
   *  liviano del equivalente — quien lo reciba debe buscar/crear la línea con su propio flujo
   *  (mismo `item.id` que usa GET /catalog/items/:id). */
  onAgregar?: (equivalente: EquivalenteResponseDto) => void
}) {
  const puedeConsultar = usePuede('farmacia.equivalentes.consultar')
  const debouncedQuery = useDebounce(query, 300)

  const { data, isLoading } = useQuery({
    queryKey: ['busqueda-asistida', debouncedQuery],
    queryFn: () => buscarAsistida({ q: debouncedQuery, limit: 10 }),
    enabled: puedeConsultar && debouncedQuery.trim().length > 0,
  })

  if (!puedeConsultar || !debouncedQuery.trim()) return null
  // La búsqueda textual no encontró nada — no hay ancla de la cual partir, no mostrar ni el panel
  // ni un estado vacío para él (§9.3).
  if (data && data.ancla === null) return null

  return (
    <div className="card" style={{ marginTop: 12 }}>
      <div className="card-header">
        <h2 className="card-title" style={{ fontSize: 13 }} title="Sugerencias basadas en la composición declarada en el catálogo">
          Otras opciones con la misma composición
        </h2>
      </div>
      <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {isLoading && <span className="skeleton-box" style={{ height: 60, width: '100%', display: 'block' }} />}
        {data && data.equivalentes.length === 0 && (
          <p className="td-muted" style={{ fontSize: 13 }}>
            No hay otras opciones con la misma composición para este artículo.
          </p>
        )}
        {data && data.equivalentes.map((eq) => (
          <EquivalenteCard key={eq.item.id} equivalente={eq} agregarLabel="Usar este" onAgregar={onAgregar} />
        ))}
        {/* Texto fijo del backend — se muestra SIEMPRE tal cual, nunca hardcodeado (§2 regla 2). */}
        {data && <p className="td-muted" style={{ fontSize: 11, margin: 0 }}>{data.aviso}</p>}
      </div>
    </div>
  )
}
