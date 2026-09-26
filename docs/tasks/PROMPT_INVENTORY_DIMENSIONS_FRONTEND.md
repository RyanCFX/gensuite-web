# Prompt para agente de frontend — Dimensiones de Inventario

> **Para quien recibe este documento.** Esto describe una funcionalidad transversal — **no una
> pantalla nueva aislada**, sino un campo y un concepto que atraviesan casi todos los módulos que
> ya tenés construidos: Catálogo de Artículos, Compras, Recepciones, Órdenes de Compra,
> Devoluciones de Compra, Facturación, Pedidos/Apartados, Cotizaciones, Despachos, Notas de
> Crédito, Transferencias y Ubicaciones. Además agrega dos pantallas nuevas de administración
> (Catálogo de Dimensiones y Valores) y dos pantallas/acciones nuevas de operación (Ajuste de
> Combinación y Reclasificación de Combinación). Ya está **implementado, probado y desplegable**
> en el backend — no hay nada del lado del servidor pendiente de decisión de diseño para lo
> descrito acá.
>
> Este documento es exhaustivo a propósito: cada endpoint, cada campo, cada mensaje de error y
> cada regla de negocio que el frontend debe respetar están descritos explícitamente. Hay
> **reglas no obvias que, si se ignoran, corrompen silenciosamente el desglose de inventario o
> rompen una edición con un error que el usuario no va a entender** — están marcadas con ⚠️ y
> repetidas más de una vez a propósito. Leé el documento completo antes de escribir código; no es
> seguro implementar módulo por módulo salteando las secciones 0, 8 y 9.
>
> **En el repo del frontend hay un archivo `openapi.json` con la documentación completa y
> actualizada del API** (se genera desde el backend con `GET /api/docs-json`, también navegable en
> Scalar en `https://gensapi.ryancfx.click/api/docs`). **Antes de escribir una sola línea de
> código, regenerá tus tipos/cliente HTTP desde ese archivo** — ahí está el shape exacto y tipado
> de cada request y cada response. Los endpoints nuevos de este documento aparecen bajo los tags
> **`Catálogo — Dimensiones de Inventario`** e **`Inventario`**; los campos `dimensiones`/
> `lineaOriginal`/`reglasCombinacion` agregados a endpoints ya existentes aparecen dentro de los
> DTOs de esos mismos tags de siempre (Compras, Facturación, Pedidos, etc.). **Si este documento y
> el `openapi.json` llegaran a diferir en el nombre exacto de un campo, gana el `openapi.json`**
> — pero eso no debería pasar: todo lo escrito acá se extrajo directamente del código fuente ya
> mergeado, no de un diseño preliminar.
>
> Documento relacionado que ya deberías tener implementado y que esto reutiliza sin cambiarlo:
> `docs/frontend/PROMPT_PERMISOS_FRONTEND.md` (contrato de permisos — `GET /me/permissions`,
> `data.acciones`, manejo de `403 PERMISO_INSUFICIENTE`). Si ya implementaste
> `docs/frontend/PROMPT_DESPACHO_RESERVAS_ABASTECIMIENTO_FRONTEND.md` (Apartados/Layaway) y
> `docs/frontend/PROMPT_CARGA_INICIAL_INVENTARIO_FRONTEND.md` (Ubicaciones/Transferencias), leé la
> §9 de este documento con atención: cambia sutilmente el comportamiento de Apartados para
> artículos con dimensiones, sin cambiar el contrato del botón "Apartar" que ya tenés.

---

## 0. El concepto de negocio, en una frase, y las 4 reglas que no podés romper

**Una "dimensión de inventario" es un eje adicional, configurable por empresa, que combinado
identifica un lote lógico de existencias de un artículo — sin crear un artículo nuevo por cada
combinación.** El ejemplo real que motivó esto es una ferretería/autopartes: un artículo "Puerta"
puede existir en existencias separadas por Marca (Honda, Toyota) y Año (2000, 2001) — sin que eso
signifique crear "Puerta Honda 2000", "Puerta Honda 2001", "Puerta Toyota 2000" como artículos
distintos en el catálogo. La combinación completa de valores (una por cada dimensión que el
artículo declara) es lo que identifica una porción distinguible del stock de ese artículo.

Esto es **distinto y no reemplaza** las Variantes de artículo que probablemente ya tenés
implementadas (plantilla + atributos → SKUs hijos). La diferencia de negocio: una variante es un
artículo real con su propio precio/costo (útil cuando la combinación cambia el precio: Talla S vs
Talla XL). Una dimensión de inventario es un solo artículo, un solo precio, un solo costo — solo
cambia **cuánta cantidad hay de cada combinación**. Un artículo usa una cosa o la otra, nunca
ambas (ver §0.4).

**Las 4 reglas que gobiernan todo lo demás — memorizalas antes de seguir:**

1. **No todos los artículos usan dimensiones.** Es opt-in por artículo (`usaDimensiones`,
   calculado por el servidor). La enorme mayoría del catálogo existente no las usa y **no cambia
   en nada** — el campo `dimensiones` en una línea de documento es opcional y, si el artículo no
   las usa, ni siquiera hay que mostrarlo.
2. **Un artículo con dimensiones exige la combinación completa en TODA línea que mueva stock.**
   Compra, venta, transferencia, ajuste — todas. No hay "combinación parcial" ni "sin especificar"
   como estado normal: si falta un valor, el servidor rechaza la operación completa con un error
   por línea (ver §11).
3. **La configuración de dimensiones de un artículo es INMUTABLE desde su primer movimiento de
   inventario.** Un artículo se puede configurar (declarar qué dimensiones usa) únicamente
   mientras tenga **cero movimientos** en toda su historia — ni uno, así esté cancelado, así el
   saldo actual sea cero. Si el negocio quiere "ahora quiero manejar marca y año en la puerta que
   ya vendo", la respuesta es **crear un artículo nuevo** — no se puede convertir el existente. Ver
   §4.5 para el mensaje exacto y cómo comunicarlo en la UI.
4. **⚠️ Regla de edición, la más importante de todo el documento — repetida en §10.1**: cuando
   edites (`PUT`) un documento que ya tiene líneas con una combinación, **volvé a mandar
   `dimensiones` en CADA línea, siempre, aunque esa línea no haya cambiado**. El backend intenta
   conservar la combinación de una línea no tocada en algunos módulos (facturas, pedidos,
   cotizaciones, despachos) con una heurística interna que **no es 100% confiable** (compara por
   posición o por coincidencia exacta de cantidad/precio, no por un id de línea), y en otros
   módulos (Compras, Recepciones, Órdenes de Compra) **no existe ningún intento de conservarla en
   absoluto** — si el campo no viene, la combinación de esa línea simplemente desaparece del
   documento reconstruido. En el peor caso esto no corrompe datos (el hook del servidor va a
   rechazar el guardado exigiendo la combinación otra vez, ver §11), pero en el mejor caso es un
   error de validación confuso para el usuario en una edición que no debería haber tocado esa
   línea. **No dependas nunca de la conservación automática: mandá `dimensiones` explícito en cada
   línea de cada `PUT`, siempre que ese artículo las use.**

---

## 1. Mapa completo de todo lo que cambia — usalo como índice

| Área | Qué cambia | Sección |
|---|---|---|
| Catálogo → nueva pantalla | Administrar Dimensiones de Inventario y sus Valores (Marca, Modelo, Año…) | §3 |
| Catálogo → Artículos (crear/editar) | Nuevo bloque "Dimensiones de inventario" en la ficha del artículo | §4 |
| Compras | `dimensiones` por línea | §6.1 |
| Recepción de Mercancía (Purchase Receipt) | `dimensiones` por línea | §6.2 |
| Órdenes de Compra (crear, recibir) | `dimensiones` por línea, override opcional al recibir | §6.3 |
| Devoluciones de Compra | `lineaOriginal` (nunca se pide la combinación, se copia sola) | §6.4 |
| Facturación (Sales Invoice) | `dimensiones` por línea | §7.1 |
| Pedidos / Cotizaciones | `dimensiones` por línea; comportamiento de Apartados cambia (§9) | §7.2, §7.3 |
| Despachos (Delivery Note) | `dimensiones` por línea | §7.4 |
| Notas de Crédito | `lineaOriginal` (nunca se pide la combinación, se copia sola) | §7.5 |
| Transferencias entre almacenes | `dimensiones` por línea (misma combinación en ambos lados) | §8.1 |
| Ubicaciones (distribuir/mover) | `dimensiones` por línea | §8.2 |
| Inventario → **pantalla/consulta nueva** | Ver stock desglosado por combinación de un artículo | §8.3 |
| Cualquier flujo de venta/POS → **verificación previa opcional** | Avisar de faltantes por combinación antes de someter | §8.4 |
| Inventario → **acción nueva** | Ajustar el saldo de una combinación puntual | §8.5 |
| Inventario → **acción nueva** | Reclasificar una combinación por otra (corregir un error) | §8.6 |
| Apartados (Layaway) | Sin cambio de contrato visible, pero cambia qué pasa por dentro | §9 |

**Lo que NO cambia y no hay que tocar:** nada de esto afecta precios, costos ni impuestos — una
combinación nunca tiene su propio precio ni costo (decisión de producto explícita, ver §0). Los
reportes de valoración/movimientos y la impresión de documentos **todavía no tienen soporte para
mostrar la combinación** del lado del servidor (ver §12 — pendiente, no lo esperes).

---

## 2. Permisos — acciones nuevas

Mismo mecanismo de siempre: `GET /api/v1/me/permissions` al iniciar sesión, `data.acciones` en
memoria, gating de pantallas/botones, y el contrato `403 PERMISO_INSUFICIENTE` de siempre si
igual se intenta una acción sin permiso.

| Acción | Controla |
|---|---|
| `catalogo.dimensiones.listar` | Ver la pantalla de administración de Dimensiones/Valores (§3) |
| `catalogo.dimensiones.crear` | Botón "Nueva dimensión" |
| `catalogo.dimensiones.editar` | Editar/activar/desactivar una dimensión, agregar/editar un valor |
| `inventario.stock.consultar` | Ver el desglose de stock por combinación (§8.3) y usar la verificación previa (§8.4) — **es el MISMO permiso que ya usás para** `GET /inventory` (existencias generales), no uno nuevo |
| `inventario.ajustar` | Botón "Ajustar combinación" (§8.5) |
| `inventario.reclasificar` | Botón "Reclasificar combinación" (§8.6) |

