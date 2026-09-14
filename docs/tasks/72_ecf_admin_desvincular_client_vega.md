# Prompt para el agente de frontend — Administración de la conexión con Vega (e-CF): desvincular/reconectar Client

Copia y pega este prompt completo al agente de frontend.

---

## Contexto — por qué se necesita esto

En el tenant `jbc`, al intentar completar un cobro (`POST /caja/facturas/:id/completar-cobro`), el backend
devolvió este error:

```
Cliente no encontrado: No existe el cliente emisor especificado
```

Investigando la causa raíz: ese mensaje es **literal de Vega** (el proveedor de e-CF que usa el
backend para emitir comprobantes fiscales electrónicos), no un bug del cobro en sí. Ocurre cuando
el backend intenta emitir el e-CF y llama a Vega para leer los datos del "Client" (el RNC emisor
configurado para el tenant en la plataforma de Vega), y ese `vegaClientId` guardado **ya no existe
en Vega** — se borró, se reconectó con otra API Key sin volver a vincular el Client correcto, o se
mezclaron ambiente sandbox/producción.

Antes de este cambio, el backend **no tenía ninguna forma de deshacer esa vinculación rota**. Una
vez que una Company quedaba vinculada a un Client de Vega (tabla `tenant_ecf_clients`), el backend
bloqueaba para siempre cualquier intento de volver a crear o vincular un Client para esa misma
Company — sin importar que el vínculo guardado ya no sirviera. Se agregó un endpoint nuevo,
`DELETE /config/ecf/admin/clients/{company}`, que rompe ese vínculo roto del lado del control-plane
(sin tocar nada en Vega) para que el administrador pueda re-vincular o crear un Client nuevo desde
cero.

**Tu tarea**: implementar en el frontend toda la superficie de UI necesaria para que un
administrador (rol `System Manager`) pueda diagnosticar y resolver este escenario por su cuenta,
sin necesitar soporte técnico. Esto incluye tanto el endpoint nuevo como, si no existen ya, los
flujos de los endpoints existentes de administración de e-CF que dependen de él.

---

## Antes de empezar — fuente de verdad

El proyecto de frontend tiene un archivo `openapi.json` con la documentación actualizada del API.
**Ábrelo primero** y busca el tag `"Facturación Electrónica (e-CF) — Administración"` (prefijo de
ruta `config/ecf/admin`) para confirmar los schemas exactos de request/response de cada endpoint —
lo que sigue en este documento es la descripción funcional completa, pero el `openapi.json` es la
fuente de verdad sobre tipos exactos, nullability y nombres de propiedades. Si el `openapi.json`
que tienes en el repo de frontend no incluye todavía `DELETE /config/ecf/admin/clients/{company}`,
es porque se acaba de agregar en el backend — regenera/actualiza el `openapi.json` desde el backend
antes de implementar (o pídele al usuario que te confirme cómo sincronizarlo en este proyecto).

Todos los endpoints de este módulo están bajo el prefijo `config/ecf/admin`, exigen JWT (`Authorization: Bearer`)
y el header `X-Tenant`, y devuelven 403 si el usuario autenticado no tiene el rol `System Manager`
en ERPNext para el tenant activo — esto se valida en vivo contra el site del propio tenant en cada
llamada, no es un simple check de UI. La pantalla/sección de administración de e-CF, si ya existe,
probablemente ya oculta estas acciones a usuarios sin ese rol; si no lo hace, agrégalo ahora.

---

## 1. Endpoint nuevo — `DELETE /config/ecf/admin/clients/{company}`

### Qué hace

Desvincula el Client de Vega de una Company: borra únicamente el puente local
(`tenant_ecf_clients`, una fila que asocia `Company` de ERPNext ↔ `Client` de Vega) y limpia el
espejo informativo en el site del tenant (`vega_client_id`/`ambiente` quedan vacíos en el doctype
`Facturacion Electronica Config`). **No borra ni modifica nada en Vega** — el Client, si todavía
existe allá, sigue existiendo intacto; solo se olvida la referencia local rota.

