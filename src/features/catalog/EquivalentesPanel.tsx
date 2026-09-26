// Sección "Equivalentes sugeridos" en la ficha de un Artículo (vertical Farmacia) — docs/tasks/
// PROMPT_COMPOSICION_MEDICAMENTOS_FRONTEND.md §8. Solo se muestra (y solo se llama al endpoint)
// si el artículo es medicamento — eso ya se sabe de antemano por `esMedicamento` en la ficha
// (§6.1), así que el gate va ANTES de este componente, no adentro.
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { Sparkles, Info } from 'lucide-react'
import { getEquivalentes } from '@/shared/api/catalog'
import { EquivalenteCard } from '@/shared/ui/EquivalenteCard'
import { usePuede } from '@/shared/permissions/can'

export function EquivalentesPanel({ itemId, basePath }: { itemId: string; basePath: string }) {
  const navigate = useNavigate()
  const puedeConsultar = usePuede('farmacia.equivalentes.consultar')
  const [incluirCombinados, setIncluirCombinados] = useState(false)

  const { data, isLoading, isError } = useQuery({
    queryKey: ['item-equivalentes', itemId, incluirCombinados],
    queryFn: () => getEquivalentes(itemId, { nivelMinimo: incluirCombinados ? 3 : 2 }),
    enabled: puedeConsultar,
  })

  if (!puedeConsultar) return null

  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <div className="card-header">
        <h2 className="card-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Sparkles size={16} /> Equivalentes sugeridos
        </h2>
      </div>
      <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {isLoading && <span className="skeleton-box" style={{ height: 80, width: '100%', display: 'block' }} />}
        {isError && <p className="td-muted">No se pudieron cargar los equivalentes.</p>}

        {data && (
          <>
            {data.motivo === 'SIN_COMPOSICION_DECLARADA' && (
              <div className="inline-alert inline-alert-info">
                <Info size={14} />
                <span>
                  Este artículo no tiene principios activos declarados — completá la composición para ver
                  sugerencias.
                </span>
              </div>
            )}
            {!data.motivo && data.data.length === 0 && (
              <p className="td-muted" style={{ fontSize: 13 }}>
                No se encontraron artículos con composición similar en el catálogo.
              </p>
            )}
            {data.data.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {data.data.map((eq) => (
                  <EquivalenteCard key={eq.item.id} equivalente={eq} onVerFicha={(id) => navigate(`${basePath}/${id}`)} />
                ))}
              </div>
            )}
            {!incluirCombinados && (
              <button
                type="button"
                className="btn btn-ghost btn-size-sm"
                style={{ alignSelf: 'flex-start' }}
                onClick={() => setIncluirCombinados(true)}
              >
                Ver más alternativas (incluye combinados)
              </button>
            )}
            {/* Texto fijo del backend — se muestra SIEMPRE tal cual, nunca hardcodeado (§2 regla 2). */}
            <p className="td-muted" style={{ fontSize: 11, margin: 0 }}>{data.aviso}</p>
          </>
        )}
      </div>
    </div>
  )
}