**No hay ningún permiso nuevo para los campos `dimensiones`/`lineaOriginal` dentro de Compras,
Ventas, etc.** — esos siguen gateados por los permisos que ya tenés de esas pantallas
(`compras.crear`, `invoices.crear`, etc.). No hace falta ningún cambio de permisos ahí, solo de
formulario.

---

## 3. Catálogo de Dimensiones y Valores — pantalla nueva

Esta es la pantalla de **administración** (normalmente para un rol Administrador/Gerente, no para
cajeros/vendedores): define qué dimensiones existen en la empresa (Marca, Modelo, Año, Color…) y
qué valores tiene cada una (Honda, Toyota, 2000, 2001…). Un artículo del catálogo luego **elige**
cuáles de estas dimensiones usa (§4) — el catálogo de dimensiones es único para toda la empresa,
no se define por artículo.

Ubicación sugerida: Catálogo → Dimensiones de Inventario (junto a Categorías, Marcas — pero **no
confundir con el concepto nativo "Marca" del catálogo de artículos**, que es otra cosa; acá
"Marca" es solo un EJEMPLO de dimensión que la empresa podría crear, no el campo `brand` nativo
del artículo).

### 3.1 Endpoints

Base: `/api/v1/catalog/dimensiones-inventario`. Todos requieren `X-Tenant` y `Authorization`.

| # | Método | Ruta | Permiso | Qué hace |
|---|---|---|---|---|
| 1 | `GET` | `/catalog/dimensiones-inventario` | `catalogo.dimensiones.listar` | Lista las dimensiones de la empresa |
| 2 | `POST` | `/catalog/dimensiones-inventario` | `catalogo.dimensiones.crear` | Crea una dimensión nueva |
| 3 | `PUT` | `/catalog/dimensiones-inventario/:codigo` | `catalogo.dimensiones.editar` | Cambia SOLO etiqueta/orden |
| 4 | `POST` | `/catalog/dimensiones-inventario/:codigo/toggle` | `catalogo.dimensiones.editar` | Activa/desactiva (no hay borrado, ver §3.5) |
| 5 | `GET` | `/catalog/dimensiones-inventario/:codigo/valores` | `catalogo.dimensiones.listar` | Lista los valores de una dimensión |
| 6 | `POST` | `/catalog/dimensiones-inventario/:codigo/valores` | `catalogo.dimensiones.editar` | Agrega un valor |
| 7 | `PUT` | `/catalog/dimensiones-inventario/:codigo/valores/:id` | `catalogo.dimensiones.editar` | Edita un valor (no el id) |

> ⚠️ Fijate en la ruta real del endpoint 7: el `:codigo` en el path es el de la dimensión dueña
> del valor, pero **el handler del servidor solo usa `:id`** para buscar el valor (el `:codigo` de
> la URL no se valida contra el valor) — igual armá la URL completa con ambos segmentos tal como
> está documentada acá y en el `openapi.json`, no solo con `valores/:id`.

### 3.2 Listar dimensiones — `GET /catalog/dimensiones-inventario`

Sin query params.

```jsonc
{
  "success": true,
  "data": [
    { "codigo": "marca", "etiqueta": "Marca", "tipo": "Categorica", "dimensionPadre": undefined, "espacio": 1, "activo": true, "orden": 0 },
    { "codigo": "modelo", "etiqueta": "Modelo", "tipo": "Categorica", "dimensionPadre": "marca", "espacio": 2, "activo": true, "orden": 1 },
    { "codigo": "anio", "etiqueta": "Año", "tipo": "Ordinal", "dimensionPadre": undefined, "espacio": 3, "activo": true, "orden": 2 }
  ],
  "meta": { "espaciosLibres": 1, "total": 3 }
}
```

- `codigo`: el identificador estable — es lo que se usa como CLAVE en todos los demás endpoints
  del sistema (`dimensiones: { marca: "..." }`). **Inmutable** una vez creado.
- `etiqueta`: lo que ve el usuario. Editable.
- `tipo`: `"Categorica"` (Honda/Toyota, sin orden entre sí) u `"Ordinal"` (para años/rangos —
  habilita `desde`/`hasta` en las reglas de combinación del artículo, §4.3).
- `dimensionPadre`: si esta dimensión depende jerárquicamente de otra (ver §3.6 — cascada).
- `espacio`: número interno de 1 a N. **Puramente informativo para vos** — no lo uses para nada
  de lógica de negocio, es un detalle de implementación del servidor (cuántas columnas físicas
  tiene provisionadas la empresa).
- `meta.espaciosLibres`: cuántas dimensiones NUEVAS se pueden seguir creando. Ver §3.4.

### 3.3 Crear una dimensión — `POST /catalog/dimensiones-inventario`

```jsonc
// Request
{
  "codigo": "marca",           // obligatorio, INMUTABLE. Regex: ^[a-z][a-z0-9_]{1,29}$
  "etiqueta": "Marca",         // obligatorio, hasta 60 caracteres
  "tipo": "Categorica",        // opcional, default "Categorica". Enum: "Categorica" | "Ordinal"
  "dimensionPadre": "marca"    // opcional — código de OTRA dimensión ya creada
}
```

**Validación de `codigo` — mostrala en el formulario ANTES de someter, no dejes que el usuario se
entere recién con el 400 del servidor:** solo minúsculas sin acentos, números y guión bajo,
empezando por una letra. Ejemplos válidos: `marca`, `anio`, `talla_zapato`. Ejemplos inválidos:
`Marca` (mayúscula), `Año` (acento y mayúscula), `2color` (empieza con número). Mensaje exacto del
servidor si se envía igual un código inválido:

> `El código solo admite minúsculas sin acentos, números y guión bajo, empezando por una letra (ej: marca, anio).`

**Sugerencia de UX**: generá el `codigo` automáticamente a partir de lo que el usuario escribe en
`etiqueta` (slug: minúsculas, sin acentos, espacios → guión bajo), pero dejalo editable ANTES de
guardar por primera vez — después de creado no se puede tocar.

**Response exitosa:**

```jsonc
{ "success": true, "data": { "codigo": "marca", "espacio": 1, "campo": "custom_dim_1" } }
```

`campo` es el nombre físico interno en ERPNext (`custom_dim_1`). **Nunca lo muestres en la UI ni
lo uses en ninguna llamada — es un detalle de implementación.** En todo el resto del sistema (ver
§5 en adelante) siempre se habla en términos de `codigo`, nunca de `campo`.

### 3.4 Sin espacios libres — 400

Cada dimensión de negocio ocupa uno de un número limitado de "espacios" que la empresa
provisionó al darse de alta (típicamente 4, tope 6 — es una decisión de infraestructura, no algo
que el usuario final controle). Si ya se usaron todos:

```jsonc
{ "statusCode": 400, "message": "No quedan espacios de dimensión libres en esta empresa. Ampliarlos es una tarea de mantenimiento programada — contacte a soporte." }
```

> ⚠️ Es `400`, no `409` — cualquier `frappe.throw()` del lado de ERPNext (que es como está
> implementada esta validación) siempre llega como `400 Bad Request` a través del BFF, nunca como
> `409 Conflict` (ese código queda reservado para conflictos reales de concurrencia/estado, no
> para este caso). Si en algún momento ves documentación o un comentario en el código del backend
> que diga "409" para este caso puntual, es una descripción aspiracional que no coincide con el
> comportamiento real medido — priorizá siempre lo que efectivamente responde el servidor (o el
> `openapi.json`) sobre cualquier texto descriptivo.

Mostrá este mensaje tal cual — no es un error de formulario, es una limitación real de
infraestructura del tenant. No ofrezcas un botón de "reintentar", ofrecé un canal de soporte.
Podés usar `meta.espaciosLibres` del listado (§3.2) para deshabilitar proactivamente el botón
"Nueva dimensión" con un tooltip explicando esto, en vez de dejar que el usuario llene el
formulario y se entere recién al guardar.

### 3.5 No hay borrado — solo `toggle`

**No existe `DELETE`.** Una dimensión usada queda escrita permanentemente en el libro de
inventario — borrarla dejaría el histórico apuntando a algo que ya no existe, y (aunque esto es un
detalle interno) el espacio físico nunca se recicla ni siquiera si se "da de baja". El único botón
que hay que ofrecer es **Activar/Desactivar** (`POST .../:codigo/toggle`, sin body, alterna el
estado actual):

```jsonc
// Response
{ "success": true, "data": { "codigo": "marca", "etiqueta": "Marca", "tipo": "Categorica", "dimensionPadre": undefined, "espacio": 1, "activo": false, "orden": 0 } }
```

**No construyas un ícono de basurero/eliminar para esta pantalla.** El texto de confirmación
sugerido para desactivar:

> *"¿Desactivar «Marca»? Los artículos que ya la usan seguirán funcionando con su configuración
> actual. No podrás usarla en artículos nuevos hasta reactivarla."*

**Actualizar (`PUT .../:codigo`) solo acepta `etiqueta` y `orden`** — cualquier otro campo que
mandes se ignora. Si el body queda vacío (ningún campo reconocido), el servidor responde:

> `Solo se pueden cambiar la etiqueta y el orden: el código y el espacio quedan fijos desde que la dimensión se crea.`

### 3.6 Valores de una dimensión y jerarquía en cascada

`GET /catalog/dimensiones-inventario/:codigo/valores` — query params: `limit`, `offset` (paginado
estándar), `padre` (opcional), `search` (opcional, búsqueda libre por texto del valor).

```jsonc
// GET .../modelo/valores?padre=MARCA-HONDA
{
  "success": true,
  "data": [
    { "id": "MODELO-CIVIC", "valor": "Civic", "padre": "MARCA-HONDA", "ordenNumerico": undefined, "activo": true }
  ],
  "meta": { "limit": 50, "offset": 0 }
}
```

