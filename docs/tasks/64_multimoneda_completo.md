# Prompt para agente de frontend — Multimoneda (DOP/USD/EUR): implementación completa

> Este documento es un prompt **autocontenido, exhaustivo y por fases** para un agente de IA de
> frontend. Cubre **absolutamente todo** lo que el backend implementó para la feature
> multimoneda — configuración, tasas de cambio, clientes/proveedores, los 4 documentos de venta,
> cobros, pagos, tesorería, cuentas bancarias, reportes, dashboard y plantillas de impresión.
> **Reemplaza y deja obsoleto** a `docs/frontend-tasks/60_multimoneda_dop_usd_eur.md` (que solo
> cubría la primera fase y decía explícitamente que Ventas/Clientes/Tesorería no tenían cambios —
> eso ya no es cierto). Si ya empezaste a implementar algo siguiendo el documento 60, revísalo
> contra este documento: hay campos y comportamientos que cambiaron.
>
> **Todo lo descrito acá ya está implementado y desplegado en el backend** — no es un plan a
> futuro, es una auditoría exacta del código real hecha línea por línea inmediatamente antes de
> escribir este documento. Cuando un comportamiento no es obvio o difiere de lo que uno
> esperaría, se explica el porqué explícitamente — no hay nada oculto ni implícito.
>
> **Fuente de verdad de tipos exactos: tu `openapi.json`.** Este documento te dice QUÉ existe, en
> qué endpoint, con qué nombre, y CÓMO se comporta — pero para el tipo TypeScript exacto
> (opcionalidad estricta, unions, formatos), usa siempre tu `openapi.json`. ⚠️ **Refréscalo antes
> de empezar** desde `GET /api/docs-json` (`https://gensapi.ryancfx.click/api/docs-json` o
> `http://localhost:4000/api/docs-json` en desarrollo) — todos los campos y endpoints de este
> documento son relativamente nuevos y tu copia actual casi seguro no los tiene completos. Revisa
> especialmente los tags de Swagger: **"Monedas"**, **"Configuración"**, **"Invoices"**,
> **"Cotizaciones"**, **"Pedidos de Venta"**, **"Notas de Crédito y Débito"**, **"Customers"**,
> **"Suppliers"**, **"Cuentas por Cobrar"**, **"Cuentas por Pagar"**, **"Tesorería — Emisiones"**,
> **"Tesorería — Depósitos"**, **"Tesorería — Transferencias Internas"**, **"Tesorería —
> Movimientos"**, **"Asientos Contables (Journal Entry)"**, **"Cuentas Bancarias"**, **"Reportes"**,
> **"Dashboard"**. API base `https://gensapi.ryancfx.click/api/v1` (o
> `http://localhost:4000/api/v1` en desarrollo).
>
> **Sé meticuloso.** Esta feature toca dinero real y contabilidad — un campo mal interpretado
> (ej. confundir la moneda del documento con la moneda base, o mandar una tasa donde no
> corresponde) puede producir un asiento contable incorrecto que un usuario del negocio solo
> detecta días después. Cuando una sección diga "no envíes X" o "nunca asumas Y", es una regla de
> negocio real verificada contra el código, no una sugerencia de estilo.

---

## Índice de fases

Cada fase es una unidad de trabajo razonablemente independiente — puedes implementarlas en
paralelo con varios agentes, o en orden. El orden sugerido (por dependencia natural de UI, no
técnica) es el de la lista:

- **Fase 0** — Conceptos transversales que hay que entender antes de tocar cualquier pantalla.
- **Fase 1** — Configuración: sección Multimoneda en Facturación + pantalla de gestión de
  monedas y tasas de cambio.
- **Fase 2** — Clientes y Proveedores: moneda por defecto.
- **Fase 3** — Ventas: Facturas, Cotizaciones, Pedidos, Notas de Crédito/Débito.
- **Fase 4** — Cobros y Pagos.
- **Fase 5** — Tesorería (Emisiones, Depósitos, Transferencias Internas, Asientos Contables) y
  Cuentas Bancarias.
- **Fase 6** — Reportes y Dashboard.
- **Fase 7** — Plantillas de impresión (ya tiene su propio documento dedicado, se referencia).

---

## Fase 0 — Conceptos transversales

Lee esta fase completa antes de tocar cualquier pantalla — todo lo demás la da por entendida.

### 0.1 Universo cerrado de monedas

El sistema soporta **exactamente 3 monedas**: `DOP` (Peso Dominicano), `USD` (Dólar), `EUR`
(Euro). Es un universo **cerrado** — cualquier otro código ISO 4217, aunque exista en el catálogo
nativo `Currency` de ERPNext, se rechaza con `400 CURRENCY_NOT_SUPPORTED` antes de llegar a
ERPNext. No construyas un selector de moneda libre en ningún lado de esta feature — siempre son
estas 3 opciones (aunque no todas estén habilitadas, ver 0.2).

**Excepción:** existe un endpoint genérico `GET /config/currencies` que expone el catálogo
COMPLETO nativo de ERPNext (todas las monedas `enabled=1`, sin restricción a las 3). Es un
catálogo distinto, usado por selectores de moneda libre en Compras/Gastos (campo de texto que se
valida solo al guardar) — **no lo confundas con el módulo `/monedas`** de esta feature, que sí es
el universo cerrado. Si ves un selector de moneda en Compras/Gastos que ya usa
`GET /config/currencies`, no lo toques, es una pantalla distinta a lo que cubre este documento.

### 0.2 "Habilitada" vs "moneda base"

- **Moneda base de la compañía** (`monedaBase` en `GET /config/facturacion`, o `esBase` en
  `GET /monedas`): es inmutable, la fija la contabilidad del tenant al momento de crear la
  compañía en ERPNext. Hoy, en todos los tenants existentes, es `DOP`. Nunca construyas UI para
  cambiarla — no existe ningún endpoint para eso.
- **Moneda habilitada**: DOP siempre está habilitada (no se puede deshabilitar). USD y EUR
  empiezan deshabilitadas por tenant y se habilitan una por una desde
  `PATCH /monedas/:code` (Fase 1). Un tenant que nunca habilitó USD/EUR sigue operando
  exactamente igual que antes de esta feature — todo el flujo multimoneda es opt-in.
- **Regla que aplica en TODA la app**: para usar una moneda distinta a la base en cualquier
  documento (factura, cobro, pago, cliente, cuenta bancaria...), esa moneda debe estar habilitada
  primero. Si no lo está, el backend responde `400 CURRENCY_NOT_ENABLED` con un mensaje que
  literalmente dice "Habilítela en Configuración > Facturación > Multimoneda
  (`PATCH /monedas/:code`)" — puedes usar ese mismo texto o un mensaje de error equivalente en tu
  UI cuando lo intercepes.

### 0.3 Envelope de respuesta y convenciones generales

Igual que el resto de la API: toda respuesta 2xx es `{ success: true, data: ... }`. Todos los
campos nuevos van en **camelCase** en el payload de request/response del BFF, aunque el campo
nativo de ERPNext sea `snake_case` (`conversion_rate` → `conversionRate`, etc.) — con una
excepción documentada en 0.5.

### 0.4 Tabla maestra de códigos de error de multimoneda

Estos códigos aparecen como el campo `code` dentro del body de un `400 Bad Request`
(`{ statusCode: 400, code: "...", message: "..." }` — confirma el shape exacto con tu
interceptor de errores actual, es el mismo patrón que ya usas para otros códigos de error de la
app). Guarda esta tabla a mano, se referencia por nombre en cada fase de abajo en vez de
repetirla:

| Código | Qué significa | En qué endpoints puede aparecer |
|---|---|---|
| `CURRENCY_NOT_SUPPORTED` | El código de moneda no es DOP/USD/EUR | `/monedas/*`, cualquier endpoint que reciba `currency` |
| `CURRENCY_NOT_ENABLED` | La moneda es válida pero no está habilitada para este tenant | Igual que arriba |
| `CURRENCY_IS_BASE` | Se intentó deshabilitar la moneda base (siempre DOP) | `PATCH /monedas/:code` |
| `EXCHANGE_RATE_REQUIRED` | Se necesita una tasa de cambio y no hay ninguna resoluble (ni explícita en el request, ni cargada en `/monedas/tasas`, ni en el proveedor nativo) — **el backend NUNCA asume una tasa de `1` por defecto cuando la moneda es distinta de la base** | Facturas/Cotizaciones/Pedidos (indirecto, vía ERPNext), Cobros, Pagos, Tesorería (Emisiones/Depósitos/Transferencias), Journal Entry, `/monedas/preview-conversion-banco` |
| `PAYMENT_MIXED_CURRENCIES` | Un cobro/pago/emisión referencia varias facturas que están en monedas distintas entre sí | Cobros, Pagos, Tesorería — Emisiones |
| `PAYMENT_MIXED_RATES` | La "Tasa Fija" está activa (ver Fase 1) y las facturas referenciadas por un cobro/pago tienen tasas de cambio distintas entre sí — el sistema nunca promedia, exige separar el cobro/pago | Cobros, Pagos, Tesorería — Emisiones |
| `BANK_ACCOUNT_CURRENCY_MISMATCH` | El monto está en una moneda distinta a la cuenta bancaria elegida, y el tenant no tiene activado "permitir pago en moneda distinta al banco" (Fase 1) | Cobros, Pagos, Tesorería — Emisiones/Depósitos |
| `BANK_ACCOUNT_CURRENCY_MISMATCH_GL` | Al crear/editar una Cuenta Bancaria, la moneda que mandaste no coincide con la moneda real de la cuenta contable (GL) que le vinculaste — **código distinto** al de arriba, no lo confundas | Cuentas Bancarias |
| `BANK_AMOUNT_OUT_OF_TOLERANCE` | Se mandó un monto recibido/pagado explícito en el banco que se aparta más de 2% del equivalente calculado con la tasa | Cobros, Pagos |
| `MONTO_DESTINO_REQUIRED` | Una transferencia interna entre cuentas de monedas distintas no trajo `montoDestino` — el backend nunca lo inventa a partir de una tasa | Tesorería — Transferencias Internas |
| Sin código, solo `message` | Varios casos de descuadre contable (una distribución que no cuadra, débitos≠créditos tras convertir, una deducción en una moneda que no corresponde) — trátalos como error genérico, muestra el `message` tal cual, no busques un `code` que no existe | Tesorería (varios), Journal Entry |

**Importante**: `PAYMENT_AMOUNTS_INCONSISTENT` (mencionado en documentación de diseño antigua)
**no existe** en el código actual — el caso real (la suma de montos asignados no coincide con el
monto pagado) lanza un `400` con solo `message`, sin `code` estructurado. No busques ese código.

### 0.5 Advertencia de nomenclatura — no es un error tuyo, es así en el backend

Los nombres de campo relacionados a moneda **no son 100% consistentes entre módulos** — es un
hecho del backend, documentado explícitamente para que no pierdas tiempo pensando que es un bug
tuyo:

| Módulo | Nombre del código de moneda | Nombre de la tasa |
|---|---|---|
| Facturas/Cotizaciones/Pedidos/Notas, Clientes/Proveedores, Cobros/Pagos, `/monedas` | `currency` | `conversionRate` |
| Tesorería (Emisiones/Depósitos/Transferencias, `GET /tesoreria/movimientos`) | `moneda` | `conversionRate` (en el request) / `conversionRate` (en la respuesta de movimientos) |
| Journal Entry (`GET /journal-entry/:id`, por línea) | `currency` | `conversionRate` |
| Cuentas Bancarias — la mayoría de endpoints | `currency` | — |
| Cuentas Bancarias — específicamente `GET /cuentas-bancarias/:id/balance` | `moneda` (¡distinto al resto del mismo módulo!) | — |
| Reportes (`getCuadre`, `getCuadreTurno`, `getCorteCajaDia`) | `moneda` | — |
| Dashboard, Plantillas de impresión | `currency` | — |

No refactorices esto ni intentes "normalizarlo" en tu capa de UI de forma que oculte cuál
endpoint devolvió qué — solo tenlo en cuenta al tipar tus modelos de datos por módulo.

### 0.6 Gap conocido — Cobros y Pagos no devuelven moneda en la respuesta

Esto es importante y afecta directamente el diseño de UI de la Fase 4: **cuando creas o consultas
un cobro (`POST/GET /cobros`) o un pago (`POST/GET /pagos`), la respuesta NO incluye ningún campo
de moneda ni tasa de cambio** (ni `currency`, ni `conversionRate`, ni `sourceExchangeRate`, ni
`basePaidAmount`, nada) — aunque internamente el backend sí calculó y usó todo eso al crear el
documento. El campo `paidAmount` de la respuesta es el valor crudo de ERPNext, cuyo significado de
moneda **cambia según el módulo**:

- En la respuesta de un **cobro**, `paidAmount` está en la moneda del **cliente/factura**.
- En la respuesta de un **pago**, `paidAmount` está en la moneda del **banco** (no del proveedor)
  — es lo opuesto, por cómo ERPNext modela `Payment Entry.paid_from`/`paid_to` según el tipo
  (`Receive` vs `Pay`).

**Qué implica para tu UI**: después de crear un cobro/pago multimoneda, no puedes mostrar "se
usó una tasa de X" ni "el equivalente en DOP fue Y" leyendo la respuesta del `POST` — esa
información no viaja de vuelta. Diseña la confirmación post-creación mostrando solo lo que el
usuario ya sabe porque lo tecleó él mismo (el monto que puso, la cuenta bancaria que eligió), o
usa el listado de `GET /tesoreria/movimientos` si ese cobro/pago también aparece ahí con más
detalle (confirma si aplica a tu caso). Reporta esto al equipo de backend si el negocio necesita
ver la tasa aplicada después del hecho — hoy no está disponible por API.

### 0.7 No existen endpoints de "preview" para Cobros ni Pagos

A diferencia de Tesorería (que sí tiene `POST /monedas/preview-conversion-banco`, Fase 1), **no
hay `GET /cobros/preview` ni `GET /pagos/preview`**. Si tu diseño necesita mostrarle al usuario
"vas a cobrar X en tu banco por este monto en moneda Y antes de confirmar", no hay un endpoint
dedicado para simularlo — puedes aproximarlo en el cliente usando `/monedas/tasas/vigente` +
`/monedas/convertir` (Fase 1) para calcular un estimado, dejando claro en la UI que es una
estimación y que el monto final lo determina el backend al confirmar.

---

## Fase 1 — Configuración: Facturación Config + módulo `/monedas`

### 1.1 Sección "Multimoneda" en `GET/PUT /config/facturacion`

`GET /config/facturacion` (tag "Configuración") devuelve, dentro de `data`, estos campos
editables:

| Campo | Tipo | Default | Descripción |
|---|---|---|---|
| `tasaFijaCxc` | boolean | `false` | "Tasa Fija en Cuentas por Cobrar" — si está activo, un cobro que referencia facturas usa la `conversionRate` que esas facturas ya tenían al emitirse, en vez de resolver una tasa nueva del día. Ver Fase 4. |
| `tasaFijaCxp` | boolean | `false` | Mismo concepto, para Cuentas por Pagar (pagos a proveedor). |
| `permitirPagoMonedaDistintaBanco` | boolean | `false` | Si está activo, un cobro/pago/emisión puede depositarse en una cuenta bancaria de moneda distinta a la del documento (con conversión). Si está apagado, un intento así se rechaza con `BANK_ACCOUNT_CURRENCY_MISMATCH` de inmediato. |
| `tasasActualizacionAutomatica` | boolean | `false` | Si está activo, un job corre diariamente sincronizando tasas contra el proveedor configurado (ver `tasasProveedor`). |
| `tasasHoraActualizacion` | string `"HH:mm"` | `"06:00"` | Hora del día (formato `HH:mm`, validado con regex en el backend — un formato distinto se rechaza con 400) en que corre el job de sincronización, si está activo. |
| `tasasProveedor` | `'Banco Central RD' \| 'Currency Exchange Settings'` | `'Banco Central RD'` | Fuente de la sincronización automática. |

Además, `GET /config/facturacion` agrega **3 campos derivados de solo lectura** (no están en el
DTO de `PUT`, no intentes editarlos con ese endpoint):

| Campo | Tipo | Qué es |
|---|---|---|
| `monedaBase` | string | La moneda base real de la compañía (hoy siempre `"DOP"`). Úsalo en vez de hardcodear `"DOP"` en ningún lado de tu código — un tenant futuro podría tener otra. |
| `monedasHabilitadas` | string[] | Las monedas de `['DOP','USD','EUR']` que están habilitadas para este tenant, siempre incluye `monedaBase`. |
| `multimonedaHabilitada` | boolean | `true` si `monedasHabilitadas` tiene algo más que `monedaBase` — úsalo como gate general: si es `false`, puedes ocultar toda la UI de multimoneda de otras pantallas (selector de moneda en facturas, etc.) para no confundir a un tenant que nunca la activó. |

También hay 2 campos de solo lectura informativos sobre la última sincronización de tasas:
`tasasUltimaActualizacion` (string ISO o `null`) y `tasasUltimoError` (string o `null`, mensaje
del último fallo del job si lo hubo).

`PUT /config/facturacion` acepta los 6 campos editables de la tabla de arriba (todos opcionales,
`PATCH`-like — solo se actualiza lo que mandes). No hay validación cruzada entre ellos en el
backend (ej. no valida que si activas `tasasActualizacionAutomatica` también debas mandar
`tasasProveedor`) — asume defaults sensatos en tu formulario.

**UI sugerida**: una subsección "Multimoneda" dentro de la pantalla de Configuración de
Facturación (misma pantalla donde ya vive el resto de esa config), con:
- Los 4 toggles booleanos con su descripción.
- El selector `tasasProveedor` (solo relevante/habilitado si `tasasActualizacionAutomatica` está
  activo).
- El input de hora `tasasHoraActualizacion` (mismo gate).
- Mostrar `monedaBase`, `monedasHabilitadas` y `multimonedaHabilitada` como información de
  solo lectura (puede ser un resumen tipo "Monedas activas: DOP, USD").
- Mostrar `tasasUltimaActualizacion`/`tasasUltimoError` como un pequeño indicador de estado del
  job (ej. "Última sincronización: hace 2 horas" / "⚠️ Falló: {mensaje}").

Gatea con los mismos permisos que ya usa el resto de esta pantalla:
`config.facturacion.ver` / `config.facturacion.editar` — no hay permisos nuevos para estos
campos específicos.

### 1.2 Módulo `/monedas` — pantalla nueva de gestión de monedas y tasas

Pantalla nueva, probablemente bajo Configuración. Todas las rutas cuelgan de `/monedas`.

#### `GET /monedas` — permiso `monedas.ver`

Sin parámetros. Devuelve siempre 3 filas (una por cada moneda soportada, en orden DOP/USD/EUR):

```json
{
  "success": true,
  "data": [
    { "code": "DOP", "nombre": "Peso Dominicano", "simbolo": "RD$", "habilitada": true, "esBase": true },
    { "code": "USD", "nombre": "Dólar Estadounidense", "simbolo": "$", "habilitada": false, "esBase": false },
    { "code": "EUR", "nombre": "Euro", "simbolo": "€", "habilitada": false, "esBase": false }
  ]
}
```

`nombre`/`simbolo` vienen del catálogo nativo `Currency` de ERPNext si existe, con un fallback
hardcodeado si no. La moneda base (`esBase: true`) siempre tiene `habilitada: true`, sin
excepción.

**UI**: tabla/lista de 3 filas con un toggle por cada una (deshabilitado para la fila `esBase`).

#### `PATCH /monedas/:code` — permiso `monedas.habilitar`

Body: `{ "habilitada": boolean }`. Habilita o deshabilita USD/EUR. Al habilitar por primera vez,
el backend crea automáticamente (idempotente, del lado de ERPNext) las cuentas contables de
Cuentas por Cobrar/Pagar en esa moneda — no necesitas ninguna UI adicional para eso, es
transparente.

Errores: `CURRENCY_NOT_SUPPORTED` (código fuera de DOP/USD/EUR — no debería pasar si tu UI solo
ofrece las 3), `CURRENCY_IS_BASE` (si intentas deshabilitar la moneda base — deshabilita el
toggle correspondiente en tu UI directamente, no dependas solo del error del backend).

#### Gestión de tasas de cambio

Todo esto vive en el doctype nativo `Currency Exchange` de ERPNext, expuesto vía estos 6
endpoints:

**`GET /monedas/tasas`** — permiso `monedas.tasas.ver` — paginado, filtros opcionales `from`,
`to` (códigos de moneda), `fromDate`, `toDate`, `tipo` (`'compra'|'venta'`), `limit` (default 20,
máx 100), `offset`. Respuesta:
```json
{
  "success": true,
  "data": [
    { "id": "CE-00001", "fecha": "2026-06-01", "from": "USD", "to": "DOP", "tasa": 60.5, "forBuying": true, "forSelling": true }
  ],
  "pagination": { "limit": 20, "offset": 0 }
}
```

**`GET /monedas/tasas/vigente?from=&to=&date=&tipo=`** — permiso `monedas.tasas.ver` — `from`/
`to` obligatorios, `date` opcional (default hoy), `tipo` opcional (default `'venta'`). Busca
primero en las tasas cargadas manualmente, si no hay cae al proveedor nativo de ERPNext.
Respuesta:
```json
{ "success": true, "data": { "tasa": 60.5, "fecha": "2026-06-01", "origen": "currency_exchange" } }
```
`origen` es `"currency_exchange"` (tasa cargada manualmente/por el job) o `"proveedor"`
(resuelta al vuelo por ERPNext, sin una fila explícita — en ese caso `fecha` puede venir `null`).
Error `EXCHANGE_RATE_NOT_FOUND` (404, no 400) si no hay ninguna tasa resoluble por ningún lado —
el mensaje sugiere explícitamente cargarla manual con `POST /monedas/tasas`.

**`POST /monedas/tasas`** — permiso `monedas.tasas.crear` — body
`{ from, to, rate, date? }` (`date` default hoy). Es un **upsert**: si ya existe una tasa para
ese par+fecha exactos, la actualiza; si no, crea una nueva. Guarda la tasa para ambos sentidos
(`for_buying`/`for_selling` = true siempre) — no necesitas pedir "compra" y "venta" por
separado en tu formulario de carga manual, una sola tasa cubre ambos.

**`PUT /monedas/tasas/:id`** — permiso `monedas.tasas.editar` — body `{ rate? }`.

**`DELETE /monedas/tasas/:id`** — permiso `monedas.tasas.eliminar`.

**`POST /monedas/tasas/sincronizar`** — permiso `monedas.tasas.sincronizar` — body opcional
`{ fecha? }` (sin `fecha`, sincroniza para hoy). Dispara la sincronización contra el proveedor
configurado fuera del horario del job automático — útil como botón "Sincronizar ahora".

**UI sugerida**: tabla de tasas cargadas (con filtros de fecha/moneda/tipo), botón "Cargar tasa"
(abre un form con `from`/`to`/`rate`/`date`), acciones editar/eliminar por fila, botón
"Sincronizar ahora" que llama al endpoint de sincronizar y refresca la tabla. Un widget opcional
de "tasa vigente ahora mismo" (llamando a `/tasas/vigente`) es útil como referencia rápida.

#### Utilitarios

**`GET /monedas/convertir?monto=&from=&to=&date=`** — permiso `monedas.tasas.ver` — utilitario
de UI, **nunca fuente contable** (no lo uses para calcular montos que se van a enviar a un
endpoint transaccional, solo para mostrarle al usuario una referencia). Respuesta:
```json
{ "success": true, "data": { "monto": 100, "from": "USD", "to": "DOP", "tasa": 60.5, "origen": "currency_exchange", "resultado": 6050 } }
```

**`POST /monedas/preview-conversion-banco`** — permiso `monedas.preview.ver` — body
`{ monto, moneda, cuentaBancaria, conversionRate? }`. Simula si un monto en `moneda` se puede
depositar/cobrar en `cuentaBancaria` (que puede estar en otra moneda), sin crear nada. **Nunca
lanza un 400 por incompatibilidad** — cualquier problema (banco no permitido, tasa faltante,
monto fuera de tolerancia) viaja en el campo `advertencia` de una respuesta 200, para que puedas
mostrarlo como una advertencia inline sin manejar un catch especial:
```json
{
  "success": true,
  "data": {
    "monedaBanco": "DOP",
    "requiereConversion": true,
    "permitido": true,
    "tasaAplicada": 60.5,
    "origenTasa": "manual",
    "montoEquivalente": 6050,
    "advertencia": null
  }
}
```
Útil como paso previo opcional antes de que el usuario confirme un cobro/pago/emisión en
Tesorería (Fase 4/5), ya que esos endpoints reales sí lanzan 400 duro con los códigos de la tabla
de 0.4.

---

## Fase 2 — Clientes y Proveedores: moneda por defecto

Mecanismo idéntico en ambos módulos.

### Clientes (`POST/PUT /customers`)

Dos campos nuevos, ambos opcionales:

| Campo | Tipo | Comportamiento |
|---|---|---|
| `defaultCurrency` | `'DOP'\|'USD'\|'EUR'` | Moneda por defecto de este cliente. Si difiere de la moneda base, debe estar habilitada primero (Fase 1) — si no, `400 CURRENCY_NOT_ENABLED`. Al fijarla, el backend **autopobla** `cuentaCxcDefault` con la cuenta de Cuentas por Cobrar de esa moneda (creada al habilitar la moneda, Fase 1), a menos que mandes `cuentaCxcDefault` explícito en el mismo request. |
| `cuentaCxcDefault` | string | Cuenta contable de Cuentas por Cobrar alterna para este cliente. Si la mandas explícita junto con `defaultCurrency`, tu valor explícito gana (no se autopobla). |

**Comportamiento especial al "volver" a la moneda base**: si editas un cliente y le pones
`defaultCurrency` igual a la moneda base de la compañía, el backend **limpia** automáticamente
`cuentaCxcDefault` (vuelve a usar la cuenta CxC genérica de la compañía) — a menos que tú mismo
mandes `cuentaCxcDefault` en ese mismo request, en cuyo caso se respeta.

Respuesta de `GET/POST/PUT /customers`: agrega `cuentaCxcDefault: string | null` y
`defaultCurrency: string | null`.

**UI sugerida**: un selector de moneda (las 3, pero solo mostrando como seleccionables las que
`monedasHabilitadas` incluye — o mostrando todas con un tooltip "habilítala primero" en las
deshabilitadas) en el formulario de cliente. No necesitas exponer `cuentaCxcDefault` como campo
editable a menos que el negocio lo pida explícitamente — es una cuenta contable, más un campo de
administrador avanzado que uno de uso diario.

### Proveedores (`POST/PUT /proveedores`)

Exactamente el mismo mecanismo, con nombres espejo: `defaultCurrency` (mismo nombre) y
`cuentaCxpDefault` (en vez de `cuentaCxcDefault` — CxP en vez de CxC). Misma lógica de
autopoblado y de limpieza al volver a la moneda base.

---

## Fase 3 — Ventas: Facturas, Cotizaciones, Pedidos, Notas de Crédito/Débito

### 3.0 Regla general de resolución de moneda (aplica a los 4 documentos)

Cuando creas un documento nuevo sin mandar `currency` explícito, el backend resuelve en este
orden: **`Customer.defaultCurrency` del cliente elegido (Fase 2) → moneda base de la
compañía**. Si mandas `currency` explícito, ese gana siempre. Un **cliente ocasional** (venta sin
cliente registrado) siempre queda en la moneda base — no hereda nada, el campo `party` para
resolución de moneda no aplica a clientes ocasionales.

Si la moneda resuelta es la base, `conversionRate` siempre es `1` explícito. Si es extranjera y
no mandaste `conversionRate`, el campo se omite del documento y **ERPNext** lo resuelve contra
`Currency Exchange`/tu tasa cargada en `/monedas/tasas` — si no hay ninguna tasa resoluble para
esa fecha, la creación del documento falla (error nativo de ERPNext, no un código `400`
estructurado del BFF — muéstralo como error genérico).

**No existe ninguna restricción de moneda en el flujo POS/Caja.** Si tu documentación anterior
mencionaba algo como "POS solo soporta DOP" o un código `POS_CURRENCY_NOT_SUPPORTED`, es
obsoleto o nunca se implementó — verificado que no existe en el código. Una venta al contado
(`is_pos=1`) puede estar en cualquier moneda habilitada, igual que una venta a crédito.

### 3.1 Facturas (`POST/PATCH /invoices/:id`)

⚠️ La edición de una factura en borrador es **`PATCH /invoices/:id`**, no `PUT`.

**Campos de request**: `currency` y `conversionRate` (ambos opcionales, ver 3.0). **Comportamiento
especial al editar (`PATCH`)**: si omites `currency` en una edición, el backend **congela** la
moneda/tasa que la factura ya tenía — no la vuelve a resolver contra el cliente actual. Esto es
intencional: corregir una cantidad o un ítem no debe cambiar silenciosamente la moneda de una
factura ya creada.