Después de llamar a este endpoint, la Company queda "sin Client vinculado" y los endpoints
`POST /config/ecf/admin/clients` (crear uno nuevo) y `POST /config/ecf/admin/clients/link`
(vincular uno existente) vuelven a estar disponibles para esa Company — antes de desvincular,
ambos responden 409 Conflict con el mensaje `Ya existe un Client de Vega conectado para la
compañía "<company>".`.

### Request

```
DELETE /api/v1/config/ecf/admin/clients/{company}
```

- `company` va en la URL (path param), **debe ir URL-encodeado** — los nombres de Company en
  ERPNext suelen tener espacios (ej. `"Premium Soft SRL"` → `/clients/Premium%20Soft%20SRL`).
  Usa `encodeURIComponent(company)` al construir la URL, nunca lo pases sin codificar.
- Sin body.

### Response — éxito (200)

```json
{
  "success": true,
  "data": {
    "message": "Client de Vega desvinculado de \"ACME\". Ahora puede crear uno nuevo o vincular otro existente.",
    "previousVegaClientId": "3f9c1a20-...-uuid-del-client-anterior"
  }
}
```

### Response — error (404)

Si esa Company nunca tuvo un Client vinculado (o ya se desvinculó antes):

```json
{
  "statusCode": 404,
  "message": "No hay ningún Client de Vega conectado para la compañía \"ACME\"."
}
```

### Response — error (403)

Si el usuario no tiene rol `System Manager`:

```json
{
  "statusCode": 403,
  "message": "Se requiere el rol System Manager para administrar la conexión con Vega."
}
```

---

## 2. El resto de los endpoints de este módulo (para que el flujo completo tenga sentido)

Es muy probable que varios de estos YA estén implementados en el frontend (es un módulo de
administración/configuración existente). Verifica primero qué existe; implementa solo lo que
falte, y asegúrate de que el flujo completo — desde "conectar la API Key" hasta "desvincular y
reconectar" — quede coherente end-to-end. No asumas que nada de esto existe sin confirmarlo en el
código del frontend primero.

### 2.1 `POST /config/ecf/admin/connect` — conectar/editar la API Key

```json
// Request
{ "mode": "test" | "live", "apiKey": "vega_test_..." }

// Response
{ "success": true, "data": { "mode": "test", "connected": true } }
```

Este endpoint **ya es un upsert** — llamarlo de nuevo con una API Key distinta actualiza (edita) la
key existente para ese modo (`test` o `live`) sin necesitar borrar nada antes. El backend valida la
key contra Vega antes de guardarla (llamada de solo lectura); si la key es inválida devuelve 400
con un mensaje claro. La key nunca se devuelve de vuelta una vez guardada (es de solo escritura
desde el frontend) — el estado de si hay una key conectada se consulta por separado (ver §2.6).

**UI**: un formulario simple con selector de ambiente (`test`/`live`) + campo de texto para la API
Key + botón "Conectar" (o "Reconectar" si ya hay una key guardada para ese modo — el texto del
botón puede cambiar según `hasApiKeyTest`/`hasApiKeyLive`, ver §2.6, pero la llamada es la misma).
Mostrar el error de validación tal cual si Vega la rechaza.

### 2.2 `GET /config/ecf/admin/clients?mode=test|live` — listar Clients existentes en Vega

```json
// Response
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "projectId": "uuid",
      "rnc": "131234567",
      "legalName": "Premium Soft SRL",
      "tradeName": "Premium Soft",
      "address": "...",
      "municipality": "...",
      "province": "...",
      "phones": ["8091234567"],
      "email": "contacto@premiumsoft.do",
      "economicActivity": "...",
      "activeEnv": "TesteCF" | "eCF",
      "hasCertificate": true,
      "certificateExpiresAt": "2027-01-01T00:00:00Z",
      "contingencyMode": false,
      "contingencyAuthorizedUntil": null,
      "contingencyReason": null,
      "certificationStage": "CERTIFIED",
      "createdAt": "...",
      "linkedCompany": "ACME"
    }
  ],
  "meta": { "mode": "test" }
}
```

