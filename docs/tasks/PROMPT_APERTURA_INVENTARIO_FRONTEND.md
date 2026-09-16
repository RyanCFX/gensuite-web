# Prompt para agente de frontend — Apertura de Inventario (dentro de "Migración de Saldos")

> **Para quien recibe este documento.** Esto es una **ampliación** del módulo "Migración de
> Saldos" que ya deberías tener implementado — ver `docs/frontend/PROMPT_APERTURA_FRONTEND.md`
> (13 endpoints de Facturas de Apertura, CxC/CxP). **No reemplaza nada de ese documento**: la
> pantalla de Diagnóstico/Preparación (§3 de ese prompt), los formularios de ventas/compras, los
> listados y el cuadre siguen exactamente igual. Esto agrega **una tercera pestaña/sección**
> dentro del mismo módulo — "Inventario" — para migrar el **stock físico** que tenía el negocio en
> el sistema anterior, junto a los saldos de clientes/proveedores que ya migrás.
>
> Este documento es exhaustivo a propósito, con el mismo criterio que el prompt original: cada
> endpoint, cada campo, cada mensaje de error y cada regla de negocio están descritos
> explícitamente para que no quede ninguna decisión de contrato librada a la interpretación.
>
> **En el repo del frontend hay un archivo `openapi.json` con la documentación completa y
> actualizada del API** (se genera desde el backend con `GET /api/docs-json`, también navegable en
> Scalar en `https://gensapi.ryancfx.click/api/docs`). **Antes de escribir una sola línea de
> código, regenerá tus tipos/cliente HTTP desde ese archivo** — ahí está el shape exacto y tipado
> de cada request y cada response. Los 4 endpoints nuevos de este documento aparecen bajo el mismo
> tag `Facturas de Apertura (Migración de Saldos)` que ya conocés — no es un tag nuevo. Este
> documento no reemplaza el spec: explica el flujo de negocio, qué pantalla llama a qué endpoint,
> en qué orden, qué mostrar en cada estado, y cómo manejar cada error posible. **Si este documento
> y el `openapi.json` llegaran a diferir en el nombre exacto de un campo, gana el `openapi.json`**
> — pero eso no debería pasar: todo lo escrito acá se extrajo directamente del código fuente ya
> mergeado (`src/modules/apertura/apertura.service.ts`), no de un diseño preliminar.
>
> Documentos relacionados que ya deberías tener implementados y que esto reutiliza sin cambiarlos:
> `docs/frontend/PROMPT_PERMISOS_FRONTEND.md` (contrato de permisos) y
> `docs/frontend/PROMPT_APERTURA_FRONTEND.md` (el resto del módulo, del que este documento es una
> extensión).

---

## 0. Qué es esto, en una frase, y en qué se diferencia de todo lo demás que ya conocés

Una tercera sección dentro de "Migración de Saldos" — junto a "Ventas" y "Compras" — para que,
**una sola vez** al empezar a usar este ERP, se cargue el **saldo de inventario** (cuánto había de
cada artículo en cada almacén) que existía en el sistema anterior, **sin** que ese ítem tenga que
existir todavía en ningún documento de compra/venta, y contabilizando el ajuste contra la **misma
cuenta puente** (`14-03 APERTURA TEMPORAL`) que ya usan las facturas de apertura de CxC/CxP — no
contra otra cuenta, no un mecanismo aparte.

**Es fundamental que entiendas la diferencia con dos cosas que probablemente ya existan en tu
frontend, porque las tres se ven parecidas pero se comportan distinto:**

| | **Apertura de Inventario** (este documento) | **Conteo de Inventario** (`inventory/counts`, si ya existe en tu app) | **Carga Inicial / Material Receipt** (si ya existe en tu app) |
|---|---|---|---|
| Para qué sirve | Migrar el saldo inicial de un sistema anterior | Ajustar el inventario después de un conteo físico periódico | Entradas puntuales/recurrentes sin proveedor (hallazgos, donaciones, ajustes) |
| Semántica de `qty` | **Fija el saldo FINAL absoluto** — si mandás `qty: 100`, el ítem queda con 100 en ese almacén, sin importar lo que tenía antes | También fija el saldo FINAL absoluto (mismo doctype de ERPNext por debajo) | **Suma** a lo que ya existe |
| Cuenta contable de contrapartida | `14-03 APERTURA TEMPORAL` (Activo/Pasivo — la misma de las facturas de apertura) | `Company.stock_adjustment_account` (Gasto/P&L) | `Company.stock_adjustment_account` (Gasto/P&L) |
| Repetible sin riesgo | **No** — cada envío fija un saldo absoluto nuevo; enviarlo dos veces con la misma cantidad no hace nada raro, pero enviarlo con una cantidad distinta a la real "pisa" el saldo | Sí, es justamente para eso | Sí |
| Dónde vive en el menú | Dentro de "Migración de Saldos" | Inventario → Conteos | Inventario → Carga Inicial |
| Permiso | `apertura.inventario.*` (nuevo) | `inventario.conteo.*` (si ya existe) | el que corresponda a esa feature |