**Esto es lo que habilita los selectores en cascada** (elegir "Honda" en el selector de Marca y
que el selector de Modelo solo ofrezca Civic/Accord, no Corolla/Camry): cuando el usuario elige un
valor en una dimensión que es padre de otra (`dimensionPadre`), volvé a pedir
`GET .../:codigoHijo/valores?padre=<idDelValorElegido>` para poblar el selector siguiente. Si el
usuario cambia el valor del padre después de haber elegido un valor en el hijo, **limpiá la
selección del hijo** — no dejes una combinación huérfana armada en el formulario (el servidor la
va a rechazar igual, ver §11, pero es mejor UX prevenirlo).

**Crear un valor** — `POST .../:codigo/valores`:

```jsonc
{ "valor": "Honda", "id": "MARCA-HONDA", "padre": undefined, "ordenNumerico": undefined }
```

- `valor`: el texto visible, obligatorio.
- `id`: opcional — si se omite, el servidor genera uno a partir de la dimensión y el valor. Si tu
  UI no necesita controlar el id manualmente, omitilo y dejá que el servidor lo resuelva.
- `padre`: **el `id` de un valor de la dimensión PADRE**, no el código de la dimensión. Solo tiene
  sentido si esta dimensión declaró `dimensionPadre` al crearse.
- `ordenNumerico`: solo relevante si la dimensión es `tipo: "Ordinal"` (ej. el año como número
  para poder comparar rangos en las reglas de combinación, §4.3).

**Editar un valor** — `PUT /catalog/dimensiones-inventario/valores/:id` — acepta `valor`, `padre`,
`ordenNumerico`, `activo`. **El `id` nunca se puede cambiar** (queda escrito en cada movimiento
histórico) — para "renombrar" de verdad un valor, creá uno nuevo y desactivá el viejo con
`activo: false` (tampoco hay `DELETE` para valores).

**Error de jerarquía inconsistente** (padre de otra dimensión, valor con padre cuando la dimensión
no tiene `dimensionPadre`, ciclos en la cadena marca→modelo→marca): el servidor lo rechaza al
crear/editar la dimensión o el valor con un mensaje 400 — mostralo tal cual, son casos de
configuración poco frecuentes que no necesitan un manejo especial en la UI más allá de mostrar el
error.

---

## 4. El artículo declara sus dimensiones — Catálogo → Artículos

En la ficha de creación/edición de un artículo (`POST`/`PUT /catalog/items`), agregá un bloque
nuevo, colapsable, llamado **"Dimensiones de inventario"** — a propósito con ese nombre completo,
nunca "Dimensiones" a secas: la palabra "dimensión" también nombra a las dimensiones CONTABLES
(Sucursal, Departamento) que probablemente ya tenés en otras pantallas, y hay que evitar que un
usuario confunda ambos conceptos. Las contables se siguen llamando por su nombre propio en todos
lados (Sucursal, Departamento) — nunca "Dimensiones" tampoco.

**Solo mostrá este bloque si el artículo es de tipo Producto y NO es una plantilla de variantes ni
una variante** (ver exclusiones en §4.4). Si el tenant no tiene ninguna dimensión creada todavía
(§3), no muestres el bloque en absoluto — mandá al usuario a crear al menos una dimensión primero.

### 4.1 Request — crear/editar un artículo

Se agregan dos campos opcionales al body de `POST /catalog/items` y `PUT /catalog/items/:id` (los
demás campos del artículo no cambian):

```jsonc
{
  // ...todos los campos de artículo que ya conocés...
  "dimensiones": [
    { "dimension": "marca", "valoresPermitidos": ["MARCA-HONDA", "MARCA-TOYOTA"] },
    { "dimension": "modelo" },
    { "dimension": "anio" }
  ],
  "reglasCombinacion": [
    { "valores": { "marca": "MARCA-HONDA", "modelo": "MODELO-CIVIC" }, "desde": 1996, "hasta": 2000 }
  ]
}
```

**`dimensiones` — array de dimensiones que este artículo usa:**

| Campo | Tipo | Obligatorio | Notas |
|---|---|---|---|
| `dimension` | string | Sí | El `codigo` de una dimensión activa de la empresa (§3) |
| `valoresPermitidos` | array de strings | No | Ids de valores permitidos para ESTE artículo en esa dimensión. Vacío/omitido = cualquier valor activo de la dimensión sirve |

⚠️ **El ORDEN de este array importa y es permanente.** El servidor traduce internamente la
posición de cada dimensión en este array a una columna física — eso significa que **el orden en
que mandás las dimensiones la primera vez que se guardan queda fijo para las reglas de
combinación** (§4.3) de ese artículo específico. En la práctica esto no debería afectar tu UI en
absoluto (nunca hablás de posiciones, siempre de `codigo`), pero si tu formulario permite
reordenar las dimensiones de un artículo ya guardado con arrastrar-y-soltar, tené en cuenta que
eso es un cambio real de configuración — y por la regla de inmutabilidad (§0.3) **no se puede
hacer si el artículo ya tiene movimientos**, exactamente igual que agregar o quitar una dimensión.

**`reglasCombinacion` — lista blanca opcional de combinaciones válidas:**

Sin ninguna regla, **cualquier combinación de los `valoresPermitidos` de cada dimensión es
válida** (producto cartesiano). Con al menos una regla, la combinación elegida en un documento
tiene que cumplir **al menos una** de las reglas declaradas.

| Campo | Tipo | Obligatorio | Notas |
|---|---|---|---|
| `valores` | objeto `{codigo: idDeValor}` | No | Fija un valor exacto para esa dimensión en esta regla. Una dimensión ausente de este objeto es COMODÍN ("cualquier valor") en esta regla particular |
| `desde` | number | No | Solo tiene efecto en la dimensión `tipo: "Ordinal"` del artículo (ej. año) |
| `hasta` | number | No | Idem |
| `activo` | boolean | No, default `true` | Poné `false` para desactivar una regla sin borrarla |

**Ejemplo real de uso** (el caso de autopartes que motivó esta funcionalidad): el artículo "Puerta"
declara `marca`, `modelo`, `anio`. Sin reglas, alguien podría elegir "Toyota + Civic" (Civic es un
modelo Honda) — la jerarquía del catálogo (§3.6, `dimensionPadre`) ya lo impide sin que hagas
nada. Las reglas de combinación son para casos MÁS finos: "esta puerta específica solo sirve para
Honda Civic entre 1996 y 2000, o para cualquier Toyota entre 2000 y 2005":

```jsonc
"reglasCombinacion": [
  { "valores": { "marca": "MARCA-HONDA", "modelo": "MODELO-CIVIC" }, "desde": 1996, "hasta": 2000 },
  { "valores": { "marca": "MARCA-TOYOTA" }, "desde": 2000, "hasta": 2005 }
]
```

**Recomendación de UX para esta sub-pantalla:** es una tabla/grilla dentro del formulario del
artículo, no una pantalla aparte. Una fila por regla, con un selector por cada dimensión declarada
(vacío = comodín, mostralo como "Cualquiera") y, si el artículo tiene una dimensión ordinal, dos
inputs numéricos (desde/hasta) que solo aparecen para esa dimensión.

### 4.2 Response — qué te devuelve el servidor

`GET /catalog/items/:id` (y también la respuesta de `POST`/`PUT`) agrega estos campos al objeto
del artículo:

```jsonc
{
  // ...todos los campos de artículo que ya conocés...
  "usaDimensiones": true,
  "dimensiones": [
    { "dimension": "marca", "valoresPermitidos": ["MARCA-HONDA", "MARCA-TOYOTA"] },
    { "dimension": "modelo", "valoresPermitidos": [] },
    { "dimension": "anio", "valoresPermitidos": [] }
  ],
  "reglasCombinacion": [
    { "valores": { "marca": "MARCA-HONDA", "modelo": "MODELO-CIVIC" }, "desde": 1996, "hasta": 2000, "activo": true }
  ]
}
```

- `usaDimensiones`: **calculado por el servidor** — `true` si `dimensiones` tiene al menos una
  fila, `false` si no. **Nunca lo mandes en el request** (`POST`/`PUT`) — es de solo lectura, el
  servidor lo ignora si lo mandás. Usalo en toda la app como el interruptor que decide "¿esta
  pantalla debe pedir la combinación para este artículo?" (ver §5).
- `dimensiones[].valoresPermitidos`: siempre vas a recibir un array (posiblemente vacío `[]`, no
  `undefined`), a diferencia del request donde podés omitirlo.
- `dimensionEtiqueta`, `dimension.etiqueta` — **el response NO incluye la etiqueta legible de cada
  dimensión, solo el `codigo`.** Tenés que resolverla vos mismo cruzando contra el catálogo de
  dimensiones (§3.2) que ya deberías tener cacheado en memoria/store al iniciar la sesión o al
  entrar a esta pantalla. No esperes un campo de etiqueta embebido acá — no existe hoy.
- `reglasCombinacion[].valores`: usa el mismo `codigo` de dimensión como clave, no una posición
  numérica — a pesar de que internamente el servidor lo traduce por posición (§4.1), la API nunca
  te expone eso.

### 4.3 Selectores en cascada al elegir la combinación de un artículo (en cualquier línea de
### documento)

Cuando el usuario elige un artículo con `usaDimensiones: true` en CUALQUIER pantalla que arma una
línea de documento (Compras, Facturación, Pedidos, etc. — ver §5), el artículo ya trae consigo
`dimensiones` y `reglasCombinacion` en su respuesta de `GET /catalog/items/:id` (o en el resultado
del picker/autocomplete de artículos, si ya incluye estos campos) — **no hace falta una segunda
llamada** para saber qué dimensiones pedir y con qué restricciones.

Arma el formulario de combinación así:

1. Por cada fila de `item.dimensiones`, mostrá un selector con la etiqueta de esa dimensión
   (resuelta contra el catálogo, §4.2) y, como opciones, los valores ACTIVOS de esa dimensión
   filtrados por `valoresPermitidos` si la lista no está vacía (si está vacía, todos los activos).
2. Si una dimensión tiene `dimensionPadre` (dato que sacás del catálogo de dimensiones, §3.2, no
   del artículo), su selector depende del valor elegido en la dimensión padre — pedí
   `GET .../:codigoHijo/valores?padre=<idElegido>` para poblarlo (§3.6).
3. Si el artículo tiene `reglasCombinacion`, podés (opcional, mejora de UX) filtrar en el cliente
   las combinaciones que no cumplen ninguna regla ANTES de someter — pero la autoridad real de
   esto es el servidor al someter el documento (§11), así que esto es solo para dar
   retroalimentación más rápida, nunca reemplaza la validación del servidor.
