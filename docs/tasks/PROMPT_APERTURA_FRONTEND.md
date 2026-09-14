# Prompt para agente de frontend — Módulo "Migración de Saldos" (Facturas de Apertura)

> **Para quien recibe este documento.** Esto describe un **módulo enteramente nuevo** del BFF,
> ya implementado, probado y desplegable: `/api/v1/apertura`. No existe ninguna pantalla previa
> que reemplazar — hay que construir todo desde cero. Este documento es exhaustivo a propósito:
> cada endpoint, cada campo, cada mensaje de error y cada regla de negocio que el frontend debe
> respetar están descritos explícitamente, para que no quede ninguna decisión de contrato librada
> a la interpretación.
>
> **En el repo del frontend hay un archivo `openapi.json` con la documentación completa y
> actualizada del API** (se genera desde el backend con `GET /api/docs-json`, también navegable
> en Scalar en `https://gensapi.ryancfx.click/api/docs`). **Antes de escribir una sola línea de
> código, regenerá tus tipos/cliente HTTP desde ese archivo** — ahí está el shape exacto y
> tipado de cada request y cada response, con todos los `enum`, todos los campos opcionales
> marcados como tales, y los ejemplos de cada uno. Este documento no reemplaza el spec: explica
> el **flujo de negocio**, qué pantalla llama a qué endpoint, en qué orden, qué mostrar en cada
> estado, y cómo manejar cada error posible. **Si este documento y el `openapi.json` llegaran a
> diferir en el nombre exacto de un campo, gana el `openapi.json`** — pero eso no debería pasar:
> todo lo escrito acá se extrajo directamente del código fuente ya mergeado, no de un diseño
> preliminar.
>
> Documentos relacionados que ya deberías tener implementados y que este módulo **reutiliza sin
> cambiarlos**: `docs/frontend/PROMPT_PERMISOS_FRONTEND.md` (contrato de permisos —
> `GET /me/permissions`, `data.acciones`, manejo de `403 PERMISO_INSUFICIENTE`). Este módulo no
> introduce ningún mecanismo de permisos nuevo, solo 9 acciones nuevas dentro del mismo contrato
> que ya conocés.

---

## 0. Qué es esto, en una frase

Una pantalla — normalmente bajo un menú de "Configuración" / "Herramientas", **nunca** en el
menú de operación diaria — para que un contador cargue, **una sola vez** al empezar a usar este
ERP, las facturas de venta y de compra que ya existían en el sistema anterior (otro software, una
libreta, un Excel) y que **todavía tienen saldo pendiente**, para que ese saldo aparezca
correctamente en Cuentas por Cobrar / Cuentas por Pagar — **sin** generar un comprobante fiscal
(NCF) nuevo, **sin** duplicar el ITBIS que esa factura ya declaró en el sistema anterior, y
**sin** ensuciar los reportes de ventas/compras del período actual.

Es exactamente el mismo concepto que "saldos de apertura" / "migración inicial" en cualquier
sistema contable: la factura vieja se registra por su **saldo pendiente** (no por su total
original), con la fecha real que tenía, y queda marcada de forma permanente como "de apertura" —
nunca se puede editar, nunca se le puede emitir un e-CF, nunca se le puede aplicar una nota de
crédito/débito ni una devolución (todo eso está bloqueado por el servidor — ver §7).

**Quién la usa:** un perfil de Administrador o Contabilidad. Nunca Ventas ni Compras — esos
perfiles ni siquiera van a ver la acción habilitada (ver §2).

---

## 1. Los 13 endpoints — mapa completo

Todos bajo `/api/v1/apertura`, todos requieren el header `X-Tenant` y el `Authorization: Bearer`
de siempre, exactamente igual que cualquier otro endpoint del BFF. Todas las respuestas
exitosas vienen envueltas en `{ "success": true, "data": {...} }`.

| # | Método | Ruta | Acción de permiso | Qué hace |
|---|---|---|---|---|
| 1 | `GET` | `/apertura/preflight` | `apertura.preparar.ver` | Diagnóstico — ¿está el tenant listo para migrar? No escribe nada |
| 2 | `POST` | `/apertura/preparar` | `apertura.preparar.ejecutar` | Prepara el tenant (idempotente) — crea lo que falte |
| 3 | `POST` | `/apertura/ventas` | `apertura.ventas.crear` | Carga y confirma el saldo de un **cliente** |
| 4 | `GET` | `/apertura/ventas` | `apertura.ventas.listar` | Lista las facturas de apertura de venta |
| 5 | `GET` | `/apertura/ventas/:id` | `apertura.ventas.listar` | Detalle de una |
| 6 | `POST` | `/apertura/ventas/:id/cancel` | `apertura.ventas.anular` | Anula una |
| 7 | `POST` | `/apertura/ventas/importar` | `apertura.ventas.crear` | Carga masiva (lote) de ventas |
| 8 | `POST` | `/apertura/compras` | `apertura.compras.crear` | Carga y confirma el saldo de un **proveedor** |
| 9 | `GET` | `/apertura/compras` | `apertura.compras.listar` | Lista las facturas de apertura de compra |
| 10 | `GET` | `/apertura/compras/:id` | `apertura.compras.listar` | Detalle de una |
| 11 | `POST` | `/apertura/compras/:id/cancel` | `apertura.compras.anular` | Anula una |
| 12 | `POST` | `/apertura/compras/importar` | `apertura.compras.crear` | Carga masiva (lote) de compras |
| 13 | `GET` | `/apertura/resumen` | `apertura.resumen.ver` | Cuadre: ¿la migración está balanceada? |

**No hay `PUT` en ningún lado.** No existe edición de una factura de apertura. Si el usuario se
equivocó de monto o de fecha, el flujo es: **anular** (`.../cancel`) y **volver a cargar** con el
dato correcto. No construyas ningún formulario de "editar" para este módulo — sería trabajo
tirado, el backend lo rechazaría (no hay endpoint que lo acepte).

**`POST /apertura/ventas` y `POST /apertura/compras` crean Y confirman en una sola llamada.** No
hay un estado "borrador" intermedio como en el módulo de Facturación normal (`/invoices`, que sí
separa crear de someter). El botón del formulario dice "Cargar saldo" (o similar), no "Guardar" —
al hacer clic, la factura queda inmediatamente confirmada en ERPNext. No hay paso de revisión
posterior a "guardar borrador".

---

## 2. Permisos y gating de la pantalla

Seguí exactamente el mismo mecanismo que ya usás para el resto de la app (`PROMPT_PERMISOS_FRONTEND.md`):
pedí `GET /api/v1/me/permissions` al iniciar sesión y guardá `data.acciones` en memoria.

Las 9 acciones nuevas, con qué controla cada una:

| Acción | Controla |
|---|---|
| `apertura.preparar.ver` | Ver la sección de Diagnóstico (§3) |
| `apertura.preparar.ejecutar` | El botón "Preparar" dentro del Diagnóstico |
| `apertura.ventas.listar` | Ver la pestaña/pantalla "Ventas" (listado + detalle) |
| `apertura.ventas.crear` | El botón "Cargar saldo de cliente" + el botón "Importar" de ventas |
| `apertura.ventas.anular` | El botón "Anular" en una factura de venta de apertura |
| `apertura.compras.listar` | Ver la pestaña/pantalla "Compras" |
| `apertura.compras.crear` | El botón "Cargar saldo de proveedor" + "Importar" de compras |
| `apertura.compras.anular` | El botón "Anular" en una factura de compra de apertura |
| `apertura.resumen.ver` | La pestaña/pantalla "Cuadre" |

**Gating de entrada al módulo completo:** si el usuario no tiene `apertura.preparar.ver` **ni**
`apertura.ventas.listar` **ni** `apertura.compras.listar`, **no muestres la entrada de menú en
absoluto** — para la enorme mayoría de usuarios (Ventas, Compras, Cajero POS, Inventario) este
módulo no debería ni aparecer como opción.

**Nota especial sobre `apertura.compras.*` — no hace falta que hagas nada, pero para que
entiendas por qué el comportamiento es simple:** en el resto del sistema, las acciones sobre
`Purchase Invoice` (Compras vs. Gastos) dependen de "roles marcadores" que el servidor resuelve
(ver §11 de `PROMPT_PERMISOS_FRONTEND.md`) — un usuario de perfil "Gastos" puede ver
`gastos.crear: true` pero `compras.factura.crear: false`. **Acá no aplica nada de eso**: una
factura de apertura de compra no es ni una Compra ni un Gasto (es un saldo inicial), así que
`apertura.compras.crear`/`apertura.compras.anular` **no dependen de esos marcadores en absoluto**
— si el usuario tiene el permiso de fondo sobre `Purchase Invoice` (crear/someter/cancelar), lo
tiene sin importar si su perfil es "Compras", "Gastos", ambos o "Contabilidad". Ya viene resuelto
en `data.acciones`, no necesitás lógica adicional.

**Error 403 si igual se intenta una acción sin permiso:** mismo contrato de siempre —
`{ "code": "PERMISO_INSUFICIENTE", "message": "...", "details": { "acciones": [...], "requiere": [...], "marcadores": [] } }`.
Mostrá el `message` tal cual y refrescá `/me/permissions` en segundo plano (puede que el permiso
haya cambiado). No debería ocurrir nunca si el gating de botones está bien hecho.

---

## 3. Pantalla de Diagnóstico y Preparación

Esta es la **puerta de entrada obligatoria**. Antes de dejar que el usuario cargue una sola
factura, el frontend debe verificar que el tenant esté listo.

### 3.1 `GET /apertura/preflight?desde=YYYY-MM-DD&hasta=YYYY-MM-DD`

Ambos parámetros de query son **opcionales strings de fecha** (`YYYY-MM-DD`). Si se omite
`desde`, el backend asume el 1 de enero de hace 3 años; si se omite `hasta`, asume hoy. **Igual,
mostrale al usuario un selector simple de "¿desde qué año necesitás migrar?" y "¿hasta qué año?"**
(dos selects de año, o dos date pickers) y siempre mandá ambos parámetros explícitos con el
primer y último día del rango de años que el usuario indique — no confíes en los defaults del
servidor para la experiencia real de uso, son solo un fallback razonable.

**Response:**

```jsonc
{
  "success": true,
  "data": {
    "listo": false,
    "ejerciciosFiscales": {
      "requeridos": ["2023", "2024", "2025"],
      "existentes": ["2026"],
      "faltantes": ["2023", "2024", "2025"]
    },
    "cuentaApertura": {
      "existe": false,
      "cuenta": null,
      "numeroSugerido": "14-03"
    },
    "serieNumeracion": {
      "existe": true,
      "ventas": "APER-SINV-.#####",
      "compras": "APER-PINV-.#####"
    },
    "bloqueantes": [
      "Faltan los ejercicios fiscales 2023, 2024, 2025. Sin ellos ERPNext rechaza cualquier factura de esas fechas.",
      "No existe una cuenta contable de apertura (account_type = 'Temporary') en el catálogo."
    ]
  }
}
```

Campo por campo:

- `listo` (boolean): si es `true`, no hay nada bloqueando — el usuario puede pasar directo a
  cargar facturas (podés incluso saltear esta pantalla u ocultarla si querés, mostrando solo un
  banner "✅ Listo para migrar").
- `ejerciciosFiscales.requeridos`: los años (como string, ej. `"2024"`) que cubre el rango pedido.
- `ejerciciosFiscales.existentes`: cuáles de esos años YA tienen un Ejercicio Fiscal en ERPNext.
- `ejerciciosFiscales.faltantes`: cuáles hacen falta crear. Mostralos como una lista simple.
- `cuentaApertura.existe` / `.cuenta` (el nombre completo de la cuenta contable, ej.
  `"14-03 - APERTURA TEMPORAL - JBC"`, o `null` si no existe) / `.numeroSugerido` (siempre
  `"14-03"` — es informativo, no hace falta mostrarlo salvo que quieras).