**Si tu frontend todavía no tiene ni Conteo ni Carga Inicial implementados, no te preocupes por
esa comparación** — es solo para que, si en algún momento construís esas otras pantallas, no las
confundas entre sí ni reutilices el mismo componente de formulario sin ajustar la semántica y el
texto de ayuda al usuario.

**Quién la usa:** el mismo perfil que ya usa el resto de "Migración de Saldos" — normalmente
Administrador — **pero con una diferencia importante de permisos respecto a Ventas/Compras**, ver
§2.

---

## 1. Los 4 endpoints nuevos — mapa completo

Todos bajo `/api/v1/apertura/inventario`, todos requieren el header `X-Tenant` y el
`Authorization: Bearer` de siempre. Todas las respuestas exitosas vienen envueltas en
`{ "success": true, "data": {...} }`, igual que el resto del sistema.

| # | Método | Ruta | Acción de permiso | Qué hace |
|---|---|---|---|---|
| 1 | `POST` | `/apertura/inventario` | `apertura.inventario.crear` | Carga y confirma en un solo paso el saldo inicial de uno o más ítems/almacenes |
| 2 | `GET` | `/apertura/inventario` | `apertura.inventario.listar` | Lista los documentos de apertura de inventario ya cargados |
| 3 | `GET` | `/apertura/inventario/:id` | `apertura.inventario.listar` | Detalle completo de uno, con sus líneas |
| 4 | `POST` | `/apertura/inventario/:id/cancel` | `apertura.inventario.anular` | Anula un documento — **revierte el stock físico** (ver §7, es distinto de anular una factura) |

**No hay `PUT`.** Igual que en Ventas/Compras: no existe edición. Si el usuario cargó mal una
cantidad o una tasa de valoración, el flujo es **anular y volver a cargar** con el dato correcto.
No construyas un botón "Editar" para las filas de esta sección.

**No hay `POST /apertura/inventario/importar`.** A diferencia de Ventas/Compras (que sí tienen un
endpoint de lote, §9 del prompt original), **acá no existe y no va a existir** — ver la
explicación completa en §6. En su lugar, el formulario individual ya acepta muchas líneas en una
sola llamada (§4).

**`POST` crea y confirma en una sola llamada**, exactamente igual que Ventas/Compras — no hay
estado "borrador" intermedio. El botón dice "Cargar inventario inicial" (o similar), no "Guardar".

---

## 2. Permisos y gating — leé esto con atención, es distinto a Ventas/Compras

Mismo mecanismo de siempre: `GET /api/v1/me/permissions` al iniciar sesión, `data.acciones` en
memoria.

Las 3 acciones nuevas:

| Acción | Controla |
|---|---|
| `apertura.inventario.listar` | Ver la pestaña/sección "Inventario" dentro de Migración de Saldos (listado + detalle) |
| `apertura.inventario.crear` | El botón "Cargar inventario inicial" |
| `apertura.inventario.anular` | El botón "Anular" en un documento de inventario de apertura |

**Gating de la pestaña:** si el usuario no tiene `apertura.inventario.listar`, no muestres la
pestaña "Inventario" dentro del módulo — igual criterio que las otras pestañas del módulo.

### ⚠️ Diferencia importante con Ventas/Compras: el perfil "Contabilidad" NO alcanza acá

En Ventas/Compras (§2 del prompt original), el perfil **Contabilidad** ya tenía automáticamente
todos los permisos necesarios, sin que ustedes tuvieran que hacer nada especial. **Acá NO es así**:
estos 3 permisos requieren acciones (`create`/`submit`/`cancel`/`read`) sobre el doctype
`Stock Reconciliation`, que es un doctype de **inventario**, no de **contabilidad** — el perfil
Contabilidad de este sistema no incluye ningún rol de stock.

**Consecuencia práctica para tu UI:** es perfectamente posible (y esperable) que un usuario vea
habilitadas las pestañas "Ventas" y "Compras" de Migración de Saldos, pero **no** la pestaña
"Inventario" — necesita el perfil **Inventario** o **Administrador** para esa parte específica.
No trates esto como un bug ni asumas que si el usuario puede migrar facturas también puede migrar
inventario — son permisos independientes. Si tu UI muestra un mensaje de "no tenés acceso a esta
sección", asegurate de que sea específico a Inventario y no genérico a todo el módulo.

**Error 403 si igual se intenta una acción sin permiso:** mismo contrato de siempre —
`{ "code": "PERMISO_INSUFICIENTE", "message": "...", "details": { "acciones": [...], "requiere": [...], "marcadores": [] } }`.

