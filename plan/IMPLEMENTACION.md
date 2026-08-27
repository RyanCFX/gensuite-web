> ✅ **COMPLETADO** — Implementado íntegramente el 2026-07-26 (todas las secciones 1-16, `tsc --noEmit` y `vite build` verificados sin errores). Ver el estado por sección más abajo.

# CAMBIOS_DIMENSIONES_Y_CATALOGO_CONTABLE — Guía para el agente de frontend

> Escrito para que un agente de IA lo lea e implemente directamente contra el frontend.
> No requiere conocimiento previo de ERPNext ni de las fases de implementación del BFF —
> solo del contrato de API descrito aquí.

## Contexto (una frase por tema)

El BFF implementó un catálogo contable dominicano de 248 cuentas y dos "Accounting
Dimensions" nuevas — **Sucursal** (`branch`) y **Departamento** (`department`) — que ahora
viajan como campos en la mayoría de los documentos transaccionales (facturas, pedidos,
compras, gastos, cobros, notas de débito, asientos, conteos de inventario) y como filtros
en los reportes. También se agregaron dos módulos CRUD nuevos (Centros de Costo y
Departamentos) y se amplió la configuración de cuentas de la empresa.

**Nada de esto es opcional-invisible**: si la empresa activó "Sucursal obligatoria para
Estado de Resultados" (ver más abajo), el backend **rechaza** documentos que afecten cuentas
de Ingreso/Gasto sin una sucursal — el frontend debe manejar ese rechazo, no solo enviar el
campo cuando el usuario lo llena.

## Convención de estado usada en este documento

✅ ya disponible en la API actual | 🆕 campo/endpoint nuevo | 🔄 campo modificado

---

## Índice

1. [Concepto: Sucursal (branch) y Departamento (department)](#1-concepto-sucursal-branch-y-departamento-department)
2. [Contrato de error nuevo: BRANCH_REQUIRED / MIXED_BRANCH_COUNT](#2-contrato-de-error-nuevo-branch_required--mixed_branch_count)
3. [Campos branch/department por módulo](#3-campos-branchdepartment-por-módulo)
4. [Nuevo módulo: Centros de Costo](#4-nuevo-módulo-centros-de-costo)
5. [Nuevo módulo: Departamentos](#5-nuevo-módulo-departamentos)
6. [Config → Cuentas de la Empresa: 16 campos nuevos](#6-config--cuentas-de-la-empresa-16-campos-nuevos)
7. [Reportes: filtros de dimensión y agrupación](#7-reportes-filtros-de-dimensión-y-agrupación)
8. [Cuentas contables: cambios en `/cuentas`](#8-cuentas-contables-cambios-en-cuentas)
9. [Filtros `?branch=`/`?department=` en listados adicionales](#9-filtros-branchdepartment-en-listados-adicionales)
10. [Almacenes: cuenta contable (`Warehouse.account`)](#10-almacenes-cuenta-contable-warehouseaccount)
11. [Nuevos endpoints de Settings (Accounts / Stock / Selling / Buying)](#11-nuevos-endpoints-de-settings-accounts--stock--selling--buying)
12. [Nuevo módulo: Retenciones (Tax Withholding Category)](#12-nuevo-módulo-retenciones-tax-withholding-category)
13. [Nuevo módulo: Costos de Importación (Landed Cost Voucher)](#13-nuevo-módulo-costos-de-importación-landed-cost-voucher)
14. [RNC unificado en Configuración → Empresa](#14-rnc-unificado-en-configuración--empresa)
15. [Categorías: cuentas contables — bug corregido](#15-categorías-cuentas-contables--bug-corregido)
16. [Resumen de pantallas afectadas](#16-resumen-de-pantallas-afectadas)

---

## 1. Concepto: Sucursal (branch) y Departamento (department)  ✅ COMPLETADO

Son dos catálogos independientes, cada uno con su propio módulo CRUD. Sucursal ya tenía CRUD
propio antes de este trabajo — `GET/POST/PUT/DELETE /api/v1/sucursales` (`CreateSucursalDto`
solo pide `name`) — sin cambios en esta fase. `/centros-costo` (sección 4) **no** es lo mismo
que Sucursal — no confundirlos.

| Dimensión | Campo en documentos | Obligatoriedad | Uso típico |
|---|---|---|---|
| **Sucursal** | `branch` (string, nombre exacto del Branch en ERPNext, ej. `"Santo Domingo"`) | **Obligatoria** en documentos que afectan cuentas de Ingreso o Gasto (facturas, gastos, notas de débito, líneas de asiento sobre esas cuentas). Opcional en documentos de Balance (compras que no facturan, cobros puros, etc. — pero se recomienda enviarla siempre que se conozca) | Reportar Estado de Resultados por sucursal |
| **Departamento** | `department` (string, nombre exacto del Department en ERPNext, ej. `"Ventas - JBC"`) | **Siempre opcional** — nunca bloquea un submit | Reportar gastos por área/departamento, informativo |

**Resolución en cascada (el frontend no necesita adivinar un valor por defecto):** si el
campo `branch` se omite en el request, el BFF intenta resolverlo automáticamente en este
orden: sucursal por defecto del usuario → sucursal por defecto de la dimensión contable →
si solo existe una sucursal en el sistema, esa. Solo si ninguna de esas resoluciones aplica
Y la sucursal es obligatoria para el tipo de documento, el backend devuelve el error
`BRANCH_REQUIRED` (sección 2). **Recomendación de UX:** dejar que el usuario omita el campo
en la mayoría de los casos, pero mostrar un selector de sucursal visible en la cabecera de
cada documento — si el backend igual rechaza, mostrar el error y forzar la selección ahí
mismo.

`department` nunca se auto-resuelve por conteo (a diferencia de `branch`) más allá de:
dto → usuario → dimensión por defecto → `null`. Nunca lanza error.

---

## 2. Contrato de error nuevo: BRANCH_REQUIRED / MIXED_BRANCH_COUNT  ✅ COMPLETADO

Todos los errores del BFF tienen esta forma (sin cambios en el sobre, ya existente):

```json
{
  "success": false,
  "error": {
    "code": "BRANCH_REQUIRED",
    "message": "Texto en español listo para mostrar al usuario",
    "statusCode": 400
  }
}
```

Dos códigos nuevos que el frontend debe reconocer explícitamente (no basta con mostrar
`message` genérico — el `code` debe disparar un comportamiento de UI específico):

### `BRANCH_REQUIRED`

Se produce al crear o **someter** (`/submit`) un documento que afecta una cuenta de
Ingreso/Gasto sin sucursal resuelta. Aparece en: facturas, gastos, notas de débito,
asientos contables (por línea), conteos de inventario.

**Comportamiento de UI recomendado:** interceptar este código específicamente. Si el
formulario tiene un selector de sucursal vacío, enfocarlo y marcarlo en rojo con el
`message` del error como texto de ayuda, en vez de solo mostrar un toast genérico.

### `MIXED_BRANCH_COUNT`

Exclusivo de **conteos de inventario** (`POST /api/v1/inventory/counts`). Se produce cuando
las líneas del conteo usan almacenes que pertenecen a más de una sucursal distinta —
ERPNext no permite un único documento con sucursal ambigua.

**Comportamiento de UI recomendado:** al armar el formulario de conteo, si el usuario
selecciona artículos/almacenes de más de una sucursal, mostrar una advertencia preventiva
antes de enviar ("Estás mezclando almacenes de sucursales distintas — esto no se puede
guardar en un solo conteo"). Si de todas formas llega el error del backend, mostrarlo tal
cual y sugerir dividir el conteo en dos.

---

## 3. Campos branch/department por módulo  ✅ COMPLETADO

Todos siguen el mismo patrón: `branch?: string` y `department?: string`, opcionales en el
request, ambos presentes en el response (pueden venir `null`). A menos que se indique lo
contrario, van a nivel de **cabecera** del documento (no por línea).

| Módulo | Endpoint base | Campos | Nota |
|---|---|---|---|
| Facturas | `POST/GET /api/v1/invoices` | `branch`, `department` en request y response | Cabecera. Reemplaza el uso previo de `custom_branch` |
| Pedidos de venta | `POST/GET /api/v1/pedidos` | `branch`, `department` | Se propagan automáticamente a la factura generada al facturar el pedido |
| Compras | `POST/GET /api/v1/compras` | `branch`, `department` | También se propagan en `POST /api/v1/compras/:id/return` (devoluciones) |
| Gastos | `POST/GET /api/v1/gastos` | `branch`, `department` | — |
| Cobros | `POST/GET /api/v1/cobros` | `branch`, `department` | Si el cobro referencia facturas/pedidos, el backend intenta inferir la sucursal de esas referencias cuando todas comparten una sola |
| Notas de débito | `POST /api/v1/credit-notes` (endpoint de "crear nota de débito") | `branch`, `department` | Las **notas de crédito** (devolución) y el refund NO llevan estos campos explícitos — ERPNext los hereda automáticamente del documento original, el frontend no necesita enviarlos ahí |
| Asientos contables | `POST /api/v1/journal-entry` | `branch`, `department`, `costCenter` **por línea**, más los mismos tres a nivel de request como default de línea | Ver detalle abajo — es el único módulo con dimensión **por línea**, no por cabecera |
| Conteos de inventario | `POST /api/v1/inventory/counts` | `branch`, `department` en cabecera | Si se omite `branch`, el backend lo deriva de los almacenes usados en las líneas (deben ser todos de la misma sucursal, o error `MIXED_BRANCH_COUNT`) |
| Transferencias | `POST /api/v1/transferencias`, `POST /api/v1/transferencias/:id/confirmar` | Sin campo expuesto al frontend — el backend deriva `branch` internamente del almacén origen/destino | Sin cambio de contrato, mencionado solo para contexto |

### Detalle: Asientos contables (`/api/v1/journal-entry`)

A diferencia de todos los demás módulos, aquí la dimensión es **por línea**, porque ERPNext
almacena `branch`/`department`/`cost_center` en el hijo `Journal Entry Account`, no en la
cabecera del asiento:

```json
POST /api/v1/journal-entry
{
  "postingDate": "2026-06-08",
  "entries": [
    { "account": "61-02-012 - ENERGIA ELECTRICA - JBC", "debit": 5000, "credit": 0, "branch": "Sucursal Norte" },
    { "account": "Caja - JBC", "debit": 0, "credit": 5000 }
  ],
  "branch": "Sucursal Norte",   // opcional: default para líneas que no traigan su propio branch
  "department": "...",          // opcional: default para líneas
  "costCenter": "..."           // opcional: default para líneas
}
```

**Regla de negocio que el frontend debe reflejar en el formulario:** solo las líneas que
afectan una cuenta de tipo Ingreso/Gasto (Profit & Loss) necesitan `branch` cuando la
dimensión es obligatoria; las líneas de Balance (Caja, Bancos, Cuentas por Cobrar/Pagar,
etc.) nunca la requieren. El frontend no tiene forma de saber de antemano el `root_type` de
una cuenta sin consultarla — usar `GET /api/v1/cuentas?...` (trae `rootType` y `reportType`,
ver sección 8) para decidir si mostrar el selector de sucursal como obligatorio en esa línea
específica del formulario de asiento. Si no se valida en el frontend, el backend igual lo
rechaza con `BRANCH_REQUIRED` indicando el número de línea afectada en el `message`.

**Cada línea también acepta `costCenter` opcional** — si se omite, el backend usa el centro
de costo por defecto de la compañía. Mostrar un selector de centro de costo por línea es
opcional (recomendado solo si la empresa usa más de un Centro de Costo — ver sección 4).

---

## 4. Nuevo módulo: Centros de Costo  ✅ COMPLETADO

**No confundir con Sucursal.** Centro de Costo (`Cost Center`) es un catálogo jerárquico
nativo de ERPNext, separado de la dimensión Sucursal. Hoy la empresa normalmente solo tiene
la raíz que crea ERPNext por defecto; este módulo permite crear más si el negocio lo
requiere (ej. varios centros de costo dentro de una misma sucursal).

```
GET    /api/v1/centros-costo?limit=&offset=&search=&orderBy=&isGroup=&includeDisabled=
GET    /api/v1/centros-costo/tree
GET    /api/v1/centros-costo/:id
POST   /api/v1/centros-costo
PUT    /api/v1/centros-costo/:id
DELETE /api/v1/centros-costo/:id
```

**`POST /api/v1/centros-costo`** — request:
```json
{
  "costCenterName": "Sucursal Norte",
  "costCenterNumber": "01",          // opcional
  "parentCostCenter": "Main - JBC",  // opcional — si se omite, usa la raíz de la compañía
  "isGroup": false                    // opcional, default false
}
```

**Response (`GET :id`, y cada item de la lista)**:
```json
{
  "id": "Sucursal Norte - JBC",
  "name": "Sucursal Norte",
  "number": "01",
  "parentCostCenter": "Main - JBC",
  "isGroup": false,
  "disabled": false
}
```

**`PUT /api/v1/centros-costo/:id`** — solo permite renombrar (`costCenterName`,
`costCenterNumber`), no reparentar ni cambiar `isGroup`.

**`DELETE /api/v1/centros-costo/:id`** — el backend rechaza el borrado si el centro de
costo es el default de la compañía o si tiene movimientos de `GL Entry` asociados
(devuelve 400 con mensaje explicativo — mostrarlo tal cual).

**`GET /api/v1/centros-costo/tree`** — árbol completo ya anidado (`children: [...]`),
útil para un componente de árbol sin tener que armar la jerarquía en el frontend.

### Cambios de UI

- Nueva pantalla en Configuración (o Tablas): "Centros de Costo", con vista de árbol
  (usar el endpoint `/tree`) y CRUD básico.
- Selector de Centro de Costo en el formulario de líneas de asiento contable (sección 3,
  detalle de Journal Entry) — cargar de `GET /centros-costo` (o `/tree` si se quiere
  jerarquía en el dropdown).

---

## 5. Nuevo módulo: Departamentos  ✅ COMPLETADO

CRUD del catálogo de Departamentos (usado como valor del campo `department` en todos los
documentos de la sección 3). Sigue el mismo patrón que Centros de Costo.

```
GET    /api/v1/departamentos?limit=&offset=&search=&orderBy=&includeDisabled=
GET    /api/v1/departamentos/tree
GET    /api/v1/departamentos/:id
POST   /api/v1/departamentos
PUT    /api/v1/departamentos/:id
DELETE /api/v1/departamentos/:id
```

**`POST /api/v1/departamentos`** — request:
```json
{
  "name": "Ventas",                    // sin la abreviatura de compañía, el backend la agrega
  "parentDepartment": "Ventas - JBC"   // opcional — si se omite, usa la raíz de Department del site
}
```

**Response**:
```json
{
  "id": "Ventas - JBC",
  "name": "Ventas",
  "parentDepartment": null,
  "isGroup": false,
  "disabled": false
}
```

**Departamentos precargados por la Fase 3** (7 departamentos base en español, ya
disponibles vía `GET /departamentos` sin ninguna acción del frontend): la empresa ya
tiene un catálogo inicial; este módulo permite agregar/editar más.

`includeDisabled=true` en el listado también trae los ~13 departamentos nativos de
ERPNext (en inglés) que la Fase 3 deshabilitó — normalmente no se muestran.

### Cambios de UI

- Nueva pantalla en Configuración (o Tablas): "Departamentos", listado + árbol + CRUD.
- Selector de Departamento reutilizable (dropdown que carga `GET /departamentos`) — usarlo
  en todos los formularios de la sección 3 que tengan campo `department` (facturas,
  pedidos, compras, gastos, cobros, notas de débito, asientos, conteos).

---

## 6. Config → Cuentas de la Empresa: 16 campos nuevos  ✅ COMPLETADO

`GET /api/v1/config/cuentas-empresa` y `PUT /api/v1/config/cuentas-empresa` — el mismo
endpoint que ya existía, ahora con 16 campos adicionales en request y response:

```json
{
  "defaultCashAccount": "Caja - JBC",
  "defaultInventoryAccount": "Inventario - JBC",
  "stockReceivedButNotBilled": "Mercancía Recibida No Facturada - JBC",
  "stockAdjustmentAccount": "Ajuste de Inventario - JBC",
  "defaultDeferredRevenueAccount": null,
  "defaultDeferredExpenseAccount": null,
  "exchangeGainLossAccount": null,
  "unrealizedExchangeGainLossAccount": null,
  "accumulatedDepreciationAccount": null,
  "depreciationExpenseAccount": null,
  "disposalAccount": null,
  "defaultDiscountAccount": null,
  "costCenter": "Main - JBC",
  "roundOffCostCenter": "Main - JBC",
  "depreciationCostCenter": null,
  "enablePerpetualInventory": true
}
```

Todos son opcionales al hacer `PUT` (solo se actualizan los enviados). Todos son nombres
completos de cuenta (`Account Name - ABBR`) salvo `costCenter`/`roundOffCostCenter`/
`depreciationCostCenter` que son nombres completos de Centro de Costo, y
`enablePerpetualInventory` que es boolean.

**⚠️ Advertencia de UI para `enablePerpetualInventory`:** una vez que existen movimientos de
inventario en el sistema, ERPNext no permite desactivarlo — es una puerta de un solo
sentido. Mostrar confirmación explícita antes de dejar que el usuario lo desactive, y no
sorprenderse si el backend devuelve un error 400 al intentarlo tarde.

### Cambios de UI

- Ampliar el formulario de "Configuración → Cuentas de la Empresa" con los 16 campos
  nuevos. Recomendado agruparlos visualmente: Inventario (`defaultCashAccount`… `stockAdjustmentAccount`),
  Diferidos/Cambiario (`defaultDeferredRevenueAccount`… `unrealizedExchangeGainLossAccount`),
  Depreciación (`accumulatedDepreciationAccount`, `depreciationExpenseAccount`, `disposalAccount`),
  Descuentos (`defaultDiscountAccount`), Centros de Costo (`costCenter`, `roundOffCostCenter`,
  `depreciationCostCenter` — selectores que cargan de `GET /centros-costo`), Inventario
  perpetuo (`enablePerpetualInventory`, checkbox con advertencia).
- Los selectores de cuenta deben cargar de `GET /api/v1/cuentas?...` (ver sección 8) filtrando
  por `accountType` cuando aplique (ej. `costCenter` no es una cuenta, usar `/centros-costo`).

---

## 7. Reportes: filtros de dimensión y agrupación  ✅ COMPLETADO

Todos los reportes con rango de fechas (`fromDate`/`toDate`) ahora aceptan dos query params
opcionales adicionales:

```
?branch=Santo Domingo
?department=Ventas%20-%20JBC
```

Aplica a: `GET /api/v1/reportes/ventas`, `.../ingresos-egresos`, `.../balance-general`,
`.../inventario/valoracion`, `.../inventario/movimientos`, `.../libro-diario`,
`.../libro-mayor`, `.../dgii/606|607|608` (comodidad, ver nota), `.../caja/cuadre`,
`.../cuentas/:id/movimientos`.

**No aplica a `GET /api/v1/reportes/cxc/aging`** — ese reporte es de Balance, no de Estado
de Resultados; no se filtra por dimensión de la misma manera. No mostrar el filtro de
sucursal/departamento en esa pantalla.

**Nota sobre `606/607/608`:** el parámetro `branch` ahí es solo de comodidad para el
frontend (filtra las facturas/compras subyacentes) — la DGII reporta por RNC de la
compañía completa, el archivo generado no cambia de "alcance legal" por sucursal.

### `GET /api/v1/reportes/libro-diario` — nuevos modos de agrupación

El query param `groupBy` ya existente ahora acepta dos valores nuevos: `'Group by Sucursal'`
y `'Group by Departamento'`. Cuando se usa alguno de los dos, la respuesta incluye un array
adicional `byDimension`:

```json
{
  "success": true,
  "data": {
    "fromDate": "...", "toDate": "...", "rows": [ /* igual que antes */ ],
    "totalDebit": 150000, "totalCredit": 150000,
    "byDimension": [
      { "key": "Santo Domingo", "totalDebit": 90000, "totalCredit": 85000, "count": 12 },
      { "key": "(sin asignar)", "totalDebit": 60000, "totalCredit": 65000, "count": 8 }
    ]
  }
}
```

`key` es el nombre de la sucursal/departamento, o el literal `"(sin asignar)"` cuando el
movimiento no tiene esa dimensión.

### Cambios de UI

- Agregar selectores "Sucursal" y "Departamento" (opcionales, con opción "Todas/Todos") en
  los filtros de cada pantalla de reporte listada arriba.
- En Libro Diario, agregar las dos opciones nuevas al selector de agrupación existente. Al
  seleccionar una de las dos, renderizar una tabla/gráfico de resumen usando `byDimension`
  en vez de (o además de) las filas detalladas.
- En Libro Mayor, cada movimiento de cada cuenta ahora trae `branch`/`department` — se
  puede mostrar como columna opcional o en un tooltip/expand por fila.
- En "Movimientos por cuenta" (`/cuentas/:id/movimientos`, usado también desde la ficha de
  cuenta en el módulo Cuentas), lo mismo: cada fila trae `branch`/`department`.

---

## 8. Cuentas contables: cambios en `/cuentas`  ✅ COMPLETADO

Cambios menores en `GET/POST/PUT /api/v1/cuentas`, útiles si el frontend construye
selectores dinámicos de cuentas o un árbol de plan de cuentas:

- **`rootType`** (🆕, opcional) — en `GET` (query de filtro) y en `POST` (para crear una
  cuenta raíz nueva junto con `isGroup: true`, sin `parentAccount`). Valores:
  `Asset | Liability | Equity | Income | Expense`.
- **`reportType`** (🆕, solo lectura, en cada cuenta del response) — derivado
  automáticamente: `Income`/`Expense` → `"Profit and Loss"`, el resto → `"Balance Sheet"`.
  Útil para decidir en el frontend si un selector de cuenta debe forzar la selección de
  `branch` (ver sección 3, detalle de asientos).
- **`accountType`** — el enum de valores válidos ahora se valida contra la lista real de 31
  tipos de ERPNext v16 (antes podía aceptar valores inválidos silenciosamente). Si el
  frontend tiene un `<select>` hardcodeado con tipos de cuenta, verificar que coincida
  exactamente con esta lista (usar `GET /api/v1/cuentas` no expone el enum directamente,
  pedir al backend un endpoint de metadata si se necesita, o hardcodear esta lista):
  `Accumulated Depreciation, Asset Received But Not Billed, Bank, Cash, Chargeable, Capital Work in Progress, Cost of Goods Sold, Current Asset, Current Liability, Depreciation, Direct Expense, Direct Income, Equity, Expense Account, Expenses Included In Asset Valuation, Expenses Included In Valuation, Fixed Asset, Income Account, Indirect Expense, Indirect Income, Liability, Payable, Receivable, Round Off, Round Off for Opening, Service Received But Not Billed, Stock, Stock Adjustment, Stock Received But Not Billed, Tax, Temporary`
- **`parentAccount`** ahora es opcional en `POST` (antes era obligatorio) — para crear una
  cuenta raíz se debe omitir `parentAccount` y enviar `rootType` + `isGroup: true`. Si se
  omiten ambos (`parentAccount` y `rootType`), el backend devuelve 400.
- **`GET /api/v1/cuentas/tree`** — ya no limita a 500 registros (ahora trae el árbol
  completo, 248+ cuentas); la respuesta incluye `meta: { total: N }`.

### Cambios de UI

- Si existe un formulario de "crear cuenta raíz" (poco común, generalmente solo lo usa un
  administrador), agregar el selector de `rootType` y quitar la obligatoriedad de
  `parentAccount` cuando se elige esa opción.
- Si el árbol de cuentas se pagina en el frontend, revisar que ya no se estaba
  limitando artificialmente a 500 — ahora puede traer más.

---

## 9. Filtros `?branch=`/`?department=` en listados adicionales  ✅ COMPLETADO

Además de los reportes (sección 7), estos listados también aceptan `?branch=`/`?department=`
como query params opcionales:

| Endpoint | Nota |
|---|---|
| `GET /api/v1/journal-entry` | Filtra asientos que tengan **al menos una línea** con esa sucursal/departamento (la dimensión es por línea, ver sección 3) |
| `GET /api/v1/transferencias` | Solo `?branch=` (sucursal del almacén origen) — no aplica `department` |
| `GET /api/v1/inventory/counts` | `branch`/`department` de la cabecera del conteo |
| `GET /api/v1/credit-notes` y `GET /api/v1/devoluciones` | `branch`/`department` de la nota de crédito/débito |
| `GET /api/v1/inventory` (stock actual) | `?branch=` — se traduce internamente a los almacenes de esa sucursal. Si también se envía `?warehouse=`, ese tiene prioridad y `branch` se ignora |
| `GET /api/v1/inventory/history` | Igual que arriba: `?branch=` se traduce a almacenes, `?warehouse=` tiene prioridad si ambos se envían |

### Cambios de UI

- Agregar el selector de Sucursal (y Departamento donde aplique) a los filtros de: listado de
  asientos contables, listado de transferencias, listado de conteos de inventario, listado de
  notas de crédito/débito y devoluciones, e Inventario (stock actual e historial).
- En Inventario, si el usuario ya tiene un almacén específico seleccionado, no mostrar el
  selector de sucursal como filtro adicional a la vez (uno reemplaza al otro, `warehouse` gana).

---

## 10. Almacenes: cuenta contable (`Warehouse.account`)  ✅ COMPLETADO

`POST /api/v1/config/almacenes` ahora acepta el campo `account` (antes solo estaba disponible
en `PUT`), y `GET /api/v1/config/almacenes` ahora lo devuelve en cada almacén de la lista
(antes solo se veía consultando uno por uno, y ni así estaba expuesto en la lista):

```json
// POST /config/almacenes
{
  "warehouseName": "Almacén Norte",
  "branch": "Sucursal Norte",
  "account": "Stock en mano - JBC"   // 🆕 opcional
}

// GET /config/almacenes — cada item ahora incluye:
{
  "id": "Almacén Norte - JBC",
  "name": "Almacén Norte",
  "branch": "Sucursal Norte",
  "account": "Stock en mano - JBC",   // 🆕
  "disabled": false
}
```

### Cambios de UI

- Agregar el selector "Cuenta de inventario" (`account`, carga de `GET /cuentas`) al formulario
  de **crear** almacén (ya existía en el de editar).
- En el listado de almacenes, se puede mostrar la cuenta asociada como columna opcional o en el
  detalle expandido de cada fila.

---

## 11. Nuevos endpoints de Settings (Accounts / Stock / Selling / Buying)  ✅ COMPLETADO

Cuatro pantallas de configuración nuevas, cada una como singleton (no hay lista, es un único
documento por tenant):

```
GET|PUT /api/v1/config/accounts-settings
GET|PUT /api/v1/config/stock-settings
GET|PUT /api/v1/config/selling-settings
GET|PUT /api/v1/config/buying-settings
```

Todos los campos son opcionales en el `PUT` (solo se actualiza lo enviado).

**`accounts-settings`** — incluye `enableAccountingDimensions` (el mismo flag de activación de
Sucursal/Departamento de la Fase 3), `enableImmutableLedger`, `defaultAgeingRange`,
`creditController`, `roleAllowedToOverBill`, entre otros.

> ⚠️ El campo `deleteLinkedLedgerEntries` **siempre se rechaza en `true`** — el backend
> devuelve 400 si se intenta activar. No mostrar este campo como editable en la UI, o si se
> muestra, marcarlo claramente como bloqueado con una nota de por qué.

**`stock-settings`** — incluye `valuationMethod` (`FIFO`/`Moving Average`/`LIFO`),
`defaultWarehouse`, `allowNegativeStock`, `enableStockReservation`, etc.

> ⚠️ Cambiar `valuationMethod` se **rechaza con 400** si ya existen movimientos de inventario
> (`Stock Ledger Entry`). Mostrar ese campo como de solo lectura (o con advertencia) si la
> empresa ya tiene movimientos — no hay forma de saberlo de antemano desde el frontend sin
> intentar el cambio, así que basta con capturar el error y mostrarlo.

**`selling-settings`** — `customerGroup`, `territory`, `maintainSameSellingRate`,
`editableItemRate`, `allowMultiplePricingRules`.

**`buying-settings`** — `supplierGroup`, `maintainSameRateThroughPurchaseCycle`,
`disableLastPurchaseRate`, `allowMultiplePricingRules`.

> ⚠️ `disableLastPurchaseRate` en `true` rompe **silenciosamente** (sin error visible) el
> recálculo automático de precio por último costo del modo "sobre costo" de artículos. Si el
> frontend expone este campo, agregar una advertencia explícita en la UI junto al toggle.

### Cambios de UI

- Nueva sección en Configuración: "Ajustes avanzados" (o similar), con 4 sub-pestañas: Cuentas,
  Inventario, Ventas, Compras — cada una mapeando 1:1 a los 4 endpoints.
- Estas pantallas son normalmente de uso poco frecuente (solo administradores) — se puede
  colocar detrás de un permiso/rol si el frontend maneja permisos granulares.

---

## 12. Nuevo módulo: Retenciones (Tax Withholding Category)  ✅ COMPLETADO

CRUD de categorías de retención (ITBIS, ISR, etc. — las 6 que ya vienen provisionadas por
defecto, más las que el usuario cree):

```
GET    /api/v1/config/retenciones
GET    /api/v1/config/retenciones/:id
POST   /api/v1/config/retenciones
PUT    /api/v1/config/retenciones/:id
DELETE /api/v1/config/retenciones/:id
```

**`POST /api/v1/config/retenciones`** — request:
```json
{
  "name": "Retención ITBIS Servicios 30%",
  "taxDeductionBasis": "Gross Total",
  "rates": [
    { "taxWithholdingRate": 5.4, "fromDate": "2026-01-01", "toDate": "2026-12-31" }
  ],
  "account": "22-15 - RETENCION ITBIS - JBC"
}
```

**Response (`GET :id`)** — incluye la tabla completa de tasas y cuentas:
```json
{
  "id": "Retención ITBIS Servicios 30%",
  "categoryName": "Retención ITBIS Servicios 30%",
  "taxDeductionBasis": "Gross Total",
  "rates": [
    { "taxWithholdingRate": 5.4, "fromDate": "2026-01-01", "toDate": "2026-12-31", "singleThreshold": null, "cumulativeThreshold": null, "taxWithholdingGroup": null }
  ],
  "accounts": [ { "company": "JORGES BUSINESS CONSULTING", "account": "22-15 - RETENCION ITBIS - JBC" } ]
}
```

**Importante para el formulario:** `name` se envía explícito al crear (no lo genera el
backend) — es el identificador único, no un campo de "título". Si se necesita un título más
amigable separado, usar `categoryName`. Un asiento con una tasa fuera de su rango
`fromDate`/`toDate` hace fallar toda la compra que la use — el formulario debería exigir
ambas fechas siempre.

### Cambios de UI

- Nueva pantalla en Configuración: "Retenciones", listado + formulario con: nombre,
  base de cálculo (Gross/Net Total), tabla editable de tasas (con rango de fechas obligatorio
  por fila), y cuenta contable asociada.
- Reutilizar este listado como fuente de los selectores de retención que ya existen en
  facturación/compras (si aplicaba una lista hardcodeada antes, reemplazarla por
  `GET /config/retenciones`).

---

## 13. Nuevo módulo: Costos de Importación (Landed Cost Voucher)  ✅ COMPLETADO

Permite prorratear cargos de importación (flete, seguro, aranceles) sobre el costo de
artículos ya recibidos, incrementando su valuación de inventario.

```
GET  /api/v1/compras/costos-importacion
GET  /api/v1/compras/costos-importacion/:id
POST /api/v1/compras/costos-importacion
POST /api/v1/compras/costos-importacion/:id/submit
POST /api/v1/compras/costos-importacion/:id/cancel
```

**`POST /api/v1/compras/costos-importacion`** — request:
```json
{
  "postingDate": "2026-06-10",
  "purchaseReceipts": [
    { "receiptDocumentType": "Purchase Receipt", "receiptDocument": "PUR-ORD-2026-00012" }
  ],
  "taxes": [
    { "description": "Flete internacional", "amount": 15000, "expenseAccount": "Gastos de Importación - JBC" }
  ],
  "distributeChargesBasedOn": "Amount"
}
```

**Importante:** el request **nunca incluye `items`** — el frontend no arma esa tabla. ERPNext
la genera automáticamente a partir de los `purchaseReceipts` al crear el documento. El `GET :id`
sí devuelve `items` ya poblados y prorrateados:

```json
{
  "id": "MAT-LCV-2026-00001",
  "status": "draft",
  "purchaseReceipts": [ { "receiptDocumentType": "Purchase Receipt", "receiptDocument": "PUR-ORD-2026-00012" } ],
  "taxes": [ { "description": "Flete internacional", "amount": 15000, "expenseAccount": "Gastos de Importación - JBC" } ],
  "items": [
    { "itemCode": "LAP-001", "description": "Laptop HP", "qty": 5, "rate": 45000, "amount": 225000, "applicableCharges": 3750, "receiptDocumentType": "Purchase Receipt", "receiptDocument": "PUR-ORD-2026-00012" }
  ]
}
```

### Cambios de UI

- Nueva sección "Costos de Importación" bajo Compras.
- Formulario de creación: selector de documento(s) de recepción (Purchase Receipt / Purchase
  Invoice con inventario / Stock Entry), tabla de cargos (descripción, monto, cuenta de gasto
  opcional), y método de distribución (por cantidad / por monto / manual).
- Después de crear el borrador, **recargar el detalle (`GET :id`)** y mostrar la tabla de
  `items` ya prorrateados antes de dejar al usuario someter — es la única forma de que vea
  cómo quedó distribuido el cargo antes de confirmar.
- Botones "Someter" y "Cancelar" siguiendo el mismo patrón que otros documentos (facturas,
  compras).

---

## 14. RNC unificado en Configuración → Empresa  ✅ COMPLETADO

`GET/PUT /api/v1/config/empresa` — el campo `rnc` (y `taxId`) siguen exactamente igual en el
contrato de request/response, **sin cambios que el frontend deba hacer**. Se documenta acá
solo por contexto: internamente el backend ahora escribe el RNC en dos campos de ERPNext en
vez de uno (antes solo escribía uno y `taxId`/`rnc` podían quedar desincronizados entre sí).
No hay acción de frontend requerida — se incluye para que quede registrado por qué el
comportamiento es ahora más consistente que antes (un RNC guardado se refleja igual en
`rnc` y en `taxId` en cualquier lectura posterior).

---

## 15. Categorías: cuentas contables — bug corregido  ✅ COMPLETADO

**Antes de este fix, `incomeAccount`/`expenseAccount` en `PUT /api/v1/catalog/categories/:id`
no hacían nada** — se aceptaban en el request pero ERPNext los descartaba en silencio, así que
nunca quedaban guardados ni se devolvían en ningún `GET`. Si el frontend ya tenía un formulario
con estos campos, hasta ahora guardaba en falso (sin error, pero sin efecto real).

Ahora sí persisten correctamente, y se agrega un tercer campo nuevo:

```json
// PUT /api/v1/catalog/categories/:id
{
  "incomeAccount": "Ventas - JBC",
  "expenseAccount": "Gastos Generales - JBC",
  "defaultCogsAccount": "COSTO DE MERCANCIA VENDIDA - JBC"   // 🆕 — el que realmente controla el costo en facturas
}

// GET /api/v1/catalog/categories/:id — ahora sí devuelve los 3 (antes no devolvía ninguno):
{
  "id": "Laptops",
  "name": "Laptops",
  "incomeAccount": "Ventas - JBC",
  "expenseAccount": "Gastos Generales - JBC",
  "defaultCogsAccount": "COSTO DE MERCANCIA VENDIDA - JBC",
  ...
}
```

**`defaultCogsAccount` es el campo más importante de los tres** — es el que ERPNext realmente
usa para calcular el Costo de Mercancía Vendida en facturas y notas de entrega para artículos
de esa categoría. `incomeAccount`/`expenseAccount` son complementarios.

> 📌 Estos 3 campos solo aparecen poblados en `GET /catalog/categories/:id` (detalle). El
> listado (`GET /catalog/categories`) no los incluye — no rediseñar el listado para mostrarlos,
> solo el formulario de edición/detalle.

### Cambios de UI

- Si el formulario de categoría ya tenía campos de cuenta de ingreso/gasto, verificar que
  ahora sí se reflejan al recargar después de guardar (antes probablemente parecían
  "desaparecer" tras guardar — era el bug).
- Agregar el campo nuevo "Cuenta de Costo de Mercancía Vendida (COGS)" al formulario de
  categoría, con tooltip explicando que es el que controla el costo real en ventas.

---

## 16. Resumen de pantallas afectadas  ✅ COMPLETADO

| Pantalla | Cambios a implementar |
|---|---|
| Facturas (crear/editar) | Selector `branch` (obligatorio condicional) + `department` en cabecera |
| Pedidos de venta (crear/editar) | Selector `branch` + `department` en cabecera |
| Compras (crear/editar, devoluciones) | Selector `branch` + `department` en cabecera |
| Gastos (crear/editar) | Selector `branch` (obligatorio condicional) + `department` en cabecera |
| Cobros (crear) | Selector `branch` + `department`, opcionalmente pre-poblados si el cobro referencia una única sucursal |
| Notas de débito | Selector `branch` + `department` (las notas de crédito NO llevan estos campos, se heredan solas) |
| Asientos contables | Selector `branch`/`department`/`costCenter` **por línea**, obligatorio condicional según `reportType` de la cuenta de esa línea; manejo de `BRANCH_REQUIRED` con línea específica en el mensaje |
| Conteos de inventario | Selector `branch` opcional + validación preventiva de `MIXED_BRANCH_COUNT` antes de enviar |
| Config → Cuentas de la Empresa | 16 campos nuevos agrupados por categoría, advertencia en `enablePerpetualInventory` |
| Config o Tablas → Centros de Costo | Nueva pantalla: árbol + CRUD |
| Config o Tablas → Departamentos | Nueva pantalla: árbol + CRUD |
| Reportes (ventas, ingresos-egresos, balance general, inventario, libro diario, libro mayor, cuadre, 606/607/608, movimientos por cuenta) | Filtros `branch`/`department` opcionales; Libro Diario además con 2 modos de agrupación nuevos y bloque `byDimension` |
| Reportes → CxC Aging | Sin cambios — no agregar filtro de dimensión aquí |
| Cuentas (plan de cuentas) | Selector `rootType` al crear cuenta raíz; mostrar `reportType` si es útil para UX de asientos |
| Listado de asientos, transferencias, conteos, notas de crédito/débito, devoluciones | Agregar filtros `branch`/`department` opcionales |
| Inventario (stock actual e historial) | Agregar filtro `branch` opcional (se traduce a almacenes internamente) |
| Config → Almacenes (crear) | Agregar selector "Cuenta de inventario" (ya existía en editar, faltaba en crear); mostrarla en el listado |
| Config → Ajustes avanzados (nueva) | 4 sub-pestañas nuevas: Cuentas, Inventario, Ventas, Compras — cada una mapeada a un endpoint de Settings, con las 2 advertencias de campos riesgosos |
| Config o Tablas → Retenciones (nueva) | Nueva pantalla: listado + formulario con tabla de tasas por rango de fechas |
| Compras → Costos de Importación (nueva) | Nueva pantalla: crear con documentos de recepción + cargos, recargar detalle para revisar `items` prorrateados antes de someter |
| Config → Empresa (RNC) | Sin cambio de contrato — el campo `rnc` ahora es internamente más consistente |
| Catálogo → Categorías (form) | Verificar que `incomeAccount`/`expenseAccount` ya persisten (antes no lo hacían); agregar campo nuevo `defaultCogsAccount` |