4. El resultado final que armás y mandás en la línea del documento es un objeto plano
   `{ [codigo]: idDelValor }` — ver §5.

### 4.4 Exclusiones — no dejes elegir dimensiones en estos casos

El servidor las rechaza igual, pero es mejor UX prevenirlas en el formulario:

| Situación | Por qué se excluye |
|---|---|
| El artículo es una plantilla de variantes (`hasVariants: true`) | Un artículo usa variantes O dimensiones, nunca ambas |
| El artículo es una variante (`variantOf` con valor) | Idem |
| El artículo es un Servicio (no de stock) | El desglose vive en el libro de inventario; un servicio no genera movimientos |
| El artículo tiene `trackingType: "batch"` (maneja lotes) | ERPNext no controla el cruce lote × combinación todavía — se excluye a propósito en esta versión |

Mensajes exactos que devuelve el servidor si se intenta igual:

> `Una plantilla de variantes no puede usar dimensiones de inventario: un artículo usa variantes o dimensiones, no las dos.`
>
> `Una variante no puede usar dimensiones de inventario.`
>
> `Un artículo con lotes no puede usar dimensiones de inventario todavía: ERPNext no controla el cruce lote × combinación.`

**Recomendación de UX**: en el formulario del artículo, ocultá o deshabilitá el bloque
"Dimensiones de inventario" completo si `type !== "product"`, si `hasVariants` está activo, si
`variantOf` tiene valor, o si `trackingType === "batch"` — con un tooltip explicando cuál de estas
4 condiciones aplica.

### 4.5 Inmutabilidad — el artículo ya tiene movimientos

Si alguien intenta cambiar la configuración de dimensiones (agregar, quitar, o cambiar
`valoresPermitidos` de forma que excluya una combinación con saldo) de un artículo que **ya tuvo
al menos un movimiento de inventario en toda su historia** (aunque el saldo actual sea cero, aunque
el movimiento esté cancelado, aunque sea solo un documento sometido que todavía no generó el
movimiento en sí — como una orden de compra sin recibir), el servidor lo rechaza:

> `El artículo {itemCode} ya tiene movimientos de inventario, así que su configuración de dimensiones no se puede cambiar: el histórico quedó escrito con la configuración anterior y no se puede reinterpretar. Cree un artículo nuevo con la configuración que necesita.`

**Cómo manejarlo en la UI:**

- Si el artículo YA tiene `usaDimensiones: true` y ya tiene stock/movimientos (podés chequear esto
  con `GET /catalog/items/:id/stock` o simplemente con el campo `currentStock`/`enPedido` que ya
  te devuelve el detalle del artículo, si es mayor que cero o si hay historial), **deshabilitá la
  edición del bloque completo de dimensiones** en el formulario, con un texto explicando por qué:

  > *"Este artículo ya tiene movimientos de inventario — su configuración de dimensiones no se
  > puede modificar. Si necesita manejar otras dimensiones, cree un artículo nuevo."*

- Ojo: **"stock actual en cero" no es lo mismo que "sin movimientos".** Un artículo que se vendió
  y volvió a cero SÍ tiene historia y NO se puede reconfigurar — no uses `currentStock === 0` como
  criterio para habilitar la edición. Si no tenés una forma confiable de saber de antemano si el
  artículo tiene historia, la alternativa más simple es: **dejá que el usuario intente guardar y
  mostrá el mensaje del servidor tal cual** si lo rechaza — es aceptable para una primera entrega,
  el mensaje ya está redactado para el usuario final.
- **Un artículo NUEVO (sin guardar todavía) siempre puede declarar dimensiones libremente** — la
  restricción es solo sobre ediciones de un artículo ya existente con historia.

---

## 5. El contrato `dimensiones` en una línea de documento — patrón universal

Esta es la pieza que se repite, con el mismo shape exacto, en Compras, Recepciones, Órdenes de
Compra, Facturación, Pedidos, Cotizaciones, Despachos y Transferencias (el detalle específico de
cada endpoint está en §6-§8, pero el CONTRATO del campo es siempre este mismo):

```jsonc
{
  "itemCode": "PUERTA-VEHICULO",
  "qty": 5,
  "rate": 1200,
  // ...los demás campos que ya conocés de esa línea...
  "dimensiones": { "marca": "MARCA-HONDA", "anio": "ANIO-2000" }
}
```

- **Clave**: el `codigo` de la dimensión (§3), tal como aparece en `item.dimensiones[].dimension`
  del artículo (§4.2) — nunca el nombre físico interno (`custom_dim_1`), que no existe en ningún
  contrato de la API.
- **Valor**: el `id` del valor elegido (ej. `"MARCA-HONDA"`, no `"Honda"`).
- **Es un objeto plano por línea** — un objeto `dimensiones` por CADA línea del documento, no uno
  a nivel de cabecera. El mismo artículo puede aparecer en dos líneas distintas con dos
  combinaciones distintas (ver la regla de "línea, no artículo" en §10.3).
- **Es OPCIONAL a nivel de tipo** en todos los DTOs (`class-validator` no lo exige a nivel de
  forma), pero es **obligatorio en la práctica** para cualquier línea de un artículo con
  `usaDimensiones: true` que mueva stock — si falta, el servidor rechaza esa línea (§11). Para un
  artículo sin dimensiones, simplemente no lo mandes (u omitilo).
- **Un código de dimensión que no existe en el catálogo activo del tenant es un 400 inmediato**,
  nunca se ignora en silencio. Mensaje exacto:

  > `«{codigo}» no es una dimensión de inventario de esta empresa. Disponibles: {lista separada por coma}.`

  Esto NO debería pasar nunca si tu UI arma el objeto `dimensiones` a partir de
  `item.dimensiones[].dimension` (§4.3) en vez de un valor hardcodeado — pero si alguna vez ves
  este error, es señal de un bug de sincronización entre lo que el catálogo de artículos declara y
  lo que mandás.

### 5.1 Regla de UI — dos líneas, mismo artículo, misma combinación

**Fusioná automáticamente dos líneas del mismo artículo con la MISMA combinación exacta en una
sola línea con la cantidad sumada**, antes de someter. Esto no es solo una cuestión de prolijidad:
dos líneas separadas de la misma combinación en el mismo documento pueden burlar el control de
stock negativo del servidor si juntas exceden el disponible (el servidor SÍ agrega correctamente
al validar la disponibilidad del documento completo — no vas a corromper datos — pero es más
prolijo y más rápido de entender para el usuario si tu UI ya llega con las líneas fusionadas en
vez de dejar que el servidor te devuelva un único error de "no hay suficiente stock" sobre la suma
sin que el usuario entienda por qué sus dos líneas separadas sumaban demasiado).

### 5.2 Regla de UI — no hay "combinación de destino" salvo en un caso

En una transferencia entre almacenes (§8.1), el usuario elige la combinación **una sola vez** por
línea — la misma combinación sale del origen y entra en el destino. **No hay un segundo selector
de "combinación de destino"** salvo en la pantalla dedicada de Reclasificación (§8.6), que es
justamente la única operación diseñada para cambiar la combinación de una cantidad ya existente.

---

## 6. Módulo Compras

### 6.1 Compras (Purchase Invoice con afectación de inventario) — `POST/PUT /compras`

Agregá `dimensiones` (§5) a cada objeto de `items[]` del request de `POST /compras` y
`PUT /compras/:id`. Sin cambios en la response del documento (los campos de línea que ya conocés
siguen igual — el detalle de que la respuesta NO ecoa la combinación elegida está cubierto en
§10.2, leelo antes de asumir que podés releer la combinación desde `GET /compras/:id`).

⚠️ **Regla de edición (repetida de §0.4): en `PUT /compras/:id`, si reenviás el array `items[]`
completo (reemplaza todas las líneas), tenés que volver a mandar `dimensiones` en CADA línea que
la tenga — este endpoint específicamente NO tiene ningún mecanismo de conservación automática. Si
la omitís en una línea que antes la tenía, esa línea queda sin combinación y el servidor la
rechaza al guardar** (mensaje de §11, "Fila #N: indique «Marca»…").

### 6.2 Recepción de Mercancía (Purchase Receipt) — `POST/PUT /compras/purchase-receipt`

Mismo patrón exacto que §6.1: `dimensiones` en cada línea de `POST` y `PUT`, mismo criterio de
"resend siempre en cada edición" (tampoco tiene conservación automática acá).

### 6.3 Órdenes de Compra — `POST/PUT /compras/ordenes`, `POST /compras/ordenes/:id/recibir`

- **Al crear/editar la orden** (`POST`/`PUT /compras/ordenes`): `dimensiones` en cada línea de
  `items[]`, mismo patrón, sin conservación automática en `PUT`.
- **Al recibir la mercancía** (`POST /compras/ordenes/:id/recibir`): **no hace falta volver a
  pedirle la combinación al usuario** — el servidor la arrastra automáticamente de la línea de la
  orden a la recepción resultante, sin que el frontend haga nada. El body de este endpoint acepta
  un array `items[]` opcional (solo si el usuario quiere recibir parcialmente o ajustar
  cantidades/almacén de líneas puntuales, identificadas por `purchaseOrderItem`), y CADA objeto de
  ese array acepta también un `dimensiones` **opcional** — mandalo únicamente si el usuario está
  **corrigiendo explícitamente** una combinación mal elegida al ordenar. En el caso normal (recibir
  tal como se ordenó), no incluyas el campo y la combinación de la orden se preserva sola.

  ```jsonc
  // POST /compras/ordenes/:id/recibir
  {
    "items": [
      { "purchaseOrderItem": "abc123", "qty": 3, "dimensiones": { "marca": "MARCA-HONDA", "anio": "ANIO-2001" } }
    ]
  }
  ```

  Este `dimensiones` en el override es la ÚNICA excepción a la regla general de "resend siempre":
  acá es opcional A PROPÓSITO porque hay un arrastre automático real (no una heurística frágil
  como en facturas/pedidos, sino una copia literal de campo homónimo que hace ERPNext) — mandalo
  solo cuando el usuario decide corregir.
