import * as React from 'react'

function DropdownMenu({ children }: { children?: React.ReactNode }) {
  return <>{children}</>
}

function DropdownMenuTrigger({ children, asChild, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { asChild?: boolean }) {
  return <button type="button" {...props}>{children}</button>
}

function DropdownMenuContent({ className = '', align = 'start', children, ...props }: React.HTMLAttributes<HTMLDivElement> & { align?: 'start' | 'end' }) {
  return (
    <div
      className={`dropdown-content ${className}`}
      style={{ ...(align === 'end' ? { right: 0, left: 'auto' } : {}) }}
      {...props}
    >
      {children}
    </div>
  )
}

function DropdownMenuItem({ className = '', children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button className={`dropdown-item ${className}`} type="button" {...props}>
      {children}
    </button>
  )
}

function DropdownMenuSeparator({ className = '', ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={`dropdown-separator ${className}`} {...props} />
}

function DropdownMenuLabel({ className = '', ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={`dropdown-label ${className}`} {...props} />
}

export {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent,
  DropdownMenuItem, DropdownMenuSeparator, DropdownMenuLabel,
}
