import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { getOpciones } from '@/shared/api/opciones'
import { getCachedUser, getTenant } from '@/shared/api/storage'
import type { ApiError, OpcionItem } from '@/shared/api/types'

// Selects mínimos para formularios y filtros (GET /opciones/:recurso, solo `q` y `limit`).
// Es la ÚNICA fuente de opciones de selects/filtros: no depende del permiso de la pantalla de la
// entidad (el backend lo cubre con `lookup.*`). Nunca caer a los endpoints de administración.
// La clave de caché incluye tenant y usuario: no se comparte entre tenants ni entre usuarios.

export interface UseOpcionesOpts {
  q?: string
  limit?: number
  enabled?: boolean
  staleTime?: number
  /** No mostrar el toast global si la request da 403 (el llamador oculta el control). */
  silent403?: boolean
  /** Solo `almacenes`. */
  branch?: string
}

export function esRecursoNoPermitido(err: unknown): boolean {
  return (err as ApiError | null | undefined)?.code === 'RECURSO_NO_PERMITIDO'
}

export function useOpciones(recurso: string, opts?: UseOpcionesOpts) {
  const q = opts?.q ?? ''
  const limit = opts?.limit ?? 50
  const tenant = getTenant()?.slug ?? ''
  const usuario = getCachedUser()?.email ?? ''
  const query = useQuery({
    queryKey: ['opciones', tenant, usuario, recurso, q, limit, opts?.branch ?? ''],
    queryFn: (): Promise<OpcionItem[]> => getOpciones(recurso, { q: q || undefined, limit, branch: opts?.branch || undefined, silent403: opts?.silent403 }),
    enabled: opts?.enabled ?? true,
    retry: false,
    staleTime: opts?.staleTime ?? 5 * 60_000,
    gcTime: 30 * 60_000,
  })
  return { ...query, forbidden: query.isError && esRecursoNoPermitido(query.error) }
}

const bool = (v: unknown) => v === true || v === 1 || v === '1'

// Único lugar donde los extras de ERPNext (snake_case) se traducen a los nombres que usa la app.
export type OpcionLista = OpcionItem & {
  id: string
  name: string
  customerName: string
  supplierName: string
  fullName: string
  email: string
  /** almacenes: sucursal. */
  branch?: string
  /** /opciones solo devuelve registros activos. */
  disabled: false
  /** metodos-pago; `currency` null = sin moneda definida. */
  methodType?: 'Cash' | 'Bank' | 'General'
  currencyCode: string | null
  accountId: string | null
  /** uom */
  mustBeWholeNumber: boolean
  /** centros-costo */
  number?: string
  /** grupos-clientes */
  priceTier?: 'A' | 'B' | 'C'
  /** aseguradoras */
  hasCredit: boolean
  /** cuentas-bancarias */
  accountName: string
  bankName?: string
  /** monedas */
  code: string
  simbolo?: string
  /** metodos-pago */
  requiresBankAccount: boolean
  defaultBankAccount?: string
  esCheque: boolean
  /** cuentas-bancarias */
  bankAccountNo?: string
  tipoCuenta?: string
  /** `true` si el número de cheque se digita; `true` también cuando el backend no lo informa (default histórico). */
  chequesManuales: boolean
  /** cajas-pos */
  isUserDefault: boolean
}

// Misma consulta que useOpciones pero con la forma `{ items: [{ id, name, … }] }` que ya consumen las
// pantallas (id = value, name/…Name = label) para migrar un `useQuery(listX)` sin reescribir el resto.
// Los campos que /opciones no trae (precios, límite de crédito…) NO existen en el tipo: leerlos no compila.
export function useOpcionesLista(recurso: string, opts?: UseOpcionesOpts) {
  const r = useOpciones(recurso, opts)
  const data = useMemo(
    () =>
      r.data
        ? {
            items: r.data.map<OpcionLista>((o) => ({
              ...o,
              id: o.value,
              name: o.label,
              customerName: o.label,
              supplierName: o.label,
              fullName: o.label,
              email: o.value,
              branch: o.custom_branch ?? undefined,
              disabled: false as const,
              methodType: (o.type ?? undefined) as OpcionLista['methodType'],
              currencyCode: o.currency ?? null,
              accountId: o.account ?? null,
              mustBeWholeNumber: bool(o.must_be_whole_number),
              number: o.cost_center_number ?? undefined,
              priceTier: o.custom_precio_tipo ?? undefined,
              hasCredit: bool(o.custom_tiene_credito),
              accountName: o.label,
              bankName: o.bank ?? undefined,
              code: o.value,
              simbolo: o.symbol ?? undefined,
              requiresBankAccount: bool(o.requires_bank_account),
              defaultBankAccount: o.default_bank_account ?? undefined,
              esCheque: bool(o.es_cheque),
              bankAccountNo: o.bank_account_no ?? undefined,
              tipoCuenta: o.custom_tipo_cuenta ?? undefined,
              chequesManuales: o.custom_cheques_manuales == null ? true : bool(o.custom_cheques_manuales),
              isUserDefault: bool(o.is_user_default),
            })),
          }
        : undefined,
    [r.data],
  )
  return { ...r, data }
}

// Variante de useOpcionesLista para las pantallas cuyo listado legacy devolvía un arreglo plano.
export function useOpcionesArray(recurso: string, opts?: UseOpcionesOpts) {
  const { data, ...rest } = useOpcionesLista(recurso, opts)
  return { ...rest, data: data?.items }
}