**Campos de respuesta** (`GET /invoices/:id`, `GET /invoices` para el listado):

| Campo | Presente en detalle | Presente en listado | Notas |
|---|---|---|---|
| `currency` | Sí (si el doc tiene moneda) | Sí | |
| `conversionRate` | Sí | No | Solo en `GET /invoices/:id` |
| `baseGrandTotal` | Sí | No | Total convertido a moneda base. Igual a `grandTotal` si la factura ya está en la moneda base. |
| `baseOutstandingAmount` | Sí | No | Saldo pendiente convertido a moneda base. |

**Gap conocido a tener en cuenta**: no existe `baseNetTotal` ni `baseRoundedTotal` en la
respuesta — si necesitas el subtotal (antes de impuestos) en moneda base, no está disponible por
API hoy; tendrías que aproximarlo con `subtotal * conversionRate` en el cliente (documentando que
es una aproximación, no el valor exacto que ERPNext calculó) o pedir que se agregue en el
backend.

**Todos los demás montos de la factura** (`subtotal`, `taxAmount`, `roundedTotal`,
`outstandingAmount`, `amountDue`, los montos de `items[]`, `paymentLines[]`, `advances[]`,
`pendingCreditNotes[]`) **están en la moneda del documento (`currency`), no en la moneda base** —
solo `baseGrandTotal`/`baseOutstandingAmount` son la excepción explícita.

### 3.2 Cotizaciones (`POST /quotations`, `PUT /quotations/:id`)

Mismos 2 campos de request (`currency`, `conversionRate`), misma regla de resolución al crear.

**Al editar (`PUT`)**: igual que Facturas, omitir `currency` conserva la moneda/tasa existente.

**Al convertir Cotización → Pedido** (`POST /quotations/:id/submit` o como se llame tu acción de
"convertir a pedido" en tu app — confirma la ruta exacta en tu `openapi.json`): la moneda/tasa se
**hereda tal cual** de la cotización, nunca se re-resuelve contra la fecha del día ni contra el
cliente actual.

**Al convertir Cotización → Factura**: también hereda de la cotización, pero SÍ vuelve a resolver
qué cuenta contable de CxC usar por si el cliente cambió su `cuentaCxcDefault` desde que se creó
la cotización (la moneda en sí no cambia, solo la cuenta contable detrás).

**Respuesta**: solo `currency` y `conversionRate` (condicionales, igual que Facturas). **No hay
`baseGrandTotal` ni `baseOutstandingAmount` en Cotizaciones** — si necesitas el equivalente en
moneda base, calcúlalo tú con `grandTotal * conversionRate`, documentando que es aproximado.

### 3.3 Pedidos de Venta (`POST /pedidos`, `PUT /pedidos/:id`)

Exactamente el mismo patrón que Cotizaciones (mismos 2 campos de request, misma herencia al
convertir a Factura — incluyendo el caso de "facturación de apartado"/layaway diferida). Misma
ausencia de campos `base*` en la respuesta.

### 3.4 Notas de Crédito (`POST /notas-credito`)

**El DTO no tiene ningún campo de moneda propio** — no agregues un selector de moneda a este
formulario. La nota de crédito siempre hereda automáticamente currency/tasa de la factura
original que está devolviendo, sin que el frontend tenga que hacer ni mandar nada. Es un
comportamiento 100% transparente.

**Respuesta**: `currency`/`conversionRate` condicionales (igual patrón que el resto). Sin
campos `base*`.

### 3.5 Notas de Débito (`POST /notas-debito`)

**El DTO tampoco tiene campos de moneda propios**, pero el comportamiento de herencia es **más
sutil que el de Nota de Crédito** — depende de si mandas `referenceInvoice`:

- **Con `referenceInvoice`** (el `name` de una factura existente — obligatorio si vas a emitir
  esta nota como e-CF tipo E33, opcional si no): la nota **hereda estrictamente** la
  `currency`/`conversionRate` de esa factura específica. Úsalo siempre que la nota de débito esté
  corrigiendo/complementando una factura concreta.
- **Sin `referenceInvoice`**: el documento se trata como "nuevo" — resuelve moneda igual que una
  Factura nueva (Cliente.defaultCurrency → moneda base), **no** mira ninguna factura previa del
  cliente aunque exista una reciente.

