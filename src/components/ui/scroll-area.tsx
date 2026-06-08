import * as React from 'react'

interface ScrollAreaProps extends React.HTMLAttributes<HTMLDivElement> {
  orientation?: 'vertical' | 'horizontal'
}

export function ScrollArea({ className = '', children, ...props }: ScrollAreaProps) {
  return (
    <div className={`overflow-auto ${className}`} {...props}>
      {children}
    </div>
  )
}
