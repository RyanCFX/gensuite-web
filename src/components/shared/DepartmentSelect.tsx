import { useState } from 'react'
import { SearchSelect } from '@/shared/ui/SearchSelect'
import type { SearchSelectOption } from '@/shared/ui/SearchSelect'
import { useOpcionesLista } from '@/shared/hooks/useOpciones'

interface DepartmentSelectProps {
  value: string
  onChange: (departmentId: string) => void
  placeholder?: string
  error?: boolean
  disabled?: boolean
  id?: string
}

export function DepartmentSelect({ value, onChange, placeholder = 'Buscar departamento…', error, disabled, id }: DepartmentSelectProps) {
  const [query, setQuery] = useState('')

  const { data, isLoading, refetch } = useOpcionesLista('departamentos', { q: query, limit: 20, staleTime: 30_000 })

  const options: SearchSelectOption[] = (data?.items ?? []).map((d) => ({
    value: d.id,
    label: d.name,
  }))

  return (
    <SearchSelect
      id={id}
      value={value}
      onChange={onChange}
      options={options}
      onSearch={setQuery}
      onOpen={() => refetch()}
      loading={isLoading}
      placeholder={placeholder}
      error={error}
      disabled={disabled}
    />
  )
}
