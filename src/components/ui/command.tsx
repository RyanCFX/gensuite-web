import * as React from 'react'
import { Search } from 'lucide-react'

function Command({ className = '', children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={className} {...props}>{children}</div>
}

function CommandDialog({ children }: { children?: React.ReactNode }) {
  return <>{children}</>
}

function CommandInput({ className = '', ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div className="flex items-center border-b border-border px-3" cmdk-input-wrapper="">
      <Search className="mr-2 h-4 w-4 shrink-0 opacity-50" />
      <input
        className="flex h-11 w-full rounded-md bg-transparent py-3 text-sm outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50"
        {...props}
      />
    </div>
  )
}

function CommandList({ className = '', ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={`max-h-80 overflow-y-auto overflow-x-hidden ${className}`} {...props} />
}

function CommandEmpty({ className = '', ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={`py-6 text-center text-sm text-muted-foreground ${className}`} {...props} />
}

function CommandGroup({ className = '', ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={`overflow-hidden p-1 text-foreground ${className}`} {...props} />
}

function CommandItem({ className = '', ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={`relative flex cursor-default items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-none hover:bg-accent aria-selected:bg-accent data-[disabled]:pointer-events-none data-[disabled]:opacity-50 ${className}`}
      {...props}
    />
  )
}

export { Command, CommandDialog, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem }
