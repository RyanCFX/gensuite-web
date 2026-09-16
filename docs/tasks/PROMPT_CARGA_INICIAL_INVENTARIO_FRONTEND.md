# Prompt para agente de frontend — Carga Inicial de Inventario (Stock Entry / Material Receipt)

> **Para quien recibe este documento.** Esto describe un **módulo enteramente nuevo** del BFF,
> ya implementado, probado y desplegable: `/api/v1/inventory/carga-inicial`. No existe ninguna
> pantalla previa que reemplazar — hay que construir todo desde cero, dentro de la sección de
> Inventario que tu frontend ya tenga (junto a "Conteos" y "Transferencias", si ya las
> implementaste). Este documento es exhaustivo a propósito: cada endpoint, cada campo, cada
> mensaje de error y cada regla de negocio que el frontend debe respetar están descritos
> explícitamente, para que no quede ninguna decisión de contrato librada a la interpretación.
>
> **En el repo del frontend hay un archivo `openapi.json` con la documentación completa y
> actualizada del API** (se genera desde el backend con `GET /api/docs-json`, también navegable
> en Scalar en `https://gensapi.ryancfx.click/api/docs`). **Antes de escribir una sola línea de
> código, regenerá tus tipos/cliente HTTP desde ese archivo** — ahí está el shape exacto y
> tipado de cada request y cada response, con todos los `enum` y todos los campos opcionales
> marcados como tales. Los 4 endpoints de este documento aparecen bajo el tag
> **`Inventario — Carga Inicial`**. Este documento no reemplaza el spec: explica el flujo de
> negocio, qué pantalla llama a qué endpoint, en qué orden, qué mostrar en cada estado, y cómo
> manejar cada error posible. **Si este documento y el `openapi.json` llegaran a diferir en el
> nombre exacto de un campo, gana el `openapi.json`** — pero eso no debería pasar: todo lo
> escrito acá se extrajo directamente del código fuente ya mergeado
> (`src/modules/inventory/carga-inicial/`), no de un diseño preliminar.
>
> Documento relacionado que ya deberías tener implementado y que esto reutiliza sin cambiarlo:
> `docs/frontend/PROMPT_PERMISOS_FRONTEND.md` (contrato de permisos — `GET /me/permissions`,
> `data.acciones`, manejo de `403 PERMISO_INSUFICIENTE`). Si ya implementaste
> `docs/frontend/PROMPT_APERTURA_INVENTARIO_FRONTEND.md` (Apertura de Inventario), leé la §0 de
> este documento con mucha atención: son dos pantallas que **parecen** lo mismo pero no lo son,
> y el error más caro que puede cometer un frontend acá es reutilizar el mismo formulario para
> ambas sin distinguir la semántica.

---

## 0. Qué es esto, en una frase, y por qué NO es lo mismo que ya viste en otras pantallas

Una pantalla — dentro de Inventario, junto a Conteos y Transferencias (si ya las tenés) — para
que un usuario **agregue existencias a un almacén sin que haya una compra a proveedor de por
medio**: hallazgos de auditoría, donaciones, ajustes puntuales, mercancía que apareció y hay que
sumar al sistema. Es un `Stock Entry` de ERPNext con `stock_entry_type: "Material Receipt"`.

**Esto NO es intercambiable con otras tres pantallas que tocan inventario y con las que se puede
confundir fácilmente.** Antes de tocar una sola línea de código, memorizá esta tabla — es la
pregunta que te van a hacer en QA la primera vez que algo salga mal:

