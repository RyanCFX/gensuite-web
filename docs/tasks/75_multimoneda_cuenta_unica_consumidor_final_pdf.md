# Prompt para el agente de frontend — Cuenta CxC/CxP única en DOP, retiro de variantes de Consumidor Final/Proveedor Ocasional y toggle de moneda en el PDF de factura

Copia y pega este prompt completo al agente de frontend.

---

> **Antes de empezar**: refresca tu copia de `openapi.json` desde el backend
> (`GET /api/docs-json`, `https://gensapi.ryancfx.click/api/docs-json` o
> `http://localhost:4000/api/docs-json` en desarrollo) — este documento describe campos y
> parámetros nuevos/cambiados que probablemente no estén en tu copia actual. Todo lo que este
> documento diga sobre nombres exactos de campos, tipos y `enum` de query params ya está
> reflejado en ese `openapi.json` actualizado — es la fuente de verdad final si hay cualquier
> duda puntual sobre un tipo. Lo que sigue acá es la explicación funcional completa de **por qué**
> cambió cada cosa y **qué debe hacer la UI** al respecto — no es un reemplazo del schema, es el
> contexto que el schema no puede darte.
>
> **Todo lo descrito en este documento ya está implementado y desplegado en el backend** — no es
> un plan a futuro. Es un cambio de arquitectura contable real (toca cómo se contabilizan
> facturas/cobros/pagos en moneda extranjera), así que sé meticuloso: no asumas comportamiento
> por analogía con otras features, lee cada sección completa antes de tocar código.
>
> API base: `https://gensapi.ryancfx.click/api/v1` (o `http://localhost:4000/api/v1` en
> desarrollo). Envelope de respuesta estándar: toda 2xx es `{ success: true, data: ... }`; todo
> error de validación de negocio es `400` con `{ statusCode: 400, code: "...", message: "..." }`
> — mismo patrón que ya usas para el resto de la app.

---

## 0. Resumen ejecutivo (léelo primero, en una frase por cambio)

1. **Cuenta contable**: el backend dejó de usar "una cuenta CxC/CxP por moneda" (un cliente en
   USD tenía su propia subcuenta `112-01-USD`) y pasó a usar **una sola cuenta CxC/CxP, siempre
   en DOP, para TODOS los clientes/proveedores, sin importar en qué moneda facturen**. Esto es
   invisible para casi toda la UI (la factura sigue mostrando `USD`, `EUR` o `DOP` normalmente),
   pero hay 2-3 puntos concretos donde el frontend debe ajustar texto/comportamiento — ver
   sección 1.
2. **Consumidor Final / Proveedor Ocasional**: como consecuencia directa del punto anterior, el
   backend retiró unos registros internos de ERPNext llamados "Consumidor Final (USD)" /
   "Consumidor Final (EUR)" / "Proveedor Ocasional (USD)" / "Proveedor Ocasional (EUR)" que
   nunca fueron expuestos ni usados por ningún endpoint del BFF — el frontend nunca debería
   haber tenido código que los referenciara, pero si lo tiene (por ejemplo, un listado
   hardcodeado de nombres de cliente/proveedor "de sistema"), hay que quitarlo — ver sección 2.
3. **PDF de factura**: `GET /invoicing/invoices/:id/pdf` ahora acepta un query param nuevo,
   `moneda`, para elegir si el PDF (formato `a4`/`carta`/`a6`) imprime los montos en DOP o en la
   moneda real del documento. El frontend debe agregar el control de UI correspondiente — ver
   sección 3.

---

## 1. Cuenta CxC/CxP única en DOP (reemplaza el diseño anterior "una cuenta por moneda")

### 1.1 Qué pasaba antes y por qué se cambió

Antes, cuando un cliente facturaba en USD/EUR, el backend intentaba usar (o crear) una subcuenta
contable dedicada para esa moneda (`112-01-USD` para Cuentas por Cobrar, `21-01-001-USD` para
Cuentas por Pagar), distinta de la cuenta que usa ese mismo cliente cuando factura en DOP.

