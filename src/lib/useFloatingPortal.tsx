/**
 * useFloatingPortal
 * -----------------
 * Renders dropdown content via a React portal directly in <body>.
 * This bypasses any ancestor `overflow: hidden` (cards, tables, modals)
 * that would clip a regular `position: absolute` dropdown.
 *
 * Uses `position: fixed` so the dropdown follows the trigger even inside
 * scrollable containers. Recalculates position on scroll/resize and closes
 * when the user scrolls the trigger out of view.
 *
 * Se posiciona debajo del anchor por defecto y, tras medir su alto real, se
 * voltea automáticamente arriba si no cabe abajo pero sí hay más espacio
 * arriba (ver `applyVerticalFlip`). El alineado horizontal es configurable:
 * 'left' (default, ancho igual al del anchor — listas de opciones) o
 * 'center' (centrado bajo el anchor sin forzar su ancho — ej. un calendario).
 */

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type RefObject,
} from 'react'
import { createPortal } from 'react-dom'

interface FloatingStyle {
  position: 'fixed'
  top: number
  left: number
  width?: number
  transform?: string
  zIndex: number
}

export interface FloatingDropdownOptions {
  /** 'left' (default): alinea el borde izquierdo del dropdown con el del anchor. 'center':
   *  centra el dropdown horizontalmente bajo el anchor (vía transform, sin medir contenido). */
  align?: 'left' | 'center'
  /** Si es false, el dropdown no hereda el ancho del anchor — lo define su propio contenido. */
  matchWidth?: boolean
}

function calcStyle(anchor: HTMLElement, opts?: FloatingDropdownOptions): FloatingStyle {
  const rect = anchor.getBoundingClientRect()
  const matchWidth = opts?.matchWidth ?? true
  const width = matchWidth ? rect.width : undefined

  if (opts?.align === 'center') {
    return {
      position: 'fixed',
      top: rect.bottom + 4,
      left: rect.left + rect.width / 2,
      transform: 'translateX(-50%)',
      width,
      zIndex: 9999,
    }
  }
  return {
    position: 'fixed',
    top: rect.bottom + 4,
    left: rect.left,
    width,
    zIndex: 9999,
  }
}

/** Si el dropdown no cabe entre el borde inferior del anchor y el viewport, pero arriba del
 *  anchor hay más espacio libre que abajo, lo reposiciona por encima. */
function applyVerticalFlip(style: FloatingStyle, rect: DOMRect, contentHeight: number): FloatingStyle {
  const vh = window.innerHeight
  const fitsBelow = rect.bottom + 4 + contentHeight <= vh
  if (fitsBelow) return style
  const spaceBelow = vh - rect.bottom
  const spaceAbove = rect.top
  if (spaceAbove <= spaceBelow) return style
  return { ...style, top: Math.max(4, rect.top - contentHeight - 4) }
}

/**
 * Hook that manages open/close state and calculates the fixed position
 * of a floating dropdown anchored to `anchorRef`.
 *
 * @param anchorRef  ref to the trigger element (button, input wrapper, etc.)
 * @param onClose    optional callback when the dropdown closes
 * @param opts       alineado horizontal / si hereda el ancho del anchor (ver FloatingDropdownOptions)
 */
export function useFloatingDropdown(
  anchorRef: RefObject<HTMLElement | null>,
  onClose?: () => void,
  opts?: FloatingDropdownOptions,
) {
  const [open, setOpen] = useState(false)
  const [style, setStyle] = useState<FloatingStyle | null>(null)
  const portalRef = useRef<HTMLDivElement>(null)

  // Leído desde un ref para que `measure`/el listener de scroll no necesiten cambiar de
  // identidad cada vez que el caller pasa un objeto de opciones nuevo por render.
  const optsRef = useRef(opts)
  useEffect(() => { optsRef.current = opts })

  const measure = useCallback(() => {
    if (anchorRef.current) setStyle(calcStyle(anchorRef.current, optsRef.current))
  }, [anchorRef])

  const openDropdown = useCallback(() => {
    measure()
    setOpen(true)
  }, [measure])

  const toggle = useCallback(() => {
    if (!open) measure()
    setOpen((o) => !o)
  }, [open, measure])

  const close = useCallback(() => {
    setOpen(false)
    onClose?.()
  }, [onClose])

  // Recalculate on scroll/resize; close if anchor scrolls out of viewport
  useEffect(() => {
    if (!open) return
    const update = () => {
      if (!anchorRef.current) { close(); return }
      const rect = anchorRef.current.getBoundingClientRect()
      const vw = window.innerWidth
      const vh = window.innerHeight
      if (rect.bottom < 0 || rect.top > vh || rect.right < 0 || rect.left > vw) {
        close()
      } else {
        setStyle(calcStyle(anchorRef.current, optsRef.current))
      }
    }
    window.addEventListener('scroll', update, { passive: true, capture: true })
    window.addEventListener('resize', update, { passive: true })
    return () => {
      window.removeEventListener('scroll', update, true)
      window.removeEventListener('resize', update)
    }
  }, [open, anchorRef, close])

  // Close on outside click (checks both anchor and portal content)
  useEffect(() => {
    if (!open) return
    const handleMouseDown = (e: MouseEvent) => {
      const target = e.target as Node
      if (anchorRef.current?.contains(target)) return
      if (portalRef.current?.contains(target)) return
      close()
    }
    document.addEventListener('mousedown', handleMouseDown)
    return () => document.removeEventListener('mousedown', handleMouseDown)
  }, [open, anchorRef, close])

  // Tras pintar el contenido (antes de que el navegador lo muestre, por eso useLayoutEffect),
  // mide su alto real y voltea el dropdown arriba del anchor si no cabe abajo.
  useLayoutEffect(() => {
    if (!open || !style || !anchorRef.current || !portalRef.current) return
    const rect = anchorRef.current.getBoundingClientRect()
    const contentHeight = portalRef.current.offsetHeight
    const flipped = applyVerticalFlip(style, rect, contentHeight)
    if (flipped.top !== style.top) setStyle(flipped)
  }, [open, style, anchorRef])

  return { open, style, openDropdown, toggle, close, portalRef }
}

/**
 * Renders `children` in a portal fixed to <body> at `style` position.
 * Returns null when `open` is false — avoids mounting overhead.
 */
export function FloatingPortal({
  open,
  style,
  portalRef,
  children,
}: {
  open: boolean
  style: FloatingStyle | null
  portalRef: RefObject<HTMLDivElement | null>
  children: React.ReactNode
}) {
  // Ensure portal root exists in DOM before first render
  const [mounted, setMounted] = useState(false)
  useLayoutEffect(() => setMounted(true), [])

  if (!open || !style || !mounted) return null

  return createPortal(
    <div ref={portalRef} style={style}>
      {children}
    </div>,
    document.body,
  )
}