| | **Carga Inicial** (este documento) | **Apertura de Inventario** (`PROMPT_APERTURA_INVENTARIO_FRONTEND.md`, si ya la implementaste) | **Conteo de Inventario** (si ya existe en tu app) | **Transferencias** (si ya existe en tu app) |
|---|---|---|---|---|
| Endpoint | `POST /inventory/carga-inicial` | `POST /apertura/inventario` | `POST /inventory/counts` | `POST /transferencias` |
| Doctype / distintivo | `Stock Entry`, `stock_entry_type: "Material Receipt"` | `Stock Reconciliation`, `purpose: "Opening Stock"` | `Stock Reconciliation`, `purpose: "Stock Reconciliation"` | `Stock Entry`, `stock_entry_type: "Material Transfer"` |
| Semántica de cantidad | Se **suma** a lo que ya existe | Fija el saldo **final** absoluto | Fija el saldo **final** absoluto | Mueve cantidad de un almacén a otro (no cambia el total) |
| Cuenta contable de contrapartida | `Company.stock_adjustment_account` (Gasto/P&L) | `14-03 APERTURA TEMPORAL` (Activo/Pasivo) | `Company.stock_adjustment_account` (Gasto/P&L) | Ninguna (no es un ajuste de valor, es un movimiento) |
| Repetible sin riesgo | **Sí** | No — cada envío fija un saldo nuevo | Sí (es justamente su propósito) | Sí |
| Para qué se usa | Hallazgos, donaciones, ajustes puntuales o recurrentes | Migración masiva de saldos de un sistema anterior (una sola vez, al principio) | Ajuste tras un conteo físico periódico | Reposicionar stock existente entre almacenes/sucursales |
| Menú sugerido | Inventario → Carga Inicial | Migración de Saldos → Inventario | Inventario → Conteos | Inventario → Transferencias |

**La pregunta que tenés que hacerte antes de cada línea del formulario: "¿esta cantidad se suma
o reemplaza?".** Acá siempre se suma. Si en algún momento el usuario quiere decir "el almacén
tiene EXACTAMENTE 120 unidades" (sin importar cuánto había antes), esa es la pantalla de Conteo o
la de Apertura de Inventario — **no esta**.

**Quién la usa:** cualquier perfil con acceso a Inventario (`Stock User`/`Stock Manager` — el
perfil **Inventario** del sistema de permisos). A diferencia de Apertura de Inventario (que
exigía un perfil específico distinto de Contabilidad), acá el permiso de fondo es el mismo que ya
usa Transferencias — si tu frontend ya gatea correctamente esa pantalla, este mismo criterio de
rol aplica acá sin sorpresas.

---

## 1. Los 4 endpoints — mapa completo

Todos bajo `/api/v1/inventory/carga-inicial`, todos requieren el header `X-Tenant` y el
`Authorization: Bearer` de siempre. Todas las respuestas exitosas vienen envueltas en
`{ "success": true, "data": {...} }` (o `{ "success": true, "data": [...], "meta": {...} }` para
el listado), igual que el resto del sistema.

| # | Método | Ruta | Acción de permiso | Qué hace |
|---|---|---|---|---|
| 1 | `POST` | `/inventory/carga-inicial` | `inventario.carga-inicial.crear` | Crea y confirma en un solo paso una entrada de inventario |
| 2 | `GET` | `/inventory/carga-inicial` | `inventario.carga-inicial.listar` | Lista las cargas iniciales ya registradas |
| 3 | `GET` | `/inventory/carga-inicial/:id` | `inventario.carga-inicial.listar` | Detalle completo, con sus líneas |
| 4 | `POST` | `/inventory/carga-inicial/:id/cancelar` | `inventario.carga-inicial.anular` | Anula un documento — revierte el inventario agregado |

**No hay `PUT`.** No existe edición. Si el usuario cargó mal una cantidad, un ítem o un costo, el
flujo es **anular y volver a cargar** con el dato correcto. No construyas un botón "Editar" para
las filas de esta pantalla — el backend no tiene ningún endpoint que lo acepte.

**`POST` crea y confirma en una sola llamada.** No hay un estado "borrador" intermedio como en
Conteos (que sí separa crear de someter, porque ahí tiene sentido revisar diferencias antes de
confirmar). Acá el botón del formulario dice algo como "Registrar entrada" — al hacer clic, el
movimiento queda inmediatamente reflejado en el inventario. No hay paso de revisión posterior a
"guardar borrador".

---

## 2. Permisos y gating de la pantalla

Mismo mecanismo de siempre: `GET /api/v1/me/permissions` al iniciar sesión, `data.acciones` en
memoria.

Las 3 acciones, con qué controla cada una:

| Acción | Controla |
|---|---|
| `inventario.carga-inicial.listar` | Ver la pantalla/pestaña "Carga Inicial" (listado + detalle) |
| `inventario.carga-inicial.crear` | El botón "Registrar entrada" / "Nueva carga inicial" |
| `inventario.carga-inicial.anular` | El botón "Anular" en un documento ya confirmado |

