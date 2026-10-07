# Prompt para agente de frontend — Compra sin dimensión, venta con dimensión (mismo ítem)

> **Leé este bloque completo antes de escribir una sola línea de código.** Es largo a propósito:
> el objetivo es que no tengas que inferir, adivinar ni "completar con sentido común" ningún
> detalle de este módulo. Si en algún momento te encontrás pensando "me imagino que esto funciona
> así", pará y buscá la respuesta exacta en este documento o en el `openapi.json` — casi siempre
> ya está contestado acá.

## 0. Contexto para quien recibe este documento

### 0.1 Prerrequisito obligatorio

Esto describe una funcionalidad que **requiere como prerrequisito** que ya tengas implementado
`docs/frontend/PROMPT_INVENTORY_DIMENSIONS_FRONTEND.md` (Dimensiones de Inventario) — este
documento asume que conocés y ya construiste, sin volver a explicarlo acá:

- El concepto de "dimensión de inventario" (`usaDimensiones`, `dimensiones[]` del artículo,
  `reglasCombinacion[]`).
- El catálogo de Dimensiones y Valores (`GET/POST /catalog/dimensiones-inventario`, valores en
  cascada por jerarquía padre/hijo).
- El patrón de selectores en cascada para elegir una combinación en cualquier línea de documento
  (compra, venta, transferencia).
- Las pantallas de **Ajuste de Combinación** (`POST /inventory/ajustes-dimension`) y
  **Reclasificación de Combinación** (`POST /inventory/reclasificaciones`) — las vas a usar como
  plantilla de UI para la pantalla nueva de este documento, porque comparten exactamente el mismo
  patrón de formulario.
- La consulta de **stock por combinación**
  (`GET /inventory/items/:itemCode/stock-por-dimension`).

**Si todavía no implementaste ese documento, hacelo primero.** Nada de lo que sigue tiene sentido
sin ese contexto, y vas a terminar reinventando peor componentes que ya deberías tener.

### 0.2 Si ya empezaste un diseño anterior de este mismo módulo: descartalo

Si tu equipo llegó a ver, o a empezar a implementar, un documento previo llamado
`PROMPT_CONVERSION_ITEM_DIMENSIONADO_FRONTEND.md` o
`PROMPT_CONVERSION_AUTOMATICA_AL_VENDER_FRONTEND.md`: **ese diseño se descartó por completo antes
de llegar a producción.** Ninguna parte de ese diseño sobrevive. Resumen de qué cambió y por qué,
para que entiendas el motivo si tienes código viejo que mirar:

- **Diseño descartado**: se usaban **dos artículos de catálogo distintos** — un ítem "genérico"
  (sin dimensiones) y un ítem "dimensionado" (con dimensiones), enlazados por un campo
  `Item.custom_item_generico_origen` / `destinoConversionAutomatica`. El cajero buscaba y vendía
  el ítem GENÉRICO, y la factura terminaba silenciosamente con el ítem DIMENSIONADO en su lugar.
- **Por qué se descartó**: era un malentendido del requerimiento real del negocio. El dueño del
  producto quería comprar y vender **el mismo artículo de catálogo** — nunca dos artículos
  distintos enlazados. Obligar a crear un segundo ítem de catálogo por cada combinación de
  "genérico + dimensionado" era trabajo administrativo innecesario y confuso para quien carga el
  catálogo.
- **Diseño actual (el que describe este documento)**: **un solo artículo de catálogo**, con un
  flag booleano (`permiteCompraSinDimension`). Se compra/recibe sin dimensión, se vende siempre
  con dimensión, y el sistema completa (convierte) automáticamente solo lo que haga falta. No hay
  ningún campo que vincule un ítem con otro ítem.

