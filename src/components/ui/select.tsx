import * as React from 'react'
import { ChevronDown } from 'lucide-react'
import { useFloatingDropdown, FloatingPortal } from '@/lib/useFloatingPortal'

interface SelectProps {
  value?: string
  onValueChange?: (value: string) => void
  placeholder?: string
  children?: React.ReactNode
  disabled?: boolean
  className?: string
}

function Select({ value, onValueChange, placeholder, children, disabled, className = '' }: SelectProps) {
  const triggerRef = React.useRef<HTMLButtonElement>(null)
  const { open, style, toggle, close, portalRef } = useFloatingDropdown(triggerRef)

  type ItemEl = React.ReactElement<{ value: string; children: React.ReactNode }>
  const allChildren = React.Children.toArray(children) as ItemEl[]
  const selectedLabel = allChildren.find((child) => child.props?.value === value)?.props?.children ?? placeholder ?? 'Seleccionar...'

  return (
    <div style={{ position: 'relative' }} className={className}>
      <button
        ref={triggerRef}
        type="button"
        className="select-trigger"
        disabled={disabled}
        onClick={toggle}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span style={{ color: value ? undefined : 'var(--text-tertiary, hsl(var(--muted-foreground)))' }}>
          {selectedLabel}
        </span>
        <ChevronDown size={14} style={{ flexShrink: 0, opacity: 0.6 }} />
      </button>

      <FloatingPortal open={open} style={style} portalRef={portalRef}>
        <div className="select-content">
          {React.Children.map(children, (child: any) =>
            React.cloneElement(child, {
              onClick: () => {
                onValueChange?.(child.props.value)
                close()
              },
              'data-selected': child.props.value === value ? '' : undefined,
            }),
          )}
        </div>
      </FloatingPortal>
    </div>
  )
}

function SelectTrigger({ className = '', children, ...props }: React.HTMLAttributes<HTMLButtonElement>) {
  return (
    <button type="button" className={`select-trigger ${className}`} {...props}>
      {children}
    </button>
  )
}

function SelectValue({ placeholder, children }: { placeholder?: string; children?: React.ReactNode }) {
  return <>{children ?? placeholder}</>
}

function SelectContent({ className = '', children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={`select-content ${className}`} {...props}>{children}</div>
}

function SelectItem({ className = '', children, value, ...props }: React.HTMLAttributes<HTMLDivElement> & { value: string }) {
  return (
    <div className={`select-item ${className}`} role="option" {...props}>
      {children}
    </div>
  )
}

export { Select, SelectTrigger, SelectValue, SelectContent, SelectItem }
