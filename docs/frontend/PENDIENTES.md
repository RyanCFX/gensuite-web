# FRONTEND_PENDIENTES — Cambios de frontend por fase

> Este documento está escrito para el equipo de frontend. Por cada pendiente de `PENDIENTES.md` describe:
> - Qué endpoints / campos cambian en la API
> - Qué pantallas o componentes hay que actualizar
> - Qué es puro frontend sin cambios en el BFF
>
> **Convención de estado:** ✅ ya disponible en la API actual | 🆕 nuevo al completar este pendiente | 🔄 campo modificado | ❌ eliminado

---

## Índice rápido

| # | Pendiente | Impacto frontend | Prioridad | |
|---|-----------|-----------------|-----------|-|
| [0](#0-custom-fields-erpnext--api-no-cambia-aún) | Custom Fields ERPNext | Sin cambios de API aún | Prerequisito | ✅ |
| [1](#1-catálogo--reorganización-de-menú) | Reorganización menú | Solo routing | Bajo | ✅ |
| [2](#2-categorías--sub-categorías) | Sub-categorías | Form categoría | Bajo | ✅ |
| [3](#3-inventario--servicios-sin-uom) | Servicios sin UOM | Ocultar campo stockUom | Medio | ✅ |
| [4](#4-artículos--código-automático) | Código automático | Lógica conditional en form | Alto | ✅ |
| [5](#5-artículos--campos-nuevos) | Campos nuevos artículo | Nuevos campos en form | Bajo | ✅ |
| [6](#6-artículos--descripción-interna) | Descripción interna | Renombrar campo, ajustar docs | Medio | ✅ |
| [7](#7-artículos--tipo-combo) | Tipo Combo | Nueva sección catálogo | Medio | ✅ |
| [8](#8-artículos--3-precios-abc) | 3 Precios A/B/C | **Cambio grande: precios** | Alto | ✅ |
| [9](#9-artículos--modo-de-precio) | Modo de precio | Campos condicionales | Medio | ✅ |
| [10](#10-artículos--descuento-por-artículo) | Descuento por artículo | Nuevos campos form | Medio | ✅ |
| [11](#11-artículos--conversiones-bidireccionales) | Conversiones bidi | Sin cambio de UI | Bajo | ✅ |
| [12](#12-artículos--tracking-batchserial) | Batch/Serial | Modal asignación complejo | Alto | ✅ |
| [13](#13-artículos--impuesto-por-artículo) | Impuesto por artículo | Selector en form artículo | Medio | ✅ |
| [14](#14-clientes--categorías-con-precio) | Categorías cliente + precio | Grupos-clientes form | Medio | ✅ |
| [15](#15-ventas--motor-de-precios) | Motor de precios | Manejo de errores 400 | Medio | ✅ |
| [16](#16-ventas--pin-de-administrador) | PIN administrador | Modal PIN | Medio | ✅ |
| [17](#17-compras--precio-al-comprar) | Precio al comprar | Sin cambio de UI | Bajo | ✅ |
| [18](#18-cotizaciones--historial-de-enmiendas) | Historial cotizaciones | Timeline de versiones | Medio | ✅ |
| [19](#19-pedidos-de-venta) | Pedidos de venta | Nuevo módulo completo | Alto | ✅ |
| [20](#20-descuentos--descuento-por-línea) | Descuento por línea | Campo en líneas de docs | Bajo | ✅ |
| [21](#21-almacenes-por-usuario) | Almacenes por usuario | Config de usuario | Medio | ✅ |
| [22](#22-frontend--reorganización-y-ux) | Multi-tab, borradores, escáner | Infraestructura de app | Alto | ✅ |
| [23](#23-variantes-en-documentos) | Variantes en documentos | Modal variantes | Medio | ✅ |
| [24](#24-artículos--sin-cuentas-contables) | Sin cuentas en artículos | Eliminar campos del form | Bajo | ✅ |
| [25](#25-configuración--almacén-y-precio-default) | Almacén y precio default | Form empresa | Bajo | ✅ |

---

## 0. Custom Fields ERPNext — API no cambia aún

**Estado:** Los custom fields nuevos ya existen en ERPNext (`premium_soft.dev`), pero el BFF aún no los expone en ningún endpoint. Esta fase es solo preparación de infraestructura.

**Qué hace el frontend:** Nada en esta fase. Los campos se usarán en las fases siguientes.

**Contexto para el frontend:** Los campos que se agregaron en ERPNext son los que alimentarán las fases #5, #8, #9, #10, #12, #14, #16, #21 y #25. No requieren ningún cambio de API hasta que se implemente la fase respectiva.

---

## 1. Catálogo — Reorganización de menú ✅

**Estado:** ✅ COMPLETADO  
**Tipo:** ⚫ Solo frontend  
**Dificultad:** 🟢 Bajo

**Sin cambios en la API.** Solo cambios de routing y navegación.

### Cambios de UI

**Navegación lateral — estructura nueva:**

```
Tablas
  └── Categorías         → /catalog/categories
  └── Marcas             → /catalog/brands

Inventario
  └── Artículos          → /catalog/items   ← URL de API no cambia
  └── Stock              → /inventory
  └── Movimientos        → /inventory/historial
```

- Mover el enlace "Artículos" de la sección Catálogo a la sección Inventario en el menú lateral.
- Crear nueva sección "Tablas" con Categorías y Marcas.
- La URL del API sigue siendo `GET /api/v1/catalog/items` — solo cambia la URL del frontend.

---

## 2. Categorías — Sub-categorías ✅

**Estado:** ✅ COMPLETADO  
**Tipo:** ⚫ Solo frontend (la API ya lo soporta)  
**Dificultad:** 🟢 Bajo

### API actual (ya disponible ✅)

`POST /api/v1/catalog/categories`
```json
// Request — campo ya aceptado:
{ "name": "Laptops", "parentCategory": "Electrónicos" }

// Response — campo ya devuelto:
{ "id": "Laptops", "name": "Laptops", "parentCategory": "Electrónicos", ... }
```

`GET /api/v1/catalog/categories` devuelve `parentCategory: string | null` en cada ítem.

### Cambios de UI

**Formulario de crear/editar categoría:**
- Agregar selector "Categoría padre" (dropdown que lista las categorías existentes).
- El campo se mapea al parámetro `parentCategory` del request.
- Cuando `parentCategory` no se selecciona, no enviar el campo (queda en la raíz).

**Listado de categorías:**
- Mostrar la jerarquía con indentación visual según el `parentCategory` de cada ítem.
- Opcional: mostrar como árbol colapsable.

---

## 3. Inventario — Servicios sin UOM ✅

**Estado:** ✅ COMPLETADO — BFF asigna `'Nos'` automáticamente; frontend oculta campos UOM para servicios.  
**Tipo:** BFF  
**Dificultad:** 🟡 Medio

### Cambio en la API 🆕

`POST /api/v1/catalog/items` — después del fix:

| Campo | Antes | Después |
|-------|-------|---------|
| `stockUom` | **Requerido** | Opcional cuando `type = "service"` |

```json
// Antes — fallaba sin stockUom
{ "itemName": "Servicio de Instalación", "type": "service" }

// Después — el BFF asigna "Nos" automáticamente
{ "itemName": "Servicio de Instalación", "type": "service" }  // stockUom se omite
```

### Cambios de UI

**Formulario de artículo:**
- Ocultar el campo `stockUom` cuando `type === "service"` (el BFF lo asigna internamente).
- También ocultar `purchaseUom` y `salesUom` cuando `type === "service"`.
- Si el usuario cambia de "producto" a "servicio" en un artículo existente, limpiar esos campos del form.

---

## 4. Artículos — Código automático ✅

**Estado:** ✅ COMPLETADO — Modos `manual`/`auto`/`prefix_auto` en `GET/PUT /config/empresa`. BFF genera código según modo.  
**Tipo:** BFF + ERPNext  
**Dificultad:** 🔴 Alto

### Cambios en la API 🆕

**`GET/PUT /api/v1/config/empresa`** — nuevos campos en response/request:

```json
// Response GET /config/empresa — nuevos campos:
{
  "itemCodeMode": "manual" | "auto" | "prefix_auto",
  ...
}

// Request PUT /config/empresa — nuevos campos aceptados:
{
  "itemCodeMode": "manual" | "auto" | "prefix_auto"
}
```

**`PUT /api/v1/catalog/categories/:id`** — nuevo campo aceptado:

```json
{
  "itemCodePrefix": "VEN"  // hasta 5 chars, único por categoría
}
```

**`POST /api/v1/catalog/items`** — `itemCode` se vuelve completamente opcional:

```json
// Modo manual: enviar itemCode
{ "itemCode": "PROD-001", "itemName": "...", ... }

// Modo auto o prefix_auto: NO enviar itemCode, el BFF lo genera
{ "itemName": "Laptop HP", "category": "Laptops", ... }

// Response siempre incluye el código asignado:
{ "id": "ELEC-0003", "itemName": "Laptop HP", ... }
```

### Cambios de UI

**Pantalla Configuración → Empresa:**
- Agregar selector "Modo de asignación de código de artículo": Manual / Automático / Por prefijo de categoría.
- Advertencia al cambiar de manual a automático: "Este cambio es irreversible".

**Formulario de categoría:**
- Cuando el modo global es `prefix_auto`, mostrar campo "Prefijo de código" (máx 5 caracteres) en el formulario de edición de categoría.
- Mostrar el prefijo actual en el listado de categorías.

**Formulario de artículo:**
- Modo `manual`: mostrar campo `itemCode` como requerido (comportamiento actual).
- Modo `auto` o `prefix_auto`: ocultar el campo `itemCode`. Mostrar en su lugar un placeholder "El código se asignará automáticamente".
- Después de crear, mostrar el código asignado en el toast/confirmación: "Artículo creado con código ELEC-0003".

---

## 5. Artículos — Campos nuevos

**Tipo:** BFF  
**Dificultad:** 🟢 Bajo

### Cambios en la API 🆕

**`POST/PUT /api/v1/catalog/items`** — nuevos campos en request:

```json
{
  "shortName": "Laptop HP 15",          // nombre corto (max ~50 chars)
  "notes": "Incluye cargador y maletín", // notas que aparecen en documentos
  "hasWarranty": true,
  "warrantyPeriod": 365,                  // días de garantía
  "barcodes": [
    { "barcode": "7501234567890", "barcodeType": "EAN" },
    { "barcode": "PROD-001", "barcodeType": "CODE-128" }
  ]
}
```

**`GET /api/v1/catalog/items/:id`** — nuevos campos en response:

```json
{
  "shortName": "Laptop HP 15",
  "notes": "Incluye cargador",
  "hasWarranty": true,
  "warrantyPeriod": 365,
  "barcodes": [
    { "barcode": "7501234567890", "barcodeType": "EAN" }
  ],
  ...
}
```

### Cambios de UI

**Formulario de artículo — nuevos campos:**
- `shortName`: Input texto, opcional. Tooltip: "Se usa internamente para búsquedas rápidas".
- `notes`: Textarea, opcional. Tooltip: "Aparece en cotizaciones y facturas".
- `hasWarranty`: Checkbox. Al activarlo, mostrar input `warrantyPeriod` (número de días).
- `barcodes`: Tabla editable con columnas Código y Tipo (EAN, UPC, CODE-128, etc.). Botón "+ Agregar código".

**Lista de artículos:**
- Si el artículo tiene `shortName`, mostrarlo como subtítulo bajo el nombre principal.

**Documentos (cotizaciones, facturas):**
- Al seleccionar un artículo que tiene `notes`, mostrar las notas debajo de la línea (editable).

---

## 6. Artículos — Descripción interna

**Tipo:** BFF  
**Dificultad:** 🟡 Medio

### Cambios en la API 🔄

El campo `description` cambia de semántica:

| Campo | Antes | Después |
|-------|-------|---------|
| `description` en request | Descripción (se copia a documentos) | **Descripción interna** (no aparece en documentos) |
| `description` en response | Valor del campo ERPNext `description` | Valor del campo `custom_internal_description` |

```json
// POST /catalog/items
{
  "description": "Solo visible en la ficha del artículo, no en facturas"
}

// GET /catalog/items/:id
{
  "description": "Solo visible en la ficha del artículo, no en facturas",
  // No hay campo público que el frontend pueda enviar para la descripción del documento.
  // ERPNext usa el nombre del artículo como descripción en documentos.
  ...
}
```

### Cambios de UI

**Formulario de artículo:**
- El campo "Descripción" sigue existiendo pero cambiar su tooltip/label: "Descripción interna — solo visible en la ficha del artículo, no aparece en facturas ni cotizaciones".

**Documentos (cotizaciones, facturas):**
- En las líneas de documento, la columna "Descripción" muestra el `itemName` del artículo.
- Permitir al usuario editar esa descripción en la línea antes de guardar (ERPNext permite `description` por línea).
- No pre-poblar la descripción de la línea con el campo `description` del artículo — eso ya no tiene sentido.

---

## 7. Artículos — Tipo Combo

**Tipo:** BFF (nuevo módulo)  
**Dificultad:** 🟡 Medio

### Nuevos endpoints 🆕

```
GET    /api/v1/catalog/bundles          → listar bundles paginado
GET    /api/v1/catalog/bundles/:id      → detalle con componentes
POST   /api/v1/catalog/bundles          → crear bundle
PUT    /api/v1/catalog/bundles/:id      → actualizar componentes
DELETE /api/v1/catalog/bundles/:id      → desactivar
```

**`POST /api/v1/catalog/bundles`** — request:

```json
{
  "itemCode": "COMBO-001",
  "itemName": "Combo Lapicero + Grapadora",
  "components": [
    { "itemCode": "LAP-001", "qty": 2 },
    { "itemCode": "GRAP-001", "qty": 1 }
  ],
  "priceA": 350,
  "priceB": 300,
  "priceC": 270
}
```

**`GET /api/v1/catalog/bundles/:id`** — response:

```json
{
  "id": "COMBO-001",
  "itemName": "Combo Lapicero + Grapadora",
  "components": [
    { "itemCode": "LAP-001", "itemName": "Lapicero Azul", "qty": 2, "stockQty": 45 },
    { "itemCode": "GRAP-001", "itemName": "Grapadora Estándar", "qty": 1, "stockQty": 12 }
  ],
  "priceA": 350, "priceB": 300, "priceC": 270,
  "disabled": false
}
```

### Cambios de UI

**Navegación:**
- Agregar "Combos" bajo la sección Inventario o Tablas.

**Pantalla de combos:**
- Lista de combos con nombre, número de componentes y estado.
- Formulario de crear/editar: nombre, código (si modo manual), y tabla de componentes con buscador de artículos, cantidad por componente, y los 3 precios A/B/C.
- Mostrar en la tabla el stock actual de cada componente (viene en el response del `GET :id`).

**Cotizaciones y Facturas:**
- Al agregar un combo a una línea, el sistema lo agrega normalmente (con el `itemCode` del combo). ERPNext explota automáticamente los componentes al someter.
- Mostrar indicador visual en la línea de que es un combo (ej: ícono o badge "Combo").

---

## 8. Artículos — 3 Precios A/B/C

**Tipo:** BFF + ERPNext  
**Dificultad:** 🔴 Alto — **Este es el cambio más impactante en el formulario de artículos**

### Cambios en la API 🔄 🆕

**`POST/PUT /api/v1/catalog/items`** — `standardRate` se reemplaza por 3 precios:

```json
// Antes
{ "standardRate": 1500 }

// Después
{ "priceA": 1800, "priceB": 1500, "priceC": 1200 }
// A = Máximo (clientes VIP / venta especial)
// B = Promedio (precio estándar)
// C = Mínimo (precio al mayor)
```

> ⚠️ `standardRate` queda **deprecated** pero no se elimina todavía para compatibilidad.

**`GET /api/v1/catalog/items/:id`** — response con 3 precios:

```json
{
  "standardRate": 1500,    // deprecated — era el único precio
  "prices": {              // nuevo — los 3 precios
    "A": 1800,
    "B": 1500,
    "C": 1200
  },
  ...
}
```

**`GET /api/v1/catalog/items`** — response del listado (vista rápida):

```json
// Cada ítem en la lista incluye:
{
  "id": "LAP-001",
  "prices": { "A": 1800, "B": 1500, "C": 1200 }
}
```

### Cambios de UI

**Formulario de artículo — sección Precios:**
- Reemplazar el único campo "Precio de venta" por 3 campos:
  - **Precio A — Máximo** (clientes sin categoría en ventas especiales)
  - **Precio B — Promedio** (precio estándar, el más usado)
  - **Precio C — Mínimo** (precio al por mayor)
- Los 3 son opcionales, pero mostrar advertencia si Precio B está vacío.
- Validar en el frontend: A ≥ B ≥ C.

**Listado de artículos:**
- Columna "Precio" → mostrar precio B como precio principal.
- Hover o tooltip que muestre los 3 precios.

**Cotizaciones / Facturas — selector de precio:**
- Al agregar una línea, pre-poblar `rate` con el precio correspondiente al tier del cliente.
- Mostrar al vendedor qué tier le aplica al cliente actual (A, B o C) con un badge.

---

## 9. Artículos — Modo de precio (manual vs sobre costo)

**Tipo:** BFF + ERPNext  
**Dificultad:** 🟡 Medio

### Cambios en la API 🆕

**`POST/PUT /api/v1/catalog/items`** — nuevos campos en request:

```json
{
  "priceMode": "manual" | "cost_plus",
  "marginA": 40,   // % ganancia para calcular Precio A (solo si priceMode="cost_plus")
  "marginB": 25,   // % ganancia para Precio B
  "marginC": 10    // % ganancia para Precio C
}
```

**`GET /api/v1/catalog/items/:id`** — nuevos campos en response:

```json
{
  "priceMode": "manual",
  "marginA": 40,
  "marginB": 25,
  "marginC": 10,
  "prices": { "A": 1800, "B": 1500, "C": 1200 },
  ...
}
```

**Comportamiento cuando `priceMode = "cost_plus"`:**
- Al crear/actualizar, el BFF calcula automáticamente los precios: `precio = costo / (1 - margen%)`.
- El frontend NO envía `priceA/B/C` — solo los porcentajes de margen.
- Al comprar (pendiente #17), los precios se recalculan automáticamente con el nuevo costo.

### Cambios de UI

**Formulario de artículo — sección Precios:**
- Agregar selector "Modo de precio": Manual / Sobre costo.
- **Modo Manual (default):** mostrar los 3 campos de precio (igual que pendiente #8).
- **Modo Sobre costo:** ocultar los 3 campos de precio y mostrar en su lugar 3 campos de margen (% ganancia A, % ganancia B, % ganancia C). Mostrar un preview calculado: "Precio estimado con costo actual: A=RD$1,800 / B=RD$1,500 / C=RD$1,200".
- Si el usuario cambia de "Sobre costo" a "Manual", los precios actuales se conservan (ya están calculados en ERPNext).

---

## 10. Artículos — Descuento por artículo

**Tipo:** BFF + ERPNext  
**Dificultad:** 🟡 Medio

### Cambios en la API 🆕

**`POST/PUT /api/v1/catalog/items`** — nuevos campos en request:

```json
{
  "allowsDiscount": true,      // default: true
  "minDiscountPct": 15         // % mínimo de descuento requerido al vender (0 = sin mínimo)
}
```

**`GET /api/v1/catalog/items/:id`** — nuevos campos en response:

```json
{
  "allowsDiscount": true,
  "minDiscountPct": 15,
  ...
}
```

**Comportamiento en documentos de venta:**
- Si `allowsDiscount = false` y se envía un `discountPct > 0` en la línea → BFF devuelve `400`.

### Cambios de UI

**Formulario de artículo — sección Precios:**
- Checkbox "Acepta descuento" (`allowsDiscount`). Default: activado.
- Al activar: mostrar input "% mínimo de descuento requerido" (`minDiscountPct`). 0 = sin mínimo.

**Líneas de documentos (cotizaciones, facturas):**
- Si `allowsDiscount = false`, deshabilitar el campo descuento en esa línea y mostrar tooltip: "Este artículo no acepta descuentos".
- Si se supera `maxDiscountPct`, mostrar un indicador visual y activar el flujo de PIN de administrador (ver pendiente #16).

---

## 11. Artículos — Conversiones bidireccionales

**Tipo:** BFF  
**Dificultad:** 🟢 Bajo

### Cambio en la API (comportamiento interno) 🔄

`POST /api/v1/config/uom` — al crear una conversión A→B, el BFF crea automáticamente la inversa B→A.

**No hay cambio en el contrato de request/response.** El frontend ya no necesita crear manualmente la conversión inversa.

### Cambios de UI

**Módulo UOM / Conversiones:**
- Informar al usuario en el formulario de conversión: "La conversión inversa se crea automáticamente".
- En el listado de conversiones de una UOM, mostrar tanto la directa como la inversa.

---

## 12. Artículos — Tracking Batch/Serial

**Tipo:** BFF + ERPNext  
**Dificultad:** 🔴 Alto — **Requiere modal complejo en compras**

### Cambios en la API 🆕

**`POST/PUT /api/v1/catalog/items`** — nuevo campo:

```json
{
  "trackingType": "none" | "batch" | "serial"
}
```

**`GET /api/v1/catalog/items/:id`** — nuevo campo en response:

```json
{ "trackingType": "none", ... }
```

**`POST /api/v1/compras`** — líneas con tracking requieren datos adicionales:

```json
// Artículo con trackingType="batch"
{
  "items": [{
    "itemCode": "MED-001",
    "qty": 100,
    "rate": 50,
    "batches": [
      { "batchId": "LOTE-2024-001", "expiryDate": "2026-12", "qty": 60 },
      { "batchId": "LOTE-2024-002", "expiryDate": "2027-03", "qty": 40 }
    ]
  }]
}

// Artículo con trackingType="serial"
{
  "items": [{
    "itemCode": "LAPTOP-HP",
    "qty": 3,
    "rate": 45000,
    "serials": ["SN-001", "SN-002", "SN-003"]  // qty debe coincidir con len(serials)
  }]
}
```

**Nuevos endpoints de consulta 🆕:**

```
GET /api/v1/inventory/lotes?itemCode=&limit=&offset=
→ [{ id, item, itemName, expiryDate, qty, disabled }]

GET /api/v1/inventory/seriales?itemCode=&status=&limit=&offset=
→ [{ id, itemCode, itemName, status, purchaseDate, deliveryDate }]
```

### Cambios de UI

**Formulario de artículo — nuevo campo:**
- Selector "Seguimiento": Ninguno / Por lote / Por número de serie.
- Advertencia al cambiar de "Ninguno" a "Lote/Serial" en artículo existente: "Este cambio afecta a las transacciones futuras".

**Módulo de compras — modal de asignación de lotes/seriales:**
- Al finalizar la selección de artículos en una compra, si alguno tiene tracking, mostrar modal antes de guardar.
- **Para lotes:** tabla con columnas Código de lote, Fecha de vencimiento (MM/AAAA), Cantidad. Botón "+ Agregar lote". La suma de cantidades debe igualar la cantidad de la línea.
- **Para seriales:** área de inputs secuenciales. Auto-avance al siguiente input al detectar que se pegó/escaneó un valor. La cantidad de seriales debe igualar la cantidad de la línea.
- Soporte para lectores de código de barras: detectar input rápido (< 100ms entre caracteres) y avanzar automáticamente.

**Inventario — nuevas sub-páginas:**
- "Lotes": tabla filtrable por artículo, con columnas lote, fecha exp., cantidad disponible. Indicador de color para lotes próximos a vencer (< 30 días).
- "Seriales": tabla filtrable por artículo y estado (Activo, Entregado, etc.).

---

## 13. Artículos — Impuesto por artículo

**Tipo:** BFF  
**Dificultad:** 🟡 Medio

### Cambios en la API 🆕

**Nuevo endpoint:**
```
GET /api/v1/config/item-tax-templates
→ [{ id: "ITBIS 18%", title: "ITBIS 18%" }]
```

**`POST/PUT /api/v1/catalog/items`** — nuevo campo en request:

```json
{ "taxTemplate": "ITBIS 18%" }
```

**`GET /api/v1/catalog/items/:id`** — nuevo campo en response:

```json
{ "taxTemplate": "ITBIS 18%", ... }
```

### Cambios de UI

**Formulario de artículo — nueva sección Impuestos:**
- Dropdown "Plantilla de impuesto" que carga de `GET /config/item-tax-templates`.
- Valor por defecto: vacío (usa la plantilla de la empresa).
- Tooltip: "Si se selecciona, sobreescribe el impuesto aplicado a este artículo en todos los documentos".

---

## 14. Clientes — Categorías con precio

**Tipo:** BFF + ERPNext  
**Dificultad:** 🟡 Medio

### Cambios en la API 🆕

**`GET /api/v1/config/grupos-clientes`** — nuevo campo en response:

```json
[{
  "id": "Mayoristas",
  "name": "Mayoristas",
  "priceTier": "C"         // nuevo: A | B | C | null
}]
```

**`PUT /api/v1/config/grupos-clientes/:id`** — nuevo campo en request:

```json
{ "priceTier": "C" }
```

**`GET /api/v1/customers/:id`** — nuevo campo en response:

```json
{
  "customerGroup": "Mayoristas",
  "priceTier": "C",         // nuevo: heredado del grupo
  ...
}
```

### Cambios de UI

**Configuración → Grupos de clientes:**
- Agregar columna "Clasificación de precio" (A/B/C) en la tabla de grupos.
- En el formulario de crear/editar grupo, agregar selector "Clasificación de precio": A (máximo) / B (promedio) / C (mínimo) / Sin clasificación.

**Ficha de cliente:**
- Mostrar la clasificación de precio del cliente (heredada del grupo): badge "Precio A", "Precio B", "Precio C".

**Cotizaciones / Facturas:**
- Mostrar badge de tier del cliente seleccionado en la cabecera del documento.
- Pre-poblar automáticamente los precios de las líneas con el precio del tier del cliente.

---

## 15. Ventas — Motor de precios y validaciones

**Tipo:** BFF  
**Dificultad:** 🟡 Medio

### Cambios en la API (nuevos errores 400) 🆕

El BFF ahora puede devolver estos errores al crear/actualizar una cotización o factura:

```json
// Vender por debajo del costo
{ "statusCode": 400, "message": "El precio de LAP-001 (45000) no puede ser menor al costo de compra (48000)." }

// Superar precio máximo del tier del cliente
{ "statusCode": 400, "message": "El precio de LAP-001 supera el precio máximo de la categoría del cliente (Precio C)." }

// Superar % máximo de descuento del usuario
{ "statusCode": 400, "message": "Tu perfil permite un descuento máximo de 10%. Solicita autorización de un administrador." }
```

**No hay cambio en el contrato de request.** Los errores son nuevas restricciones sobre endpoints existentes.

### Cambios de UI

**Cotizaciones y Facturas — manejo de errores:**
- Mostrar los mensajes de error como notificaciones toast con texto exacto del `message`.
- Para el error de "% máximo de descuento", en lugar de solo mostrar el error, activar el flujo de **PIN de administrador** (ver pendiente #16): botón "Solicitar autorización" en el toast.
- Para el error de "precio por debajo del costo", mostrar en el campo de precio un indicador visual en rojo con el costo mínimo como tooltip.

---

## 16. Ventas — PIN de administrador

**Tipo:** BFF  
**Dificultad:** 🟡 Medio

### Nuevo endpoint 🆕

```
POST /api/v1/auth/verify-admin-pin
Body: { "pin": "1234" }
Response: { "valid": true, "userId": "admin@empresa.com", "canOverridePrice": true }
```

Si el PIN es inválido:
```json
{ "statusCode": 401, "message": "PIN inválido" }
```

### Cambios de UI

**Módulo de Usuarios — formulario:**
- Agregar campo "PIN de administrador" (input type password, 4 dígitos). Con confirmación de PIN.
- Solo visible para usuarios con rol de administrador.
- Tooltip: "Este PIN permite autorizar descuentos y precios especiales en el punto de venta".
- **Nota:** El campo PIN se configura directamente en ERPNext (`custom_admin_pin`) — el BFF actualmente no expone este campo en `PUT /usuarios/:id`. Usar ERPNext directamente o solicitar la implementación del campo en el BFF.

**Modal de PIN (reutilizable en toda la app):**
- Se activa cuando el vendedor intenta superar el límite de descuento del artículo o del usuario.
- 4 inputs numéricos grandes (estilo POS), auto-avance entre dígitos.
- Al confirmar, llamar `POST /auth/verify-admin-pin`. Si válido, el frontend reintenta la operación con el PIN autorizado en el header (ver implementación).
- Mostrar nombre del administrador que autorizó una vez validado.

**Configuración de usuario:**
- En la pantalla de perfil (`GET /config/perfil`), mostrar campo para configurar el propio PIN.

---

## 17. Compras — Precio al comprar

**Tipo:** BFF  
**Dificultad:** 🟡 Medio (solo BFF, sin cambio de UI)

### Sin cambios en la API de contrato

El BFF recalcula los precios de venta automáticamente al someter una compra cuando el artículo tiene `priceMode = "cost_plus"`. Ocurre en segundo plano.

### Cambios de UI

**Pantalla de compras — al someter:**
- Mostrar en el resultado del submit un resumen de precios actualizados (opcional): "Se actualizaron los precios de 3 artículos (modo sobre costo)".
- Los artículos en cuestión mostrarán sus nuevos precios en el catálogo automáticamente.

---

## 18. Cotizaciones — Historial de enmiendas

**Tipo:** BFF  
**Dificultad:** 🟡 Medio

### Cambios en la API 🆕

**Nuevo endpoint:**
```
POST /api/v1/quotations/:id/amend
Response: { "newId": "QUOT-0002-1", "amendedFrom": "QUOT-0002" }
```

**`GET /api/v1/quotations/:id`** — nuevo campo en response:

```json
{
  "id": "QUOT-0002-1",
  "amendedFrom": "QUOT-0002",    // nuevo: de qué versión viene
  "history": [                    // nuevo: cadena completa de versiones anteriores
    {
      "id": "QUOT-0002",
      "date": "2026-06-01",
      "status": "Cancelled",
      "total": 150000
    }
  ],
  ...
}
```

**`GET /api/v1/quotations`** — el listado ya no muestra cotizaciones canceladas por enmienda (el BFF filtra automáticamente para mostrar solo la versión más reciente de cada cadena).

### Cambios de UI

**Ficha de cotización:**
- Agregar sección "Historial de versiones" al final de la pantalla.
- Mostrar la cadena de enmiendas como timeline: Versión 1 (cancelada) → Versión 2 (actual).
- Cada versión en el historial es clickeable → navegar a esa versión de la cotización.

**Botones de acción de cotización:**
- Al estado "Submitted": agregar botón "Enmendar" que llama `POST :id/amend` y navega al nuevo borrador.
- Mostrar badge "Versión X" en el encabezado cuando `amendedFrom` está presente.

---

## 19. Pedidos de venta

**Tipo:** BFF (nuevo módulo)  
**Dificultad:** 🔴 Alto

### Nuevos endpoints 🆕

```
GET    /api/v1/pedidos                 → lista paginada
GET    /api/v1/pedidos/:id             → detalle
POST   /api/v1/pedidos                 → crear borrador
PUT    /api/v1/pedidos/:id             → actualizar borrador
POST   /api/v1/pedidos/:id/submit      → someter → genera factura
POST   /api/v1/pedidos/:id/amend       → enmendar
POST   /api/v1/pedidos/:id/cancel      → cancelar
```

**`POST /api/v1/quotations/:id/submit`** — sin cambio de comportamiento:
Someter una cotización la pasa a estado `Submitted` en ERPNext. **No crea un Pedido de Venta automáticamente.** El pedido se crea de forma independiente en el módulo `/pedidos`.

**`POST /api/v1/pedidos/:id/submit`** — response:
```json
{ "facturaId": "SINV-001" }   // factura generada desde el pedido
```

### Cambios de UI

**Nueva sección "Pedidos de Venta" en el menú:**
- Flujo visual del proceso de venta: Cotización → Pedido → Factura.
- Listado de pedidos con filtros por estado (Borrador, Activo, Completado, Cancelado), cliente y fecha.
- Ficha de pedido similar a cotización: cabecera + líneas + botones de acción.

**Flujo cotización → pedido:**
- Botón "Someter" en cotización → pasa la cotización a estado `Submitted` en ERPNext.
- Para crear un pedido desde una cotización, el usuario debe crear el pedido manualmente en el módulo Pedidos (no hay conversión automática).
- Mostrar botón "Crear Pedido" en la ficha de cotización sometida para facilitar el flujo al usuario.

**Ficha de pedido:**
- Cabecera con cliente, fecha pedido, fecha entrega estimada.
- Líneas de artículos (igual que cotización).
- Estado: Borrador / En proceso / Completado / Cancelado.
- Botón "Facturar" (POST :id/submit) → genera factura → navegar a la factura.
- Botón "Enmendar" cuando está sometido (igual que cotizaciones).
- Badge "Factura generada" con link cuando tiene factura asociada.

---

## 20. Descuentos — Descuento por línea

**Tipo:** BFF  
**Dificultad:** 🟢 Bajo

### Cambios en la API 🆕

**`POST/PUT /api/v1/quotations`** y **`POST /api/v1/invoices`** — en cada ítem de línea:

```json
{
  "items": [{
    "itemCode": "LAP-001",
    "qty": 2,
    "rate": 45000,
    "discountPct": 10     // nuevo: % de descuento en esta línea (0-100)
  }]
}
```

**`GET /api/v1/quotations/:id`** y **`GET /api/v1/invoices/:id`** — en cada línea del response:

```json
{
  "items": [{
    "itemCode": "LAP-001",
    "qty": 2,
    "rate": 45000,
    "discountPct": 10,          // nuevo
    "discountedRate": 40500,    // precio con descuento aplicado
    "amount": 81000             // qty * discountedRate
  }]
}
```

### Cambios de UI

**Líneas de documentos (cotizaciones y facturas):**
- Agregar columna "Descuento %" en la tabla de líneas. Por defecto vacío (= 0%).
- Calcular y mostrar en tiempo real el precio con descuento junto al precio original (tachado).
- Validar en el frontend: 0 ≤ descuento ≤ 100.
- Si el artículo tiene `maxDiscountPct` definido, mostrar indicador de límite en el campo de descuento.

---

## 21. Almacenes por usuario

**Tipo:** BFF + ERPNext  
**Dificultad:** 🟡 Medio

### Cambios en la API 🆕

**`GET /api/v1/usuarios/:id`** — nuevo campo en response:

```json
{
  "warehouses": ["Bodega Principal - JB", "Sucursal Norte - JB"],  // nuevo: array de almacenes asignados
  ...
}
```

**`PUT /api/v1/usuarios/:id`** — nuevo campo en request:

```json
{
  "warehouses": ["Bodega Principal - JB", "Sucursal Norte - JB"]
  // Array vacío [] = acceso a todos los almacenes
}
```

**Efecto en inventario:**
`GET /api/v1/inventory` filtrado automáticamente por los almacenes del usuario autenticado. Sin cambio en la request.

### Cambios de UI

**Formulario de usuario (solo admins):**
- Agregar sección "Almacenes permitidos": multi-select que carga de `GET /config/almacenes`.
- Nota: dejar vacío = acceso a todos los almacenes.

**Inventario:**
- Si el usuario tiene almacenes asignados, el listado ya mostrará solo esos almacenes (el filtro lo aplica el BFF). Sin cambio de UI especial.
- Mostrar un banner informativo cuando hay filtro activo: "Mostrando inventario de 2 almacenes asignados".

---

## 22. Frontend — Reorganización y UX

**Tipo:** ⚫ Solo frontend  
**Dificultad:** 🔴 Alto

### 22a. Multi-pestaña interna

Sistema de tabs dentro de la app (similar a VS Code):

- Cada ruta navegada se abre como una pestaña interna.
- El estado de cada pestaña es independiente.
- Botón de cerrar con confirmación si hay cambios sin guardar.
- Barra de pestañas persistente en la parte superior del área de contenido.

```
[Dashboard] [Artículos] [Nueva Cotización ×] [Cliente: Juan ×]
```

**Cambio de navegación:**
- `router.push('/catalog/items')` → abrir en nueva pestaña si no existe, o activar la existente.
- Guardar estado de pestañas en `sessionStorage` para sobrevivir refresh.

### 22b. Alerta al cerrar con cambios

```javascript
window.addEventListener('beforeunload', (e) => {
  if (anyTabHasUnsavedChanges()) {
    e.preventDefault()
    e.returnValue = ''
  }
})
```

Al cerrar una pestaña interna con cambios → modal de confirmación propio (no el del navegador).

### 22c. Borrador automático en caché

Para formularios de documentos (cotizaciones, pedidos, facturas, compras):

```javascript
// Auto-guardar en localStorage cada 30 segundos
const DRAFT_KEY = `draft:${routeName}:${userId}`
localStorage.setItem(DRAFT_KEY, JSON.stringify(formState))

// Al abrir formulario nuevo → verificar borrador
const draft = localStorage.getItem(DRAFT_KEY)
if (draft) {
  showDialog('Recuperar borrador guardado el [fecha]?')
}

// Al guardar exitosamente → limpiar borrador
localStorage.removeItem(DRAFT_KEY)
```

### 22d. Escaneo de código de barras (global)

Listener global para detectar lectores de código de barras (input rápido):

```javascript
let scanBuffer = '', lastKeyTime = 0

document.addEventListener('keydown', (e) => {
  const now = Date.now()
  if (now - lastKeyTime < 80) {           // < 80ms entre teclas = escáner
    scanBuffer += e.key
  } else {
    scanBuffer = e.key
  }
  lastKeyTime = now

  if (e.key === 'Enter' && scanBuffer.length > 4) {
    const code = scanBuffer.replace('Enter', '')
    onBarcodeScanned(code)  // emitir evento global
    scanBuffer = ''
    e.preventDefault()
  }
})
```

**Uso en cotizaciones y facturas:**
`GET /api/v1/catalog/items?barcode={code}&limit=1` → si encontrado, agregar línea automáticamente.

---

## 23. Variantes en documentos

**Tipo:** ⚫ Solo frontend (BFF ya tiene los endpoints)  
**Dificultad:** 🟡 Medio

### API ya disponible ✅

```
GET /api/v1/catalog/items/:id/variants
→ [{ id, itemName, attributes: [{attribute, attributeValue}], currentStock }]
```

### Cambios de UI

**Cotizaciones, Facturas y Compras — selector de artículos:**

1. Al buscar y seleccionar un artículo donde `hasVariants === true`:
   - No agregar el template directamente a la línea.
   - Abrir un **modal de variantes**.

2. **Modal de variantes:**
   - Llamar `GET /catalog/items/:templateId/variants`.
   - Mostrar tabla con columnas: variante (atributos como "Color: Rojo / Talla: M"), stock disponible, y campo de cantidad.
   - El usuario puede seleccionar múltiples variantes con sus cantidades.
   - Al confirmar: agregar una línea separada al documento por cada variante seleccionada, usando el `id` de la variante (no del template).

3. Si se intenta agregar el template directamente sin pasar por el modal (ej: escáner) → abrir el modal automáticamente.

4. Mostrar en la línea del documento los atributos de la variante (ej: "(Rojo / M)") bajo el nombre del artículo.

---

## 24. Artículos — Sin cuentas contables

**Tipo:** BFF  
**Dificultad:** 🟢 Bajo

### Cambios en la API ❌ (campos eliminados)

**`POST/PUT /api/v1/catalog/items`** — campos **eliminados** del request:

```json
// Antes — se podían enviar (pero se ignoraban si no había categoría de cuenta):
{ "incomeAccount": "Ventas - JB", "expenseAccount": "Costo de Ventas - JB" }

// Después — el BFF ignora estos campos si los envías (o devuelve 400)
// Las cuentas se heredan de la categoría del artículo o de los defaults de la empresa.
```

**`GET /api/v1/catalog/items/:id`** — campos **eliminados** del response:
- Ya no incluye `incomeAccount` ni `expenseAccount`.

### Cambios de UI

**Formulario de artículo:**
- Eliminar los campos "Cuenta de ingreso" y "Cuenta de gasto" si estaban expuestos.
- Las cuentas se configuran a nivel de categoría (`PUT /catalog/categories/:id`) o empresa (`PUT /config/cuentas-empresa`).

---

## 25. Configuración — Almacén y precio default

**Tipo:** BFF  
**Dificultad:** 🟢 Bajo

### Cambios en la API 🆕

**`GET /api/v1/config/empresa`** — nuevos campos en response:

```json
{
  "defaultWarehouse": "Bodega Principal - JB",  // nuevo: puede ser null
  "defaultPriceTipo": "B",                       // nuevo: A | B | C
  ...
}
```

**`PUT /api/v1/config/empresa`** — nuevos campos aceptados:

```json
{
  "defaultWarehouse": "Bodega Principal - JB",
  "defaultPriceTipo": "B"
}
```

### Cambios de UI

**Configuración → Empresa — nueva sección "Valores por defecto":**

- **Almacén por defecto**: dropdown que carga de `GET /config/almacenes`. Se usa como almacén cuando un artículo no tiene almacén propio configurado.
- **Precio default para ventas sin cliente**: selector A / B / C. Se usa cuando el cliente no tiene grupo con clasificación de precio asignada. Tooltip: "A = Máximo, B = Promedio, C = Mínimo".

---

## Resumen de cambios por pantalla

| Pantalla | Pendientes que la afectan |
|----------|--------------------------|
| Configuración → Empresa | #4 (modo código), #25 (almacén y precio default) |
| Configuración → Grupos de clientes | #14 (precio tier) |
| Configuración → Almacenes | Sin cambios en UI |
| Configuración → UOM | #11 (conversiones bidi, aviso en UI) |
| Configuración → Usuarios | #16 (PIN admin), #21 (almacenes por usuario) |
| Catálogo → Categorías | #2 (sub-categorías), #4 (prefijo de código) |
| Catálogo → Artículos — Lista | #8 (mostrar 3 precios) |
| Catálogo → Artículos — Form | #3 (#5 (#6 (#8 (#9 (#10 (#12 (#13 (#24 (muchos campos nuevos) |
| Catálogo → Combos | #7 (nuevo módulo) |
| Catálogo → Atributos | Ya disponible ✅ |
| Inventario → Stock | #21 (filtro por usuario) |
| Inventario → Lotes | #12 (nuevo) |
| Inventario → Seriales | #12 (nuevo) |
| Cotizaciones | #18 (historial), #19 (→ pedidos), #20 (descuento línea), #23 (variantes) |
| Pedidos de Venta | #19 (nuevo módulo completo) |
| Facturas | #20 (descuento línea), #23 (variantes), #15 (manejo errores precios) |
| Compras | #12 (batch/serial), #17 (aviso precios actualizados) |
| Navegación lateral | #1 (reorganización) |
| Infraestructura app | #22 (multi-tab, borradores, escáner) |