- `serieNumeracion.existe` / `.ventas` / `.compras`: si las series de numeración especiales de
  apertura (`APER-SINV-.#####` / `APER-PINV-.#####`) ya están disponibles en ERPNext. **Esto casi
  nunca debería ser `false`** — se provisiona automáticamente al actualizar el backend. Si lo ves
  en `false`, es un problema de infraestructura (el sitio de ERPNext no corrió `bench migrate`
  todavía), no algo que el usuario pueda resolver desde el botón "Preparar" — mostralo igual en
  `bloqueantes` (el backend ya te da el texto) pero no prometas que "Preparar" lo va a arreglar.
- `bloqueantes` (array de strings): **mensajes ya redactados, en español, listos para mostrar tal
  cual al usuario.** No los reformules ni los recombines — muéstralos como una lista con viñetas,
  en un panel de advertencia (amarillo/rojo).

**UI sugerida:** un panel arriba de toda la pantalla, con:
- ✅ "Listo para migrar" (verde) si `listo: true`.
- ⚠️ Lista de `bloqueantes` + botón **"Preparar tenant"** si `listo: false`.

Mientras `listo` sea `false`, **deshabilitá los formularios de carga** de venta/compra (o mostrá
un aviso claro de que no van a funcionar hasta preparar el tenant) — no dejes que el usuario
pierda tiempo llenando un formulario que el servidor va a rechazar con un 400 sobre "no existe
ejercicio fiscal" o "no hay cuenta de apertura".

### 3.2 `POST /apertura/preparar`

Body: mismo shape que los query params de arriba, pero en JSON:

```jsonc
{ "desde": "2023-01-01", "hasta": "2025-12-31" }
```

Ambos campos opcionales (mismos defaults que `preflight`). El botón "Preparar tenant" debe mandar
el **mismo rango** que se usó para el último `preflight` mostrado en pantalla, para que el
resultado sea consistente con lo que el usuario vio.

**Es completamente idempotente** — se puede llamar tantas veces como haga falta sin ningún
efecto secundario negativo. Si ya está todo preparado, simplemente no hace nada y lo informa.

**Response:**

```jsonc
{
  "success": true,
  "data": {
    "ejerciciosFiscales": {
      "creados": ["2023", "2024", "2025"],
      "yaExistian": ["2026"]
    },
    "cuentaApertura": {
      "cuenta": "14-03 - APERTURA TEMPORAL - JBC",
      "creada": true
    }
  }
}
```

Después de un `preparar` exitoso, **volvé a llamar `GET /apertura/preflight`** con el mismo rango
para refrescar el panel y confirmar `listo: true` antes de habilitar el resto de la pantalla —
no asumas que salió bien solo porque el POST no tiró error.

**Error esperable — 400, "no se puede crear automáticamente la cuenta de apertura":** si el
catálogo de cuentas de ese tenant no tiene la estructura estándar (no existe el grupo
`"14 - OTROS ACTIVOS"`), el backend no puede inferir dónde colgar la cuenta nueva y devuelve un
mensaje explicando que hay que crearla manualmente (`account_type = "Temporary"`) desde el módulo
de Contabilidad → Plan de Cuentas. Mostrá ese mensaje tal cual — es un caso raro (tenants con un
catálogo de cuentas no estándar) pero perfectamente posible.

**Error esperable — 403, "falta System Manager":** crear un Ejercicio Fiscal en ERPNext es una
operación que **solo el rol nativo `System Manager`** puede hacer (así viene de fábrica en
ERPNext — no es una restricción nuestra). En la práctica, esto significa que **solo el perfil
Administrador** del tenant puede ejecutar "Preparar" exitosamente, aunque el perfil Contabilidad
sí pueda ver el diagnóstico y cargar facturas normalmente. Si un usuario de Contabilidad hace
clic en "Preparar" y el tenant todavía no está listo, va a recibir este 403. Mostrá el mensaje del
servidor y sugerí (en el propio texto de tu UI, no hace falta que el backend te lo diga) contactar
al Administrador del tenant para que ejecute la preparación una única vez.

---

## 4. Cargar una factura de venta (cliente)

### 4.1 `POST /apertura/ventas`

**Request body** — cada campo con su validación exacta (replicá estas mismas validaciones en el
formulario del lado del cliente, para dar feedback inmediato, pero **nunca confíes solo en el
cliente**: el servidor las vuelve a aplicar todas):

| Campo | Tipo | Obligatorio | Validación | Notas de UI |
|---|---|---|---|---|
| `customer` | string | **Sí** | Debe ser un ID de `Customer` existente | Picker que consuma `GET /customers` de siempre. **No permitas crear un cliente desde acá** — si no existe, el mensaje debe decir "cree primero el cliente en el módulo de Clientes" |
| `numeroFacturaOriginal` | string | **Sí** | No vacío | Input de texto libre. Ej.: `"FAC-2024-0117"` |
| `fechaFactura` | string (fecha `YYYY-MM-DD`) | **Sí** | No puede ser posterior a hoy | Date picker con el máximo seleccionable = hoy |
| `fechaVencimiento` | string (fecha) | No | Si se manda, no puede ser anterior a `fechaFactura`. Si se omite, el backend usa `fechaFactura` | Date picker, mínimo = `fechaFactura` seleccionada |
| `montoPendiente` | number | **Sí** | Positivo (`> 0`) | Input numérico. **El label/helper text debe dejar clarísimo que es el SALDO PENDIENTE, no el total original de la factura** — ver el recuadro de abajo |
| `descripcion` | string | No | Ninguna | Textarea corta. Útil para anotar el total original si difiere del pendiente |
| `origen` | string | No | Ninguna | Input de texto libre. Ej.: `"Excel 2023"`, `"Mónica 9"`, `"Libreta manual"` |
| `ncfOriginal` | string | No | Si se manda: debe cumplir el patrón `letra(B o E) + 2 dígitos + 8 a 10 dígitos` (ej. `B0100000123`, `E310000012345`) | Input de texto. Ver §4.2 |
| `reportarEnDgii` | boolean | No (default `false`) | Si es `true`, `ncfOriginal` pasa a ser obligatorio | Checkbox, apagado por defecto. Ver §4.2 |
| `moneda` | string | No | Ninguna especial | Select de monedas habilitadas del tenant. Si se omite, usa la moneda de la compañía |
| `tasaCambio` | number | Condicional | **Obligatorio si `moneda` es distinta de la moneda de la compañía**, positivo | Input numérico, aparece SOLO si `moneda` ≠ moneda de la empresa |
| `branch` | string | No | Debe ser una Sucursal existente, si se manda | Picker de sucursales — solo mostrar el campo si el tenant tiene sucursales habilitadas |
| `costCenter` | string | No | Ninguna especial | Normalmente no hace falta exponerlo en la UI — el backend usa el Centro de Costo por defecto de la compañía si se omite. Solo agregalo si el tenant maneja varios centros de costo y el usuario necesita elegir |

