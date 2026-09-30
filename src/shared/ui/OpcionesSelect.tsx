import { useState } from 'react'
import { SearchSelect, type SearchSelectOption } from './SearchSelect'
import { useOpciones } from '@/shared/hooks/useOpciones'
import type { OpcionItem } from '@/shared/api/types'

// Select alimentado por GET /opciones/:recurso (listas mínimas value/label).
// docs/tasks/PROMPT_PERMISOS_V2_Y_DASHBOARD_MODULAR_FRONTEND.md §5.3.
// Así un filtro/select NO exige acceso a la pantalla de administración de la entidad.

export interface OpcionesSelectProps {
  /** Clave sin prefijo (`sucursales`, `clientes`…) — también acepta `lookup.*`. */
  recurso: string
  value: string
  onChange: (value: string, option: SearchSelectOption | null) => void
  placeholder?: string
  disabled?: boolean
  error?: boolean
  selectedLabel?: string
  className?: string
  id?: string
  debounceMs?: number
  limit?: number
  headerContent?: React.ReactNode
  onEnterWithoutMatch?: (query: string) => void
  /** Listado legacy mientras el backend no expone /opciones (404 → fallback). */
  fallback?: (q: string, limit: number) => Promise<OpcionItem[]>
}

export function OpcionesSelect({
  recurso,
  value,
  onChange,
  placeholder = 'Buscar…',
  disabled = false,
  error = false,
  selectedLabel,
  className = '',
  id,
  debounceMs,
  limit,
  headerContent,
  onEnterWithoutMatch,
  fallback,
}: OpcionesSelectProps) {
  const [q, setQ] = useState('')
  const { data, isLoading } = useOpciones(recurso, { q, limit, enabled: !disabled, fallback })
  const options: SearchSelectOption[] = (data ?? []).map((o) => ({ value: o.value, label: o.label }))
  return (
    <SearchSelect
      value={value}
      onChange={onChange}
      options={options}
      onSearch={setQ}
      loading={isLoading}
      placeholder={placeholder}
      error={error}
      disabled={disabled}
      selectedLabel={selectedLabel}
      className={className}
      id={id}
      debounceMs={debounceMs}
      headerContent={headerContent}
      onEnterWithoutMatch={onEnterWithoutMatch}
    />
  )
}
