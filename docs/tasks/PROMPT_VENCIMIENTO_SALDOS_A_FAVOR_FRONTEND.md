# Prompt para el agente de frontend: Vencimiento y uso de notas de crédito y saldos a favor

> **Para quien recibe este documento:** sos el agente que implementa el frontend de GenSuite
> (React). No tenés memoria de ninguna conversación previa. Todo lo que necesitás está en este
> documento y en el `openapi.json` del repo del frontend, que trae la documentación del API.
>
> **Cómo leer el `openapi.json` frente a este documento:**
> - Los **endpoints y los DTO** los define el `openapi.json`. Releelo antes de empezar: hay 6 rutas
>   nuevas, 5 campos nuevos en `PUT /config/facturacion` y campos nuevos en las respuestas de notas
>   de crédito y saldos a favor.
> - Lo que el `openapi.json` **NO puede expresar** está solo acá: el flujo de autorización con el
>   código de otro usuario (§6), los códigos de error con sus `details` (§8), qué significa cada
>   estado (§3) y las reglas de negocio de uso único (§7). En eso gana este documento.
> - Si encontrás una contradicción entre ambos, **anotala en tu resumen final**; no la resuelvas
>   por tu cuenta en silencio.
>
> El backend (BFF NestJS + ERPNext) **ya está implementado**. No inventes endpoints ni campos: si
> necesitás algo que no existe, dejalo anotado y seguí. Una verificación en vivo contra ERPNext
> está pendiente (§11, *límites conocidos*): **la baja de saldos a favor de tipo pago anticipado
> (Payment Entry) puede no funcionar todavía** — implementá la pantalla igual (§5.3) pero avisá
> en tu resumen final si al probarla contra un backend real falla.
>
> Este documento **extiende** `PROMPT_PERMISOS_V2_Y_DASHBOARD_MODULAR_FRONTEND.md` (permisos v2,
> `GET /me/acceso`) y `PROMPT_FEATURES_ADICIONALES_FRONTEND.md`. Todo lo que dicen **sigue
> valiendo y no hay que romperlo**.

---

## 0. Resumen en 20 líneas (leelo aunque sea lo único que leas)

1. Un **tenant** puede configurar que sus **notas de crédito** tengan **fecha de vencimiento** y
   que sean de **uso único** (una sola factura) o de **uso múltiple** (varias, como hasta hoy).
2. Cuando una nota de uso único se aplica por **menos** de su total, lo que sobra se configura:
   **pasa a saldo a favor** (con su propia vigencia) o **se pierde** (se da de baja contablemente).
3. Todo **saldo a favor** del cliente (anticipo sin aplicar, cobro de más, reembolso de un pedido
   cancelado, remanente de una nota) puede tener una **vigencia** configurable.
4. Por defecto (tenants que no configuren nada) **nada cambia**: nada vence y las notas se usan en
   varias facturas. Tu UI tiene que seguir funcionando igual con `venceEl = null`.
5. Un crédito **vencido** no se puede aplicar a una factura ni reembolsar. El backend responde
   `409` con un código estable (§8). **Tu UI no recalcula nada**: usa `estado` y `puedeAplicar`.
6. Un crédito vencido se puede **reactivar** (nueva fecha). También se puede **cambiar** la fecha de
   uno vigente y **dar de baja** el saldo de uno vencido (genera un asiento contable).
7. Esas tres acciones requieren un **permiso**. Si el usuario **no lo tiene**, puede igual hacerlas
   si **otro usuario que sí lo tiene** ingresa su **código** (PIN + usuario o código de tarjeta).
8. El backend avisa que admite ese código con un `403` cuyo `error.code` es `PERMISO_REQUERIDO` y
   `error.details.admiteAutorizacionPin = true`. Tu UI abre un **modal de código** y **reenvía la
   misma petición** con `pinOverride` (§6).
9. Quien autoriza **no puede ser el mismo** usuario que pide. Queda auditado.
10. Listados y detalle traen campos nuevos: `venceEl`, `diasRestantes`, `estado`, `puedeAplicar`,
    `uso`, `remanente`, `origenSaldoFavor`. Los totales traen `vencidoAmount` aparte de `balance`.
11. `balance` = **solo lo aplicable hoy**. Lo vencido está en `vencidoAmount`: mostralo aparte.
12. Hay 4 parámetros de configuración nuevos visibles para todos y 1 (la cuenta contable) solo en
    la pantalla de configuración.

---

## 1. Vocabulario

