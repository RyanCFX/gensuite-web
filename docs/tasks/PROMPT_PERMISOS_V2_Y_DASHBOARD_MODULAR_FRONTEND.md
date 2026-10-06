# Prompt para el agente de frontend: Permisos v2 (pantallas, componentes, filtros) y dashboard modular

> **Para quien recibe este documento:** sos el agente que implementa el frontend de GenSuite
> (React). No tienes memoria de ninguna conversación previa. Todo lo que necesitás está en este
> documento y en el `openapi.json` del repo del frontend, que ya trae la documentación
> actualizada de TODOS los endpoints que se mencionan acá (tag **"Permisos v2 (acceso)"** y
> tag **Dashboard**). Si algo de este documento contradice el `openapi.json`, gana el
> `openapi.json` en cuanto a forma de los DTO, y este documento en cuanto a reglas de UI. Si
> encontrás una contradicción, anotala en tu resumen final.
>
> El backend (BFF NestJS) **ya está implementado y desplegable**. No hay nada que negociar con
> backend salvo lo marcado como *pendiente*. No inventes endpoints: si necesitás algo que no
> existe, dejalo anotado y seguí.
>
> Este documento **extiende** (no reemplaza) `docs/frontend/PROMPT_PERMISOS_FRONTEND.md` del
> backend, que describe el sistema actual por acciones (`GET /me/permissions`,
> `src/shared/permissions/rutas.ts`, `src/shared/features/catalog.ts`). Todo lo que ya hace el
> frontend con ese sistema **sigue funcionando** y no hay que romperlo.

---

## 0. Resumen en 12 líneas (leelo aunque sea lo único que leas)

1. Hay un sistema de permisos nuevo ("v2") organizado en **Módulo → Pantalla → Componente**.
   Un componente es de tipo `vista`, `accion`, `filtro`, `exportar` o `widget` (reporte del
   dashboard).
2. Cada tenant tiene un **modo**: `off` (sistema viejo), `sombra` (sistema viejo; v2 solo se
   calcula y se loguea) o `activo` (manda v2). Lo leés en `GET /me/acceso` → `data.modo`.
3. **`GET /me/permissions` sigue siendo la fuente del mapa `acciones`** en los tres modos. En
   `activo` el backend lo llena desde v2, así que el gating actual de rutas y botones funciona
   sin cambios.
4. **`GET /me/acceso`** agrega lo nuevo: pantallas, componentes (incluye filtros y widgets),
   recursos de lookup y `filtrosBloqueados`. Se pide al iniciar sesión y cuando cambie `version`.
5. **Filtros:** con v2 activo, mandar un query param de filtro que el usuario no tiene →
   `403 FILTRO_NO_PERMITIDO`. El frontend tiene que **esconder** esos filtros usando
   `filtrosBloqueados`, y nunca mandarlos.
6. **Selects/lookups:** los selects de formularios y filtros deben alimentarse de
   `GET /opciones/:recurso` (lista mínima `{value,label}`), NO de los listados de
   administración (`/customers`, `/suppliers`, `/config/almacenes`…). Así tener el filtro
   "Sucursal" en Facturas **no** requiere acceso a la pantalla de Sucursales.
7. **Dashboard modular:** se arma con `GET /dashboard/catalogo` (tipos → reportes que el
   usuario puede ver Y el tenant tiene contratados) y cada tarjeta pide
   `GET /dashboard/widgets/:key`. `GET /dashboard/summary` sigue existiendo (compatibilidad),
   con `null` en los bloques que el usuario no ve.
8. **Pantalla de administración nueva** "Permisos" (Configuración → Permisos): perfiles de
   acceso, árbol Módulo → Pantalla → Componente con "completa / excepto", plantillas,
   asignación a usuarios con excepciones, "¿por qué no ve esto?" (explicación), auditoría,
   migrar y sincronizar roles. Gate: acción `config.acceso.gestionar`.
9. **Usuarios:** en modo `activo`, invitar/editar usuarios usa **perfiles de acceso**
   (`perfilesAcceso`), NO roles ni Role Profiles de ERPNext (`400 ACCESO_V2_ACTIVO`).
10. Manejar los códigos de error nuevos (§9): `FILTRO_NO_PERMITIDO`, `RECURSO_NO_PERMITIDO`,
    `WIDGET_NO_PERMITIDO`, `WIDGET_NO_CONTRATADO`, `ULTIMO_ADMINISTRADOR`, etc.
11. El JWT **ya no trae** `ak`/`ask` (credenciales de ERPNext). Si el frontend leía algo del
    payload del JWT más allá de `email`/tenant, revisalo (§10).
12. Nada de esto es seguridad del lado del cliente: el backend aplica todo. El frontend
    esconde para que la UI sea exacta y no haya 403 a mitad de un flujo.

---

## 1. Contexto: por qué existe esto

El sistema actual de permisos es por **acción** (`ventas.factura.anular`, `config.almacen.editar`…)
y cada acción se evalúa contra los permisos de ERPNext (DocPerm: rol × doctype × read/write/…).
Tenía tres problemas que el negocio pidió resolver:

1. **Granularidad por datos de ERPNext, no por pantalla.** Dar "Caja" implicaba dar "leer
   facturas", y eso abría el listado de Facturas y Notas de crédito porque comparten el mismo
   doctype (`Sales Invoice.read`). No se podía dar una pantalla sin la otra.
2. **Filtros y selects arrastraban módulos enteros.** Para mostrar el filtro "Sucursal" en el
   listado de facturas, el usuario necesitaba poder listar sucursales, que es la pantalla de
   administración de Sucursales. Tener el filtro ≠ tener el módulo.
3. **El dashboard era todo o nada**, y lo que un tenant tiene contratado (plan) no se reflejaba
   en qué reportes del dashboard ve.

v2 resuelve esto con permisos propios del BFF por pantalla y componente, con ERPNext como
**techo** (el backend deriva los roles de ERPNext mínimos a partir de los perfiles v2 y se los
asigna al usuario; el frontend no tiene que hacer nada con eso).

### 1.1 Jerarquía

```
Módulo            ventas
└─ Pantalla       ventas.factura            ("Facturas")
   ├─ Componente  ventas.factura.listar     tipo=vista   ("Ver listado")
   ├─ Componente  ventas.factura.crear      tipo=accion  ("Nueva")
   ├─ Componente  ventas.factura.anular     tipo=accion  ("Anular")
   ├─ Componente  ventas.factura.imprimir   tipo=exportar
   ├─ Componente  ventas.factura.filtro.branch    tipo=filtro, parametro="branch"   ("Filtrar por sucursal")
   └─ Componente  ventas.factura.filtro.customer  tipo=filtro, parametro="customer" ("Filtrar por cliente")

Módulo            dashboard
└─ Pantalla       dashboard.ventas          (un "tipo de reporte")
   ├─ Componente  dashboard.ventas.total          tipo=widget
   ├─ Componente  dashboard.ventas.grafico        tipo=widget
   ├─ Componente  dashboard.ventas.top-productos  tipo=widget
   └─ Componente  dashboard.ventas.top-clientes   tipo=widget
```

- **La clave de componente de tipo acción/vista/exportar es exactamente el id de acción de
  siempre** (`ventas.factura.anular`). Es el mismo string que ya usás con
  `acciones['ventas.factura.anular']`.
- **La pantalla es el id de acción sin el último segmento** (`ventas.factura.anular` →
  `ventas.factura`). El módulo es el primer segmento (con alguna excepción: tomalo siempre del
  catálogo, no lo calcules).
