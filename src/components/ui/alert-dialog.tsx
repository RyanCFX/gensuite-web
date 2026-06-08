import * as React from 'react'

interface AlertDialogProps {
  open?: boolean
  onOpenChange?: (open: boolean) => void
  children?: React.ReactNode
}

function AlertDialog({ open, children }: AlertDialogProps) {
  if (!open) return null
  return <>{children}</>
}

function AlertDialogTrigger({ children, onClick, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { asChild?: boolean }) {
  return <button onClick={onClick} {...props}>{children}</button>
}

function AlertDialogPortal({ children }: { children?: React.ReactNode }) {
  return <>{children}</>
}

function AlertDialogOverlay({ className = '', ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={`modal-overlay ${className}`} {...props} />
}

function AlertDialogContent({ className = '', children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className="modal-overlay" role="alertdialog" aria-modal="true">
      <div className={`modal-box ${className}`} {...props}>
        {children}
      </div>
    </div>
  )
}

function AlertDialogHeader({ className = '', ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div style={{ padding: '20px 24px 0' }} className={className} {...props} />
}

function AlertDialogFooter({ className = '', ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={`modal-foot ${className}`} {...props} />
}

function AlertDialogTitle({ className = '', ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return <h2 className={`modal-title ${className}`} {...props} />
}

function AlertDialogDescription({ className = '', ...props }: React.HTMLAttributes<HTMLParagraphElement>) {
  return <p className={`modal-sub ${className}`} style={{ marginTop: 4 }} {...props} />
}

function AlertDialogAction({ className = '', children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button className={`btn btn-primary ${className}`} {...props}>
      {children}
    </button>
  )
}

function AlertDialogCancel({ className = '', children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button className={`btn btn-ghost ${className}`} {...props}>
      {children ?? 'Cancelar'}
    </button>
  )
}

export {
  AlertDialog, AlertDialogTrigger, AlertDialogPortal, AlertDialogOverlay,
  AlertDialogContent, AlertDialogHeader, AlertDialogFooter,
  AlertDialogTitle, AlertDialogDescription, AlertDialogAction, AlertDialogCancel,
}
