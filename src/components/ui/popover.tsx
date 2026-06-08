import * as React from 'react'

function Popover({ children }: { children?: React.ReactNode }) {
  return <>{children}</>
}

function PopoverTrigger({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button type="button" {...props}>{children}</button>
}

function PopoverContent({ className = '', children, align = 'center', ...props }: React.HTMLAttributes<HTMLDivElement> & { align?: 'start' | 'center' | 'end' }) {
  return (
    <div
      className={`dropdown-content ${className}`}
      style={{
        position: 'absolute',
        zIndex: 500,
        ...(align === 'end' ? { right: 0 } : align === 'start' ? { left: 0 } : { left: '50%', transform: 'translateX(-50%)' }),
      }}
      {...props}
    >
      {children}
    </div>
  )
}

export { Popover, PopoverTrigger, PopoverContent }
