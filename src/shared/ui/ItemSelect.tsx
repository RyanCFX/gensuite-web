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
import { toast } from 'sonner'
import { listItems, listCuentasPorPagar } from '@/shared/api/catalog'
import { listBundles } from '@/shared/api/bundles'
import type { Item, Bundle, CuentaPorPagar } from '@/shared/api/types'
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
  /** Incluye conceptos de catalog/cuentas-por-pagar en los resultados — para líneas de Gasto */
  includeCuentasPorPagar?: boolean
  onSelectCuentaPorPagar?: (cuenta: CuentaPorPagar) => void
  /** No busca en catalog/items en absoluto — úsalo junto a includeCuentasPorPagar cuando el
   *  picker debe ofrecer EXCLUSIVAMENTE conceptos de Cuentas por Pagar (ej. Gasto). */
  excludeItems?: boolean
  /** Filtra artículos con stock en almacenes de esta sucursal — el item devuelto trae stockByWarehouse */
  branch?: string
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
  includeCuentasPorPagar,
  onSelectCuentaPorPagar,
  excludeItems,
  branch,
}: ItemSelectProps) {
  const [query, setQuery] = useState('')

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['itemSearch', query, typeFilter, branch],
    // `branch` ya filtra a artículos con stock en almacenes de esa sucursal — combinarlo con
    // `validateStock` hace que el backend devuelva 0 resultados, así que se omite validateStock
    // cuando ya hay una sucursal seleccionada (branch cubre esa validación).
    queryFn: () => {
      const params: Parameters<typeof listItems>[0] = { search: query || undefined, disabled: 'false', limit: 15 }
      if (typeFilter) params.type = typeFilter
      if (branch) {
        params.branch = branch
      } else if (validateStock) {
        params.validateStock = true
      }
      return listItems(params)
    },
    enabled: !excludeItems,
    staleTime: 30_000,
  })

  const { data: bundlesData, isLoading: bundlesLoading, refetch: refetchBundles } = useQuery({
    queryKey: ['bundleSearch', query],
    // El backend no soporta filtrar por `disabled` en la query — se filtra en el cliente abajo.
    queryFn: () => listBundles({ search: query || undefined, limit: 10 }),
    enabled: !!includeBundles,
    staleTime: 30_000,
  })
  const activeBundles = (bundlesData?.items ?? []).filter((b) => !b.disabled)

  const { data: cuentasPorPagarData, isLoading: cuentasPorPagarLoading, refetch: refetchCuentasPorPagar } = useQuery({
    queryKey: ['cuentaPorPagarSearch', query],
    queryFn: () => listCuentasPorPagar({ search: query || undefined, limit: 10 }),
    enabled: !!includeCuentasPorPagar,
    staleTime: 30_000,
  })
  const activeCuentasPorPagar = (cuentasPorPagarData?.items ?? []).filter((c) => !c.disabled)

  // Lector de código de barras: al escribir un número y presionar Enter antes de que
  // el debounce traiga resultados, se busca directamente por código de barras.
  const handleEnterWithoutMatch = async (typed: string) => {
    if (excludeItems) return
    if (!/^\d+$/.test(typed)) return
    const params: Parameters<typeof listItems>[0] = {
      barcode: typed,
      disabled: 'false',
      limit: 15,
    }
    if (typeFilter) params.type = typeFilter
    if (branch) {
      params.branch = branch
    } else if (validateStock) {
      params.validateStock = true
    }
    const res = await listItems(params)
    const item = res.items?.[0]
    if (!item) { toast.error(`Código de barras no encontrado: ${typed}`); return }
    if (item.hasVariants && onVariantSelect) { onVariantSelect(item); return }
    onSelect(item)
  }

  const options: SearchSelectOption[] = [
    ...(excludeItems ? [] : (data?.items ?? [])).map((item) => {
      const parts: string[] = []
      if (item.id !== item.itemName) parts.push(item.id)
      if (item.autoDiscount) {
        if (item.autoDiscount.discountType === 'Discount Percentage') {
          parts.push(`🔖 ${item.autoDiscount.discountPercentage ?? 0}% OFF`)
        } else {
          parts.push(`🔖 ${item.autoDiscount.discountAmount ?? 0} OFF`)
        }
      }
      return {
        value: item.id,
        label: item.itemName,
        sublabel: parts.join(' · '),
      }
    }),
    ...(includeBundles ? activeBundles.map((bundle) => ({
      value: bundle.id,
      label: bundle.itemName,
      sublabel: 'Combo',
    })) : []),
    ...(includeCuentasPorPagar ? activeCuentasPorPagar.map((cuenta) => ({
      value: cuenta.id,
      label: cuenta.titulo,
      sublabel: 'Cuenta por Pagar',
    })) : []),
  ]

  return (
    <SearchSelect
      value={value}
      selectedLabel={selectedLabel}
      onChange={(val) => {
        if (!val) { onClear(); return }
        const found = excludeItems ? undefined : data?.items.find((i) => i.id === val)
        if (found) {
          if (found.hasVariants && onVariantSelect) { onVariantSelect(found); return }
          onSelect(found)
          return
        }
        const foundBundle = activeBundles.find((b) => b.id === val)
        if (foundBundle && onSelectBundle) { onSelectBundle(foundBundle); return }
        const foundCuentaPorPagar = activeCuentasPorPagar.find((c) => c.id === val)
        if (foundCuentaPorPagar && onSelectCuentaPorPagar) onSelectCuentaPorPagar(foundCuentaPorPagar)
      }}
      options={options}
      onSearch={setQuery}
      onOpen={() => {
        refetch()
        if (includeBundles) refetchBundles()
        if (includeCuentasPorPagar) refetchCuentasPorPagar()
      }}
      onEnterWithoutMatch={handleEnterWithoutMatch}
      loading={(!excludeItems && isLoading) || (!!includeBundles && bundlesLoading) || (!!includeCuentasPorPagar && cuentasPorPagarLoading)}
      placeholder={placeholder}
      disabled={disabled}
    />
  )
}