---

## 3. El concepto central que el formulario debe transmitir sin ambigüedad

**`qty` es el saldo FINAL absoluto de ese ítem en ese almacén — no una cantidad que se suma.**

Ejemplo concreto para poner en el texto de ayuda del formulario: si el sistema anterior decía que
había 120 unidades de "Tornillo 1/4" en el almacén "Principal", el usuario carga `qty: 120` para
ese ítem/almacén. Si por error carga el documento y después se da cuenta de que en realidad eran
150, **no** debe cargar otra línea con `qty: 30` pensando que se va a sumar — eso dejaría el
sistema pensando que hay 150 (el segundo envío no suma, fija un nuevo saldo final, y como el
segundo envío es un documento nuevo e independiente del primero, en la práctica terminaría
sobreescribiendo el conteo físico real de ERPNext a 30, no a 150). El flujo correcto para corregir
es: **anular el primer documento (§7) y cargar uno nuevo con la cantidad correcta (120 → 150)**.

Poné este texto de advertencia, o uno equivalente, cerca del campo `qty` del formulario:

> *"Ingresá la cantidad TOTAL que existe de este artículo en este almacén — no una cantidad a
> sumar. Si te equivocaste, anulá este documento y cargá uno nuevo con la cantidad correcta."*

**`qty: 0` es un valor válido y tiene un propósito real**: dejar constancia explícita de que un
ítem/almacén arranca en cero (por ejemplo, el negocio vendía ese producto en el sistema anterior
pero ya no queda stock, y quieren que quede registrado que se migró aunque no haya cantidad). No
lo trates como "campo vacío" ni lo rechaces en el formulario del lado del cliente.

---

## 4. El formulario — `POST /apertura/inventario`

### 4.1 Request body

```jsonc
{
  "fechaApertura": "2024-01-01",
  "remarks": "Saldo inicial migrado desde sistema anterior (Excel de inventario 2023)",
  "branch": "Principal",
  "department": "Almacén General",
  "items": [
    { "itemCode": "TORN-001", "warehouse": "Principal - ACME", "qty": 120, "valuationRate": 15.50 },
    { "itemCode": "TORN-002", "warehouse": "Principal - ACME", "qty": 0,   "valuationRate": 8.00 },
    { "itemCode": "CLAVO-050", "warehouse": "Principal - ACME", "qty": 300, "valuationRate": 2.25 }
  ]
}
```

| Campo | Tipo | Obligatorio | Validación | Notas de UI |
|---|---|---|---|---|
| `fechaApertura` | string (fecha `YYYY-MM-DD`) | **Sí** | No puede ser posterior a hoy. Debe caer dentro de un Ejercicio Fiscal activo | Date picker con máximo = hoy. **Mismo campo/mismo concepto que `fechaFactura` en Ventas/Compras** — si el usuario ya usó la pantalla de Diagnóstico (§3 del prompt original) para preparar los Ejercicios Fiscales necesarios, esta fecha ya va a funcionar sin fricción |
| `remarks` | string | No | Ninguna | Textarea corta. Si se omite, el backend usa el texto por defecto: `"Apertura de inventario — saldo inicial del sistema anterior"` — mostralo como placeholder, no hace falta que el usuario lo escriba si no quiere |
| `items` | array de objetos | **Sí**, mínimo 1 | Ver tabla de abajo | Grilla/tabla editable, una fila por ítem+almacén. Sin límite máximo documentado — en la práctica, para migraciones muy grandes, dividí en varios documentos (ver §6) |
| `branch` | string | No | Debe ser una Sucursal existente. **Un documento no puede mezclar almacenes de sucursales distintas** (ver §5) | Picker de sucursales — solo mostrar el campo si el tenant tiene sucursales habilitadas. Si se omite, el backend intenta derivarla de los almacenes elegidos en `items` (§5) |
| `department` | string | No | Ninguna especial — informativo, nunca bloquea | Picker de departamentos, si el tenant los usa |

**Cada objeto dentro de `items[]`:**

| Campo | Tipo | Obligatorio | Validación | Notas de UI |
|---|---|---|---|---|
| `itemCode` | string | **Sí** | No vacío. Debe ser un `Item` existente en el catálogo | Picker/autocomplete del catálogo de artículos, igual que en cualquier línea de factura. **No permitas crear un artículo desde acá** — si no existe, dirigí al usuario al módulo de Catálogo |
| `warehouse` | string | **Sí** | No vacío. Debe ser un `Warehouse` existente | Picker de almacenes |
| `qty` | number | **Sí** | `≥ 0` (0 es válido, ver §3) | Input numérico. **No permitas negativos** — el backend los rechaza con un 422 de validación del DTO |
| `valuationRate` | number | **Sí** | `> 0` (estrictamente positivo — 0 no es válido acá, a diferencia de `qty`) | Input numérico de moneda. **Explicále al usuario que es el costo unitario que va a quedar registrado para ese ítem** — una apertura sin costo no tiene sentido contable, por eso es obligatorio a diferencia de otros formularios donde puede ser opcional |