> **Recuadro importante — "saldo pendiente" vs. "total original":** este es el campo donde más
> confusión puede haber. La factura vieja pudo haber sido, por ejemplo, de RD$25,000, de los
> cuales el cliente ya pagó RD$6,500 en el sistema anterior. **`montoPendiente` es 18,500, NO
> 25,000.** El sistema **no** modela "factura completa + un pago histórico" — eso obligaría a
> inventar una cuenta bancaria que recibió una plata que hoy ya está conciliada en otro lado. Si
> el usuario quiere dejar constancia del total original, que lo escriba en `descripcion` (texto
> libre, ej. `"Total original RD$25,000 — abonado RD$6,500 — pendiente RD$18,500"`) — es solo
> informativo, no afecta ningún cálculo contable.

### 4.2 El bloque de NCF — lógica que el formulario debe replicar

Este bloque tiene una interacción de 3 campos que hay que armar bien en la UI:

1. Por defecto, `ncfOriginal` está vacío y `reportarEnDgii` está apagado — **este es el caso más
   común**: la factura vieja no tenía NCF, o lo tenía pero ya se declaró en el sistema anterior y
   no hace falta volver a reportarla.
2. Si el usuario escribe un `ncfOriginal` (porque la factura sí tenía uno físico), el campo
   `reportarEnDgii` se **habilita** (antes puede estar deshabilitado/oculto) pero sigue en `false`
   por defecto — cargar el NCF por sí solo NO activa el reporte a la DGII.
3. Solo si el usuario **además** marca `reportarEnDgii: true` es porque esa factura vieja
   **todavía no se declaró** y hay que incluirla en el reporte 607 del mes que corresponda a
   `fechaFactura`. En ese caso, `ncfOriginal` pasa a ser obligatorio (si el usuario intenta
   marcar `reportarEnDgii` sin haber puesto un NCF, bloqueá el checkbox o mostrá el error de
   validación en el propio formulario antes de llamar al backend).

Formato de `ncfOriginal` — mismo patrón que cualquier NCF dominicano: una letra (`B` para físico,
`E` para electrónico), 2 dígitos que identifican el tipo de comprobante, y entre 8 y 10 dígitos de
secuencial. Ejemplos válidos: `B0100000123`, `B0200000045`, `E310000001234`. El backend deriva el
**tipo** de comprobante de los 2 dígitos después de la letra (ej. `B01` → Crédito Fiscal) — no
hay un campo separado de "tipo" en el formulario de ventas (a diferencia del de compras, ver
§5). Los 11 tipos válidos que el backend reconoce son: `B01` (Crédito Fiscal), `B02` (Consumo),
`B03` (Nota de Débito), `B04` (Nota de Crédito), `B11` (Compras/Informal), `B12` (Registro Único
de Ingresos), `B13` (Gastos Menores), `B14` (Régimen Especial), `B15` (Gubernamental), `B16`
(Exportaciones), `B17` (Pagos al Exterior). En la práctica, para una factura de **venta** vieja,
lo esperable es `B01` o `B02` (y ocasionalmente `B14`/`B15`) — no necesitás validar el tipo en el
cliente más allá del formato general, el servidor rechaza cualquier prefijo que no esté en esa
lista de 11.

### 4.3 Multimoneda

Si el tenant tiene más de una moneda habilitada, mostrá el selector `moneda` (con la moneda de la
compañía preseleccionada). En cuanto el usuario elija una moneda **distinta** a la de la
compañía, aparece el campo `tasaCambio`, obligatorio, sin ningún valor sugerido — **el sistema
nunca busca ni asume una tasa histórica**, porque una factura de 2024 necesita la tasa de cambio
de ese momento, que solo el usuario conoce (o tiene en su sistema anterior). No conectes este
campo a ningún endpoint de tasas de cambio actuales — sería incorrecto rellenarlo con la tasa de
HOY.

### 4.4 Respuesta exitosa

```jsonc
{
  "success": true,
  "data": {
    "id": "APER-SINV-00007",
    "numeroFacturaOriginal": "FAC-2024-0117",
    "customer": "CLI-00042",
    "customerName": "Ferretería El Progreso",
    "fechaFactura": "2024-11-03",
    "fechaVencimiento": "2024-12-03",
    "montoPendiente": 18500.00,
    "saldoActual": 18500.00,
    "ncf": "B0100000123",
    "ncfType": "B01",
    "reportadaEnDgii": false,
    "origen": "Mónica 9",
    "currency": "DOP",
    "branch": null,
    "estado": "submitted",
    "esApertura": true
  }
}
```

- `id`: el docname real en ERPNext (`APER-SINV-000NN` — nota el prefijo `APER-SINV-` distinto al
  de facturas normales, `ACC-SINV-...`; es intencional, para que nunca se confunda con una
  factura de facturación del día a día con solo mirar el número).
- `montoPendiente`: el mismo valor que se mandó (el total de la factura de apertura es igual al
  saldo, porque no tiene impuestos ni descuentos).
- `saldoActual`: cuánto queda pendiente de cobrar **ahora mismo** — al momento de crearla, es
  igual a `montoPendiente`; después de que el cliente pague algo (vía el módulo de Cobros
  normal), este valor baja.
- `estado`: siempre `"submitted"` en la respuesta de creación (nunca `"draft"` — no existe ese
  estado para este flujo).
