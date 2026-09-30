import { listSucursales } from './sucursales'
import { listAlmacenes } from './config'
import { listCustomers } from './customers'
import { listSuppliers } from './suppliers'
import { listItems } from './catalog'
import { listUsuarios } from './usuarios'
import { listAseguradoras, nombreAseguradora } from './aseguradoras'
import { listMetodosPago } from './config'
import { listCajas } from './cajas'
import { listRoles } from './usuarios'
import type { OpcionItem } from './types'

// Fallbacks legacy para useOpciones/OpcionesSelect mientras el backend no expone
// GET /opciones/:recurso (404 → se usa el listado de administración de siempre).
// Cuando v2 esté desplegado, se retiran. `value` replica lo que cada pantalla mandaba
// antes (el `name` de ERPNext que espera el endpoint de negocio).

function contiene(haystack: string, q: string) {
  return !q || haystack.toLowerCase().includes(q.toLowerCase())
}

function recortar<T>(items: T[], limit: number): T[] {
  return limit > 0 ? items.slice(0, limit) : items
}

export async function fallbackSucursales(q: string, limit: number): Promise<OpcionItem[]> {
  const res = await listSucursales({ limit: 100 })
  return recortar(
    (res.items ?? []).filter((s) => contiene(s.name, q)).map((s) => ({ value: s.name, label: s.name })),
    limit,
  )
}

export async function fallbackAlmacenes(q: string, limit: number): Promise<OpcionItem[]> {
  const items = await listAlmacenes()
  return recortar(
    items.filter((a) => contiene(a.name, q)).map((a) => ({ value: a.id, label: a.name })),
    limit,
  )
}

export async function fallbackClientes(q: string, limit: number): Promise<OpcionItem[]> {
  const res = await listCustomers({ search: q || undefined, limit })
  return (res.items ?? []).map((c) => ({ value: c.id, label: c.customerName }))
}

export async function fallbackProveedores(q: string, limit: number): Promise<OpcionItem[]> {
  const res = await listSuppliers({ search: q || undefined, limit })
  return (res.items ?? []).map((s) => ({ value: s.id, label: s.supplierName }))
}

export async function fallbackArticulos(q: string, limit: number): Promise<OpcionItem[]> {
  const res = await listItems({ search: q || undefined, limit })
  return (res.items ?? []).map((it) => ({ value: it.id, label: it.itemName }))
}

export async function fallbackUsuarios(q: string, limit: number): Promise<OpcionItem[]> {
  const res = await listUsuarios()
  return recortar(
    (res.items ?? []).filter((u) => contiene(u.fullName, q) || contiene(u.email, q))
      .map((u) => ({ value: u.email, label: u.fullName })),
    limit,
  )
}

export async function fallbackAseguradoras(q: string, limit: number): Promise<OpcionItem[]> {
  const res = await listAseguradoras({ nombre: q || undefined, limit })
  return (res.items ?? []).map((a) => ({ value: a.id, label: nombreAseguradora(a) }))
}

export async function fallbackMetodosPago(q: string, limit: number): Promise<OpcionItem[]> {
  const items = await listMetodosPago()
  return recortar(
    items.filter((m) => contiene(m.name, q)).map((m) => ({ value: m.name, label: m.name })),
    limit,
  )
}

export async function fallbackCajasPos(q: string, limit: number): Promise<OpcionItem[]> {
  const items = await listCajas()
  return recortar(
    items.filter((c) => contiene(c.label, q)).map((c) => ({ value: c.id, label: c.label })),
    limit,
  )
}

export async function fallbackRoles(q: string, limit: number): Promise<OpcionItem[]> {
  const items = await listRoles()
  return recortar(
    items.filter((r) => contiene(r.label, q)).map((r) => ({ value: r.id, label: r.label })),
    limit,
  )
}