> **Por qué `valuationRate` es obligatorio y `qty` puede ser 0, pero no al revés:** una cantidad en
> cero es información legítima ("no queda nada de esto"). Un costo en cero o vacío nunca lo es —
> significaría que ese inventario no vale nada, lo cual rompe cualquier reporte de valorización de
> inventario desde el primer día. Si el usuario genuinamente no sabe el costo de un ítem viejo,
> tiene que estimarlo antes de cargar la línea — el formulario no debe dejarlo pasar sin ese dato.

### 4.2 Sucursal — de dónde sale si el usuario no la elige explícitamente

Esto es una cascada automática del lado del servidor, la misma que ya usa el módulo de Conteos si
tu frontend lo tiene implementado. **No necesitás replicar esta lógica en el cliente** — solo
entenderla para saber qué esperar:

1. Si el usuario elige `branch` explícitamente en el formulario, esa gana siempre.
2. Si no, el servidor mira los almacenes de las líneas cargadas y, si todos pertenecen a la misma
   sucursal, usa esa.
3. Si no, mira si el usuario tiene una sucursal por defecto configurada en su perfil.
4. Si no, mira si hay una sucursal por defecto configurada a nivel de la dimensión contable de la
   compañía.
5. Si no, y el tenant tiene exactamente **una** sola sucursal en todo el sistema, usa esa.
6. Si nada de lo anterior resuelve una sucursal, y las sucursales son obligatorias para ese tenant
   (dimensión contable configurada como obligatoria), el servidor devuelve el error
   `BRANCH_REQUIRED` (ver §7) pidiendo que se mande `branch` explícito.

**Para la UI, lo único que importa de esto:** si el tenant tiene una sola sucursal, o si el
usuario ya tiene una por defecto, **podés ocultar o dejar opcional el campo `branch`** y todo va a
funcionar solo. Si el tenant tiene varias sucursales sin default claro, mostrá el picker de
sucursal como visible (no necesariamente obligatorio a nivel de formulario del cliente — dejá que
el servidor decida si hace falta, y mostrá el error `BRANCH_REQUIRED` si aparece).

### 4.3 Respuesta exitosa

```jsonc
{
  "success": true,
  "data": {
    "id": "MAT-RECO-2026-00012",
    "fechaApertura": "2024-01-01",
    "company": "ACME SRL",
    "branch": "Principal",
    "department": "Almacén General",
    "cuentaApertura": "14-03 - APERTURA TEMPORAL - ACME",
    "items": [
      { "itemCode": "TORN-001", "warehouse": "Principal - ACME", "qty": 120, "valuationRate": 15.50, "amount": 1860.00 },
      { "itemCode": "TORN-002", "warehouse": "Principal - ACME", "qty": 0,   "valuationRate": 8.00,   "amount": 0.00 },
      { "itemCode": "CLAVO-050", "warehouse": "Principal - ACME", "qty": 300, "valuationRate": 2.25,  "amount": 675.00 }
    ],
    "montoTotal": 2535.00,
    "estado": "submitted",
    "esApertura": true
  }
}
```

Campo por campo:

- `id`: el identificador del documento en ERPNext (naming nativo de `Stock Reconciliation`, con
  prefijo `MAT-RECO-`). Usalo para armar el enlace al detalle desde el listado.
- `cuentaApertura`: el nombre completo de la cuenta contable usada (`14-03 - APERTURA TEMPORAL -
  <ABBR>`) — puramente informativo, mostralo en el detalle para que el contador pueda verificar
  que efectivamente contabilizó contra la cuenta esperada.
- `items[].amount`: `qty × valuationRate`, ya calculado por el servidor (ERPNext lo computa al
  someter el documento). Mostralo como columna de la grilla, no lo recalcules en el cliente para
  evitar diferencias de redondeo.
- `montoTotal`: la suma de `items[].amount` de todo el documento — mostralo como total destacado
  al pie de la grilla, tanto en la confirmación como en el detalle.
- `estado`: `"submitted"` (recién confirmado) o `"cancelled"` (si se anuló, ver §7). **Nunca vas a
  ver `"draft"` en la respuesta de creación** — ver §1, siempre crea y confirma junto.
- `esApertura`: siempre `true` — mismo marcador que usan las respuestas de Ventas/Compras, útil si
  reutilizás algún componente compartido entre las tres pestañas.

---

## 5. Sucursales mezcladas — el único error de validación de negocio propio de esta pantalla