- Los **filtros** tienen clave `<pantalla>.filtro.<queryParam>`: el último segmento es
  **exactamente** el nombre del query param del endpoint (`branch`, `customer`, `fromDate`,
  `status`…), tal cual figura en el `openapi.json`.
- Los **widgets** son los reportes del dashboard: `dashboard.<tipo>.<reporte>`.
- Hay una acción **virtual** `dashboard.ver`: es efectiva si el usuario tiene al menos un
  widget. Es el gate de la ruta `/dashboard`.
- Los **recursos** (`lookup.sucursales`, `lookup.clientes`…) no son componentes: son las listas
  mínimas para selects. Se habilitan solos cuando el usuario tiene un componente que depende de
  ellos (ej. `ventas.factura.filtro.branch` → `lookup.sucursales`).

### 1.2 Modos del tenant

| `modo`    | Qué aplica el backend                             | Qué usa el frontend                                                                 |
|-----------|---------------------------------------------------|--------------------------------------------------------------------------------------|
| `off`     | Sistema viejo (DocPerm)                            | `/me/permissions` como hoy. `/me/acceso` existe pero es solo informativo.            |
| `sombra`  | Sistema viejo; v2 se calcula y se loguea en server | Igual que `off`. (Opcional: una marca "Previsualización v2" en la admin de permisos.) |
| `activo`  | **v2**: acciones, filtros, recursos y widgets       | `/me/permissions` (acciones) **+** `/me/acceso` (filtros, recursos, pantallas, widgets). |

El modo lo cambia **GenSuite Control** (la consola de operación de la plataforma), no el tenant.
El frontend no tiene forma de cambiarlo.

**Regla práctica para no ramificar todo el código por modo:**

- Botones, rutas, menús → seguí usando `acciones[...]` de `/me/permissions` en todos los modos.
- Filtros → en `activo` usá `filtrosBloqueados` de `/me/acceso`; en `off`/`sombra` no hay
  filtros bloqueados (tratá `filtrosBloqueados` como `{}`).
- Selects → usá `/opciones/:recurso` en **todos** los modos (funciona en los tres; ver §5.3).
- Dashboard → usá `/dashboard/catalogo` + `/dashboard/widgets/:key` en **todos** los modos (el
  catálogo del dashboard respeta el modo solo).

---

## 2. Endpoint `GET /api/v1/me/acceso`

Headers: `Authorization: Bearer <jwt>`, `X-Tenant: <slug>`. Sin permisos especiales (es
autoservicio: cada usuario puede leer el suyo).

Respuesta (ejemplo real, usuario "cajero" con un perfil que da Facturas + Caja + Dashboard de
ventas, **menos** el filtro de sucursal):

```json
{
  "success": true,
  "data": {
    "modo": "activo",
    "version": "236.61",
    "modulos": ["caja", "dashboard", "ventas"],
    "pantallas": ["caja", "dashboard.ventas", "ventas.factura"],
    "componentes": [
      "caja.cobrar", "caja.descartar", "caja.listar",
      "dashboard.ventas.grafico", "dashboard.ventas.top-clientes",
      "dashboard.ventas.top-productos", "dashboard.ventas.total", "dashboard.ver",
      "ventas.factura.anular", "ventas.factura.crear", "ventas.factura.listar",
      "ventas.factura.filtro.customer", "ventas.factura.filtro.fromDate",
      "ventas.factura.filtro.status", "ventas.factura.filtro.toDate", "…"
    ],
    "recursos": [
      "lookup.almacenes", "lookup.articulos", "lookup.clientes",
      "lookup.metodos-pago", "lookup.monedas", "lookup.sucursales", "…"
    ],
    "filtrosBloqueados": {
      "ventas.factura": ["branch"]
    }
  }
}
```

Campos:

| Campo               | Tipo                         | Uso                                                                                                                                                                                                                  |
|---------------------|------------------------------|------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| `modo`              | `'off' \| 'sombra' \| 'activo'` | Ver §1.2.                                                                                                                                                                                                         |
| `version`           | string opaco                 | Cambia cuando cambia **cualquier cosa** que afecte el acceso del tenant (catálogo, perfiles, grants, asignaciones, features contratados, modo). Compará por igualdad; **no** lo parsees.                            |
| `modulos`           | string[]                     | Módulos con al menos una pantalla efectiva. Útil para el menú de primer nivel.                                                                                                                                     |
| `pantallas`         | string[]                     | Pantallas con al menos un componente efectivo.                                                                                                                                                                      |
| `componentes`       | string[]                     | Todos los componentes efectivos (vistas, acciones, filtros, exportar, widgets, y el virtual `dashboard.ver`).                                                                                                        |
| `recursos`          | string[]                     | Recursos de `/opciones/:recurso` permitidos (con prefijo `lookup.`).                                                                                                                                                |
| `filtrosBloqueados` | `Record<pantalla, queryParam[]>` | Por pantalla efectiva, los **query params** de filtro que el usuario NO puede enviar. Solo lista pantallas a las que el usuario tiene acceso; una pantalla sin acceso no aparece (ni hace falta: no la ve). |

### 2.1 Dónde guardarlo y cuándo refrescarlo

- Pedilo **junto con `/me/permissions`** después del login, del `switch-tenant` y al recargar la
  app. Guardalo en el mismo store/contexto de permisos que ya existe (convertí los arrays a
  `Set` para consultas O(1)).
- **Refresco:** guardá `version`. Volvé a pedir `/me/acceso` **y** `/me/permissions` cuando:
  - la ventana recupera el foco y pasaron más de 60 s desde el último pedido,
  - recibís un 403 con código `PERMISO_INSUFICIENTE`, `FILTRO_NO_PERMITIDO`,
    `RECURSO_NO_PERMITIDO` o `WIDGET_NO_PERMITIDO` (el acceso pudo haber cambiado),
  - el usuario guarda algo en la pantalla de administración de permisos (§7) — si se editó a sí
    mismo, su UI tiene que reflejarlo al instante,
  - (opcional) un polling liviano cada 5 min que compare `version` y solo recargue si cambió.
- No hay evento en tiempo real para esto (el socket de tiempo real no emite cambios de
  permisos). *Pendiente, no lo implementes.*

### 2.2 Helpers sugeridos

Creá (o extendé) `src/shared/permissions/` con algo así — ajustá nombres al estilo del repo:

```ts
type Acceso = {
  modo: 'off' | 'sombra' | 'activo';
  version: string;
  modulos: Set<string>;
  pantallas: Set<string>;
  componentes: Set<string>;
  recursos: Set<string>;
  filtrosBloqueados: Record<string, string[]>;
};

// ¿Puede usar el filtro `param` en la pantalla `pantalla`?
function puedeFiltrar(acceso: Acceso, pantalla: string, param: string): boolean {
  if (acceso.modo !== 'activo') return true;
  return !(acceso.filtrosBloqueados[pantalla] ?? []).includes(param);
}

// ¿Puede ver el reporte del dashboard `key`?  (en todos los modos)
function puedeVerWidget(acceso: Acceso, key: string): boolean {
  return acceso.componentes.has(key);   // pero el dashboard se arma con /dashboard/catalogo, ver §6
}

// ¿Puede pedir /opciones/:recurso?
function puedeConsultar(acceso: Acceso, recurso: string): boolean {
  if (acceso.modo !== 'activo') return true; // en off/sombra el backend decide con DocPerm
  const key = recurso.startsWith('lookup.') ? recurso : `lookup.${recurso}`;
  return acceso.recursos.has(key);
}

// Hook: usePuedeFiltrar('ventas.factura') => (param) => boolean
```

`puedeAccion(id)` sigue siendo `acciones[id]` de `/me/permissions` como hoy.

---

## 3. Filtros protegidos

