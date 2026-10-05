import { useEffect, useRef, useState } from 'react'
import { Search } from 'lucide-react'
import { REMOTE_SEARCH_DEBOUNCE_MS } from '@/lib/useDebounce'

interface SearchInputProps {
  /** Valor ya aplicado (el que alimenta la consulta al API). */
  value: string
  /** Se llama con el texto tras `delay` ms sin escribir (o al presionar Enter). */
  onChange: (value: string) => void
  placeholder?: string
  /** ms sin escribir antes de aplicar la búsqueda. Default 2 s. */
  delay?: number
  className?: string
  id?: string
  autoFocus?: boolean
  /** `field`: input de texto de filtro (sin lupa, estilo `ff-input`). */
  variant?: 'search' | 'field'
  type?: string
  style?: React.CSSProperties
}

/**
 * Buscador de pantallas de tabla: no dispara una consulta por cada letra. Espera `delay` ms sin
 * que el usuario escriba (Enter aplica de inmediato) y mientras tanto muestra el campo cargando.
 */
export function SearchInput({ value, onChange, placeholder, delay = REMOTE_SEARCH_DEBOUNCE_MS, className, id, autoFocus, variant = 'search', type, style }: SearchInputProps) {
  const [text, setText] = useState(value)
  const applied = useRef(value)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Cambios externos (limpiar filtros, URL…) se reflejan en el campo.
  useEffect(() => {
    if (value !== applied.current) {
      applied.current = value
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setText(value)
    }
  }, [value])

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current) }, [])

  function apply(next: string) {
    if (timer.current) clearTimeout(timer.current)
    timer.current = null
    if (next === applied.current) return
    applied.current = next
    onChange(next)
  }

  function handleChange(next: string) {
    setText(next)
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => apply(next), delay)
  }

  const pending = text !== value

  const isField = variant === 'field'
  return (
    <div className={isField ? 'search-input-field' : 'search-input-wrap'}>
      {!isField && <Search size={15} className="search-input-icon" />}
      <input
        id={id}
        type={type}
        style={style}
        className={className ?? (isField ? 'ff-input' : 'search-input')}
        placeholder={placeholder}
        value={text}
        autoFocus={autoFocus}
        onChange={(e) => handleChange(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') apply(text) }}
      />
      {pending && <span className="spinner spinner-brand spinner-sm search-input-spinner" aria-hidden="true" />}
    </div>
  )
}
