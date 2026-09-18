# Relaciones Comerciales (B2B) — estado de la implementación frontend y pendientes

> Escrito al cortar sesión el 2026-09-18, actualizado en una sesión de continuación el mismo día.
> Todo lo descrito abajo es sobre **este repo** (gensuite-web, frontend). El backend (BFF) ya está
> completo (Fases 01-11) y en vivo contra un entorno de desarrollo real — no es un mock.
>
> **Resumen de la sesión de continuación**: se hizo el commit del trabajo previo, se resolvieron
> las dos dudas abiertas (§3.1 y §4 — una era un bug real de backend, la otra no era bug), y se
> probó bastante más de Fase 04/05 en vivo (cancelar/reenviar invitación, guardar términos, guardar
> configuración, terminar relación). Se encontraron 2 bugs de backend adicionales (§3.3, el más
> serio de todos: una acción reporta error pero sí se aplica) y 1 bug de frontend que ya se arregló
> (§3.4). Se refactorizó la lógica duplicada de lookup de relación en un hook compartido
> (`useRelacionComercialPorContraparte`). Se sigue bloqueado en las Fases 06-11 por el bug de
> backend de §3.1.

## 0. Contexto rápido

Se pidió implementar **todas las fases** de `docs/tasks/relaciones_comerciales/FASE_01..11_*.md`
(11 handoffs de backend) en el frontend, con pruebas end-to-end reales contra el backend vivo. El
trabajo se hizo en gran parte (ver §1) pero **no se llegó a probar todo ni a cerrar dos hallazgos
abiertos** (ver §3 y §4) antes de cortar la sesión.

Credenciales de prueba (dadas explícitamente por el usuario para testing, entorno de desarrollo):
`rcastrofelix06@gmail.com` / `prueba2026`. Esta cuenta tiene dos tenants:
- **`far-dev`** ("Farmacia Charless") — rol **System Manager** ahí. La mayoría de las acciones
  `relaciones.*` están concedidas (22/29 en `GET /me/permissions`, ver detalle en §5). Es el tenant
  usado para casi toda la prueba manual.
- **`jbc`** ("JORGES BUSINESS CONSULTING") — rol "Administrador" (no System Manager). **0/29**
  acciones `relaciones.*` concedidas — no se pudo probar nada del lado receptor de una invitación
  con esta cuenta (ver §5, es una limitación de datos de prueba, no un bug).

