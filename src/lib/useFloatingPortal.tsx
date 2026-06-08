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
  width: number
  zIndex: number
}

function calcStyle(anchor: HTMLElement): FloatingStyle {
  const rect = anchor.getBoundingClientRect()
  return {
    position: 'fixed',
    top: rect.bottom + 4,
    left: rect.left,
    width: rect.width,
    zIndex: 9999,
  }
}

/**
 * Hook that manages open/close state and calculates the fixed position
 * of a floating dropdown anchored to `anchorRef`.
 *
 * @param anchorRef  ref to the trigger element (button, input wrapper, etc.)
 * @param onClose    optional callback when the dropdown closes
 */
export function useFloatingDropdown(
  anchorRef: RefObject<HTMLElement | null>,
  onClose?: () => void,
) {
  const [open, setOpen] = useState(false)
  const [style, setStyle] = useState<FloatingStyle | null>(null)
  const portalRef = useRef<HTMLDivElement>(null)

  const measure = useCallback(() => {
    if (anchorRef.current) setStyle(calcStyle(anchorRef.current))
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
        setStyle(calcStyle(anchorRef.current))
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
