import { useEffect, useRef } from 'react'

/**
 * Sincroniza el ancho mínimo de los pies de tabla (`[data-pie-tabla]`: agregar,
 * totales) con el ancho real de la `<table>`, para que al haber scroll horizontal
 * ocupen lo mismo que las filas en vez de cortarse al ancho visible.
 */
export function useSyncFooterWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null)

  useEffect(() => {
    const wrap = ref.current
    if (!wrap) return
    const table = wrap.querySelector('table')
    if (!table) return
    const sync = () => {
      const w = Math.max(table.scrollWidth, wrap.clientWidth)
      wrap.querySelectorAll<HTMLElement>('[data-pie-tabla]').forEach((el) => {
        el.style.minWidth = `${w}px`
      })
    }
    sync()
    const ro = new ResizeObserver(sync)
    ro.observe(table)
    ro.observe(wrap)
    return () => ro.disconnect()
  })

  return ref
}