### 3.1 Qué es un filtro protegido

Todo query param de un endpoint de **listado/reporte** que filtra datos (no paginación, no
orden, no búsqueda libre) es un componente `filtro`. Ejemplos en `GET /invoices`: `branch`,
`customer`, `status`, `fromDate`, `toDate`, `ncfType`, `paymentStatus`, `moneda`… Los parámetros
**libres** (nunca bloqueados) son, entre otros: `limit`, `offset`, `page`, `pageSize`, `search`,
`q`, `sort`, `order`, `orderBy`, `format`, `period`. La lista exacta no importa: el backend te
dice cuáles están bloqueados.

### 3.2 Qué pasa si mandás uno bloqueado (modo `activo`)

```http
GET /api/v1/invoices?branch=SUC-NORTE
→ 403
{
  "success": false,
  "error": {
    "code": "FILTRO_NO_PERMITIDO",
    "message": "No tiene permiso para filtrar por sucursal.",
    "statusCode": 403,
    "details": { "filtros": [ { "parametro": "branch", "componente": "ventas.factura.filtro.branch" } ] }
  }
}
```

El backend **no ignora** el parámetro en silencio: rechaza la llamada. Por eso el frontend
tiene que garantizar que nunca lo mande.

### 3.3 Qué tiene que hacer cada pantalla con filtros

Para **cada** pantalla con barra de filtros (usá como inventario el archivo
`PANTALLAS_Y_DEPENDENCIAS_API.md` y `src/shared/permissions/rutas.ts`):

1. Determiná la **clave de pantalla** v2. Es el id de acción del gate sin el último segmento:
   gate `ventas.factura.listar` → pantalla `ventas.factura`. Si la pantalla tiene varias
   acciones, todas comparten el mismo prefijo. Si no estás seguro, buscá la clave en
   `GET /acceso/catalogo` (con un usuario admin) o en el `openapi.json` (cada endpoint de
   listado documenta sus query params).
2. **No renderices** el control de un filtro si `!puedeFiltrar(acceso, pantalla, param)`. No lo
   deshabilites: escondelo (un filtro deshabilitado sin explicación confunde).
3. **Saneá la URL/estado**: si la pantalla restaura filtros desde la URL, `localStorage` o
   "filtros guardados", eliminá los bloqueados **antes** de llamar al API. Un enlace compartido
   por otro usuario puede traer `?branch=…`.
4. **Filtros por defecto**: si la pantalla pone un valor por defecto a un filtro (ej. sucursal
   actual del usuario), no lo pongas si está bloqueado. Ojo con `branch`: el backend ya aplica
   el **data-scope** de sucursales/almacenes del usuario sin que se lo pidas (el usuario solo ve
   lo de sus sucursales asignadas). Quitar el filtro no le muestra más datos de los que puede ver.
5. Si igual llega un `FILTRO_NO_PERMITIDO` (desfase de versión): quitá los parámetros listados
   en `details.filtros[].parametro`, refrescá `/me/acceso` y reintentá **una sola vez**. Mostrá
   un aviso discreto ("Se quitó el filtro Sucursal: no tiene permiso para usarlo").
6. Exportar/imprimir un listado filtrado usa los mismos filtros: aplicá la misma limpieza.

### 3.4 Filtros en reportes (`/reportes/*`)

Los reportes también son pantallas (`reportes.<reporte>`), y sus parámetros (`fromDate`,
`branch`, `customer`…) son filtros protegidos igual que en los listados. Misma regla.

---

## 4. Rutas, menús y botones

### 4.1 Lo que NO cambia

- `src/shared/permissions/rutas.ts` (ruta → acción) y la lógica de botones con
  `acciones[id]` siguen igual. En modo `activo`, `/me/permissions.data.acciones` ya viene
  calculado desde v2.
- `/me/permissions.data.roles` y `.doctypes` siguen existiendo pero en modo `activo` son **solo
  diagnóstico** (son el "techo" de ERPNext). **No los uses para decidir UI.** Si hoy hay gates
  `solo-SM` (rol System Manager), cambialos a la acción `config.acceso.gestionar` u otra acción
  del catálogo cuando exista una equivalente; si no existe, dejalos y anotalo.
- Features del tenant (`GET /me/features`, `src/shared/features/catalog.ts`) siguen igual. v2
  ya filtra por features en el backend (un componente de un módulo no contratado nunca es
  efectivo), así que en `activo` el doble chequeo es redundante pero inofensivo.

### 4.2 Lo nuevo

- **Menú lateral**: si hoy calcula visibilidad de grupos por "alguna acción del grupo", está
  bien. Alternativa más barata en `activo`: `acceso.modulos.has('<modulo>')`. No es obligatorio.
- **Pantallas que comparten doctype**: con v2, Caja (`caja`) y Facturas (`ventas.factura`) y
  Notas de crédito (`ventas.nota-credito`) son independientes. Revisá que:
  - la ruta de Caja se gatee con acciones `caja.*`, NO con `ventas.factura.listar`;
  - el formulario de "Nueva factura" se gatee con `ventas.factura.crear`, NO con
    `ventas.factura.listar` (hoy varios formularios de creación se gatean con la acción de
    listar; un usuario puede tener "crear" sin "listar" y viceversa);
  - los detalles (`/facturas/:id`) se gateen con la acción de ver/listar de su pantalla.
- **Dashboard**: la ruta `/dashboard` se gatea con `dashboard.ver` (ya es así). Si el usuario no
  la tiene, la página de inicio post-login debe ser la primera ruta a la que tenga acceso
  (probablemente ya lo hace; verificalo con un usuario sin widgets).

---

## 5. Selects y lookups: `GET /api/v1/opciones/:recurso`

### 5.1 El problema que resuelve

Hoy un select de "Sucursal" en el filtro de Facturas llama a `GET /config/sucursales` (o
similar), que es el listado de **administración** de sucursales y exige permiso sobre esa
pantalla. Con v2, un cajero puede tener el filtro Sucursal sin tener la pantalla Sucursales.

`/opciones/:recurso` devuelve la lista **mínima** para un select (`value` + `label`), autorizada
por dependencia: si el usuario tiene algún componente que usa ese recurso, puede consultarlo.

### 5.2 Contrato

```http
GET /api/v1/opciones/{recurso}?q=<texto opcional>&limit=<1..100, default 50>
Authorization: Bearer …
X-Tenant: …
```

`recurso` es la clave **sin** el prefijo `lookup.` (también acepta con prefijo). Valores:

| recurso              | Para qué selects                                   |
|----------------------|----------------------------------------------------|
| `sucursales`         | Sucursal / branch                                  |
| `almacenes`          | Almacén / warehouse                                |
| `clientes`           | Cliente                                            |
| `proveedores`        | Proveedor                                          |
| `articulos`          | Artículo / item                                    |
| `usuarios`           | Usuario, vendedor, cajero, responsable             |
| `metodos-pago`       | Método de pago / mode of payment                   |
| `departamentos`      | Departamento                                       |
| `centros-costo`      | Centro de costo                                    |
| `aseguradoras`       | Aseguradora (farmacia/ARS)                         |
| `categorias`         | Categoría de artículo (item group)                 |
| `marcas`             | Marca                                              |
| `monedas`            | Moneda                                             |
| `cuentas-bancarias`  | Cuenta bancaria                                    |
| `grupos-clientes`    | Grupo de clientes                                  |
| `grupos-proveedores` | Grupo de proveedores                               |
| `uom`                | Unidad de medida                                   |
| `listas-precio`      | Lista de precios                                   |
| `roles`              | Rol                                                |
| `cuentas`            | Cuenta contable                                    |
| `cajas-pos`          | Caja / perfil POS                                  |

