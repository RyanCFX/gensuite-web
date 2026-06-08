import * as React from 'react'

interface SeparatorProps extends React.HTMLAttributes<HTMLHRElement> {
  orientation?: 'horizontal' | 'vertical'
  decorative?: boolean
}

export function Separator({ className = '', orientation = 'horizontal', ...props }: SeparatorProps) {
  return (
    <hr
      className={orientation === 'vertical' ? `separator-vertical ${className}` : `separator ${className}`}
      aria-orientation={orientation}
      {...props}
    />
  )
}
