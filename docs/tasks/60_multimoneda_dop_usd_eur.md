# Prompt para agente de frontend — Multimoneda (DOP / USD / EUR)

> Este documento es un prompt autocontenido para un agente de IA de frontend. Da el contexto de
> negocio y qué construir en la UI. La **fuente de verdad de contratos, tipos y validaciones es tu
> `openapi.json`** — pero ⚠️ **refréscalo antes de empezar**: estos endpoints y campos son nuevos
> y casi seguro tu copia actual no los tiene. Descárgalo de nuevo desde
> `https://gensapi.ryancfx.click/api/docs-json` (o `http://localhost:4000/api/docs-json` en
> desarrollo) y revisa los tags **"Monedas"**, **"Configuración"** (`/config/facturacion`),
> **"Cobros"** y **"Pagos"** antes de implementar. API base
> `https://gensapi.ryancfx.click/api/v1` (o `http://localhost:4000/api/v1` en desarrollo).
>
> Todo lo descrito acá **ya está implementado y desplegable en el backend** (no es un plan a
> futuro). La sección [0](#0--qué-no-está-implementado-todavía-no-lo-construyas) lista
> explícitamente lo que **todavía no existe** — es tan importante como el resto: construir UI
> contra un endpoint que no existe rompe en producción.

---

## 0 — Qué NO está implementado todavía (no lo construyas)

Esta fase cubre **configuración, tasas de cambio, y cobros/pagos**. Explícitamente **fuera de
alcance** de este prompt — no agregues selector de moneda ni campos nuevos en estas pantallas,
van en una fase posterior con su propio prompt:

- **Facturas, Cotizaciones, Pedidos de Venta, Notas de Crédito/Débito, Devoluciones**: ningún
  endpoint de venta acepta todavía `currency`/`conversionRate`. Toda venta sigue siendo en la
  moneda de la compañía (DOP), sin excepción.
- **Clientes**: no existe `defaultCurrency` en `Customer`. Un cliente no tiene moneda propia
  todavía.
- **Tesorería** (`/tesoreria/emisiones`, `/tesoreria/depositos`, `/tesoreria/transferencias`) y
  **Cuentas Bancarias** (`/cuentas-bancarias`): sin cambios. No agregues nada de moneda ahí.
- **Reportes y Dashboard**: sin cambios.
- **Facturación electrónica (e-CF)**: cambió internamente (los montos que se envían a la DGII
  ahora se convierten a DOP), pero es 100% invisible para el frontend — no hay campos nuevos que
  mostrar.

**Lo que sí puedes construir ya, y que sí es alcanzable hoy con datos reales:**

- **Compras y Gastos** (`POST /compras`, `POST /gastos`) **ya aceptaban** `currency` y
  `conversionRate` desde antes de este cambio — eso no es nuevo. Lo que cambió es que antes, si
  mandabas `currency: "USD"` sin `conversionRate`, el backend registraba la compra en dólares a
  tasa 1.00 (bug real, ya corregido) — ahora, si no mandas la tasa, ERPNext la resuelve sola
  contra las tasas cargadas en `/monedas/tasas`. Si tu formulario de Compras/Gastos no tiene hoy
  un selector de moneda, agrégalo (ver [§4](#4-compras-y-gastos-agregar-selector-de-moneda-si-no-existe)) —
  es la única vía real, hoy, para probar una tasa de cambio end-to-end.
- **Cobros y Pagos**: sección nueva completa, ver [§5](#5-cobros-y-pagos).
- **Configuración > Facturación > Multimoneda**: pantalla nueva completa, ver [§3](#3-pantalla-nueva-configuración--facturación--multimoneda).

---

## 1 — Contexto de negocio

El sistema ahora soporta **tres monedas, y solo tres**: `DOP` (peso dominicano, siempre la base,
nunca se desactiva), `USD` y `EUR`. Por defecto, un tenant solo opera en DOP — habilitar USD/EUR
es una decisión explícita del administrador, no algo que aparezca solo.

Reglas de negocio clave que la UI debe respetar:

1. **Universo cerrado.** Solo existen esas 3 monedas en toda la aplicación. No hay que construir
   un selector genérico de ISO 4217 — es un `<select>` con 2 o 3 opciones (DOP siempre presente).
2. **DOP nunca se deshabilita.** Es la moneda base del tenant y el backend rechaza cualquier
   intento de apagarla con `400 CURRENCY_IS_BASE`.
3. **Habilitar USD/EUR crea cuentas contables nuevas** (Cuentas por Cobrar y por Pagar en esa
   moneda) — no es una operación instantánea de "solo UI", así que trátala como una acción de
   configuración con confirmación, no como un toggle casual.
4. **Las tasas de cambio se cargan manualmente siempre**, más un job diario opcional que las
   actualiza solo si el administrador lo activa explícitamente. Nunca asumas que hay una tasa
   disponible — todo flujo que dependa de una tasa debe manejar el caso "no hay tasa cargada".
5. **"Tasa Fija"** (en Cuentas por Cobrar / por Pagar) es una política de negocio, no un detalle
   técnico: con ella activa, cobrar/pagar una factura en moneda extranjera usa **la tasa con la
   que se emitió esa factura**, nunca la tasa del día — así el cliente/proveedor no ve
   "ganancia/pérdida cambiaria" en su cobro. Exprésalo en la UI en esos términos de negocio, no
   como "flag técnico".

---

## 2 — Configuración > Facturación (`/config/facturacion`) — campos nuevos

Este endpoint **ya existía**; ganó 8 campos nuevos. Todo lo demás que ya tenías implementado en
esa pantalla sigue igual — solo agrega los campos de abajo, en una sección nueva **"Multimoneda"**
dentro de la misma pantalla de Configuración de Facturación (misma pantalla que hoy muestra
flujo de cobro, POS, formatos de impresión, etc. — no es una pantalla separada).

### 2.1 `GET /config/facturacion` — campos nuevos en la respuesta

```jsonc
{
  "success": true,
  "data": {
    // ...todos los campos que ya conocías (flujoCobro, usaDepartamentos, etc.)...

    "tasaFijaCxc": false,
    "tasaFijaCxp": false,
    "permitirPagoMonedaDistintaBanco": false,
    "tasasActualizacionAutomatica": false,
    "tasasHoraActualizacion": "06:00",
    "tasasProveedor": "Banco Central RD",   // "Banco Central RD" | "Currency Exchange Settings"
    "tasasUltimaActualizacion": null,        // string ISO datetime, o null si nunca corrió
    "tasasUltimoError": null,                // string con el último error del job, o null

    // Derivados de solo lectura — informativos, NO se editan con PUT /config/facturacion.
    "monedaBase": "DOP",
    "monedasHabilitadas": ["DOP"],           // ej. ["DOP", "USD"] si USD está habilitada
    "multimonedaHabilitada": false           // true si monedasHabilitadas tiene algo además de monedaBase
  }
}
```

- `monedaBase`, `monedasHabilitadas` y `multimonedaHabilitada` son **derivados en vivo** desde el
  catálogo `Currency` de ERPNext (vía `GET /monedas`, ver §3) — no vienen de un campo editable.
  Úsalos para decidir, en cualquier otra pantalla, si mostrar u ocultar algo relacionado con
  moneda (ej.: "¿muestro el selector de moneda en Compras? Solo si `multimonedaHabilitada`").
- `tasaFijaCxc`/`tasaFijaCxp`/`permitirPagoMonedaDistintaBanco`/`tasasActualizacionAutomatica`
  son booleanos simples (switches).
- `tasasHoraActualizacion` es un string `"HH:mm"` (ej. `"06:00"`) — usa un time-picker simple, sin
  segundos ni zona horaria (es la hora del servidor).
- `tasasProveedor` es un `<select>` de exactamente 2 opciones (ver valores arriba).

### 2.2 `PUT /config/facturacion` — campos nuevos aceptados en el body

Mismo patrón que el resto del endpoint: todos opcionales, solo se actualiza lo que se envía.

| Campo | Tipo | Validación |
|---|---|---|
| `tasaFijaCxc` | `boolean` | — |
| `tasaFijaCxp` | `boolean` | — |
| `permitirPagoMonedaDistintaBanco` | `boolean` | — |
| `tasasActualizacionAutomatica` | `boolean` | — |
| `tasasHoraActualizacion` | `string` | formato `"HH:mm"` exacto (ej. `"06:00"`), 24 horas. Un valor con otro formato responde `400`. |
| `tasasProveedor` | `string` | debe ser exactamente `"Banco Central RD"` o `"Currency Exchange Settings"` |

`monedaBase`, `monedasHabilitadas` y `multimonedaHabilitada` **no se envían en el PUT** — son de
solo lectura (enviarlos no hace nada, el backend los ignora).

### 2.3 Diseño sugerido de la sección "Multimoneda"

```
┌─ Multimoneda ──────────────────────────────────────────────────┐
│                                                                   │
│  Moneda base: DOP  (no editable)                                 │
│                                                                   │
│  Monedas habilitadas: [DOP] [USD ✓] [EUR]   → link a la pantalla  │
│                                              de gestión de monedas│
│                                              (ver §3.2)           │
│  ─────────────────────────────────────────                       │
│  Tasa Fija en Cuentas por Cobrar        [ ⬤ ] (switch)           │
│  "Al cobrar una factura en moneda extranjera, usar siempre la   │
│   tasa con la que se emitió, no la tasa del día."                │
│                                                                   │
│  Tasa Fija en Cuentas por Pagar         [   ⬤] (switch)          │
│                                                                   │
│  Permitir pago en moneda distinta a la cuenta bancaria  [   ⬤]  │
│  "Ej. transferir 2,000 DOP a una cuenta que opera en dólares."    │
│  ─────────────────────────────────────────                       │
│  Actualización automática de tasas       [   ⬤]                 │
│    Hora: [06:00]   Proveedor: [Banco Central RD ▾]               │
│    Última actualización: 2026-09-12 06:03   (o "nunca")          │
│    Último error: —  (rojo si hay texto)                          │
└───────────────────────────────────────────────────────────────────┘
```

Los tres primeros switches deben estar **deshabilitados/atenuados si `multimonedaHabilitada` es
`false`** (no tiene sentido configurar tasa fija si no hay ninguna moneda extranjera habilitada)
— pero siempre visibles, con un texto explicando por qué están apagados ("Habilite USD o EUR
primero").

---

## 3 — Pantalla nueva: Configuración → Facturación → Multimoneda

Módulo BFF completo nuevo bajo `/api/v1/monedas`. Todas las rutas requieren el permiso
correspondiente (ver [§6](#6-permisos-nuevos)) — si `GET /me/permissions` no trae la acción en
`true`, oculta el control (no solo deshabilitarlo).

### 3.1 `GET /monedas` — catálogo de las 3 monedas soportadas

```jsonc
// GET /api/v1/monedas
{
  "success": true,
  "data": [
    { "code": "DOP", "nombre": "Peso Dominicano",          "simbolo": "RD$", "habilitada": true,  "esBase": true  },
    { "code": "USD", "nombre": "Dólar Estadounidense",       "simbolo": "US$", "habilitada": false, "esBase": false },
    { "code": "EUR", "nombre": "Euro",                       "simbolo": "€",   "habilitada": false, "esBase": false }
  ]
}
```

Siempre devuelve exactamente estos 3 elementos, en este orden. `esBase` siempre es `true` para la
moneda de la compañía y `habilitada` siempre es `true` para ella también (no se puede apagar).

**UI:** una lista/tabla de 3 filas con nombre, símbolo, y un toggle "Habilitada" — deshabilitado
(no clickeable) en la fila `esBase: true`.

### 3.2 `PATCH /monedas/:code` — habilitar/deshabilitar USD o EUR

```jsonc
// PATCH /api/v1/monedas/USD
// body:
{ "habilitada": true }

// response:
{
  "success": true,
  "data": {
    "currency": "USD",
    "enabled": true,
    "cuentas": { "receivable": "112-01-USD - CUENTAS POR COBRAR CLIENTES USD - JBC",
                 "payable": "21-01-001-USD - CXP - PROVEEDORES LOCALES USD - JBC" }
  }
}
```

- Al **habilitar**, el backend crea (si no existían) las cuentas contables de esa moneda — puede
  tardar un poco más que un toggle normal porque hace varias llamadas a ERPNext. Muestra un
  loading state y **deshabilita el botón mientras está en vuelo** (nunca lo dejes doble-clickeable).
- Al **deshabilitar**, `cuentas` viene `null` (no se borra nada, solo se desactiva la moneda en el
  catálogo).
- Intentar deshabilitar `DOP` responde `400` con `error.code = "CURRENCY_IS_BASE"` — el botón de
  esa fila debe estar deshabilitado en la UI, así que este error no debería verse en la práctica;
  trátalo como defensivo.
- **Confirmación recomendada** antes de habilitar: "Esto creará las cuentas contables de Cuentas
  por Cobrar y por Pagar en USD para este tenant. ¿Continuar?" — es una acción con efecto contable
  real, no cosmético.

### 3.3 Tasas de cambio — CRUD manual

Tabla/listado con las tasas cargadas, más un formulario para cargar una nueva.

#### `GET /monedas/tasas` — listar (paginado)

Query params, todos opcionales: `from` (código moneda), `to` (código moneda), `fromDate`
(`YYYY-MM-DD`), `toDate` (`YYYY-MM-DD`), `tipo` (`"compra"` o `"venta"`), `limit` (1-100,
default 20), `offset` (default 0).

```jsonc
// GET /api/v1/monedas/tasas?from=USD&to=DOP&limit=20&offset=0
{
  "success": true,
  "data": [
    {
      "id": "a1b2c3d4e5f6...",     // name real del Currency Exchange, úsalo para editar/borrar
      "fecha": "2026-09-12",
      "from": "USD",
      "to": "DOP",
      "tasa": 60.5,
      "forBuying": true,
      "forSelling": true
    }
  ],
  "pagination": { "limit": 20, "offset": 0 }
}
```

Nota: **este listado no trae un total** (ni `total` ni `totalCapped`) — para paginar, pide una
página más y comprueba si `data.length < limit` (última página) o si vino vacío.

#### `POST /monedas/tasas` — cargar una tasa nueva (upsert)

```jsonc
// body
{ "from": "USD", "to": "DOP", "rate": 60.5, "date": "2026-09-12" }  // "date" opcional, default hoy
// response
{ "success": true, "data": { "id": "...", "message": "Tasa creada" } }  // o "Tasa actualizada" si ya existía
```

`from`/`to` solo aceptan `DOP`/`USD`/`EUR` (un valor fuera de esas 3 → `400`). Es un **upsert**: si
ya hay una tasa para ese par en esa fecha exacta, la actualiza en vez de duplicar — así que el
formulario de "cargar tasa" puede reusarse tal cual para "corregir la tasa de hoy".

#### `PUT /monedas/tasas/:id` y `DELETE /monedas/tasas/:id`

```jsonc
// PUT /api/v1/monedas/tasas/a1b2c3d4e5f6...
{ "rate": 60.75 }
// → { "success": true, "data": { "message": "Tasa actualizada" } }

// DELETE /api/v1/monedas/tasas/a1b2c3d4e5f6...
// → { "success": true, "data": { "message": "Tasa eliminada" } }
```

`:id` es el `id` que vino en el listado (`GET /monedas/tasas`), no lo construyas a mano.

#### `GET /monedas/tasas/vigente` — la tasa que se usaría "ahora mismo"

```jsonc
// GET /api/v1/monedas/tasas/vigente?from=USD&to=DOP&tipo=venta
{
  "success": true,
  "data": { "tasa": 60.5, "fecha": "2026-09-12", "origen": "currency_exchange" }
}
```

- `origen` es `"currency_exchange"` (viene de una tasa cargada manualmente o por el job) o
  `"proveedor"` (el backend fue a preguntarle a ERPNext/su proveedor externo configurado, no a
  la tabla de tasas del tenant).
- Si no hay ninguna tasa disponible por ningún lado, responde `404` con
  `error.code = "EXCHANGE_RATE_NOT_FOUND"` — muéstralo como "No hay tasa de cambio cargada para
  USD → DOP. Cárguela en la tabla de arriba." en cualquier pantalla que la consuma.

#### `POST /monedas/tasas/sincronizar` — botón "Sincronizar ahora"

```jsonc
// body (opcional)
{ "fecha": "2026-09-12" }
// response
{
  "success": true,
  "data": {
    "actualizadas": [ { "currency": "USD", "base": "DOP", "rate": 60.5 } ],
    "errores": [ { "currency": "EUR", "error": "..." } ]
  }
}
```

Dispara la actualización de tasas ahora mismo, sin esperar al job diario. Muestra
`actualizadas`/`errores` en un toast o modal de resultado (una lista corta, no un log). Si
`errores` no está vacío pero `actualizadas` sí tiene algo, es un éxito parcial — no lo muestres
como fallo total.

#### `GET /monedas/convertir` — utilitario de conversión (solo para mostrar, nunca para calcular montos reales que se envían a un endpoint)

```jsonc
// GET /api/v1/monedas/convertir?monto=500&from=USD&to=DOP
{
  "success": true,
  "data": { "monto": 500, "from": "USD", "to": "DOP", "tasa": 60.5, "origen": "currency_exchange", "resultado": 30250 }
}
```

Úsalo solo para un widget tipo "calculadora de conversión" en la UI (ej. "¿cuánto es esto en
pesos?"). **Nunca** lo uses para precalcular un monto que luego mandas en el body de otro POST —
esos endpoints (cobros/pagos) resuelven su propia tasa del lado del servidor.

### 3.4 Vista de tasas sugerida

```
┌─ Tasas de cambio ──────────────────────────────────────────────┐
│  Filtros: [Moneda ▾] [Desde] [Hasta] [Tipo ▾]   [+ Cargar tasa] │
│                                                                    │
│  Fecha        De    A     Tasa      Compra  Venta   Acciones     │
│  2026-09-12   USD   DOP   60.5000    ✓       ✓       [✏️] [🗑️]   │
│  2026-09-12   DOP   USD   0.0165     ✓       ✓       [✏️] [🗑️]   │
│                                                            [Sincronizar ahora]
└────────────────────────────────────────────────────────────────────┘
```

El par inverso (`DOP→USD`) puede aparecer solo si el job lo cargó — no fuerces que siempre exista;
muéstralo si viene en el listado.

---

## 4 — Compras y Gastos: agregar selector de moneda (si no existe)

`POST /compras` y `POST /gastos` ya aceptan (desde antes de este cambio) los campos `currency`
(opcional, default `"DOP"`) y `conversionRate` (opcional). Si tu formulario actual no tiene un
selector de moneda:

1. Agrega un `<select>` con las monedas de `GET /monedas` filtradas a `habilitada: true` (siempre
   incluye DOP). **Muéstralo solo si `multimonedaHabilitada` es `true`** (ver §2.1) — si el
   tenant no ha habilitado ninguna moneda extranjera, no lo muestres en absoluto y sigue enviando
   `currency: "DOP"` implícito (u omitiéndolo, es lo mismo).
2. Si el usuario elige una moneda distinta a la base, agrega un campo opcional "Tasa de cambio"
   (`conversionRate`, numérico positivo). Si lo deja vacío, el backend la resuelve solo contra
   `/monedas/tasas` — pero si no hay ninguna tasa cargada para ese par/fecha, el `POST` falla. Un
   buen UX: al elegir la moneda, llama a `GET /monedas/tasas/vigente?from=<moneda>&to=DOP` y
   **pre-llena** el campo con el resultado (editable), en vez de dejarlo vacío a ciegas.
3. Si el proveedor no tiene la moneda habilitada, el `POST` falla con `400` y
   `error.code = "CURRENCY_NOT_SUPPORTED"` (si mandaste algo fuera de DOP/USD/EUR) o
   `"CURRENCY_NOT_ENABLED"` (si mandaste USD/EUR pero el tenant no la habilitó en §3.2) — muestra
   `error.message` tal cual, ya viene en español y explica qué hacer.

No hay cambios en la respuesta de estos endpoints más allá de lo que ya devuelven — no hay
`baseGrandTotal` ni campos nuevos que mostrar todavía (eso es Fase 5/6, fuera de alcance, ver §0).

---

## 5 — Cobros y Pagos

`POST /cobros` y `POST /pagos` ganaron 3 campos opcionales cada uno, y varios errores nuevos.
**Contexto importante:** hoy, en la práctica, un **Cobro** casi nunca podrá disparar estos campos
(un cliente y su factura de venta siempre están en DOP — ver §0), mientras que un **Pago** sí
puede, en cuanto Compras/Gastos tenga el selector de moneda de §4. Implementa los campos en
**ambos** formularios por consistencia de API y porque Cobros se activará solo el día que Ventas
soporte moneda (sin que tengas que tocar el frontend de nuevo), pero no le dediques esfuerzo de
diseño extra al de Cobros — con que el campo aparezca condicionalmente (como se explica abajo) es
suficiente.

### 5.1 Campos nuevos (idénticos en `CreateCobroDto` y `CreatePagoDto`)

| Campo | Tipo | Cuándo mostrarlo |
|---|---|---|
| `conversionRate` | `number` positivo | La factura/las facturas referenciadas están en una moneda distinta a la de la compañía. Tasa explícita `moneda del cliente/proveedor → moneda de la compañía` — **gana sobre "Tasa Fija"** si el usuario la especifica. |
| `receivedAmount` | `number` positivo | La cuenta bancaria/método de pago elegido opera en una moneda **distinta** a la del monto cobrado/pagado. Es el monto real que entra/sale del banco, en la moneda de esa cuenta. |
| `bankConversionRate` | `number` positivo | Mismo caso que `receivedAmount`, cuando además no hay ninguna tasa cargada entre esas dos monedas — tasa explícita `moneda del cliente/proveedor → moneda del banco`. |

**Cómo decidir cuándo mostrar cada uno**, en orden:

1. Al elegir las facturas a cobrar/pagar (`referencias`), fíjate en la moneda de esas facturas
   (si tu pantalla ya muestra el detalle de la factura, ahí está `currency` — pero recuerda: hoy
   Ventas no expone esto, así que en Cobros este caso no ocurrirá en la práctica; en Pagos sí, si
   la factura de compra se creó en USD/EUR).
2. Si esa moneda **difiere de la moneda de la compañía** (`monedaBase`, de §2.1): muestra el campo
   `conversionRate` como opcional, con placeholder "Tasa del día (déjelo vacío para usar la
   configurada)".
3. Al elegir el método de pago/cuenta bancaria, si conoces su moneda (hoy no hay un endpoint que
   te la dé directamente para un método de pago — esto es aceptable, no lo bloquees; si no tienes
   esa información, simplemente omite mostrar `receivedAmount`/`bankConversionRate` de entrada y
   deja que, si el backend responde `400 BANK_ACCOUNT_CURRENCY_MISMATCH` o
   `EXCHANGE_RATE_REQUIRED`, tu manejo de errores (§5.2) le muestre al usuario que debe reintentar
   indicando esos campos).

**Simplificación aceptable para una primera versión:** no intentes anticipar todo esto con
lógica de UI compleja. Es perfectamente válido:
- Mostrar `conversionRate` siempre como un campo opcional avanzado ("Tasa de cambio (avanzado)"),
  colapsado/oculto detrás de un "Mostrar opciones de moneda" cuando `multimonedaHabilitada` es
  `true`.
- Confiar en los mensajes de error del backend (§5.2) para pedir `receivedAmount`/
  `bankConversionRate` cuando realmente hagan falta, en vez de adivinar de antemano.

### 5.2 Errores nuevos a manejar en Cobros y Pagos

Todos llegan como `error.code` + `error.message` (envoltura estándar `{success:false, error:
{code, message, statusCode}}` — igual que cualquier otro error del API). Muestra siempre
`error.message` tal cual (ya viene en español, explicando qué hacer) — la tabla es para que sepas
**qué campo pedirle al usuario** en cada caso, no para que reescribas el mensaje.

| `error.code` | HTTP | Significa | Qué hacer en la UI |
|---|---|---|---|
| `PAYMENT_MIXED_CURRENCIES` | 400 | Las facturas seleccionadas para este cobro/pago están en monedas distintas entre sí. | Pide separar en dos cobros/pagos — no permitas seleccionar facturas de monedas distintas en el mismo formulario si puedes detectarlo antes de enviar. |
| `PAYMENT_MIXED_RATES` | 400 | "Tasa Fija" está activa y las facturas seleccionadas fueron emitidas a tasas distintas. | Sugiere separar el cobro/pago por tasa, o desactivar "Tasa Fija" y usar `conversionRate` explícito. |
| `BANK_ACCOUNT_CURRENCY_MISMATCH` | 400 | La cuenta bancaria elegida opera en una moneda distinta y `permitirPagoMonedaDistintaBanco` está apagado (§2). | Muestra el mensaje; sugiere elegir otra cuenta bancaria o pedirle a un admin que active esa opción en Configuración. |
| `EXCHANGE_RATE_REQUIRED` | 400 | Las monedas difieren y no hay tasa resoluble. | Muestra (o revela) el campo `bankConversionRate` para que el usuario la indique, y reintenta. |
| `BANK_AMOUNT_OUT_OF_TOLERANCE` | 400 | `receivedAmount` que mandaste se aparta más de 2% del equivalente calculado por el backend. | Muestra el mensaje (incluye ambos montos); pide confirmar el monto real acreditado/debitado. |
| `CURRENCY_NOT_SUPPORTED` | 400 | Se mandó una moneda fuera de DOP/USD/EUR (no debería pasar si tu selector solo ofrece esas 3). | Defensivo — no debería verse en la práctica. |
| `CURRENCY_NOT_ENABLED` | 400 | La moneda es válida pero el tenant no la habilitó (§3.2). | Enlaza a Configuración > Multimoneda para habilitarla. |

### 5.3 Ejemplo de payload completo

```jsonc
// POST /api/v1/pagos — pagando una factura de compra en USD, tasa fija activa, banco en DOP
{
  "supplier": "SUP-0001",
  "postingDate": "2026-09-12",
  "paidAmount": 500,
  "modeOfPayment": "Transferencia",
  "referencias": [ { "invoiceId": "PINV-0042", "allocatedAmount": 500 } ]
  // conversionRate omitido → usa la tasa de la factura (tasaFijaCxp está activa)
  // receivedAmount omitido → banco en DOP, se resuelve solo
}
```

---

## 6 — Permisos nuevos

Nuevas acciones en el catálogo de permisos (`GET /api/v1/me/permissions`, campo `acciones`) —
todas bajo la pantalla lógica **"Multimoneda"**. Úsalas para mostrar/ocultar cada control de §3 y
la sección de §2.3, con el mismo patrón que ya usas para el resto de la app
(`docs/frontend/PROMPT_PERMISOS_FRONTEND.md`).

| Acción | Gatea |
|---|---|
| `monedas.ver` | Ver la lista de monedas y sus tasas (toda la pantalla de §3) |
| `monedas.habilitar` | El toggle de habilitar/deshabilitar USD/EUR (§3.2) |
| `monedas.tasas.ver` | Ver el listado de tasas y "tasa vigente" |
| `monedas.tasas.crear` | Botón "Cargar tasa" |
| `monedas.tasas.editar` | Botón editar (✏️) de una tasa |
| `monedas.tasas.eliminar` | Botón eliminar (🗑️) de una tasa |
| `monedas.tasas.sincronizar` | Botón "Sincronizar ahora" |
| `monedas.preview.ver` | (Interno — no necesitas gatear nada explícito por esta; no hay una pantalla dedicada para el preview de conversión bancaria en esta fase) |

La sección "Multimoneda" dentro de Configuración de Facturación (§2) sigue gateada por los
permisos que ya usabas ahí: `config.facturacion.ver` / `config.facturacion.editar` — no hay
permisos nuevos para esos campos, viajan con los mismos de siempre.

---

## 7 — Checklist de implementación

- [ ] Refrescar `openapi.json` desde `/api/docs-json`.
- [ ] `GET /config/facturacion`: leer y mostrar los 8 campos nuevos + 3 derivados (§2.1).
- [ ] `PUT /config/facturacion`: sección "Multimoneda" con los 6 campos editables (§2.2/§2.3).
- [ ] Pantalla nueva de gestión de monedas y tasas bajo Configuración (§3): catálogo de 3
      monedas con toggle, CRUD de tasas, botón sincronizar, widget conversor opcional.
- [ ] Selector de moneda + tasa en Compras y Gastos, condicionado a `multimonedaHabilitada` (§4).
- [ ] Campos `conversionRate` / `receivedAmount` / `bankConversionRate` en Cobros y Pagos, con el
      manejo de errores de §5.2 (§5).
- [ ] Gatear todo lo de §3 con los permisos de §6.
- [ ] Verificar que NINGUNA pantalla de Ventas (Facturas/Cotizaciones/Pedidos/Notas/Devoluciones),
      Clientes, Tesorería, Cuentas Bancarias, Reportes o Dashboard recibió cambios de este prompt
      — si tu implementación tocó alguna de esas, revisa §0, no correspondía.