**Gating de entrada a la pantalla:** si el usuario no tiene `inventario.carga-inicial.listar`, no
muestres la opción en el menú de Inventario en absoluto.

**Sobre el perfil que hace falta:** los 3 permisos exigen acciones sobre el doctype
`Stock Entry` — el mismo doctype que usa Transferencias. Si tu frontend ya gatea correctamente
esa pantalla, el mismo criterio de "qué perfil ve qué" aplica acá sin ninguna sorpresa adicional
(a diferencia de lo que pasó con Apertura de Inventario, donde el perfil Contabilidad no
alcanzaba — acá no hay ese problema).

**Error 403 si igual se intenta una acción sin permiso:** mismo contrato de siempre —
`{ "code": "PERMISO_INSUFICIENTE", "message": "...", "details": { "acciones": [...], "requiere": [...], "marcadores": [] } }`.

---

## 3. El formulario — `POST /inventory/carga-inicial`

### 3.1 Request body

```jsonc
{
  "postingDate": "2026-01-15",
  "remarks": "Hallazgo de auditoría física — enero 2026",
  "branch": "Principal",
  "department": "Almacén General",
  "items": [
    { "itemCode": "TORN-001", "warehouse": "Principal - ACME", "qty": 50, "valuationRate": 15.50 },
    { "itemCode": "CLAVO-050", "warehouse": "Principal - ACME", "qty": 200, "valuationRate": 2.25 }
  ]
}
```

| Campo | Tipo | Obligatorio | Validación | Notas de UI |
|---|---|---|---|---|
| `postingDate` | string (fecha `YYYY-MM-DD`) | **Sí** | Debe ser una fecha válida | Date picker. A diferencia de Apertura de Inventario y de las Facturas de Apertura, **acá el backend no valida que no sea futura ni que caiga dentro de un Ejercicio Fiscal específico** — es una entrada de operación normal, no una migración histórica. No repliques esas dos validaciones acá; no existen del lado del servidor |
| `remarks` | string | No | Ninguna | Textarea corta. Si se omite, el backend guarda cadena vacía (no un texto por defecto como sí hace Apertura de Inventario) |
| `items` | array de objetos | **Sí**, mínimo 1 | Ver tabla de abajo | Grilla/tabla editable, una fila por ítem+almacén |
| `branch` | string | No | Debe ser una Sucursal existente. **Un documento no puede mezclar almacenes de sucursales distintas** (ver §4) | Picker de sucursales — solo mostrar el campo si el tenant tiene sucursales habilitadas. Si se omite, se deriva de los almacenes elegidos en `items` |
| `department` | string | No | Ninguna especial — informativo, nunca bloquea | Picker de departamentos, si el tenant los usa |

**Cada objeto dentro de `items[]`:**

| Campo | Tipo | Obligatorio | Validación | Notas de UI |
|---|---|---|---|---|
| `itemCode` | string | **Sí** | No vacío. Debe ser un `Item` existente en el catálogo | Picker/autocomplete del catálogo de artículos. **No permitas crear un artículo desde acá** — si no existe, dirigí al usuario al módulo de Catálogo |
| `warehouse` | string | **Sí** | No vacío. Debe ser un `Warehouse` existente | Picker de almacenes — este es el almacén **destino**, no hay concepto de almacén origen acá (es una entrada, no un movimiento) |
| `qty` | number | **Sí** | **Estrictamente positivo (`> 0`)** | Input numérico. **A diferencia de Apertura de Inventario, acá `0` NO es un valor válido** — el DTO lo rechaza con un error de validación. Tiene sentido: "agregar cero" no es una operación con significado en este flujo (en Apertura sí lo era, porque ahí `0` significa "declarar explícitamente que no queda nada") |
| `valuationRate` | number | **Sí** | Estrictamente positivo (`> 0`) | Input numérico de moneda. Es el costo unitario con el que esta entrada queda valorizada — obligatorio porque una entrada sin costo no tiene sentido contable |

