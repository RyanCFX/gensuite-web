import type { DocumentPermissions } from '@/shared/api/types'

/** `docstatus` de ERPNext (docs/PROMPT_PERMISOS_FRONTEND.md §8). */
export type DocStatus = 0 | 1 | 2

/**
 * La regla más importante del spec (§8): la visibilidad de cada botón de una pantalla de detalle
 * es **permiso AND estado**. El endpoint de nivel 2 no mira el estado — sobre una factura ya
 * sometida sigue devolviendo `submit: 1` —, así que hay que combinarlo con `docstatus` acá.
 *
 * `imprimir` no depende del estado; el resto sí.
 */
export function accionesDoc(perms: DocumentPermissions['permisos'] | undefined, docstatus: DocStatus) {
  const p = perms ?? {}
  return {
    editar: p.write === 1 && docstatus === 0,
    eliminar: p.delete === 1 && docstatus === 0,
    someter: p.submit === 1 && docstatus === 0,
    anular: p.cancel === 1 && docstatus === 1,
    enmendar: p.amend === 1 && docstatus === 2,
    imprimir: p.print === 1,
  }
}

/** Normaliza el `status`/`docstatus` que devuelve el BFF (a veces string) al numérico de ERPNext. */
export function toDocStatus(value: unknown): DocStatus {
  if (value === 1 || value === '1') return 1
  if (value === 2 || value === '2') return 2
  if (typeof value === 'string') {
    const v = value.toLowerCase()
    if (v === 'submitted' || v === 'sometido' || v === 'unpaid' || v === 'paid' || v === 'overdue' || v === 'return' || v === 'credit note issued') return 1
    if (v === 'cancelled' || v === 'canceled' || v === 'anulado') return 2
  }
  return 0
}