Si ya implementaste algo del diseño descartado (un selector de "ítem genérico de origen", un
campo `itemGenericoOrigen` o `destinoConversionAutomatica`, una pantalla que muestra "este ítem se
convierte en otro al venderlo"): **borralo**. Esos campos y ese endpoint ya no existen del lado
del servidor — una llamada que los use responde con el artículo/campo ignorado o con un error de
validación, según el caso, porque el shape del DTO cambió.

### 0.3 Qué resuelve esto, en una frase

Permite que un tenant **compre un artículo sin especificar una dimensión de inventario** (ej. 30
unidades de "Bumper", sin indicar año ni color todavía) y **recién decida la combinación exacta
en el momento de venderlo** — con el MISMO ítem de catálogo en ambos extremos de la operación, sin
relajar ninguna de las reglas de Dimensiones de Inventario que ya conocés:

- La **inmutabilidad** de la configuración de dimensiones de un artículo con historia sigue
  exactamente igual.
- El **balance real por combinación** (no hay "trampa" de inventario fantasma) sigue exactamente
  igual.
- Lo único que cambia es la **obligatoriedad de la dimensión del lado de la COMPRA**: un artículo
  puede, opcionalmente y por producto, dejar de exigir la combinación al comprarlo/recibirlo. La
  **venta sigue exigiendo la combinación siempre**, sin ninguna excepción.

Es **estrictamente opt-in y configurado por producto, nunca por tenant** — no existe ni va a
existir un interruptor global "activar conversión automática" en Configuración. Un tenant puede
tener algunos artículos con este flag activo y otros sin él, mezclados libremente en el mismo
catálogo.

### 0.4 Estado de la implementación del lado del servidor

Todo lo descrito en este documento ya está **implementado, probado (tests unitarios en verde) y
compila sin errores** del lado del backend (NestJS + ERPNext/Frappe). No hay ninguna decisión de
diseño pendiente ni ningún endpoint a medio terminar — lo que ves acá es el contrato final y
estable.

### 0.5 Dónde está la documentación formal del API

**En el repo del frontend hay un archivo `openapi.json`** con la documentación completa y
actualizada del API (se genera desde el backend con `GET /api/docs-json`; también es navegable en
Scalar en `https://gensapi.ryancfx.click/api/docs`). **Regenerá tu cliente/tipos desde ese archivo
antes de empezar a programar** — es la fuente de verdad del shape exacto y tipado de cada campo.

Mapa de dónde aparece cada pieza nueva en ese spec:

| Pieza | Tag en el spec | Método + ruta |
|---|---|---|
| Campo `permiteCompraSinDimension` del artículo | **Catálogo** | Dentro del DTO de `POST/PUT/GET /catalog/items` (endpoint ya existente — no es una ruta nueva) |
| Endpoint de conversión manual | **Inventario** | `POST /inventory/conversion-dimension` (ruta nueva) |
| Conversión automática al vender | **Facturación** | Ocurre **dentro** de `POST /invoices` y `PUT /invoices/:id` (rutas ya existentes) — **no hay ningún campo, parámetro ni header nuevo que agregar en esas rutas**, el comportamiento es enteramente interno del servidor |

Si en algún punto este documento y el `openapi.json` llegaran a diferir en el nombre exacto de un
campo, tipo de dato, o si un campo es obligatorio u opcional: **gana el `openapi.json`** — pero no
debería pasar, porque todo lo escrito acá se extrajo directamente leyendo el código fuente ya
mergeado a la rama principal del backend.

### 0.6 Documentos relacionados que asumimos ya implementados

- `docs/frontend/PROMPT_PERMISOS_FRONTEND.md` — contrato de permisos (`GET /me/permissions` →
  `data.acciones`, manejo de respuestas `403`). Este documento no agrega ningún concepto nuevo de
  permisos más allá de una acción puntual (§3).
- `docs/frontend/PROMPT_INVENTORY_DIMENSIONS_FRONTEND.md` — ya mencionado en §0.1, es prerrequisito
  duro, no solo recomendado.

---

## 1. El modelo de datos y el concepto de negocio, explicado a fondo

### 1.1 Qué es, mecánicamente, el flag nuevo

`Item.permiteCompraSinDimension` es un campo booleano, opcional, con **default `false`**, que solo
tiene efecto real cuando el artículo **también** tiene `usaDimensiones: true` (es decir, cuando ya
declaró al menos una fila en `dimensiones[]`, tal como ya conocés de
`PROMPT_INVENTORY_DIMENSIONS_FRONTEND.md` §4).

Con el flag en `true`, para ESE artículo puntual:

1. **Comprarlo / recibirlo sin indicar la combinación queda permitido.** En cualquier documento de
   entrada de inventario (Compra con afectación de stock, Recepción de Mercancía, Orden de Compra
   al recibir, un Stock Entry de tipo Recepción), el campo `dimensiones` de la línea pasa a ser
   verdaderamente opcional — podés omitirlo sin que el servidor rechace la línea. Ese stock entra
   al sistema y queda contabilizado como stock del artículo **sin ninguna combinación asociada**
   — un "bucket sin dimensión", si preferís pensarlo así, pero conceptualmente para el usuario
   final **no existe tal bucket como cosa visible**: es simplemente "el stock de Bumper que
   todavía no tiene año/color asignado".
2. **Venderlo sigue exigiendo la combinación completa en cada línea, exactamente igual que
   cualquier otro artículo dimensionado, sin absolutamente ninguna excepción.** El flag
   `permiteCompraSinDimension` **nunca** relaja nada del lado de la venta. Si lo activaste
   esperando que también la venta se vuelva opcional, es un malentendido: no es así, y no hay
   forma de configurarlo para que lo sea.
3. **Al vender, si la combinación específica pedida no tiene stock propio suficiente, el servidor
   convierte automáticamente, por su cuenta, solo la cantidad que falte**, tomándola del stock sin
   combinación de ese mismo artículo. Esto es completamente transparente para quien vende — no
   hay ningún paso extra, ninguna pantalla nueva, ningún mensaje de confirmación especial. El
   cajero vende el artículo, elige la combinación, y listo.

### 1.2 Por qué esto NO es "dos artículos" aunque suene parecido

Es importante que lo tengas clarísimo para no reintroducir por accidente el diseño descartado
(§0.2): **no existen "dos estados" del artículo como entidades separadas.** Es el mismo
`item_code`, la misma ficha de Catálogo, el mismo precio, el mismo costo, la misma imagen, el
mismo todo. Lo único que varía, internamente y de forma invisible para el usuario, es si una
unidad concreta de stock ya tiene o no una combinación año/color asignada. Para el usuario de la
aplicación, el artículo es uno solo en todo momento — nunca va a ver, buscar, ni seleccionar nada
llamado "genérico" o "dimensionado".

### 1.3 Ejemplo completo del flujo de negocio real

Un comercio de autopartes vende bumpers que vienen en combinaciones de año y color.

1. **Compra**: el encargado de compras recibe un contenedor con 30 bumpers idénticos del
   proveedor, pero el proveedor no indica año/color en la factura — son genéricos hasta que se
   decida para qué vehículo se van a usar. El encargado carga la Recepción de Mercancía con el
   artículo "Bumper", cantidad 30, **sin elegir ninguna combinación** (el formulario, para este
   artículo con el flag activo, permite dejar los selectores de año/color vacíos — ver §4).
2. **Venta**: llega un cliente pidiendo un Bumper para un auto 2024, color Rojo. El cajero busca
   "Bumper" en el punto de venta — lo encuentra exactamente igual que buscaría cualquier otro
   artículo, sin ninguna indicación visual especial de que es distinto. Al agregarlo a la venta,
   el sistema le pide la combinación (año, color) — **exactamente el mismo formulario de selección
   de combinación que ya conocés de cualquier artículo dimensionado**, sin ninguna diferencia
   visual ni de comportamiento. El cajero elige año=2024, color=Rojo, y somete la venta.
3. **Qué pasa por detrás, sin que nadie en la tienda lo vea**: como todavía no había ningún Bumper
   2024-Rojo convertido, el servidor convierte automáticamente 1 unidad del stock sin combinación
   a la combinación 2024-Rojo, y recién después completa la venta con esa unidad. La factura sale
   normal, con el Bumper vendido y su combinación correctamente registrada.
4. **Segunda venta, mismo día**: otro cliente pide otro Bumper 2024-Rojo. Como la conversión
   anterior ya dejó 1 unidad en esa combinación exacta (y nadie más la vendió todavía), **esta vez
   no hace falta convertir nada** — el servidor detecta que ya hay suficiente stock en la
   combinación exacta y vende directo de ahí, sin ningún movimiento de conversión de por medio.
5. **Tercera venta, piden 5 Bumper 2024-Rojo de una sola vez, y solo queda 1 convertido**: el
   servidor convierte automáticamente **solo las 4 unidades que faltan** (no las 5 — la que ya
   estaba convertida se reusa), y completa la venta con las 5.

Esto es lo que en este documento llamamos **"conversión por top-up" (solo el faltante)** — es el
comportamiento exacto implementado, y es importante que lo entiendas así para explicarle
correctamente a cualquiera que pregunte "¿por qué a veces veo un movimiento de conversión en el
historial y a veces no?" (respuesta: solo cuando hacía falta cubrir un faltante).

### 1.4 Qué pasa si el artículo NUNCA tuvo compras sin dimensión

Nada especial. Si un artículo tiene `permiteCompraSinDimension: true` pero en la práctica siempre
se compró indicando la combinación completa (porque el encargado de compras prefirió hacerlo así
en un caso puntual), simplemente nunca va a existir stock "sin combinación" para ese artículo, y
el top-up automático nunca va a tener nada que convertir — la venta se comporta exactamente como
la de cualquier artículo dimensionado normal. El flag solo **habilita la posibilidad**, nunca
**obliga** a comprar sin dimensión.

### 1.5 Nombres de campo — mapeo exacto entre lo que ves en la API y el nombre interno

Puede ser útil tenerlo a mano si en algún momento cruzás información con logs del servidor, el
Desk de ERPNext, o reportes de auditoría — **nunca vas a necesitar mandar estos nombres internos
vos mismo**, la API siempre usa los nombres de la columna izquierda:

| Nombre en la API (lo que usás vos) | Nombre interno en ERPNext (solo para referencia/debug) |
|---|---|
| `permiteCompraSinDimension` | `Item.custom_permite_compra_sin_dimension` |
| (sin equivalente en la API — nunca lo mandás) | `Stock Entry.custom_factura_origen` (liga un movimiento de conversión a la factura que lo disparó) |
| (sin equivalente en la API — nunca lo mandás) | `Stock Entry.stock_entry_type = "Conversion a Item Dimensionado"` (el tipo de movimiento que arma el servidor internamente) |

---

## 2. Mapa completo de todo lo que cambia — usalo como índice de verificación

| # | Qué es | Tipo de cambio | Dónde |
|---|---|---|---|
| 1 | Campo `permiteCompraSinDimension` en `Item` | Campo nuevo en un endpoint existente | `POST/PUT/GET /catalog/items` |
| 2 | Endpoint de conversión manual de combinación | Endpoint nuevo | `POST /inventory/conversion-dimension` |
| 3 | Permiso que gatea el endpoint manual | Acción de permiso nueva | `inventario.convertir-dimension` |
| 4 | Conversión automática (top-up) al vender | Comportamiento interno nuevo, sin contrato nuevo | Dentro de `POST/PUT /invoices` |
| 5 | Pantalla "Catálogo → Artículos" | 1 checkbox nuevo en el formulario | Pantalla existente |
| 6 | Pantalla/acción nueva de conversión manual | Pantalla nueva, mismo patrón que Ajuste/Reclasificación | Nueva, en el menú de operaciones de inventario |
| 7 | Pantalla de venta/factura/POS | **Sin cambios** — ver §5 | — |
| 8 | Pantalla de edición/cancelación de factura | **Sin cambios** — ver §6 | — |

**Lo que NO cambia, para que lo tengas explícito y no pierdas tiempo buscándolo:**

- Nada de lo que ya implementaste de `PROMPT_INVENTORY_DIMENSIONS_FRONTEND.md` cambia de
  comportamiento. Un artículo sin `permiteCompraSinDimension` activo (el default) exige su
  dimensión en toda línea que mueve stock, compra incluida, exactamente igual que siempre.
- El shape del campo `dimensiones` en una línea de cualquier documento (`Record<string,string>`,
  `{codigo: idDeValor}`) no cambia en absoluto — es el mismo contrato universal de
  `PROMPT_INVENTORY_DIMENSIONS_FRONTEND.md` §5.
- No hay ningún artículo "genérico" ni "dimensionado" como conceptos de UI distintos — es el mismo
  ítem de catálogo en todo momento (§1.2). No existe, no debe crearse, ningún campo que vincule un
  ítem de catálogo con otro ítem de catálogo para este flujo.
- No hay ningún endpoint, parámetro, header o campo nuevo en las rutas de Facturación
  (`POST/PUT /invoices`, Caja/POS) — el top-up es enteramente una decisión del servidor (§5).
- No hay ningún nuevo tipo de documento que mostrar al usuario de ventas — el movimiento de
  conversión, cuando ocurre, es visible solo en pantallas de **inventario** (historial de Stock
  Entry), nunca en la pantalla de la factura en sí.

---

## 3. Permisos

| Acción | Gatea | Pantallas afectadas |
|---|---|---|
| `inventario.convertir-dimension` | El endpoint manual `POST /inventory/conversion-dimension` | Botón "Convertir" de la pantalla manual nueva (§7) |

Igual mecánica que ya conocés de cualquier otra pantalla: consultá
`GET /me/permissions → data.acciones['inventario.convertir-dimension']`. Si es `false`, ocultá o
deshabilitá el botón/entrada de menú de la pantalla de conversión manual por completo — **no**
dejes que el usuario llegue a ver el formulario y recién al someter reciba un `403`; la regla
general de UX de permisos que ya aplicás en el resto de la aplicación (ocultar en vez de
deshabilitar-y-fallar) aplica acá igual.

**Esta es la única acción de permiso nueva de todo este módulo.** La conversión automática al
vender (§5) **no necesita ningún permiso nuevo que vos chequees** — corre por dentro de
`POST/PUT /invoices` usando los permisos de facturación que el usuario ya tiene
(`ventas.factura.crear`, `ventas.factura.editar`, etc., los que ya gateás hoy). No agregues ningún
chequeo de permiso adicional en la pantalla de venta por este motivo.

El checkbox nuevo del formulario de artículo (§4) **no tiene un permiso propio distinto** —
gatealo con el mismo permiso que ya usás para editar cualquier otro campo de Catálogo → Artículos
(probablemente `catalogo.articulos.editar` o el que corresponda en tu implementación actual).

---

## 4. Catálogo → Artículos — 1 campo nuevo en el formulario

### 4.1 `permiteCompraSinDimension` — shape exacto

Solo tiene sentido mostrar/habilitar este campo cuando el artículo que se está editando tiene
`usaDimensiones: true` — mismo gating que ya aplicás hoy a los selectores de `dimensiones[]` y
`reglasCombinacion[]` descritos en `PROMPT_INVENTORY_DIMENSIONS_FRONTEND.md` §4.4.

**Lectura — `GET /catalog/items/:id` (y también en la respuesta de `POST`/`PUT`):**

```jsonc
{
  "success": true,
  "data": {
    // ...todos los campos de artículo que ya conocés...
    "usaDimensiones": true,
    "dimensiones": [
      { "dimension": "anio", "valoresPermitidos": [] },
      { "dimension": "color", "valoresPermitidos": [] }
    ],
    "reglasCombinacion": [],
    "permiteCompraSinDimension": true   // <-- CAMPO NUEVO. boolean. Default false si nunca se seteó.
  }
}
```

**Escritura — `POST /catalog/items` (crear) y `PUT /catalog/items/:id` (editar):**

```jsonc
{
  // ...todos los campos de artículo que ya conocés (itemName, category, dimensiones, etc.)...
  "permiteCompraSinDimension": true
}
```

| Propiedad | Detalle |
|---|---|
| Tipo | `boolean` |
| Obligatorio | No. Si se omite al crear, queda en `false`. Si se omite al editar (`PUT`), **conserva el valor que ya tenía** — mismo patrón de "omitir = no tocar" que ya conocés de cualquier otro campo opcional de este endpoint (ej. `priceMode`, `warrantyPeriod`). |
| Default | `false` |
| Para desactivarlo explícitamente en una edición | Mandá `"permiteCompraSinDimension": false` explícito — a diferencia de algunos campos Link de este mismo DTO que usan `""` para "vaciar", este es un boolean puro: `false` es un valor válido y explícito, no hace falta ningún truco de cadena vacía. |

### 4.2 Dónde ubicarlo en el formulario y cómo etiquetarlo

Ubicalo dentro del mismo bloque colapsable **"Dimensiones de inventario"** que ya implementaste
(ver `PROMPT_INVENTORY_DIMENSIONS_FRONTEND.md` §4), como un checkbox adicional, idealmente
inmediatamente después de la grilla de `dimensiones[]` y antes (o junto a) la grilla de
`reglasCombinacion[]`. No lo pongas en una sección separada de "Configuración avanzada" ni en
otra pestaña — conceptualmente es parte de la misma decisión de "cómo maneja este artículo sus
dimensiones".

**Texto sugerido para el checkbox:**

> ☐ **Permite comprar/recibir sin dimensión**
> *Al activar esto, este artículo se puede comprar o recibir sin indicar su combinación completa
> (ej. año, color). Al venderlo, la combinación sigue siendo obligatoria — el sistema completa
> automáticamente lo que falte, tomándolo del stock sin combinación.*

**Estado del checkbox según el contexto:**

| Situación | Qué hacer |
|---|---|
| `usaDimensiones: false` (el artículo no declaró ninguna dimensión todavía) | Ocultá el checkbox por completo — no tiene sentido mostrarlo deshabilitado, directamente no aplica. |
| `usaDimensiones: true`, artículo nuevo o sin movimientos | Mostralo habilitado, editable libremente. |
| `usaDimensiones: true`, artículo con movimientos de inventario ya existentes | **Mostralo editable igual** — a diferencia de la configuración de `dimensiones[]`/`reglasCombinacion[]` en sí (que es inmutable una vez que el artículo tiene historia, ver `PROMPT_INVENTORY_DIMENSIONS_FRONTEND.md` §4.5), **`permiteCompraSinDimension` NO tiene esa restricción de inmutabilidad** — se puede prender o apagar en cualquier momento, incluso con historia, porque no reinterpreta nada del pasado: solo decide si, de ahora en más, una nueva compra puede o no omitir la combinación. |

### 4.3 Validación del servidor — error único de esta sección

Si se intenta activar el checkbox (`permiteCompraSinDimension: true`) en un artículo que **no**
declara ninguna dimensión (`dimensiones[]` vacío, o sea `usaDimensiones: false`), el servidor
rechaza la operación completa con `400`:

```jsonc
{
  "code": "BAD_REQUEST",
  "statusCode": 400,
  "message": "«Permite comprar/recibir sin dimensión» requiere que el artículo declare al menos una dimensión de inventario arriba."
}
```

**En la práctica, este error nunca debería llegar a mostrarse** si seguiste la recomendación de
§4.2 (ocultar el checkbox cuando `usaDimensiones: false`) — pero manejalo igual como un `400`
genérico de formulario (mostralo asociado al campo `permiteCompraSinDimension`, o como un toast de
error si tu patrón de manejo de errores de formulario funciona así), por si en algún flujo
indirecto (una plantilla de artículo preconfigurada, una importación masiva, un formulario que
permite activar el checkbox y recién después agregar la dimensión en el mismo submit) este caso
llegara a producirse.

### 4.4 Qué NO validar vos mismo en el cliente más allá de lo de arriba

No hace falta ninguna otra validación de cliente para este campo — es un boolean simple sin
reglas de negocio adicionales (no depende de `isSalesItem`/`isPurchaseItem`, no depende de
`trackingType`, no depende de ninguna otra condición del formulario de artículo más allá de
`usaDimensiones`).

---

## 5. Conversión automática (top-up) al vender — **no hay ninguna pantalla que construir acá**

Esta es, deliberadamente, la sección más corta de instrucciones de implementación, porque **no
hay nada que programar en la pantalla de venta**. Léela igual completa — es importante que
entiendas bien el comportamiento para poder explicarlo si alguien de soporte o QA pregunta "¿por
qué apareció este movimiento de inventario que nadie generó a mano?".

### 5.1 Qué ve el cajero/vendedor: exactamente lo mismo que con cualquier otro artículo dimensionado

El cajero busca el artículo, lo agrega a la línea de venta, y el sistema le pide la combinación
(año, color, o las que declare el artículo) — usando **exactamente el mismo componente de
selectores en cascada** que ya implementaste en
`PROMPT_INVENTORY_DIMENSIONS_FRONTEND.md` §4.3, sin ninguna variación, sin ningún indicador visual
de que este artículo "es distinto". No hay ningún ícono, badge, tooltip, ni mensaje especial que
agregar a la línea de venta de un artículo con `permiteCompraSinDimension: true` — desde el punto
de vista de quien vende, el campo no existe.

**No construyas ningún flujo condicional del tipo "si el artículo tiene
`permiteCompraSinDimension: true`, mostrar/hacer X distinto" en ninguna pantalla de venta.** Si en
algún momento sentís la tentación de hacerlo, es señal de que algo se entendió mal — volvé a leer
§1.2.

### 5.2 Qué decide el servidor, por su cuenta, al someter la venta

Al someter `POST /invoices` (crear) o `PUT /invoices/:id` (editar) con una línea de un artículo que
tiene `permiteCompraSinDimension: true` y trae `dimensiones` (lo cual es obligatorio para
cualquier artículo dimensionado, recordá §1.1 punto 2):

1. El servidor consulta cuánto stock hay **ya** en esa combinación exacta, en el almacén
   resuelto para esa línea.
2. Si alcanza para la cantidad vendida, **no hace nada especial** — vende directo de esa
   combinación, como con cualquier artículo dimensionado normal.
3. Si no alcanza, el servidor somete, por su cuenta y de forma transaccional con la creación de la
   factura, un movimiento interno de inventario (un `Stock Entry` de tipo
   `"Conversion a Item Dimensionado"`) que mueve **solo la cantidad faltante** desde el stock sin
   combinación de ese mismo artículo hacia la combinación pedida, y recién después completa la
   venta con el stock ya disponible.
4. Si ni siquiera sumando el stock sin combinación alcanza para cubrir el faltante, la venta se
   rechaza con el **mismo error de "stock insuficiente" que ya conocés y manejás hoy** para
   cualquier venta sin suficiente existencia — no hay ningún código ni mensaje de error nuevo que
   agregar a tu manejo de errores de facturación por este motivo.

### 5.3 Alcance exacto — en qué documentos aplica y en cuáles no

| Documento | ¿Aplica el top-up automático? |
|---|---|
| Factura (`POST/PUT /invoices`) con `update_stock` real (afecta inventario) | **Sí** |
| Caja/POS (que arma y completa un borrador de Factura por dentro) | **Sí** — hereda el comportamiento de Factura, porque mecánicamente es el mismo endpoint por detrás |
| Factura con despacho a futuro (no afecta inventario todavía) | **No** — no hay stock que mover porque todavía no se está descontando nada real; el top-up corre recién cuando el despacho real sucede, si en ese momento la factura efectivamente descuenta stock |
| Cotizaciones (`POST/PUT /quotations`) | **No** — una cotización nunca descuenta stock real |
| Pedidos (`POST/PUT /pedidos`) | **No** — un pedido arma sus líneas de forma independiente y nunca descuenta stock real por sí mismo |
| Despachos (`POST/PUT /despachos`) | **No** directamente — ver nota de despacho a futuro arriba |

No necesitás programar ningún chequeo de "¿esto es un pedido o una factura?" para decidir si
mostrar algo distinto — simplemente no hay nada que mostrar distinto en ningún caso, el
comportamiento de arriba corre o no corre enteramente del lado del servidor sin ningún contrato
visible para el frontend.

### 5.4 El movimiento de conversión en el historial de inventario

Cuando el top-up sí ocurre (§5.2, punto 3), queda un `Stock Entry` sometido, de tipo
`"Conversion a Item Dimensionado"`, visible en cualquier pantalla de historial de movimientos de
inventario que ya tengas — **tratalo como cualquier otro `Stock Entry` del historial**, no hace
falta ningún tratamiento visual especial. Si tu pantalla de historial de inventario muestra el
`stock_entry_type` como columna o filtro, vas a ver este valor aparecer ahí — es informativo, no
necesita traducción especial más allá de mostrarlo tal cual o con una etiqueta amigable si tu
patrón de traducción de tipos de movimiento ya contempla esto (ej. "Conversión de combinación").

### 5.5 Nota técnica sobre líneas duplicadas del mismo artículo+combinación en una sola venta

Ya conocés la regla general de `PROMPT_INVENTORY_DIMENSIONS_FRONTEND.md` §5.1: **fusioná
automáticamente dos líneas del mismo artículo con la misma combinación exacta en una sola línea
con la cantidad sumada, antes de someter.** Esa recomendación sigue aplicando acá sin cambios —
no hace falta ninguna lógica adicional de tu parte para este módulo específico. Si por algún
motivo tu UI llegara a mandar dos líneas sin fusionar del mismo artículo+combinación, el
comportamiento del servidor sigue siendo correcto igual (el top-up de la primera línea ya deja
stock real disponible para que la segunda lo use), pero **igual seguí fusionando** por la razón
de prolijidad/UX ya explicada en el documento base.

---

## 6. Edición y cancelación de una factura que disparó una conversión automática

**Tampoco hay nada que programar distinto acá** — es información para que entiendas el
comportamiento, no una lista de tareas.

### 6.1 Editar (`PUT /invoices/:id`) una factura en borrador

Si una factura en estado borrador ya disparó una o más conversiones automáticas (porque alguna de
sus líneas necesitó top-up), y el usuario la edita y la vuelve a guardar:

- El servidor **revierte (cancela) TODAS** las conversiones que esa factura había disparado
  anteriormente.
- Luego **rehace las conversiones que hagan falta desde cero**, según el contenido actual del
  DTO que se está guardando — sin intentar "diferenciar" línea por línea qué cambió.

Esto es una decisión de producto explícita (no un detalle de implementación que pueda cambiar
sin aviso): **cada guardado de una factura en edición recalcula sus conversiones completas, de
cero, cada vez.** Para el frontend esto es **completamente transparente** — simplemente mandás el
DTO completo de la factura editada, como ya hacés hoy, y no hay ningún campo adicional que
agregar ni ningún estado intermedio que mostrar al usuario durante este proceso.

### 6.2 Cancelar una factura (borrador o sometida)

Si la factura cancelada había disparado alguna conversión automática, **el servidor la revierte
automáticamente como parte de la cancelación** — no hay ningún paso adicional ni ninguna
confirmación extra que pedirle al usuario por este motivo. El flujo de cancelación de factura que
ya implementaste (`PROMPT_PERMISOS_FRONTEND.md`/tu flujo existente de cancelación) sigue
funcionando exactamente igual, sin ningún campo ni parámetro nuevo.

### 6.3 Qué pasa con el stock después de revertir

El stock que se había movido a una combinación específica por la conversión vuelve al bucket sin
combinación del mismo artículo (conceptualmente: "como si la conversión nunca hubiera pasado") —
de nuevo, esto es manejo interno del servidor, no hay ninguna pantalla de inventario que deba
reflejar este detalle de forma especial más allá de que el historial de movimientos (§5.4) va a
mostrar el `Stock Entry` original en estado cancelado, igual que cualquier otro movimiento
cancelado que ya sepas mostrar en tu pantalla de historial.

---

## 7. Pantalla/acción nueva: "Conversión de combinación" (manual)

### 7.1 Para qué sirve y quién la usa

Permite convertir, a demanda y sin esperar a que llegue una venta, stock sin combinación de un
artículo a una combinación puntual. Es útil para **preparar stock con anticipación** — por
ejemplo, el encargado de inventario sabe que se viene una temporada alta de ventas de Bumper 2024
Rojo y prefiere dejarlo ya convertido de antemano, en vez de esperar a que el top-up automático lo
haga en el momento de cada venta.

**Ubicación en la UI**: exactamente el mismo lugar y mismo nivel jerárquico de menú que las
pantallas de **Ajuste de Combinación** y **Reclasificación de Combinación** que ya implementaste
(`PROMPT_INVENTORY_DIMENSIONS_FRONTEND.md` §8.5/§8.6) — agregala como una tercera opción en ese
mismo menú/sección de "Operaciones de inventario" o como se llame en tu aplicación. Sugerencia de
nombre de menú: **"Conversión de combinación"** o **"Convertir a combinación"**.

### 7.2 Contrato del endpoint

`POST /inventory/conversion-dimension` — permiso `inventario.convertir-dimension` (§3).

**Request:**

```jsonc
{
  "itemCode": "BUMPER",
  "warehouse": "ALM-01",
  "qty": 10,
  "dimensiones": { "anio": "ANIO-2024", "color": "COLOR-ROJO" },
  "postingDate": "2026-01-20",
  "remarks": "Conversión para pedido de cliente",
  "branch": "Principal"
}
```

| Campo | Tipo | Obligatorio | Notas |
|---|---|---|---|
| `itemCode` | string | **Sí** | El código del artículo a convertir. Debe (a) declarar dimensiones (`usaDimensiones: true`) y (b) tener `permiteCompraSinDimension: true` — si no cumple cualquiera de las dos, el servidor rechaza con 400, ver §7.5 |
| `warehouse` | string | **Sí** | El almacén donde está el stock sin combinación Y donde va a quedar el stock ya convertido — **es el mismo almacén en ambos lados**, esto NO es una transferencia entre almacenes distintos |
| `qty` | number | **Sí**, debe ser `> 0` | Cantidad a convertir |
| `dimensiones` | objeto `{codigo: idDeValor}` | **Sí, y NO puede venir vacío** (objeto `{}` o ausente es rechazado) | La combinación COMPLETA a asignar — todas las dimensiones que declara el artículo, ni una menos. Mismo shape y mismo patrón de selectores en cascada que ya conocés de Ajuste/Reclasificación de Combinación |
| `postingDate` | string, formato fecha ISO (`YYYY-MM-DD`) | No — default: la fecha de hoy del servidor | — |
| `remarks` | string | No | Si se omite, el servidor genera una nota descriptiva automática del tipo `"Conversión {itemCode} ({qty}) en {warehouse}"` |
| `branch` | string | No | Si se omite, se resuelve en cascada (usuario → sucursal por defecto configurada → única sucursal existente si el tenant solo tiene una) — mismo mecanismo de resolución automática de sucursal que ya conocés de Ajuste/Reclasificación de Combinación y de cualquier otra pantalla de inventario |

**Response exitosa (HTTP 200/201):**

```jsonc
{
  "success": true,
  "data": {
    "id": "MAT-STE-2026-00123",
    "tipo": "Conversion a Item Dimensionado",
    "itemCode": "BUMPER",
    "warehouse": "ALM-01",
    "qty": 10,
    "postingDate": "2026-01-20",
    "branch": "Principal",
    "remarks": "Conversión para pedido de cliente"
  }
}
```

| Campo de la respuesta | Qué significa |
|---|---|
| `id` | El nombre/id del `Stock Entry` que quedó sometido en ERPNext — usalo si tu pantalla ofrece "ver detalle del movimiento" o un link al historial de inventario |
| `tipo` | Siempre literalmente `"Conversion a Item Dimensionado"` para este endpoint — no varía |
| `itemCode` | Eco del artículo convertido |
| `warehouse` | Eco del almacén |
| `qty` | Eco de la cantidad convertida |
| `postingDate` | La fecha contable efectivamente usada (la que mandaste, o la de hoy si la omitiste) |
| `branch` | La sucursal efectivamente usada (la que mandaste, o la resuelta en cascada) |
| `remarks` | La nota efectivamente guardada (la que mandaste, o la generada automáticamente) |

Mostrá esta respuesta en el historial/detalle de inventario de la misma forma en que ya mostrás el
resultado de un Ajuste o una Reclasificación — es un `Stock Entry` sometido más, consultable como
cualquier otro movimiento desde las pantallas de historial que ya tienes.

### 7.3 Formulario sugerido, paso a paso

1. **Selector de artículo.** Filtrá la lista a artículos con `usaDimensiones: true` **y**
   `permiteCompraSinDimension: true` — un artículo que no cumpla ambas condiciones no tiene
   sentido mostrarlo acá, porque el servidor lo va a rechazar igual (§7.5). Si tu selector de
   artículos no soporta filtrar por `permiteCompraSinDimension` directamente en el backend,
   traé la lista completa de artículos dimensionados y filtrá en el cliente por ese campo (ya
   viene en la respuesta de `GET /catalog/items`, §4.1).
2. **Selector de almacén.** Una vez elegido el artículo y el almacén, mostrá de forma informativa
   (no es obligatorio, pero mejora mucho la UX) el stock sin combinación disponible ahí — podés
   pedirlo con el mismo endpoint de stock por combinación que ya conocés
   (`GET /inventory/items/:itemCode/stock-por-dimension?warehouse=...`,
   `PROMPT_INVENTORY_DIMENSIONS_FRONTEND.md` §8.3) y mirar el campo `sinEspecificar` de la
   respuesta — ese es justamente el stock sin combinación disponible para convertir. Mostralo como
   *"Stock disponible sin combinación en este almacén: N unidades"*.
3. **Cantidad a convertir** — un input numérico simple, `> 0`. Opcionalmente, validá en el cliente
   que no sea mayor al `sinEspecificar` que trajiste en el paso anterior, para dar
   retroalimentación inmediata antes de someter (la autoridad real sigue siendo el servidor, que
   va a rechazar con un error nativo de stock negativo si igual se intenta convertir de más, ver
   §7.5).
4. **Selectores en cascada de la combinación destino** — exactamente el mismo componente que ya
   implementaste para elegir una combinación en cualquier línea de documento
   (`PROMPT_INVENTORY_DIMENSIONS_FRONTEND.md` §4.3), usando las dimensiones declaradas por el
   artículo elegido en el paso 1.
5. **Campos opcionales**: fecha contable, nota, sucursal — mismo patrón visual y de
   comportamiento que ya implementaste para Ajuste de Combinación y Reclasificación de
   Combinación.
6. **Botón de submit**, gateado por el permiso `inventario.convertir-dimension` (§3).

### 7.4 Qué mostrar después de un submit exitoso

Un mensaje de confirmación simple (toast o modal, según tu patrón de la aplicación) del tipo:

> *"Se convirtieron {qty} unidades de {itemCode} a la combinación elegida en {warehouse}."*

y, si tu pantalla lo permite, un link o botón para "Ver en historial de inventario" que navegue al
detalle del `Stock Entry` devuelto (`data.id`).

### 7.5 Errores propios de esta pantalla — tabla exhaustiva

| Situación | Mensaje exacto devuelto por el servidor | Cuándo podés prevenirlo en el cliente |
|---|---|---|
| `dimensiones` vacío (`{}`) u omitido en el request | `Debe indicar la combinación completa a asignar en "dimensiones".` | Siempre — no dejes someter el formulario sin que los selectores de combinación tengan todos los valores completos |
| El `itemCode` indicado no existe | `El ítem "{itemCode}" no existe.` | Prácticamente nunca, si el selector de artículo (§7.3 paso 1) solo ofrece artículos reales del catálogo |
| El ítem no usa dimensiones (`usaDimensiones: false`) | `El ítem "{itemCode}" no usa dimensiones de inventario.` | Siempre, si filtraste el selector de artículo como se sugiere en §7.3 paso 1 |
| El ítem no tiene `permiteCompraSinDimension` activo | `El ítem "{itemCode}" no tiene activo "permite compra sin dimensión" (Item.custom_permite_compra_sin_dimension) — no participa del flujo de conversión.` | Siempre, con el mismo filtro de §7.3 paso 1 |
| Algún código dentro de `dimensiones` no es una dimensión activa del tenant | `«{codigo}» no es una dimensión de inventario de esta empresa. Disponibles: {lista}.` | Siempre, si armás el objeto `dimensiones` a partir de `item.dimensiones[].dimension` (nunca hardcodeado) |
| Falta algún valor de la combinación, o el valor elegido no corresponde a esa dimensión | Mismos mensajes de `_validar_fila`/`_validar_valor` que ya conocés y manejás de las pantallas de Ajuste/Reclasificación de Combinación (`PROMPT_INVENTORY_DIMENSIONS_FRONTEND.md` §11) — nada nuevo que programar acá, son exactamente los mismos errores de siempre | Parcialmente — tu componente de selectores en cascada ya debería impedir elegir un valor que no corresponda |
| La combinación elegida no está entre las permitidas por `reglasCombinacion` del artículo | Mismo mensaje que ya conocés de cualquier otra línea de documento con reglas de combinación | Parcialmente, si tu UI ya filtra combinaciones inválidas como mejora de UX (opcional, no obligatorio) |
| Stock sin combinación insuficiente en ese almacén para la cantidad pedida | Error nativo de ERPNext de stock negativo (mismo formato que ya manejás en cualquier salida de inventario) | Si mostraste el `sinEspecificar` disponible en el paso 2 de §7.3 y validaste contra eso en el cliente antes de someter |

### 7.6 Qué NO hacer en esta pantalla

- **No agregues un botón de "deshacer conversión".** No existe conversión inversa implementada en
  esta primera fase. Si se convirtió con la combinación equivocada, la corrección correcta es usar
  la pantalla de **Reclasificación de Combinación** que ya tienes, aplicada sobre la combinación ya
  convertida, para moverla a la combinación correcta.
- **No permitas repartir una sola conversión en varias combinaciones dentro del mismo
  formulario/submit.** Cada llamada al endpoint asigna una única combinación. Si el usuario
  necesita convertir 10 unidades a (2024, Rojo) y 10 unidades a (2024, Azul), son **dos envíos
  separados** del mismo formulario, uno después del otro — no intentes construir un formulario que
  acepte múltiples combinaciones con sus cantidades en una sola pantalla/submit.
- **No agregues ningún campo de "ítem destino" distinto del artículo elegido.** No hay dos
  artículos en este flujo (§1.2) — hay un solo `itemCode` en el formulario entero.

---

## 8. Qué NO hacer — resumen general de todo el módulo

Esta sección repite, a propósito, algunas prohibiciones ya mencionadas arriba junto a otras
nuevas, agrupadas todas en un solo lugar para que sirvan de checklist rápido de "cosas que, si las
veo en una revisión de código, significan que algo se entendió mal":

1. **No reintroduzcas el diseño de dos artículos enlazados** (`itemGenericoOrigen`,
   `destinoConversionAutomatica`, o cualquier variante de "ítem genérico" + "ítem dimensionado"
   como entidades separadas). Ver §0.2 y §1.2.
2. **No agregues ningún campo, selector, badge ni indicador visual especial en la pantalla de
   venta/factura/POS** por causa de este módulo. La venta de un artículo con
   `permiteCompraSinDimension: true` es indistinguible, en todo momento, de la venta de cualquier
   otro artículo dimensionado. Ver §5.1.
3. **No construyas una pantalla para deshacer una conversión manual, ni una para repartir una
   conversión en múltiples combinaciones en un solo submit.** Ver §7.6.
4. **No agregues ningún interruptor de "habilitar conversión automática" a nivel de
   tenant/configuración general.** La capacidad se configura **exclusivamente por artículo**
   (`permiteCompraSinDimension`, §4). Si en algún momento ves la tentación de agregar un switch
   global en una pantalla de Configuración para esto, es una señal inequívoca de que algo se
   entendió mal — no lo hagas, y si dudás, volvé a leer §0.3.
5. **No restrinjas la edición del checkbox `permiteCompraSinDimension` por tener historia de
   movimientos.** A diferencia de `dimensiones[]`/`reglasCombinacion[]` (que sí son inmutables con
   historia), este campo se puede cambiar libremente en cualquier momento. Ver §4.2.
6. **No muestres ni esperes ningún campo de costo o valor monetario "por combinación"** en
   ninguna pantalla de este módulo — ni acá ni en el documento base de Dimensiones se expone costo
   por combinación, es una decisión de producto explícita y ya documentada en
   `PROMPT_INVENTORY_DIMENSIONS_FRONTEND.md` §8.3.
7. **No agregues ningún chequeo de permiso adicional en la pantalla de venta** por causa de la
   conversión automática — no lo necesita, corre con los permisos de facturación que el usuario
   ya tiene. Ver §3.

---

## 9. Escenarios de prueba (QA) sugeridos — para validar la implementación end-to-end

Usalos como casos de prueba manual o como base para tests automatizados de integración del
frontend, cubriendo tanto la UI nueva como la ausencia de cambios donde no debe haberlos:

1. **Crear un artículo nuevo con dimensiones y el flag activo** — verificar que el checkbox
   aparece, se puede marcar, y que al guardar la respuesta trae `permiteCompraSinDimension: true`.
2. **Intentar activar el flag en un artículo SIN dimensiones** (vía algún flujo indirecto, si tu
   UI lo permitiera) — verificar que se muestra el error de §4.3 de forma clara.
3. **Comprar/recibir ese artículo sin elegir combinación** — verificar que el formulario de
   compra/recepción lo permite (no exige los selectores de combinación como obligatorios) y que la
   operación se completa sin error.
4. **Vender ese mismo artículo eligiendo una combinación que todavía no existe convertida** —
   verificar que la venta se completa normalmente desde la perspectiva del cajero (sin ningún
   mensaje ni paso extra), y que después aparece un `Stock Entry` de conversión en el historial de
   inventario.
5. **Vender el mismo artículo y la misma combinación una segunda vez, con stock ya convertido
   suficiente** — verificar que la venta se completa igual de rápido/normal y que **no** aparece
   un `Stock Entry` de conversión nuevo esta vez (ya había stock suficiente en esa combinación).
6. **Vender una cantidad mayor a la ya convertida en una combinación** (ej. hay 3 convertidas,
   se venden 5) — verificar en el historial de inventario que el `Stock Entry` de conversión
   nuevo mueve solo 2 unidades (el faltante), no 5.
7. **Editar una factura que ya disparó una conversión, cambiando la cantidad o la combinación de
   esa línea** — verificar que la factura se guarda sin error y que el historial de inventario
   refleja la conversión anterior cancelada y una nueva (si corresponde) con los valores
   actualizados.
8. **Cancelar una factura que disparó una conversión** — verificar que la cancelación se completa
   sin ningún paso adicional visible para el usuario, y que el `Stock Entry` de conversión asociado
   aparece cancelado en el historial.
9. **Crear/editar/vender un artículo dimensionado SIN el flag activo** — verificar, como prueba de
   no-regresión, que absolutamente nada cambió respecto al comportamiento que ya tenías antes de
   implementar este módulo (la combinación sigue siendo obligatoria también al comprar).
10. **Usar la pantalla de conversión manual (§7) sobre un artículo con stock sin combinación
    suficiente** — verificar el mensaje de stock insuficiente (§7.5).
11. **Usar la pantalla de conversión manual sobre un artículo que NO tiene el flag activo** —
    verificar el mensaje de error específico (§7.5, segunda fila relevante).

---

## 10. Checklist final de implementación

- [ ] Regenerado el cliente/tipos desde el `openapi.json` actualizado (§0.5).
- [ ] Confirmado que `PROMPT_INVENTORY_DIMENSIONS_FRONTEND.md` ya está implementado por completo
      (prerrequisito, §0.1).
- [ ] Descartado/eliminado cualquier trabajo previo sobre el diseño de "ítem genérico + ítem
      dimensionado" con dos artículos enlazados (§0.2).
- [ ] Catálogo → Artículos: checkbox `permiteCompraSinDimension`, gateado por
      `usaDimensiones: true`, editable sin importar si el artículo tiene historia (§4).
- [ ] Manejo del error 400 de §4.3 en el formulario de artículo.
- [ ] Nueva pantalla/acción "Conversión de combinación" (manual), ubicada junto a Ajuste y
      Reclasificación de Combinación, gateada por el permiso `inventario.convertir-dimension`
      (§3, §7).
- [ ] Formulario de conversión manual completo: selector de artículo filtrado, selector de
      almacén con stock sin combinación visible, cantidad, selectores en cascada de combinación,
      campos opcionales de fecha/nota/sucursal (§7.3).
- [ ] Manejo exhaustivo de los errores de §7.5.
- [ ] Verificado que la pantalla de venta/factura/POS **no tiene ningún cambio** — ni un campo, ni
      un indicador visual, ni un chequeo de permiso nuevo (§5, §8).
- [ ] Verificado que editar/cancelar una factura con conversiones asociadas no requiere ningún
      cambio de UI — el comportamiento es completamente transparente (§6).
- [ ] Corridos manualmente, o automatizados, los 11 escenarios de prueba de §9.
- [ ] Verificado, como prueba de no-regresión, que un artículo dimensionado sin
      `permiteCompraSinDimension` activo sigue exigiendo la combinación también al comprar,
      exactamente igual que antes de este módulo.
