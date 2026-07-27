import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { SearchSelect } from '@/shared/ui/SearchSelect'
import type { SearchSelectOption } from '@/shared/ui/SearchSelect'
import type { ItemProps } from '@/shared/api/types'
import { listCentrosCosto } from '@/shared/api/centros-costo'

interface CostCenterSelectProps {
  value: ItemProps | null
  onChange: (costCenter: ItemProps | null) => void
  placeholder?: string
  error?: boolean
  disabled?: boolean
  id?: string
}

export function CostCenterSelect({ value, onChange, placeholder = 'Buscar centro de costo…', error, disabled, id }: CostCenterSelectProps) {
  const [query, setQuery] = useState('')

  const { data, isLoading } = useQuery({
    queryKey: ['cost-center-search', query],
    queryFn: () => listCentrosCosto({ search: query || undefined }),
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
      value={value?.id ?? ''}
      onChange={(id) => {
        if (!id) {
          onChange(null)
        } else {
          const selected = data?.items?.find((c) => c.id === id)
          if (selected) {
            onChange({ id: selected.id, name: selected.name })
          }
        }
      }}
      options={options}
      onSearch={setQuery}
      loading={isLoading}
      placeholder={placeholder}
      error={error}
      disabled={disabled}
    />
  )
}