> **Diferencia de validación de `qty` que hay que tener clarísima si reutilizás componentes con
> Apertura de Inventario:** ahí `qty: 0` es válido a propósito. **Acá no** — el backend responde
> `422`/`400` de validación si mandás `0` o un negativo. No copies el mismo componente de línea
> de ítem entre ambas pantallas sin ajustar esta regla, o vas a dejar pasar un `0` que el
> servidor va a rechazar recién al someter.

### 3.2 Sucursal — de dónde sale si el usuario no la elige explícitamente

Misma cascada automática del lado del servidor que ya usa Conteos y Apertura de Inventario — no
necesitás replicarla en el cliente, solo entenderla:

1. Si el usuario elige `branch` explícitamente en el formulario, esa gana siempre.
2. Si no, el servidor mira los almacenes de las líneas cargadas y, si todos pertenecen a la misma
   sucursal, usa esa.
3. Si no, mira si el usuario tiene una sucursal por defecto configurada en su perfil.
4. Si no, mira si hay una sucursal por defecto configurada a nivel de la dimensión contable de la
   compañía.
5. Si no, y el tenant tiene exactamente **una** sola sucursal en todo el sistema, usa esa.
6. Si nada de lo anterior resuelve una sucursal, y las sucursales son obligatorias para ese
   tenant, el servidor devuelve `BRANCH_REQUIRED` (ver §6) pidiendo que se mande `branch`
   explícito.

Para la UI: si el tenant tiene una sola sucursal, o el usuario tiene una por defecto, podés
ocultar o dejar opcional el campo `branch` con confianza de que todo va a resolver solo.

### 3.3 Respuesta exitosa

```jsonc
{
  "success": true,
  "data": {
    "id": "MAT-STE-2026-00042",
    "status": "submitted",
    "postingDate": "2026-01-15",
    "company": "ACME SRL",
    "branch": "Principal",
    "department": "Almacén General",
    "remarks": "Hallazgo de auditoría física — enero 2026",
    "items": [
      { "itemCode": "TORN-001", "warehouse": "Principal - ACME", "qty": 50, "valuationRate": 15.50, "amount": 775.00 },
      { "itemCode": "CLAVO-050", "warehouse": "Principal - ACME", "qty": 200, "valuationRate": 2.25, "amount": 450.00 }
    ],
    "totalValue": 1225.00,
    "createdAt": "2026-01-15 10:32:07"
  }
}
```

Campo por campo:

- `id`: el identificador del documento en ERPNext (naming nativo de `Stock Entry`, prefijo
  `MAT-STE-`). Usalo para el enlace al detalle desde el listado.
- `status`: siempre `"submitted"` en la respuesta de creación — nunca vas a ver `"draft"` acá (se
  crea y confirma junto, §1). El único otro valor posible, en listado/detalle, es `"cancelled"`.
- `items[].amount`: `qty × valuationRate`, ya calculado por ERPNext al confirmar el documento.
  Mostralo como columna de la grilla — no lo recalcules en el cliente, para no arriesgar una
  diferencia de redondeo con lo que ERPNext contabilizó realmente.
- `totalValue`: la suma de `items[].amount` de todo el documento, tomada del documento final, no
  recalculada por el BFF. Mostralo como total destacado al pie de la grilla y en el detalle.
- `remarks`/`branch`/`department`: pueden venir `null` si no se enviaron (branch/department) o
  cadena vacía (remarks, si se omitió — a diferencia de otros módulos, acá el backend no le pone
  un texto por defecto).

---

## 4. Sucursales mezcladas — el único error de validación de negocio propio de esta pantalla

**Regla dura: un solo documento no puede tener líneas de almacenes que pertenezcan a sucursales
distintas.** Si el usuario intenta cargar, en la misma llamada, un ítem del almacén
"Principal - Norte" (sucursal Norte) y otro del almacén "Principal - Sur" (sucursal Sur), el
servidor rechaza el documento completo.

**Response de error:**

```jsonc
{
  "statusCode": 400,
  "message": "Una carga inicial no puede mezclar almacenes de sucursales distintas. Cree un documento por sucursal.",
  "code": "MIXED_BRANCH_CARGA_INICIAL"
}
```

**Cómo manejarlo en la UI:**

- Si tu formulario permite elegir el almacén línea por línea, y ya tenés cacheado a qué sucursal
  pertenece cada almacén (por ejemplo, del catálogo de almacenes que ya consumís en otras
  pantallas), podés detectar esto ANTES de someter y marcar las filas en conflicto.
