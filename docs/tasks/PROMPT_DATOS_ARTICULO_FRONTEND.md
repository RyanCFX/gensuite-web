# Prompt para el agente de frontend: Datos del artículo (qué información ve cada usuario en Productos e Inventario)

> **Para quien recibe este documento:** sos el agente que implementa el frontend de GenSuite
> (React). No tienes memoria de ninguna conversación previa. Todo lo que necesitás está en este
> documento y en el `openapi.json` del repo del frontend, que trae la documentación del API.
>
> **Cómo leer el `openapi.json` frente a este documento:**
> - Los **endpoints y los DTO** (forma de los objetos) los define el `openapi.json`. Regeneralo/
>   releelo antes de empezar: el enum `tipo` de los componentes del catálogo de acceso ahora
>   incluye `"dato"` (`GET /acceso/catalogo`).
> - Lo que **el `openapi.json` NO puede expresar** está solo acá: el recorte dinámico de campos
>   (un campo que el DTO declara como `number` ahora puede llegar `null`), `meta.datosRestringidos`
>   (el `meta` está tipado como objeto libre), el código de error `DATO_NO_PERMITIDO` y la
>   semántica de la fila colapsada de Inventario. En eso gana este documento.
> - Si encontrás una contradicción entre ambos, **anotala en tu resumen final**; no la resuelvas
>   por tu cuenta en silencio.
>
> El backend (BFF NestJS) **ya está implementado**. No hay nada que negociar con backend salvo lo
> marcado como *límite conocido* (§11). No inventes endpoints ni campos: si necesitás algo que no
> existe, dejalo anotado y seguí.
>
> Este documento **extiende** `docs/frontend/PROMPT_PERMISOS_V2_Y_DASHBOARD_MODULAR_FRONTEND.md`
> (permisos v2: `GET /me/acceso`, filtros protegidos, editor de perfiles). Todo lo que ese
> documento ya describe **sigue valiendo y no hay que romperlo**. Esta es la sección 11 de aquel
> documento, desarrollada completa.

---

## 0. Resumen en 15 líneas (leelo aunque sea lo único que leas)

1. Un usuario puede tener acceso a la pantalla **Productos** (lista y detalle) y a la pantalla
   **Inventario** y, aun así, **no poder ver todos los datos** que esas pantallas traen.
2. Hay **7 permisos de datos**: precio de venta nivel **A**, **B**, **C**, **stock**,
   **descuento**, **costo** y **existencias por almacén**. Son componentes del catálogo de acceso
   de tipo `dato`, dentro de la pantalla `catalogo.datos-articulo`.
3. **Siempre se ven**, sin permiso alguno: código, descripción (nombre), categoría y marca.
4. El recorte lo hace **el backend**: el campo restringido llega con valor **`null`**, y la
   respuesta trae **`meta.datosRestringidos`** con la lista de datos recortados
   (`["costo","stock"]`).
5. **`null` + dato listado en `datosRestringidos` = "sin acceso"**, no "sin dato" ni cero.
   Mostrá `—` o un candado. **Nunca `0`, nunca `$0.00`, nunca "Sin stock".**
6. El recorte **solo existe con permisos v2 en modo `activo`** (`GET /me/acceso` → `data.modo`).
   En `off`/`sombra` el usuario ve todo y `datosRestringidos` no viene.
7. Afecta **solo** a: `GET /catalog/items`, `GET /catalog/items/:id`,
   `GET /catalog/items/:id/variants`, `GET /catalog/items/:id/stock`, `GET /inventory`,
   `GET /inventory/summary`, `GET /inventory/history` y `GET /inventory/history/:itemCode`.
8. **NO afecta** a `GET /catalog/items/lookup/*` (buscadores/selects de formularios): quien factura
   sigue viendo el precio del artículo que elige.
9. **Inventario sin "existencias por almacén"**: la lista deja de ser *artículo × almacén* y pasa a
   ser **una fila por artículo con el total** (`warehouse: null`). Es un cambio de forma, no solo
   de valores: la pantalla debe saber dibujar ambas (§6.3).
10. Enviar un **filtro u orden que se apoya en un dato restringido** responde
    `403 DATO_NO_PERMITIDO`. El frontend debe esconder esos controles de antemano (§7).
11. **Los permisos son de lectura.** El backend NO impide *escribir* esos campos a quien puede
    editar el artículo. El formulario de edición debe **no enviar** lo que no puede ver (§8).
12. Administración: los 7 permisos aparecen en el editor de perfiles como una pantalla más, **"Datos
    del artículo (qué información se ve)"**, dentro del módulo **Catálogo** (§9).
13. Un perfil con **solo el módulo Inventario** (sin Catálogo) **no tiene** estos permisos y vería
    todo en `null` hasta que se los den. El editor debe advertirlo (§9.3).
14. Los usuarios existentes **no pierden nada**: una migración les dio los 7 permisos. Recortar es
    una decisión explícita del administrador del tenant.
15. Nada de esto es seguridad del lado del cliente. El frontend esconde para que la UI sea exacta;
    el backend es quien recorta.

---

## 1. Contexto: por qué existe esto

El negocio necesita poder decidir **qué información de un artículo ve cada persona**, más fino que
"tiene o no tiene la pantalla". Ejemplos reales que motivan el cambio:

- Un vendedor ve el catálogo, el precio de venta nivel B y el stock, pero **no el costo** ni los
  márgenes.
- Un bodeguero ve existencias y stock, pero **ningún precio**.
- Un cajero ve solo el nivel de precio C (el mínimo) y no los demás.
- Un supervisor de una sucursal ve el total de cada artículo pero **no el desglose por almacén** de
  las demás.

