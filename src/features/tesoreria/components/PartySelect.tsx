import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { SearchSelect } from '@/shared/ui/SearchSelect'
import type { SearchSelectOption } from '@/shared/ui/SearchSelect'
import { listCustomers } from '@/shared/api/customers'
import { listSuppliers } from '@/shared/api/suppliers'

type PartyTipo = 'Customer' | 'Supplier'

interface PartySelectProps {
  tipo: PartyTipo | ''
  onTipoChange: (tipo: PartyTipo) => void
  id: string
  /** `nombre` es el nombre del tercero seleccionado — se manda como beneficiarioNombre/origenNombre. */
  onIdChange: (id: string, nombre?: string) => void
  disabled?: boolean
  tipoLabel?: string
  /** Solo mostrar Customer, o solo Supplier, o ambos (default). */
  tiposPermitidos?: PartyTipo[]
}

/**
 * Selector compartido de tercero (Customer o Supplier) — usado como `beneficiario` en Emisiones y
 * como `origen` en Depósitos. El usuario elige primero el tipo de tercero y luego busca en el
 * catálogo correspondiente; cambiar el tipo resetea la selección de id para evitar mandar un id de
 * Customer con tipo Supplier o viceversa.
 */
export function PartySelect({ tipo, onTipoChange, id, onIdChange, disabled, tipoLabel = 'Tipo', tiposPermitidos = ['Customer', 'Supplier'] }: PartySelectProps) {
  const [query, setQuery] = useState('')

  const { data: customers, isLoading: loadingCustomers, refetch: refetchCustomers } = useQuery({
    queryKey: ['party-select-customers', query],
    queryFn: () => listCustomers({ search: query || undefined, limit: 50 }),
    enabled: tipo === 'Customer',
    staleTime: 30_000,
  })

  const { data: suppliers, isLoading: loadingSuppliers, refetch: refetchSuppliers } = useQuery({
    queryKey: ['party-select-suppliers', query],
    queryFn: () => listSuppliers({ search: query || undefined, limit: 50 }),
    enabled: tipo === 'Supplier',
    staleTime: 30_000,
  })

  const options: SearchSelectOption[] =
    tipo === 'Customer'
      ? (customers?.items ?? []).map((c) => ({ value: c.id, label: c.customerName }))
      : tipo === 'Supplier'
        ? (suppliers?.items ?? []).map((s) => ({ value: s.id, label: s.supplierName }))
        : []

  function handleTipoChange(next: PartyTipo) {
    onTipoChange(next)
    onIdChange('', undefined) // resetear selección al cambiar de tipo — evita mezclar id/tipo
  }

  function handleSelect(value: string, option: SearchSelectOption | null) {
    onIdChange(value, option?.label)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {tiposPermitidos.length > 1 && (
        <div style={{ display: 'flex', gap: 6 }}>
          {tiposPermitidos.map((t) => (
            <button
              key={t}
              type="button"
              className={`btn btn-size-sm ${tipo === t ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => handleTipoChange(t)}
              disabled={disabled}
            >
              {t === 'Customer' ? 'Cliente' : 'Proveedor'}
            </button>
          ))}
        </div>
      )}
      {!tipo ? (
        <p className="ff-hint">Selecciona "{tipoLabel}" primero para buscar.</p>
      ) : (
        <SearchSelect
          value={id}
          onChange={handleSelect}
          options={options}
          onSearch={setQuery}
          onOpen={() => (tipo === 'Customer' ? refetchCustomers() : refetchSuppliers())}
          loading={tipo === 'Customer' ? loadingCustomers : loadingSuppliers}
          placeholder={tipo === 'Customer' ? 'Buscar cliente…' : 'Buscar proveedor…'}
          disabled={disabled}
        />
      )}
    </div>
  )
}