- Si preferís una solución más simple para la primera entrega: dejá que el servidor lo rechace y
  mostrá el `message` tal cual, con una sugerencia como *"Separá esta carga en varios documentos,
  uno por sucursal."*
- **Recomendación de UX**: si el tenant tiene sucursales, agrupá el picker de almacenes por
  sucursal (con separadores visuales) para que sea difícil elegir por error dos almacenes de
  sucursales distintas en el mismo documento — mismo criterio que ya deberías tener en Apertura
  de Inventario y en Conteos, si esas pantallas ya están construidas.

---

## 5. Requisito de configuración previa: `Company.stock_adjustment_account`

**Esta es la diferencia de configuración más importante respecto a Apertura de Inventario.**
Apertura de Inventario contabiliza contra `14-03 APERTURA TEMPORAL`, una cuenta que se provisiona
sola desde el módulo de Migración de Saldos (`POST /apertura/preparar`). **Esta pantalla usa una
cuenta completamente distinta**: `Company.stock_adjustment_account`, configurable en
`GET/PUT /api/v1/config/cuentas-empresa` (campo `stockAdjustmentAccount`).

**Si esa cuenta no está configurada, el servidor rechaza la creación ANTES de tocar ERPNext**,
con un mensaje que apunta directo a cómo arreglarlo:

```jsonc
{
  "statusCode": 400,
  "message": "No hay una cuenta de ajuste de inventario configurada (Company.stock_adjustment_account). Configúrela con PUT /api/v1/config/cuentas-empresa (campo \"stockAdjustmentAccount\") antes de registrar una carga inicial."
}
```

**Qué hacer en la UI cuando aparece este error:**

- Mostrá el mensaje tal cual — ya está redactado para el usuario final.
- Si tenés acceso de administrador a la pantalla de Configuración → Cuentas de la Empresa,
  ofrecé un enlace directo ahí (`/config/cuentas-empresa` o como se llame tu ruta interna) en vez
  de solo mostrar el texto — es un problema de configuración de una sola vez por tenant, y cuanto
  más fácil sea resolverlo desde acá, menos tickets de soporte vas a generar.
- **Considerá verificar esta configuración de antemano** (por ejemplo, al entrar a la pantalla de
  Carga Inicial por primera vez, o cacheando el resultado de `GET /config/cuentas-empresa`) para
  deshabilitar el botón "Registrar entrada" con un aviso explícito, en vez de dejar que el
  usuario llene todo el formulario y recién ahí se entere de que falta configuración. Esto es
  opcional para una primera entrega, pero mejora mucho la experiencia.

**No confundas esta cuenta con la de Apertura de Inventario.** Son dos cuentas contables
distintas, para dos pantallas distintas, verificadas independientemente. Configurar una no
resuelve la otra.

---

## 6. Manejo de errores — tabla exhaustiva con los mensajes EXACTOS

Igual criterio que el resto del sistema: **no reescribas, no resumas, no reemplaces estos
mensajes por un genérico "Ocurrió un error"**.

| HTTP | Disparador | Mensaje / código exacto del servidor |
|---|---|---|
| 400 | `Company.stock_adjustment_account` no configurada | Ver §5 — mensaje completo con la instrucción de cómo arreglarlo |
| 400 | Líneas con almacenes de sucursales distintas | `code: "MIXED_BRANCH_CARGA_INICIAL"` — ver §4 |
| 400 | Ninguna sucursal se pudo resolver y son obligatorias para este tenant | `code: "BRANCH_REQUIRED"`, `message: "La sucursal es obligatoria para documentos que afectan cuentas de resultado. Envíe \"branch\" o configure una sucursal por defecto en su usuario."` — mostrá el picker de sucursal si no estaba visible |
| 403 | El usuario no tiene la sucursal elegida/derivada asignada (y no es System Manager) | `No tienes acceso a la sucursal "<nombre>".` |
| 400 | `items` vacío, `itemCode`/`warehouse` vacíos, `qty` en 0 o negativo, `valuationRate` en 0 o negativo, `postingDate` con formato inválido | Errores de validación estándar del DTO (`class-validator`) — mapealos a la línea/campo correspondiente de la grilla. Recordá: **`qty: 0` es inválido acá**, a diferencia de Apertura de Inventario |
| 404 | `GET .../:id` o `POST .../:id/cancelar` sobre un id que no existe, o que pertenece a otro submódulo (ej. una Transferencia o un Conteo, que también son `Stock Entry`/`Stock Reconciliation` pero de otro tipo) | `Carga inicial no encontrada.` |
| 400 | Intentar anular un documento ya cancelado | `Esta carga inicial ya está cancelada.` |
| 403 | Falta el permiso correspondiente | Contrato genérico de siempre — `PERMISO_INSUFICIENTE` (§2) |