| Término | Qué es |
|---|---|
| **Nota de crédito (NC)** | Documento fiscal de devolución. En la API: `/credit-notes`. Su saldo disponible es `availableAmount`. |
| **Saldo a favor** | Dinero del cliente sin aplicar. Tiene **dos orígenes** que hoy se listan por separado: (a) **notas de crédito** con saldo (`GET /credit-notes/saldo-favor/:customerId`) y (b) **pagos anticipados** o cobros de más (`GET /cobros/saldo-favor/:customerId`, cada fila es un *Payment Entry*, `paymentEntryId`). |
| **Vigencia** | Días que dura una NC (`creditoVigenciaDias`) o un saldo a favor (`saldoFavorVigenciaDias`). `0` = no vence. |
| **Vencimiento (`venceEl`)** | Fecha `YYYY-MM-DD` **hasta la cual inclusive** se puede usar. El último día todavía sirve. |
| **Uso único** | La NC se puede aplicar a **una sola** factura. |
| **Remanente** | Lo que sobra de una NC de uso único tras su única aplicación. |
| **Baja** | Registrar contablemente la pérdida de un saldo vencido (asiento). Es reversible reactivando. |
| **Código de autorización** | `pinOverride`: PIN de 6 dígitos + (`usuario` **o** `codigoTarjeta`) de **otro** usuario con permiso. |

---

## 2. Configuración por tenant (pantalla Configuración → Facturación)

`GET /config/facturacion` y `PUT /config/facturacion` (permisos existentes
`config.facturacion.ver` / `config.facturacion.editar`) suman **cinco campos**. Agregalos a la
pantalla de configuración de facturación en una sección **«Notas de crédito y saldos a favor»**.

| Campo | Tipo | Valores | Default | Etiqueta sugerida y ayuda |
|---|---|---|---|---|
| `creditoVigenciaDias` | entero 0–3650 | | `0` | **Vigencia de las notas de crédito (días)**. «0 = no vencen». «Se fija al emitir la nota; cambiarlo no afecta las ya emitidas.» |
| `creditoUso` | enum | `multiple` \| `unico` | `multiple` | **Uso de las notas de crédito**. `multiple`: «Se pueden aplicar a varias facturas hasta agotarse». `unico`: «Solo se pueden aplicar a una factura». |
| `creditoRemanenteUnico` | enum | `saldo_favor` \| `perder` | `saldo_favor` | **Si sobra saldo en una nota de uso único**. **Solo visible/editable si `creditoUso = unico`**. `saldo_favor`: «Pasa a saldo a favor del cliente». `perder`: «Se pierde (se da de baja contra la cuenta de saldos vencidos)». |
| `saldoFavorVigenciaDias` | entero 0–3650 | | `0` | **Vigencia de los saldos a favor (días)**. «0 = no vencen». «Aplica a anticipos sin aplicar, cobros de más, reembolsos como saldo y remanentes. Se cuenta desde que nace el saldo. No aplica a aseguradoras.» |
| `saldoVencidoCuenta` | string \| null | nombre de una cuenta contable | `null` | **Cuenta de saldos vencidos**. Selector de cuentas de **ingreso**. «Aquí se registra lo que se pierde.» **Obligatoria** si `creditoUso = unico` **y** `creditoRemanenteUnico = perder`. |

Reglas de la pantalla:

- Mostrá `creditoRemanenteUnico` solo cuando `creditoUso === 'unico'`.
- Si el usuario elige `unico` + `perder` y `saldoVencidoCuenta` está vacío, **marcá el campo como
  requerido antes de enviar**. Si igual llega, el backend responde `400` con el mensaje
  «Con uso único y remanente "perder" debe indicar la cuenta de saldos vencidos…»: mostralo.
- `saldoVencidoCuenta` debe ser una cuenta de **ingreso**, hoja, activa y de la compañía. El
  backend lo valida (`400` con mensaje legible). Para el selector usá el endpoint de opciones de
  cuentas que ya use el selector de «cuenta de diferencias» de delivery, filtrando por ingresos; si
  no hay uno apropiado, dejalo como input de texto con búsqueda y anotá el faltante.
- Mandá en el `PUT` **solo los campos que cambiaron** (el endpoint es parcial). Para quitar la
  cuenta mandá `saldoVencidoCuenta: null`.
- Mostrá una advertencia al activar `perder`: «Lo que no se use se registrará como ingreso. Consulte
  con su contador el tratamiento fiscal.»

**Lectura para formularios (todos los usuarios).** `GET /opciones/config/facturacion` (recurso
`lookup.config-facturacion`) y `GET /me/bootstrap` (clave de config de facturación) ahora incluyen
`creditoVigenciaDias`, `creditoUso`, `creditoRemanenteUnico` y `saldoFavorVigenciaDias`. **No**
incluyen `saldoVencidoCuenta`. Usalos para textos informativos (por ejemplo «esta nota es de uso
único»), nunca para decidir si algo se puede aplicar: eso lo dice `puedeAplicar`.

