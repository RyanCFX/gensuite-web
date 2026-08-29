# Facturación Electrónica (e-CF) — Frontend implementado

> Documento de referencia para el equipo. Resume **todo lo construido en el frontend** para
> Facturación Electrónica de la DGII (República Dominicana), a lo largo de los prompts de backend
> **#48, #49, #50, F8 y F9**. Los shapes exactos de la API están en `openapi.json` (tags
> *"Facturación Electrónica (e-CF)"*, *"… — Administración"* y *"… — Recepción"*).

---

## 1. Estado general

| Aspecto | Estado |
|---|---|
| Configuración general de e-CF | ✅ Implementado |
| Panel de administración / provisioning (wizard) | ✅ Implementado |
| Secuencias e-NCF (rangos) | ✅ Implementado |
| Notas de Crédito/Débito electrónicas (campos DGII) | ✅ Implementado |
| Resultado del e-CF al someter factura | ✅ Implementado |
| Anulación de factura con e-CF aceptado → Nota de Crédito | ✅ Implementado |
| Descarga de PDF/A (archivo fiscal) | ✅ Implementado |
| Anulación de rangos e-NCF sin usar | ✅ Implementado |
| e-CF propio en Compras/Gastos (autogenerado al someter) — F8 | ✅ Implementado |
| Bandeja de e-CF recibidos de terceros + conciliación + ACECF — F8 | ✅ Implementado |
| Progreso de certificación DGII (solo lectura) — F9 | ✅ Implementado |
| Panel de contingencia (Decreto 587-24): diferidos, reenvío, activar/desactivar — F9 | ✅ Implementado |
| **Pruebas de integración end-to-end** | ❌ **Pendientes** |

> ⚠️ **Ningún tenant real tiene todavía una cuenta de Aura conectada ni un certificado `.p12`
> cargado.** Todo lo anterior está construido contra la API y verificado por compilación /
> inspección, pero **no se ha probado el flujo completo de emisión real contra la DGII**. Crear
> el *Project* en el panel de Aura y obtener el certificado firmado son pasos manuales fuera del
> sistema.

### Migración gradual, no big-bang

El e-CF se activa **por tipo de comprobante** y **por tenant**:

- `EcfConfig.habilitado` es el interruptor maestro del tenant.
- `EcfConfig.tiposElectronicos` (array de `typeId`) define qué tipos se emiten electrónicamente.
- Un tipo **no listado** sigue emitiéndose como NCF físico aunque `habilitado` esté activo.
- Con `habilitado = false`, todo el sistema factura exactamente igual que hoy (NCF físico), sin
  llamar a Aura.

---

## 2. Mapa de fases

| Prompt | Qué aportó | Superficie de frontend |
|---|---|---|
| **#48** | Cimientos: `GET/PUT /config/ecf`, selector de código DGII en Unidades de Medida | `EcfConfigSection` en `ConfigPage`, `ECF_TIPOS` / `DGII_UOM_CODES` en `src/lib/dgii.ts` |
| **#49** | Provisioning (conectar Aura), emisión real de e-CF al someter, secuencias e-NCF | Wizard `/config/ecf/admin`, tab e-NCF en `/config/ncf`, bloque `ecf` en el detalle de factura |
| **#50** | Notas C/D electrónicas, cambio de UX en anulación, PDF/A, anular rangos | Selectores en Notas C/D, flujo de anulación → Nota de Crédito, botón PDF/A, acción "Anular rango" |
| **F8** | e-CF propio en Compras/Gastos, bandeja de e-CF recibidos de terceros + conciliación + ACECF | `<EcfStatusCard>` compartido, módulo `/ecf-recibidos` (bandeja + detalle + carga manual) |
| **F9** | Certificación DGII (solo lectura), contingencia (Decreto 587-24), errores `400`/`503` nuevos | Pantallas `/config/ecf/certificacion` y `/config/ecf/contingencia`, alerta en `/config/ecf`, rama `503` en submits |

---

## 3. Archivos nuevos