**Regla dura: un solo documento de apertura de inventario no puede tener líneas de almacenes que
pertenezcan a sucursales distintas.** Si el usuario intenta cargar, en la misma llamada, un ítem
del almacén "Principal - Norte" (sucursal Norte) y otro del almacén "Principal - Sur" (sucursal
Sur), el servidor rechaza el documento completo — no permite mezclarlos.

**Response de error:**

```jsonc
{
  "statusCode": 400,
  "message": "Una apertura de inventario no puede mezclar almacenes de sucursales distintas. Cree un documento por sucursal.",
  "code": "MIXED_BRANCH_APERTURA_INVENTARIO"
}
```

**Cómo manejarlo en la UI:**

- Si tu formulario permite elegir el almacén línea por línea (lo normal en una grilla), y el
  usuario elige almacenes de sucursales distintas, **idealmente detectá esto ANTES de someter**:
  cuando tengas la lista de almacenes y sepas a qué sucursal pertenece cada uno (podés resolverlo
  contra tu propio catálogo de almacenes si ya lo tenés cacheado, o simplemente dejar que el
  servidor lo valide), mostrá una advertencia inline en la grilla señalando qué filas pertenecen a
  una sucursal distinta del resto.
- Si preferís una solución más simple para la primera entrega: dejá que el servidor lo rechace y
  mostrá el mensaje `message` tal cual, con una sugerencia como *"Separá esta carga en varios
  documentos, uno por sucursal."*
- **Recomendación de UX**: si el tenant tiene sucursales, considerá agrupar el picker de almacenes
  por sucursal (con separadores visuales), para que sea difícil para el usuario elegir por error
  dos almacenes de sucursales distintas en el mismo documento.

---

## 6. Por qué NO hay `/apertura/inventario/importar` — entendé la razón, no la cuestiones

En Ventas y Compras, la carga masiva (`/importar`) tiene sentido porque cada fila del lote es una
**factura completamente independiente**: si la fila 47 de 200 falla, las otras 199 se procesan
igual, y el resultado es un parte fila por fila con éxitos y fracasos mezclados (§9 del prompt
original).

**Un documento de apertura de inventario es un único documento atómico de ERPNext
(`Stock Reconciliation`): todas sus líneas se someten juntas, o ninguna se somete.** No existe
"la línea 47 de 200 falló pero las otras 199 sí se cargaron" a este nivel — un solo dato inválido
en cualquier línea (un `itemCode` que no existe, una `qty` negativa) tumba el documento completo,
sin excepciones.

**Por eso, ofrecer un endpoint `/importar` con el mismo shape de respuesta que usan Ventas/Compras
(`resultados: [{fila, ok, error}]`) sería directamente engañoso** — implicaría que puede haber
éxito parcial dentro de un mismo envío, y eso no puede pasar a este nivel.

**Lo que sí tenés disponible, y es la forma correcta de manejar volúmenes grandes:**

- `items[]` del `POST /apertura/inventario` (§4) ya acepta **muchas líneas en una sola llamada**
  — no hay un límite documentado por el backend, así que un documento con cientos de líneas para
  un solo almacén/sucursal es perfectamente válido.
- Si el volumen es muy grande, o si abarca varias sucursales (recordá: un documento = una sola
  sucursal, §5), armá **varias llamadas** a `POST /apertura/inventario` desde el propio frontend
  — una por sucursal, o chunkeada por tamaño si el volumen dentro de una misma sucursal es
  excesivo para una sola llamada (no hay un número mágico documentado; si vas a manejar miles de
  líneas, consultá con el equipo de backend sobre límites prácticos de payload antes de asumir que
  no hay ninguno).
- Si querés ofrecer "importar desde CSV/Excel" como conveniencia de UX, el parseo del archivo es
  responsabilidad 100% del frontend: leé el archivo en el navegador, mapeá las columnas a
  `itemCode`/`warehouse`/`qty`/`valuationRate`, agrupá por sucursal si hace falta, y armá una o
  varias llamadas a `POST /apertura/inventario` con el array `items[]` resultante. No existe (y no
  hay que pedirlo) un endpoint de subida de archivo binario para esto — mismo criterio que
  Ventas/Compras.

---

## 7. Cancelación — leé esto con atención, es distinto a anular una factura de apertura

`POST /apertura/inventario/:id/cancel`, sin body.

**Diferencia crítica respecto a `POST /apertura/ventas/:id/cancel` y
`POST /apertura/compras/:id/cancel`:** anular una factura de apertura **no toca el inventario**
(nunca lo tocó, las facturas de apertura tienen `update_stock: 0`). **Anular una apertura de
inventario SÍ revierte el stock físico** de todos los ítems/almacenes que ese documento había
fijado — ERPNext deshace el ajuste de cantidad que había hecho.