- `esApertura`: siempre `true`. Es un campo de conveniencia para que, si en algún momento tu
  frontend mezcla resultados de este endpoint con otros, puedas distinguir el origen sin mirar
  el prefijo del `id`.

Al recibir la respuesta, mostrá una confirmación clara con el `id` y ofrecé un botón **"Cargar
otra"** que limpia el formulario sin salir de la pantalla — cargar varias facturas seguidas es el
flujo normal de uso.

---

## 5. Cargar una factura de compra (proveedor)

### 5.1 `POST /apertura/compras`

Formulario simétrico al de ventas, con estas diferencias exactas de nombre de campo y de
comportamiento:

| Campo | Tipo | Obligatorio | Equivalente en el form de ventas | Notas |
|---|---|---|---|---|
| `supplier` | string | **Sí** | `customer` | Picker de `/suppliers`. Tampoco se puede crear un proveedor desde acá |
| `numeroFacturaProveedor` | string | **Sí** | `numeroFacturaOriginal` | ⚠️ Ojo: es el número que el **proveedor** le puso a SU factura — conceptualmente distinto (en ventas, el número es el que tu propio sistema anterior le dio a la factura del cliente) |
| `fechaFactura` | string (fecha) | **Sí** | igual | No puede ser posterior a hoy |
| `fechaVencimiento` | string (fecha) | No | igual | |
| `montoPendiente` | number | **Sí** | igual | Mismo concepto: saldo pendiente, no el total original |
| `descripcion` | string | No | igual | |
| `origen` | string | No | igual | |
| `ncfProveedor` | string | No | `ncfOriginal` | **Sin validación de formato en el backend** (a diferencia de ventas) — es un NCF de un tercero, se acepta tal cual venga |
| `tipoComprobante` | string | No | *(no existe en ventas)* | **Select explícito**, uno de los 11 tipos DGII (`B01`...`B17`) — a diferencia de ventas, en compras el tipo NO se deriva del NCF, se elige aparte |
| `reportarEnDgii` | boolean | No (default `false`) | igual | Si `true`, exige `ncfProveedor` |
| `moneda` / `tasaCambio` | | | igual | Misma lógica que §4.3 |
| `branch` / `costCenter` | | | igual | |

### 5.2 Respuesta exitosa

```jsonc
{
  "success": true,
  "data": {
    "id": "APER-PINV-00003",
    "numeroFacturaProveedor": "PROV-F-2024-055",
    "supplier": "PROV-00012",
    "supplierName": "Distribuidora del Caribe",
    "fechaFactura": "2024-11-03",
    "fechaVencimiento": "2024-12-03",
    "montoPendiente": 9200.00,
    "saldoActual": 9200.00,
    "ncf": "B1500000045",
    "ncfType": null,
    "reportadaEnDgii": false,
    "origen": "Excel 2023",
    "currency": "DOP",
    "branch": null,
    "estado": "submitted",
    "esApertura": true
  }
}
```

Nota: `ncfType` puede venir `null` incluso si `ncf` tiene valor — porque en compras el tipo es un
campo separado (`tipoComprobante` en el request) que el usuario pudo no haber llenado. No lo
trates como una inconsistencia.

---

## 6. Manejo de errores — tabla exhaustiva con los mensajes EXACTOS

El backend valida **todo** antes de tocar ERPNext y devuelve mensajes ya redactados en español,
listos para mostrar directo al usuario. **No los reescribas, no los resumas, no los reemplaces
por un mensaje genérico tipo "Ocurrió un error"** — cada uno le dice al usuario exactamente qué
corregir. Mapealos a los campos del formulario cuando tenga sentido (ej. un 409 de duplicado
debería marcar el campo `numeroFacturaOriginal`/`numeroFacturaProveedor` en rojo).

| HTTP | Disparador | Mensaje exacto del servidor (interpolado con los datos reales del request) |
|---|---|---|
| 400 | Fecha de factura posterior a hoy | `La fecha de la factura no puede ser futura.` |
| 400 | `fechaVencimiento` anterior a `fechaFactura` | `fechaVencimiento no puede ser anterior a fechaFactura.` |
| 400 | `reportarEnDgii: true` sin NCF | `No se puede reportar a la DGII una factura sin NCF — indique ncfOriginal.` (ventas) / `...indique ncfProveedor.` (compras) |
| 400 | No existe un Ejercicio Fiscal que cubra `fechaFactura` | `No existe un ejercicio fiscal que cubra la fecha 2024-11-03. Ejecute POST /api/v1/apertura/preparar con un rango que la incluya.` |
| 400 | No existe la cuenta de apertura en el tenant | `No hay cuenta de apertura configurada (Account.account_type = "Temporary"). Ejecute POST /api/v1/apertura/preparar antes de cargar facturas de apertura.` |
| 400 | `moneda` distinta de la de la compañía sin `tasaCambio` | `La factura está en USD (la compañía opera en DOP) — indique tasaCambio: la tasa histórica de esa fecha no se asume ni se resuelve automáticamente.` |
| 400 | `ncfOriginal` con prefijo que no es uno de los 11 tipos DGII | `El prefijo de ncfOriginal ("XXX") no corresponde a ningún tipo de comprobante DGII válido (B01, B02, B03, B04, B11, B12, B13, B14, B15, B16, B17).` |
| 400 | `ncfOriginal` con formato inválido (no pasa el patrón letra+2 dígitos+8-10 dígitos) | Error de validación del propio DTO: `ncfOriginal debe tener el formato de un NCF dominicano válido (ej. B0100000123): letra, 2 dígitos de tipo y 8-10 dígitos de secuencial.` |
| 400 | `branch` que no existe | `La sucursal "XXX" no existe.` |
| 400 | Intentar anular algo que no está confirmado (no debería pasar desde la UI normal) | `Solo se puede anular una factura de apertura confirmada.` |
| 404 | `customer` no existe | `Cliente "CLI-999" no encontrado.` |
| 404 | `supplier` no existe | `Proveedor "PROV-999" no encontrado.` |
| 404 | `GET/POST .../:id`, `.../:id/cancel` sobre un id que no existe o no es de apertura | `Factura de apertura "XXX" no encontrada.` (ventas) / `Factura de compra de apertura "XXX" no encontrada.` (compras) |
| 409 | Ya existe otra factura activa con la misma `numeroFacturaOriginal` + `customer` | `Ya existe la factura de apertura APER-SINV-00003 con la referencia FAC-2024-0117 para este cliente.` |
| 409 | Ya existe otra factura de compra activa con el mismo `numeroFacturaProveedor` + `supplier` | `Ya existe la factura de compra APER-PINV-00003 con el número de proveedor PROV-F-001 para este proveedor.` |
| 409 | `ncfOriginal` ya usado por otra factura activa | `El NCF B0100000123 ya está asignado a la factura APER-SINV-00009.` |
| 403 | Falta el permiso correspondiente | Contrato genérico de siempre — `PERMISO_INSUFICIENTE` (§2) |