Si tu UI permite crear una nota de débito "suelta" (sin ligarla a una factura), ten presente que
en ese caso la moneda no viene de ningún lado predecible salvo el cliente — comunícalo con
claridad en el formulario (ej. un texto "Sin factura de referencia, se usará la moneda por
defecto del cliente").

**Respuesta**: mismo patrón `currency`/`conversionRate` condicionales, sin `base*`.

---

## Fase 4 — Cobros y Pagos

Lee primero **0.6** (gap: la respuesta no expone moneda) y **0.7** (no hay preview) — son
centrales para diseñar esta fase.

### 4.1 Campos de request — idénticos en forma entre `POST /cobros` y `POST /pagos`

| Campo | Tipo | Obligatorio | Qué es |
|---|---|---|---|
| `paidAmount` | number | **Sí, siempre** | El monto total cobrado/pagado, **en la moneda del cliente/proveedor** (nunca en la moneda del banco). |
| `conversionRate` | number | No | Tasa explícita cliente/proveedor → moneda base. Gana sobre la "Tasa Fija" (Fase 1) si la mandas. |
| `receivedAmount` | number | No, pero recomendado si banco≠cliente/proveedor | El monto real que se movió en la cuenta bancaria, si es distinta moneda. Si lo omites y hay conversión, el backend calcula uno propuesto — pero si mandas uno explícito, siempre gana (es "lo que realmente pasó"). |
| `bankConversionRate` | number | No | Tasa banco → moneda base. Solo relevante en el caso "triangular" (cliente en una moneda, banco en otra, ninguna de las dos es la moneda base) — ver advertencia abajo. |

**Advertencia de caso triangular** (poco común pero real): si el cliente/proveedor está en una
moneda, el banco en OTRA moneda distinta, y NINGUNA de las dos es la moneda base de la compañía
— si no mandas `bankConversionRate` explícito, el sistema **no logra calcular un equivalente
correcto** y termina usando el monto crudo sin convertir en `receivedAmount`. No hay un error que
te avise de esto — es una degradación silenciosa. **Si tu UI detecta este caso** (moneda del
documento ≠ moneda base Y moneda del banco elegido ≠ moneda base Y ambas monedas son distintas
entre sí), **exige `bankConversionRate` en el formulario** en vez de dejarlo opcional, para no
producir un cobro/pago con un monto de banco incorrecto.

### 4.2 Precedencia real de la tasa (lado cliente/proveedor)

En este orden exacto — documéntalo en tu UI si muestras algo tipo "¿qué tasa se va a usar?":

1. **Explícita**: si mandas `conversionRate` en el request, se usa tal cual. Gana siempre.
2. **Congelada / "Tasa Fija"**: si `tasaFijaCxc`/`tasaFijaCxp` (Fase 1) está activa Y el
   cobro/pago referencia al menos una factura, se usa la `conversionRate` que esas facturas ya
   tenían. Si las facturas referenciadas tienen tasas distintas entre sí →
   `400 PAYMENT_MIXED_RATES` (nunca promedia, el usuario debe separar el cobro/pago).
   **Importante**: si el cobro/pago es 100% un anticipo/saldo a favor sin ninguna factura
   referenciada, la Tasa Fija **nunca aplica** (no hay facturas de las que tomarla) — cae
   directo al paso 3.
3. **Nativa**: si nada de lo anterior resolvió una tasa, el campo se omite del payload y ERPNext
   la resuelve contra `Currency Exchange`.

Si el cliente/proveedor está en la misma moneda que la compañía, ninguno de estos pasos aplica —
la tasa es `1` implícita, sin ningún campo de tasa en el payload.

### 4.3 Validación de banco (`assertBankCurrencyCompatible`) — misma lógica que
`POST /monedas/preview-conversion-banco` pero con errores duros

A diferencia del preview (Fase 1, que nunca lanza 400), **el `POST /cobros`/`POST /pagos` real sí
lanza `400` duro**:

- Moneda del monto ≠ moneda del banco Y `permitirPagoMonedaDistintaBanco` (Fase 1) desactivado →
  `BANK_ACCOUNT_CURRENCY_MISMATCH` inmediato, ni siquiera intenta resolver tasa.
- Si está permitido pero no hay tasa resoluble → `EXCHANGE_RATE_REQUIRED`.
- Si mandaste `receivedAmount` explícito y se aparta &gt;2% del equivalente calculado →
  `BANK_AMOUNT_OUT_OF_TOLERANCE`.

**Recomendación de UX**: antes de dejar que el usuario confirme un cobro/pago donde detectaste
que la moneda del documento difiere de la cuenta bancaria elegida, considera llamar primero a
`POST /monedas/preview-conversion-banco` (Fase 1) para mostrarle una advertencia amigable en vez
de que se entere solo cuando el `POST` real falla.

### 4.4 Otros errores relacionados a moneda

- `PAYMENT_MIXED_CURRENCIES`: las facturas/documentos que estás referenciando en un mismo
  cobro/pago están en monedas distintas entre sí — no se puede, sepáralos en cobros/pagos
  distintos.
- Error sin código (solo `message`): la suma de montos asignados a las referencias no coincide
  con `paidAmount` (tolerancia de 1 centavo) — trátalo como validación de formulario genérica.

### 4.5 Qué NO puedes mostrar (repetido de 0.6, por si saltaste directo a esta fase)

Después de crear el cobro/pago, la respuesta **no** trae `currency`, `conversionRate`,
`receivedAmount` de vuelta, ni ningún monto en moneda base. Diseña tu pantalla de confirmación
sin depender de eso.

---

## Fase 5 — Tesorería y Cuentas Bancarias

### 5.0 Contexto: 3 flujos de Tesorería, todos comparten los mismos conceptos de Fase 4

Emisiones (`POST /tesoreria/emisiones`) y Depósitos (`POST /tesoreria/depositos`) son
conceptualmente "pagos"/"cobros" hechos desde el módulo de Tesorería en vez de desde
Cuentas por Pagar/Cobrar — comparten el mismo motor de resolución de tasas y los mismos errores
de la Fase 4 (`PAYMENT_MIXED_CURRENCIES`, `PAYMENT_MIXED_RATES`, `BANK_ACCOUNT_CURRENCY_MISMATCH`,
`EXCHANGE_RATE_REQUIRED`). La diferencia de nomenclatura de 0.5 aplica aquí: estos endpoints usan
`conversionRate` como nombre de campo pero la moneda del documento se llama `moneda` en las
respuestas de lectura (`GET /tesoreria/movimientos`), no `currency`.

### 5.1 `POST /tesoreria/emisiones` (salidas de dinero — con o sin beneficiario)

No hay un campo `moneda`/`currency` propio del documento — se **deriva** de la cuenta bancaria
elegida y, si hay `beneficiario`, de las facturas que estás liquidando.

| Campo | Tipo | Cuándo es relevante |
|---|---|---|
| `conversionRate` (nivel documento) | number | Tasa beneficiario/facturas liquidadas → moneda base. Solo con `beneficiario`, solo si esa moneda difiere de la del banco. Gana sobre la Tasa Fija en CxP. |
| `bankConversionRate` | number | Tasa banco → moneda base, si la cuenta bancaria opera en divisa y no hay tasa cargada para la fecha. |
| `conversionRate` por línea (dentro de cada ítem de `deducciones`/`distribucion`) | number | Solo en el camino SIN beneficiario (asiento directo) — tasa de esa cuenta específica → moneda base, si esa cuenta opera en divisa distinta y no hay tasa cargada. |

**Con `beneficiario`**: si las facturas que estás liquidando están en monedas distintas entre sí
→ `PAYMENT_MIXED_CURRENCIES`. Si el banco difiere de la moneda del beneficiario y
`permitirPagoMonedaDistintaBanco` está apagado → `BANK_ACCOUNT_CURRENCY_MISMATCH`.

**Sin `beneficiario`** (asiento contable directo): cada línea de `deducciones`/`distribucion`
puede estar en una cuenta de moneda distinta al banco — cada una necesita su propia tasa
resoluble. Si la suma (convertida a moneda base) no cuadra contra el monto del banco: error 400
sin código, mensaje descriptivo del descuadre.

### 5.2 `POST /tesoreria/depositos` (entradas de dinero — con o sin origen)

Misma forma de campos que Emisiones (`conversionRate` a nivel documento = moneda del origen →
base, `bankConversionRate` = banco → base, `conversionRate` por línea en el camino sin origen).

**Diferencia importante en el camino "sin origen" (asiento directo)**: las líneas de
`deducciones` deben estar **obligatoriamente en la misma moneda que el banco** — una deducción en
tercera moneda se rechaza con 400 explícito (mensaje libre, sin código). No ofrezcas selector de
cuenta libre para deducciones en este camino, filtra a cuentas de la misma moneda que el banco
elegido, o al menos valida en el cliente antes de enviar.

### 5.3 `POST /tesoreria/transferencias-internas`

Siempre se postea como Journal Entry (asiento contable), sin importar si origen y destino están
en la misma moneda o no — es una decisión de diseño explícita del backend, no necesitas hacer
nada distinto en tu UI por eso, solo entender que **siempre** hay un único flujo de creación, no
dos caminos como en Emisiones/Depósitos.

| Campo | Tipo | Obligatorio | Notas |
|---|---|---|---|
| `montoDestino` | number | **Sí, si origen y destino están en monedas distintas** — si no lo mandas en ese caso, `400 MONTO_DESTINO_REQUIRED`. El backend **nunca lo calcula solo** a partir de una tasa — siempre debe venir explícito del usuario/tu cliente. Si origen y destino son la misma moneda, se ignora (el destino siempre es `monto - deducciones`). | |
| `conversionRateOrigen` | number | No | Tasa moneda de origen → base, si esa cuenta opera en divisa y no hay tasa cargada. |
| `conversionRateDestino` | number | No | Tasa moneda de destino → base, análogo. |

**Regla no obvia**: cualquier comisión/deducción de una transferencia siempre se asume en la
**moneda de ORIGEN** — si tu UI permite elegir la cuenta de la comisión, valida que esté en esa
moneda o deja que el backend la rechace (400 sin código, "fuera de alcance", mensaje libre).

**Diferencial cambiario**: cuando origen y destino están en monedas distintas, puede generarse
automáticamente una línea contable de "diferencial cambiario" contra la cuenta de
ganancia/pérdida cambiaria de la compañía — es 100% transparente para el usuario, no necesitas
mostrar ni pedir nada por esto. Si la compañía no tiene esa cuenta configurada y hace falta, el
backend devuelve un 400 con mensaje libre sugiriendo configurarla — muéstralo tal cual, es un
caso de configuración de backoffice, no algo que el usuario final de este formulario pueda
resolver.

### 5.4 `POST /journal-entry` (asientos manuales)

No hay campo de moneda a nivel del documento completo. Cada línea (`entries[]`) puede tener:

| Campo | Tipo | Cuándo |
|---|---|---|
| `entries[].conversionRate` | number | Solo si esa línea usa una cuenta contable que opera en una moneda distinta a la base y no hay tasa cargada para la fecha. Si la omites en ese caso: `EXCHANGE_RATE_REQUIRED`. |

Si TODAS las cuentas del asiento están en la moneda base (el caso de la enorme mayoría de
asientos manuales), este campo nunca aplica — comportamiento idéntico a antes de esta feature.

**Respuesta de `GET /journal-entry/:id`**: cada línea trae `currency` (moneda de esa cuenta,
`null` si es la base) y `conversionRate` (`null` si no aplicó conversión) — nota que aquí el
nombre es `currency`, no `moneda` (ver tabla de 0.5).

### 5.5 `GET /tesoreria/movimientos` (listado unificado)

Normaliza Emisiones/Depósitos/Transferencias/asientos relacionados en un solo listado. Campos de
moneda:

**A nivel de cada transacción**: `moneda?` (moneda del lado banco), `conversionRate?` (tasa
banco→base usada), `montoBase?` (el monto convertido a moneda base). Los 3 son `undefined` en un
tenant/documento que nunca tocó multimoneda (compatibilidad hacia atrás total).

**Por cada línea contable dentro de una transacción**: `moneda?` (moneda de esa cuenta
específica), `montoBase?` (esa línea convertida a base), `esDiferenciaCambiaria?` (boolean — sólo
aparece en `true` en una línea que ERPNext generó automáticamente como ajuste de
ganancia/pérdida cambiaria dentro de un Payment Entry — es decir, en emisiones/depósitos con
beneficiario/origen; las transferencias internas NO usan este flag aunque también puedan generar
un ajuste cambiario, ver 5.3 — no asumas que puedes detectar el ajuste de una transferencia
buscando este flag, en ese caso es una línea contable normal más).

**UI sugerida**: si tu listado de movimientos de Tesorería muestra un monto único por
transacción, considera mostrar `montoBase` cuando `moneda` no sea la moneda base, con la moneda
original entre paréntesis (ej. "RD$ 30,000 (US$ 500)"). Usa `esDiferenciaCambiaria` para
etiquetar visualmente esas líneas como "Ajuste cambiario" en vez de tratarlas como un movimiento
normal más si tu tabla desglosa por línea.

### 5.6 Cuentas Bancarias

**Mecanismo central**: la moneda REAL de una cuenta bancaria es siempre la de su cuenta contable
(GL) vinculada — nunca un campo editable libre. El campo `currency` que mandas al crear/editar
una Cuenta Bancaria (`POST/PUT /cuentas-bancarias`) es solo una **confirmación/validación**: si
no coincide con la moneda real de la cuenta contable que elegiste, `400
BANK_ACCOUNT_CURRENCY_MISMATCH_GL` (nota: es un código **distinto** al `BANK_ACCOUNT_CURRENCY_
MISMATCH` de Cobros/Pagos/Tesorería — no los trates igual en tu manejo de errores). El backend
nunca persiste tu `currency` mandado directo, siempre guarda la moneda real resuelta de la cuenta
contable.

**Respuesta** de `GET /cuentas-bancarias` y `GET /cuentas-bancarias/:id`: campo `currency?`
(siempre la moneda real de la cuenta contable vinculada).

⚠️ **Excepción de nomenclatura dentro del mismo módulo**: `GET /cuentas-bancarias/:id/balance`
usa el campo `moneda` (no `currency`) en su respuesta — es el único endpoint de Cuentas Bancarias
que rompe el patrón del resto del módulo. No es un typo tuyo si lo ves así, es así en el backend.

**`GET /cuentas-bancarias/inconsistencias-moneda`** — endpoint nuevo, útil como una pantalla de
"salud"/auditoría para administradores. Detecta cuentas bancarias donde el campo espejo interno
(`custom_moneda`, invisible para ti normalmente) quedó desincronizado de la moneda real de la
cuenta contable — un caso que en teoría no debería ocurrir si todo pasa siempre por el mismo
`POST`/`PUT`, pero puede pasar si alguien editó algo directo en ERPNext por fuera de esta app.
Respuesta:
```json
{
  "success": true,
  "data": [
    {
      "id": "BA-00003",
      "accountName": "Cuenta USD Banreservas",
      "account": "1010-05 - Banco USD - JBC",
      "customMoneda": "DOP",
      "accountCurrency": "USD"
    }
  ]
}
```
`accountCurrency` es siempre la fuente de verdad; `customMoneda` es el valor divergente
encontrado. Si implementas esta pantalla, trátala como informativa/de solo lectura — no hay un
endpoint para "arreglar" la inconsistencia automáticamente, es una señal para que un admin
revise esa cuenta bancaria manualmente (reeditarla con `PUT` ya la resincroniza sola).

---

## Fase 6 — Reportes y Dashboard

### 6.1 Reportes fiscales (606/607/Facturación Fiscal) — sin cambios de request, los totales ahora son correctos

`GET /reportes/dgii/606`, `GET /reportes/dgii/607`, `GET /reportes/dgii/facturacion-fiscal` no
ganaron ningún parámetro nuevo. Lo que cambió es que ahora reportan correctamente en DOP (moneda
que exige la DGII) aunque las facturas/compras subyacentes estén en USD/EUR — esto es
transparente para ti, no necesitas cambiar nada en cómo consumes estos endpoints. Si tu UI ya
muestra estos reportes, no hace falta ningún cambio.

### 6.2 Dashboard (`GET /dashboard/summary`)

El objeto `kpis` de la respuesta ahora incluye `currency: string` — la moneda base real de la
compañía (antes era un `'DOP'` fijo en el código, ahora refleja la real, aunque hoy sigan siendo
iguales en la práctica). Úsalo para el símbolo de moneda en los KPIs en vez de asumir `'DOP'`/
`'RD$'` hardcodeado, por si en el futuro un tenant tiene otra base.

`GET /dashboard/recent-activity`: cada item ahora trae `currency` (la moneda de ESE documento
puntual, no la base) — a propósito no se consolida a la moneda base porque es una ficha de "esto
pasó", no un agregado. Si muestras montos de esta lista, formatea cada uno con su propia
`currency`, no asumas que todos son DOP.

### 6.3 Cuadre de Caja (`GET /reportes/caja/cuadre`) — segmentado por moneda

**Cambio de forma de la respuesta**: se agregó `porMoneda`, un array que es la **fuente de
verdad** cuando hay más de una moneda operando en el día:

```json
{
  "success": true,
  "data": {
    "date": "2026-06-07",
    "porMoneda": [
      {
        "moneda": "DOP",
        "totalCobrado": 45000,
        "totalFacturado": 44500,
        "numCobros": 12,
        "numFacturas": 10,
        "diferencia": -500,
        "porMetodoDePago": [{ "metodo": "Efectivo", "total": 30000 }, { "metodo": "Tarjeta", "total": 15000 }]
      },
      {
        "moneda": "USD",
        "totalCobrado": 500,
        "totalFacturado": 500,
        "numCobros": 1,
        "numFacturas": 1,
        "diferencia": 0,
        "porMetodoDePago": [{ "metodo": "Efectivo", "total": 500 }]
      }
    ],
    "totalCobrado": 45500,
    "totalFacturado": 45000,
    "porMetodoDePago": [...],
    "diferencia": -500
  }
}
```

Los campos "legacy" a nivel raíz (`totalCobrado`, `totalFacturado`, `porMetodoDePago`,
`diferencia`) se mantienen por compatibilidad, pero son la **suma cruda entre todas las
monedas** — solo tienen sentido si el tenant opera en una sola moneda. **Si vas a construir esta
pantalla de cero (o si el tenant que la usa ya tiene multimoneda activa en POS), usa `porMoneda`
como fuente de verdad y muestra un desglose por moneda**, nunca sumes montos de distintas
monedas entre sí en tu propio código.

Este reporte es deliberadamente **segmentado, no convertido a base** — es un cuadre de "qué hay
físicamente en la caja", así que un cobro en USD nunca se mezcla con uno en DOP en un solo
número, a diferencia del Dashboard (Fase 6.2), que sí consolida a la moneda base porque es un KPI
financiero, no un conteo físico.

### 6.4 Cuadre por Turno (`GET /reportes/pos/cuadre-turno`)

Cada fila ahora trae `moneda` — la moneda del POS Profile de ese turno (ERPNext garantiza que un
mismo turno nunca mezcla monedas, así que es seguro asumir una sola moneda por fila/turno). Si tu
rango de fechas incluye turnos de distintos cajeros/POS Profiles que operan en monedas distintas,
usa este campo para etiquetar cada fila correctamente en vez de asumir que todas están en la
moneda base.

### 6.5 Corte de Caja del Día (`GET /reportes/pos/corte-caja-dia`)

Cada turno listado trae `moneda` (mismo criterio que 6.4). El bloque `consolidado` (suma de
todos los turnos del día) se mantiene por compatibilidad pero es una suma cruda — se agregó
`consolidadoPorMoneda`, un array con la misma forma de `consolidado` pero segmentado por moneda,
como fuente de verdad cuando el día tuvo turnos de POS Profiles en distintas monedas. Mismo
criterio que 6.3: nunca sumes montos de monedas distintas en tu propio código, usa
`consolidadoPorMoneda`.

---

## Fase 7 — Plantillas de impresión

Esta fase ya tiene su propio documento dedicado, autocontenido:
**`docs/frontend-tasks/63_plantillas_multimoneda.md`**. Léelo directo si estás implementando el
editor de plantillas de impresión (ticket POS) — cubre los 6 bindings nuevos
(`factura.moneda`, `factura.tasaCambio`, `factura.subtotalBase`, `factura.impuestosBase`,
`factura.totalBase`, `empresa.monedaBase`) y cómo maquetarlos.

---

## Checklist maestro de implementación

Úsalo para trackear progreso — cada ítem referencia su fase:

- [ ] Refrescar `openapi.json` desde `/api/docs-json` (obligatorio antes de todo lo demás).
- [ ] **Fase 1**: sección "Multimoneda" en Configuración de Facturación (6 campos editables + 3
      derivados de solo lectura).
- [ ] **Fase 1**: pantalla de gestión de monedas (`GET/PATCH /monedas/:code`) con toggle por
      moneda.
- [ ] **Fase 1**: CRUD de tasas de cambio (`GET/POST/PUT/DELETE /monedas/tasas*`) + botón
      "Sincronizar ahora".
- [ ] **Fase 2**: selector `defaultCurrency` en formularios de Cliente y Proveedor.
- [ ] **Fase 3**: selector `currency`/`conversionRate` en Facturas, Cotizaciones y Pedidos —
      gateado por `multimonedaHabilitada` (Fase 1) para no confundir a tenants sin esta feature
      activa.
- [ ] **Fase 3**: confirmar que Notas de Crédito/Débito NO tienen selector de moneda propio (se
      heredan automáticamente) — si tu implementación anterior agregó uno, quítalo.
- [ ] **Fase 3**: mostrar `baseGrandTotal`/`baseOutstandingAmount` en el detalle de Factura
      cuando `currency` difiera de la moneda base.
- [ ] **Fase 4**: campos `conversionRate`/`receivedAmount`/`bankConversionRate` en los
      formularios de Cobro y Pago, con el manejo de errores de 4.3/4.4 — y sin depender de que la
      respuesta post-creación traiga la moneda de vuelta (0.6).
- [ ] **Fase 5**: formularios de Emisión/Depósito/Transferencia Interna con sus campos de tasa
      correspondientes — especial atención a `montoDestino` obligatorio en transferencias entre
      monedas distintas.
- [ ] **Fase 5**: listado de `/tesoreria/movimientos` mostrando `moneda`/`montoBase` por
      transacción y línea, con `esDiferenciaCambiaria` etiquetado si aplica.
- [ ] **Fase 5**: Cuentas Bancarias — campo `currency` de solo confirmación (no editable libre),
      y pantalla opcional de `inconsistencias-moneda` para administradores.
- [ ] **Fase 6**: Dashboard usando `kpis.currency` en vez de `'RD$'`/`'DOP'` hardcodeado.
- [ ] **Fase 6**: Cuadre de Caja / Cuadre por Turno / Corte de Caja del Día usando `porMoneda` /
      `moneda` / `consolidadoPorMoneda` como fuente de verdad, nunca sumando entre monedas en el
      cliente.
- [ ] **Fase 7**: bindings multimoneda en el editor de plantillas de impresión (documento 63
      dedicado).
- [ ] Revisar cualquier UI construida siguiendo el documento 60 (obsoleto) — específicamente
      cualquier lugar donde se asumió que Ventas/Clientes/Tesorería no tenían multimoneda.

### Pruebas manuales sugeridas (de punta a punta)

- [ ] Habilitar USD desde Fase 1, cargar una tasa manual, confirmar que aparece en
      `monedasHabilitadas` de `GET /config/facturacion`.
- [ ] Crear un cliente con `defaultCurrency: "USD"`, confirmar que se autopobló su cuenta CxC en
      USD.
- [ ] Crear una factura para ese cliente sin mandar `currency` — confirmar que salió en USD, con
      `baseGrandTotal` convertido correctamente a DOP.
- [ ] Cobrar esa factura con un banco en DOP — confirmar el flujo de `receivedAmount`/
      `bankConversionRate` y que el 400 `BANK_ACCOUNT_CURRENCY_MISMATCH` aparece si
      `permitirPagoMonedaDistintaBanco` está apagado.
- [ ] Repetir con `permitirPagoMonedaDistintaBanco` activo — confirmar que el cobro se crea sin
      error.
- [ ] Crear una emisión de Tesorería con beneficiario en USD pagada desde un banco en DOP.
- [ ] Crear una transferencia interna entre una cuenta DOP y una USD — confirmar que
      `montoDestino` es obligatorio y que se genera correctamente sin necesidad de elegir
      Payment Entry vs Journal Entry (siempre es Journal Entry, transparente).
- [ ] Revisar `GET /reportes/caja/cuadre` de un día con cobros en DOP y USD — confirmar que
      `porMoneda` los mantiene separados y que no aparecen mezclados en ningún total.
- [ ] Revisar el Dashboard — confirmar `kpis.currency` y que `recent-activity` muestra cada
      documento en su propia moneda.
