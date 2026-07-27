import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { SearchSelect } from '@/shared/ui/SearchSelect'
import type { SearchSelectOption } from '@/shared/ui/SearchSelect'
import { listCentrosCosto } from '@/shared/api/centros-costo'

interface CostCenterSelectProps {
  value: string
  onChange: (costCenterId: string) => void
  placeholder?: string
  error?: boolean
  disabled?: boolean
  id?: string
}

export function CostCenterSelect({ value, onChange, placeholder = 'Buscar centro de costo…', error, disabled, id }: CostCenterSelectProps) {
  const [query, setQuery] = useState('')

  const { data, isLoading } = useQuery({
    queryKey: ['cost-center-search', query],
    queryFn: () => listCentrosCosto({ search: query || undefined, isGroup: false, limit: 20 }),
    staleTime: 30_000,
  })

  const options: SearchSelectOption[] = (data?.items ?? []).map((c) => ({
    value: c.id,
    label: c.name,
    sublabel: c.number,
  }))

  return (
    <SearchSelect
      id={id}
      value={value}
      onChange={onChange}
      options={options}
      onSearch={setQuery}
      loading={isLoading}
      placeholder={placeholder}
      error={error}
      disabled={disabled}
    />
  )
}