`linkedCompany` es `null` si ese Client de Vega no está vinculado a ninguna Company de este tenant
todavía — son los candidatos que la UI debe ofrecer para "vincular" en vez de "crear" (Vega rechaza
con 409 crear un RNC que ya existe en su proyecto).

**UI**: tabla/lista mostrando cada Client (razón social, RNC, ambiente, `certificationStage`,
si tiene certificado) con badge "vinculado a `<linkedCompany>`" o botón "Vincular a esta Company"
cuando `linkedCompany` es null.

### 2.3 `POST /config/ecf/admin/clients/link` — vincular un Client existente

```json
// Request
{ "company": "ACME", "vegaClientId": "uuid-del-client-listado-en-2.2", "mode": "test" }

// Response 200
{ "success": true, "data": { /* mismo shape de VegaClient que en 2.2, sin linkedCompany */ } }

// Response 409 (ese Client ya está vinculado a OTRA Company de este tenant)
{ "statusCode": 409, "message": "Ese Client de Vega ya está vinculado a la compañía \"OTRA\"." }

// Response 409 (esta Company YA tiene un Client vinculado — hay que desvincular primero, ver §1)
{ "statusCode": 409, "message": "Ya existe un Client de Vega conectado para la compañía \"ACME\"." }
```

`mode` es opcional — si se omite usa el `activeMode` ya conectado para el tenant.

### 2.4 `POST /config/ecf/admin/clients` — crear un Client nuevo en Vega

```json
// Request
{
  "company": "ACME",
  "rnc": "131234567",
  "legalName": "Premium Soft SRL",
  "tradeName": "Premium Soft",          // opcional
  "address": "Calle Falsa 123",
  "municipality": "Santo Domingo",       // opcional
  "province": "Distrito Nacional",       // opcional
  "phones": ["8091234567"],              // opcional, máx 3
  "email": "contacto@premiumsoft.do",    // opcional
  "economicActivity": "Comercio",        // opcional
  "mode": "test"                         // opcional
}

// Response 200 — mismo shape VegaClient que en 2.2

// Response 409 — el RNC ya existe en el proyecto Vega (usar link en vez de crear)
{
  "statusCode": 409,
  "message": "Ya existe un Client en Vega con el RNC 131234567 (\"Premium Soft SRL\"). Vincúlelo con POST /config/ecf/admin/clients/link en vez de crearlo de nuevo.",
  "details": { "existingClientId": "uuid" }
}
```

**UI**: cuando este 409 ocurre, la pantalla debería ofrecer automáticamente el botón/flujo de
"vincular" usando `details.existingClientId` (llamando a `POST /clients/link` con ese id), en vez
de solo mostrar el error crudo.

### 2.5 `POST /config/ecf/admin/certificate?company=...` — subir certificado de firma

```json
// Request
{ "p12Base64": "...", "password": "...", "mode": "test" }  // mode opcional

// Response
{ "success": true, "data": { "certificateExpiresAt": "2027-01-01T00:00:00Z" } }
```

**UI**: input de archivo `.p12` (convertir a base64 en el cliente antes de enviar) + campo de
contraseña. `company` va como query param — resuélvelo de la Company actualmente seleccionada en
la pantalla, no lo pidas de nuevo si ya está en contexto.

### 2.6 `GET /config/ecf` (fuera de este controlador, pero es la fuente de estado — tag `"Facturación Electrónica (e-CF)"`)

Este endpoint (ya existente, no es parte del cambio actual) es de donde la pantalla debe leer el
estado completo para decidir qué mostrar/habilitar. Campo relevante:

```json
{
  "success": true,
  "data": {
    "habilitado": true,
    "company": "ACME",
    "vegaClientId": "uuid",
    "ambiente": "eCF",
    "contingenciaActiva": false,
    "provisioning": {
      "provisionado": true,
      "operational": true,
      "activeMode": "live",
      "hasApiKeyTest": true,
      "hasApiKeyLive": true,
      "clientes": [
        {
          "company": "ACME",
          "rnc": "131234567",
          "certificateExpiresAt": "2027-01-01T00:00:00Z",
          "certificationStage": "CERTIFIED",
          "contingencyMode": false
        }
      ]
    }
    /* + más campos de configuración operativa, ver openapi.json */
  }
}
```

`provisioning.clientes[]` es la lista de Companies con Client vinculado en este tenant (en la
práctica, casi siempre una sola fila — un site por tenant, sin multi-company). Esta es la lista que
debe renderizarse en la pantalla principal de administración de e-CF, y **cada fila de esta lista
es donde va el botón nuevo "Desvincular"** (§1).

---

## 3. Diseño de la pantalla — qué construir/ajustar concretamente

Localiza primero la pantalla/sección existente de "Configuración > Facturación Electrónica" (o
similar) en el frontend — es donde vive hoy, si ya existe, todo lo de conectar API Key /
certificación / secuencias NCF / contingencia. Esta funcionalidad de administración del Client de
Vega debe vivir ahí, como una sub-sección clara (ej. "Conexión con Vega" o "Emisor (Client)"), no
como una pantalla nueva aislada.

### 3.1 Panel de estado de conexión

