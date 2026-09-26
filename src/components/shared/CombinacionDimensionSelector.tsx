// Selector reutilizable de "combinación de dimensión de inventario" — docs/tasks/
// PROMPT_INVENTORY_DIMENSIONS_FRONTEND.md §4.3. Un `<select>` por cada dimensión que el artículo
// declara (`item.dimensiones`), en cascada por `dimensionPadre` (§3.6): elegir un valor en una
// dimensión padre filtra las opciones de su dimensión hija, y cambiar el padre limpia el hijo.
//
// Reutilizado en TODAS las pantallas de línea de documento (Compras, Facturación, Pedidos,
// Despachos, Transferencias, Ubicaciones) y en Ajuste/Reclasificación de combinación — construir
// una sola vez, no reimplementar por módulo (§13 checklist).
import { useEffect } from 'react'
import { useQueries } from '@tanstack/react-query'
import { Select, SelectItem } from '@/components/ui/select'
import { useDimensionesInventario, useValoresDimension, valoresDimensionQueryKey } from '@/shared/hooks/useDimensionesInventario'
import { listValoresDimension } from '@/shared/api/dimensiones-inventario'
import type { DimensionesLinea, ItemDimensionDeclarada } from '@/shared/api/types'

interface CombinacionDimensionSelectorProps {
  /** `item.dimensiones` del artículo elegido en la línea (§4.2) — ya viene en el detalle/picker,
   *  no hace falta una llamada aparte. */
  itemDimensiones: ItemDimensionDeclarada[]
  value: DimensionesLinea
  onChange: (value: DimensionesLinea) => void
  disabled?: boolean
  /** Oculta la etiqueta de cada dimensión (útil dentro de una celda de tabla angosta). */
  compact?: boolean
}

/** Un selector de valor para una sola dimensión, resolviendo cascada por `dimensionPadre`. */
function DimensionValueSelect({
  codigo,
  etiqueta,
  valoresPermitidos,
  dimensionPadre,
  valorPadreElegido,
  value,
  onChange,
  disabled,
  compact,
}: {
  codigo: string
  etiqueta: string
  valoresPermitidos?: string[]
  dimensionPadre?: string
  valorPadreElegido?: string
  value: string
  onChange: (v: string) => void
  disabled?: boolean
  compact?: boolean
}) {
  const requierePadre = !!dimensionPadre
  const { items, isLoading } = useValoresDimension(codigo, {
    padre: valorPadreElegido,
    requierePadre,
  })

  const opciones = valoresPermitidos && valoresPermitidos.length > 0
    ? items.filter((v) => valoresPermitidos.includes(v.id))
    : items

  const sinPadreElegido = requierePadre && !valorPadreElegido

  return (
    <div style={compact ? undefined : { display: 'flex', flexDirection: 'column', gap: 4 }}>
      {!compact && <label className="ff-label">{etiqueta}</label>}
      <Select
        value={value}
        onValueChange={onChange}
        placeholder={sinPadreElegido ? `Elija primero…` : `${etiqueta}…`}
        disabled={disabled || isLoading || sinPadreElegido}
      >
        {opciones.map((v) => (
          <SelectItem key={v.id} value={v.id}>{v.valor}</SelectItem>
        ))}
      </Select>
    </div>
  )
}

export function CombinacionDimensionSelector({
  itemDimensiones,
  value,
  onChange,
  disabled,
  compact,
}: CombinacionDimensionSelectorProps) {
  const { porCodigo, etiquetaDe } = useDimensionesInventario()

  // Si el padre cambia y el valor elegido del hijo ya no corresponde (§3.6), lo limpiamos — evita
  // dejar una combinación huérfana armada en el formulario que el servidor va a rechazar igual.
  useEffect(() => {
    let cambio = false
    const next = { ...value }
    for (const d of itemDimensiones) {
      const catalogo = porCodigo.get(d.dimension)
      const padreCodigo = catalogo?.dimensionPadre
      if (padreCodigo && next[d.dimension] && !next[padreCodigo]) {
        // El hijo tiene valor pero el padre ya no — limpiar (padre se deseleccionó).
        delete next[d.dimension]
        cambio = true
      }
    }
    if (cambio) onChange(next)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(value)])

  function handleChange(codigo: string, nuevoValor: string) {
    const catalogo = porCodigo.get(codigo)
    const next = { ...value }
    if (nuevoValor) next[codigo] = nuevoValor
    else delete next[codigo]

    // Cambió el valor de una dimensión que es padre de otra(s) declarada(s) por el artículo:
    // limpiar el/los hijo(s) para no dejar una combinación huérfana (§3.6).
    for (const d of itemDimensiones) {
      const hijoCatalogo = porCodigo.get(d.dimension)
      if (hijoCatalogo?.dimensionPadre === codigo) delete next[d.dimension]
    }
    void catalogo
    onChange(next)
  }

  return (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: compact ? 'center' : undefined }}>
      {itemDimensiones.map((d) => {
        const catalogo = porCodigo.get(d.dimension)
        const padreCodigo = catalogo?.dimensionPadre
        return (
          <DimensionValueSelect
            key={d.dimension}
            codigo={d.dimension}
            etiqueta={etiquetaDe(d.dimension)}
            valoresPermitidos={d.valoresPermitidos}
            dimensionPadre={padreCodigo}
            valorPadreElegido={padreCodigo ? value[padreCodigo] : undefined}
            value={value[d.dimension] ?? ''}
            onChange={(v) => handleChange(d.dimension, v)}
            disabled={disabled}
            compact={compact}
          />
        )
      })}
    </div>
  )
}

/** `true` si la combinación tiene un valor para cada dimensión que el artículo declara — usar
 *  antes de someter para dar feedback inmediato en vez de esperar el 400 del servidor (§11). */
export function combinacionCompleta(itemDimensiones: ItemDimensionDeclarada[], value: DimensionesLinea): boolean {
  return itemDimensiones.every((d) => !!value[d.dimension])
}

/** Texto legible corto para mostrar una combinación ya elegida (ej. en el resumen de una línea) —
 *  usa el cache de react-query (mismo queryKey que `useValoresDimension`), no dispara llamadas
 *  duplicadas si ya se cargaron para el selector de esa misma línea. */
export function useCombinacionResumen(itemDimensiones: ItemDimensionDeclarada[], value: DimensionesLinea): string {
  const results = useQueries({
    queries: itemDimensiones.map((d) => ({
      queryKey: valoresDimensionQueryKey(d.dimension),
      queryFn: () => listValoresDimension(d.dimension, { limit: 100 }),
      staleTime: 5 * 60 * 1000,
    })),
  })

  return itemDimensiones
    .map((d, i) => {
      const id = value[d.dimension]
      if (!id) return null
      return results[i].data?.items.find((v) => v.id === id)?.valor ?? id
    })
    .filter(Boolean)
    .join(' / ')
}
