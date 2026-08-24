import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { SearchSelect } from '@/shared/ui/SearchSelect'
import type { SearchSelectOption } from '@/shared/ui/SearchSelect'
import { listCuentasBancarias } from '@/shared/api/cuentas-bancarias'

interface CuentaBancariaSelectProps {
  value: string
  onChange: (id: string) => void
  placeholder?: string
  error?: boolean
  disabled?: boolean
  id?: string
  /** Excluye esta cuenta de las opciones — útil para "cuenta destino ≠ cuenta origen". */
  excludeId?: string
}

export function CuentaBancariaSelect({ value, onChange, placeholder = 'Buscar cuenta bancaria…', error, disabled, id, excludeId }: CuentaBancariaSelectProps) {
  const [query, setQuery] = useState('')

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['cuentas-bancarias-search', query],
    queryFn: () => listCuentasBancarias({ search: query || undefined, limit: 50 }),
    staleTime: 30_000,
  })

  const options: SearchSelectOption[] = (data?.items ?? [])
    .filter((c) => c.id !== excludeId)
    .map((c) => ({
      value: c.id,
      label: c.accountName,
      sublabel: [c.bank, c.bankAccountNo].filter(Boolean).join(' · '),
    }))

  return (
    <SearchSelect
      id={id}
      value={value}
      onChange={(v) => onChange(v)}
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