**Nota sobre el 404 "pertenece a otro submódulo":** como Carga Inicial, Transferencias y
Conteos usan doctypes de ERPNext compartidos (`Stock Entry`/`Stock Reconciliation`) distinguidos
solo por un campo interno (`stock_entry_type`/`purpose`), un `id` que existe pero que es, por
ejemplo, una Transferencia, va a darte `404 Carga inicial no encontrada` en este endpoint — es el
comportamiento correcto (ese documento no le pertenece a esta pantalla), no un bug. Si tu UI
permite pegar un ID a mano en algún lado, tené en cuenta este caso al redactar el mensaje.

---

## 7. Listado y detalle

### 7.1 `GET /inventory/carga-inicial`

Query params, todos opcionales:

| Param | Tipo | Notas |
|---|---|---|
| `limit` | number | Default `20`, máximo `100` (hereda de `PaginationDto`, común a toda la API) |
| `offset` | number | Default `0` |
| `branch` | string | Filtra por la sucursal del documento (de cabecera) |
| `department` | string | Filtra por departamento |
| `status` | `"submitted" \| "cancelled"` | Si se omite, trae ambos estados |

> **`search` y `orderBy` NO están implementados en este endpoint**, aunque el DTO los hereda de
> la clase base de paginación del proyecto — si los mandás, el servidor los ignora
> silenciosamente (no da error, simplemente no filtra ni ordena por ellos). No construyas un
> campo de búsqueda libre para esta pantalla asumiendo que el backend lo soporta.

**Response:**

```jsonc
{
  "success": true,
  "data": [
    {
      "id": "MAT-STE-2026-00042",
      "status": "submitted",
      "postingDate": "2026-01-15",
      "company": "ACME SRL",
      "branch": "Principal",
      "department": "Almacén General",
      "remarks": "Hallazgo de auditoría física — enero 2026",
      "createdAt": "2026-01-15 10:32:07"
    }
  ],
  "meta": { "limit": 50, "offset": 0, "total": 12 }
}
```

**Nota importante: el listado NO incluye `items[]` ni `totalValue`** — a propósito, para no
traer todas las líneas de cada documento en una tabla de resumen (mismo criterio que Apertura de
Inventario y que Ventas/Compras de Migración de Saldos). Si necesitás mostrar el monto total en
el listado, pedí el detalle bajo demanda (por ejemplo, al expandir una fila) — no está incluido
en el listado por defecto.

Tabla sugerida: Fecha (`postingDate`) | Sucursal (`branch`, o `—`) | Departamento (`department`,
o `—`) | Notas (`remarks`, truncado) | Estado (badge: verde="submitted", gris="cancelled") |
Acciones (Ver, Anular si `status === "submitted"`).

### 7.2 `GET /inventory/carga-inicial/:id` — detalle

Mismo shape completo que §3.3 (con `items[]` y `totalValue`). Usalo al hacer clic en una fila del
listado, o para armar la pantalla de confirmación antes de anular.

### 7.3 `POST /inventory/carga-inicial/:id/cancelar` — anular

Sin body. Confirmación previa obligatoria en la UI:

> *"¿Anular esta carga inicial? El inventario que este documento agregó será revertido. Esta
> acción no se puede deshacer directamente — para volver a registrar la entrada, cree un nuevo
> documento."*

**Response exitosa:**

```jsonc
{ "success": true, "data": { "message": "Carga inicial cancelada. El inventario fue revertido." } }
```