Basado en `GET /config/ecf` → `data.provisioning`:
- Si `provisionado` es `false`: mostrar el formulario de §2.1 como estado inicial ("Conectar API
  Key de Vega").
- Si `provisionado` es `true`: mostrar `activeMode`, si hay key de test/live conectada
  (`hasApiKeyTest`/`hasApiKeyLive`), y un botón "Reconectar / cambiar API Key" que reabre el
  formulario de §2.1 (edición, no requiere borrar nada antes — ver nota en §2.1).

### 3.2 Lista de Clients vinculados (`provisioning.clientes[]`)

Por cada fila (normalmente una sola, la Company del tenant):
- Mostrar: Company, RNC, `certificationStage` (con badge de color: ej. gris "NOT_STARTED", amarillo
  "en progreso", verde "CERTIFIED"), si tiene certificado cargado y su fecha de expiración
  (alertar visualmente si está próxima a vencer o ya venció), si `contingencyMode` está activo.
- Acciones por fila:
  - "Subir certificado" → abre el formulario de §2.5.
  - **"Desvincular" (NUEVO)** → ver §3.3 abajo, el punto central de esta tarea.

### 3.3 Acción "Desvincular" — el flujo nuevo a implementar

1. Botón "Desvincular" en cada fila de Client vinculado. Ícono/color que comunique que es una
   acción de corrección/reset (no destructiva a nivel fiscal), no un simple "eliminar".
2. Al hacer click, **mostrar un diálogo de confirmación explícito** con un texto similar a:

   > "Esto va a desconectar el emisor (`<legalName / RNC>`) de esta compañía en el sistema.
   > **No se borra nada en Vega** — el Client sigue existiendo allá si todavía es válido.
   > Úsalo cuando el sistema no puede emitir comprobantes porque la conexión con Vega quedó
   > rota (por ejemplo, si el mensaje de error menciona "Cliente no encontrado"). Después de
   > desvincular vas a poder volver a conectar el emisor correcto."

   Es importante que el texto deje claro la distinción "desvinculación local" vs "borrar en Vega",
   para que el administrador no dude en usarlo por miedo a perder datos fiscales — no se pierde
   nada, solo se corrige una referencia rota.
3. Al confirmar, llama a `DELETE /config/ecf/admin/clients/{company}` (con el `company` de esa
   fila, URL-encodeado).
4. En éxito: refresca el estado (`GET /config/ecf`) — la fila debe desaparecer de
   `provisioning.clientes[]`, y en su lugar la pantalla debe mostrar el estado "sin Client
   vinculado para esta Company" con los dos caminos disponibles a continuación (§3.4).
5. En error 404 ("No hay ningún Client de Vega conectado..."): tratar como no-op benigno — refrescar
   igual el estado (puede pasar por una doble-click o un estado ya desincronizado en el cliente).
6. En error 403: mostrar el mensaje tal cual (usuario sin rol System Manager) — no debería ocurrir
   si la pantalla ya está gateada por rol, pero maneja el caso igual.

### 3.4 Después de desvincular — reconectar

Cuando `provisioning.clientes[]` no tiene fila para la Company activa, la pantalla debe ofrecer
claramente dos caminos (puede ser un mismo componente con dos pestañas/botones):

- **"Vincular un emisor existente"** → llama a `GET /config/ecf/admin/clients?mode=<activeMode>`
  (§2.2), muestra la lista, resalta los que tienen `linkedCompany: null` (disponibles), y al elegir
  uno llama a `POST /config/ecf/admin/clients/link` (§2.3).
- **"Crear un emisor nuevo"** → abre el formulario de §2.4 (`POST /config/ecf/admin/clients`). Si
  la respuesta es 409 con `details.existingClientId`, ofrece automáticamente vincularlo (llama a
  §2.3 con ese id) en vez de solo mostrar el error.

Este es exactamente el mismo flujo de alta inicial que ya debería existir para conectar el primer
emisor de un tenant nuevo — la única diferencia es que ahora también debe ser alcanzable *después*
de una desvinculación, no solo la primera vez. Si el flujo de alta inicial ya está implementado,
lo único que falta es asegurarse de que la pantalla vuelva a mostrarlo correctamente cuando
`provisioning.clientes` queda vacío para la Company activa (en vez de quedar en un estado roto o
sin salida).

---

## 4. Manejo de errores — mensaje "Cliente no encontrado" en cualquier otra pantalla

El mensaje de error que originó este trabajo (`"Cliente no encontrado: No existe el cliente emisor
especificado"`) puede aparecer en **cualquier** operación que dispare la emisión de un e-CF, no
solo en Caja — por ejemplo al completar cobros, someter facturas, notas de crédito, etc. Dondequiera
que el frontend capture y muestre errores de esas operaciones (el interceptor/handler genérico de
errores HTTP), si el mensaje coincide con el patrón `/cliente emisor especificado/i` (o más en
general, cualquier 404 proveniente de la emisión de e-CF), sería valioso agregar un enlace/CTA
adicional en el toast/banner de error tipo "Ir a administración de e-CF" que lleve directo a la
pantalla de §3, para que el usuario no tenga que adivinar qué hacer con un mensaje técnico. Esto es
una mejora de UX deseable pero no bloqueante — priorízalo después de tener el flujo de §3 completo
y funcional.

---

## 5. Checklist de verificación antes de dar por terminado

1. `DELETE /config/ecf/admin/clients/{company}` implementado, con `company` URL-encodeado.
2. Confirmación explícita antes de desvincular, con el texto aclarando "no se borra nada en Vega".
3. Después de desvincular, la pantalla refresca y muestra el flujo de reconexión (vincular o crear)
   sin quedar en un estado roto o sin salida.
4. Los 3 casos de respuesta (200, 404, 403) están manejados con mensajes claros.
5. Toda la sección queda oculta o deshabilitada para usuarios sin rol `System Manager`.
6. Probado manualmente contra un tenant real: conectar API Key → crear/vincular Client →
   desvincular → confirmar que vuelve a ofrecer crear/vincular → volver a vincular exitosamente.
7. Revisado el `openapi.json` actualizado para confirmar que no hay ningún campo/tipo que este
   documento haya descrito de forma inexacta (es la fuente de verdad final).
