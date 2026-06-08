/**
 * ItemSelect
 * ----------
 * SearchSelect pre-configurado para buscar artículos del catálogo.
 * Gestiona su propio estado de búsqueda — cada fila de la tabla
 * puede tener una instancia independiente sin interferir con las demás.
 *
 * Al seleccionar un artículo llama a `onSelect(item)` para que el padre
 * pueda auto-rellenar descripción, precio, etc.
 */

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { listItems } from '@/shared/api/catalog'
import type { Item } from '@/shared/api/types'
import { SearchSelect } from '@/shared/ui/SearchSelect'
import type { SearchSelectOption } from '@/shared/ui/SearchSelect'

export interface ItemSelectProps {
  /** Código del artículo actualmente seleccionado */
  value: string
  /** Nombre del artículo para mostrar cuando el campo está cerrado */
  selectedLabel?: string
  /** Se llama con el artículo completo cuando el usuario hace una selección */
  onSelect: (item: Item) => void
  /** Se llama cuando el usuario limpia la selección */
  onClear: () => void
  /** Placeholder del input */
  placeholder?: string
  disabled?: boolean
}

export function ItemSelect({
  value,
  selectedLabel,
  onSelect,
  onClear,
  placeholder = 'Buscar artículo…',
  disabled,
}: ItemSelectProps) {
  const [query, setQuery] = useState('')

  const { data, isLoading } = useQuery({
    queryKey: ['itemSearch', query],
    queryFn: () => listItems({ search: query || undefined, disabled: 'false', limit: 15 }),
    enabled: true,
    staleTime: 30_000,
  })

  const options: SearchSelectOption[] = (data?.items ?? []).map((item) => ({
    value: item.id,
    label: item.itemName,
    // Muestra el código como sublabel solo cuando es distinto del nombre
    sublabel: item.id !== item.itemName ? item.id : undefined,
  }))

  return (
    <SearchSelect
      value={value}
      selectedLabel={selectedLabel}
      onChange={(val) => {
        if (!val) { onClear(); return }
        const found = data?.items.find((i) => i.id === val)
        if (found) onSelect(found)
      }}
      options={options}
      onSearch={setQuery}
      loading={isLoading}
      placeholder={placeholder}
      disabled={disabled}
    />
  )
}
