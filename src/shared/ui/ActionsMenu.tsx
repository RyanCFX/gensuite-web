/**
 * ActionsMenu
 * -----------
 * Dropdown of action buttons rendered via FloatingPortal so it escapes
 * any overflow:hidden/auto ancestor (e.g. .table-scroll).
 *
 * Usage:
 *   <ActionsMenu>
 *     <ActionsMenuItem onClick={() => navigate(url)}><Eye size={14}/> Ver</ActionsMenuItem>
 *     <ActionsMenuItem danger onClick={handleDelete}><Trash2 size={14}/> Eliminar</ActionsMenuItem>
 *   </ActionsMenu>
 */

import { useRef, type ReactNode } from 'react'
import { MoreHorizontal } from 'lucide-react'
import { useFloatingDropdown, FloatingPortal } from '@/lib/useFloatingPortal'

interface ActionsMenuProps {
  children: ReactNode
}

interface ActionsMenuItemProps {
  onClick: () => void
  children: ReactNode
  danger?: boolean
  disabled?: boolean
}

export function ActionsMenuItem({ onClick, children, danger, disabled }: ActionsMenuItemProps) {
  return (
    <button
      type="button"
      className={`actions-item${danger ? ' actions-item-danger' : ''}`}
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </button>
  )
}

export function ActionsMenu({ children }: ActionsMenuProps) {
  const triggerRef = useRef<HTMLButtonElement>(null)
  const { open, style, toggle, portalRef } = useFloatingDropdown(triggerRef)

  return (
    <div style={{ display: 'flex', justifyContent: 'center' }}>
      <button
        ref={triggerRef}
        type="button"
        className="actions-trigger"
        onClick={(e) => { e.stopPropagation(); toggle() }}
      >
        <MoreHorizontal size={16} />
      </button>

      <FloatingPortal open={open} style={style} portalRef={portalRef}>
        <div
          className="actions-menu"
          style={{
            position: style?.position ?? 'fixed',
            top: style?.top,
            // Align right edge of menu to right edge of trigger, extending leftward
            right: style ? window.innerWidth - (Number(style.left) + Number(style.width)) : undefined,
            left: undefined,
            width: undefined,
            animation: 'none',
            zIndex: style?.zIndex ?? 9999,
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {children}
        </div>
      </FloatingPortal>
    </div>
  )
}