**Los 409 de duplicado son un caso de uso NORMAL, no un error de sistema.** Van a pasar seguido
durante una migración (alguien vuelve a pegar la misma fila sin querer, o ya la había cargado la
semana pasada). Tratalos como una validación de formulario: resaltá el campo, mostrá el mensaje,
y ofrecé un enlace/botón para ir al listado y ver la factura que ya existe (podés extraer el
docname del propio mensaje, ej. con una regex simple sobre `APER-SINV-\d+`, o simplemente decirle
al usuario que la busque en el listado por esa referencia).

---

## 7. Lo que el backend BLOQUEA — no construyas estas acciones, y entendé el error si aparece

Estas son reglas de negocio que el servidor hace cumplir de forma dura. No hay ningún camino para
sortearlas desde el frontend, y no deberías intentar construir UI que sugiera que son posibles.

| Acción bloqueada | Dónde podría aparecer el error en tu UI | Mensaje exacto |
|---|---|---|
| Emitir e-CF sobre una factura de apertura | No debería poder pasar nunca desde este módulo (acá nunca se emite e-CF). Si el tenant tiene facturación electrónica, **no muestres ningún indicador ni botón de e-CF en ninguna pantalla de este módulo** | — (el backend simplemente no emite nada, no hay ni error visible) |
| Aplicar una nota de crédito a una factura de apertura (venta) | Si tu módulo de Facturación normal permite elegir "cualquier factura confirmada" como origen de una NC, y el usuario elige por error una `APER-SINV-...` | `No se puede emitir una nota de crédito sobre la factura de apertura "APER-SINV-00007" (migración de saldos). Corrija el saldo cancelándola (POST /apertura/ventas/:id/cancel) y cargándola de nuevo con el monto correcto.` |
| Aplicar una nota de débito referenciando una factura de apertura | Igual que arriba, si tu formulario de ND permite elegir una factura de referencia | `No se puede emitir una nota de débito referenciando la factura de apertura "APER-SINV-00007" (migración de saldos).` |
| Registrar una devolución de compra sobre una factura de apertura | Si tu módulo de Devoluciones de Compra permite elegir cualquier `Purchase Invoice` confirmada como origen | `No se puede registrar una devolución sobre la factura de apertura "APER-PINV-00003" (migración de saldos). Corrija el saldo cancelándola (POST /apertura/compras/:id/cancel) y cargándola de nuevo con el monto correcto.` |
| Editar una factura de apertura ya confirmada | No existe endpoint — no construyas el botón "Editar" en absoluto para las filas de este módulo |

**Recomendación concreta para el resto de tu app:** si tus pantallas de Notas de Crédito/Débito o
Devoluciones de Compra ya existentes permiten elegir libremente cualquier factura confirmada como
"factura original"/"factura de referencia", considerá **filtrar las que tengan `esApertura: true`
o cuyo `id` empiece con `APER-`** directamente del picker, para no dejar que el usuario intente
una acción que el servidor va a rechazar de todos modos. Es una mejora de UX, no obligatoria — el
servidor ya protege la integridad de los datos pase lo que pase.

---

## 8. Listados y detalle

### 8.1 `GET /apertura/ventas`

Query params (todos opcionales, paginado):

| Param | Tipo | Notas |
|---|---|---|
| `limit` | number | Default `20`, máximo `100` |
| `offset` | number | Default `0` |
| `customer` | string | Filtra por cliente exacto |
| `fromDate` | string (fecha) | `posting_date >= fromDate` |
| `toDate` | string (fecha) | `posting_date <= toDate` |

**Response:**

```jsonc
{
  "success": true,
  "data": [ /* array de objetos con el mismo shape que §4.4 */ ],
  "meta": { "limit": 20, "offset": 0, "total": 118 }
}
```

Nota: este listado incluye tanto facturas `estado: "submitted"` como `estado: "cancelled"` (para
que el usuario pueda auditar qué se anuló). No filtra por `docstatus` de borrador porque, como se
explicó en §1, no existe un estado borrador en este flujo.

Tabla sugerida: Fecha | Referencia (`numeroFacturaOriginal`) | Cliente | Monto pendiente
(`montoPendiente`) | Saldo actual (`saldoActual`) | NCF (o `—` si `null`) | Estado (badge:
verde="submitted", gris="cancelled") | Acciones (Ver, Anular si `estado === "submitted"`).

### 8.2 `GET /apertura/ventas/:id` — detalle

Mismo shape que §4.4. Úsalo al hacer click en una fila del listado.

### 8.3 `POST /apertura/ventas/:id/cancel` — anular