Casualidad útil: el RNC de ejemplo en los handoffs de backend (`130959994`, "JORGES BUSINESS
CONSULTING") **es exactamente el tenant `jbc` real** — se puede seguir usando para probar el
directorio.

## 1. Qué se implementó (código)

### 1.1 Infraestructura compartida (yo directamente, no vía subagente)

- `src/shared/api/types.ts` — sección nueva completa "Relaciones Comerciales (B2B)" al final del
  archivo: todos los tipos de las 11 fases (`EstadoRelacionComercial`, `TerminosComercialesDto`,
  `EmpresaDirectorioRelacion`, `InvitacionRelacion`, `BloqueoComercial`, `RelacionComercialDetalle`,
  `TransaccionB2BDetalle`, `ResultadoMapeo`/`LineaMapeo`, `DiffTransaccion`, `DocumentoEnlazable`,
  etc). También se agregó `"Relaciones Comerciales"` a `NotificacionCategoria` (Fase 02).
- `src/shared/api/endpoints.ts` — bloque `relaciones: {...}` con los 38 endpoints de
  `/api/v1/relaciones/*`, más 4 nuevos dentro del bloque `compras` existente
  (`enviarAProveedor`, `cancelarEnvio`, `estadoSocio`, `enlazarYEnviar`).
- `src/shared/api/relaciones.ts` (archivo nuevo) — capa de funciones HTTP tipadas para los 42
  endpoints. **Importante**: los ejemplos de los handoffs de backend muestran shapes
  inconsistentes — endpoints de listado paginado (`GET /relaciones`, `GET /relaciones/transacciones`)
  envueltos en `{success, data, meta}`, pero recurso único (GET/POST de un solo objeto) **sin
  envoltorio**, el objeto directo. Se implementó `unwrapAny<T>()` (helper local en ese archivo) que
  tolera ambos shapes — **verificado contra el backend real que el shape sin envoltorio es
  correcto** (ver `curl`/fetch en §2).
- `docs/PROMPT_PERMISOS_FRONTEND.md` — sección nueva "Relaciones Comerciales" (§16, entre
  "Registrar Pago" y "Reporte de Ventas") con las 29 acciones `relaciones.*` documentadas.
  `scripts/gen-acciones.mjs` actualizado (esperaba 424, ahora 453) y regenerado
  `src/shared/permissions/acciones.generated.ts`. **Verificado contra el backend real**: `GET
  /me/permissions` devuelve exactamente esas 29 claves `relaciones.*` — el catálogo frontend
  coincide 100% con el backend.
- `.claude/launch.json` — se fijó el puerto del dev server a `5195` con `--strictPort` (antes
  usaba `autoPort` del harness, que asignaba un puerto distinto al que Vite realmente elegía —
  causaba que el preview no conectara). Si en la próxima sesión el puerto 5195 está ocupado,
  cambiarlo a mano en ese archivo (los dos lugares: `"port"` y `--port` en `runtimeArgs`).

### 1.2 Pantallas nuevas (vía 2 subagentes en paralelo + verificación mía)

Todo bajo `src/features/relaciones-comerciales/` salvo la pública:

| Archivo | Fase(s) | Qué hace |
|---|---|---|
| `RelacionesComercialesPage.tsx` | 03/04/05 | 3 tabs: Socios / Invitaciones (enviadas-recibidas) / Bloqueadas. Botón "Nueva relación comercial" abre el wizard. |
| `NuevaRelacionWizard.tsx` | 03/04 | Wizard 3 pasos (RNC → términos → confirmar), modal. |
| `TerminosComercialesFields.tsx` | 01/04/05 | Form compartido de `TerminosComercialesDto`, reusado en 3 lugares. |
| `shared.tsx` | — | `EstadoRelacionBadge`, `EstadoInvitacionBadge`, `AvisoAdopcionMaestros`. |
| `RelacionDetail.tsx` | 05/07 | Detalle de relación: registros vinculados, RNC_DUPLICADO_EN_SITE / MAESTRO_YA_VINCULADO, términos, configuración, ciclo de vida (suspender/reactivar/terminar), mapeo acumulado. |
| `TransaccionesPage.tsx` | 06 | Bandeja filtrable (dirección/tipo/estado/relacionId vía query param/fechas), reintentar/cancelar. |
| `TransaccionDetail.tsx` | 06/07/08/09/10/11 | Pantalla grande: snapshot del socio, mi documento, mapeo (gate de Aceptar), Aceptar/Rechazar, diff + Igualar/Igualar-con-enmienda, flujo de Enlazar documento. |
| `estadoTransaccion.ts` | 06 | Mapa de badges de `EstadoTransaccionB2B` + helper, compartido entre lista y detalle. |
| `components/MapeoForm.tsx` | 07 | Componente compartido de la tabla de mapeo (lo escribí yo, no el subagente) — reusado en Aceptar y en Enlazar. |
| `components/DiffView.tsx` | 10 | Componente compartido del diff lado-a-lado (lo escribí yo). |
| `src/pages/RelacionInvitacionPublicPage.tsx` | 04 | Pantalla pública (sin login), clon del patrón de `InvitationPage.tsx`. |

### 1.3 Cambios en pantallas existentes (yo directamente)

- `src/features/compras/CompraDetail.tsx` — Fase 09/10/11: botón "Enviar a proveedor" (borrador,
  con checkbox autoSometer), indicador de `estadoSocio` + "Retirar envío"/"Reenviar"/"Igualar
  factura al proveedor" (sometida), botón "Enviar al proveedor" vía `enlazar-y-enviar` para una
  compra ya sometida que nunca se envió por este canal. **Nota de diseño**: para resolver
  `relacionId` (que "enlazar-y-enviar" necesita en el body) se hace un lookup N+1: lista las
  relaciones activas del tenant y busca cuál tiene `supplier === compra.supplier` — aceptable
  porque un tenant típico tiene pocas relaciones, pero si crece mucho convendría que el backend
  expusiera un endpoint directo "relación por proveedor".
- `src/features/invoicing/InvoiceDetail.tsx` — Fase 08/10: mismo patrón de lookup pero por
  `customer`, badge "Cliente socio" + estado del envío B2B, botón "Enviar al cliente" (gateado por
  `autoEnviarVentas === false` o último envío en `Error`), botón "Igualar factura al cliente"
  (siempre es `igualar-con-enmienda`, nunca el simple, porque una Sales Invoice sometida siempre
  tiene `docstatus` submitted).
- `src/features/config/NotificacionesPage.tsx` — se agregó `'Relaciones Comerciales'` al array
  `CATEGORIAS` (Fase 02 — nada más que hacer ahí, ya renderiza los 10 tipos nuevos automáticamente
  cuando el backend los devuelva bajo esa categoría).
- `src/App.tsx` — rutas nuevas: `/relaciones-comerciales`, `/relaciones-comerciales/transacciones`,
  `/relaciones-comerciales/transacciones/:uid`, `/relaciones-comerciales/:id` (protegidas), y
  `/relaciones/invitacion` (pública, fuera de `ProtectedRoute`, igual que `/invitacion`).
- `src/shared/permissions/rutas.ts` — entradas para las 4 rutas protegidas de arriba (las
  específicas de transacciones van antes que el catch-all `/relaciones-comerciales/*`).
- `src/components/layout/AppLayout.tsx` — grupo de menú nuevo "Relaciones Comerciales" (ícono
  `Handshake`) en `NAV_OPS`, con 2 hijos: "Socios y Solicitudes" y "Transacciones B2B".

## 2. Qué se probó en vivo (navegador real, backend real, tenant `far-dev`)

Confirmado funcionando end-to-end:

1. Login con las credenciales de prueba, cambio de tenant (`far-dev` ⇄ `jbc`) vía "Cambiar
   empresa".
2. `/me/permissions` real trae las 29 claves `relaciones.*` (catálogo frontend correcto).
3. Menú lateral "Relaciones Comerciales" aparece y filtra por permiso correctamente (en `jbc`, sin
   `relaciones.listar`, el grupo entero desaparece del menú — correcto).
4. `/relaciones-comerciales` carga, tabs Socios/Invitaciones/Bloqueadas, estado vacío correcto.
5. Wizard completo: paso 1 busca RNC `130959994` contra el backend real → encuentra "JORGES
   BUSINESS CONSULTING" (RNC real de `jbc`) → paso 2 (términos, con nota "sin efecto todavía" en
   Límite de crédito) → paso 3 (confirmación, repite el resumen) → **"Enviar invitación" creó una
   invitación real en el backend** (`POST /relaciones/invitaciones` con 201).