Se descubrió, leyendo el código fuente real de ERPNext v16, que este diseño **no funciona en
absoluto**, sin importar qué cuenta se use: ERPNext tiene una regla nativa e incondicional
(`GLEntry.validate_currency()` → `validate_party_gle_currency()`) que **bloquea para siempre** a
un cliente/proveedor que alguna vez tuvo un asiento contable sometido en una moneda, si se
intenta postear un asiento en otra moneda para la misma compañía — sin importar la cuenta.
En otras palabras: un cliente que factura una vez en DOP queda bloqueado para facturar en USD
después (y viceversa), aunque exista la subcuenta `112-01-USD` — el candado es por
cliente+compañía, no por cuenta.

La única combinación que funciona es la que se implementó: **una sola cuenta física CxC/CxP,
siempre en DOP, para absolutamente todos los clientes y proveedores**. Como la moneda contable
de esa cuenta (`account_currency`) nunca cambia (siempre es DOP), el candado nativo de ERPNext
nunca se activa, sin importar si la factura individual está en USD, EUR o DOP. Un ajuste de
configuración de Accounts Settings (ver 1.4) permite que la moneda del *documento* (`USD`) sea
distinta a la moneda de esa cuenta (`DOP`) sin que ERPNext rechace el envío.

**Costo aceptado** (por si algún usuario de negocio pregunta por qué el mayor contable no
muestra el saldo en USD): se pierde el saldo nativo en moneda extranjera en el libro mayor y la
"Revaluación de Tipo de Cambio" nativa de ERPNext — el saldo de un cliente en USD/EUR solo existe
como agregación hecha por el BFF (reportes de Cuentas por Cobrar/Pagar), nunca como un balance
contable nativo en esa moneda. A cambio, cualquier cliente puede pagar en cualquier moneda en
cualquier momento sin quedar bloqueado permanentemente — que es lo que de verdad importa para el
negocio.

**Esto ya estaba parcialmente cubierto por `docs/frontend-tasks/74_multimoneda_cliente_proveedor_ocasional.md`** (que arregló el mismo problema pero solo para el caso de "Cliente/Proveedor Ocasional"). Este documento es el reemplazo global — el mismo arreglo, pero para **todos** los
clientes/proveedores, no solo los ocasionales. Si ya implementaste el 74, no hay nada que
deshacer; este documento es un superset.

### 1.2 Qué NO cambia para el frontend

- El campo `currency`/`conversionRate` en los 4+ documentos de venta (Facturas, Cotizaciones,
  Pedidos, Notas de Crédito/Débito) y en Compras/Gastos/Cobros/Pagos sigue funcionando
  exactamente igual — mismo contrato, mismos valores válidos (`DOP`/`USD`/`EUR`), misma lógica de
  resolución de tasa. **No hay ningún cambio de forma en ningún DTO de request/response de
  documentos de venta o compra por este cambio.**
- La respuesta de un documento (factura, cotización, etc.) sigue devolviendo `currency` y
  `conversionRate` tal cual los mandaste o resolvió el backend — esto no cambió.
- Los reportes de Cuentas por Cobrar/Cuentas por Pagar por cliente/proveedor siguen funcionando
  igual desde la perspectiva de la API — siguen agregando montos en la moneda de cada documento y
  convirtiendo a DOP para los totales, como ya lo hacían.
- **No hace falta ningún cambio de UI si el frontend nunca mostró ni permitió editar
  directamente una cuenta contable CxC/CxP** (lo normal — la mayoría de la UI de facturación no
  expone nombres de cuentas contables, eso vive del lado de ERPNext/contabilidad). Si ese es tu
  caso, puedes saltar directo a la sección 1.5 (checklist) y confirmar que no aplica nada más.

### 1.3 Campo `cuentaCxcDefault` de Cliente (y de Aseguradora, en el vertical farmacia) — ahora es de solo informativo, ya no afecta la contabilidad de la factura

Si tu UI de **Clientes** (`POST/PUT /customers`, `GET /customers`, `GET /customers/:id`) muestra
o permite editar un campo llamado `cuentaCxcDefault` (una cuenta contable "CxC por defecto" del
cliente — normalmente asociado a la sección de moneda del formulario de cliente, mismo patrón en
**Aseguradoras** del vertical farmacia con su propio `cuentaCxcDefault`):

- El campo **sigue existiendo** en el DTO de request y en la respuesta — no se retiró del
  contrato de la API, así que no vas a ver un error 400 por seguir mandándolo.
- El backend **sigue autopoblándolo** automáticamente cuando el usuario cambia la moneda por
  defecto del cliente (`defaultCurrency`) — igual que antes.