Antes todo esto era "todo o nada" por pantalla. Ahora son **componentes de permiso** que se otorgan
o deniegan con el mismo mecanismo de siempre (perfiles de acceso, excepciones de usuario, "completa
excepto…").

### 1.1 Modelo de permisos (recordatorio mínimo)

Módulo → Pantalla → Componente. Un grant `permitir` sobre un módulo o pantalla **incluye todo lo de
abajo, también lo que se agregue a futuro**. Un `denegar` es **local al perfil** y permite "Productos
completa **menos** costo". Las excepciones de usuario: `permitir` suma, `denegar` es global y gana.
El detalle completo está en el documento de permisos v2; **no lo reimplementes**, ya existe el editor.

Lo nuevo de este documento es solo:

- Una pantalla más en el catálogo: **`catalogo.datos-articulo`**, módulo **`catalogo`**.
- Siete componentes nuevos, de `tipo: "dato"` (un valor nuevo en el enum de tipos).
- Que el backend, al responder ciertos endpoints, **consulta esos componentes** y recorta la
  respuesta.

### 1.2 Los siete componentes

| Clave del componente | Nombre (tal como viene del catálogo) | Qué controla |
|---|---|---|
| `catalogo.datos-articulo.ver-precio-a` | Ver precio de venta — nivel A (máximo) | Precio de la lista "Precio A" |
| `catalogo.datos-articulo.ver-precio-b` | Ver precio de venta — nivel B (promedio) | Precio de la lista "Precio B" |
| `catalogo.datos-articulo.ver-precio-c` | Ver precio de venta — nivel C (mínimo) | Precio de la lista "Precio C" |
| `catalogo.datos-articulo.ver-stock` | Ver stock (existencias totales) | Cantidad total y lo derivado |
| `catalogo.datos-articulo.ver-descuento` | Ver descuentos | Descuento permitido y automático |
| `catalogo.datos-articulo.ver-costo` | Ver costo y márgenes | Costo de valuación, márgenes y lo que lo revela |
| `catalogo.datos-articulo.ver-existencias-almacen` | Ver existencias por almacén | Desglose por almacén |

> **Los nombres vienen del catálogo, no los hardcodees.** GenSuite Control puede personalizarlos
> por tenant. Para pintarlos en el editor de permisos usá `nombre` del `GET /acceso/catalogo`. En
> pantallas de productos/inventario usá tus propias etiquetas de columna ("Costo", "Precio A"…); no
> necesitás el nombre del componente ahí.

### 1.3 Tres cosas que NO hay que confundir

1. **Permiso de datos ≠ permiso de pantalla.** Tener `catalogo.items.listar` (ver Productos) o
   `inventario.stock.consultar` (ver Inventario) sigue siendo lo que abre la pantalla. Los 7
   permisos de datos solo recortan **dentro** de ella.
2. **Permiso de datos ≠ filtro.** Los filtros (`catalogo.items.filtro.*`) siguen funcionando como
   antes (`FILTRO_NO_PERMITIDO`). Lo nuevo es que además un filtro/orden **apoyado en un dato
   recortado** da `DATO_NO_PERMITIDO` (§7).
3. **Permiso de datos ≠ data-scope.** Qué almacenes/sucursales puede ver el usuario (alcance) sigue
   siendo otra cosa y se aplica igual que antes. Los permisos de datos recortan *columnas*; el
   alcance recorta *filas*.

---

## 2. Cuándo aplica el recorte (modos del tenant)

`GET /api/v1/me/acceso` → `data.modo`:

| Modo | ¿Hay recorte? | Qué pasa con `meta.datosRestringidos` |
|---|---|---|
| `off` | **No.** Se ve todo. | No viene. |
| `sombra` | **No.** Se ve todo (v2 solo se calcula y loguea). | No viene. |
| `activo` | **Sí**, según los 7 componentes. | Viene si hay algo recortado; ausente si el usuario ve todo. |

Consecuencias para el frontend:

- **No dupliques la lógica del modo**: la fuente de verdad por petición es la propia respuesta
  (`meta.datosRestringidos`). Si no viene, no hay recorte, sea por el modo o porque el usuario ve todo.
- Para **esconder controles antes de pedir** (filtros, selector de almacén, columnas) necesitás saber
  de antemano qué ve el usuario: eso sale de `GET /me/acceso` (§3). **Solo si `modo === 'activo'`**
  aplicá esa regla; en `off`/`sombra` mostrá todo.
- En modo `off`/`sombra`, `GET /me/permissions` marca los 7 como permitidos (requieren solo lectura
  de `Item`): no los uses para esconder nada en esos modos.

---

## 3. De dónde sale lo que el usuario ve (dos fuentes, para dos cosas)

### 3.1 Fuente A — `GET /api/v1/me/acceso` (para esconder controles ANTES de pedir)

En `data.componentes` vienen las claves de los datos que el usuario SÍ tiene, mezcladas con el resto:

```json
{
  "success": true,
  "data": {
    "modo": "activo",
    "version": "240.12",
    "modulos": ["catalogo", "inventario", "ventas"],
    "pantallas": ["catalogo.items", "catalogo.datos-articulo", "inventario.stock"],
    "componentes": [
      "catalogo.items.listar",
      "inventario.stock.consultar",
      "catalogo.datos-articulo.ver-precio-b",
      "catalogo.datos-articulo.ver-stock",
      "catalogo.datos-articulo.ver-existencias-almacen"
    ],
    "recursos": ["lookup.articulos"],
    "filtrosBloqueados": {}
  }
}
```

En ese ejemplo el usuario ve: precio B, stock y existencias por almacén. **No** ve precio A, precio
C, descuento ni costo.

Helper recomendado (centralizalo en un único módulo, p. ej. `shared/permissions/datosArticulo.ts`):

```ts
export type DatoArticulo =
  | 'precioA' | 'precioB' | 'precioC'
  | 'stock' | 'descuento' | 'costo' | 'existenciasAlmacen';

export const COMPONENTE_DATO: Record<DatoArticulo, string> = {
  precioA: 'catalogo.datos-articulo.ver-precio-a',
  precioB: 'catalogo.datos-articulo.ver-precio-b',
  precioC: 'catalogo.datos-articulo.ver-precio-c',
  stock: 'catalogo.datos-articulo.ver-stock',
  descuento: 'catalogo.datos-articulo.ver-descuento',
  costo: 'catalogo.datos-articulo.ver-costo',
  existenciasAlmacen: 'catalogo.datos-articulo.ver-existencias-almacen',
};

export type VisibilidadArticulo = Record<DatoArticulo, boolean>;

/** Qué datos del artículo ve el usuario. En off/sombra: todo. */
export function visibilidadArticulo(acceso: {
  modo: 'off' | 'sombra' | 'activo';
  componentes: string[];
}): VisibilidadArticulo {
  const set = new Set(acceso.componentes);
  const ve = (d: DatoArticulo) => acceso.modo !== 'activo' || set.has(COMPONENTE_DATO[d]);
  return {
    precioA: ve('precioA'), precioB: ve('precioB'), precioC: ve('precioC'),
    stock: ve('stock'), descuento: ve('descuento'),
    costo: ve('costo'), existenciasAlmacen: ve('existenciasAlmacen'),
  };
}

export const veAlgunPrecio = (v: VisibilidadArticulo) => v.precioA || v.precioB || v.precioC;
```

Exponelo con un hook (`useDatosArticulo()`) que lea el acceso ya cargado en el store. **No hagas
otra petición**: `GET /me/acceso` ya se pide al iniciar sesión y cuando cambia `version`.

### 3.2 Fuente B — `meta.datosRestringidos` de cada respuesta (la verdad de esa petición)

Cada respuesta de los 8 endpoints de §4 trae, cuando hay recorte, en `meta`:

```json
"meta": { "total": 120, "limit": 20, "offset": 0, "datosRestringidos": ["costo", "stock"] }
```

Los valores posibles son exactamente los de `DatoArticulo`: `precioA`, `precioB`, `precioC`,
`stock`, `descuento`, `costo`, `existenciasAlmacen`.

**Regla:** para **pintar una celda**, mirá la respuesta, no el store. Una celda es "restringida" si
su dato figura en `meta.datosRestringidos`. Así, si el permiso cambió mientras el usuario tenía la
pantalla abierta (y todavía no refrescaste `/me/acceso`), la pantalla no pinta ceros falsos. Si ves
`datosRestringidos` con algo que tu store no esperaba, **refrescá `GET /me/acceso`**.

Dos fuentes, dos usos: **A** decide qué controles existen (filtros, columna de almacén, inputs del
formulario); **B** decide cómo se pinta cada valor.

---

## 4. Qué endpoints se recortan y qué campos exactamente

Todos exigen los mismos permisos de pantalla de siempre (`catalogo.items.listar`,
`catalogo.items.consultar-stock`, `inventario.stock.consultar`, `inventario.historial.consultar`).
Los 7 datos son **adicionales**.

### 4.1 Mapa dato → campos (Productos)

Aplica a cada artículo de `GET /catalog/items` (cada elemento de `data[]`), `GET /catalog/items/:id`
(`data`) y `GET /catalog/items/:id/variants` (cada elemento de `data[]`).

| Dato | Campos que pasan a `null` si falta | Notas |
|---|---|---|
| `precioA` | `prices.A` | |
| `precioB` | `prices.B` | |
| `precioC` | `prices.C` | |
| *(ningún precio)* | `standardRate` | Solo se anula si **no ve ninguno de los tres niveles**. Con que vea uno, `standardRate` viene. |
| `stock` | `currentStock`, `enPedido`, `reservado`, `entregado`, `disponible` | `enPedido`/`reservado`/`entregado`/`disponible` solo vienen en el detalle `/:id`. |
| `descuento` | `allowsDiscount`, `maxDiscountPct`, `autoDiscount` | `autoDiscount` es el objeto de descuento automático (regla de precios). |
| `costo` | `valuationRate`, `marginA`, `marginB`, `marginC`, `priceMode`, `actualizarCostoEnCompraOverride`, `purchasePriceDate` | `priceMode` (`manual`/`cost_plus`) revela cómo se calcula el precio desde el costo. |
| `existenciasAlmacen` | `stockByWarehouse` | Mapa `{ almacén: cantidad }`. |

Detalles que importan:

- Un campo **solo se pone en `null` si la clave existía** en la respuesta. Si el artículo nunca tuvo
  `marginA`, seguirá ausente. **No deduzcas "sin acceso" por ausencia o `null`**; deducilo de
  `meta.datosRestringidos`.
- `prices` es un objeto `{ A?: number, B?: number, C?: number }`. Con recorte parcial queda por
  ejemplo `{ "A": null, "B": 100, "C": null }`. Tratá cada nivel por separado.
- `meta.defaultPriceTier` (`"A" | "B" | "C"`) existe en `GET /catalog/items` y es el nivel que el
  tenant usa por defecto. **Si ese nivel está restringido, no lo uses como columna principal**:
  mostrá el primer nivel visible, o `—`.
- Código (`id`), descripción (`itemName`), categoría (`category`, `categoryName`, `subcategory*`) y
  marca (`brand`, `brandName`) **nunca** se tocan. Tampoco el resto de la ficha (unidades,
  impuestos, dimensiones, código de barras, imagen, etc.).

Ejemplo — `GET /catalog/items/FAR-000123` para un usuario sin `costo` ni `precioA`/`precioC`:

```json
{
  "success": true,
  "data": {
    "id": "FAR-000123",
    "itemName": "Paracetamol 500 mg",
    "category": "Medicinas", "brand": "ACME",
    "standardRate": 100,
    "valuationRate": null,
    "marginA": null, "marginB": null, "marginC": null,
    "priceMode": null,
    "purchasePriceDate": null,
    "prices": { "A": null, "B": 100, "C": null },
    "currentStock": 50,
    "stockByWarehouse": { "ALM. PRINCIPAL": 50 },
    "allowsDiscount": true, "maxDiscountPct": 15
  },
  "meta": { "datosRestringidos": ["precioA", "precioC", "costo"] }
}
```

> Nota: en el detalle y en `/stock`, si no hay nada restringido **`meta` no viene**. Verificá
> `res.meta?.datosRestringidos ?? []`, nunca asumas que `meta` existe.

### 4.2 `GET /catalog/items/:id/stock` (existencias por almacén)

Respuesta normal: `data: { itemCode, totalQty, totalReservedStock, totalDisponible, warehouses: [...] }`
con cada almacén `{ warehouse, qty, valuationRate, stockValue, reservedStock, disponible }`.

| Dato que falta | Efecto |
|---|---|
| `stock` | `totalQty`, `totalReservedStock`, `totalDisponible` → `null`; y en cada almacén `qty`, `reservedStock`, `disponible`, `stockValue` → `null`. |
| `costo` | En cada almacén `valuationRate` y `stockValue` → `null`. |
| `existenciasAlmacen` | **`warehouses: null`** (no hay desglose). Los totales se rigen por `stock`. |

Este endpoint además sigue exigiendo `catalogo.items.consultar-stock` ("Ver existencias por
almacén" en el detalle, **permiso distinto** a `ver-existencias-almacen`). Si el usuario no tiene
`consultar-stock`, ni siquiera puede llamarlo (403 `PERMISO_INSUFICIENTE`, como hoy).

### 4.3 Inventario: `GET /inventory` (la lista)

Respuesta: `data: { items: FilaInventario[], summary }` + `meta`. Cada fila normal es
**artículo × almacén**:

```ts
type FilaInventario = {
  itemCode: string; itemName: string; category?: string; brand?: string;   // nunca se tocan
  warehouse: string | null;                 // null en el modo colapsado (§6.3)
  actualQty: number | null;
  valuationRate: number | null;
  standardRate: number | null;
  investmentValue: number | null;
  saleValue: number | null;
  potentialProfit: number | null;
  reservedQty: number | null; reservedStock: number | null;
  orderedQty: number | null; indentedQty: number | null; projectedQty: number | null;
  disponibleParaVender: number | null;
  ubicaciones: string[];
};
```

Mapa dato → campos de la **fila**:

| Dato que falta | Campos que pasan a `null` | Por qué |
|---|---|---|
| `costo` | `valuationRate`, `investmentValue`, `potentialProfit` | Son costo o dependen del costo. |
| *ningún precio* (sin A, B ni C) | `standardRate`, `saleValue`, `potentialProfit` | Son precio de venta o dependen de él. |
| `stock` | `actualQty`, `reservedQty`, `reservedStock`, `orderedQty`, `indentedQty`, `projectedQty`, `disponibleParaVender` **y además** `investmentValue`, `saleValue`, `potentialProfit` | Un monto en dinero revela la cantidad (monto ÷ tasa), así que los montos exigen **también** ver stock. |
| `existenciasAlmacen` | **cambia la forma de la lista** (ver §6.3) | |

Por lo tanto, ejemplos de combinaciones:
- Ve costo y precios pero **no stock** → ve `valuationRate` y `standardRate`, pero **no** inversión,
  valor de venta ni ganancia (todos son montos).
- Ve stock y precios pero **no costo** → ve cantidades, `standardRate` y `saleValue`; no
  `valuationRate`, `investmentValue` ni `potentialProfit`.
- `potentialProfit` exige **costo + algún precio + stock**.

### 4.4 Inventario: `summary` (de `GET /inventory` y de `GET /inventory/summary`)

```ts
type ResumenInventario = {
  totalInvestment: number | null;
  totalSaleValue: number | null;
  totalPotentialProfit: number | null;
  totalItems: number;           // nunca se anula
  totalUnits: number | null;
};
```

| Dato que falta | `null` en |
|---|---|
| `stock` | `totalUnits`, `totalInvestment`, `totalSaleValue`, `totalPotentialProfit` |
| `costo` | `totalInvestment`, `totalPotentialProfit` |
| *ningún precio* | `totalSaleValue`, `totalPotentialProfit` |

`GET /inventory/summary` devuelve `data` = el resumen directamente, más `meta.datosRestringidos`.
Las tarjetas/KPI de totales deben mostrar `—` cuando vengan `null`.

### 4.5 Inventario: historial (`GET /inventory/history` y `/inventory/history/:itemCode`)

Cada movimiento: `{ id, itemCode, itemName, warehouse, movementQty, stockAfter, valuationRate,
voucherType, voucherNo, postingDate, postingTime }`.

| Dato que falta | `null` en |
|---|---|
| `stock` | `movementQty`, `stockAfter` |
| `costo` | `valuationRate` |

`warehouse` **no** se recorta en el historial (decisión de producto: el historial es su propio
permiso, `inventario.historial.consultar`).

### 4.6 Lo que NO se recorta (importante, no lo toques)

- `GET /catalog/items/lookup`, `/lookup/:id`, `/lookup/:id/stock`, `/lookup/:id/variants`: **sin
  recorte** de precios/stock (excepto que ya excluyen costos y márgenes, como siempre). Son los
  buscadores de los formularios (factura, cotización, pedido, compra…). Quien factura **necesita**
  el precio aunque no pueda verlo en Productos.
- `GET /opciones/:recurso`.
- Los endpoints de escritura (`POST/PUT/DELETE /catalog/items…`): ver §8.
- Cualquier endpoint que no esté listado en §4: **no tiene recorte**. Si encontrás otra pantalla
  que muestre costo/precio/stock de un artículo por un endpoint distinto, anotalo en tu resumen
  (es un posible hueco), no lo "arregles" escondiéndolo en el cliente a ciegas.

---

## 5. Cómo se pinta un dato restringido (reglas de UI obligatorias)

1. **Celda de tabla / valor en una ficha:** mostrá un marcador neutro (`—`) con un tooltip o
   `aria-label` "Sin acceso". Opcionalmente un ícono de candado pequeño. **Jamás** `0`, `0.00`,
   `RD$ 0.00`, "Sin existencias", "Agotado" o vacío sin explicación: un `null` por permiso se
   confundiría con un dato real.
2. **Columna entera de una tabla:** si el dato figura en `datosRestringidos`, decidí por columna
   (configurable por diseño): **ocultar la columna** (recomendado cuando no se ve ningún valor) o
   dejarla con `—`. Usá una sola política en toda la app y documentala en tu resumen.
3. **KPIs y tarjetas de total:** `—`, no `0`.
4. **Ordenamiento y cálculos del cliente:** no calcules en el frontend a partir de campos `null`
   (p. ej. margen = precio − costo). Si falta cualquiera de los insumos, mostrá `—`.
5. **Badges de estado de stock** ("Bajo", "Agotado", "En stock") **no pueden derivarse** si `stock`
   está recortado: ocultalos. Si el estado se calculaba desde `currentStock`/`actualQty`, mostralo
   solo cuando el valor sea un número.
6. **Exportar (CSV/Excel/PDF) e imprimir** lo que muestra la pantalla: usá los mismos datos ya
   recortados. Una columna restringida se omite del archivo o sale como `—`, nunca como `0`.
7. **Copiar/compartir/URLs:** no pongas valores restringidos en nada que el usuario pueda copiar.
8. **Accesibilidad:** el marcador debe ser legible por lector de pantalla ("sin acceso").
9. **Estados de carga/vacío:** una tabla con todas las columnas de datos restringidas pero con
   filas sigue teniendo filas (código, nombre, categoría, marca). No la muestres como "vacía".

Componente sugerido (adaptalo al design system del proyecto):

```tsx
function DatoRestringido({ restringido, children }: { restringido: boolean; children: React.ReactNode }) {
  if (!restringido) return <>{children}</>;
  return <span aria-label="Sin acceso" title="No tienes acceso a este dato">—</span>;
}
```

Y un helper para leer la respuesta:

```ts
export const restringidosDe = (res: { meta?: { datosRestringidos?: DatoArticulo[] } }) =>
  new Set(res.meta?.datosRestringidos ?? []);
```

---

## 6. Pantalla por pantalla: qué hay que cambiar

> No conozco la estructura de carpetas del frontend. **Buscá todos los usos** de los endpoints
> de §4 (y de los hooks/servicios que los envuelven) y revisá cada consumidor. Hacé un inventario
> al empezar y adjuntalo en tu resumen final (archivo → qué se cambió).

### 6.1 Productos — lista (`GET /catalog/items`)

- Columnas de precio (A/B/C), `standardRate`, costo, margen, stock y descuento: aplicá §5.
- La columna "Precio" principal debe usar `meta.defaultPriceTier` **solo si ese nivel es visible**
  (si no, el primer nivel visible; si ninguno, `—`).
- Filtros y orden: ver §7 (ocultá los controles que no corresponden).
- El buscador de texto, filtros por categoría/marca/tipo y la paginación **no cambian**.
- `total`/`hasMore` de `meta` funcionan igual que antes.

### 6.2 Productos — detalle (`GET /catalog/items/:id`) y variantes

- Recorré **cada sección** de la ficha y asigná a cada campo su dato (tabla §4.1). Secciones
  típicas: Precios (tres niveles + `standardRate`), Costos y márgenes, Stock y existencias,
  Descuentos. Si una sección entera queda sin datos visibles, ocultá la sección o mostrá un aviso
  "No tienes acceso a esta información".
- `stockByWarehouse` (mapa) y la pestaña/tabla "Existencias por almacén" (`GET /:id/stock`):
  ver §4.2. Con `existenciasAlmacen` restringido (`warehouses: null`) ocultá la tabla; no la
  muestres vacía.
- La pestaña de existencias además depende del permiso de pantalla
  `catalogo.items.consultar-stock` (ya lo manejás hoy): **ocultá la pestaña si falta cualquiera de
  los dos** (el de pantalla o el de datos), y no llames al endpoint si falta el de pantalla.
- Variantes (`/:id/variants`): cada variante es un artículo con las mismas reglas; la tabla de
  variantes se pinta con §5.
- **Formulario de edición**: ver §8 (crítico).

### 6.3 Inventario — lista (`GET /inventory`) — **hay un cambio de forma**

Hay dos formas, según `existenciasAlmacen`:

**Forma normal (ve existencias por almacén):** una fila por **artículo × almacén**, con `warehouse`
no nulo. Como siempre.

**Forma colapsada (NO ve existencias por almacén):** una fila **por artículo**, resultado de sumar
todos sus almacenes dentro del alcance del usuario:

- `warehouse: null` y `ubicaciones: []`.
- `actualQty`, `reservedQty`, `reservedStock`, `orderedQty`, `indentedQty`, `projectedQty`,
  `disponibleParaVender`, `investmentValue`, `saleValue`, `potentialProfit`: **sumas** de los
  almacenes.
- `valuationRate`: **tasa ponderada** (`investmentValue ÷ actualQty`); si no hay cantidad, la del
  primer almacén.
- Las demás restricciones (§4.3) se aplican **encima** de la fila ya sumada.
- `meta.total` = **número de artículos distintos** (total real). `summary` cubre **todos** los
  artículos, no solo la página.

Qué debe hacer la pantalla:

1. Decidir la forma **antes de pedir**, con `visibilidadArticulo(...).existenciasAlmacen` (§3.1), y
   después **confirmar con la respuesta**: es colapsada si `datosRestringidos` incluye
   `existenciasAlmacen` (y las filas traen `warehouse === null`).
2. En forma colapsada: **ocultá** la columna "Almacén", el filtro de almacén, el filtro de sucursal
   y cualquier acción por almacén (transferir desde esa fila, ver ubicaciones, etc.).
3. La clave de fila de la tabla (`rowKey`) **no puede seguir siendo `itemCode + warehouse`** si
   usás `warehouse` para algo: en forma colapsada usá `itemCode`. Usá `itemCode + (warehouse ?? '')`.
4. Las acciones de fila que dependían del almacén concreto se deshabilitan en forma colapsada
   (no hay almacén que operar).
5. **Paginación:** en forma normal, `meta.total` es el **número de filas de la página devuelta**
   (comportamiento previo del backend, no cambió) y `hasMore` es siempre `false`: paginá por
   "la página vino llena (`items.length === limit`) ⇒ puede haber más". Esa misma regla funciona
   también en forma colapsada. No te apoyes en `meta.total` para calcular páginas.
6. El orden por defecto es por `itemCode` ascendente en ambas formas.

### 6.4 Inventario — totales (`summary`) y detalle de un artículo

- Tarjetas de totales: §4.4 y §5.3.
- Detalle de un artículo (`GET /inventory?itemCode=…`): misma lista, filtrada a un artículo (en
  forma colapsada, **una** fila con el total).
- `GET /inventory/items/:itemCode/stock-por-dimension` (stock por combinación de dimensión)
  **no** se recorta en esta versión: ver §11.

### 6.5 Inventario — historial

§4.5. Columnas `movementQty`/`stockAfter` y `valuationRate` con §5.

### 6.6 Dónde NO hay que tocar

Facturación, cotizaciones, pedidos, compras, caja/POS y cualquier formulario que busque artículos
con `GET /catalog/items/lookup*` o `GET /opciones/articulos`: **no cambian**. Verificá que ninguno
de esos flujos use por error `GET /catalog/items` (el listado de administración) como fuente: si
alguno lo hace, ahora recibiría `null` en precios y se rompería. Esos flujos deben usar `lookup`
(§4.6). Si encontrás uno que no lo hace, **migralo a `lookup`** y anotalo.

---

## 7. Filtros y ordenamientos que se apoyan en datos restringidos

El backend rechaza —nunca ignora en silencio— un parámetro que permitiría **deducir** un dato que
se está ocultando. Responde:

```json
{
  "success": false,
  "error": {
    "code": "DATO_NO_PERMITIDO",
    "message": "No tiene permiso para filtrar u ordenar por precio (pricesMin/pricesMax).",
    "statusCode": 403,
    "details": { "parametros": ["precio (pricesMin/pricesMax)"] }
  }
}
```

> `details.parametros` son **etiquetas legibles para humanos**, no nombres exactos de query param.
> No las parsees. Mostrá `error.message` (ya viene en español) y listo.

### 7.1 Reglas — `GET /catalog/items`

| Query param usado | Se rechaza si el usuario… |
|---|---|
| `pricesMin`, `pricesMax` | no ve **ningún** nivel de precio (ni A, ni B, ni C) |
| `orderBy` que ordene por `rate` o `standardRate` | no ve ningún nivel de precio |
| `priceMode` | no ve `costo` |
| `maxDiscountPctMin`, `maxDiscountPctMax` | no ve `descuento` |

### 7.2 Reglas — `GET /inventory`

| Query param usado | Se rechaza si el usuario… |
|---|---|
| `warehouse` | no ve `existenciasAlmacen` |
| `branch` | no ve `existenciasAlmacen` |
| `stockStatus` | no ve `stock` |
| `orderBy` por `currentStock` o `actualQty` | no ve `stock` |
| `sortBy=investment` | no ve `costo` **o** no ve `stock` |
| `sortBy=value` | no ve ningún precio **o** no ve `stock` |
| `sortBy=profit` | no ve `costo`, o no ve ningún precio, o no ve `stock` |

### 7.3 Qué debe hacer el frontend

1. **Prevención (obligatoria):** no renderices los controles que enviarían esos parámetros cuando
   `visibilidadArticulo` indique que no corresponde (ocultá el filtro de rango de precios, el
   selector de modo de precio, el filtro de descuento, el selector de almacén/sucursal de
   Inventario, el filtro de estado de stock y las opciones de orden afectadas).
2. **Estado guardado:** si el usuario tenía un filtro/orden guardado (localStorage, URL, vista
   guardada) que ahora no puede usar, **descartalo al cargar** y no lo envíes. Revisá los
   parámetros de la URL al montar la pantalla.
3. **Defensa:** si igual llega `403 DATO_NO_PERMITIDO`: mostrá `error.message`, **refrescá
   `GET /me/acceso`**, quitá los filtros/órdenes restringidos y **reintentá una sola vez**. Si
   vuelve a fallar, mostrá el error y no reintentes (evitá bucles).
4. Es el mismo patrón que `FILTRO_NO_PERMITIDO` (permisos v2 §3.3 paso 5); reutilizá la misma
   utilidad si existe.

---

## 8. Formularios de edición/creación de artículos (crítico, lee con atención)

**Los permisos de datos son de LECTURA.** El backend no impide escribir esos campos a quien tenga
`catalogo.items.crear`/`editar`/`actualizar-precios`. Eso trae un riesgo concreto:

> Un usuario puede editar un artículo pero **no ver el costo**. Si el formulario se rellena con la
> respuesta de `GET /catalog/items/:id`, el campo costo llega `null`. Si el formulario envía ese
> `null` (o `0`, o vacío) al guardar, **puede borrar o sobrescribir el costo real** del artículo.

Reglas obligatorias para el formulario:

1. **Cada input se asocia a su dato.** Si el dato está restringido (según `visibilidadArticulo` y
   `meta.datosRestringidos` del detalle), el input se **oculta** (recomendado) o se muestra
   **deshabilitado** con `—`. No lo muestres editable y vacío.
2. **No enviar lo que no se ve.** Al armar el payload de `PUT /catalog/items/:id` (y
   `PUT …/prices`), **omití la clave por completo** si el dato está restringido. Nunca envíes
   `null`, `0`, `""` ni el valor "tal como llegó" para un campo restringido.
   - Costo/márgenes/modo de precio → omitir si falta `costo`.
   - `priceA` / `priceB` / `priceC` → omitir cada uno si falta su nivel.
   - `maxDiscountPct`, `allowsDiscount` → omitir si falta `descuento`.
3. **"Dirty tracking":** si tu formulario envía solo los campos modificados, perfecto; si envía el
   formulario completo, **filtrá** los restringidos antes de enviar.
4. **Creación (`POST`)**: un usuario que no ve costo puede crear un artículo sin costo; está bien.
   No inventes valores por defecto para campos restringidos.
5. **Valores derivados en cliente:** no recalcules margen/precio sugerido en el formulario si falta
   alguno de los insumos (costo o nivel de precio).
6. Las respuestas de `POST/PUT/DELETE` de artículos **no se recortan** (devuelven la ficha completa
   a quien acaba de escribirla). **No uses esas respuestas para volver a pintar** campos que el
   usuario no debería ver: después de guardar, **volvé a pedir** `GET /catalog/items/:id` y
   pintá con esa respuesta recortada (o, si preferís actualizar con la respuesta del `PUT`,
   aplicá igualmente la política de §5 usando `visibilidadArticulo`).

Esto último es una **limitación conocida del backend** (§11): la escritura no está restringida.
Se mitiga en el frontend (arriba) y, si el negocio lo pide, se restringirá luego en backend.

---

## 9. Pantalla de administración: Configuración → Permisos

El editor de perfiles (documento de permisos v2, §7) **ya existe**. Esto es lo que hay que ajustar.

### 9.1 Qué aparece nuevo en el catálogo

`GET /api/v1/acceso/catalogo` ahora incluye, dentro del módulo **Catálogo** (`catalogo`), una
pantalla más:

```json
{
  "key": "catalogo.datos-articulo",
  "nombre": "Datos del artículo (qué información se ve)",
  "tipo": "operativa",
  "componentes": [
    { "key": "catalogo.datos-articulo.ver-precio-a", "tipo": "dato",
      "nombre": "Ver precio de venta — nivel A (máximo)", "incluirEnCompleta": true,
      "requiere": [], "recursos": [], "otorgable": true },
    { "key": "catalogo.datos-articulo.ver-precio-b", "tipo": "dato", "…": "…" },
    { "key": "catalogo.datos-articulo.ver-precio-c", "tipo": "dato", "…": "…" },
    { "key": "catalogo.datos-articulo.ver-stock", "tipo": "dato", "…": "…" },
    { "key": "catalogo.datos-articulo.ver-descuento", "tipo": "dato", "…": "…" },
    { "key": "catalogo.datos-articulo.ver-costo", "tipo": "dato", "…": "…" },
    { "key": "catalogo.datos-articulo.ver-existencias-almacen", "tipo": "dato", "…": "…" }
  ]
}
```

(Los campos exactos y los nombres vienen del endpoint; usá los del catálogo, pueden estar
personalizados.)

### 9.2 Cambios obligatorios en el editor

1. **Soportar `tipo: "dato"`** donde hoy hay un `switch`/mapa por tipo (`vista`, `accion`,
   `filtro`, `exportar`, `widget`): ícono propio (p. ej. ojo/ojo tachado), etiqueta "Dato" y
   entrada en el **filtro por tipo** del editor. Un tipo desconocido no debe romper el árbol:
   caé en un genérico.
2. Se editan **exactamente igual** que cualquier componente (casilla en "Personalizado", `denegar`
   en "Completa excepto…"). Sin casos especiales de guardado.
3. Mostrá un texto de ayuda en esa pantalla: *"Estos permisos limitan qué información del artículo
   ve la persona dentro de Productos e Inventario. Código, descripción, categoría y marca siempre
   se ven."*
4. Caso de uso a soportar explícitamente (probalo): perfil con módulo Catálogo **completo** y
   `denegar` de `ver-costo` ⇒ ve todo menos el costo.
5. Los 7 vienen con `incluirEnCompleta: true`: un grant de módulo/pantalla los incluye (también a
   futuro). No hace falta marcarlos a mano en perfiles "completos".
6. Plantillas y "Vista previa"/explicación (`GET /acceso/usuarios/:email/efectivo?explicar=true`):
   estos componentes aparecen ahí como cualquier otro (`otorgado`, `denegado_perfil`,
   `denegado_usuario`, `sin_otorgar`…). El texto de "¿por qué no ve esto?" debe poder explicarlos;
   usá `nombre` del catálogo.

### 9.3 Advertencia obligatoria: perfiles sin el módulo Catálogo

La pantalla `catalogo.datos-articulo` pertenece al módulo `catalogo`. Un perfil que otorga **solo**
`inventario` (sin `catalogo`, sin la pantalla `catalogo.datos-articulo` ni sus componentes) **no
tiene** los 7 permisos: esa persona vería precios, costos y stock en `null`.

En el editor, cuando un perfil tenga acceso a `inventario` o a `catalogo.items` pero **no** a ningún
`catalogo.datos-articulo.*`, mostrá un **aviso no bloqueante** en el perfil:

> "Este perfil no incluye 'Datos del artículo': quienes lo usen verán precios, costos y existencias
> como no disponibles. Agregá el acceso a 'Datos del artículo' para que vean esa información."

con un botón "Agregar todos" (que añada un grant `permitir` de **pantalla** `catalogo.datos-articulo`).

### 9.4 Usuarios existentes y migración

Una migración del backend ya otorgó los 7 permisos a todo perfil/usuario que antes tenía
`inventario`, `catalogo.items` o sus listados. **Nadie pierde información al desplegar.** No
muestres ningún aviso de "se perdieron datos" al activar esto. El cambio de `version` en
`GET /me/acceso` es normal: refrescá como siempre.

---

## 10. Plan de implementación sugerido (en orden)

1. **Leer** el `openapi.json` y este documento. Anotar discrepancias.
2. **Inventario de consumidores** de los 8 endpoints de §4 (búsqueda en el repo de las rutas y de
   los hooks/servicios que las llaman). Lista archivo → pantalla.
3. **Capa compartida:** tipos (`DatoArticulo`, `VisibilidadArticulo`, `meta.datosRestringidos`),
   helper `visibilidadArticulo`, hook `useDatosArticulo()`, `restringidosDe(res)`, componente
   `DatoRestringido`. Regenerar los tipos desde el `openapi.json` y **ajustar los tipos de los DTO
   afectados a `number | null`/`… | null`** (precios, stock, costo, márgenes, `standardRate`,
   `prices.*`, `stockByWarehouse`, `autoDiscount`, `allowsDiscount`, `maxDiscountPct`, y las
   propiedades de `FilaInventario`/`ResumenInventario`/movimiento de historial de §4). Que el
   compilador te señale cada uso.
4. **Productos lista y detalle** (§6.1, §6.2) + pestaña de existencias.
5. **Inventario lista, totales, detalle, historial** (§6.3–6.5), incluida la forma colapsada.
6. **Filtros/órdenes** (§7): ocultar controles, limpiar estado guardado, manejar `DATO_NO_PERMITIDO`.
7. **Formularios de edición** (§8). Este paso previene pérdida de datos: no lo dejes para el final.
8. **Admin de permisos** (§9): tipo `dato`, ayuda, advertencia §9.3.
9. **Exportaciones e impresiones** que usen esos datos (§5.6).
10. **Pruebas** (§12) y resumen final.

---

## 11. Límites conocidos del backend (no los "arregles" en el frontend; anotalos)

1. **Escritura no restringida.** Quien puede editar un artículo puede escribir costo/precios aunque
   no los vea. Se mitiga en el formulario (§8). Si el negocio lo exige, se restringirá en backend.
2. **`GET /inventory/items/:itemCode/stock-por-dimension`** y el endpoint de etiquetas
   (`imprimir-etiqueta`) **no** están recortados en esta versión. Si tu pantalla los usa y muestran
   stock/precio, anotalo como pendiente de backend.
3. **`standardRate` y los precios:** el backend no sabe a qué nivel (A/B/C) corresponde
   `standardRate`; por eso solo lo oculta si el usuario no ve **ningún** nivel.
4. **Historial:** `warehouse` no se recorta en el historial (§4.5).
5. **Paginación de Inventario** (forma normal): `meta.total` = filas de la página y `hasMore` =
   `false` (comportamiento previo, no introducido por este cambio). El `summary` de la forma normal
   cubre solo las filas de esa página; `GET /inventory/summary` cubre hasta 500 filas. En forma
   colapsada ambos cubren el total.
6. **Tope de lectura en forma colapsada:** el backend lee hasta 5 000 bins del alcance del usuario
   para sumar. Un tenant con más podría ver totales incompletos. Si ves cifras que no cuadran en un
   tenant muy grande, anotalo.
7. **Solo permisos v2 `activo`.** En `off`/`sombra` no hay recorte; no hay manera de simularlo.
8. Los endpoints que no estén en §4 no tienen recorte (p. ej. reportes de inventario, dashboard,
   POS). Si ves costos/precios/stock de artículos expuestos allí a quien no debería, anotalo.

---

## 12. Criterios de aceptación y plan de pruebas

Probá con usuarios/perfiles reales (o mocks de `/me/acceso`) en un tenant con modo `activo`.
Matriz mínima (✓ = tiene el dato):

| Caso | A | B | C | Stock | Desc. | Costo | Almacén | Resultado esperado |
|---|---|---|---|---|---|---|---|---|
| 1. Todo | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | Pantallas idénticas a las de hoy; sin `datosRestringidos`. |
| 2. Sin costo | ✓ | ✓ | ✓ | ✓ | ✓ | ✗ | ✓ | `—` en costo, márgenes, modo de precio, inversión, ganancia, tasa. Resto visible. |
| 3. Solo precio B | ✗ | ✓ | ✗ | ✓ | ✗ | ✗ | ✗ | Precio B visible; A y C `—`; Inventario en forma colapsada. |
| 4. Sin precios | ✗ | ✗ | ✗ | ✓ | ✗ | ✗ | ✓ | `standardRate`, valor de venta y ganancia `—`; stock y almacén visibles. |
| 5. Sin stock | ✓ | ✓ | ✓ | ✗ | ✓ | ✓ | ✓ | Cantidades `—`; **y también** inversión/valor/ganancia `—`; precios y costo unitario visibles. |
| 6. Sin existencias por almacén | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✗ | Inventario con una fila por artículo; sin columna ni filtro de almacén/sucursal; `stockByWarehouse` y tabla `/stock` ocultos. |
| 7. Nada | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | Solo código, nombre, categoría y marca; todo lo demás `—`; la pantalla sigue siendo usable. |

Verificaciones transversales (cada una debe cumplirse):

- [ ] En **ninguna** celda restringida aparece `0`, `0.00` ni `RD$ 0.00`.
- [ ] Con `modo` = `off` o `sombra` no hay recorte aunque el usuario no tenga los 7 permisos.
- [ ] Los filtros/órdenes de §7 **no se renderizan** cuando no corresponden, y un filtro guardado se
      descarta al cargar.
- [ ] Forzar manualmente un parámetro prohibido (p. ej. `?priceMode=cost_plus` sin costo) muestra el
      mensaje de `DATO_NO_PERMITIDO` y reintenta una sola vez sin ese parámetro.
- [ ] El formulario de edición de un usuario sin costo **no envía** `cost`/márgenes/`priceMode`
      (verificalo en la pestaña de red) y no rellena inputs con `null`.
- [ ] Facturación, cotización, pedido, compras y POS siguen mostrando el precio al elegir un
      artículo (usan `lookup`).
- [ ] El editor de permisos muestra la pantalla "Datos del artículo", acepta `tipo: "dato"` y
      guarda un perfil "Catálogo completo menos Ver costo" (`permitir` módulo + `denegar`
      componente).
- [ ] El aviso de §9.3 aparece en un perfil con `inventario` y sin "Datos del artículo".
- [ ] Una exportación/impresión desde Productos/Inventario omite o marca `—` las columnas
      restringidas.
- [ ] Tras cambiar los permisos de un usuario, al refrescar `/me/acceso` (cambia `version`) la UI se
      ajusta sin recargar la página completa.
- [ ] El tipo TypeScript de cada campo recortable es `T | null` y el proyecto compila sin `any`
      nuevos ni supresiones (`@ts-ignore`) añadidas por este cambio.
- [ ] Lint, build y tests existentes del frontend pasan.

---

## 13. Qué entregar al terminar

1. El código en el repo del frontend, con commits atómicos y mensajes claros.
2. Un **resumen final** con: inventario de archivos tocados (archivo → qué se cambió), la política
   elegida para columnas restringidas (§5.2), cualquier contradicción entre este documento y el
   `openapi.json`, los límites de §11 que te afecten en pantallas concretas, y los casos de §12 que
   no pudiste probar (y por qué).
3. Una lista de **dudas o huecos** (endpoints que expongan datos fuera de §4, pantallas que no
   supiste migrar a `lookup`, etc.). No los resuelvas inventando; anotalos.

---

## Apéndice A — Referencia rápida de errores

| HTTP | `code` | Dónde | Qué hacer |
|---|---|---|---|
| 403 | `DATO_NO_PERMITIDO` | `GET /catalog/items`, `GET /inventory` con filtro/orden sobre un dato restringido | §7.3: mostrar `message`, refrescar `/me/acceso`, quitar el parámetro, reintentar una vez. |
| 403 | `PERMISO_INSUFICIENTE` | cualquiera | Como hoy. `details.componentes` puede incluir claves `catalogo.datos-articulo.*` solo en endpoints que las exijan por ruta (hoy ninguno). |
| 403 | `FILTRO_NO_PERMITIDO` | listados con query params protegidos | Como hoy (permisos v2 §3.3). |

## Apéndice B — Claves de referencia

```
Módulo:    catalogo
Pantalla:  catalogo.datos-articulo        "Datos del artículo (qué información se ve)"
Tipo:      dato
Componentes:
  catalogo.datos-articulo.ver-precio-a
  catalogo.datos-articulo.ver-precio-b
  catalogo.datos-articulo.ver-precio-c
  catalogo.datos-articulo.ver-stock
  catalogo.datos-articulo.ver-descuento
  catalogo.datos-articulo.ver-costo
  catalogo.datos-articulo.ver-existencias-almacen
Permisos de pantalla relacionados (ya existían):
  catalogo.items.listar               (Productos: lista y detalle)
  catalogo.items.consultar-stock      (Productos: existencias por almacén, GET /:id/stock)
  inventario.stock.consultar          (Inventario: lista y totales)
  inventario.historial.consultar      (Inventario: historial)
Valor de meta.datosRestringidos:
  precioA | precioB | precioC | stock | descuento | costo | existenciasAlmacen
```
