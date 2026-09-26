import { useCallback, useEffect, useRef, useState } from 'react'

export interface ResizableColumnDef {
  key: string
  width: number
}

/**
 * Anchos de columna redimensionables a mano (arrastrando el divisor entre columnas), pensado
 * para usarse junto a un `<colgroup>` + `table-layout: fixed` (ver `.items-table-resizable` en
 * index.css) — así el ancho declarado en el `<col>` manda siempre, tanto con la tabla vacía como
 * con filas, en vez de que el navegador recalcule el layout según el contenido de cada celda.
 *
 * Los anchos se guardan por `key` (no por índice posicional) para que tablas con columnas
 * condicionales (ej. la cobertura ARS de Farmacia, o "Almacén" solo si la sucursal no fuerza uno)
 * conserven el ajuste manual del usuario en las columnas que siguen existiendo cuando otras
 * aparecen/desaparecen, en vez de desalinearse por el corrimiento de índices.
 */
export function useResizableColumns(columns: ResizableColumnDef[], minWidth = 48) {
  const [widths, setWidths] = useState<Record<string, number>>(() => (
    Object.fromEntries(columns.map((c) => [c.key, c.width]))
  ))
  const dragRef = useRef<{ key: string; startX: number; startWidth: number } | null>(null)

  // Si cambia el set de columnas visibles, agrega defaults para las nuevas y conserva el ancho
  // ya ajustado por el usuario para las que se mantienen.
  useEffect(() => {
    setWidths((prev) => {
      let changed = columns.length !== Object.keys(prev).length
      const next: Record<string, number> = {}
      for (const c of columns) {
        if (prev[c.key] != null) {
          next[c.key] = prev[c.key]
        } else {
          next[c.key] = c.width
          changed = true
        }
      }
      return changed ? next : prev
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [columns.map((c) => c.key).join('|')])

  const handleMouseMove = useCallback((e: MouseEvent) => {
    const drag = dragRef.current
    if (!drag) return
    const delta = e.clientX - drag.startX
    setWidths((prev) => ({ ...prev, [drag.key]: Math.max(minWidth, drag.startWidth + delta) }))
  }, [minWidth])

  const stopResize = useCallback(() => {
    dragRef.current = null
    document.removeEventListener('mousemove', handleMouseMove)
    document.removeEventListener('mouseup', stopResize)
    document.body.style.cursor = ''
    document.body.style.userSelect = ''
  }, [handleMouseMove])

  const startResize = useCallback((key: string) => (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    dragRef.current = { key, startX: e.clientX, startWidth: widths[key] }
    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', stopResize)
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
  }, [widths, handleMouseMove, stopResize])

  return { widths, startResize }
}
