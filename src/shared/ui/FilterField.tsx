import type { ReactNode } from 'react'

interface FilterFieldProps {
  label: string
  children: ReactNode
  style?: React.CSSProperties
}

// Envoltorio para un control dentro de una `.filter-bar` — antepone un label pequeño para que,
// por ejemplo, dos `DatePicker` uno al lado del otro se distingan como "Desde"/"Hasta" en vez de
// ser dos inputs de fecha idénticos sin contexto.
export function FilterField({ label, children, style }: FilterFieldProps) {
  return (
    <div className="ff-wrap" style={style}>
      <label className="ff-label-sm">{label}</label>
      {children}
    </div>
  )
}
