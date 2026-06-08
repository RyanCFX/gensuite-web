import * as React from 'react'
import { X } from 'lucide-react'

interface DialogProps {
  open?: boolean
  onOpenChange?: (open: boolean) => void
  children?: React.ReactNode
}

function Dialog({ open, onOpenChange: _onOpenChange, children }: DialogProps) {
  if (!open) return null
  return <>{children}</>
}

function DialogTrigger({ children, onClick, ...props }: React.HTMLAttributes<HTMLButtonElement> & { asChild?: boolean }) {
  return <button onClick={onClick} {...props}>{children}</button>
}

function DialogPortal({ children }: { children?: React.ReactNode }) {
  return <>{children}</>
}

function DialogOverlay({ className = '', ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={`modal-overlay ${className}`} {...props} />
}

function DialogContent({ className = '', children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className="modal-overlay" role="dialog" aria-modal="true">
      <div className={`modal-box ${className}`} {...props}>
        {children}
        <button className="modal-close" aria-label="Cerrar" style={{ position: 'absolute', top: 16, right: 16 }}>
          <X size={16} />
        </button>
      </div>
    </div>
  )
}

function DialogHeader({ className = '', ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={`modal-head ${className}`} {...props} />
}

function DialogFooter({ className = '', ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={`modal-foot ${className}`} {...props} />
}

function DialogTitle({ className = '', ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return <h2 className={`modal-title ${className}`} {...props} />
}

function DialogDescription({ className = '', ...props }: React.HTMLAttributes<HTMLParagraphElement>) {
  return <p className={`modal-sub ${className}`} {...props} />
}

function DialogClose({ children, onClick, asChild, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { asChild?: boolean }) {
  if (asChild && React.isValidElement(children)) {
    return React.cloneElement(children as React.ReactElement<React.HTMLAttributes<HTMLElement>>, { onClick })
  }
  return <button onClick={onClick} {...props}>{children ?? <X size={16} />}</button>
}

export {
  Dialog, DialogTrigger, DialogPortal, DialogOverlay, DialogContent,
  DialogHeader, DialogFooter, DialogTitle, DialogDescription, DialogClose,
}