Respuesta:

```json
{ "success": true, "data": [ { "value": "SUC-NORTE", "label": "Sucursal Norte" }, … ] }
```

- `value` es el identificador que espera el endpoint de negocio (el `name` de ERPNext: el código
  de cliente, el nombre del almacén, etc.). Mandalo tal cual en el query param/body.
- `label` es el texto a mostrar.
- `q` busca por nombre/código (y RNC en clientes/proveedores). Usalo para selects con búsqueda
  (SearchSelect): debounce de ~300 ms, mínimo 0–2 caracteres según la entidad.
- Sin paginación por offset: es una lista corta para un select (tope 100). Para listas largas
  (clientes, artículos) usá siempre `q`.
- **Data-scope estricto**: `sucursales` y `almacenes` solo devuelven los asignados al usuario
  (`/usuarios/{email}/sucursales`, `/usuarios/{email}/almacenes-permitidos`). **Si el usuario no
  tiene ninguna asignada, la lista viene vacía** (`[]`), no "todas". Mostrá un estado vacío
  claro ("No tiene sucursales asignadas") en vez de un select vacío mudo.

Error:

```json
403 { "success": false, "error": { "code": "RECURSO_NO_PERMITIDO",
      "message": "No tiene acceso a la lista de proveedores.", "statusCode": 403,
      "details": { "recurso": "lookup.proveedores" } } }
```

### 5.3 Qué hay que migrar