- **Pero ya no tiene ningún efecto en la contabilidad real.** Al emitir una factura de venta,
  el backend **siempre** usa la cuenta CxC única de la compañía (en DOP), sin importar lo que
  diga `cuentaCxcDefault` en la ficha del cliente. Es decir: hoy, para Clientes/Aseguradoras,
  este campo es efectivamente **de solo lectura desde el punto de vista funcional** — puedes
  seguir mostrándolo (por ejemplo como referencia histórica o de auditoría), pero **no debe
  presentarse al usuario como una perilla que cambia algo real** al facturar. Si tu formulario de
  Cliente/Aseguradora tiene este campo como editable manualmente (no solo autopoblado), lo ideal
  es:
  - Quitarlo de la UI de edición manual, **o**
  - Si prefieres mantenerlo por ahora, agregar un texto de ayuda que aclare que es informativo y
    no afecta la cuenta contable real de la factura (para no confundir a un usuario de
    contabilidad que intente "forzar" una cuenta distinta esperando que tenga efecto).

**Importante — no confundir con el campo espejo de Proveedores, que es distinto (ver 1.4).**

### 1.4 Campo `cuentaCxpDefault` de Proveedor — sigue siendo un override contable REAL y activo (no tocar su comportamiento)

A diferencia del punto anterior, el campo `cuentaCxpDefault` de **Proveedores**
(`POST/PUT /proveedores`, `GET /proveedores`, `GET /proveedores/:id`) es un mecanismo distinto,
preexistente (no fue creado por la feature de multimoneda, sino reutilizado por ella) y **sigue
totalmente vivo y con efecto contable real**: si un proveedor tiene `cuentaCxpDefault`
configurado, **Compras, Recepciones de Compra y Órdenes de Compra siguen usando literalmente esa
cuenta** como `credit_to` del documento, en vez de la cuenta CxP por defecto de la compañía.

- **No cambies nada en cómo el frontend muestra o edita este campo** — su comportamiento es
  idéntico a como lo era antes de este cambio. Es una "cuenta CxP alterna" configurable
  manualmente por el usuario (contabilidad puede querer que las compras a un proveedor específico
  se contabilicen contra una cuenta distinta, por razones propias de reporting interno), no una
  reliquia del diseño de multimoneda.
- Sí sigue siendo cierto que, si el usuario cambia `defaultCurrency` del proveedor, el backend
  autopobla este campo (mismo mecanismo de autopoblado que en Clientes) — pero a diferencia de
  Clientes, ese autopoblado sigue teniendo consecuencia real en Compras. No agregues ningún texto
  de "esto es solo informativo" para este campo — sería incorrecto.

### 1.5 Nuevo campo `allowMultiCurrencyInvoicesAgainstSinglePartyAccount` en Configuración > Contabilidad (Accounts Settings)

`GET /config/accounts-settings` y `PUT /config/accounts-settings` ahora incluyen un campo
booleano nuevo: `allowMultiCurrencyInvoicesAgainstSinglePartyAccount`. Vive en el mismo objeto que
ya conoces con `allowStale`, `staleDays`, `enableAccountingDimensions`,
`deleteLinkedLedgerEntries`, `unlinkPaymentOnCancellationOfInvoice`,
`addTaxesFromItemTaxTemplate`, `checkSupplierInvoiceUniqueness`, `overBillingAllowance`,
`bookDeferredEntriesViaJournalEntry`, `submitJournalEntries`, `enableImmutableLedger`,
`showBalanceInCoa`, `defaultAgeingRange`, `creditController`, `roleAllowedToOverBill` — es decir,
si tu pantalla de "Configuración > Contabilidad" ya renderiza estos campos dinámicamente a partir
de la respuesta completa del endpoint, este campo nuevo probablemente ya te aparece sin cambiar
nada. Si en cambio tu formulario está hardcodeado campo por campo, hay que agregarlo a mano.

**Cómo presentarlo**: es el ajuste técnico que permite que el modelo de cuenta única en DOP
funcione (ver 1.1) — **no es una perilla operativa real que el usuario debería tocar**. El
backend lo activa por defecto en todo tenant nuevo, y hay un patch que lo activa retroactivamente
en tenants existentes; en la práctica, este valor siempre va a ser `true`. Trátalo como
informativo/de solo lectura, o con una etiqueta clara de "avanzado — no desactivar" — no lo
presentes como un switch que el usuario normalmente necesitaría cambiar. Si tu pantalla ya tiene
un patrón de "sección avanzada, colapsada por defecto" para settings similares (como
`deleteLinkedLedgerEntries`, que el propio backend bloquea con un 400 explícito si se intenta
activar), usa ese mismo patrón visual.