**Por qué esto importa para tu UI:** si entre que se cargó el documento de apertura de inventario
y el momento de la anulación **ya se vendió, transfirió o consumió algo de ese mismo ítem** (por
ejemplo, se cargó `qty: 120` de un artículo y después se facturaron 30 unidades a un cliente),
anular el documento de apertura puede dejar el inventario en un estado inesperado o incluso
negativo, porque el ajuste que se revierte es el saldo ABSOLUTO que había fijado, no una simple
resta de la cantidad original.

**Modal de confirmación obligatorio, con texto explícito** (no reutilices el mismo texto genérico
de "¿Anular esta factura?" que usás en Ventas/Compras — este necesita su propia advertencia):

> *"¿Anular esta apertura de inventario? A diferencia de anular una factura, esto SÍ revertirá el
> stock de los artículos/almacenes incluidos en este documento. Si ya se vendió o movió stock de
> estos artículos después de cargar esta apertura, verificá el inventario resultante antes de
> continuar. Esta acción no se puede deshacer directamente — para corregir, deberá cargar un nuevo
> documento con la cantidad correcta."*

**Response exitosa:**

```jsonc
{
  "success": true,
  "data": {
    "message": "Apertura de inventario anulada. El stock de los ítems/almacenes afectados fue revertido."
  }
}
```

Mostrá ese `message` tal cual como confirmación después de anular — ya viene redactado con la
advertencia de que el stock se revirtió, no lo resumas a un genérico "Anulado correctamente".

Después de anular, refrescá el listado/detalle — el `estado` pasa a `"cancelled"`. Si tenés una
pantalla de Inventario general (existencias actuales) abierta en otra pestaña del navegador,
considerá invalidar su caché/refrescarla también, ya que las cantidades reales cambiaron.

---

## 8. Listado y detalle

### 8.1 `GET /apertura/inventario`

Query params (todos opcionales, paginado):

| Param | Tipo | Notas |
|---|---|---|
| `limit` | number | Default `20`, máximo `100` |
| `offset` | number | Default `0` |
| `branch` | string | Filtra por la sucursal del documento (de cabecera) |
| `fromDate` | string (fecha) | `fechaApertura >= fromDate` |
| `toDate` | string (fecha) | `fechaApertura <= toDate` |

**Response — nota importante: el listado NO incluye `items[]` ni `montoTotal`**, a propósito
(evita traer todas las líneas de cada documento en una pantalla de tabla resumen — mismo criterio
que Ventas/Compras, que tampoco traen sus líneas en el listado):

```jsonc
{
  "success": true,
  "data": [
    {
      "id": "MAT-RECO-2026-00012",
      "fechaApertura": "2024-01-01",
      "company": "ACME SRL",
      "branch": "Principal",
      "department": "Almacén General",
      "cuentaApertura": "14-03 - APERTURA TEMPORAL - ACME",
      "estado": "submitted",
      "esApertura": true
    }
  ],
  "meta": { "limit": 20, "offset": 0, "total": 7 }
}
```

Tabla sugerida: Fecha (`fechaApertura`) | Sucursal (`branch`, o `—` si `null`) | Departamento
(`department`, o `—`) | Estado (badge: verde="submitted", gris="cancelled") | Acciones (Ver, Anular
si `estado === "submitted"`). Si querés mostrar el monto total en el listado sin hacer N llamadas
extra, tenés dos opciones: (a) llamar al detalle de cada fila visible bajo demanda (ej. al
expandir), o (b) consultarlo con el equipo de backend si conviene agregarlo al listado — no está
incluido hoy porque, a diferencia de Sales/Purchase Invoice, `Stock Reconciliation` no tiene un
total de cabecera nativo (se calcula sumando las líneas), así que agregarlo al listado tiene un
costo de cálculo distinto al de Ventas/Compras.

### 8.2 `GET /apertura/inventario/:id` — detalle

Mismo shape completo que §4.3 (con `items[]` y `montoTotal`). Usalo al hacer clic en una fila del
listado, o para armar la pantalla de confirmación antes de anular.

### 8.3 `POST /apertura/inventario/:id/cancel` — anular

Ver §7 completo.

---

## 9. Manejo de errores — tabla exhaustiva con los mensajes EXACTOS

Igual criterio que el resto del módulo: **no reescribas, no resumas, no reemplaces estos mensajes
por un genérico "Ocurrió un error"** — cada uno le dice al usuario exactamente qué corregir.