1. Buscá en `src/shared/api/` y en los formularios/filtros **todos** los selects que se llenan
   con un listado de administración (usá `PANTALLAS_Y_DEPENDENCIAS_API.md`, columna "Consultas
   GET", marcas `SS`/`S`/`N`). Ejemplos típicos: `/config/almacenes`, `/config/sucursales`,
   `/customers?limit=…` para un select, `/suppliers`, `/catalog/items` en un buscador de
   artículos de un filtro, `/usuarios/lookup`, `/config/metodos-pago`, `/config/uom`,
   `/config/listas-precio`, `/config/grupos-clientes`…
2. Creá un componente/hook reutilizable, p. ej. `useOpciones(recurso, { q, enabled })` +
   `<OpcionesSelect recurso="sucursales" …/>`, con caché por `(tenant, recurso, q)` de algunos
   minutos (react-query o lo que use el repo).
3. Reemplazá **solo los selects** (elegir un valor). **No** reemplaces:
   - las pantallas de administración de esa entidad (el listado de Clientes sigue usando
     `/customers`),
   - los buscadores que necesitan más datos que `value`/`label` (ej. el buscador de artículos
     del POS que necesita precio, stock, impuestos: ese sigue con su endpoint de negocio),
   - los autocompletados que ya usan un endpoint específico de la operación (ej. un endpoint
     `…/lookup` de un módulo) si trae datos extra que el formulario necesita. En ese caso
     dejalo y anotalo.
4. En modo `activo`, antes de llamar, chequeá `puedeConsultar(acceso, recurso)`. Si es `false`,
   no renderices el select (si es un filtro) o mostrá un campo de solo lectura/texto libre si
   es un formulario y el campo es opcional. Si el campo es obligatorio y no puede consultarlo,
   es un problema de configuración de perfiles: mostrá el error del backend al guardar.
5. En modo `off`/`sombra` `/opciones` también funciona (el backend evalúa DocPerm), así que
   podés migrar los selects **sin** ramificar por modo.

---

## 6. Dashboard modular

### 6.1 Modelo

- El dashboard se organiza en **tipos de reporte** (Ventas, Compras, Gastos, Cuentas por
  cobrar, Cobros e ingresos, Finanzas, Inventario, Actividad) y **reportes** dentro de cada tipo.
- Cada reporte es a la vez:
  - algo que el **tenant tiene contratado** (lo prende/apaga GenSuite Control por plan), y
  - un **permiso** (`widget`) que el admin del tenant da por usuario/perfil.
- Visible = contratado **∩** permitido. El backend ya hace la intersección: el frontend nunca
  tiene que cruzar features por su cuenta para el dashboard.
- Pueden aparecer reportes nuevos en el futuro sin cambios de backend en los endpoints: la lista
  sale de `GET /dashboard/catalogo`. El frontend necesita un **componente visual por key**; una
  key desconocida se ignora (no se rompe la página; log de consola en dev).

### 6.2 `GET /api/v1/dashboard/catalogo`

Gate: `dashboard.ver`. Devuelve solo tipos con al menos un reporte visible para el usuario,
en orden:

```json
{
  "success": true,
  "data": [
    {
      "key": "dashboard.ventas",
      "nombre": "Ventas",
      "descripcion": "Totales, gráfico y tops de ventas.",
      "reportes": [
        { "key": "dashboard.ventas.total", "nombre": "Total de ventas", "descripcion": "Ventas del período, cantidad de facturas y variación contra el período anterior." },
        { "key": "dashboard.ventas.grafico", "nombre": "Gráfico de ventas", "descripcion": "Ventas de contado y a crédito por día/mes." },
        { "key": "dashboard.ventas.top-productos", "nombre": "Productos más vendidos", "descripcion": "Top de artículos por monto vendido." },
        { "key": "dashboard.ventas.top-clientes", "nombre": "Mejores clientes", "descripcion": "Top de clientes por monto facturado." }
      ]
    },
    { "key": "dashboard.compras", "nombre": "Compras", "descripcion": "…", "reportes": [ … ] }
  ]
}
```

Usá `nombre`/`descripcion` del backend como títulos (GenSuite Control puede personalizarlos).

### 6.3 `GET /api/v1/dashboard/widgets/{key}?period=&limit=`

- `period`: `today | 7d | month | year` (default `month`).
- `limit`: 1–20 (default 5), solo aplica a reportes de lista (tops, actividad, bajo mínimo).
- Respuesta: `{ success, data: <datos del reporte>, meta: { key, period, periodLabel, from, to, currency } }`.
- Errores: `403 WIDGET_NO_PERMITIDO` (el usuario no tiene el permiso), `403 WIDGET_NO_CONTRATADO`
  (el tenant no lo tiene contratado), `404` (key inexistente). Ejemplo:
  `{"code":"WIDGET_NO_PERMITIDO","message":"No tiene permiso para ver \"Total de gastos\" en el dashboard.","details":{"reporte":"dashboard.gastos.total","tipo":"dashboard.gastos"}}`.
  Ante un 403, ocultá la tarjeta y refrescá `/me/acceso` + `/dashboard/catalogo`.

**Forma de `data` por reporte** (`currency` para formatear montos está en `meta.currency`; los
montos del dashboard están en la moneda base de la empresa):

| key                                  | `data`                                                                                                                                  |
|--------------------------------------|-----------------------------------------------------------------------------------------------------------------------------------------|
| `dashboard.ventas.total`             | `{ kpis: { totalVentas: number, numFacturas: number, totalVentasDeltaPct: number \| null } }`                                              |
| `dashboard.ventas.grafico`           | `{ chart: { labels: string[], sales: number[], credits: number[] } }` (sales = total vendido por bucket, credits = pendiente de cobro)   |
| `dashboard.ventas.top-productos`     | `{ topProducts: Array<{ itemCode, itemName, qty, amount, percentage }> }`                                                                |
| `dashboard.ventas.top-clientes`      | `{ topCustomers: Array<{ customer, customerName, total, count }> }`                                                                       |
| `dashboard.compras.total`            | `{ kpis: { totalCompras: number, numCompras: number } }`                                                                                  |
| `dashboard.gastos.total`             | `{ kpis: { totalGastos: number, totalGastosDeltaPct: number \| null } }`                                                                   |
| `dashboard.gastos.mes`               | `{ gastosEsteMes: number }` (mes en curso, independiente de `period`)                                                                    |
| `dashboard.cxc.saldo`                | `{ kpis: { totalPendiente, totalCuentasPorCobrar, numCuentasPorCobrar, cuentasPorCobrarDeltaCount } }` (corte a hoy)                     |
| `dashboard.cobros.total`             | `{ kpis: { totalCobrado, totalIngresos, totalIngresosDeltaPct } }`                                                                        |
| `dashboard.cobros.mes`               | `{ ingresosEsteMes: number }`                                                                                                             |
| `dashboard.finanzas.utilidad`        | `{ kpis: { utilidad: number, utilidadDeltaPct: number \| null } }` (ventas − compras − gastos)                                             |
| `dashboard.finanzas.ingresos-gastos` | `{ ingresosGastosChart: { labels: string[], ingresos: number[], gastos: number[] }, totalGanancias: number }`                             |
| `dashboard.inventario.bajo-minimo`   | `{ lowStockItems: Array<{ item_code, item_name }> }`                                                                                       |
| `dashboard.actividad.reciente`       | `{ recentActivity: Array<{ type: 'invoice_created'\|'invoice_cancelled'\|'payment_received'\|'purchase_registered', id, description, amount, currency, timestamp }> }` |
| `dashboard.actividad.pendientes`     | `{ pendingActions: Array<{ date, type: 'invoice_due'\|'invoice_pending_approval'\|'low_stock'\|'payment_due', reference, description }> }` |

Notas:

- `*DeltaPct` puede ser `null` (período anterior en cero). Mostralo como "—", no como 0 %.
- La actividad reciente y las acciones pendientes vienen **ya filtradas** por los tipos que el
  usuario ve (ej. sin permiso de Compras no aparecen compras registradas). No filtres de nuevo.
- Estos nombres de campo son los mismos que ya usa `GET /dashboard/summary`: podés reutilizar
  los componentes visuales actuales pasándoles el `data` del widget.

### 6.4 `GET /api/v1/dashboard/summary` (compatibilidad)

Sigue existiendo con la forma de siempre (`period`, `periodLabel`, `dateRange`, `kpis`, `chart`,
`ingresosGastosChart`, `totalGanancias`, `ingresosEsteMes`, `gastosEsteMes`, `pendingActions`,
`topProducts`, `topCustomers`, `recentActivity`, `lowStockItems`) **más** `reportes: string[]`
(keys incluidas). Los bloques/KPIs que el usuario no puede ver vienen en **`null`**. Si lo seguís
usando, tratá `null` como "no mostrar la tarjeta", NUNCA como 0.

`/dashboard/top-products`, `/dashboard/top-customers` y `/dashboard/recent-activity` siguen
existiendo y ahora exigen su reporte (`403 WIDGET_*`).

### 6.5 Qué hay que implementar en `DashboardPage`

1. Al montar: `GET /dashboard/catalogo`. Si viene vacío → estado vacío ("No tiene reportes
   disponibles en el dashboard. Pídale acceso a su administrador.").
2. Renderizá una sección por tipo (en el orden recibido) y, dentro, una tarjeta por reporte
   cuya key tenga componente registrado en un mapa `key → Componente`.
3. Cada tarjeta pide su `GET /dashboard/widgets/:key?period=…` **en paralelo e independiente**
   (skeleton propio, error propio, reintento propio). Un reporte que falla no tumba el resto.
4. El selector de período global re-pide todas las tarjetas.
5. **Quitá** del dashboard las llamadas a `/inventory` y `/invoices` que hoy hace
   `DashboardPage` (según `PANTALLAS_Y_DEPENDENCIAS_API.md`). Esos datos ahora vienen de los
   widgets (`dashboard.inventario.bajo-minimo`, `dashboard.actividad.*`). Llamar a esos
   listados exige permisos de otras pantallas y con v2 activo devolverá 403 a usuarios que solo
   tienen dashboard.
6. Personalización por usuario (ocultar/reordenar tarjetas) **no** está en backend. Si ya existe
   algo local (`localStorage`), mantenelo, aplicado sobre la lista del catálogo.
7. Agrupá KPIs chicos en una fila si varios reportes de tipo KPI están visibles (total ventas,
   total compras, total gastos, utilidad, saldo CxC, total cobrado); los gráficos y listas van
   como tarjetas grandes. Es criterio visual tuyo, pero respetá el orden del catálogo dentro de
   cada tipo.

---

## 7. Pantalla de administración: Configuración → Permisos

Ruta sugerida: `/configuracion/permisos` (y subrutas). Gate: `acciones['config.acceso.gestionar']`.
Todos los endpoints de esta sección exigen esa acción. En modo `off`/`sombra` la pantalla
funciona igual (permite **preparar** los perfiles antes de que GenSuite Control active v2):
mostrá un banner según el modo:

- `off`: "Los permisos por pantalla todavía no están activos en su empresa. Puede prepararlos;
  se aplicarán cuando se activen."
- `sombra`: "Modo de prueba: estos permisos se están evaluando pero todavía no se aplican."
- `activo`: sin banner (o "Activo").

Además, en modo `activo`, **ocultá** la pantalla vieja de Role Profiles/roles de ERPNext
(`/usuarios/roles`, CRUD de Role Profile, `/permisos/catalogo`) o marcala "solo lectura /
avanzado": asignar roles de ERPNext a mano ya no aplica (el backend los deriva solo).

### 7.1 Catálogo: `GET /api/v1/acceso/catalogo?otorgable=true|false`

Devuelve **solo lo que el tenant tiene contratado** (features, reportes, dashboard):

```json
{
  "success": true,
  "data": {
    "version": 236,
    "modulos": [
      {
        "key": "ventas", "nombre": "Ventas", "descripcion": "…",
        "pantallas": [
          {
            "key": "ventas.factura", "nombre": "Facturas", "tipo": "operativa",
            "componentes": [
              { "key": "ventas.factura.crear", "tipo": "accion", "nombre": "Nueva", "descripcion": null,
                "parametro": null, "incluirEnCompleta": true, "sensible": false,
                "requiere": [], "recursos": [], "otorgable": true },
              { "key": "ventas.factura.filtro.customer", "tipo": "filtro", "nombre": "Filtrar por cliente",
                "descripcion": null, "parametro": "customer", "incluirEnCompleta": true, "sensible": false,
                "requiere": ["ventas.factura.listar"], "recursos": ["lookup.clientes"], "otorgable": true }
            ]
          }
        ]
      }
    ],
    "recursos": [ { "key": "lookup.sucursales", "nombre": "Sucursales" }, … ]
  }
}
```

- `tipo` de pantalla: `operativa`, `reporte`, `config`, `dashboard` (usalo para iconos o
  agrupar).
- `tipo` de componente: `vista`, `accion`, `filtro`, `exportar`, `widget`.
- `requiere`: otros componentes que este necesita (un filtro requiere la vista del listado).
  Si otorgás un componente sin sus requisitos, **no será efectivo** (no da error al guardar,
  pero la explicación dirá `requisito_faltante`). La UI debe **auto-marcar** los requisitos al
  marcar un componente, y advertir al desmarcar un requisito del que dependen otros marcados.
- `recursos`: lookups que habilita (informativo: "Da acceso a la lista de Clientes para el
  selector"). Mostralo como tooltip.
- `incluirEnCompleta: false`: componente sensible que **no** viene incluido al dar la pantalla o
  el módulo completo; hay que marcarlo explícitamente. Mostralo con un ícono de candado y un
  texto "No se incluye al dar la pantalla completa".
- `otorgable`: con `?otorgable=true`, indica si **quien consulta** puede darlo (anti-escalada:
  nadie puede dar lo que no tiene, salvo el Administrador). Deshabilitá los checkboxes con
  `otorgable: false`, con tooltip "No puede otorgar un permiso que usted no tiene". Pedí
  siempre con `otorgable=true` en la pantalla de edición.
- `version`: para invalidar tu caché del catálogo.

### 7.2 Modelo de grants (lo que se guarda)

```ts
type Grant = {
  nivel: 'modulo' | 'pantalla' | 'componente';
  clave: string;                 // key del catálogo
  efecto: 'permitir' | 'denegar';
  expiraEn?: string;             // ISO; opcional (permisos temporales)
};
```

Semántica (explicala en la UI con textos cortos):

- `permitir` a nivel **módulo** = todo el módulo, **incluidas pantallas y componentes que se
  agreguen en el futuro** (salvo `incluirEnCompleta: false`).
- `permitir` a nivel **pantalla** = toda la pantalla (mismo criterio).
- `permitir` a nivel **componente** = solo ese componente.
- `denegar` en un **perfil** = excepción dentro de ESE perfil ("Facturas completa **excepto**
  el filtro Sucursal"). Si otro perfil del mismo usuario lo permite, gana el permitir.
- `denegar` en un **usuario** = global: gana sobre todos sus perfiles.
- `expiraEn` vencido = el grant se ignora. No se puede **guardar** un grant ya vencido
  (`400 GRANT_VENCIDO`).

### 7.3 Editor de permisos (el componente central)

Construí un editor de árbol reutilizable (se usa para perfiles y para excepciones de usuario):

```
[■] Ventas                                   (módulo)   ○ Nada ● Completo ○ Personalizado
    [■] Facturas                              (pantalla) ○ Nada ○ Completa ● Completa excepto…
        [✓] Ver listado            vista
        [✓] Nueva                  accion
        [✓] Anular                 accion
        [ ] Filtrar por sucursal   filtro      ← excepto (denegar)
        [✓] Filtrar por cliente    filtro      ⓘ habilita lista de Clientes
        [🔒] Ver margen             … (incluirEnCompleta=false: hay que marcarlo a mano)
    [ ] Notas de crédito
```

Por cada módulo y cada pantalla, tres estados:

1. **Nada** → no se emite grant.
2. **Completo/Completa** → un grant `permitir` al nivel módulo/pantalla. Si además hay
   componentes desmarcados → un grant `denegar` por cada uno (**"Completa excepto…"**).
3. **Personalizado** (solo algunos componentes) → un grant `permitir` por componente marcado.

Reglas del editor:

- **Preferí grants de nivel alto**: si el usuario marca todos los componentes de una pantalla,
  guardá `permitir` de pantalla (así recibe también los componentes futuros). Mostrá una
  casilla "Incluir lo que se agregue en el futuro" marcada por defecto en ese caso; si la
  desmarca, guardá los componentes uno por uno.
- Buscador (por nombre de módulo/pantalla/componente) y filtro por tipo (acciones, filtros,
  exportar, dashboard).
- Contador por pantalla ("7 de 12").
- Los widgets del dashboard aparecen como el módulo **Dashboard**, con una pantalla por tipo de
  reporte (Ventas, Compras…) y un componente por reporte. Mismo editor, sin casos especiales.
- Botón **"Vista previa"**: no hay endpoint de "simular" un perfil sin guardarlo; para ver el
  efecto real usá la explicación de un usuario (§7.6) después de guardar.
- Al guardar, el backend valida y puede devolver (todos `400` salvo indicado):
  `CLAVE_INEXISTENTE` (clave que no existe en el catálogo), `COMPONENTE_NO_CONTRATADO` (el
  tenant no lo tiene contratado), `GRANT_VENCIDO`, `PERFIL_INEXISTENTE` (id de perfil que ya no
  existe), `ESCALADA_NO_PERMITIDA` (`403`: dio algo que no tiene). Mostrá el `message` del backend y, si viene `details` con claves, resaltá esas
  filas.

### 7.4 Perfiles de acceso

| Método y ruta                                | Body / query                                            | Respuesta `data`                                    |
|----------------------------------------------|---------------------------------------------------------|-----------------------------------------------------|
| `GET /acceso/plantillas`                     | —                                                        | `[{ key, nombre, descripcion, esSistema, grants[] }]` |
| `GET /acceso/perfiles`                       | —                                                        | `[{ id, nombre, descripcion, plantilla, esSistema, totalUsuarios, grants[] }]` |
| `GET /acceso/perfiles/{id}`                  | —                                                        | `{ id, nombre, descripcion, plantilla, esSistema, totalUsuarios, grants[], createdAt, updatedAt, usuarios: [{ email, firstName, lastName }] }` |
| `POST /acceso/perfiles`                      | `{ nombre, descripcion?, plantilla?, grants? }`          | el perfil creado (misma forma que el detalle)        |
| `PATCH /acceso/perfiles/{id}`                | `{ nombre?, descripcion? }`                              | el perfil                                            |
| `PUT /acceso/perfiles/{id}/grants`           | `{ grants: Grant[], motivo? }` — **lista COMPLETA**      | el perfil                                            |
| `DELETE /acceso/perfiles/{id}`               | —                                                        | `{ message }`                                        |

Pantallas:

1. **Lista de perfiles**: nombre, descripción, cantidad de usuarios, badge "Sistema" si
   `esSistema`. Acciones: ver/editar, duplicar (creá uno nuevo con los mismos grants), eliminar.
2. **Crear perfil**: nombre (obligatorio, ≤150), descripción, y "Partir de una plantilla"
   (select con `GET /acceso/plantillas`: Administrador, Ventas, Cajero POS, Compras, Gastos,
   Inventario, Contabilidad, y las que agregue GenSuite Control). Si elige plantilla, mandá
   `plantilla: key` (el backend copia sus grants); después puede editar el árbol.
3. **Editar perfil**: datos básicos (`PATCH`) + editor de árbol (`PUT …/grants` con la lista
   completa) + lista de usuarios asignados (del detalle). Pedí un **motivo** opcional al
   guardar grants (queda en la auditoría).
4. **Perfil "Administrador"** (`esSistema: true`): tiene todo lo contratado, incluida la gestión
   de permisos. **No se puede editar ni eliminar** (`400 PERFIL_SISTEMA`): mostralo en solo
   lectura, con el árbol todo marcado. Sí se le pueden asignar/quitar usuarios (§7.5).
5. Errores: `409 PERFIL_DUPLICADO` (nombre repetido en el tenant), `409 PERFIL_EN_USO` (eliminar
   un perfil con usuarios: pedile que los reasigne primero; mostrá la lista), `400
   PLANTILLA_INEXISTENTE`, `404` (perfil no encontrado: volvé a la lista).

### 7.5 Acceso de un usuario

| Método y ruta                                          | Body / query                                              | Respuesta `data`                                     |
|--------------------------------------------------------|-----------------------------------------------------------|------------------------------------------------------|
| `GET /acceso/usuarios/{email}`                         | —                                                          | `{ email, perfiles: [{ id, nombre, esSistema }], grants: Grant[] }` |
| `PUT /acceso/usuarios/{email}`                         | `{ perfiles: uuid[], grants?: Grant[], motivo? }`          | igual que el GET                                      |
| `GET /acceso/usuarios/{email}/efectivo?explicar=true`  | —                                                          | ver §7.6                                              |

- `perfiles` **reemplaza** los perfiles asignados. `grants` (excepciones del usuario)
  **reemplaza** las actuales si se envía; si se omite, no se tocan.
- Integralo en el detalle/edición de usuario (pantalla de Usuarios) como una pestaña
  **"Acceso"**: multiselect de perfiles + sección "Excepciones de este usuario" con el mismo
  editor de árbol (acá `denegar` es global y gana sobre sus perfiles; explicalo).
- Un usuario **puede tener varios perfiles**: su acceso es la unión (con las excepciones de cada
  perfil aplicadas dentro de ese perfil).
- `409 ULTIMO_ADMINISTRADOR`: no se puede quitar el perfil Administrador al último usuario que
  lo tiene. Mensaje claro: "Debe haber al menos un administrador de permisos".
- En modo `activo`, al guardar, el backend re-deriva los roles de ERPNext del usuario en
  segundo plano. Puede tardar unos segundos en reflejarse del lado de ERPNext; el acceso del BFF
  cambia al instante.
- Si el usuario editado es el usuario logueado: refrescá `/me/acceso` y `/me/permissions` al
  guardar.

### 7.6 "¿Por qué no ve esto?" — explicación

`GET /acceso/usuarios/{email}/efectivo?explicar=true` devuelve el acceso efectivo de ese
usuario (`modulos`, `pantallas`, `componentes`, `recursos`) y `traza`:

```json
"traza": [
  { "key": "ventas.factura.crear", "pantalla": "ventas.factura", "nombre": "Nueva", "tipo": "accion",
    "estado": "otorgado", "fuentes": ["Cajero"] },
  { "key": "ventas.factura.filtro.branch", "pantalla": "ventas.factura", "nombre": "Filtrar por sucursal",
    "tipo": "filtro", "estado": "denegado_perfil", "fuentes": ["Cajero"] },
  { "key": "catalogo.items.imprimir-etiqueta", "pantalla": "catalogo.items", "nombre": "Imprimir etiqueta",
    "tipo": "exportar", "estado": "sin_otorgar", "fuentes": [] },
  { "key": "catalogo.cuentas-pagar.crear", "pantalla": "catalogo.cuentas-pagar", "nombre": "Nueva",
    "tipo": "accion", "estado": "no_contratado", "fuentes": [] }
]
```

Estados y texto sugerido:

| `estado`             | Texto para el admin                                                                 |
|----------------------|--------------------------------------------------------------------------------------|
| `otorgado`           | "Lo tiene por el perfil {fuentes}" (o "por una excepción del usuario")               |
| `denegado_perfil`    | "El perfil {fuentes} lo excluye"                                                     |
| `denegado_usuario`   | "Excepción del usuario: denegado"                                                    |
| `requisito_faltante` | "Le falta un permiso previo (ej. ver el listado)"                                   |
| `sin_otorgar`        | "Ningún perfil lo incluye"                                                           |
| `no_contratado`      | "Su empresa no tiene contratado este módulo/reporte" (no se puede otorgar)           |

UI: en la pestaña "Acceso" del usuario, un botón "Ver acceso efectivo" que muestre el árbol en
solo lectura con el estado de cada componente (color/ícono) y el motivo en tooltip, con un
buscador ("¿Por qué no puede anular facturas?" → buscar "anular").

### 7.7 Auditoría

`GET /acceso/auditoria?limit=20&offset=0` (paginado, `meta: { total, limit, offset, hasMore }`):

```json
{ "id": "…", "actorEmail": "admin@empresa.do", "accion": "perfil.crear", "sujetoTipo": "perfil",
  "sujetoId": "…", "antes": null, "despues": { "nombre": "Cajero", "grants": [ … ] },
  "motivo": null, "createdAt": "2026-09-30T17:54:14.895Z" }
```

`accion` puede ser (entre otras): `perfil.crear`, `perfil.actualizar`, `perfil.grants`,
`perfil.eliminar`, `usuario.acceso`, `usuario.administrador`. Tratá valores
desconocidos genéricamente. Tabla con fecha, actor, acción (traducida), sujeto, motivo, y un
detalle expandible con un diff simple `antes` vs `despues` (JSON formateado alcanza).
`actorEmail` puede ser `gensuite-control` (cambios hechos por la plataforma).

### 7.8 Herramientas

- `POST /acceso/migrar` `{ reemplazar?: boolean }` → `data: { perfiles: string[], usuarios: number, personalizados: number }`.
  Crea perfiles v2 equivalentes a los Role Profiles actuales de ERPNext y se los asigna a los
  usuarios (reproduce el acceso actual). Idempotente. Botón "Importar desde los perfiles
  actuales" con confirmación; con `reemplazar: true` (checkbox "Sobrescribir perfiles con el
  mismo nombre") pisa los grants de perfiles existentes con ese nombre. Mostrá el resumen.
- `POST /acceso/sincronizar-roles` → re-deriva los roles de ERPNext de todos los usuarios (solo
  tiene efecto en modo `activo`). Botón "Sincronizar con ERPNext" en una sección "Avanzado".
  Mostrá el resumen devuelto.

---

## 8. Usuarios: invitar y editar con v2

- `POST /usuarios` (invitar): el DTO acepta `perfilesAcceso?: uuid[]` además de `roles?` y
  `perfiles?` (Role Profiles de ERPNext).
  - Modo `activo`: mandá **solo** `perfilesAcceso` (al menos uno). Mandar `roles` o `perfiles`
    → `400 ACCESO_V2_ACTIVO`. Sin `perfilesAcceso` → `400 PERFIL_ACCESO_REQUERIDO`.
  - Modo `off`/`sombra`: como hoy (`roles`/`perfiles`); podés además mandar `perfilesAcceso`
    para dejarlo preparado (opcional, recomendable si el admin ya armó perfiles v2).
  - El formulario de invitación en modo `activo` muestra un multiselect de perfiles de acceso
    (`GET /acceso/perfiles`) en lugar de los selects de roles/Role Profiles.
- `PATCH /usuarios/{email}`: en modo `activo` no mandes `roles` ni `perfiles`
  (`400 ACCESO_V2_ACTIVO`); el acceso se edita en la pestaña "Acceso" (§7.5).
- `LIMITE_USUARIOS_ALCANZADO` (ya existía) sigue igual.
- Las pantallas de sucursales/almacenes permitidos del usuario
  (`/usuarios/{email}/sucursales`, `/usuarios/{email}/almacenes-permitidos`) siguen igual y
  ahora son más importantes: definen el data-scope de `/opciones/sucursales|almacenes` (§5.2).
  Si un usuario no tiene ninguna asignada, sus selects de sucursal/almacén vienen vacíos.

---

## 9. Manejo de errores (tabla completa)

Formato de error de siempre: `{ success: false, error: { code, message, statusCode, details? } }`.
Mostrá siempre `error.message` (ya viene en español y con nombres legibles, incluso los
personalizados por GenSuite Control).

| HTTP | `code`                     | Dónde                                   | Qué hacer                                                                                   |
|------|----------------------------|-----------------------------------------|---------------------------------------------------------------------------------------------|
| 403  | `PERMISO_INSUFICIENTE`     | cualquier endpoint                       | Como hoy. `details.acciones` (y en v2 `details.componentes`). Refrescá `/me/*`.               |
| 403  | `FILTRO_NO_PERMITIDO`      | listados/reportes con query params       | §3.3 paso 5: quitar `details.filtros[].parametro`, refrescar `/me/acceso`, reintentar 1 vez. |
| 403  | `RECURSO_NO_PERMITIDO`     | `/opciones/:recurso`                     | Ocultar el select; refrescar `/me/acceso`. `details.recurso`.                                |
| 403  | `WIDGET_NO_PERMITIDO`      | `/dashboard/widgets/:key`, tops, actividad | Ocultar la tarjeta; refrescar catálogo del dashboard.                                     |
| 403  | `WIDGET_NO_CONTRATADO`     | ídem                                     | Ídem.                                                                                        |
| 403  | `ESCALADA_NO_PERMITIDA`    | admin de permisos                        | Mostrar mensaje; marcar las filas de `details`.                                              |
| 400  | `CLAVE_INEXISTENTE`        | admin de permisos                        | Recargar catálogo (cambió); marcar filas.                                                    |
| 400  | `COMPONENTE_NO_CONTRATADO` | admin de permisos                        | Recargar catálogo; quitar esas claves.                                                       |
| 400  | `GRANT_VENCIDO`            | admin de permisos                        | Validar `expiraEn` > ahora antes de enviar.                                                  |
| 400  | `PERFIL_SISTEMA`           | editar/eliminar Administrador            | No debería pasar si la UI lo pone en solo lectura.                                           |
| 409  | `PERFIL_DUPLICADO`         | crear/renombrar perfil                   | Error en el campo nombre.                                                                    |
| 409  | `PERFIL_EN_USO`            | eliminar perfil                          | Pedir reasignar usuarios.                                                                    |
| 400  | `PERFIL_INEXISTENTE`       | `PUT /acceso/usuarios/:email`, invitar   | Recargar perfiles (alguno fue eliminado).                                                    |
| 404  | —                          | `/acceso/perfiles/:id`                   | Perfil no encontrado: volver a la lista.                                                     |
| 400  | `PLANTILLA_INEXISTENTE`    | crear perfil                             | Recargar plantillas.                                                                         |
| 409  | `ULTIMO_ADMINISTRADOR`     | `PUT /acceso/usuarios/:email`            | Mensaje claro (§7.5).                                                                        |
| 400  | `ACCESO_V2_ACTIVO`         | invitar/editar usuario                   | Usar `perfilesAcceso` / pestaña Acceso.                                                      |
| 400  | `PERFIL_ACCESO_REQUERIDO`  | invitar usuario                          | Exigir al menos un perfil en el formulario.                                                  |

Tip: centralizá el manejo en el interceptor de Axios/fetch: para los cuatro 403 de acceso,
disparar un refresco de `/me/acceso` + `/me/permissions` (con *debounce* para no hacer una
tormenta si fallan varias tarjetas a la vez).

---

## 10. Cambio de seguridad en el JWT (Fase 0)

El JWT del login **ya no incluye** `ak`/`ask` (las credenciales de ERPNext del usuario). El
backend las resuelve de su lado. Verificá que el frontend:

- no lea `ak`/`ask` del payload del JWT para nada (buscá `ak`, `ask`, `api_key`,
  `api_secret` en el repo),
- no llame **directamente** al site de ERPNext (`/api/resource/...`, `/api/method/...`) desde el
  navegador: todo debe pasar por el BFF (`/api/v1/...`). Si encontrás alguna llamada directa,
  reemplazala por el endpoint del BFF equivalente o anotala como pendiente.

Los JWT emitidos antes del cambio siguen siendo válidos hasta que venzan; no hay que forzar
logout.

---

## 11. Plan de trabajo sugerido (en este orden)

1. **Tipos y cliente API** a partir del `openapi.json` (regenerá los tipos si el repo los
   genera): `/me/acceso`, `/opciones/:recurso`, `/acceso/*`, `/dashboard/catalogo`,
   `/dashboard/widgets/:key`, y `perfilesAcceso` en invitar usuario.
2. **Store de acceso** (`/me/acceso` junto a `/me/permissions`), helpers `puedeFiltrar`,
   `puedeConsultar`, refresco por `version`, y manejo centralizado de los 403 nuevos.
3. **Dashboard modular** (§6): catálogo + widgets independientes; quitar `/inventory` y
   `/invoices` del dashboard.
4. **`OpcionesSelect` + migración de selects** (§5.3), pantalla por pantalla, empezando por los
   filtros de listados (Facturas, Caja, Compras, Gastos, Inventario, Reportes) y siguiendo por
   formularios.
5. **Filtros bloqueados** (§3.3) en todas las barras de filtros y en la restauración desde URL.
6. **Gates por pantalla**: Caja independiente de Facturas; formularios de creación gateados
   por `.crear`, no por `.listar` (§4.2).
7. **Admin de permisos** (§7): catálogo + editor de árbol, perfiles, acceso de usuario con
   excepciones, explicación, auditoría, migrar/sincronizar.
8. **Usuarios** (§8): invitar/editar según el modo.
9. **JWT** (§10): revisión.
10. Tests (los que use el repo: unit de helpers — `puedeFiltrar`, armado de grants desde el
    árbol — y de componentes clave: editor de árbol, dashboard con catálogo vacío/parcial,
    manejo de `FILTRO_NO_PERMITIDO`).

### 11.1 Cómo probar

Necesitás un tenant en modo `activo` (pedíselo a quien opere GenSuite Control, o usá el que te
indiquen). Casos mínimos:

1. Admin (perfil Administrador): ve todo lo contratado; la admin de permisos funciona.
2. Crear perfil "Cajero": pantalla `ventas.factura` completa **excepto**
   `ventas.factura.filtro.branch`, pantalla `caja` completa, tipo de dashboard `dashboard.ventas`.
   Asignarlo a un usuario. Con ese usuario:
   - Facturas: no aparece el filtro Sucursal; pegando `?branch=X` en la URL, no se envía.
   - El filtro Cliente usa `/opciones/clientes` y funciona aunque no tenga la pantalla Clientes.
   - Dashboard: solo la sección Ventas con sus 4 reportes; sin llamadas a `/inventory` ni
     `/invoices`.
   - `/opciones/proveedores` → no se llama (no hay select que lo use); si se fuerza, 403.
3. Explicación: con el admin, "Ver acceso efectivo" del cajero muestra el filtro Sucursal como
   "El perfil Cajero lo excluye".
4. Intentar quitarle el perfil Administrador al único admin → mensaje de `ULTIMO_ADMINISTRADOR`.
5. Tenant en modo `off`: todo lo anterior no rompe nada; el dashboard modular funciona; los
   selects con `/opciones` funcionan; la admin de permisos muestra el banner de "no activo".

---

## 12. Qué NO hacer

- No calcules permisos en el cliente a partir de roles/doctypes de ERPNext.
- No "adivines" claves de componentes: salen de `/me/acceso` y `/acceso/catalogo`. La única
  derivación permitida es pantalla = acción sin el último segmento y filtro =
  `<pantalla>.filtro.<param>`, y solo para consultar `filtrosBloqueados`.
- No cruces features del tenant para el dashboard (el backend ya lo hace).
- No guardes `/me/acceso` en `localStorage` como fuente de verdad (sí podés cachearlo para el
  primer render, pero siempre revalidá).
- No reemplaces listados de administración por `/opciones`: solo selects.
- No toques la lógica fiscal ni de montos: nada de esto cambia cálculos.

---

## 13. Pendientes de backend conocidos (no los implementes; si los necesitás, anotalo)

- Evento en tiempo real de "cambió tu acceso" (hoy: refresco por `version`).
- Campos sensibles (tipo `campo`, ocultar columnas como margen/costo): el catálogo tiene el flag
  `sensible`, pero todavía no hay componentes de campo ni proyección de respuestas.
- Simulación de un perfil sin guardarlo.
- Personalización del dashboard por usuario guardada en backend.

Al terminar, entregá un resumen con: pantallas migradas a `/opciones`, pantallas con filtros
protegidos, selects que no migraste y por qué, llamadas directas a ERPNext encontradas, y
cualquier contradicción entre este documento y el `openapi.json`.