### 1.6 Manejo de errores — el código `PARTY_CURRENCY_LOCKED` debería volverse prácticamente imposible de ver

Si tu interceptor de errores ya conoce un código `PARTY_CURRENCY_LOCKED` (mensaje típico de
ERPNext sobre "el cliente/proveedor tiene asientos contables en la moneda X, no puede facturarse
en Y"), **no lo elimines** — el backend todavía lo aísla con ese código propio si llegara a
aparecer (por ejemplo, contra datos históricos de un tenant que ya tenía subcuentas por moneda
antes de este cambio). Pero, en la práctica, con el modelo de cuenta única este error **ya no
debería producirse nunca más para tráfico nuevo** — si lo ves aparecer después de este cambio,
es una señal real de un caso raro (ej. datos residuales de antes de la migración), no una
limitación esperada del sistema. No necesitas texto especial nuevo para este código; sigue
usando el mensaje que ya tenías.

### 1.7 Checklist de verificación de la sección 1

1. Revisar el formulario de Cliente (y Aseguradora, vertical farmacia): si `cuentaCxcDefault` es
   editable manualmente, decidir si se oculta o se marca como informativo (1.3).
2. Confirmar que el formulario de Proveedor **no cambia** — `cuentaCxpDefault` sigue siendo un
   campo funcional real, sin ningún ajuste de texto ni comportamiento (1.4).
3. Si la pantalla de Configuración > Contabilidad lista campos de Accounts Settings manualmente,
   agregar `allowMultiCurrencyInvoicesAgainstSinglePartyAccount` como informativo/avanzado (1.5).
4. Crear una factura de venta en USD a un cliente que YA tenía facturas previas en DOP (o
   viceversa) y confirmar que se somete sin error — este es el caso que antes fallaba y ahora
   debe funcionar siempre, para cualquier cliente, no solo para el ocasional.

---

## 2. Consumidor Final / Proveedor Ocasional — retiro de las variantes por moneda (probablemente no requiere ningún cambio de código, pero hay que confirmarlo)

### 2.1 Qué se retiró y por qué

El backend tenía, del lado de ERPNext, tres registros "de sistema" además del cliente genérico
normal `Consumidor Final`: `Consumidor Final (USD)`, `Consumidor Final (EUR)` — y del lado de
proveedores, `Proveedor Ocasional (USD)`, `Proveedor Ocasional (EUR)`. Estos existían por la
misma razón histórica explicada en la sección 1.1 (el candado nativo de ERPNext por
party+moneda) — un intento de darle a "Consumidor Final" una variante dedicada por moneda para
evitar el bloqueo.

**Punto clave para el frontend: el BFF nunca expuso ni usó esas variantes.** El endpoint de
venta/creación de documentos (Facturas, Pedidos, Cotizaciones, Compras, Gastos) siempre mandó a
ERPNext el nombre fijo `"Consumidor Final"` / `"Proveedor Ocasional"`, sin importar la moneda del
documento (ver `docs/frontend-tasks/74_multimoneda_cliente_proveedor_ocasional.md`, que ya
describe el comportamiento correcto: el selector de moneda para "Cliente/Proveedor Ocasional"
debe comportarse igual que para un cliente registrado, usando siempre el mismo registro genérico
por debajo). Es decir: si implementaste correctamente el documento 74, **no hay nada que cambiar
aquí** — esas variantes nunca fueron parte del contrato de la API ni de ningún endpoint que el
frontend consuma.

Ahora, con el modelo de cuenta única en DOP (sección 1), esas variantes quedaron sin ningún
propósito real (el candado que intentaban evitar ya no puede activarse, porque la cuenta contable
de "Consumidor Final" siempre es DOP sin importar la moneda del documento) — así que el backend
las retiró de ERPNext donde ya existían.

### 2.2 Qué debe verificar/hacer el frontend

Esto es, en la gran mayoría de los casos, **un no-op para el frontend** — pero verifica
explícitamente estos puntos, porque si alguno aplica en tu código, hay que corregirlo:

1. **Ningún selector de Cliente/Proveedor debería listar nunca "Consumidor Final (USD)",
   "Consumidor Final (EUR)", "Proveedor Ocasional (USD)" ni "Proveedor Ocasional (EUR)" como
   opciones seleccionables** — si tu UI obtiene la lista de clientes/proveedores desde
   `GET /customers` / `GET /proveedores` (paginado, con búsqueda), esos registros simplemente ya
   no aparecen ahí después de este cambio (se retiraron de ERPNext). Si alguna vez aparecieron
   en un listado y tu código tiene lógica especial para filtrarlos/etiquetarlos ("(Sistema)" o
   similar), esa lógica especial ya no encontrará esos nombres — puedes dejarla (es inofensiva,
   simplemente nunca va a matchear) o limpiarla, a tu criterio.
2. **Ningún formulario debería tener un `<select>`/dropdown hardcodeado con estos 3 nombres por
   moneda** (ej. un mapeo manual `{ DOP: 'Consumidor Final', USD: 'Consumidor Final (USD)', EUR:
   'Consumidor Final (EUR)' }` para decidir qué mandar como `customer` según la moneda elegida).
   Si tu código tiene algo así, **hay que eliminarlo**: el valor correcto a mandar, sin importar
   la moneda del documento, es siempre y únicamente `"Consumidor Final"` (o, mejor aún, usar el
   flujo de "Cliente Ocasional" descrito en el documento 74 — el campo `clienteOcasionalNombre`
   en el body, no seleccionar un `Customer` por nombre en absoluto).
3. Si tu frontend nunca tuvo ninguna de estas dos cosas (lo más probable, dado que el BFF nunca
   expuso esas variantes en ningún DTO ni endpoint), **no hay ningún cambio de código que hacer
   en esta sección** — solo confirma el punto 1 visualmente (que esos nombres ya no aparecen en
   ningún listado) como parte de tu prueba de regresión.

### 2.3 Checklist de verificación de la sección 2

1. Buscar en el código del frontend las cadenas literales `"Consumidor Final ("` y `"Proveedor
   Ocasional ("` (con el paréntesis, para no matchear el nombre base) — si aparecen en algún
   lugar fuera de un comentario o test viejo, revisar y eliminar esa lógica.
2. Abrir el selector de Clientes y el de Proveedores en un tenant real y confirmar que no
   aparece ninguna de las 4 variantes por moneda en la lista.

---

## 3. Toggle de moneda en el PDF de factura (`GET /invoicing/invoices/:id/pdf`)

### 3.1 Qué se agregó

El endpoint de descarga/vista del PDF de una factura ahora acepta un query param opcional nuevo:

```
GET /api/v1/invoicing/invoices/:id/pdf?formato=a4&moneda=dop
GET /api/v1/invoicing/invoices/:id/pdf?formato=a4&moneda=factura
```

- **`moneda`** (opcional, `enum: ['dop', 'factura']`, minúsculas exactas, default `'dop'`):
  - `'dop'` (default, es decir, si omites el parámetro por completo se comporta igual que antes
    de este cambio): el PDF imprime todos los montos convertidos a DOP, usando la tasa de cambio
    (`conversionRate`) del documento. Útil para archivo interno/contable en la moneda base del
    negocio, sin importar en qué moneda se facturó.
  - `'factura'`: el PDF imprime los montos en la moneda real del documento (`USD`/`EUR`/`DOP`,
    lo que sea que tenga la factura) — este es el comportamiento "mostrar la factura tal cual
    se emitió".
- **Este parámetro solo aplica cuando `formato` es `'a4'`, `'carta'` o `'a6'`** (los 3 formatos
  de página completa). El ticket POS (`formato=pos`, térmico 80mm) **siempre** imprime en DOP,
  automáticamente, sin necesidad de mandar `moneda` — si lo mandas junto con `formato=pos`, el
  backend simplemente lo ignora (el ticket POS nunca necesita este control en la UI).
- Cuando la factura ya está en DOP (el caso más común, sin cambios de moneda), ambos valores de
  `moneda` producen exactamente el mismo PDF — no hay ninguna diferencia visual para el usuario
  en ese caso, así que no te preocupes por "romper" el flujo de facturas en DOP: es
  completamente retrocompatible.

### 3.2 Qué debe agregar el frontend

En cualquier pantalla donde hoy exista un botón/menú de "Descargar PDF" o "Imprimir factura"
(vista de detalle de Factura, listado de Facturas con acción rápida de imprimir, etc.) que ya
deje elegir el `formato` (`a4`/`carta`/`a6`/`pos`):

1. **Solo para facturas cuya `currency` NO sea la moneda base del tenant** (es decir, facturas en
   USD/EUR cuando la compañía factura en DOP — puedes chequear esto comparando `currency` de la
   factura contra `monedaBase` de `GET /config/facturacion`, mismo campo que ya usas para el
   resto de la UI de multimoneda), **y solo cuando el formato elegido sea `a4`/`carta`/`a6`**
   (no aplica a `pos`): mostrar un control adicional para elegir la moneda de impresión — por
   ejemplo dos radio buttons o un pequeño toggle con las etiquetas:
   - "Imprimir en DOP" (equivalente en el código a `moneda=dop`, es la opción por defecto/
     preseleccionada)
   - "Imprimir en {moneda de la factura}" (ej. "Imprimir en USD", equivalente a `moneda=factura`)
2. Para una factura **en la moneda base** (DOP en la práctica hoy), **no muestres este control en
   absoluto** — no aporta nada (ambos valores dan el mismo PDF) y solo agrega ruido visual.
3. Para el formato **POS**, **no muestres este control en absoluto**, sin importar la moneda de
   la factura — el ticket siempre es en DOP, mostrarlo generaría la falsa expectativa de que se
   puede elegir.
4. El valor elegido se manda como el query param `moneda` (`'dop'` o `'factura'`, minúsculas
   literales) junto con `formato` en la misma request de descarga/vista de PDF que ya hacías.

### 3.3 Checklist de verificación de la sección 3

1. Factura en DOP: no aparece ningún control de moneda al descargar/imprimir en ningún formato.
2. Factura en USD/EUR, formato `a4`/`carta`/`a6`: aparece el control, con "DOP" preseleccionado
   por defecto; cambiar a la otra opción y confirmar visualmente que los montos del PDF cambian
   (NCF, QR y datos de e-CF deben verse idénticos en ambos casos — solo cambian los montos).
3. Factura en USD/EUR, formato `pos`: no aparece ningún control; el ticket sale siempre en DOP.
4. Confirmar que omitir el parámetro por completo (código viejo que no se actualizó todavía en
   algún punto de la app) sigue funcionando exactamente igual que antes — el backend usa
   `moneda=dop` por defecto de forma retrocompatible.

---

## 4. Resumen de archivos/pantallas típicas a revisar (guía, no una lista exhaustiva de tu codebase)

- Formulario de alta/edición de Cliente y de Aseguradora (farmacia) → sección 1.3.
- Formulario de alta/edición de Proveedor → sección 1.4 (confirmar que NO cambia nada).
- Pantalla de Configuración > Contabilidad / Accounts Settings → sección 1.5.
- Cualquier interceptor global de errores de la app que mapee códigos de error del backend a
  mensajes de UI → sección 1.6 (`PARTY_CURRENCY_LOCKED`, sin cambios de texto, solo confirmar que
  sigue existiendo el manejo).
- Selectores de Cliente/Proveedor (dropdowns de búsqueda en Facturas, Pedidos, Cotizaciones,
  Compras, Gastos) → sección 2.2.
- Botón/menú de "Descargar PDF" / "Imprimir factura" en el detalle de Factura y en el listado de
  Facturas → sección 3.2.

---

## 5. Qué NO hacer

- No reintroduzcas ningún selector/lógica que elija entre variantes de Customer/Supplier por
  moneda — ese patrón fue retirado a propósito y no debe reaparecer, ni para Consumidor
  Final/Proveedor Ocasional (sección 2) ni para ningún cliente/proveedor registrado (sección 1).
- No presentes `allowMultiCurrencyInvoicesAgainstSinglePartyAccount` (1.5) como un switch
  operativo normal — es un ajuste técnico, no una preferencia de negocio.
- No agregues el control de moneda del PDF (sección 3) al ticket POS, bajo ninguna circunstancia.
- No cambies nada en el comportamiento del campo `cuentaCxpDefault` de Proveedores (1.4) — sigue
  siendo un mecanismo contable real y activo, a diferencia de su equivalente en Clientes.