---

## 3. Estados y campos nuevos de notas de crédito y saldos a favor

### 3.1 Los campos

Cada nota de crédito (listado `GET /credit-notes`, detalle `GET /credit-notes/:id`, y cada fila de
`GET /credit-notes/saldo-favor/:customerId`) y cada saldo a favor tipo pago
(`GET /cobros/saldo-favor/:customerId` → `entries[]`) traen:

| Campo | Tipo | Significado |
|---|---|---|
| `venceEl` | `string \| null` | `YYYY-MM-DD`. `null` = no vence. |
| `diasRestantes` | `number \| null` | Días hasta `venceEl` (0 = vence hoy; **negativo = ya venció**). `null` si no vence. |
| `estado` | enum | `vigente` · `por_vencer` · `vencido` · `perdido` · `agotado` (§3.2). |
| `puedeAplicar` | `boolean` | `true` solo si `estado` es `vigente` o `por_vencer`. **Usalo para habilitar «Aplicar» y para el selector de saldos.** |
| `uso` | `'multiple' \| 'unico'` | **Solo notas de crédito.** Política de uso de ESA nota. |
| `remanente` | `'saldo_favor' \| 'perder' \| null` | **Solo notas.** Qué pasa con el sobrante (solo si `uso = unico`). |
| `origenSaldoFavor` | `boolean` | **Solo notas.** `true` = el sobrante de una nota de uso único ya **pasó a saldo a favor** (ahora se comporta como saldo a favor de uso múltiple). |

Los campos preexistentes no cambian (`availableAmount`, `appliedAmount`, `status`, etc.).

> **Un tenant sin configuración, o una nota anterior a esta función:** `venceEl = null`,
> `diasRestantes = null`, `uso = 'multiple'`, `estado = 'vigente'` (o `agotado` si no tiene saldo).
> Tu UI no debe romperse ni mostrar «Vence: null».

### 3.2 Los estados

| `estado` | Cuándo | `puedeAplicar` | Badge sugerido | Texto |
|---|---|---|---|---|
| `vigente` | Con saldo; sin vencimiento o faltan más de 7 días | ✅ | verde | «Vigente» |
| `por_vencer` | Con saldo y faltan **7 días o menos** (incluye hoy) | ✅ | ámbar | «Vence en N días» / «Vence hoy» |
| `vencido` | Con saldo y `hoy > venceEl` | ❌ | rojo | «Vencida el DD/MM/AAAA» |
| `perdido` | Se dio de baja contablemente | ❌ | gris oscuro | «Dada de baja» |
| `agotado` | Sin saldo (usada por completo o reembolsada) | ❌ | gris | «Agotada» |

Reglas:

- **El estado lo calcula el backend con la zona horaria del site** (America/Santo_Domingo). No lo
  recalcules con `new Date()` del navegador: te va a diferir cerca de la medianoche. Mostrá
  `diasRestantes` tal como llega.
- Una nota con `status = 'fully_used'` (campo previo) llegará con `estado = 'agotado'`. Podés seguir
  usando `status` donde ya lo usabas; `estado` es el nuevo y es el que manda para vencimientos.
- En `por_vencer` y `vencido` mostrá la fecha formateada `DD/MM/AAAA`.

### 3.3 Totales

`GET /cobros/saldo-favor/:customerId` y `GET /credit-notes/saldo-favor/:customerId` devuelven:

```jsonc
{
  "success": true,
  "data": {
    "customer": "CUST-0001",
    "balance": 1500.00,        // SOLO lo aplicable hoy (vigente + por_vencer)
    "vencidoAmount": 300.00,   // NUEVO: lo bloqueado por vencimiento
    "entries": [ /* ... con los campos de §3.1 ... */ ]
  }
}
```

- Donde ya mostrabas «Saldo a favor: X» mostrá `balance` (ahora es el aplicable).
- Si `vencidoAmount > 0` mostrá debajo una línea ámbar/roja: «RD$ 300.00 vencido — reactivar» que
  lleve al detalle de esas filas.
- **Los dos listados siguen separados** (notas y pagos). Si hoy los sumás en un total de «saldo a
  favor del cliente», sumá `balance` de cada uno y `vencidoAmount` de cada uno.

---

## 4. Dónde se ve y qué cambia en cada pantalla

### 4.1 Listado y detalle de notas de crédito
- Columna/etiqueta **Estado** con el badge de §3.2. Columna **Vence** (`venceEl`, vacío = «—»).
- En el detalle: bloque «Vigencia y uso» con: vence el / días restantes, uso («Uso único» /
  «Varias facturas»), y si `uso = unico`: «Si sobra saldo: pasa a saldo a favor / se pierde» (según
  `remanente`). Si `origenSaldoFavor`: «El sobrante de esta nota pasó a saldo a favor».