| Archivo | Propósito |
|---|---|
| `src/shared/api/ecf.ts` | Cliente HTTP de todos los endpoints e-CF (secuencias, tipos, admin/provisioning, anular rangos) |
| `src/lib/dgii.ts` | Catálogos estáticos DGII: tipos e-CF, unidades de medida, ambientes, códigos de modificación + helpers |
| `src/features/config/EcfAdminPage.tsx` | Wizard de 4 pasos para conectar el tenant a Aura (`/config/ecf/admin`) |
| `src/features/config/EcfSequencesPanel.tsx` | CRUD + anulación de rangos e-NCF (tab dentro de `/config/ncf`) |
| `src/components/shared/EcfStatusCard.tsx` | Bloque de estado e-CF reutilizable (factura, compra, gasto) |
| `src/shared/api/ecf-recibidos.ts` | Cliente HTTP de la recepción de e-CF (`/ecf/recibidos*`) |
| `src/features/ecf-recibidos/EcfRecibidosPage.tsx` | Bandeja de e-CF recibidos (`/ecf-recibidos`) |
| `src/features/ecf-recibidos/EcfRecibidoDetail.tsx` | Detalle: líneas, conciliación, ACECF (`/ecf-recibidos/:voucherId`) |
| `src/features/ecf-recibidos/CargarXmlModal.tsx` | Carga manual del XML (flujo de excepción) |

---

## 4. Capa de API

### 4.1 Endpoints (`src/shared/api/endpoints.ts`)

```
invoices.ecfPdfa(id)                     GET  /invoices/:id/ecf/pdfa
config.ecf                               GET/PUT /config/ecf
config.ecfTipos                          GET  /config/ecf/tipos
config.ecfSecuencias                     GET/POST /config/ecf/secuencias        (?company= obligatorio)
config.ecfSecuenciasById(id)             PATCH/DELETE /config/ecf/secuencias/:id (?company=)
config.ecfSecuenciasAnularRangos         POST /config/ecf/secuencias/anular-rangos (?company=)
config.ecfAdminConnect                   POST /config/ecf/admin/connect
config.ecfAdminClients                   POST /config/ecf/admin/clients
config.ecfAdminCertificate               POST /config/ecf/admin/certificate     (?company=)
config.ecfAdminWebhook                   POST /config/ecf/admin/webhook
```

### 4.2 Funciones (`src/shared/api/ecf.ts`)

| Función | Endpoint |
|---|---|
| `listEcfSequences(company)` | `GET /config/ecf/secuencias` |
| `createEcfSequence(company, dto)` | `POST /config/ecf/secuencias` |
| `updateEcfSequence(company, id, dto)` | `PATCH /config/ecf/secuencias/:id` (solo extiende `stopOn`/`expireAt`) |
| `deleteEcfSequence(company, id)` | `DELETE /config/ecf/secuencias/:id` (solo si nunca emitió) |
| `voidEcfRanges(company, dto)` | `POST /config/ecf/secuencias/anular-rangos` |
| `getEcfTipos()` | `GET /config/ecf/tipos` — catálogo unificado NCF físico + e-CF |
| `connectEcfApiKey(dto)` | `POST /config/ecf/admin/connect` |
| `createEcfClient(dto)` | `POST /config/ecf/admin/clients` |
| `uploadEcfCertificate(dto, company?)` | `POST /config/ecf/admin/certificate` |
| `registerEcfWebhook(dto)` | `POST /config/ecf/admin/webhook` |

`getEcfConfig()` / `updateEcfConfig()` viven en `src/shared/api/config.ts` (ya existían desde #48).
El PDF/A se descarga con `downloadInvoiceEcfPdfa(id)` en `src/shared/api/invoices.ts`.

### 4.3 Tipos relevantes (`src/shared/api/types.ts`)

- `EcfConfig` / `UpdateEcfConfigDto` / `EcfProvisioning` / `EcfProvisioningCliente`
- `EcfSequence`, `CreateEcfSequenceDto`, `UpdateEcfSequenceDto`, `EcfEnv` (`TesteCF | CerteCF | eCF`)
- `EcfTipoCatalogo` (`{ ncfType, typeId, electronico }`)
- `EcfMode` (`test | live`), `EcfConnectApiKeyDto`, `CreateEcfClientDto`, `EcfClient`,
  `UploadEcfCertificateDto`, `RegisterEcfWebhookDto` (+ sus `*Result`)
- `EcfSubmitResult` (`{ voucherId, status, qrUrl?, securityCode?, deferred?, message? }`) — llega
  tanto en `POST /invoices/:id/submit` como en `GET /invoices/:id` (`data.ecf`).
- `EcfModificationCode` = `1 | 2 | 3 | 4 | 5`
- `EcfVoidRangeDto` (`{ typeId, from, to }`), `VoidEcfRangesDto` (`{ ranges[], reason? }`)
- `Invoice.ecf?: EcfSubmitResult` (opcional — **ausente** en el 100 % de las facturas físicas)
- `CreateCreditNoteDto.modificationCode?`, `CreateDebitNoteDto.modificationCode?` +
  `CreateDebitNoteDto.referenceInvoice?`

### 4.4 Catálogos (`src/lib/dgii.ts`)

| Export | Contenido |
|---|---|
| `ECF_TIPOS` | Los 10 tipos e-CF (`31`–`47`) con label y descripción en español |
| `ecfTipoLabel(typeId)` | `"31"` → `"31 — Crédito Fiscal"` |
| `ECF_ENV_LABELS` | `TesteCF` → *"Pruebas (TesteCF)"*, etc. |
| `ECF_MODIFICATION_CODES` | Códigos de modificación DGII (Tabla VI) con copy en español y flag `comun` |
| `ecfModificationCodeLabel(code)` | número → texto en español |
| `ecfTipoElectronicoHabilitado(tipos, typeId)` | `boolean` — ¿el tenant emite ese tipo como e-CF? (usa `getEcfTipos()`) |
| `DGII_UOM_CODES` / `dgiiUomLabel` | Las 62 unidades de medida DGII (selector en Unidades de Medida) |
| `TIPO_PAGO_DEFAULT_OPTIONS` / `TIPO_INGRESOS_DEFAULT_OPTIONS` | Defaults fiscales de la config general |

Nunca se muestra un código DGII crudo (`1`, `34`, `TesteCF`…) sin su significado en español al lado.

---

## 5. Navegación

Dentro de **Configuración** hay un grupo padre **"Facturación Electrónica"**:

```
Configuración
└── Facturación Electrónica
    ├── Administración      → /config/ecf                   (config general — todos los roles)
    ├── Avanzado            → /config/ecf/admin             (wizard de provisioning — solo System Manager)
    ├── Certificación DGII  → /config/ecf/certificacion     (progreso solo lectura — solo System Manager)
    └── Contingencia        → /config/ecf/contingencia      (Decreto 587-24 — solo System Manager)
```

- Los 3 hijos técnicos están en `ADMIN_ONLY_PATHS`: el filtro de nav (`stripAdminOnlyEntry` en
  `AppLayout.tsx`, recursivo) los oculta para quien no tenga el rol **System Manager**; cada
  pantalla además muestra un empty-state si se entra por URL directa sin el rol.
- Las rutas `/config/ecf/admin`, `/config/ecf/certificacion` y `/config/ecf/contingencia` están
  registradas en `src/App.tsx` **antes** de `/config/:seccion`.
- Todas las entradas están también en la paleta de comandos (`CommandPalette.tsx`).
- Las Secuencias e-NCF **no** son una entrada de menú aparte: son una pestaña dentro de
  `/config/ncf` (ver §7).

---

## 6. Pantalla: Configuración general (`/config/ecf`)

`EcfConfigSection` en `src/features/config/ConfigPage.tsx` (base de #48, sin cambios estructurales
en esta sesión). Permite configurar:

- `habilitado` (interruptor maestro) + checkboxes de `tiposElectronicos`.
- Defaults fiscales: `tipoPagoDefault`, `tipoIngresosDefault`, `diasLimiteAprobacionComercial`,
  `umbralAlertaSecuencia`, `adjuntarPdfa`.
- Sección **Avanzado** (colapsada): `emitirAlSometer`, `bloquearSubmitSiAuraCaido`.
- Bloque **solo lectura** "Estado de conexión con Aura" (`provisioning`): ambiente activo, si hay
  API Key test/live, y tabla de RNC emisores con fecha de vencimiento del certificado.

---

## 7. Pantalla: Secuencias (`/config/ncf`) — pestaña e-NCF

`NcfPage.tsx` ahora tiene dos pestañas: **"Físico"** (lo de siempre) y **"Electrónico (e-NCF)"**
(`EcfSequencesPanel.tsx`).

**Panel e-NCF:**

- Si el tenant **no está provisionado** (`!provisioning.provisionado` o sin `company`): muestra
  un aviso con enlace a *Facturación Electrónica → Avanzado*, y **no** llama a la API de
  secuencias (`?company=` es obligatorio).
- Lista de rangos como tarjetas/tabla: `typeId` + `ncfType` de referencia, ambiente, rango,
  siguiente número, disponibles con **barra de progreso**, vencimiento y badges
  `exhausted` / `alertaActiva` (por agotarse). Reusa el criterio visual de la pestaña física.
- Aviso automático por cada rango `alertaActiva`.
- Badge informativo con cuántos tipos están habilitados como e-CF (de `getEcfTipos()`).

**Acciones por rango:**

| Acción | Endpoint | Notas |
|---|---|---|
| **Nuevo rango** | `POST /config/ecf/secuencias` | Selector de tipo con labels legibles, `startOn`/`stopOn`, `expireAt` (DatePicker). `env` se infiere del ambiente activo. |
| **Editar** | `PATCH /config/ecf/secuencias/:id` | Solo `stopOn` (extender) y `expireAt`. `typeId`/`env` son inmutables (candado). |
| **Anular rango** *(nuevo en #50)* | `POST /config/ecf/secuencias/anular-rangos` | Modal con `from`/`to` precargados al tramo no emitido (`currentNumber`–`stopOn`) + motivo. Irreversible, con confirmación. Aura salta los e-CF ya `ACCEPTED` del rango. |
| **Eliminar** | `DELETE /config/ecf/secuencias/:id` | Solo si el rango nunca emitió; si ya emitió, el `400` se muestra tal cual. |

---

## 8. Pantalla: Administración / provisioning (`/config/ecf/admin`)

`EcfAdminPage.tsx` — **wizard de 4 pasos**, gateado por rol **System Manager** (validado en vivo
contra ERPNext → `403`). Si el usuario no tiene el rol, ve un *empty state*; si un endpoint
responde `403`, se muestra un toast y no se rompe la pantalla. Aviso permanente de que las
pruebas end-to-end quedan pendientes.

El estado de cada paso se deriva de `GET /config/ecf → provisioning`. Cada paso se habilita solo
tras completar el anterior:

| # | Paso | Endpoint | ✅ cuando… |
|---|---|---|---|
| 1 | **Conectar API Key** | `POST /config/ecf/admin/connect` | `provisioning.hasApiKeyTest \|\| hasApiKeyLive` |
| 2 | **Crear emisor (RNC)** | `POST /config/ecf/admin/clients` | `provisioning.clientes.length > 0` |
| 3 | **Subir certificado** | `POST /config/ecf/admin/certificate` | `clientes[0].certificateExpiresAt` no nulo |
| 4 | **Registrar webhook** *(recomendado)* | `POST /config/ecf/admin/webhook` | tras la llamada exitosa (informativo) |

Detalles:

- **Paso 1**: selector de ambiente (Prueba/Producción) + input tipo password con botón
  mostrar/ocultar. La key se valida contra Aura antes de guardarse (cifrada, nunca se vuelve a
  mostrar). Reemplazarla = nuevo `POST`.
- **Paso 2**: formulario con `company` (precargado desde `EcfConfig.company`, editable), `rnc`,
  `legalName`, `address` (obligatorios) + `tradeName`, `municipality`, `province`, `email`,
  `economicActivity`, hasta 3 teléfonos. Si ya existe un emisor (`409`), se muestra su tarjeta en
  lugar del formulario.
- **Paso 3**: `<input type="file" accept=".p12,.pfx">` → se convierte a base64 en el navegador
  (`FileReader`, se quita el prefijo `data:`) + contraseña. Tras subir, muestra la fecha de
  vencimiento; alerta si vence en < 30 días.
- **Paso 4**: solo ambiente + botón. Hoy solo confirma que la llamada no falla (el receptor del
  webhook en el BFF llega en una fase futura).
- Al completar 1–3: aviso de que ya se puede activar `habilitado` en la config general.

Tras cada paso se invalida `['ecf-config']` para refrescar el estado del wizard.

---

## 9. Notas de Crédito y Débito electrónicas (#50)

### 9.1 Código de modificación DGII (Tabla VI)

`CreditNotesPage.tsx` (B04 → `typeId 34`) y `DebitNotesPage.tsx` (B03 → `typeId 33`):

- Cada pantalla consulta `getEcfTipos()` y calcula `ncEsEcf` / `ndEsEcf` con
  `ecfTipoElectronicoHabilitado(tipos, typeId)`.
- El `<Select>` **"Código de modificación (DGII)"** (opciones de `ECF_MODIFICATION_CODES`, copy en
  español) **solo se renderiza si el tenant emite esa nota como e-CF**. En ese caso es
  **obligatorio** (validación en `handleSubmit` + estilo de error en el campo).
- Se envía como `modificationCode` en el `POST` (omitido si el usuario no lo eligió).
- Si el tenant emite e-CF y se omite, el `POST /:id/submit` de la nota falla con `400` — por eso
  se fuerza en el formulario aunque la API lo acepte como opcional.

Códigos: `1` Devolución total · `2` Corrección de texto/datos · `3` Corrección de montos ·
`4` Reemplazo por contingencia *(raro)* · `5` Referencia a Factura de Consumo *(raro)*.

### 9.2 `referenceInvoice` en Nota de Débito

El formulario de nueva Nota de Débito ya tenía un selector de factura (del que se deriva el
`customer`); ahora ese `id` **se envía siempre** como `referenceInvoice`. El campo se renombró a
**"Factura afectada"**, pasó a obligatorio, con hint aclarando que Aura lo exige para las notas
electrónicas (E33).

---

## 10. Detalle de factura (`InvoiceDetail.tsx`)

### 10.1 Bloque de estado e-CF (#49)

Cuando `data.ecf` existe (factura emitida electrónicamente), se muestra un `inline-alert` tras
someter y en el detalle:

- Estado legible: `PENDING` → *"Enviado a la DGII, esperando confirmación"*; `ACCEPTED` →
  *"Aceptado por la DGII"*; `REJECTED` → *"Rechazado…"*.
- Mensaje de la API + aviso distinto si `deferred` (modo contingencia).
- Si `qrUrl` es `null` → *"Código QR en proceso…"* (el llenado en vivo depende del webhook, fase
  futura); si viene, enlace a la representación fiscal.
- **No bloquea** el flujo normal de la factura, sin polling.

El estado `PENDING → ACCEPTED/REJECTED` se actualiza en segundo plano (webhook del BFF). **No hay
endpoint de "refrescar ahora"** — el estado se ve al recargar la pantalla.

### 10.2 Anulación con e-CF aceptado (#50) — cambio de UX

Un e-CF **`ACCEPTED` o `CONDITIONAL`** ya no se puede anular; la única corrección es una Nota de
Crédito Electrónica.

- `const ecfAceptado = invoice.ecf?.status === 'ACCEPTED' || 'CONDITIONAL'`.
- Cuando es `true`, el botón **"Cancelar"** desaparece y se sustituye por **"Emitir Nota de
  Crédito"**, que navega a `/notas-credito?originalInvoice=<id>`. Además aparece un `inline-alert`
  explicando por qué.
- **Red de seguridad**: si aun así se llega a llamar `cancel` y responde `409` con un mensaje que
  menciona "nota de crédito", se cierra el modal y se muestra el mismo atajo (en vez del toast
  genérico "ya está cancelada"). El resto de `409` mantiene el comportamiento anterior.
- `CreditNotesPage` lee `?originalInvoice=`: abre el modal de nueva nota con esa factura
  precargada (carga el detalle aunque no esté en la lista corta de facturas).

### 10.3 Descarga de PDF/A (#50)

- Botón **"PDF/A (archivo fiscal)"** junto a los de PDF/impresión, **visible solo si
  `invoice.ecf`** existe. Llama `GET /invoices/:id/ecf/pdfa`.
- Es un archivo **distinto** del PDF normal de la factura (formato certificable para archivado
  fiscal de largo plazo). `404` → *"Esta factura no tiene un e-CF emitido."*
- El PDF normal de la factura ahora incluye automáticamente un bloque de QR + código de seguridad
  cuando aplica — **sin cambios de frontend**, el print format lo trae solo.

---

## 11. e-CF: Compras/Gastos, bandeja de recibidos (F8), contingencia y certificación (F9)

### 11.1 Componente compartido `<EcfStatusCard>`

El bloque de estado e-CF (antes inline en `InvoiceDetail`) se extrajo a
`src/components/shared/EcfStatusCard.tsx` — `props: { ecf: EcfSubmitResult }`. Muestra un
`inline-alert` con el estado DGII legible (`ecfStatusLabel` en `src/lib/dgii.ts`, ahora cubre los
10 estados del enum), el mensaje, aviso de contingencia si `deferred`, y el QR (o "en proceso").
Se usa en los 3 detalles: **factura, compra y gasto**.

### 11.2 e-CF propio en Compras y Gastos

- `Compra.ecf?` / `Gasto.ecf?` (`EcfSubmitResult`) — presentes **solo** cuando el comprador
  autogeneró un e-CF al someter: Compra con proveedor **ocasional** sin NCF (E41), o Gasto de
  tipo B11/B13/B14/B15/B17 sin NCF (E41/E43/E44/E45/E47), y e-CF habilitado para ese tipo.
- `CompraDetail` / `GastoDetail`: `submitMutation.onSuccess` captura `result.ecf` en estado y
  renderiza `<EcfStatusCard>` bajo el badge de estado. Sin e-CF (caso mayoritario) → nada nuevo.
- **No cambia** el contrato de `POST /compras` ni `POST /gastos`.

### 11.3 Bandeja de e-CF recibidos — `/ecf-recibidos`

Comprobantes que **terceros nos emitieron**. Nav: ítem propio en la sección **Operaciones**.

- **Lista** (`GET /ecf/recibidos`, paginada): filtros `search`, `rnc` (emisor), `estado` DGII,
  `typeId`, `from`/`to`. Columnas: NCF · Proveedor · Total · Estado DGII · **Conciliación** ·
  **ACECF** · fecha. Si `conciliacion === 'UNICO'` → botón inline *"Vincular con {candidata}"*
  (un clic). Botón de cabecera *"Cargar XML manualmente"*.
- Badges/helpers en `src/lib/dgii.ts`: `ecfStatusLabel`/`ecfStatusBadge`,
  `ecfConciliacionLabel`/`ecfConciliacionBadge` (CONCILIADO/UNICO/MULTIPLE/NINGUNO),
  `acecfStatusLabel`/`acecfBadge`, `ecfSlaUrgencia`.

### 11.4 Detalle de un e-CF recibido — `/ecf-recibidos/:voucherId`

`GET /ecf/recibidos/:voucherId`. Cards:
- **Datos del comprobante** (emisor, tipo, fecha, total).
- **Conciliación** (si no está `CONCILIADO`): `UNICO` → botón directo; `MULTIPLE` → `<Select>` de
  candidatas; `NINGUNO` → `<SearchSelect>` de facturas de compra (`listCompras`). Vincula con
  `POST /ecf/recibidos/:id/vincular` — funciona aunque la compra ya esté sometida. Errores:
  `400` = total no coincide (±RD$0.01), `404` = no existe, `409` = ya hay vínculo (mensaje del
  backend).
- **Líneas del proveedor**: tabla de solo lectura (`items[]`). Nunca crea la compra automáticamente.
- **Aprobación comercial (ACECF)**: si `acecf.status === null` → botones *Aceptar* / *Rechazar*
  con modal de confirmación (decisión **legal e irreversible**); *Rechazar* exige motivo.
  `POST /ecf/recibidos/:id/aprobacion-comercial`. Errores: `403` = sin permiso (sin reintento),
  `409` = ya decidido, `400` = mensaje del backend. Si ya decidido → se muestra quién/cuándo/
  motivo y **no** se vuelven a mostrar los botones. Badge de urgencia del `slaVenceEn`.

### 11.5 Carga manual de XML — `CargarXmlModal`

`Modal` con `<textarea>` para pegar el XML firmado (`signedXml`) →
`POST /ecf/recibidos/cargar-manual`. Flujo de excepción (el e-CF no llegó automáticamente).

### 11.6 Certificación DGII (F9) — `/config/ecf/certificacion`

`EcfCertificacionPage.tsx` — pantalla propia, gateada por *System Manager*.
`GET /config/ecf/certificacion?company=` — **solo lectura**. Muestra `stageLabel` (ya traducido
por el backend), barra de progreso si vienen `paso`/`totalPasos`, y `siguientePaso`. Badge
*Certificado* / *En trámite*. Si `activeMode === 'live'` y no certificado → aviso de que no podrá
habilitar e-CF live. Si el tenant no está conectado a Aura, aviso con link a *Avanzado*. La
certificación real se opera en el panel de Aura/DGII, no aquí.

### 11.7 Contingencia — Decreto 587-24 (F9) — `/config/ecf/contingencia`

`EcfContingenciaPage.tsx` — pantalla propia. Todas las llamadas requieren `?company=` y rol
*System Manager* (`403` → toast de permiso, sin reintento).

- **Tabla de diferidos** (`GET /config/ecf/contingencia/pendientes`): NCF · tipo · emitido ·
  badge de urgencia por `horasEnDiferido` (`ecfDiferidoUrgencia` en `dgii.ts`: `<24h` neutral,
  `24–48h` warn, `≥48h` error — límite legal 72h).
- **"Reenviar ahora"** (`POST …/flush`, sin body = todos) → `{ queued, expired, disallowed }`:
  `queued` alerta success · `expired` alerta **error destacada** (superaron las 72h → anulación
  manual + Reporte 608) · `disallowed` alerta warn (tipos E41/E43/E45/E46/E47 no reenviables).
- **"Activar contingencia"** (`POST …/activar`) → `Modal` con `motivo` obligatorio (≤500) +
  `autorizadoHasta` (`datetime-local` prellenado a **ahora + 72h**).
- **"Desactivar contingencia"** (`POST …/desactivar`, sin body) → `ConfirmModal`; si quedan
  diferidos sin transmitir, el texto lo advierte.

### 11.8 Errores nuevos manejados (F9)

- **`PUT /config/ecf { habilitado: true }` → `400`** cuando el tenant está en `live` sin
  certificación completa: `EcfConfigSection` detecta el mensaje (`/certificaci[oó]n/i`) y muestra
  un `inline-alert-warn` persistente con link a `/config/ecf/admin`, en vez de solo un toast.
- **`POST …/submit` → `503`** (DGII caída + `bloquearSubmitSiAuraCaido` activo) en factura /
  compra / gasto: toast con `ECF_SUBMIT_UNAVAILABLE_MSG` (de `src/shared/api/ecf.ts`) y, para
  *System Manager*, un botón de acción que lleva a `/config/ecf/admin`. Si el tenant desactivó
  esa palanca, no hay `503` — el submit tarda más y el e-CF queda en `WAITING_DEFERRED`, que
  `<EcfStatusCard>` ya sabe mostrar.

---

## 12. Notificaciones

Dos tipos nuevos aparecen **solos** en `/config/notificaciones` (la pantalla lista dinámicamente
desde `GET /notificaciones/tipos`), nacen desactivados (opt-in):

- `ecf_comprobante_rechazado` — la DGII rechazó un e-CF ya emitido.
- `ecf_secuencia_baja` — un rango e-NCF está por agotarse.

No requirieron ningún cambio de código.

---

## 13. Qué NO está construido (por diseño del backend)

- La **certificación DGII en sí** (los 14 pasos) — solo se consulta el progreso; el trámite se
  opera en el panel de Aura.
- **Anulación electrónica** operable desde la UI más allá del flujo Nota de Crédito.
- Endpoint de "refrescar el estado de un e-CF (emitido o recibido) ahora mismo" — hoy solo
  webhook + reconciliación en segundo plano + recarga.
- Creación automática de una factura de compra desde un e-CF recibido — es y seguirá siendo
  manual asistida (líneas pre-visualizadas, nunca auto-creadas).
- Impresión con QR real como flujo propio (el QR ya lo inserta el print format existente).
- UI de administración cross-tenant — todo es autoservicio del propio tenant.

> Con F9, **el backend del plan de e-CF queda completo.**

---

## 14. Estado de pruebas

| Nivel | Estado |
|---|---|
| `tsc -b` (typecheck) | ✅ Pasa |
| `npm run build` | ✅ Pasa |
| `npm run lint` | ✅ Sin errores nuevos (los preexistentes siguen igual) |
| Render de pantallas en preview | ⚠️ Requiere login; verificado que compilan y montan como ruta |
| **Emisión / recepción / contingencia real contra Aura/DGII** | ❌ **No probado — ningún tenant con Aura conectado; sin e-CF recibidos ni tenant certificado `live` en pruebas** |

Al integrar un tenant real habrá que validar end-to-end: wizard completo contra Aura, emisión de
e-CF al someter (venta, compra ocasional, gasto), `409` de anulación, PDF/A, anulación de rangos,
el ciclo completo de la bandeja de recibidos (conciliación + ACECF) con un e-CF real de un tercero,
el progreso de certificación con un tenant en trámite, y el panel de contingencia con la DGII
caída/simulada (activar, reenviar, `expired`/`disallowed`, `503` en submit).

---

## 15. Lista de archivos tocados

**Nuevos:**
`src/shared/api/ecf.ts` · `src/shared/api/ecf-recibidos.ts` · `src/lib/dgii.ts` ·
`src/components/shared/EcfStatusCard.tsx` · `src/features/config/EcfAdminPage.tsx` ·
`src/features/config/EcfSequencesPanel.tsx` · `src/features/config/EcfCertificacionPage.tsx` ·
`src/features/config/EcfContingenciaPage.tsx` · `src/features/ecf-recibidos/*` (Page, Detail, CargarXmlModal)

**Modificados:**

| Archivo | Cambio |
|---|---|
| `src/shared/api/endpoints.ts` | Rutas e-CF (secuencias, tipos, admin, `ecf/pdfa`, `anular-rangos`, `ecfRecibidos`, `certificacion`, `contingencia/*`) |
| `src/shared/api/types.ts` | Todos los tipos e-CF; `Invoice.ecf?` / `Compra.ecf?` / `Gasto.ecf?`; DTOs de notas, recepción, certificación y contingencia |
| `src/shared/api/ecf.ts` | Funciones de certificación/contingencia + `ECF_SUBMIT_UNAVAILABLE_MSG` (F9) |
| `src/lib/dgii.ts` | `ecfDiferidoUrgencia` (F9) + helpers previos |
| `src/shared/api/invoices.ts` | `downloadInvoiceEcfPdfa()` |
| `src/shared/api/config.ts` | `getEcfConfig()` / `updateEcfConfig()` (base #48) |
| `src/features/config/ConfigPage.tsx` | `EcfConfigSection` (base #48) + alerta del `400` "live sin certificación" (F9) |
| `src/features/config/NcfPage.tsx` | Pestañas "Físico" / "Electrónico (e-NCF)" |
| `src/features/invoicing/InvoiceDetail.tsx` | `<EcfStatusCard>`, UX de anulación, botón PDF/A, rama `503` en submit (F9) |
| `src/features/invoicing/CreditNotesPage.tsx` | Selector `modificationCode` condicional + preselección `?originalInvoice=` |
| `src/features/invoicing/DebitNotesPage.tsx` | Selector `modificationCode` + envío de `referenceInvoice` |
| `src/features/compras/CompraDetail.tsx` · `src/features/gastos/GastoDetail.tsx` | `<EcfStatusCard>` tras someter / si `.ecf`; rama `503` en submit (F9) |
| `src/App.tsx` | Rutas `/config/ecf/{admin,certificacion,contingencia}`, `/ecf-recibidos*` |
| `src/components/layout/AppLayout.tsx` | Grupo "Facturación Electrónica" (4 hijos) + gating recursivo por rol; ítem "e-CF Recibidos" en Operaciones |
| `src/components/layout/CommandPalette.tsx` | Entradas de paleta de comandos |

---

## 16. Convenciones aplicadas

- Mismo cliente HTTP (`src/shared/api/client.ts`), mismo patrón `useQuery`/`useMutation` +
  `invalidateQueries`, mismos componentes de UI (`Select`, `DatePicker`, `ConfirmModal`,
  `useConfirmClose`, `useDirtyCheck`, clases `ff-*` / `inline-alert*` / `btn *`).
- Copys en español, mismo tono que el resto de la app.
- El wizard de administración se siente más "técnico" (setup único), separado del uso diario.
