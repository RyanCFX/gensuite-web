import * as React from 'react'
import { X } from 'lucide-react'

interface SheetProps {
  open?: boolean
  onOpenChange?: (open: boolean) => void
  children?: React.ReactNode
}

function Sheet({ open, children }: SheetProps) {
  if (!open) return null
  return <>{children}</>
}

function SheetTrigger({ children, onClick, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button onClick={onClick} {...props}>{children}</button>
}

function SheetContent({ className = '', children, side = 'right', ...props }: React.HTMLAttributes<HTMLDivElement> & { side?: 'left' | 'right' }) {
  return (
    <>
      <div className="sheet-overlay" />
      <div className={`sheet-content ${className}`} {...props}>
        <div className="sheet-header">
          <button className="modal-close" aria-label="Cerrar">
            <X size={16} />
          </button>
        </div>
        <div className="sheet-body">
          {children}
        </div>
      </div>
    </>
  )
}

function SheetHeader({ className = '', ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={`sheet-header ${className}`} {...props} />
}

function SheetTitle({ className = '', ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return <h2 className={`sheet-title ${className}`} {...props} />
}

function SheetDescription({ className = '', ...props }: React.HTMLAttributes<HTMLParagraphElement>) {
  return <p className={`text-sm text-muted-foreground ${className}`} {...props} />
}

function SheetFooter({ className = '', ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={`modal-foot ${className}`} {...props} />
}

export { Sheet, SheetTrigger, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetFooter }
