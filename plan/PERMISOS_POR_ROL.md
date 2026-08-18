> 📋 **PLAN — no implementado todavía.** Escrito para que un agente de IA lo lea e implemente
> directamente contra el frontend. No requiere conocimiento previo de la conversación que lo
> originó — solo de este documento y de `roles.md` (raíz del repo), que es la fuente de verdad de
> negocio sobre qué debería ver cada rol.

# PERMISOS_POR_ROL — hook `usePermissions()` y matriz módulo→rol

## Contexto (una frase por tema)

Hoy el frontend no tiene ningún sistema genérico de permisos por rol: el único chequeo real es
`useIsSystemManager()` (`src/shared/hooks/useIsSystemManager.ts`), duplicado además como string
literal inline (`'System Manager'`) en ~9 archivos y en `AppLayout.tsx:496,828`. Todo lo demás que
describe `roles.md` (Sales Manager, Purchase User, Accounts Manager, Cajero POS, etc.) no condiciona
ninguna pantalla ni botón todavía. Este documento define un hook `usePermissions()` centralizado y
una matriz de datos módulo→rol derivada de `roles.md`, para que built-in a partir de ahora cualquier
pantalla nueva (o migración de una existente) pueda preguntar "¿este usuario puede ver/hacer X?" en
un solo lugar, en vez de repetir `user?.roles?.includes(...)` por todos lados.

**Alcance de esta fase**: solo la fundación (tipos, matriz, hook, componente guard). No se migra
ninguna pantalla de negocio existente todavía — quedan como Fase 2/3 al final de este documento.

---

## Índice