- `POST /compras/ordenes/:id/facturar` (facturar sin recibir) **no acepta ni necesita**
  `dimensiones` en su override — no genera movimiento de inventario (`update_stock: 0`), así que
  no hay combinación que validar ahí. Cualquier `dimensiones` que la orden ya tuviera se arrastra
  igual a la factura resultante sin que el frontend intervenga.

### 6.4 Devoluciones de Compra — `POST/PUT /devoluciones-compras`

**Acá el patrón es distinto: nunca se le pide la combinación al usuario.** La devolución de compra
siempre copia automáticamente la combinación de la línea original de la factura que se está
devolviendo — el hook del servidor exige que sea exactamente la misma (no se puede devolver "otra
combinación" del mismo artículo). Lo único que el frontend tiene que resolver es **identificar
correctamente cuál línea de la factura original se está devolviendo**, con el nuevo campo
`lineaOriginal`:

```jsonc
// POST /devoluciones-compras
{
  "originalInvoice": "ACC-PINV-2026-00032",
  "postingDate": "2026-01-20",
  "items": [
    { "itemCode": "PUERTA-VEHICULO", "lineaOriginal": "abc123", "qty": 2 }
  ]
}
```

| Campo | Tipo | Obligatorio | Notas |
|---|---|---|---|
| `itemCode` | string | Sí | Como siempre |
| `lineaOriginal` | string | **Condicional — ver abajo** | El `name` (id de fila) de la línea de la factura ORIGINAL que se devuelve |
| `qty` | number | Sí | Siempre positiva, el servidor la hace negativa internamente |

⚠️ **Regla crítica, no obvia:** si el `itemCode` que estás devolviendo aparece en **más de una
línea** de la factura original (por ejemplo, "PUERTA-VEHICULO" se vendió como Honda/2000 en una
línea y como Toyota/2001 en otra dentro de la MISMA factura), **`lineaOriginal` pasa a ser
obligatorio** — sin él, el servidor responde 400:

> `El artículo "{itemCode}" aparece en {N} líneas de la factura original {originalInvoice} — indique "lineaOriginal" (name de la línea) para desambiguar.`

Si el `itemCode` es único en toda la factura original, podés omitir `lineaOriginal` y el servidor
lo resuelve solo (retrocompatible con cómo funcionaba esto antes de esta funcionalidad).

**Cómo conseguir el `name` de cada línea para armar `lineaOriginal`:** el detalle de la factura
original (`GET /compras/:id`) te devuelve las líneas — necesitás que ese endpoint incluya el `name`
interno de cada fila. **Si hoy tu UI de "elegir qué devolver" ya lista las líneas de la factura
original una por una** (en vez de un selector de artículos a secas), lo natural es que cada fila
de esa lista YA sea la unidad que el usuario selecciona — guardá el identificador de esa fila (que
el backend expone como parte del detalle del documento) y mandalo como `lineaOriginal` sin
pedirle nada más al usuario. **Si tu UI de devoluciones hoy es un selector de "artículo + cantidad"
a secas (sin distinguir entre líneas del mismo artículo), este es el momento de migrarla a un
selector por LÍNEA de la factura original** — es la única forma correcta de manejar el caso de
dos combinaciones del mismo artículo en la misma factura, y de paso corrige un bug que ya existía
antes de esta funcionalidad con artículos duplicados por otras razones (precio distinto, lote
distinto).

**`PUT /devoluciones-compras/:id`** (editar una devolución en Draft) sigue el mismo patrón:
`items[]` acepta `itemCode` + `lineaOriginal` opcional/condicional + `qty`, con la misma regla de
ambigüedad.

**La combinación NUNCA se muestra como campo editable en el formulario de devolución** — ni
siquiera de solo lectura, hoy la respuesta no la expone (§10.2). El usuario elige QUÉ LÍNEA
devolver (por artículo+lote+precio+combinación, lo que tu UI ya distinga) y CUÁNTO — la
combinación viaja sola por dentro.

---

## 7. Módulo Ventas

### 7.1 Facturación (Sales Invoice) — `POST/PUT /invoices`

`dimensiones` (§5) en cada objeto de `items[]`.

**Este SÍ tiene un intento de conservación automática en `PUT /invoices/:id`** — si una línea no
cambió (mismo `itemCode`, `qty`, `rate`, `discountPct`, `discountAmount` que la línea ya guardada),
el servidor conserva su combinación aunque no mandes `dimensiones` en esa línea. **No confíes en
esto de todas formas** (§0.4): es una comparación exacta de esos 5 valores — si cambiás CUALQUIERA
de ellos (incluso un descuento) en una línea con combinación, y no volvés a mandar `dimensiones`,
la combinación se pierde y el guardado falla con el error de §11. **Mandá `dimensiones` en todas
las líneas con combinación, siempre, en cada `PUT`.**

### 7.2 Pedidos — `POST/PUT /pedidos`, `POST /pedidos/:id/submit`

`dimensiones` en cada línea de `items[]`, mismo patrón que Facturación (con conservación
automática igual de frágil en `PUT` — mismo criterio: siempre resend). Al someter el pedido
(`POST /pedidos/:id/submit`) no hay que mandar nada adicional — el pedido ya sometido conserva la
combinación de cada línea.

**Al facturar un pedido** (conversión pedido → factura, y al facturar un Apartado —
`POST /pedidos/:id/facturar-apartado`) **no hay que pedirle la combinación al usuario de nuevo**:
se arrastra automáticamente de la línea del pedido a la factura resultante.

Ver §9 para el cambio de comportamiento específico de **Apartados** con artículos de dimensiones
— no cambia ningún contrato de request/response del lado de Pedidos, pero cambia lo que pasa por
dentro y hay una nueva condición de error a manejar (§9.3).

### 7.3 Cotizaciones — `POST/PUT /quotations`, conversión a Pedido/Factura

`dimensiones` en cada línea de `items[]` de `POST`/`PUT /quotations`. Al aceptar la cotización
(convertirla en Pedido) o al facturarla directo, la combinación se arrastra sola — no hay que
pedirla de nuevo.

⚠️ Acá la "conservación automática" en `PUT /quotations/:id` es **todavía menos confiable** que en
Facturación/Pedidos: si mandás el array `items[]` completo (reemplazándolo), la heurística de
conservación del servidor NO funciona línea por línea de forma confiable en ese caso — solo
funciona bien cuando el `PUT` no toca `items` en absoluto (edición de solo cabecera, ej. cambiar
la moneda o la fecha de validez). **Si tu formulario de edición de cotización reemplaza el array
completo de líneas en cualquier `PUT` (incluso si el usuario solo tocó el encabezado), mandá
`dimensiones` en cada línea siempre que la tenga, sin excepción.**

### 7.4 Despachos (Delivery Note) — `POST/PUT /despachos`

`dimensiones` en cada línea, tanto en la creación directa (venta mostrador con despacho
habilitado, `POST /despachos`) como en la edición (`PUT /despachos/:id`). La creación **desde**
un Pedido o una Factura ya existente (`POST /despachos/desde-pedido/:soId`,
`POST /despachos/desde-factura/:siId`) arrastra la combinación sola — no pidas nada ahí.

`PUT /despachos/:id` sí intenta conservar la combinación de una línea no tocada, mirando el
`itemCode` de la línea existente — pero si el despacho tiene dos líneas del mismo artículo con
combinaciones distintas, la heurística puede confundirse y tomar la línea equivocada. Mismo
criterio universal: **mandá `dimensiones` en cada línea siempre.**

### 7.5 Notas de Crédito — `POST /credit-notes`

**Mismo patrón que Devoluciones de Compra (§6.4): nunca se pide la combinación, se copia sola de
la línea original de la factura.** Se agrega `lineaOriginal` a cada línea:

```jsonc
{
  "originalInvoice": "SINV-0042",
  "items": [
    { "itemCode": "PUERTA-VEHICULO", "lineaOriginal": "row-xyz", "qty": 1 }
  ]
}
```

Idéntica regla de ambigüedad que §6.4: si `itemCode` aparece en más de una línea de la factura
original, `lineaOriginal` es obligatorio o el servidor responde 400:

> `El artículo "{itemCode}" aparece en {N} líneas de la factura original — indique "lineaOriginal" (sales_invoice_item) para desambiguar.`

Si `lineaOriginal` no corresponde a ninguna línea real de esa factura:

> `La línea "{lineaOriginal}" no existe en la factura original "{originalInvoice}".`

**No existe `PUT` para Notas de Crédito** (no hay edición de líneas después de crearla en Draft
más allá de lo que ya sabías) — esta regla de `lineaOriginal` aplica únicamente a la creación.

---

## 8. Inventario

### 8.1 Transferencias entre almacenes — `POST /transferencias`

`dimensiones` en cada objeto de `items[]`. **La misma combinación se usa para todo el trayecto de
la transferencia** (tramo de salida y tramo de confirmación de llegada — dos llamadas separadas
que ya conocés, `POST /transferencias` y `POST /transferencias/:id/confirmar`) — **el segundo
tramo (`/confirmar`) no necesita ni acepta que le vuelvas a mandar la combinación**, se conserva
sola internamente entre ambos tramos.

```jsonc
{
  "fromWarehouse": "ALM-01",
  "toWarehouse": "ALM-02",
  "items": [
    { "itemCode": "PUERTA-VEHICULO", "qty": 2, "dimensiones": { "marca": "MARCA-HONDA", "anio": "ANIO-2000" } }
  ]
}
```

No hay concepto de "cambiar de combinación durante la transferencia" — para eso existe la
pantalla dedicada de Reclasificación (§8.6), que es un movimiento distinto (mismo almacén de
origen y destino, ver esa sección).

### 8.2 Ubicaciones (racks/posiciones dentro de un almacén) — `distribuir`/`mover`

Si tu app ya implementa el módulo de Ubicaciones (mover stock del "pool sin ubicar" de un almacén
a un rack específico, o entre racks del mismo almacén), agregá `dimensiones` **opcional** a cada
línea de:

- `POST /inventory/ubicaciones/distribuir` — cada objeto de `items[]`.
- `POST /inventory/ubicaciones/mover` — a nivel del body (es una sola línea por llamada, no un
  array).

Mismo contrato `{ [codigo]: idDeValor }` de siempre. Es obligatorio en la práctica si el artículo
usa dimensiones (el servidor lo va a exigir igual, §11) — la ubicación física dentro de un almacén
es independiente de la combinación de inventario, pero el movimiento sigue necesitando saber CUÁL
combinación se está reubicando.

### 8.3 Consulta de stock por combinación — pantalla/widget nuevo

**Este es el reemplazo, para un artículo con dimensiones, de la columna simple de "Stock actual"**
que ya mostrás en el catálogo de artículos, en el detalle de venta, o en el POS. Para un artículo
que usa dimensiones, el stock total por sí solo no le dice al vendedor si hay o no la combinación
específica que el cliente pide — necesita este desglose.

`GET /inventory/items/:itemCode/stock-por-dimension`

| Query param | Tipo | Obligatorio | Notas |
|---|---|---|---|
| `warehouse` | string | No | Filtra a un almacén. Sin esto, trae todos los almacenes |
| `incluirSinEspecificar` | boolean | No, default `true` | Ver nota abajo |
| `limit` | number | No, default 50, máx 100 | Paginado estándar |
| `offset` | number | No, default 0 | Paginado estándar |
| **`<codigoDeDimension>`** | string | No | **Cualquier código de dimensión activa como filtro exacto** — ej. `?marca=MARCA-HONDA` |

⚠️ **Detalle técnico importante para cómo armás la llamada**: los filtros por dimensión son query
params **dinámicos** (el nombre del parámetro es el `codigo` de la dimensión, que varía por
tenant) — por eso **no van a aparecer como propiedades fijas en el `openapi.json`** para este
endpoint. Armalos vos mismo concatenando a la URL, ej.:
`?warehouse=ALM-01&marca=MARCA-HONDA&anio=ANIO-2000`. Un código que no sea una dimensión activa del
tenant responde 400 (mismo mensaje de §5) — no se ignora en silencio.

**Response:**

```jsonc
{
  "success": true,
  "data": {
    "itemCode": "PUERTA-VEHICULO",
    "dimensiones": [ { "codigo": "marca", "etiqueta": "Marca" }, { "codigo": "anio", "etiqueta": "Año" } ],
    "total": 24,
    "sinEspecificar": 0,
    "items": [
      { "warehouse": "ALM-01", "valores": { "marca": { "id": "MARCA-HONDA", "etiqueta": "MARCA-HONDA" }, "anio": { "id": "ANIO-2000", "etiqueta": "ANIO-2000" } }, "disponible": 5 },
      { "warehouse": "ALM-01", "valores": { "marca": { "id": "MARCA-HONDA", "etiqueta": "MARCA-HONDA" }, "anio": { "id": "ANIO-2001", "etiqueta": "ANIO-2001" } }, "disponible": 8 }
    ]
  },
  "meta": { "limit": 50, "offset": 0, "totalRegistros": 2 }
}
```

- `dimensiones`: la lista de dimensiones activas de la empresa (con `etiqueta` legible — este
  bloque de cabecera SÍ trae la etiqueta, a diferencia de lo de abajo).
- `total`: el stock TOTAL del artículo en el/los almacén(es) consultado(s) — para que puedas
  cuadrar visualmente que la suma del desglose (`items[].disponible`) más `sinEspecificar` da
  exactamente esto.
- `sinEspecificar`: cantidad que existe en el sistema sin una combinación completa asociada — en
  la práctica, para un artículo dimensionado desde el día uno (que es como se espera que se
  trabaje, ver §0.3), esto debería ser siempre `0`. Si ves un número distinto de cero acá, es una
  señal de un problema de datos (un movimiento que entró sin la combinación completa por alguna
  vía no prevista), no un estado normal — considerá resaltarlo visualmente si aparece.
- `items[].valores[codigo]`: **⚠️ `etiqueta` acá es hoy literalmente igual al `id`** (ej.
  `{ "id": "MARCA-HONDA", "etiqueta": "MARCA-HONDA" }`) — el servidor **todavía no resuelve** la
  etiqueta legible real ("Honda") en este endpoint. **Tenés que resolverla vos mismo** cruzando
  `id` contra tu caché de `GET /catalog/dimensiones-inventario/:codigo/valores` (§3.6) para
  mostrar "Honda" en vez de "MARCA-HONDA" en la grilla. No asumas que `etiqueta` ya viene lista
  para mostrar tal cual — hoy no lo está.
- **Nunca vas a ver un monto ni un costo por combinación acá** — es una decisión de producto
  explícita (§0): el costo de una combinación es el costo promedio de TODO el artículo en ese
  almacén, mostrarlo por combinación sería engañoso. No pidas ni muestres un campo de valor/costo
  en esta pantalla.

**Recomendación de UX**: no lo muestres en la grilla de búsqueda general de artículos (sería una
llamada extra por fila, cara si hay muchos resultados) — pedilo **al elegir** un artículo
específico en una línea de venta/POS/compra, o como una pestaña/acordeón dedicado en el detalle
del artículo en Catálogo.

### 8.4 Verificación previa de disponibilidad — `POST /inventory/stock-por-dimension/verificar`

Uso sugerido: justo antes de someter una venta/factura/POS con líneas de artículos dimensionados,
para avisar de un faltante ANTES de que el servidor lo rechace al someter — mejor experiencia que
dejar que el submit falle recién al final.

```jsonc
// Request
{
  "lineas": [
    { "itemCode": "PUERTA-VEHICULO", "warehouse": "ALM-01", "dimensiones": { "marca": "MARCA-HONDA", "anio": "ANIO-2000" }, "qty": 99 }
  ]
}
```

```jsonc
// Response — SOLO lista las combinaciones que NO alcanzan (agregadas si el mismo artículo+
// almacén+combinación aparece en más de una línea del mismo request)
{
  "success": true,
  "data": [
    { "itemCode": "PUERTA-VEHICULO", "warehouse": "ALM-01", "solicitado": 99, "disponible": 5, "valores": { "custom_dim_1": "MARCA-HONDA", "custom_dim_2": "ANIO-2000" } }
  ]
}
```

⚠️ **No intentes interpretar las claves de `valores` en la respuesta** — son nombres de campo
internos del servidor (`custom_dim_1`, no `marca`), no los códigos de dimensión de negocio. **Para
saber a cuál de TUS líneas corresponde cada faltante, matcheá por `itemCode` + `warehouse`** contra
las líneas que vos mismo mandaste en el request (ya sabés qué `dimensiones` le pusiste a cada
una) — no decodifiques `valores` de la respuesta para mostrar la combinación al usuario, usá la
que ya tenías en tu propio estado del formulario.

Un array vacío `[]` significa que todo alcanza — no hay faltantes.

**Este endpoint es solo un aviso — nunca bloquea nada por sí solo.** La autoridad final sigue
siendo el servidor al someter el documento real (Factura, Despacho, etc.) — mostralo como una
advertencia ("Atención: solo hay 5 de las 99 unidades solicitadas de esta combinación") con opción
de que el usuario decida seguir igual (y que el submit real del documento lo rechace si
corresponde) o corregir la cantidad antes de continuar.

### 8.5 Ajuste de combinación — pantalla/acción nueva

**Reemplaza al Conteo/Ajuste de Inventario que ya tenés, mostrado específicamente para artículos
con dimensiones** — porque el Conteo estándar (Stock Reconciliation) NO funciona para artículos
dimensionados (el servidor lo rechaza de plano, ver la nota de exclusión en §11). Esta es la
**única** forma de corregir el saldo de una combinación puntual.

`POST /inventory/ajustes-dimension` — permiso `inventario.ajustar`.

```jsonc
// Request
{
  "itemCode": "PUERTA-VEHICULO",
  "warehouse": "ALM-01",
  "dimensiones": { "marca": "MARCA-HONDA", "anio": "ANIO-2000" },
  "cantidadFinal": 7,
  "postingDate": "2026-01-20",
  "remarks": "Conteo físico de fin de mes",
  "branch": "Principal"
}
```

| Campo | Tipo | Obligatorio | Notas |
|---|---|---|---|
| `itemCode` | string | Sí | — |
| `warehouse` | string | Sí | — |
| `dimensiones` | objeto `{codigo: id}` | **Sí, y NO puede venir vacío** | La combinación EXACTA y COMPLETA a ajustar — todas las dimensiones que declara el artículo |
| `cantidadFinal` | number | Sí, `≥ 0` | **La cantidad final deseada de ESA combinación — NO la diferencia.** El servidor calcula la diferencia internamente |
| `postingDate` | string (fecha) | No, default hoy | — |
| `remarks` | string | No | Si se omite, el servidor genera una nota automática describiendo el ajuste |
| `branch` | string | No | Misma cascada automática de sucursal que ya conocés de otras pantallas de inventario |

⚠️ **`cantidadFinal` es el número final, como en un conteo — no cuánto sumar o restar.** El
formulario debería mostrarle al usuario el saldo ACTUAL de esa combinación (pedilo primero con
`GET /inventory/items/:itemCode/stock-por-dimension?warehouse=...&marca=...&anio=...`, §8.3, filtrando
por la combinación exacta) y dejar que ingrese cuál es el saldo real que debería haber — no un
delta. Mostrale también la diferencia calculada ("esto va a agregar 2 unidades" / "esto va a
restar 4 unidades") como confirmación antes de someter, restando `cantidadFinal` menos lo que ya
sabés que hay.

**Response exitosa:**

```jsonc
{
  "success": true,
  "data": { "id": "MAT-STE-2026-00099", "tipo": "Material Receipt", "itemCode": "PUERTA-VEHICULO", "warehouse": "ALM-01", "qty": 2, "postingDate": "2026-01-20", "branch": "Principal", "remarks": "..." }
}
```

- `tipo`: `"Material Receipt"` si la cantidad final es MAYOR a la actual (se agregó stock),
  `"Material Issue"` si es MENOR (se restó). Mostralo en el historial/detalle como referencia.
- `qty`: siempre positiva — es la magnitud de la diferencia aplicada, no la cantidad final.

**Errores propios de esta pantalla:**

| Situación | Mensaje exacto |
|---|---|
| `dimensiones` vacío u omitido | `Debe indicar la combinación completa a ajustar en "dimensiones" — este endpoint es solo para artículos con dimensiones de inventario.` |
| `cantidadFinal` es exactamente igual al saldo actual | `La combinación ya tiene {N} unidades en "{warehouse}" — no hay diferencia que ajustar.` — deshabilitá el botón de submit si tu formulario ya conoce el saldo actual y el usuario no cambió el valor |
| Falta configurar la cuenta contable de ajuste | `No hay una cuenta de ajuste de inventario configurada (Company.stock_adjustment_account). Configúrela con PUT /api/v1/config/cuentas-empresa (campo "stockAdjustmentAccount") antes de ajustar una combinación.` — mismo requisito de configuración que ya deberías conocer si implementaste Carga Inicial de Inventario (`docs/frontend/PROMPT_CARGA_INICIAL_INVENTARIO_FRONTEND.md` §5) — **es la MISMA cuenta**, si ya la configuraste para esa pantalla, esta funciona sin pasos adicionales |

### 8.6 Reclasificación de combinación — pantalla/acción nueva

Corrige una combinación **mal elegida** en el mismo almacén, sin mover valuación — el caso típico
es "en mostrador se marcó esta puerta como Honda/2000 y en realidad era Honda/2001".

`POST /inventory/reclasificaciones` — permiso `inventario.reclasificar`.

```jsonc
{
  "itemCode": "PUERTA-VEHICULO",
  "warehouse": "ALM-01",
  "desde": { "marca": "MARCA-HONDA", "anio": "ANIO-2000" },
  "hacia": { "marca": "MARCA-HONDA", "anio": "ANIO-2001" },
  "qty": 2,
  "postingDate": "2026-01-20",
  "remarks": "Corrección: se había marcado el año equivocado",
  "branch": "Principal"
}
```

| Campo | Tipo | Obligatorio | Notas |
|---|---|---|---|
| `itemCode` | string | Sí | — |
| `warehouse` | string | Sí | El MISMO almacén para origen y destino — no hay traslado entre almacenes acá |
| `desde` | objeto `{codigo: id}` | Sí | La combinación actual (completa) |
| `hacia` | objeto `{codigo: id}` | Sí | La combinación nueva (completa) — **debe diferir de `desde` en al menos una dimensión** |
| `qty` | number | Sí, `> 0` | Cuánto reclasificar |
| `postingDate`, `remarks`, `branch` | — | No | Igual que §8.5 |

**Formulario sugerido**: dos bloques de selectores en cascada lado a lado ("Combinación actual" /
"Combinación nueva"), usando el mismo patrón de §4.3 para cada uno, con el mismo artículo. Traé el
saldo actual de la combinación "desde" con `GET .../stock-por-dimension` (§8.3) para mostrarle al
usuario cuánto hay disponible antes de que ingrese `qty`.

**Errores propios:**

| Situación | Mensaje exacto |
|---|---|
| `desde`/`hacia` vacíos u omitidos | `Debe indicar "desde" y "hacia" — este endpoint es solo para artículos con dimensiones de inventario.` |
| `desde` y `hacia` son exactamente la misma combinación | `"desde" y "hacia" son la misma combinación — no hay nada que reclasificar.` — deshabilitá el botón de submit si detectás esto en el cliente antes de llamar al servidor |

---

## 9. Apartados (Layaway) con artículos de dimensiones — comportamiento interno, no contrato

**Si ya implementaste Apartados** (`custom_is_layaway` en Pedidos, `docs/frontend/PROMPT_DESPACHO_RESERVAS_ABASTECIMIENTO_FRONTEND.md`
o el flujo equivalente que tengas), **no hay ningún cambio en el request/response del botón
"Apartar" ni de "Facturar apartado" ni de "Cancelar apartado"** — seguís llamando exactamente los
mismos endpoints de siempre (`POST /pedidos`, `POST /pedidos/:id/submit`,
`POST /pedidos/:id/facturar-apartado`, `POST /pedidos/:id/cancelar-apartado`) con el mismo shape,
más el campo `dimensiones` en las líneas del pedido si corresponde (§7.2).

**Lo que cambia es interno**, pero tiene una consecuencia visible que hay que entender para
explicarle a soporte/QA si preguntan:

- Un pedido apartado con líneas de artículos **sin** dimensiones sigue reservando stock con el
  mecanismo nativo de siempre (Stock Reservation Entry) — cero cambios.
- Un pedido apartado con líneas de artículos **con** dimensiones se aparta **moviendo físicamente
  esa cantidad a un almacén de apartados de la sucursal**, en vez de "reservarla" en el mismo
  almacén — la reserva nativa no tiene forma de proteger una combinación específica, así que otra
  venta sí podría llevarse esa combinación si solo se "reservara" sin moverla. Esto es
  transparente para el flujo del usuario (sigue siendo el mismo botón "Apartar"), pero significa
  que **el stock de esa combinación puede aparecer temporalmente en un almacén distinto** si tu UI
  muestra el desglose por almacén (§8.3) — no es un error, es la mercancía apartada.

### 9.1 Aviso nuevo al someter un apartado — `warning`

La respuesta de `POST /pedidos/:id/submit` para un apartado (`isLayaway: true` en la data de
respuesta, que ya deberías reconocer) puede traer un campo `warning` (string) si **no se pudo
apartar automáticamente** alguna línea con dimensiones — por ejemplo, si la sucursal no tiene un
almacén de apartados configurado. **Mostralo tal cual, igual que ya hacés con el `warning` que
existe hoy** para cuando falla la reserva nativa — mismo patrón, mismo campo, ahora puede incluir
también este motivo. `stockReserved` (que ya conocés) sigue siendo el booleano que te dice si TODO
se pudo procesar sin advertencias.

### 9.2 Al facturar un apartado con dimensiones

`POST /pedidos/:id/facturar-apartado` despacha la mercancía **desde el almacén de apartados**, no
desde el almacén de venta original, para las líneas que tienen combinación — de nuevo, transparente
para el usuario, la factura resultante se ve exactamente igual que cualquier otra.

### 9.3 Al cancelar un apartado con dimensiones

`POST /pedidos/:id/cancelar-apartado` revierte automáticamente el movimiento al almacén de
apartados (además de liberar la reserva nativa de las líneas sin dimensión, que ya conocías) — el
`warnings` array de la respuesta (que ya deberías estar mostrando) puede incluir ahora también un
mensaje si esa reversión específica falló, con el mismo criterio de "no bloquea la cancelación,
pero avisa" que ya tenés implementado para el resto de los warnings de esa pantalla.

**No hay ninguna acción nueva que construir acá** — solo mostrar correctamente estos `warning`(s)
si tu UI de Apartados no los está already mostrando de forma genérica como texto libre.

---

## 10. Reglas críticas — resumen ejecutivo (no te saltees esta sección)

### 10.1 ⚠️ Resend en cada edición

**Repetido una tercera vez porque es el error más caro y menos obvio de todo este documento:**
cuando un `PUT` reemplaza el array `items[]` de un documento, mandá `dimensiones` explícito en
CADA línea que la tenga, siempre — sin importar si esa línea específica cambió o no. No existe un
mecanismo confiable de conservación automática en ningún módulo (algunos lo intentan con
heurísticas frágiles, otros ni lo intentan). El costo de no seguir esta regla no es corrupción de
datos (el servidor protege el ledger, ver §11) sino un error de guardado confuso para el usuario
en una edición que, a simple vista, no debería haber tocado esa línea.

### 10.2 La combinación de una línea NO se puede releer de un documento ya guardado

**Ninguno de los endpoints `GET` de Compras, Recepciones, Órdenes de Compra, Devoluciones,
Facturación, Pedidos, Cotizaciones, Despachos, Notas de Crédito o Transferencias devuelve la
combinación elegida por línea en su respuesta hoy.** Esto es una limitación real y actual del
backend, no una omisión de este documento. Consecuencias prácticas:

- Si tu formulario de edición necesita **mostrarle al usuario** qué combinación tenía cada línea
  antes de dejarlo editar, **no vas a poder obtenerla de `GET /modulo/:id`** — vas a tener que
  guardar esa información en el estado local de tu aplicación desde el momento en que se creó el
  documento (por ejemplo, en el store/caché del formulario de creación, o en tu propia capa de
  persistencia si el usuario puede cerrar y volver a esa edición más tarde).
  s
- Combinado con la regla de §10.1: si un usuario abre para editar un documento ya guardado en una
  sesión NUEVA (por ejemplo, otro día, en otra pestaña, sin el estado local de cuando se creó), tu
  UI **no tiene forma de saber qué combinación tenía cada línea** para volver a mandarla en el
  `PUT`. Si tu flujo de edición permite esto, es un caso a resolver con criterio de producto —
  opciones razonables: (a) no permitir editar líneas con combinación desde una sesión "fría", solo
  agregar líneas nuevas o eliminar líneas completas; (b) advertir al usuario que reingrese la
  combinación de las líneas existentes antes de guardar cualquier cambio. Este documento no te
  dice cuál elegir — es una decisión de producto — pero **tenés que elegir una**, no vas a poder
  ignorarlo.

- El único lugar donde SÍ podés consultar información de combinación después del hecho es el
  desglose de stock por artículo+almacén (§8.3, `GET /inventory/items/:itemCode/stock-por-dimension`)
  — te dice CUÁNTO hay de cada combinación, pero no "qué combinación tenía la línea 3 de la
  factura tal".

### 10.3 Es una línea, no un artículo

Con dimensiones, el mismo `itemCode` puede aparecer en más de una línea del mismo documento
(Honda/2000 en una línea, Toyota/2001 en otra). Cualquier pantalla que hoy identifique una línea
únicamente por `itemCode` (selectores de "qué devolver", validaciones de duplicados, etc.) necesita
revisarse — ver específicamente §6.4 y §7.5 (`lineaOriginal`), que son los dos casos concretos
donde el backend ya te da el mecanismo (`lineaOriginal`) para resolverlo correctamente.

### 10.4 Las etiquetas legibles no vienen resueltas en todos lados

Tabla de referencia rápida — dónde SÍ y dónde NO viene la etiqueta lista para mostrar:

| Fuente | ¿Trae etiqueta legible? |
|---|---|
| `GET /catalog/dimensiones-inventario` (dimensiones) | Sí (`etiqueta`) |
| `GET /catalog/dimensiones-inventario/:codigo/valores` (valores) | Sí (`valor`) |
| `GET /catalog/items/:id` → `dimensiones[].dimension` | **No** — solo el `codigo`, resolvé contra la tabla de arriba |
| `GET /inventory/items/:itemCode/stock-por-dimension` → `items[].valores[codigo].etiqueta` | **No** — hoy es igual al `id`, resolvé contra la tabla de arriba |

**Recomendación**: cacheá en memoria (store global de la sesión, invalidado al crear/editar una
dimensión o un valor) un mapa `codigo → etiqueta` y otro `idDeValor → texto` la primera vez que
entrás a cualquier pantalla que toque dimensiones, y usalo para resolver TODOS los lugares de la
tabla de arriba marcados con "No" — no hagas una llamada nueva cada vez.

---

## 11. Errores de validación de línea — mensajes exactos del hook de ERPNext

Estos mensajes **no los genera el BFF, los genera el hook de validación de ERPNext** — llegan tal
cual dentro del `message` de un error 400/417 estándar de la API (mismo contrato de errores que ya
conocés del resto del sistema). **Mostralos tal cual, sin reescribir ni resumir** — están
redactados para el usuario final y ya identifican el número de fila (`Fila #N`) y el artículo.

| Situación | Mensaje exacto |
|---|---|
| Falta un valor de dimensión obligatorio en la línea | `Fila #{N}: indique «{etiqueta}» para el artículo {itemCode}.` |
| El valor mandado no existe | `Fila #{N}: el valor «{valor}» no existe.` |
| El valor pertenece a otra dimensión | `Fila #{N}: «{valor}» es un valor de «{dimensionReal}», no de «{dimensionEsperada}».` |
| El valor está desactivado (solo en documentos NUEVOS) | `Fila #{N}: «{valor}» ya no está activo y no se puede usar en un documento nuevo.` |
| El valor no está en `valoresPermitidos` del artículo | `Fila #{N}: el artículo {itemCode} no admite «{valor}» en «{etiqueta}».` |
| Jerarquía inconsistente (ej. Toyota + Civic) | `Fila #{N}: «{valorHijo}» no corresponde a «{valorPadre}».` |
| Combinación no está en ninguna regla del artículo | `Fila #{N}: la combinación ({lista legible}) no está entre las permitidas para el artículo {itemCode}.` |
| Un traslado (transferencia) intenta cambiar la combinación sin ser una reclasificación | `Fila #{N}: un traslado no cambia la combinación. «{etiqueta}» sale como «{valorOrigen}» y entraría como «{valorDestino}»; para corregir la combinación use un movimiento de tipo «Reclasificacion de dimension».` — **si ves este error en cualquier pantalla que NO sea Reclasificación (§8.6), es un bug de tu formulario de Transferencias enviando `to`/destino distinto del origen** |
| Una devolución vuelve con otra combinación distinta a la original | `Fila #{N}: la devolución tiene que volver con la misma «{etiqueta}» con la que salió («{valorOriginal}»).` — **no debería pasar nunca si seguís §6.4/§7.5 correctamente** (nunca se pide la combinación en una devolución, se copia sola) |
| Artículo SIN dimensiones recibe un valor de todas formas | `Fila #{N}: el artículo {itemCode} no usa la dimensión «{etiqueta}», así que no puede llevar el valor «{valor}».` — **no debería pasar nunca si tu UI solo muestra el selector de combinación cuando `usaDimensiones: true`** |
| Documento no soportado con artículos dimensionados (Conteo/Stock Reconciliation, Subcontratación, Capitalización de Activos) | `El artículo {itemCode} usa dimensiones de inventario y no se puede ajustar con un Conteo/Reconciliación: ERPNext solo admite dimensiones ahí para asientos de apertura, y aun así deja el desglose por combinación con saldos equivocados. Use un ajuste de combinación.` — **si tu pantalla de Conteos permite elegir un artículo dimensionado, filtralo de la lista de artículos elegibles ahí y dirigí al usuario a §8.5** |
| Componente de un Combo/Product Bundle con dimensiones | `El artículo {itemCode} usa dimensiones de inventario y no puede ser componente de un combo: las líneas del combo las arma el servidor y nadie elige su combinación.` — **no ofrezcas artículos dimensionados en el armador de combos** |
| Dos líneas de la misma combinación exceden juntas el disponible (control agregado del documento) | `No hay suficiente stock de {itemCode} ({lista de valores}) en {almacen}: el documento saca {N} y solo hay {M}.` — mitigalo con §5.1 (fusionar líneas iguales) y §8.4 (verificación previa) |
| Ajuste/carga inicial/apertura sobre un artículo dimensionado en pantallas que NO son las nuevas de este documento | El servidor rechaza cualquier intento de usar Apertura de Inventario o Carga Inicial de Inventario (`docs/frontend/PROMPT_APERTURA_INVENTARIO_FRONTEND.md`, `PROMPT_CARGA_INICIAL_INVENTARIO_FRONTEND.md`) con un artículo que declara dimensiones — **filtrá esos artículos de los pickers de esas dos pantallas**, dirigiendo al usuario a §8.5 para cualquier ajuste |

---

## 12. Qué NO está implementado todavía — no lo esperes, no lo prometas en la UI

- **Los reportes de Valoración de Inventario y Movimientos de Stock (Stock Ledger) no tienen un
  filtro ni una vista por combinación todavía.** Si esos reportes ya existen en tu app, no agregues
  un selector de "ver por dimensión" — no hay ningún parámetro del servidor que lo soporte hoy.
- **No hay un reporte de "combinaciones con saldo negativo".**
- **La impresión de documentos (factura, conduce, etc.) no muestra la combinación de línea** en el
  PDF/print format — es un cambio pendiente del lado de las plantillas de impresión del servidor,
  no algo que el frontend pueda resolver por su cuenta.
- **Relaciones Comerciales B2B** (si tu app tiene el módulo de intercambio de documentos entre
  tenants/empresas) **no propaga la combinación entre tenants todavía** — un documento que llega
  de un socio comercial no va a traer la combinación de dimensión de origen. No construyas nada
  para esto todavía; cuando esté implementado del lado del servidor, va a ser un documento de
  frontend aparte.
- **No hay conteo físico completo por combinación** (una pantalla tipo "Conteos" pero
  desglosando cada combinación en vez de solo el total del artículo) — hoy la única forma de
  corregir es el Ajuste de Combinación de a una por vez (§8.5).
- **Un artículo con lotes o series no puede usar dimensiones** (§4.4) — no es una limitación
  temporal a corto plazo conocida, no construyas soporte para ambos combinados.

---

## 13. Checklist de implementación

- [ ] Regenerado el cliente/tipos desde el `openapi.json` actualizado.
- [ ] **Leída la §0 y la §10 completas** antes de tocar cualquier módulo — son las reglas
      transversales que, si se rompen, afectan TODOS los módulos de abajo.
- [ ] Pantalla "Dimensiones de Inventario" en Catálogo (§3): listar, crear, editar
      etiqueta/orden, activar/desactivar, listar/crear/editar valores, selectores en cascada por
      `dimensionPadre`. Gateada por `catalogo.dimensiones.*`.
- [ ] Bloque "Dimensiones de inventario" en la ficha de Artículo (§4): declarar dimensiones +
      `valoresPermitidos`, reglas de combinación con soporte de rango (`desde`/`hasta`) para la
      dimensión ordinal, oculto/deshabilitado para variantes/plantillas/servicios/lote (§4.4),
      manejo del error de inmutabilidad (§4.5).
- [ ] Componente reutilizable de "selector de combinación" (§4.3) — un selector en cascada por
      cada dimensión que declara el artículo, filtrado por `valoresPermitidos`, reutilizado en
      TODAS las pantallas de línea de documento de abajo. Construilo una sola vez.
- [ ] Compras, Recepciones, Órdenes de Compra: campo `dimensiones` en cada línea, sin
      conservación automática en `PUT` (§6.1-6.3).
- [ ] Órdenes de Compra → Recibir: override opcional de `dimensiones` por línea, arrastre
      automático si no se manda (§6.3).
- [ ] Devoluciones de Compra: migrado a selector por LÍNEA de la factura original (no solo por
      artículo), campo `lineaOriginal`, manejo del error de ambigüedad (§6.4).
- [ ] Facturación, Pedidos, Cotizaciones, Despachos: campo `dimensiones` en cada línea, resend
      siempre en cada `PUT` sin excepción (§7.1-7.4, §10.1).
- [ ] Notas de Crédito: mismo patrón de `lineaOriginal` que Devoluciones de Compra (§7.5).
- [ ] Transferencias: campo `dimensiones` por línea, misma combinación en ambos tramos (§8.1).
- [ ] Ubicaciones (si existe en tu app): `dimensiones` en `distribuir`/`mover` (§8.2).
- [ ] Pantalla/widget de "Stock por combinación" de un artículo (§8.3), con resolución de
      etiquetas legibles del lado del cliente (§10.4).
- [ ] Verificación previa de disponibilidad antes de someter una venta con artículos
      dimensionados, opcional pero recomendada (§8.4).
- [ ] Pantalla nueva "Ajuste de Combinación" (§8.5), incluyendo el manejo del error de cuenta
      contable no configurada (mismo requisito que Carga Inicial de Inventario, si ya lo
      resolviste ahí no hay trabajo adicional de configuración).
- [ ] Pantalla nueva "Reclasificación de Combinación" (§8.6).
- [ ] Si ya implementaste Apartados: revisada la §9 completa — sin cambios de contrato, pero
      confirmado que los `warning`(s) nuevos se muestran correctamente.
- [ ] Filtrados los artículos con `usaDimensiones: true` de los pickers de Conteos, Apertura de
      Inventario y Carga Inicial de Inventario, y del armador de Combos/Product Bundle (§11).
- [ ] Todos los mensajes de error de §11 mapeados sin reescribir el texto del servidor.
- [ ] Confirmado con el equipo/QA el entendimiento de §10.1 y §10.2 (resend obligatorio, y que la
      combinación no se puede releer de un documento guardado) — son las dos causas más probables
      de un bug reportado como "se perdió la combinación al editar".
- [ ] Probado un caso completo de punta a punta: crear una dimensión y sus valores, declarar un
      artículo nuevo que las use, comprarlo con una combinación, venderlo con la misma
      combinación, verificar el desglose de stock, reclasificar una unidad a otra combinación, y
      ajustar el saldo de una combinación puntual.
