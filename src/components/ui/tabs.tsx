import * as React from 'react'

interface TabsProps {
  value?: string
  onValueChange?: (value: string) => void
  children?: React.ReactNode
  className?: string
}

function Tabs({ children, className = '' }: TabsProps) {
  return <div className={className}>{children}</div>
}

function TabsList({ className = '', children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={`tabs-list ${className}`} role="tablist" {...props}>
      {children}
    </div>
  )
}

interface TabsTriggerProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  value: string
}

function TabsTrigger({ className = '', children, value, ...props }: TabsTriggerProps) {
  return (
    <button className={`tab ${className}`} role="tab" type="button" {...props}>
      {children}
    </button>
  )
}

function TabsContent({ className = '', children, value, ...props }: React.HTMLAttributes<HTMLDivElement> & { value: string }) {
  return (
    <div className={className} role="tabpanel" {...props}>
      {children}
    </div>
  )
}

export { Tabs, TabsList, TabsTrigger, TabsContent }