1. [Catálogo de roles conocidos (`RoleId`)](#1-catálogo-de-roles-conocidos-roleid)
2. [Matriz módulo→rol (`permissionsMatrix.ts`)](#2-matriz-módulorol-permissionsmatrixts)
3. [Hook `usePermissions()`](#3-hook-usepermissions)
4. [Componente `<AccessGuard>`](#4-componente-accessguard)
5. [Fase 2 — migrar `useIsSystemManager()` y el menú de `AppLayout`](#5-fase-2--migrar-useissystemmanager-y-el-menú-de-applayout)
6. [Fase 3 — rollout por botón en módulos de negocio](#6-fase-3--rollout-por-botón-en-módulos-de-negocio)
7. [Notas y riesgos conocidos](#7-notas-y-riesgos-conocidos)

---

## 1. Catálogo de roles conocidos (`RoleId`)

Hoy `AuthUser.roles`, `Usuario.roles`, etc. son todos `string[]` sin tipar (`src/shared/api/types.ts:60,1893`).
No hay ningún enum. Crear `src/shared/permissions/roles.ts`:

```ts
// src/shared/permissions/roles.ts

/** Roles de ERPNext/Frappe relevantes para este frontend — ver roles.md (raíz del repo). */
export const ROLE = {
  SYSTEM_MANAGER: 'System Manager',
  AUDITOR: 'Auditor',
  CAJERO_POS: 'Cajero POS',

  SALES_MANAGER: 'Sales Manager',
  SALES_MASTER_MANAGER: 'Sales Master Manager',
  SALES_USER: 'Sales User',

  PURCHASE_MANAGER: 'Purchase Manager',
  PURCHASE_MASTER_MANAGER: 'Purchase Master Manager',
  PURCHASE_USER: 'Purchase User',

  ACCOUNTS_MANAGER: 'Accounts Manager',
  ACCOUNTS_USER: 'Accounts User',

  STOCK_MANAGER: 'Stock Manager',
  STOCK_USER: 'Stock User',
  ITEM_MANAGER: 'Item Manager',

  REPORT_MANAGER: 'Report Manager',
  PREPARED_REPORT_USER: 'Prepared Report User',
  ANALYTICS: 'Analytics',
  DASHBOARD_MANAGER: 'Dashboard Manager',
} as const

export type RoleId = (typeof ROLE)[keyof typeof ROLE]

/** Roles "equivalentes" a efectos de UI — tratar como el mismo permiso (ver roles.md). */
export const ROLE_ALIASES: Partial<Record<RoleId, RoleId>> = {
  [ROLE.SALES_MASTER_MANAGER]: ROLE.SALES_MANAGER,
  [ROLE.PURCHASE_MASTER_MANAGER]: ROLE.PURCHASE_MANAGER,
}

/** Roles nativos de Frappe que NO deben condicionar ninguna UI (ver roles.md sección Core). */
export const IGNORED_ROLES = ['Administrator', 'All', 'Desk User', 'Guest', 'Employee'] as const
```

No incluir aquí los roles de HR/Delivery/Fleet/Projects/Maintenance/Manufacturing/Quality/
Marketing/Academics/Website/Customer/Supplier — no tienen pantalla en este frontend (ver `roles.md`).
Si en el futuro se agrega el portal externo, se tratará aparte (no es parte de `usePermissions()`,
que es para el ERP administrativo).

---

## 2. Matriz módulo→rol (`permissionsMatrix.ts`)

Crear `src/shared/permissions/matrix.ts`. Cada entrada de módulo mapea a los roles que pueden
**ver** el módulo (`view`) y, opcionalmente, a los roles que pueden ejecutar acciones de mutación
(`mutate`) cuando el rol de área por sí solo no basta (ej. Auditor nunca debe mutar nada aunque vea
todo). La matriz completa surge del análisis rol↔frontend ya hecho — **no la reinventes**, cópiala
literalmente de esta tabla:

```ts
// src/shared/permissions/matrix.ts
import { ROLE, type RoleId } from './roles'

export type ModuleKey =
  | 'dashboard'
  | 'facturacion' | 'cotizaciones' | 'pedidos' | 'notasCreditoDebito' | 'devolucionesVenta'
  | 'clientes'
  | 'compras' | 'recepciones' | 'costosImportacion' | 'gastos' | 'devolucionesCompra' | 'proveedores'
  | 'catalogo' | 'reglasPrecio'
  | 'inventario' | 'transferencias'
  | 'cobrosCxC' | 'cajaContado'
  | 'pagosCxP'
  | 'planCuentas' | 'asientos' | 'contabilidad' | 'cuentasBancarias' | 'bancos' | 'centrosCosto'
  | 'reportes'
  | 'usuarios' | 'roles' | 'permisos'
  | 'configSistema' | 'configFiscal' | 'departamentosSucursales' | 'ajustesAvanzados' | 'notificaciones' | 'plantillasFactura' | 'cajasConfig'
  | 'pos'

interface ModuleAccess {
  /** Roles que pueden ver el módulo. Vacío = nadie por rol de área (solo System Manager global). */
  view: RoleId[]
  /** Si se define, roles que pueden mutar (crear/editar/someter/cancelar). Si se omite, = view. */
  mutate?: RoleId[]
}

export const PERMISSIONS_MATRIX: Record<ModuleKey, ModuleAccess> = {
  dashboard: { view: [ROLE.SALES_MANAGER, ROLE.PURCHASE_MANAGER, ROLE.ACCOUNTS_MANAGER, ROLE.SYSTEM_MANAGER] },

  facturacion: { view: [ROLE.SALES_MANAGER, ROLE.SALES_USER, ROLE.CAJERO_POS, ROLE.AUDITOR], mutate: [ROLE.SALES_MANAGER, ROLE.SALES_USER] },
  cotizaciones: { view: [ROLE.SALES_MANAGER, ROLE.SALES_USER], mutate: [ROLE.SALES_MANAGER, ROLE.SALES_USER] },
  pedidos: { view: [ROLE.SALES_MANAGER, ROLE.SALES_USER], mutate: [ROLE.SALES_MANAGER, ROLE.SALES_USER] },
  notasCreditoDebito: { view: [ROLE.SALES_MANAGER, ROLE.AUDITOR], mutate: [ROLE.SALES_MANAGER] },
  devolucionesVenta: { view: [ROLE.SALES_MANAGER, ROLE.AUDITOR], mutate: [ROLE.SALES_MANAGER] },
  clientes: { view: [ROLE.SALES_MANAGER, ROLE.SALES_USER], mutate: [ROLE.SALES_MANAGER] },

  compras: { view: [ROLE.PURCHASE_MANAGER, ROLE.PURCHASE_USER, ROLE.AUDITOR], mutate: [ROLE.PURCHASE_MANAGER, ROLE.PURCHASE_USER] },
  recepciones: { view: [ROLE.PURCHASE_MANAGER, ROLE.PURCHASE_USER, ROLE.STOCK_MANAGER, ROLE.AUDITOR], mutate: [ROLE.PURCHASE_MANAGER, ROLE.PURCHASE_USER] },
  costosImportacion: { view: [ROLE.PURCHASE_MANAGER, ROLE.AUDITOR], mutate: [ROLE.PURCHASE_MANAGER] },
  gastos: { view: [ROLE.PURCHASE_MANAGER, ROLE.PURCHASE_USER, ROLE.AUDITOR], mutate: [ROLE.PURCHASE_MANAGER, ROLE.PURCHASE_USER] },
  devolucionesCompra: { view: [ROLE.PURCHASE_MANAGER, ROLE.AUDITOR], mutate: [ROLE.PURCHASE_MANAGER] },
  proveedores: { view: [ROLE.PURCHASE_MANAGER, ROLE.PURCHASE_USER], mutate: [ROLE.PURCHASE_MANAGER] },

  catalogo: { view: [ROLE.ITEM_MANAGER, ROLE.STOCK_MANAGER, ROLE.STOCK_USER, ROLE.SALES_USER, ROLE.AUDITOR], mutate: [ROLE.ITEM_MANAGER] },
  reglasPrecio: { view: [ROLE.ITEM_MANAGER, ROLE.SALES_MANAGER], mutate: [ROLE.ITEM_MANAGER, ROLE.SALES_MANAGER] },

  inventario: { view: [ROLE.STOCK_MANAGER, ROLE.STOCK_USER, ROLE.ITEM_MANAGER, ROLE.AUDITOR], mutate: [ROLE.STOCK_MANAGER, ROLE.STOCK_USER] },
  transferencias: { view: [ROLE.STOCK_MANAGER, ROLE.STOCK_USER], mutate: [ROLE.STOCK_MANAGER, ROLE.STOCK_USER] },

  cobrosCxC: { view: [ROLE.SALES_MANAGER, ROLE.ACCOUNTS_MANAGER, ROLE.ACCOUNTS_USER, ROLE.AUDITOR], mutate: [ROLE.SALES_MANAGER, ROLE.ACCOUNTS_MANAGER, ROLE.ACCOUNTS_USER] },
  cajaContado: { view: [ROLE.SALES_MANAGER, ROLE.SALES_USER], mutate: [ROLE.SALES_MANAGER, ROLE.SALES_USER] },

  pagosCxP: { view: [ROLE.PURCHASE_MANAGER, ROLE.ACCOUNTS_MANAGER, ROLE.ACCOUNTS_USER, ROLE.AUDITOR], mutate: [ROLE.ACCOUNTS_MANAGER, ROLE.ACCOUNTS_USER] },

  planCuentas: { view: [ROLE.ACCOUNTS_MANAGER, ROLE.AUDITOR], mutate: [ROLE.ACCOUNTS_MANAGER] },
  asientos: { view: [ROLE.ACCOUNTS_MANAGER, ROLE.AUDITOR], mutate: [ROLE.ACCOUNTS_MANAGER] },
  contabilidad: { view: [ROLE.ACCOUNTS_MANAGER, ROLE.AUDITOR], mutate: [ROLE.ACCOUNTS_MANAGER] },
  cuentasBancarias: { view: [ROLE.ACCOUNTS_MANAGER], mutate: [ROLE.ACCOUNTS_MANAGER] },
  bancos: { view: [ROLE.ACCOUNTS_MANAGER], mutate: [ROLE.ACCOUNTS_MANAGER] },
  centrosCosto: { view: [ROLE.ACCOUNTS_MANAGER], mutate: [ROLE.ACCOUNTS_MANAGER] },

  reportes: { view: [ROLE.SALES_MANAGER, ROLE.PURCHASE_MANAGER, ROLE.ACCOUNTS_MANAGER, ROLE.AUDITOR, ROLE.REPORT_MANAGER, ROLE.PREPARED_REPORT_USER, ROLE.ANALYTICS, ROLE.DASHBOARD_MANAGER] },

  usuarios: { view: [ROLE.SYSTEM_MANAGER], mutate: [ROLE.SYSTEM_MANAGER] },
  roles: { view: [ROLE.SYSTEM_MANAGER], mutate: [ROLE.SYSTEM_MANAGER] },
  permisos: { view: [ROLE.SYSTEM_MANAGER], mutate: [ROLE.SYSTEM_MANAGER] },

  configSistema: { view: [ROLE.SYSTEM_MANAGER], mutate: [ROLE.SYSTEM_MANAGER] },
  configFiscal: { view: [ROLE.SYSTEM_MANAGER, ROLE.ACCOUNTS_MANAGER], mutate: [ROLE.SYSTEM_MANAGER, ROLE.ACCOUNTS_MANAGER] },
  departamentosSucursales: { view: [ROLE.SYSTEM_MANAGER, ROLE.ACCOUNTS_MANAGER], mutate: [ROLE.SYSTEM_MANAGER] },
  ajustesAvanzados: { view: [ROLE.SYSTEM_MANAGER, ROLE.ACCOUNTS_MANAGER, ROLE.STOCK_MANAGER, ROLE.SALES_MANAGER, ROLE.PURCHASE_MANAGER], mutate: [ROLE.SYSTEM_MANAGER] },
  notificaciones: { view: [ROLE.SYSTEM_MANAGER], mutate: [ROLE.SYSTEM_MANAGER] },
  plantillasFactura: { view: [ROLE.SYSTEM_MANAGER], mutate: [ROLE.SYSTEM_MANAGER] },
  cajasConfig: { view: [ROLE.SYSTEM_MANAGER], mutate: [ROLE.SYSTEM_MANAGER] },

  pos: { view: [ROLE.CAJERO_POS], mutate: [ROLE.CAJERO_POS] },
}
```

Notas sobre `ajustesAvanzados`: la matriz de arriba es a nivel de módulo/página completa. El
detalle real (Fase 3) es **por tab** — ver sección 6, punto 6.6 — porque `AjustesAvanzadosPage.tsx`
es un singleton GET+PUT por dominio (Accounts/Stock/Selling/Buying), no una sola pantalla
homogénea. `System Manager` siempre puede mutar cualquier tab; el Manager de área solo el suyo.

`Auditor` nunca aparece en ningún array `mutate` — eso es intencional (roles.md: "cualquier botón
de crear/editar/eliminar/someter/cancelar" queda fuera para este rol).

---

## 3. Hook `usePermissions()`

Crear `src/shared/hooks/usePermissions.ts`:

```ts
// src/shared/hooks/usePermissions.ts
import { useAuthStore } from '@/stores/auth.store'
import { ROLE_ALIASES, type RoleId } from '@/shared/permissions/roles'
import { PERMISSIONS_MATRIX, type ModuleKey } from '@/shared/permissions/matrix'

function normalizeRoles(rawRoles: string[]): Set<string> {
  const set = new Set(rawRoles)
  for (const [alias, canonical] of Object.entries(ROLE_ALIASES)) {
    if (set.has(alias)) set.add(canonical)
  }
  return set
}

export interface Permissions {
  /** Roles crudos del usuario autenticado (ya con alias resueltos), para casos puntuales. */
  roles: Set<string>
  hasRole: (role: RoleId) => boolean
  hasAnyRole: (roles: RoleId[]) => boolean
  isSystemManager: boolean
  isAuditor: boolean
  /** ¿Puede VER el módulo (pantalla/menú)? */
  canView: (module: ModuleKey) => boolean
  /** ¿Puede MUTAR (crear/editar/someter/cancelar/eliminar) dentro del módulo? */
  canMutate: (module: ModuleKey) => boolean
}

export function usePermissions(): Permissions {
  const rawRoles = useAuthStore((s) => s.user?.roles ?? [])
  const roles = normalizeRoles(rawRoles)

  const hasRole = (role: RoleId) => roles.has(role)
  const hasAnyRole = (candidates: RoleId[]) => candidates.some((r) => roles.has(r))
  const isSystemManager = hasRole('System Manager' as RoleId)

  function canView(module: ModuleKey): boolean {
    if (isSystemManager) return true
    return hasAnyRole(PERMISSIONS_MATRIX[module].view)
  }

  function canMutate(module: ModuleKey): boolean {
    if (isSystemManager) return true
    const entry = PERMISSIONS_MATRIX[module]
    return hasAnyRole(entry.mutate ?? entry.view)
  }

  return {
    roles,
    hasRole,
    hasAnyRole,
    isSystemManager,
    isAuditor: hasRole('Auditor' as RoleId),
    canView,
    canMutate,
  }
}
```

`System Manager` siempre pasa todo (`isSystemManager` es el techo, igual que hoy en
`useIsSystemManager`) — así ningún módulo nuevo puede quedar accidentalmente bloqueado para el
admin del tenant por un olvido en la matriz.

---

## 4. Componente `<AccessGuard>`

Reemplaza el bloque repetido "Acceso restringido" (`ShieldOff` + `empty-state`) que hoy está
copiado a mano en `RolesPage.tsx`, `RoleDetailPage.tsx` y `PermisosPage.tsx`. Crear
`src/components/shared/AccessGuard.tsx`:

```tsx
// src/components/shared/AccessGuard.tsx
import type { ReactNode } from 'react'
import { ShieldOff } from 'lucide-react'
import { PageHeader } from '@/components/shared/PageHeader'
import { usePermissions } from '@/shared/hooks/usePermissions'
import type { ModuleKey } from '@/shared/permissions/matrix'

interface AccessGuardProps {
  module: ModuleKey
  title: string
  description?: string
  children: ReactNode
}

/** Envuelve una página completa: si el usuario no puede ver el módulo, muestra "Acceso restringido". */
export function AccessGuard({ module, title, description, children }: AccessGuardProps) {
  const { canView } = usePermissions()

  if (!canView(module)) {
    return (
      <div className="page-container">
        <PageHeader title={title} description={description} />
        <div className="empty-state">
          <span className="empty-icon"><ShieldOff size={20} /></span>
          <p className="empty-title">Acceso restringido</p>
          <p className="empty-sub">Tu usuario no tiene un rol con acceso a esta sección.</p>
        </div>
      </div>
    )
  }

  return <>{children}</>
}
```

Para gatear un botón puntual dentro de una página ya visible (ej. "Someter" en `InvoiceDetail.tsx`),
no se usa `<AccessGuard>` (es de página completa) — se usa `canMutate('facturacion')` directo en el
JSX: `{canMutate('facturacion') && <button ...>Someter</button>}`.

---

## 5. Fase 2 — migrar `useIsSystemManager()` y el menú de `AppLayout`

No romper el hook viejo de golpe — migrar en el mismo PR que introduce la fundación, son cambios
chicos y acotados:

1. `src/features/config/RolesPage.tsx`, `RoleDetailPage.tsx`, `PermisosPage.tsx`: reemplazar
   `useIsSystemManager()` + el bloque manual de "Acceso restringido" por
   `<AccessGuard module="roles" .../>` (o `"permisos"` según corresponda). El `enabled: isSystemManager`
   de cada `useQuery` pasa a `enabled: canView('roles')` (o el módulo que aplique).
2. `src/components/layout/AppLayout.tsx:496,828`: reemplazar
   `user?.roles?.includes("System Manager")` por `usePermissions().isSystemManager`, y extender
   `ADMIN_ONLY_PATHS` para que en vez de una lista fija de paths ocultos, cada entrada del menú
   lateral se filtre con `canView(moduleKeyDeLaRuta)` — esto es lo que finalmente hace que Sales
   User deje de ver "Compras" en el menú, etc. (hoy el menú no filtra nada salvo esos 3 paths).
3. `src/shared/hooks/useIsSystemManager.ts` puede quedar como wrapper delgado
   (`usePermissions().isSystemManager`) por compatibilidad, o eliminarse y actualizar los 3 imports
   — preferible eliminarlo para no dejar dos formas de preguntar lo mismo.

---

## 6. Fase 3 — rollout por botón en módulos de negocio

Esto es deliberadamente la fase más grande y se deja para un PR (o varios) aparte, módulo por
módulo, usando el patrón `canMutate('<module>') && <button>`. Orden sugerido (de mayor a menor
impacto de negocio, según lo que ya se conversó):

1. **Auditor primero** — es el caso más simple de verificar visualmente (todo visible, cero
   botones de mutación) y sirve de humo test del hook en los ~12 módulos con botones de mutación
   listados en el análisis previo (Facturación, Compras, Gastos, Devoluciones, Cotizaciones,
   Pedidos, Transferencias, Cobros, Pagos, Asientos, Clientes/Proveedores).
2. **Cajero POS** — requiere además filtrar `InvoicesPage.tsx` por turno actual + usuario (no es
   solo ocultar/mostrar, es un filtro de datos nuevo — no cubierto por `usePermissions()` solo).
3. **Botón "Aplicar a CxP"** en `DevolucionDetail.tsx` (`ApplyToCxpModal.tsx`) — `canMutate('pagosCxP')`
   O `canMutate('devolucionesCompra')` (Purchase Manager y Accounts Manager, confirmado).
4. Resto de módulos de venta/compra/inventario/contabilidad.
5. **Ajustes Avanzados por tab** — cada tab de `AjustesAvanzadosPage.tsx` necesita su propio
   `canMutate('ajustesAvanzados')` combinado con un chequeo adicional de "es el manager de ESTE tab
   específico" (Accounts Manager solo edita tab Cuentas, no Ventas) — esto no lo cubre la matriz
   genérica de módulo único; requiere una sub-matriz `tab → roles` dentro de ese archivo o extender
   `ModuleAccess` con variantes. Diseñar en detalle cuando se llegue a esta fase.

---

## 7. Notas y riesgos conocidos

- **Confirmar el shape real de `GET /api/v1/roles`** antes de depender de él en cualquier UI nueva
  — `src/shared/api/usuarios.ts:46-50` tiene un comentario que dice que el backend devuelve
  `string[]`, pero el tipo declarado es `Array<{id,label}>`. Este plan NO depende de ese endpoint
  (usa `user.roles: string[]` de la sesión autenticada, que sí es consistente), pero cualquier
  pantalla de administración de roles que lo consuma debe verificarlo primero.
- **`CuentasPorPagarPage.tsx`** vive en `src/features/catalog/` pero funcionalmente es CxP — al
  migrar esta página a `canView('pagosCxP')`, considerar también moverla de carpeta para que el
  import quede coherente con su dueño real.
- **`rolesCancelacionFactura` / `rolesCierreCajaAjena`** (listas configurables en `ConfigPage.tsx`)
  son un concepto de negocio por tenant, evaluado en el backend — no forman parte de esta matriz de
  UI y no se deben mezclar con `PERMISSIONS_MATRIX`.
- **Ambigüedades resueltas por el usuario del proyecto** que ya están reflejadas en la matriz de
  arriba y no deben re-discutirse: Item Manager = dueño de catálogo (Stock Manager/User solo
  lectura de catálogo); Cajero POS ve solo sus ventas del turno actual (requiere filtro extra, no
  solo `usePermissions()`); "Aplicar a CxP" = Purchase Manager Y Accounts Manager, nunca Purchase
  User; Report Manager/Prepared Report User/Analytics/Dashboard Manager son aditivos sobre Reportes;
  reglas de precio = Item Manager Y Sales Manager; plantillas de factura/notificaciones = System
  Manager; Ajustes Avanzados = System Manager + manager del área de cada tab.