- Botones de acción (§5) según estado y permisos.
- **Filtro** por estado en el listado: hoy `GET /credit-notes` **no** tiene un query param de estado.
  Filtrá en cliente sobre la página cargada y dejá anotado que un filtro de servidor sería una mejora.

### 4.2 Saldos a favor del cliente (pantalla del cliente, cobros, formulario de factura)
- Cada fila con su badge, `venceEl` y, si `estado` es `por_vencer`, «Vence en N días».
- **Las filas con `puedeAplicar = false` se muestran pero deshabilitadas** (no se pueden marcar para
  aplicar) con tooltip: «Vencida el DD/MM/AAAA. Reactive para poder usarla.» y, si el usuario puede,
  el botón «Reactivar» (§5.1).

### 4.3 Aplicar saldo / nota de crédito a una factura
Aplica a `POST /invoices/:id/aplicar-saldo-favor` (saldos tipo pago) y
`POST /credit-notes/:id/aplicar-a-factura` (notas).

- El **selector** de qué saldo aplicar lista solo (o habilita solo) las filas con `puedeAplicar`.
- **Aun así manejá los `409`** (§8): entre que se cargó la lista y se aplicó puede haber vencido, o
  alguien más puede haber usado una nota de uso único.
- **Nota de uso único (`uso = 'unico'` y `origenSaldoFavor = false`)**: antes de confirmar, si el
  monto a aplicar es **menor** a `availableAmount`, mostrá un aviso de confirmación:
  - `remanente = 'saldo_favor'`: «Esta nota es de **uso único**. Los RD$ X que no se usen pasarán a
    **saldo a favor** del cliente.»
  - `remanente = 'perder'`: «Esta nota es de **uso único**. Los RD$ X que no se usen **se perderán**.»
  Si el monto es igual al disponible, no hace falta aviso. **No bloquees** la aplicación parcial: el
  backend la permite y resuelve el sobrante.
- En una factura **Draft**, la aplicación de una nota es solo un enlace que se puede deshacer
  (`DELETE /credit-notes/:id/aplicar-a-factura/:invoiceId`). **El sobrante de una nota de uso único
  se resuelve cuando la factura se SOMETE**, no al enlazar. Tras someter la factura, **volvé a
  consultar la nota** (`GET /credit-notes/:id`): puede haber cambiado a `origenSaldoFavor = true`
  con un `venceEl` nuevo, o a `estado = 'perdido'`.
- **Someter una factura** que tiene enlazada una nota/saldo que venció mientras estaba en borrador
  falla con un error cuyo `message` dice qué crédito es (puede llegar sin un `code` conocido, porque lo origina ERPNext). Mostrá el mensaje y ofrecé quitar ese enlace.

### 4.4 Reembolso de una nota de crédito
`POST /credit-notes/:id/refund` también responde `409 CREDITO_VENCIDO` si la nota venció. Mostrá el
mensaje y, si el usuario puede, ofrecé reactivarla primero.

### 4.5 Impresión
El PDF de la nota de crédito (misma ruta de siempre) ahora muestra, bajo el NCF, **«Válida hasta
DD/MM/AAAA»** (si tiene vencimiento) y **«Uso único»** (si aplica). No tenés que hacer nada, salvo
no reimplementar ese PDF en el cliente.

---

## 5. Las tres acciones: reactivar, cambiar vencimiento, dar de baja

Hay **dos familias de rutas** (notas de crédito y saldos a favor tipo pago) con el **mismo cuerpo**:

| Acción | Nota de crédito | Saldo a favor (pago) |
|---|---|---|
| Reactivar | `POST /credit-notes/:id/reactivar` | `POST /cobros/saldo-favor/:paymentEntryId/reactivar` |
| Cambiar vencimiento | `PATCH /credit-notes/:id/vencimiento` | `PATCH /cobros/saldo-favor/:paymentEntryId/vencimiento` |
| Dar de baja | `POST /credit-notes/:id/dar-de-baja` | `POST /cobros/saldo-favor/:paymentEntryId/dar-de-baja` |

Todas devuelven:

```jsonc
{
  "success": true,
  "data": {
    "id": "ACC-SINV-2026-00070",
    "tipo": "nota",            // "nota" | "saldo"
    "estado": "vigente",       // estado resultante (§3.2)
    "venceEl": "2026-12-31",   // null = sin vencimiento
    "asientoRevertido": null,  // JE de baja cancelado al reactivar (si lo hubo)
    "asiento": null,           // JE creado al dar de baja
    "autorizadoPor": "gerente@empresa.com",
    "autorizadoConCodigo": false,   // true = se autorizó con el código de otro usuario
    "sinCambios": false        // true = ya estaba vigente (reintento idempotente)
  }
}
```

**Idempotentes:** repetir una acción ya aplicada responde `200` con `sinCambios: true`.

### 5.1 Reactivar — `…/reactivar`
Pasa un crédito `vencido` o `perdido` a `vigente` con un vencimiento nuevo.

Body:
```jsonc
{
  "venceEl": "2026-12-31",   // opcional. YYYY-MM-DD, hoy o futuro
  "dias": 30,                // opcional. Alternativa a venceEl: hoy + N días (1–3650)
  "motivo": "Cliente reclamó dentro de la política", // OBLIGATORIO, 5–500 caracteres
  "pinOverride": { ... }     // solo si el usuario no tiene el permiso (§6)
}
```
- Si no mandás `venceEl` ni `dias`, el backend usa la **vigencia configurada** (la de notas, o la de
  saldos si es un saldo o una nota cuyo sobrante ya pasó a saldo). Con vigencia `0` queda **sin
  vencimiento**. En el modal ofrecé dos opciones: «Usar la vigencia configurada» (no mandar fecha ni
  días) y «Elegir fecha» (`venceEl`). No ofrezcas «Sin vencimiento» al reactivar: ver §11.
- `venceEl` en el pasado → `400`.
- Reactivar algo `perdido` (con baja contabilizada) **cancela el asiento de baja** y devuelve el
  saldo (`asientoRevertido`). Avisá en el modal: «Se revertirá el asiento de baja».
- Reactivar un crédito `agotado` → error (no hay saldo). Ocultá el botón en ese estado.
- Reactivar uno ya `vigente`/`por_vencer` → `200` con `sinCambios: true`.

### 5.2 Cambiar vencimiento — `…/vencimiento` (método `PATCH`)
Cambia (acorta o extiende) la fecha de un crédito **vigente** o quita el vencimiento.

Body:
```jsonc
{
  "venceEl": "2026-12-31",   // OBLIGATORIO. null = quitar el vencimiento. NO omitir la clave
  "motivo": "Acuerdo comercial con el cliente",   // OBLIGATORIO
  "pinOverride": { ... }
}
```
- Un crédito `vencido` o `perdido` **no** se cambia por acá: se reactiva (§5.1). El backend responde
  error si lo intentás. Mostrá este botón solo en `vigente` / `por_vencer`.
- `venceEl` debe ser hoy o futuro.

### 5.3 Dar de baja — `…/dar-de-baja`
Registra la pérdida del saldo de un crédito **vencido**: el backend crea un asiento (Débito a la
cuenta por cobrar del cliente / Crédito a la «Cuenta de saldos vencidos» configurada, con la sucursal
del documento).

Body:
```jsonc
{ "motivo": "Saldo vencido sin reclamo del cliente", "pinOverride": { ... } }
```
- Solo se permite si `estado = 'vencido'`. Mostrá el botón únicamente ahí.
- Si el tenant no configuró la cuenta de saldos vencidos, responde error con el mensaje
  «Configure la "Cuenta de Saldos Vencidos" en Facturación…»: mostralo **tal cual** y enlazá a la
  pantalla de configuración (§2).
- Es una acción destructiva a nivel contable: pedí **confirmación explícita** con el monto: «¿Dar de
  baja RD$ 3,776.00? Se registrará un asiento contable. Se puede revertir reactivando.»
- **Después de dar de baja**, el crédito pasa a `estado = 'perdido'` y no aparece en `balance` ni en
  `vencidoAmount`.

### 5.4 Visibilidad de los botones (permisos)
Tres acciones nuevas en el catálogo de permisos (pantalla «Notas de Crédito», mismas para notas y
saldos):

| Acción (clave) | Botón | Se muestra en estados |
|---|---|---|
| `ventas.nota-credito.reactivar` | Reactivar | `vencido`, `perdido` |
| `ventas.nota-credito.cambiar-vencimiento` | Cambiar vencimiento | `vigente`, `por_vencer` |
| `ventas.nota-credito.dar-de-baja` | Dar de baja | `vencido` |

- **Regla importante:** el botón se muestra **aunque el usuario NO tenga el permiso** (siempre que
  el estado lo permita). Sin permiso, al pulsarlo el flujo pide el **código de otro usuario**
  (§6). Esto es lo que pidió el negocio: un cajero puede reactivar si un supervisor le da su código.
  Si preferís ocultarlo para no confundir, anotalo como decisión de producto; por defecto **mostralo**.
- Para saber si el usuario tiene el permiso (y así decidir si abrir directamente el modal de código
  sin hacer una petición que fallará), leé `GET /me/acceso` (v2) o `GET /me/permissions` (sistema
  actual), como ya hacés con el resto de acciones. **No es obligatorio**: alternativa más simple es
  enviar la petición sin código y reaccionar al `403` de §6.
- Los permisos también pueden venir restringidos por **features** del tenant: las rutas de notas
  requieren la funcionalidad de notas de crédito y las de saldos la de cuentas por cobrar; si el
  módulo no está contratado ya recibís el `403 FEATURE_NO_CONTRATADO` que manejás hoy.

---

## 6. Autorización con el código de otro usuario (el flujo que más cuidado pide)

### 6.1 Cómo funciona
Las tres acciones usan el mismo mecanismo:

```
petición sin pinOverride ──► ¿el usuario tiene el permiso?
   ├─ sí ──► se ejecuta (autorizadoPor = el propio usuario)
   └─ no ──► 403 { error.code: "PERMISO_REQUERIDO", error.details.admiteAutorizacionPin: true }
                │
        tu UI abre el MODAL DE CÓDIGO
                │
        el usuario autorizador ingresa PIN + (usuario | código de tarjeta)
                │
        REENVÍAS LA MISMA PETICIÓN, con el mismo body + { pinOverride }
                ├─ ok ──► se ejecuta (autorizadoPor = el dueño del código, autorizadoConCodigo = true)
                └─ 401 { error.code: "AUTORIZACION_INVALIDA" } ──► código inválido/sin permiso: el modal
                                                                  muestra el error y deja reintentar
```

El `403` de falta de permiso llega con la forma habitual del BFF:
```jsonc
{
  "success": false,
  "error": {
    "code": "PERMISO_REQUERIDO",
    "message": "No tiene permiso para \"Reactivar crédito vencido\" en Notas de Crédito. Puede autorizarla con el código de un usuario que sí lo tenga.",
    "statusCode": 403,
    "details": { "acciones": ["ventas.nota-credito.reactivar"], "admiteAutorizacionPin": true }
  }
}
```

### 6.2 Qué construir
1. Un **hook/helper reutilizable** `useAccionConAutorizacion` (nombre libre) que envuelve estas tres
   llamadas: hace la petición; si responde `403` con `error.code === 'PERMISO_REQUERIDO'` **y**
   `error.details.admiteAutorizacionPin === true`, abre el modal; al confirmar reenvía la petición
   original con `pinOverride`.
2. **Reutilizá el modal de PIN que ya existe** (el de «override de descuento» / «vender bajo costo»).
   Mismo componente, mismos campos: PIN de 6 dígitos y **o** usuario (email) **o** código de tarjeta
   (escaneo/QR). Solo cambia el título: «Autorización requerida — Reactivar crédito».
3. El body de `pinOverride`:
   ```jsonc
   { "pin": "482913", "usuario": "supervisor@empresa.com" }
   // o, con carnet/QR:
   { "pin": "482913", "codigoTarjeta": "EMP-00231" }
   ```
   Se manda **o** `usuario` **o** `codigoTarjeta` (uno de los dos es obligatorio).
4. **Seguridad del PIN en el cliente:** no lo guardes en estado global, `localStorage`, logs ni en el
   historial de la petición; límpialo al cerrar el modal; el input es tipo password. **No** lo
   reutilices para una segunda acción: cada acción pide su código.
5. **No verifiques el código por tu cuenta** ni llames a `POST /auth/verify-admin-pin` antes: el
   backend lo verifica dentro de la misma petición (y deja la auditoría). Un `POST` previo solo
   duplicaría intentos en la bitácora.

### 6.3 Errores del flujo de código
| Código | HTTP | Cuándo | Qué mostrar |
|---|---|---|---|
| `PERMISO_REQUERIDO` | 403 | Sin permiso y sin `pinOverride` | Abrir el modal de código |
| `AUTORIZACION_INVALIDA` | 401 | PIN incorrecto, usuario no existe, **el dueño del código no tiene permiso**, o **es el mismo usuario que pide** | «Código inválido o sin permiso para autorizar esta acción.» (mensaje genérico a propósito: no reveles cuál fue la causa). Dejá reintentar. |
| `PERMISO_INSUFICIENTE` | 403 | La ruta o acción no admite código (no debería pasar en estas 6 rutas) | Mensaje del backend |

**Importante:** el usuario autorizador **debe ser distinto** del que pide. Si alguien sin permiso
ingresa su **propio** código, el backend responde `401`. En el modal avisá desde el principio: «Pida
a un supervisor que ingrese su código.»

### 6.4 Qué ve el usuario después
La respuesta trae `autorizadoPor` y `autorizadoConCodigo`. Mostrá un toast de éxito y, si
`autorizadoConCodigo`, agregá «Autorizado por {autorizadoPor}». En el historial del documento
(comentarios de ERPNext) queda quién pidió, quién autorizó, el motivo y las fechas: no necesitás
implementar esa bitácora.

---

## 7. Reglas de negocio que tu UI debe respetar (sin reimplementarlas)

1. **El backend decide, la UI informa.** Nunca bloquees una acción solo por tu propio cálculo de
   fechas. Usá `puedeAplicar`/`estado` y, ante la duda, dejá que el backend responda y mostrá su
   mensaje.
2. **Uso único**: una vez aplicada la nota (factura sometida), **no se puede aplicar de nuevo** —
   `409 CREDITO_USO_UNICO_CONSUMIDO`. Excepción: si el sobrante **pasó a saldo a favor**
   (`origenSaldoFavor = true`), se comporta como saldo de uso múltiple y **sí** se puede seguir usando.
3. **Vencimiento al someter**: una nota/saldo vinculado a una factura en borrador y vencido antes de
   someter bloquea el submit.
4. **Aseguradoras (vertical farmacia)**: las notas y saldos de un cliente aseguradora **nunca
   vencen** aunque el tenant lo configure. No hagas nada especial: llegan con `venceEl = null`.
5. **Fechas**: `venceEl` es una fecha de calendario (`YYYY-MM-DD`) sin hora ni zona. Formatearla
   `DD/MM/AAAA` sin pasarla por `new Date()` (el desfase de zona horaria cambia el día). Usá un
   parser de fecha ISO que no convierta a UTC.
6. **Reembolso y vencimiento**: una nota vencida no se reembolsa; hay que reactivarla primero.
7. **Cambiar la configuración no es retroactivo**: las notas ya emitidas conservan la vigencia y la
   política (uso/remanente) con que se emitieron. Por eso el detalle muestra el `uso` y el
   `remanente` **de esa nota**, no los de la configuración actual.
8. **Saldos que ya existían** antes de que el tenant activara la vigencia no vencen. No hay
   migración que mostrar.

---

## 8. Tabla de errores nuevos

Todos con el formato `{ success:false, error:{ code, message, statusCode, details? } }`. Mostrá
`error.message` (ya viene en español); usá `error.code` para la lógica.

| `error.code` | HTTP | Dónde puede salir | `details` | Acción de UI |
|---|---|---|---|---|
| `CREDITO_VENCIDO` | 409 | Aplicar o reembolsar una nota vencida | `{ creditNoteId, venceEl }` | Mensaje + ofrecer «Reactivar» |
| `SALDO_FAVOR_VENCIDO` | 409 | Aplicar un saldo (pago) vencido | `{ paymentEntryId, venceEl }` | Mensaje + ofrecer «Reactivar» |
| `CREDITO_USO_UNICO_CONSUMIDO` | 409 | Aplicar otra vez una nota de uso único | `{ creditNoteId }` | Mensaje; refrescar la nota |
| `CREDITO_DADO_DE_BAJA` | 409 | Aplicar/usar algo dado de baja | `{ id }` | Mensaje + ofrecer «Reactivar» (revierte la baja) |
| `PERMISO_REQUERIDO` | 403 | Las 6 rutas de §5 sin permiso | `{ acciones, admiteAutorizacionPin: true }` | Abrir modal de código (§6) |
| `AUTORIZACION_INVALIDA` | 401 | Código inválido (§6.3) | — | Error en el modal, reintentar |
| *(400 sin código)* | 400 | `venceEl` en el pasado, `motivo` corto, falta la cuenta de saldos vencidos, etc. | — | Mostrar `message` |

Además siguen valiendo los de siempre (`FEATURE_NO_CONTRATADO`, `PERMISO_INSUFICIENTE`,
`FILTRO_NO_PERMITIDO`, validaciones de DTO).

Un `409` al aplicar puede venir **sin** `code` conocido cuando lo originó ERPNext directamente (por
ejemplo un hook interno): mostrá `message` igualmente.

---

## 9. Qué NO hacer

- ❌ No calcules vencimientos, estados ni «días restantes» en el cliente.
- ❌ No guardes ni registres el PIN. No lo mandes a ningún otro endpoint.
- ❌ No llames a `POST /auth/verify-admin-pin` para estas acciones.
- ❌ No ocultes silenciosamente créditos vencidos: mostralos deshabilitados con su motivo.
- ❌ No sumes `balance` y `vencidoAmount` como si fueran disponibles.
- ❌ No asumas que `venceEl` existe: en tenants sin configurar es `null` y la pantalla debe verse
  exactamente como antes.
- ❌ No bloquees la aplicación **parcial** de una nota de uso único (el backend la permite y resuelve
  el sobrante).
- ❌ No expongas `saldoVencidoCuenta` fuera de la pantalla de configuración.
- ❌ No inventes un endpoint de «estado» ni de «filtro por vencimiento»: no existen (§11).

---

## 10. Criterios de aceptación y casos de prueba

Probalos contra un backend real o con respuestas simuladas fieles a §3 y §8.

**Configuración**
1. Guardar `creditoVigenciaDias = 30` y recargar → persiste. `0` = «No vencen».
2. Elegir `unico` + `perder` sin cuenta → el formulario no deja guardar (o muestra el `400`).
3. Elegir `multiple` → el selector de remanente desaparece.
4. Un usuario sin `config.facturacion.editar` ve la sección en solo lectura (o no la ve, según tu
   patrón actual).

**Listados y detalle**
5. Tenant sin configurar: las pantallas se ven **idénticas a antes** (sin columna «Vence» llena, sin
   badges de alerta).
6. Nota vigente con `diasRestantes = 40` → badge verde «Vigente», «Vence el DD/MM/AAAA».
7. `diasRestantes = 3` → ámbar «Vence en 3 días». `0` → «Vence hoy». `-2` → rojo «Vencida el …».
8. `balance` excluye lo vencido; `vencidoAmount` lo muestra aparte.

**Aplicar**
9. Una nota vencida aparece deshabilitada en el selector; si se fuerza, el `409 CREDITO_VENCIDO` se
   muestra y se ofrece reactivar.
10. Nota de uso único, aplicar por menos del total → aviso de sobrante (según `remanente`) →
    tras someter la factura, la nota se refresca y muestra `origenSaldoFavor` o `perdido`.
11. Nota de uso único ya aplicada → `409 CREDITO_USO_UNICO_CONSUMIDO`.

**Reactivar / cambiar / baja**
12. Usuario **con** permiso: reactivar con «hoy + vigencia configurada» → éxito directo, `autorizadoConCodigo = false`.
13. Usuario **sin** permiso: la petición devuelve `PERMISO_REQUERIDO` → se abre el modal → con código
    de un supervisor → éxito, toast «Autorizado por …», `autorizadoConCodigo = true`.
14. Código incorrecto → `AUTORIZACION_INVALIDA` en el modal; reintentar funciona.
15. El usuario ingresa **su propio** código → `AUTORIZACION_INVALIDA`.
16. Reactivar con `venceEl` pasado → `400` mostrado.
17. Dar de baja sin cuenta configurada → el mensaje del backend + enlace a Configuración.
18. Dar de baja → el crédito pasa a «Dada de baja» y sale de ambos totales. Reactivarlo lo devuelve
    (el modal avisa que se revierte el asiento).
19. Repetir la misma acción → `sinCambios: true` y toast neutro («Ya estaba vigente»).

**Impresión**
20. El PDF de una nota con vencimiento muestra «Válida hasta»; de uso único, «Uso único».

**Regresión**
21. Flujos existentes sin vencimiento (devolución, reembolso, aplicar nota a factura, aplicar
    anticipo) funcionan igual que antes.

---

## 11. Límites conocidos (anotalos en tu resumen si te topás con ellos)

- **Sin filtro de servidor por estado/vencimiento** en `GET /credit-notes` ni en los listados de
  saldo: filtrá en cliente. Sería una mejora de backend.
- **Los saldos a favor de notas y de pagos son dos listados distintos**; no hay un endpoint unificado.
- **Baja de saldos de pagos anticipados (Payment Entry)**: la verificación en vivo contra ERPNext
  está pendiente. La baja de una **nota de crédito** y todo lo demás no dependen de eso. Si
  `POST /cobros/saldo-favor/:id/dar-de-baja` falla en pruebas, avisá con el mensaje exacto.
- **Un anticipo liberado** al cancelar la factura a la que estaba asignado puede quedar sin
  vencimiento aunque el tenant tenga vigencia configurada.
- **Saldos a favor de proveedores (cuentas por pagar)**: fuera de esta entrega. No les agregues UI.
- **«Sin vencimiento» al reactivar** cuando el tenant tiene vigencia configurada requiere reactivar y
  luego `PATCH …/vencimiento` con `venceEl: null` (dos pasos).
- El **estado `por_vencer`** usa una ventana fija de 7 días (no configurable aún).

---

## 12. Resumen final que debés entregar

Al terminar, respondé con:
1. Archivos creados/modificados y por pantalla qué cambió.
2. Cómo resolviste el modal de código (qué componente reutilizaste).
3. Qué casos de §10 probaste y cuáles no pudiste (y por qué).
4. Contradicciones entre este documento y el `openapi.json`.
5. Cualquier límite de §11 con el que te topaste y lo que ves en la respuesta real.