| HTTP | Disparador | Mensaje / código exacto del servidor |
|---|---|---|
| 400 | `fechaApertura` posterior a hoy | `La fecha de apertura no puede ser futura.` |
| 400 | No existe un Ejercicio Fiscal que cubra `fechaApertura` | `No existe un ejercicio fiscal que cubra la fecha 2024-01-01. Ejecute POST /api/v1/apertura/preparar con un rango que la incluya.` — dirigí al usuario a la pantalla de Diagnóstico (§3 del prompt original) |
| 400 | No existe la cuenta de apertura en el tenant | `No hay cuenta de apertura configurada (Account.account_type = "Temporary"). Ejecute POST /api/v1/apertura/preparar antes de cargar facturas de apertura.` — mismo mensaje que en Ventas/Compras, dirigí al mismo lugar |
| 400 | La compañía no tiene Centro de Costo por defecto configurado (caso raro) | `La compañía <nombre> no tiene un Centro de Costo por defecto configurado.` — esto es un problema de configuración del tenant, no algo que el usuario resuelva desde este formulario; sugerí contactar soporte/administración |
| 400 | Líneas con almacenes de sucursales distintas | `code: "MIXED_BRANCH_APERTURA_INVENTARIO"` — ver §5 para el mensaje completo y cómo manejarlo |
| 400 | Ninguna sucursal se pudo resolver y son obligatorias para este tenant | `code: "BRANCH_REQUIRED"`, `message: "La sucursal es obligatoria para documentos que afectan cuentas de resultado. Envíe \"branch\" o configure una sucursal por defecto en su usuario."` — mostrá el picker de sucursal si no estaba visible y pedí que el usuario elija una |
| 403 | El usuario no tiene la sucursal elegida asignada (y no es System Manager) | `No tienes acceso a la sucursal "<nombre>".` |
| 400 | `qty` negativo en alguna línea, `valuationRate` ≤ 0, `itemCode`/`warehouse` vacíos, `items` vacío | Errores de validación estándar del DTO (`class-validator`) — el mensaje exacto depende del campo; mapealos a la línea/campo correspondiente de la grilla |
| 404 | `GET .../:id` o `POST .../:id/cancel` sobre un id que no existe o no es una apertura de inventario | `Apertura de inventario "<id>" no encontrada.` |
| 400 | Intentar anular un documento que no está confirmado (no debería poder pasar desde la UI normal, ya que siempre se crea y confirma junto) | `Solo se puede anular una apertura de inventario confirmada.` |
| 500 | El documento se creó pero falló al confirmarse (caso raro — problema de ERPNext a mitad de operación) | `No se pudo confirmar la apertura de inventario: <detalle del error>.` — el servidor ya se encarga de borrar el borrador huérfano por su cuenta; no necesitás hacer ninguna limpieza del lado del cliente, solo mostrar el error y dejar que el usuario reintente el envío completo |
| 403 | Falta el permiso correspondiente | Contrato genérico de siempre — `PERMISO_INSUFICIENTE` (§2) |

---

## 10. Extensión de la pantalla de Cuadre — `GET /apertura/resumen`

**Si ya implementaste la pantalla de Cuadre del prompt original (§10 de
`PROMPT_APERTURA_FRONTEND.md`), tenés que actualizarla — el endpoint ahora devuelve un bloque
adicional.** No es un endpoint nuevo, es el mismo `GET /apertura/resumen` de siempre, con más
información.

```jsonc
{
  "success": true,
  "data": {
    "ventas":  { "cantidad": 118, "montoMigrado": 1845300.50, "saldoPendiente": 1620400.00 },
    "compras": { "cantidad": 34,  "montoMigrado":  432100.00, "saldoPendiente":  380000.00 },
    "inventario": { "cantidad": 3, "montoMigrado": 58200.00 },
    "cuentaApertura": {
      "cuenta": "14-03 - APERTURA TEMPORAL - JBC",
      "saldo": -1471400.50,
      "esperado": -1471400.50,
      "cuadra": true
    },
    "porAnio": [
      { "anio": 2024, "ventas": 980000.00, "compras": 210000.00, "inventario": 58200.00 },
      { "anio": 2025, "ventas": 865300.50, "compras": 222100.00, "inventario": 0 }
    ],
    "pendienteDeCierre": true
  }
}
```

Cambios exactos que tenés que hacer en esa pantalla:

1. **Nuevo bloque `inventario: { cantidad, montoMigrado }`** — agregalo como una tercera tarjeta de
   KPI, junto a las de Ventas y Compras. Notá que, a diferencia de Ventas/Compras, **no trae
   `saldoPendiente`** — no tiene sentido para inventario (no hay un "saldo pendiente de cobrar/
   pagar" de un ajuste de stock, el concepto no aplica).
2. **`porAnio` ahora trae una tercera propiedad `inventario` por año** — si ya tenés un gráfico de
   barras apiladas (ventas vs. compras) como sugería el prompt original, agregale una tercera
   serie/color para inventario.
3. **`cuentaApertura.saldo`/`esperado`/`cuadra` ya incluyen el efecto del inventario migrado** —
   no necesitás hacer ningún cálculo nuevo del lado del cliente, el servidor ya lo suma
   internamente. Seguí mostrando el indicador `cuadra` exactamente igual que antes (§10 del prompt
   original) — verde si `true`, alerta roja/naranja si `false`.

**Una aclaración honesta que te conviene conocer, aunque no cambia nada de lo que tenés que
construir:** el signo con el que el backend resta el monto de inventario del cálculo de `esperado`
está basado en una hipótesis contable razonable (una apertura de inventario que agrega stock
acredita la cuenta puente, igual que una venta), pero **todavía no fue verificada contra un
tenant real con datos de producción**. Si en algún momento ves que `cuadra: false` de forma
consistente apenas se carga una apertura de inventario (y **antes** de eso el cuadre estaba
`true`), no asumas que es un bug del frontend — avisale al equipo de backend, puede ser que haga
falta ajustar el signo de ese cálculo del lado del servidor. No es algo que puedas ni debas
corregir vos mismo ajustando el número en el cliente.

---

## 11. Qué NO construir / decisiones ya tomadas que no hay que cuestionar

- **No hay borrador.** Crear siempre confirma, igual que Ventas/Compras.
- **No hay edición.** Corregir = anular + cargar de nuevo (§3, §7).
- **No hay `/importar`** — ver la explicación completa en §6. No lo pidas, no está en el roadmap
  de este módulo tal cual está diseñado (un documento atómico no se presta a ese patrón).
- **No hay soporte de lote/serie en esta primera versión.** Si tu catálogo de artículos maneja
  ítems con número de lote o serie, **no los incluyas en esta pantalla todavía** — el backend no
  los soporta acá (mismo límite que tiene hoy el módulo de Conteo de Inventario, si ya lo
  implementaste). Si intentás mandar un ítem con lote/serie sin que el backend lo espere, el
  comportamiento no está definido — no lo hagas.
- **No se pueden crear artículos ni almacenes desde acá.** Los pickers de `itemCode`/`warehouse`
  solo buscan entre los que ya existen. Si el usuario necesita crear uno, mandalo al módulo de
  Catálogo/Configuración de siempre.
- **No hay subida de archivos** (CSV/Excel) en el backend para esto — ver §6, el parseo es
  responsabilidad del frontend si querés ofrecer esa conveniencia.
- **El listado no trae `items[]` ni `montoTotal`** — si necesitás mostrarlos, pedí el detalle
  (§8.2) bajo demanda.
- **Anular un documento de inventario de apertura SÍ toca stock real** (§7) — no reutilices sin
  ajustar el texto de confirmación de "anular" que ya tengas para Ventas/Compras, que
  explícitamente NO tocan stock.

---

## 12. Checklist de implementación

- [ ] Regenerado el cliente/tipos desde el `openapi.json` actualizado — los 4 endpoints nuevos
      deben aparecer bajo el mismo tag `Facturas de Apertura (Migración de Saldos)` que ya
      conocías, junto a los 13 anteriores.
- [ ] Nueva pestaña/sección "Inventario" dentro del módulo existente de Migración de Saldos,
      oculta si el usuario no tiene `apertura.inventario.listar` (§2) — **verificado que esto es
      independiente del gating de Ventas/Compras**, un usuario puede ver esas dos pestañas y no
      esta.
- [ ] Formulario "Cargar inventario inicial" (§4) con grilla editable de líneas
      (`itemCode`/`warehouse`/`qty`/`valuationRate`), el texto de advertencia de "saldo final
      absoluto, no se suma" (§3), y el picker de sucursal condicional (§4.2).
- [ ] Validación/aviso de sucursales mezcladas (§5), aunque sea solo mostrando el error del
      servidor si no implementás la detección preventiva en el cliente.
- [ ] Todos los mensajes de error de §9 mapeados correctamente, sin reescribir el texto del
      servidor, con atención especial a `MIXED_BRANCH_APERTURA_INVENTARIO` y `BRANCH_REQUIRED`
      (tienen `code` explícito, no solo `message`).
- [ ] Listado de Inventario (§8.1) con filtros por sucursal y rango de fechas, paginación, y
      acción "Anular" con el texto de confirmación **propio y distinto** al de Ventas/Compras
      (§7 — debe advertir que revierte stock).
- [ ] Pantalla de detalle (§8.2) mostrando `items[]` con sus montos y el `montoTotal`.
- [ ] Pantalla de Cuadre existente (§10 del prompt original) actualizada con la tarjeta
      `inventario` y la tercera serie en `porAnio`.
- [ ] Verificado que ninguna pantalla de esta sección ofrece editar, importar por lote, ni
      cargar ítems con lote/serie (§11).
- [ ] Probado un caso completo: cargar un ítem nuevo con `qty > 0`, verificar en la pantalla de
      Inventario general que el stock aparece correctamente, anular el documento de apertura, y
      verificar que el stock vuelve a su estado anterior.
