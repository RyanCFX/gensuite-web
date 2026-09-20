import { useEffect, useRef } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { verificarEmisorElectronico } from '@/shared/api/suppliers'
import type { Supplier } from '@/shared/api/types'

/** Al seleccionar un proveedor en Compras/Gastos, si `esEmisorElectronico` viene en `null` o
 *  `false` refresca la consulta contra Megaplus/DGII (Norma 02-26) y actualiza la cache de
 *  `['supplier', id]` con el resultado, para que `excepcion0226Aplicable` quede al día sin que el
 *  usuario tenga que recargar. No aplica a personas físicas ni cuando ya viene `true`.
 *  Se intenta como máximo una vez por proveedor por sesión de formulario — un resultado
 *  confirmado en `false` no debe reintentarse en cada render. */
export function useSupplierEmisorElectronico(supplier: Supplier | undefined, enabled: boolean) {
  const queryClient = useQueryClient()
  const attemptedIds = useRef(new Set<string>())

  const { mutate, isPending } = useMutation({
    mutationFn: (id: string) => verificarEmisorElectronico(id),
    onSuccess: (data, id) => {
      queryClient.setQueryData<Supplier | undefined>(['supplier', id], (prev) =>
        prev
          ? { ...prev, esEmisorElectronico: data.esEmisorElectronico, excepcion0226Aplicable: data.excepcion0226Aplicable }
          : prev,
      )
    },
  })

  useEffect(() => {
    if (!enabled || !supplier) return
    if (supplier.supplierType !== 'Company') return
    if (supplier.esEmisorElectronico === true) return
    if (attemptedIds.current.has(supplier.id)) return
    attemptedIds.current.add(supplier.id)
    mutate(supplier.id)
  }, [enabled, supplier, mutate])

  return { verificandoEmisorElectronico: isPending }
}
