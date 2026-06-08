import * as React from 'react'
import { ChevronDown } from 'lucide-react'

interface SelectProps {
  value?: string
  onValueChange?: (value: string) => void
  placeholder?: string
  children?: React.ReactNode
  disabled?: boolean
  className?: string
}

function Select({ value, onValueChange, placeholder, children, disabled, className = '' }: SelectProps) {
  const [open, setOpen] = React.useState(false)
  const ref = React.useRef<HTMLDivElement>(null)

  React.useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    if (open) document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [open])

  type ItemEl = React.ReactElement<{ value: string; children: React.ReactNode }>
  const allChildren = React.Children.toArray(children) as ItemEl[]
  const selectedLabel = allChildren.find((child) => child.props?.value === value)?.props?.children ?? placeholder ?? 'Seleccionar...'

  return (
    <div ref={ref} style={{ position: 'relative' }} className={className}>
      <button
        type="button"
        className="select-trigger"
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
      >
        <span style={{ color: value ? undefined : 'var(--text-tertiary, hsl(var(--muted-foreground)))' }}>
          {selectedLabel}
        </span>
        <ChevronDown size={14} style={{ flexShrink: 0, opacity: 0.6 }} />
      </button>
      {open && (
        <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, marginTop: 4, zIndex: 500 }}>
          <div className="select-content">
            {React.Children.map(children, (child: any) =>
              React.cloneElement(child, {
                onClick: () => {
                  onValueChange?.(child.props.value)
                  setOpen(false)
                },
                'data-selected': child.props.value === value ? '' : undefined,
              }),
            )}
          </div>
        </div>
      )}
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