Mostrá ese `message` tal cual. Después de anular, refrescá el listado/detalle — el `status` pasa
a `"cancelled"`. Si tenés una pantalla de Inventario general (existencias actuales) abierta en
otra pestaña, considerá invalidar su caché/refrescarla, ya que las cantidades reales cambiaron.

**Advertencia práctica, igual que en Apertura de Inventario:** si entre que se cargó el documento
y el momento de la anulación ya se vendió o transfirió algo de ese mismo ítem, anular puede dejar
el inventario en un estado inesperado o incluso negativo. No es necesario bloquear la anulación
por esto (el backend no lo bloquea), pero es razonable que el texto de confirmación lo mencione
si querés dar más contexto al usuario.

---

## 8. Qué NO construir / decisiones ya tomadas que no hay que cuestionar

- **No hay borrador.** Crear siempre confirma.
- **No hay edición.** Corregir = anular + cargar de nuevo.
- **No hay `/importar` por lote.** A diferencia de Ventas/Compras de Migración de Saldos, este
  endpoint no tiene una variante de carga masiva. Si necesitás cargar muchas líneas, usá el
  array `items[]` del mismo `POST` (acepta varias líneas en una sola llamada) — no existe un
  segundo endpoint para esto.
- **No hay soporte de lote/serie en esta primera versión.** Si tu catálogo de artículos maneja
  ítems con número de lote o serie, no los incluyas en esta pantalla todavía.
- **No se pueden crear artículos ni almacenes desde acá.** Los pickers de `itemCode`/`warehouse`
  solo buscan entre los que ya existen.
- **`qty: 0` no es válido acá** (a diferencia de Apertura de Inventario) — no lo permitas en el
  formulario del lado del cliente, y no te sorprendas si el backend lo rechaza.
- **El listado no trae `items[]` ni `totalValue`** — pedí el detalle bajo demanda si los
  necesitás.
- **`search`/`orderBy` en el listado no hacen nada** — no los expongas como si funcionaran.
- **No confundas la cuenta contable de esta pantalla con la de Apertura de Inventario** (§5) —
  son dos cuentas distintas, configuradas por separado.

---

## 9. Checklist de implementación

- [ ] Regenerado el cliente/tipos desde el `openapi.json` actualizado — los 4 endpoints deben
      aparecer bajo el tag `Inventario — Carga Inicial`.
- [ ] Pantalla ubicada dentro del menú de Inventario, oculta si el usuario no tiene
      `inventario.carga-inicial.listar` (§2).
- [ ] Formulario "Registrar entrada" (§3) con grilla editable de líneas
      (`itemCode`/`warehouse`/`qty`/`valuationRate`), validando `qty > 0` y
      `valuationRate > 0` del lado del cliente (nunca `0`, a diferencia de Apertura de
      Inventario), y el picker de sucursal condicional (§3.2).
- [ ] Validación/aviso de sucursales mezcladas (§4), aunque sea solo mostrando el error del
      servidor si no implementás la detección preventiva en el cliente.
- [ ] Manejo explícito del error de `stock_adjustment_account` no configurada (§5), idealmente
      con un enlace directo a la pantalla de configuración correspondiente.
- [ ] Todos los mensajes de error de §6 mapeados correctamente, sin reescribir el texto del
      servidor, con atención especial a `MIXED_BRANCH_CARGA_INICIAL` y `BRANCH_REQUIRED`.
- [ ] Listado (§7.1) con filtros por sucursal/departamento/estado, paginación, y acción "Anular"
      con su propio texto de confirmación (§7.3 — debe mencionar que revierte inventario).
- [ ] Pantalla de detalle (§7.2) mostrando `items[]` con sus montos y el `totalValue`.
- [ ] Verificado que ninguna pantalla de esta sección ofrece editar, importar por lote, ni
      cargar ítems con lote/serie (§8).
- [ ] Confirmado que el equipo/QA entiende la diferencia entre esta pantalla, Apertura de
      Inventario, Conteos y Transferencias (§0) — es el error más probable si dos personas
      distintas construyen estas pantallas sin leer este documento completo.
- [ ] Probado un caso completo: registrar una entrada con un ítem nuevo (`qty > 0`), verificar
      en la pantalla de Inventario general que el stock aparece correctamente sumado a lo que
      ya había, anular el documento, y verificar que el stock vuelve a su estado anterior.
