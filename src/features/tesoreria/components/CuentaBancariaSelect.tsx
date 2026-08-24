import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { SearchSelect } from '@/shared/ui/SearchSelect'
import type { SearchSelectOption } from '@/shared/ui/SearchSelect'
import { listCuentasBancarias } from '@/shared/api/cuentas-bancarias'
import type { CuentaBancaria } from '@/shared/api/types'

interface CuentaBancariaSelectProps {
  value: string
  /** `cuenta` es el registro completo de la cuenta bancaria seleccionada (incluye `.account`, la
   *  cuenta contable que tiene configurada) — útil para mostrar "cuenta heredada" en overrides sin
   *  tener que volver a pedirla. Viene `undefined` al limpiar la selección. */
  onChange: (id: string, cuenta?: CuentaBancaria) => void
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

  const items = (data?.items ?? []).filter((c) => c.id !== excludeId)
  const options: SearchSelectOption[] = items.map((c) => ({
    value: c.id,
    label: c.accountName,
    sublabel: [c.bank, c.bankAccountNo].filter(Boolean).join(' · '),
  }))

  return (
    <SearchSelect
      id={id}
      value={value}
      onChange={(v) => onChange(v, items.find((c) => c.id === v))}
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
