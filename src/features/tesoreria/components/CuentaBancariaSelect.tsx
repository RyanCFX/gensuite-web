import { useState } from 'react'
import { SearchSelect } from '@/shared/ui/SearchSelect'
import type { SearchSelectOption } from '@/shared/ui/SearchSelect'
import { useOpcionesLista, type OpcionLista } from '@/shared/hooks/useOpciones'

interface CuentaBancariaSelectProps {
  value: string
  /** `cuenta` es la opción de la cuenta bancaria seleccionada (incluye `.account`, la
   *  cuenta contable que tiene configurada) — útil para mostrar "cuenta heredada" en overrides sin
   *  tener que volver a pedirla. Viene `undefined` al limpiar la selección. */
  onChange: (id: string, cuenta?: OpcionLista) => void
  placeholder?: string
  error?: boolean
  disabled?: boolean
  id?: string
  /** Excluye esta cuenta de las opciones — útil para "cuenta destino ≠ cuenta origen". */
  excludeId?: string
}

export function CuentaBancariaSelect({ value, onChange, placeholder = 'Buscar cuenta bancaria…', error, disabled, id, excludeId }: CuentaBancariaSelectProps) {
  const [query, setQuery] = useState('')
  const [abierto, setAbierto] = useState(false)

  const { data, isLoading } = useOpcionesLista('cuentas-bancarias', { q: query, limit: 50, enabled: abierto })

  const items = (data?.items ?? []).filter((c) => c.id !== excludeId)
  const options: SearchSelectOption[] = items.map((c) => ({
    value: c.id,
    label: c.accountName,
    sublabel: [c.bankName, c.bankAccountNo].filter(Boolean).join(' · '),
  }))

  return (
    <SearchSelect
      id={id}
      value={value}
      onChange={(v) => onChange(v, items.find((c) => c.id === v))}
      options={options}
      onSearch={setQuery}
      onOpen={() => setAbierto(true)}
      loading={isLoading}
      placeholder={placeholder}
      error={error}
      disabled={disabled}
    />
  )
}