Sin body. Confirmación previa obligatoria en la UI (ej. modal: "¿Anular esta factura de apertura?
Esta acción no se puede deshacer directamente — para corregirla deberá cargarla de nuevo con el
monto correcto."). Response: `{ "success": true, "data": { "message": "Factura de apertura anulada" } }`.
Después de anular, refrescá el listado/detalle — el `estado` pasa a `"cancelled"`.

### 8.4 — 8.6 Compras: exactamente los mismos tres endpoints, mismo comportamiento

`GET /apertura/compras` (con `supplier` en vez de `customer` como filtro), `GET
/apertura/compras/:id`, `POST /apertura/compras/:id/cancel` — construílos como el espejo exacto
de §8.1-§8.3, con el shape de respuesta de §5.2.

---

## 9. Carga masiva (lote)

Construí esto **después** de tener el formulario individual funcionando y probado — es la misma
lógica de negocio, aplicada a varias filas. Si el volumen de facturas a migrar de tu cliente
piloto es bajo (unas pocas decenas), podés priorizar el formulario individual primero y esta
pantalla en una segunda entrega; consultalo con el equipo de producto si tenés dudas de
prioridad.

### 9.1 `POST /apertura/ventas/importar`

```jsonc
// Request
{
  "filas": [
    {
      "customer": "CLI-00042",
      "numeroFacturaOriginal": "FAC-2024-0117",
      "fechaFactura": "2024-11-03",
      "montoPendiente": 18500.00
      /* + cualquier otro campo opcional del formulario individual, por fila */
    },
    { /* ... hasta 200 objetos, mismo shape que §4.1 ... */ }
  ]
}
```

`filas` es un array de **entre 1 y 200** objetos, cada uno con exactamente el mismo shape (y las
mismas reglas de validación) que el `POST /apertura/ventas` individual de §4.1. Si necesitás
migrar más de 200 facturas, dividí en varios requests desde el propio frontend — no hay
soporte de "continuar" un lote parcial en el backend, cada llamada es independiente.

**Response — un parte fila por fila:**

```jsonc
{
  "success": true,
  "data": {
    "total": 5,
    "creadas": 3,
    "fallidas": 2,
    "montoTotalMigrado": 45300.00,
    "resultados": [
      { "fila": 1, "ok": true,  "id": "APER-SINV-00010", "numeroFacturaOriginal": "FAC-001" },
      { "fila": 2, "ok": false, "numeroFacturaOriginal": "FAC-002", "error": "Ya existe la factura de apertura APER-SINV-00004 con la referencia FAC-002 para este cliente." },
      { "fila": 3, "ok": true,  "id": "APER-SINV-00011", "numeroFacturaOriginal": "FAC-003" },
      { "fila": 4, "ok": false, "numeroFacturaOriginal": "FAC-004", "error": "Referencia FAC-004 duplicada con la(s) fila(s) 5 del mismo lote (mismo cliente)." },
      { "fila": 5, "ok": false, "numeroFacturaOriginal": "FAC-004", "error": "Referencia FAC-004 duplicada con la(s) fila(s) 4 del mismo lote (mismo cliente)." }
    ]
  }
}
```

Puntos clave de comportamiento que la UI debe reflejar:

- **`total` siempre es 200 como máximo** y siempre coincide con `filas.length` que mandaste.
- **`montoTotalMigrado` suma solo las filas que SÍ se crearon** (`ok: true`) — no es la suma de
  todo el lote pedido.
- **Si dos (o más) filas del mismo lote comparten la misma referencia + cliente, TODAS esas
  filas fallan** — no solo la segunda. En el ejemplo de arriba, tanto la fila 4 como la fila 5
  (ambas `FAC-004` para el mismo cliente) aparecen con `ok: false`, cada una apuntando a la otra.
  Esto es intencional: el sistema no puede saber cuál de las dos filas duplicadas es la
  "correcta", así que las rechaza ambas y deja que el usuario corrija el archivo/planilla de
  origen.
- **No hay transacción global.** Si la fila 3 de 5 falla por una razón de ERPNext (poco común,
  ya que casi todo se valida antes), **las filas 1 y 2 que ya se crearon exitosamente NO se
  revierten.** El array `resultados` es la única fuente de verdad de qué quedó creado y qué no —
  no asumas "todo o nada".
- El orden de `resultados` es siempre el mismo que el orden de `filas` que mandaste, con `fila`
  siendo el índice 1-based (fila 1 = `filas[0]`).

**UI sugerida:** una grilla/tabla con una columna de estado (✅/❌) por fila, mostrando el
`error` tal cual cuando `ok: false`, y una barra de resumen arriba ("3 de 5 cargadas — RD$45,300
migrados"). Ofrecé la posibilidad de **corregir solo las filas fallidas** (editarlas en la misma
grilla) y reenviar un nuevo `POST .../importar` con **solo esas filas corregidas** — no hace falta
reenviar las que ya se crearon.

**De dónde sale `filas`:** el backend solo recibe JSON — **no hay endpoint de subida de
archivos** para este módulo. Si querés ofrecer "importar desde CSV/Excel", el parseo del archivo
es responsabilidad 100% del frontend (leer el archivo en el navegador, mapear columnas a los
nombres de campo de §4.1, y armar el array `filas` antes de llamar al endpoint). No existe (y no
hay que pedirlo) un endpoint de subida de archivo binario para esto.

### 9.2 `POST /apertura/compras/importar`

Idéntico a §9.1, con el shape de fila de §5.1 (`supplier`, `numeroFacturaProveedor`, etc.) y la
respuesta usando `numeroFacturaProveedor` en vez de `numeroFacturaOriginal` en cada fila de
`resultados`.

---

## 10. Cuadre (pantalla de solo lectura)

### `GET /apertura/resumen`

Sin parámetros. Pensada para consultarse en cualquier momento durante o después de una migración,
para verificar que todo está en orden contable.

```jsonc
{
  "success": true,
  "data": {
    "ventas":  { "cantidad": 118, "montoMigrado": 1845300.50, "saldoPendiente": 1620400.00 },
    "compras": { "cantidad": 34,  "montoMigrado":  432100.00, "saldoPendiente":  380000.00 },
    "cuentaApertura": {
      "cuenta": "14-03 - APERTURA TEMPORAL - JBC",
      "saldo": -1413200.50,
      "esperado": -1413200.50,
      "cuadra": true
    },
    "porAnio": [
      { "anio": 2024, "ventas": 980000.00, "compras": 210000.00 },
      { "anio": 2025, "ventas": 865300.50, "compras": 222100.00 }
    ],
    "pendienteDeCierre": true
  }
}
```

- `ventas.cantidad` / `compras.cantidad`: cuántas facturas de apertura **confirmadas** hay en
  total (anuladas no cuentan).
- `.montoMigrado`: la suma del total de todas esas facturas (recordá: el total de una factura de
  apertura ES el saldo pendiente original, no hay descuentos ni impuestos).
- `.saldoPendiente`: cuánto de ese monto **todavía** está sin cobrar/pagar (baja a medida que se
  registran cobros/pagos por los canales normales del sistema).
- `cuentaApertura.saldo`: el saldo contable REAL de la cuenta puente `14-03`, leído directo del
  libro mayor de ERPNext.
- `cuentaApertura.esperado`: lo que ese saldo DEBERÍA ser, calculado matemáticamente
  (compras − ventas migradas). Si `saldo` y `esperado` no coinciden, alguien tocó esa cuenta
  contable por fuera de este módulo (un asiento manual, por ejemplo).
- `cuentaApertura.cuadra` (boolean): el indicador que de verdad importa mostrar en grande. Es
  `true` cuando `saldo` y `esperado` coinciden (con una tolerancia de un centavo).
- `porAnio`: desglose por año de la fecha de las facturas — útil para un gráfico de barras simple
  o una tabla, mostrando cuánto se migró de cada año.
- `pendienteDeCierre` (boolean): informativo. Es `true` mientras la cuenta puente `14-03` tenga
  saldo distinto de cero — indica que falta el asiento contable final que la salda contra
  Resultados de Años Anteriores. **No hay ningún botón en este módulo para hacer ese cierre** —
  es una decisión y una acción manual del contador, hecha desde el módulo de Asientos Contables
  (Journal Entry) ya existente en el sistema, fuera del alcance de esta pantalla.

**UI sugerida:** tres o cuatro tarjetas de KPI arriba (cantidad y monto de ventas / compras
migradas), y un indicador grande y claro para `cuentaApertura.cuadra`:

- ✅ **"Cuadra"** (verde) si `true`.
- ⚠️ **"No cuadra — revisar"** (rojo/naranja) si `false`. Este es un caso serio: mostrá un texto
  de alerta explícito, algo como *"El saldo contable de la cuenta de apertura no coincide con lo
  migrado. Esto puede indicar que alguien registró un asiento manual sobre esa cuenta. Contacte a
  Contabilidad/Soporte antes de seguir cargando facturas."* — no lo trates como un error
  silencioso, es la única señal de alarma real de todo el módulo.

Un gráfico simple de barras apiladas (ventas vs. compras) por año, usando `porAnio`, es un buen
agregado si tenés tiempo, pero no es indispensable para la primera entrega.

---

## 11. Qué NO construir / decisiones ya tomadas que no hay que cuestionar

- **No hay borrador.** Crear siempre confirma. No hay un botón "Guardar sin confirmar".
- **No hay edición.** Corregir = anular + cargar de nuevo.
- **No hay emisión de e-CF desde este módulo**, ni siquiera si el tenant tiene facturación
  electrónica habilitada en el resto del sistema. No muestres ningún estado, badge, ni acción de
  e-CF en ninguna pantalla de "Migración de Saldos".
- **No se pueden crear clientes ni proveedores desde acá.** Los pickers de `customer`/`supplier`
  solo buscan entre los que ya existen. Si el usuario necesita crear uno, mandalo al módulo de
  Clientes/Proveedores de siempre y que vuelva después.
- **Las facturas de apertura NO aparecen en los listados normales** de Facturación (`/invoices`),
  Compras (`/compras`) ni Gastos (`/gastos`) — el backend ya las excluye por defecto de esos
  listados. Si tu frontend ya tiene esas pantallas construidas, **no necesitás tocarles nada**;
  este módulo vive completamente separado. (Si en algún momento querés que el listado de
  `/invoices` SÍ las incluya por algún motivo puntual de auditoría, existe el query param
  opcional `incluirApertura=true` sobre ese endpoint — pero no es parte de este módulo ni algo
  que necesites usar para construir "Migración de Saldos".)
- **No hay subida de archivos** (CSV/Excel) en el backend para la carga masiva — ver §9.1.
- **No hay reversión automática de un lote.** Un lote parcialmente fallido se corrige reenviando
  solo las filas que fallaron, no reintentando el lote completo (eso duplicaría las que ya se
  crearon bien, chocando con la validación de duplicados de la §6).
- **No existe un botón de "cerrar la migración" ni de "saldar la cuenta puente"** en este módulo
  — es una acción contable manual fuera de este alcance (§10).

---

## 12. Checklist de implementación

- [ ] Regenerado el cliente/tipos desde el `openapi.json` actualizado (los 13 endpoints deben
      aparecer bajo el tag `Facturas de Apertura (Migración de Saldos)`).
- [ ] Entrada de menú nueva, oculta si el usuario no tiene ninguna de las 3 acciones de "ver"
      (§2).
- [ ] Pantalla de Diagnóstico: `GET preflight` al entrar, botón "Preparar" gateado por
      `apertura.preparar.ejecutar`, deshabilita el resto de la pantalla mientras `listo: false`.
- [ ] Formulario "Cargar saldo de cliente" completo (§4), con la interacción NCF/reportarEnDgii
      de §4.2 y el bloque de multimoneda de §4.3.
- [ ] Formulario "Cargar saldo de proveedor" completo (§5), con el select de `tipoComprobante`.
- [ ] Los 12 mensajes de error de §6 mapeados a los campos correctos del formulario, sin
      reescribir el texto del servidor.
- [ ] Listados de Ventas y Compras (§8) con filtros, paginación, y acción "Anular" con
      confirmación.
- [ ] (Opcional / segunda entrega) Carga masiva de ambos lados (§9), con la grilla de resultados
      fila por fila y reintento solo de las filas fallidas.
- [ ] Pantalla de Cuadre (§10) con el indicador `cuadra` bien visible.
- [ ] Verificado que ninguna pantalla de este módulo ofrece editar, emitir e-CF, o crear
      cliente/proveedor inline (§11).
- [ ] (Si aplica a tu app) Revisados los pickers de "factura original" en Notas de Crédito/Débito
      y Devoluciones de Compra para, idealmente, excluir las facturas de apertura (§7) — mejora
      de UX, no bloqueante.
