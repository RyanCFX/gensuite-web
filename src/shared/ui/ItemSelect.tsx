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
import { listBundles } from '@/shared/api/bundles'
import type { Item, Bundle } from '@/shared/api/types'
import { SearchSelect } from '@/shared/ui/SearchSelect'
import type { SearchSelectOption } from '@/shared/ui/SearchSelect'

export interface ItemSelectProps {
  value: string
  selectedLabel?: string
  onSelect: (item: Item) => void
  onClear: () => void
  placeholder?: string
  disabled?: boolean
  onVariantSelect?: (template: Item) => void
  typeFilter?: 'product' | 'service'
  validateStock?: boolean
  /** Incluye combos (Product Bundle) en los resultados de búsqueda — para líneas de venta */
  includeBundles?: boolean
  onSelectBundle?: (bundle: Bundle) => void
}

export function ItemSelect({
  value,
  selectedLabel,
  onSelect,
  onClear,
  placeholder = 'Buscar artículo…',
  disabled,
  onVariantSelect,
  typeFilter,
  validateStock,
  includeBundles,
  onSelectBundle,
}: ItemSelectProps) {
  const [query, setQuery] = useState('')

  const { data, isLoading } = useQuery({
    queryKey: ['itemSearch', query, typeFilter],
    queryFn: () => listItems({ search: query || undefined, disabled: 'false', limit: 15, ...(typeFilter && { type: typeFilter }), ...(validateStock && { validateStock: true }) }),
    enabled: true,
    staleTime: 30_000,
  })

  const { data: bundlesData, isLoading: bundlesLoading } = useQuery({
    queryKey: ['bundleSearch', query],
    // El backend no soporta filtrar por `disabled` en la query — se filtra en el cliente abajo.
    queryFn: () => listBundles({ search: query || undefined, limit: 10 }),
    enabled: !!includeBundles,
    staleTime: 30_000,
  })
  const activeBundles = (bundlesData?.items ?? []).filter((b) => !b.disabled)

  const options: SearchSelectOption[] = [
    ...(data?.items ?? []).map((item) => ({
      value: item.id,
      label: item.itemName,
      // Muestra el código como sublabel solo cuando es distinto del nombre
      sublabel: item.id !== item.itemName ? item.id : undefined,
    })),
    ...(includeBundles ? activeBundles.map((bundle) => ({
      value: bundle.id,
      label: bundle.itemName,
      sublabel: 'Combo',
    })) : []),
  ]

  return (
    <SearchSelect
      value={value}
      selectedLabel={selectedLabel}
      onChange={(val) => {
        if (!val) { onClear(); return }
        const found = data?.items.find((i) => i.id === val)
        if (found) {
          if (found.hasVariants && onVariantSelect) { onVariantSelect(found); return }
          onSelect(found)
          return
        }
        const foundBundle = activeBundles.find((b) => b.id === val)
        if (foundBundle && onSelectBundle) onSelectBundle(foundBundle)
      }}
      options={options}
      onSearch={setQuery}
      loading={isLoading || (!!includeBundles && bundlesLoading)}
      placeholder={placeholder}
      disabled={disabled}
    />
  )
}