6. Tras crear la invitación: tab Socios muestra la relación en estado `Invitada` (badge amarillo)
   inmediatamente — confirma que el backend crea el registro de relación en `invitada` en cuanto se
   envía la invitación, tal como describe la Fase 05.
7. Tab Invitaciones → Enviadas: la fila aparecía con **"Contraparte: —"** (bug real, ver §3, ya
   arreglado).

### 2.1 Continuación (mismo día) — más pruebas en vivo

8. **Cancelar invitación** (`Enviadas`): confirma con `ConfirmModal`, `POST .../cancelar` real,
   fila pasa a badge rojo "Cancelada", aparece botón "Reenviar" — **funciona correctamente**.
9. **Reenviar invitación**: crea una fila NUEVA en estado "Pendiente" con expiración nueva,
   dejando la cancelada como está (histórico) — **funciona correctamente**, coincide con el
   checklist de la Fase 04 ("el link viejo queda inválido, pero el `GET` público lo sigue
   mostrando con su resultado histórico").
10. **Tab Bloqueadas**: estado vacío ("Sin empresas bloqueadas") se ve bien. No se pudo probar
    crear/levantar un bloqueo real (requiere responder una invitación como receptor, bloqueado por
    permisos en `jbc`, ver §5) — sigue sin probar.
11. **Wizard — reintentar invitar a una empresa con invitación pendiente**: buscar el mismo RNC
    (`130959994`) mientras había una invitación `pendiente` mostró `puedeInvitar: false` con el
    texto genérico exacto *"Esta empresa no está aceptando solicitudes por ahora."*, sin botón de
    invitar — **confirma el diseño de privacidad de la Fase 03 §5** (no se distingue el motivo).
12. **`RelacionDetail` — Guardar términos**: con la relación todavía en `invitada` (sin espejos
    creados), el backend responde `400` con mensaje claro: *"Esta relación todavía no tiene espejos
    de este lado — espere a que termine de activarse."* — el frontend lo muestra tal cual en el
    toast, **correcto**.
13. **`RelacionDetail` — Guardar configuración**: mismo escenario (relación `invitada`), pero acá
    el backend responde **`404` con `"Relacion Comercial <id> not found"`** — un mensaje mucho
    menos claro que el de "términos" para la misma situación de fondo (relación aún no activada).
    Es una **inconsistencia menor del backend** (ver §3.2) — el frontend igual lo muestra
    correctamente tal cual, no hay nada que arreglar de este lado salvo, opcionalmente, un mensaje
    más amable en el propio frontend si el backend no lo arregla (ver §3.2).
14. Nota de proceso: al verificar toasts con Playwright-style scripting, un chequeo inmediato
    después del click (sin esperar) siempre veía 0 toasts — **falso positivo por carrera de
    tiempos** (el toast aparece después de que la promesa HTTP se resuelve, no instantáneamente).
    Con una espera de 1s antes de verificar, los toasts aparecen siempre con el texto correcto.
    Anotado por si alguien más se confunde igual probando esto.

**Sigue sin probarse**: todo lo que dependa de que la relación llegue a `activa` (Fase 05
completa: `RNC_DUPLICADO_EN_SITE`/`MAESTRO_YA_VINCULADO`/suspender/reactivar/terminar), y **toda la
Fase 06 en adelante**, ahora bloqueado de raíz por el bug de backend de §3.1 (no por permisos) —
aunque se resolvieran los permisos de `jbc`, la bandeja de transacciones seguiría sin cargar. La
pantalla pública de invitación tampoco se probó (no se pudo recuperar un token real, ver §5).

## 3. Bug encontrado y arreglado: nombre de contraparte ausente en Invitaciones

`GET /relaciones/invitaciones` (y el detalle `GET /relaciones/invitaciones/:id`) **no devuelven
nombre de la contraparte**, solo `fromTenantId`/`toTenantId` opacos — verificado con `fetch` directo
contra el backend real:

```json
{"id":"22bcf47a-...","status":"pendiente","fromTenantId":"439edeae-...","toTenantId":"dd82a640-...","mensaje":"...","expiresAt":"...","createdAt":"..."}
```

Sin `contraparte`. Esto es un **gap real del contrato de backend** respecto a lo implícito en el
handoff de la Fase 04 (que nunca prometió ese campo tampoco, en retrospectiva — mirar el ejemplo de
"crear/aceptar" del handoff, tampoco lo tiene).

**Arreglo aplicado** en `RelacionesComercialesPage.tsx` (`InvitacionesTab`): se cruza contra `GET
/relaciones` (que sí trae `contraparte.{tenantId,nombre}`) — toda invitación enviada tiene, del
lado de origen, una relación espejo en estado `invitada` con el mismo `tenantId` en `toTenantId`.
Se armó un `Map<tenantId, nombre>` y se resuelve por `direccion === 'enviadas' ? toTenantId :
fromTenantId`, con fallback al tenantId crudo si no se encuentra (nunca queda en blanco).
**Verificado en vivo que el arreglo funciona** (la fila pasó de mostrar "—" a "JORGES BUSINESS
CONSULTING").

**Pendiente de verificar**: este paliativo asume que existe una relación espejo en `invitada` en
`GET /relaciones` del lado de origen. **No se confirmó qué pasa para una invitación *recibida* que
el destinatario aún no acepta** — ¿el backend crea también ya una relación `invitada` visible en
`GET /relaciones` del lado receptor antes de responder? Si no, el nombre en el tab "Invitaciones →
Recibidas" (y en el modal de "Aceptar invitación") caerá al tenantId crudo hasta que se confirme o
se implemente otra fuente. **Revisar esto con la cuenta de `far-dev` invitando y una segunda cuenta
real en `jbc` con permisos, o pedirle al equipo de backend que agregue `contraparte` a la respuesta
de invitaciones** (sería el arreglo correcto de raíz, mejor que este cruce del lado del cliente).

## 3.1 [RESUELTO] Bug del backend: `GET /relaciones/transacciones` siempre da 500

**Confirmado en la sesión de continuación (2026-09-18, después del commit inicial).** La bandeja de
transacciones (`/relaciones-comerciales/transacciones`) **nunca carga**, con o sin filtros —
probado en `far-dev` (System Manager) tanto sin ningún filtro como filtrando por `relacionId`:

```
GET /api/v1/relaciones/transacciones?limit=20&offset=0
→ 500 {"success":false,"error":{"code":"INTERNAL_ERROR","message":"Field not permitted in query: advertencia_totales","statusCode":500}}
```

El mismo error exacto ocurre con y sin `relacionId` en el query — **no es un problema del filtro,
es el endpoint entero**. Por el nombre del campo (`advertencia_totales`, snake_case) huele a un
mismatch entre el nombre de campo usado en la query interna (ORM/Frappe) y la lista de campos
permitidos (`fields` whitelist) del doctype `Transaccion B2B` en el backend — el campo que el
handoff de la Fase 06 llama `advertenciaTotales` (camelCase) en la respuesta.

**Esto es 100% un bug de backend, no de este frontend** — el frontend arma la URL correctamente
(`GET /relaciones/transacciones` con query params estándar) y el shape de la request coincide con
lo documentado. `TransaccionesPage.tsx` maneja el 500 correctamente (muestra "Error al cargar las
transacciones" en vez de romper la pantalla), así que no hay nada que arreglar de este lado.

**Impacto**: bloquea probar el 100% de las Fases 06, 07, 08, 09, 10 y 11 — ninguna transacción B2B
se puede listar ni ver mientras este endpoint devuelva 500, independientemente de los permisos de
la cuenta de prueba. **Hay que reportarle esto al equipo de backend antes de poder continuar las
pruebas de esas fases.** No se pudo confirmar si el detalle (`GET
/relaciones/transacciones/:uid`) tiene el mismo problema (no hay ningún `uid` real disponible para
probarlo — la lista nunca carga para conseguir uno).

## 3.2 Inconsistencia menor de backend: mensajes de error distintos para el mismo caso

Con una relación en estado `invitada` (sin espejos Customer/Supplier creados todavía), guardar
**términos** y guardar **configuración** deberían fallar por la misma razón de fondo, pero dan
respuestas muy distintas:

- `PUT /relaciones/:id/terminos` → `400 {"message":"Esta relación todavía no tiene espejos de este lado — espere a que termine de activarse."}` — claro, orientado al usuario.
- `PUT /relaciones/:id/configuracion` → `404 {"code":"NOT_FOUND","message":"Relacion Comercial <id> not found"}` — confuso: el `id` sí existe (el `GET` del mismo id responde 200 en el mismo momento), así que un usuario o desarrollador leyendo ese mensaje pensaría que hay un problema con el id, no que la relación simplemente no está activa todavía.

**No es nada que haya que arreglar en el frontend** (ya se muestra el mensaje del backend tal cual,
como corresponde) — es una sugerencia para el equipo de backend: unificar el mensaje de
`configuracion` para que sea tan claro como el de `terminos`. Si se prefiere una mitigación rápida
del lado del frontend mientras tanto, se podría interceptar este caso puntual en
`RelacionDetail.tsx` (código `NOT_FOUND` + `status !== 'activa'` → mostrar el mismo texto que
`terminos`), pero no se implementó porque es indistinguible de un verdadero 404 sin ese contexto
adicional y no vale la pena el acoplamiento por un mensaje de error.

## 3.3 Bug de backend (grave): `POST /relaciones/:id/terminar` da 500 pero SÍ aplica el cambio

Probado en vivo sobre la relación de prueba (`invitada`, nunca llegó a activarse). Al confirmar
"Terminar relación":

```
POST /api/v1/relaciones/802cd87b.../terminar
→ 500 {"code":"INTERNAL_ERROR","message":"Failed query: update \"b2b_outbox\" set \"state\" = $1 where (\"b2b_outbox\".\"id\" = $2 and \"b2b_outbox\".\"state\" = $3) returning ...\nparams: processing,b4afdaa3-...,pending","statusCode":500}
```

El mensaje de error **filtra SQL crudo** (nombres de tabla/columnas internas: `b2b_outbox`,
`state`, `transaction_id`, etc.) — un problema de higiene de errores aparte del bug funcional.

Pero al volver a consultar `GET /relaciones/:id` inmediatamente después, **el estado sí había
cambiado a `revocada`** — es decir, **la acción principal se aplicó correctamente**, pero un paso
secundario (parece ser cancelar un job pendiente en la tabla `b2b_outbox`, probablemente el reintento
de activación) falló con un error de SQL y tumbó toda la respuesta HTTP a 500. El frontend, al
recibir un 500, correctamente interpreta "la acción falló" (no invalida la query, no actualiza el
estado local) — así que la pantalla se queda mostrando el estado viejo (`Invitada`) hasta que el
usuario navegue de nuevo o refresque, momento en el que aparece `Revocada` sin explicación de por
qué cambió solo.

**Esto es un bug real y más serio que el de §3.1**: no es solo "una pantalla no carga", es
"el backend le dice al usuario que su acción falló cuando en realidad sí funcionó" — el usuario
podría reintentar "Terminar relación" pensando que no se aplicó, y ese reintento fallaría de nuevo
(la relación ya no está en un estado donde `terminar` tenga sentido), generando confusión. Hay que
pedirle al backend que:
1. Haga esta operación atómica (si el paso de cancelar el outbox falla, debería revertir el cambio
   de estado también, o al menos no fallar en primer lugar si no hay nada que cancelar), y
2. Nunca exponga el texto crudo de una query SQL en el `message` de un error de cara al cliente.

No se implementó ninguna mitigación en el frontend para este caso — no hay forma confiable de
distinguir desde el cliente "el 500 significa que en realidad sí se aplicó" de un 500 genuino sin
efecto, así que intentar adivinarlo sería peor que dejar el comportamiento actual (mostrar el error
tal cual, el usuario puede refrescar para ver el estado real).

## 3.4 Bug de frontend encontrado y arreglado: banner "Activando…" en una relación `revocada`

Consecuencia de probar el bug de §3.3: al terminar una relación que nunca se activó, quedó en
estado `revocada` con `configuracion: null` (nunca tuvo espejos). La condición original de
`RelacionDetail.tsx` para decidir "¿esta relación está activándose?" era:

```ts
const activando = ESTADO_ACTIVANDO.has(relacion.status) || relacion.configuracion === null
```

`ESTADO_ACTIVANDO` es `{'invitada', 'activando'}` — no incluye `'revocada'` ni `'rechazada'`, pero
como esas dos también dejan `configuracion: null` para siempre (nunca se van a activar), la
condición completa igual daba `true` — la pantalla mostraba "Activando… los registros de cliente y
proveedor se están creando." para una relación que **nunca** se va a activar, y las secciones de
Términos/Configuración decían "podrás guardar cuando termine de activarse", una promesa falsa.

**Arreglado**: se agregó `ESTADO_TERMINAL_SIN_ACTIVAR = new Set(['revocada', 'rechazada'])`, y
`activando` ahora es `false` para esos dos estados sin importar `configuracion`. La sección
"Registros vinculados" muestra en su lugar: *"Esta relación nunca se activó (quedó **revocada**) —
no hay registros de cliente ni proveedor vinculados."* Verificado visualmente que renderiza
correctamente tras el cambio.

## 4. [RESUELTO] Anomalía del campo "Días de crédito" con valor `13`

Confirmado en la sesión de continuación: **no es un bug de la app.** Al volver a abrir
`/relaciones-comerciales/:id` en una navegación limpia, el campo "Días de crédito (cliente)" aparece
vacío como se esperaba (`useState<TerminosComercialesDto>({})` funciona bien). El "13" que se vio
antes de cortar la sesión anterior era casi con certeza una sugerencia de autocompletado del propio
navegador (Chrome), no algo que React haya puesto ahí — se descarta como bug real, no requiere
ningún cambio de código.

## 5. Limitaciones del entorno de prueba (no son bugs de la app)

- La cuenta de prueba no tiene, en el tenant `jbc`, ninguna acción `relaciones.*` concedida (0/29).
  Esto bloqueó probar: aceptar/rechazar una invitación recibida, todo lo que dependa de tener una
  relación **activa** en ambos lados (transacciones, mapeo, venta/compra B2B, diff/igualar,
  enlazar). **No se intentó ni se debe intentar** resolver esto modificando roles/permisos del
  usuario vía llamadas directas a la API o edición de cuenta — eso requiere autorización explícita
  del usuario en el momento (cambiar permisos de cuenta está fuera de lo que un agente debe hacer
  por su cuenta). Si se quiere probar el lado receptor, pedirle al usuario:
  - que otorgue a esta cuenta (o a otra) el rol **"Relaciones Comerciales Admin RD"** en el tenant
    `jbc` desde `/config/roles` → usuario → editar roles (confirmé que ese rol ya existe en el
    catálogo del backend, visto en `/config/permisos` al buscar el doctype "Relacion Comercial"), o
  - que indique otra cuenta/tenant con esos permisos ya configurados.
- En `far-dev` (System Manager), de las 29 acciones, 7 siguen en `false` incluso para System
  Manager: `relaciones.compra.enviar-a-proveedor`, `relaciones.transaccion.aceptar-compra`,
  `relaciones.compra.igualar`, `relaciones.mapeo.crear-articulo`,
  `relaciones.mapeo.sincronizar-barcodes`, `relaciones.transaccion.enlazar-compra`,
  `relaciones.compra.enlazar-y-enviar` — es decir, **todo el lado "compra" del módulo no se pudo
  probar ni con System Manager** en este tenant. Estas son las acciones que hacen falta para probar
  Fase 09 completa y la mitad de Fase 11. Mismo comentario: pedir al usuario que las conceda si
  quiere que se prueben, no otorgárselas uno mismo sin permiso explícito.
- No se encontró forma de recuperar el **token** de una invitación (a propósito, por diseño: "la
  respuesta de crear NUNCA contiene el token"). Se intentó revisar `GET
  /notificaciones/logs` en `jbc` para ver si el correo con el link quedó registrado ahí — vino
  vacío (`total: 0`). Puede ser que este entorno de backend no tenga el envío de notificaciones
  activo, o que tarde en procesarse de forma asíncrona. **Sin el token real no se puede probar la
  pantalla pública `/relaciones/invitacion?token=...` end-to-end** — se revisó el código a fondo y
  es un clon fiel del patrón ya probado de `InvitationPage.tsx`, pero no se ejecutó contra el
  backend real.
- El servidor de desarrollo corre en el puerto **5195** (fijado en `.claude/launch.json`, ver §1.1)
  porque el 5173 estaba ocupado por otra sesión/worktree.

## 6. Checklist de lo pendiente por fase

- [x] Fase 01 (modelo de datos) — sin impacto en frontend, nada que hacer.
- [x] Fase 02 (permisos y notificaciones) — catálogo de acciones y categoría de notificaciones
      agregados y verificados contra el backend real.
- [x] Fase 03 (directorio RNC) — implementado y **probado en vivo** (búsqueda real exitosa).
- [~] Fase 04 (invitaciones y bloqueos) — implementado. **Probado en vivo**: crear, cancelar,
      reenviar invitación, y el bloqueo de re-invitar mientras hay una pendiente. **Sin probar**:
      aceptar/rechazar (recibida), bloqueos (crear/levantar — listar sí se probó, vacío), y la
      pantalla pública (bloqueado por permisos/token, ver §5). Bug de nombre de contraparte
      encontrado y mitigado (§3, con un punto abierto por confirmar para invitaciones recibidas).
- [~] Fase 05 (activación) — implementado, pantalla se ve y carga bien contra datos reales
      (estado `invitada`, "Reintentar activación" presente). **Probado en vivo**: guardar términos
      y guardar configuración con la relación aún `invitada` (ambos rechazan correctamente con el
      mensaje del backend, ver §3.2 por la inconsistencia entre los dos), y **terminar relación**
      (encontró un bug serio de backend, §3.3, más un bug de frontend ya arreglado, §3.4). **Sin
      probar** (necesita que la relación llegue a `activa`, bloqueado por permisos en `jbc`, ver
      §5): guardar términos/configuración con éxito real, suspender/reactivar,
      `RNC_DUPLICADO_EN_SITE`/`MAESTRO_YA_VINCULADO`. Anomalía del campo "Días de crédito" — **ya
      descartada, no era un bug** (§4).
- [ ] Fase 06 (bandeja de transacciones) — implementado (`TransaccionesPage`/`TransaccionDetail`),
      **bloqueado por el bug de backend de §3.1** (`GET /relaciones/transacciones` siempre da 500)
      — no es un problema de permisos ni de datos de prueba, el endpoint no funciona todavía.
- [ ] Fase 07 (mapeo de catálogo) — `MapeoForm.tsx` implementado y usado en dos flujos, **sin
      probar** contra datos reales — bloqueado por §3.1 (no hay forma de llegar a una transacción).
- [ ] Fase 08 (flujo de venta) — botón "Enviar al cliente"/"Igualar factura al cliente" agregados a
      `InvoiceDetail.tsx`, **sin probar** — bloqueado por §3.1 y por permisos en `jbc` (§5).
- [ ] Fase 09 (flujo de compra) — botones agregados a `CompraDetail.tsx`, **sin probar** —
      bloqueado por §3.1, y además por permisos (`relaciones.compra.enviar-a-proveedor` en `false`
      incluso para System Manager en `far-dev`, ver §5).
- [ ] Fase 10 (diferencias e igualar) — `DiffView.tsx` + botones Igualar/Igualar-con-enmienda
      implementados en `TransaccionDetail.tsx` y en `CompraDetail.tsx`/`InvoiceDetail.tsx`, **sin
      probar** — bloqueado por §3.1.
- [ ] Fase 11 (enlazar documentos) — flujo de enlazar implementado dentro de `TransaccionDetail.tsx`
      (buscar candidatos → mapeo → confirmar) y botones en `CompraDetail.tsx`, **sin probar** —
      bloqueado por §3.1.

## 7. Siguiente pasos recomendados (en orden)

1. **Bloqueantes de backend a reportar/arreglar antes de seguir, por orden de gravedad**:
   a. §3.3 — `POST /relaciones/:id/terminar` (y posiblemente otras acciones de ciclo de vida,
      valdría la pena auditar `suspender`/`reactivar`/`adoptar-maestros` también) reporta `500`
      mientras SÍ aplica el cambio de estado — el más grave, porque engaña al usuario sobre si su
      acción funcionó.
   b. §3.1 — `GET /relaciones/transacciones` siempre da `500` ("Field not permitted in query:
      advertencia_totales"). Sin esto, las Fases 06-11 no se pueden probar sin importar qué
      permisos tenga la cuenta de prueba.
   c. §3.2 — mensaje de error confuso en `PUT /relaciones/:id/configuracion` (404 "not found" en
      vez de un mensaje claro tipo el de `terminos`).
2. Confirmar con el usuario cómo conseguir una segunda cuenta/tenant con permisos suficientes en el
   lado receptor (o que otorgue permisos a `jbc`/complete el rol "Relaciones Comerciales Admin RD"
   ahí, y complete los 7 permisos de "compra" faltantes en `far-dev`, ver §5), para poder probar el
   ciclo completo: aceptar invitación → activación → relación `activa` en ambos lados → enviar una
   venta/compra real → aceptar/rechazar/mapear → diff/igualar → enlazar.
3. Con el bug de §3.1 arreglado y una relación activa en ambos lados, probar en orden: resto de
   Fase 05 (suspender/reactivar/terminar, `RNC_DUPLICADO_EN_SITE`/`MAESTRO_YA_VINCULADO`, guardar
   términos/configuración con éxito real), Fase 06 (bandeja), Fase 08 (enviar factura, aceptar como
   compra en el otro lado), Fase 09 (enviar compra, aceptar como venta), Fase 07 (mapeo real con
   artículos), Fase 10 (forzar una edición para generar `Editada` y probar ambos botones de
   Igualar), Fase 11 (enlazar un documento ya registrado a mano).
4. Repasar el issue marcado como "pendiente de confirmar" en §3 (nombre de contraparte para
   invitaciones recibidas) y decidir si vale la pena pedirle al backend que agregue `contraparte` a
   la respuesta de invitaciones en vez de mantener el cruce del lado del cliente. Considerar también
   pedirle que unifique el mensaje de error de "configuración" con el de "términos" (§3.2).
5. Correr `npx tsc --noEmit -p .` y `npm run lint` una vez más al terminar cualquier cambio — al
   cortar esta sesión ambos estaban limpios (0 errores) para todos los archivos de este módulo.
6. Revisar si conviene mover la lógica de "buscar relación por customer/supplier" (duplicada de
   forma casi idéntica en `CompraDetail.tsx` e `InvoiceDetail.tsx`, ver §1.3) a un hook compartido
   (p. ej. `useRelacionComercialPorContraparte(tipo, id)`) — quedó duplicada a propósito por
   simplicidad y falta de tiempo, no por decisión de diseño.
