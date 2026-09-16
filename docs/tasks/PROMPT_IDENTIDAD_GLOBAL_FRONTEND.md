# Prompt para agente de frontend — Identidad Global de Usuarios (login, sesión multi-tenant, invitaciones, 2FA, login con Google)

> **Para quien recibe este documento.** Esto reemplaza **por completo** el mecanismo de
> autenticación y de administración de usuarios que el frontend tiene hoy. No es una extensión
> menor: cambia qué es un "login" (ya no es "iniciar sesión en un tenant", es "iniciar sesión
> como una persona, que después elige en qué tenant trabajar"), cambia cómo se crean los
> usuarios (ya no se les fija una contraseña, se les invita), y agrega dos cosas que no
> existían: doble factor de autenticación (2FA) y login con Google. Todo lo descrito acá ya
> está **implementado, probado (628 tests unitarios + verificación manual contra ERPNext real)
> y desplegado** del lado del backend. No hay nada pendiente de negociar con el equipo de
> backend salvo lo que se marque explícitamente como excepción.
>
> **En el repo del frontend hay un archivo `openapi.json` con la documentación completa y
> actualizada del API** (se genera desde el backend con `GET /api/docs-json`, también navegable
> en Scalar en `/api/docs` del propio backend). **Regenerá tu cliente/tipos desde ese archivo
> antes de empezar** — ahí está el shape exacto y tipado de cada request/response. Este
> documento no reemplaza el spec: explica el **flujo de negocio completo**, qué pantalla hace
> qué llamada, en qué orden pasan las cosas, qué mostrar en cada estado, cómo se relacionan los
> tokens entre sí, y cómo manejar cada error. Si este documento y el `openapi.json` llegaran a
> diferir en el nombre exacto de un campo, **gana el `openapi.json`** — pero no debería pasar:
> todo lo escrito acá se extrajo directamente del código fuente ya mergeado (controllers,
> services, DTOs), no de un diseño preliminar.
>
> Documento relacionado que asumimos ya tenés implementado, **sin cambios en este documento**:
> `PROMPT_PERMISOS_FRONTEND.md` (contrato de permisos, `GET /me/permissions` → `data.acciones`,
> los dos niveles de permiso, etc.). Esta migración agrega **una sola cosa nueva** al catálogo
> de permisos: nada — las acciones `usuarios.crear`, `usuarios.listar`, `usuarios.editar` ya
> existían y siguen gateando exactamente las mismas pantallas que antes (invitar en vez de
> crear, pero el mismo botón). No hay acciones nuevas que agregar al catálogo de permisos.
>
> **Alcance de este documento:** todo lo que empieza en `/auth/*`, todo lo que empieza en
> `/me/*` salvo `/me/permissions*` (que ya cubre el documento de permisos), y el módulo
> `/usuarios/*` completo (que cambia de fondo: de "crear usuario con contraseña" a "invitar
> usuario").

---

## 0. Resumen ejecutivo — qué cambia y por qué

### 0.1 La idea central en una frase

**Antes:** un usuario existía *dentro* de un tenant (un `User` de ERPNext, con su contraseña
guardada en ESE site). Para trabajar en 3 empresas, alguien necesitaba 3 contraseñas
potencialmente distintas y hacía 3 logins distintos.

**Ahora:** un usuario es una persona única, global, con una sola contraseña, que tiene
membresías (invitaciones aceptadas) en uno o más tenants. Inicia sesión **una vez**, y después
puede cambiar de tenant sin volver a escribir la contraseña.

### 0.2 Tabla comparativa completa

| | Antes | Ahora |
|---|---|---|
| ¿Dónde vive la contraseña? | En cada site de ERPNext (una por tenant) | En el control-plane del backend, **una sola vez por persona**, cifrada con argon2id |
| ¿`POST /auth/login` necesita `X-Tenant`? | **Sí, obligatorio** — sin tenant no se podía ni intentar loguear | **No.** El login es global. `X-Tenant` (o `tenant` en el body) es opcional — solo sirve para elegir de una vez cuál tenant activar si el usuario tiene varios |
| ¿Qué devuelve un login exitoso? | Un JWT (`access_token`) atado a un tenant, sin más | Un `refresh_token` (la sesión, global) + un `access_token` (por tenant, puede venir `null`) + la lista **completa** de tenants a los que pertenece la persona |
| ¿Cómo se cambia de empresa? | Había que volver a hacer login completo con `X-Tenant` distinto (y la contraseña de nuevo) | `POST /auth/switch-tenant` — sin contraseña, con el `refresh_token` que ya se tiene |
| ¿Cómo se crea un usuario nuevo? | `POST /usuarios` con `password` (o modo "email" con link) | `POST /usuarios` **invita** — nunca lleva contraseña. El usuario la fija él mismo al aceptar la invitación |
| ¿Quién fija/edita el nombre y apellido de un usuario? | El administrador del tenant, en `PUT /usuarios/:email` | **Solo la propia persona**, en `PATCH /me/profile` — `PUT /usuarios/:email` ya NO acepta `firstName`/`lastName` en absoluto |
| ¿Hay "resetear contraseña" desde el admin del tenant? | Sí, `POST /usuarios/:email/reset-password` (mandaba link o fijaba directo) | **No existe más.** El usuario usa `POST /auth/forgot-password` (global) él mismo. Un admin como mucho puede reenviar la invitación (`POST /usuarios/:email/reinvitar`) si el usuario nunca la aceptó |
| ¿Doble factor de autenticación (2FA)? | No existía | Sí — TOTP (Google/Microsoft Authenticator) y/o código por correo, opcional, configurable en `/me/mfa/*` |
| ¿Login con Google? | No existía | Sí — solo para entrar a una cuenta ya existente, nunca auto-registra |
| Estados de un usuario en un tenant | Básicamente "activo" / "desactivado" (`enabled` 1/0) | 5 estados explícitos: `invited`, `accepted`, `rejected`, `revoked`, `suspended` (ver §6.1) |
| Resolución de tenant por dominio (`Host` sin `X-Tenant`) | Existía como fallback | **Eliminada.** Un solo dominio de frontend para todo el sistema — `X-Tenant` (o la ausencia de tenant en rutas globales) es la única fuente de verdad |

### 0.3 Qué NO cambia

- El contrato de **todos los demás módulos** (facturación, inventario, compras, POS, etc.) es
  exactamente igual: siguen esperando `Authorization: Bearer <access_token>` +
  `X-Tenant: <slug>` en cada request, y el `access_token` tiene la misma función de siempre
  (llevar las credenciales de ERPNext del usuario para ese tenant). Lo único que cambia es
  **cómo se consigue** ese `access_token`.
- El contrato de permisos (`GET /me/permissions`, `GET /me/permissions/:doctype/:name`) no
  cambia — ver `PROMPT_PERMISOS_FRONTEND.md`.
- Todos los endpoints de "Roles" (`GET /roles`, `GET /roles/perfiles`, `GET /roles/:name`,
  `POST/PUT/DELETE /roles`) no cambian — siguen siendo pura administración de ERPNext.
- Todo lo de sucursales/almacenes/PIN de administrador/código de carnet de un usuario
  (`GET/PUT /usuarios/:email/sucursales`, `GET /usuarios/:email/almacenes-permitidos`, el campo
  `adminPin`/`adminCode` de `PUT /usuarios/:email`) sigue funcionando **exactamente igual** —
  esos datos son de ERPNext, no de la identidad global.

### 0.4 Migración de datos — por qué el login "viejo" puede seguir funcionando un tiempo

El backend tiene un mecanismo de migración perezosa: si una persona que ya existía en ERPNext
antes de este cambio inicia sesión con su contraseña de **siempre**, el sistema la valida contra
ERPNext (como se hacía antes) y, si es correcta, la fija como su nueva contraseña global de una
vez, de forma transparente. **El frontend no tiene que hacer nada especial para esto** — es
exactamente el mismo `POST /auth/login` de siempre, con el mismo body. Solo mencionalo para que
no te sorprenda que un login "de toda la vida" funcione incluso para alguien que nunca pasó por
un flujo de invitación.

---

## 1. Modelo mental: los dos tokens y qué representa cada uno

Este es el concepto más importante de todo el documento. Léelo dos veces si hace falta.

### 1.1 `refresh_token` — la sesión (una por dispositivo/navegador)

- Representa **"esta persona inició sesión en este navegador"**. No tiene relación con ningún
  tenant.
- Es un string opaco (no es un JWT, no lo decodifiques ni intentes leer nada de él).
- Dura **30 días** (configurable en el backend). Es rotativo: cada vez que se usa para pedir un
  `access_token` nuevo (`POST /auth/refresh`), el backend **invalida el que se usó** y devuelve
  uno nuevo. Guardá siempre el más reciente y descartá el anterior.
- Se guarda **una sola vez**, típicamente al hacer login, y se reutiliza para:
  - Pedir un `access_token` nuevo cuando el actual expira (`POST /auth/refresh`).
  - Cambiar de tenant activo (`POST /auth/switch-tenant`).
  - Cerrar sesión (`POST /auth/logout`).
- **Nunca se manda a ningún endpoint de negocio.** Solo lo ven los 4 endpoints de `/auth/*` que
  lo piden explícitamente en el body (`refresh`, `logout`, `switch-tenant`, y no hace falta en
  ningún otro lado).

### 1.2 `access_token` — el JWT de siempre, pero ahora explícitamente "por tenant activo"

- Es el mismo JWT que el frontend ya conoce: se manda como
  `Authorization: Bearer <access_token>` en **todos** los endpoints de negocio, junto con
  `X-Tenant: <slug>`.
- Dura **8 horas** (sin cambios respecto a antes).
- Cada `access_token` está atado a **un solo tenant** — el que estaba activo cuando se emitió. Si
  la persona pertenece a 3 empresas y quiere trabajar en las 3 a la vez (pestañas distintas, o un
  selector de empresa arriba), necesita **un `access_token` por cada una**, obtenido con
  `POST /auth/switch-tenant` (§4).
- **Puede venir `null`.** Esto pasa cuando el login no pudo determinar automáticamente qué
  tenant activar (por ejemplo, la persona pertenece a 2 empresas y ninguna está marcada como
  "por defecto"). En ese caso el frontend debe mostrar un selector de tenant en vez de entrar
  directo a la aplicación (ver §3.5).

### 1.3 Diagrama de la relación entre ambos

```
                    ┌─────────────────────────────────────────┐
                    │   refresh_token (una sesión, 30 días)    │
                    │   "María inició sesión en este Chrome"   │
                    └───────────────┬───────────────────────────┘
                                    │
              ┌─────────────────────┼─────────────────────┐
              │                     │                     │
     access_token (Tenant A)  access_token (Tenant B)  access_token (Tenant C)
        8h, solo Tenant A        8h, solo Tenant B        8h, solo Tenant C
```

Con el **mismo** `refresh_token` se pueden pedir tantos `access_token` como tenants tenga la
persona, uno por vez, sin volver a pedir contraseña. Es la forma en la que "inicia sesión en
todos los tenants" sin que el backend tenga que emitir 10 credenciales de ERPNext de golpe en un
solo login (eso sería lento si la persona tiene muchas empresas).

### 1.4 Recomendación de almacenamiento en el cliente

Esto es una decisión de arquitectura del frontend, pero la recomendación concreta es:

- **`refresh_token`**: en `localStorage` (o el mecanismo de storage persistente que ya use el
  proyecto) bajo una clave propia, ej. `auth.refreshToken`. Tiene que sobrevivir un refresh de
  página (F5) y el cierre/reapertura del navegador — es lo que le evita a la persona re-loguearse
  cada 8 horas.
- **`access_token` (y el `tenant` activo asociado)**: en memoria del store de la app (Redux/
  Zustand/Context/lo que use el proyecto), **no en `localStorage` como fuente de verdad** — se
  puede volver a pedir con `POST /auth/refresh` en cuanto la app arranca si no hay uno vigente en
  memoria. Si el proyecto ya guarda el `access_token` actual en `localStorage` por conveniencia
  (para no perder la sesión visual en un F5), está bien, pero al arrancar la app **siempre** hay
  que validar/refrescar contra el backend antes de confiar en él — no asumas que un token leído
  de storage sigue vivo.
- **Si el frontend soporta multi-tenant simultáneo** (varias pestañas, cada una en una empresa
  distinta, o un selector de empresa que mantiene el estado de más de una a la vez): el
  `access_token` activo debe vivir en un estado por pestaña/contexto, no global — cada pestaña
  puede tener un tenant distinto activo con el mismo `refresh_token` de fondo.

---

## 2. Contrato de la API — lo que se repite en todos los endpoints

Todas las respuestas del BFF vienen envueltas, sin cambios respecto a lo que ya conocés:

**Éxito:**
```json
{ "success": true, "data": { ... } }
```

**Error:**
```json
{
  "success": false,
  "error": {
    "code": "UNAUTHORIZED",
    "message": "Usuario o contraseña incorrectos",
    "statusCode": 401
  }
}
```

### 2.1 Qué headers lleva cada grupo de endpoints

| Grupo | `Authorization: Bearer` | `X-Tenant` |
|---|---|---|
| `POST /auth/login`, `/auth/mfa/*`, `/auth/refresh`, `/auth/logout`, `/auth/switch-tenant`, `/auth/invitations/*`, `/auth/oauth/*`, `/auth/forgot-password`, `/auth/reset-password` | **No** — ninguno de estos requiere sesión previa | Opcional. Si se manda en `/auth/login`, tiene prioridad sobre `tenant` en el body (ver §3.1) |
| `GET/PATCH /me/profile`, `POST /me/password`, todo `/me/mfa/*`, todo `/me/identities*` | **Sí**, el `access_token` vigente | **Sí, obligatorio.** Aunque estos datos no son "de un tenant", el guard del backend sigue exigiendo que `X-Tenant` coincida con el tenant que quedó grabado dentro del `access_token` al emitirlo. Mandá el tenant activo actual, el mismo que usás para cualquier otro endpoint de negocio en esa pestaña |
| `POST /auth/verify-admin-pin`, `GET /auth/admin-pin-log` | Sí | Sí (sin cambios respecto a antes) |
| Todo `/usuarios/*` | Sí | Sí (sin cambios respecto a antes) |

**Importante sobre `/me/*`:** no existe un modo "sin tenant" para consultar tu propio perfil. Si
tu `access_token` es `null` (§1.2, §3.5) todavía no podés llamar a ningún `/me/*` — primero hay
que resolver un tenant activo (con `switch-tenant` o completando una invitación) para tener un
`access_token` con el que autenticar esas llamadas.

---

## 3. Login — flujo completo, paso a paso

### 3.1 `POST /auth/login`

```jsonc
// Request
POST /api/v1/auth/login
Content-Type: application/json

{
  "email": "maria@empresa.com",
  "password": "MiClave2026!",
  "tenant": "acme"           // opcional — ver abajo
}
```

- `tenant` es **opcional**. Si tu app ya sabe en qué tenant quiere entrar la persona (por
  ejemplo, viene de un link específico de esa empresa, o hay un selector de tenant ANTES del
  login en tu UI), mandalo. Si no lo sabés, omitilo — el backend decide con el algoritmo de
  §3.4.
- Si el header `X-Tenant` viene en el request, **tiene prioridad sobre `tenant` del body** —
  no mandes las dos cosas con valores distintos, es confuso. Lo normal es: **no mandes
  `X-Tenant` en el login** (todavía no hay un `access_token`, no tiene sentido) y usá el
  campo `tenant` del body si hace falta.
- No hay validación de formato de contraseña en el login (obviamente sí la hay al fijarla,
  ver §7 y §9).

### 3.2 Tres respuestas posibles

**(a) Credenciales inválidas, o cuenta sin contraseña fijada todavía:**

```json
// 401
{
  "success": false,
  "error": { "code": "UNAUTHORIZED", "message": "Usuario o contraseña incorrectos", "statusCode": 401 }
}
```

Este es el mensaje **genérico anti-enumeración**: se usa exactamente igual si el email no
existe, si la contraseña es incorrecta, o si la persona todavía no aceptó ninguna invitación (y
por lo tanto no tiene contraseña fijada). **No intentes distinguir estos casos en el frontend**
— el backend lo hace a propósito para no revelar si un email está o no registrado.

**(b) Cuenta bloqueada por demasiados intentos fallidos:**

```json
// 401
{
  "success": false,
  "error": {
    "code": "ACCOUNT_LOCKED",
    "message": "Cuenta bloqueada temporalmente por demasiados intentos fallidos.",
    "statusCode": 401
  }
}
```

Se activa a partir del 5º intento fallido consecutivo, con un backoff creciente (1, 2, 4, 8, 15
minutos). Mostrá este mensaje tal cual — no hace falta que calcules ni muestres cuánto falta,
el backend no expone ese dato; simplemente sugerí "intente de nuevo en unos minutos".

**(c) Credenciales correctas, pero la cuenta tiene 2FA confirmado — no hay tokens todavía:**

```json
// 200 (¡ojo! no es 401, la contraseña SÍ era correcta)
{
  "success": true,
  "data": {
    "mfaRequired": true,
    "mfaToken": "f8a1b2c3...(token opaco de un solo uso)...",
    "factors": [
      { "id": "a1b2c3d4-...", "type": "totp", "label": "iPhone de María" }
    ]
  }
}
```

Ver §5 para el flujo completo de 2FA. **No hay `refresh_token` ni `access_token` en esta
respuesta** — hay que completar el segundo paso primero.

**(d) Login exitoso (sin 2FA, o ya pasado el paso de 2FA) — la respuesta "completa":**

```json
{
  "success": true,
  "data": {
    "refresh_token": "9f8e7d6c...(guardar para refresh/logout/switch-tenant)...",
    "access_token": "eyJhbGciOi...(JWT, o null — ver abajo)...",
    "token_type": "Bearer",
    "expires_in": 28800,
    "user": {
      "id": "3f2e1d0c-...",
      "email": "maria@empresa.com",
      "fullName": "María González",
      "firstName": "María",
      "lastName": "González"
    },
    "tenants": [
      {
        "slug": "acme",
        "name": "ACME SRL",
        "vertical": "general",
        "status": "accepted",
        "isDefault": true,
        "roles": ["Ventas RD"]
      },
      {
        "slug": "beta",
        "name": "Beta SA",
        "vertical": "farmacia",
        "status": "invited",
        "isDefault": false,
        "roles": []
      }
    ],
    "tenant": {
      "slug": "acme",
      "siteUrl": "http://acme.dev:8000",
      "id": "8a7b6c5d-...",
      "vertical": "general"
    }
  }
}
```

Este **mismo shape exacto** (`AuthResult`) lo devuelven, además de `/auth/login`:
`/auth/mfa/verify`, `/auth/invitations/:token/accept`, `/auth/oauth/exchange` y
`/auth/reset-password`. Un solo componente/función de tu store de auth puede procesar la
respuesta de los 5 endpoints exactamente igual.

### 3.3 Qué es cada campo de `tenants[]` — **siempre viene la lista completa**

Esta lista **no filtra nada** — trae TODAS las membresías de la persona, sin importar su estado.
Es lo que necesitás para pintar un selector de "cambiar de empresa" o una pantalla de
"invitaciones pendientes".

| Campo | Qué es |
|---|---|
| `slug` | Identificador del tenant — es lo que se manda como `X-Tenant` en cualquier request |
| `name` | Nombre para mostrar ("ACME SRL") |
| `vertical` | `"general"` o `"farmacia"` — igual que siempre, para las diferencias de UI por vertical |
| `status` | El estado de **la membresía**, uno de `invited`/`accepted`/`rejected`/`revoked`/`suspended` — ver tabla completa en §6.1. **Solo `accepted` da acceso real** |
| `isDefault` | `true` en como mucho una fila — el tenant que se activa automáticamente si no se pide ninguno explícito |
| `roles` | Los roles/perfiles de ERPNext asignados en ese tenant (para mostrar, no para gatear UI — seguí usando `GET /me/permissions` para eso) |

**Qué mostrar en la UI con esta lista:**
- Si hay **una sola fila `accepted`**: no hace falta selector, se entra directo (y de hecho
  `access_token`/`tenant` ya van a venir resueltos automáticamente, ver §3.4).
- Si hay **más de una fila `accepted`**: mostrá un selector de empresa (o entrá directo a la
  marcada `isDefault`, con la opción de cambiar después vía `switch-tenant`).
- Las filas `invited` son invitaciones pendientes de aceptar — mostralas en algún lado (un banner,
  una sección "Invitaciones pendientes") con un link para revisarlas. **Ojo:** una invitación
  pendiente se acepta con el **token que llegó por correo** (`/auth/invitations/:token/accept`,
  §7), no hay forma de "aceptar desde acá" sin ese token — el login no te da el token de la
  invitación, solo te informa que existe.
- Las filas `rejected`/`revoked`/`suspended` son historial — mostralas atenuadas si las mostrás
  en absoluto; no dan acceso.

### 3.4 Cómo decide el backend cuál tenant activar automáticamente

Este es el algoritmo exacto de `resolveActiveMembership` — replicarlo te ayuda a predecir el
comportamiento sin sorpresas:

1. Si se pidió un `tenant` explícito (header `X-Tenant` o campo `tenant` del body) **y** la
   persona tiene una membresía `accepted` con ese slug → se activa ese.
2. Si se pidió un `tenant` explícito pero la persona **no** tiene una membresía `accepted` con
   ese slug (no es miembro, o lo es pero en otro estado) → **no se activa ningún tenant**
   (`access_token: null`), aunque el login en sí fue exitoso. No es un error — simplemente esa
   persona no puede entrar a ESE tenant puntual todavía.
3. Si no se pidió ningún `tenant` → se busca la membresía marcada `isDefault: true` entre las
   `accepted`. Si existe, se activa esa.
4. Si no hay ninguna marcada `isDefault` pero hay **exactamente una** membresía `accepted` → se
   activa esa (caso típico: la persona solo pertenece a una empresa).
5. Si hay **cero** membresías `accepted`, o **más de una** sin ninguna marcada `isDefault` →
   `access_token: null`. El frontend debe manejar este caso (§3.5).

### 3.5 Qué hacer cuando `access_token` es `null`

No es un error — es un estado legítimo que el frontend tiene que contemplar:

- Guardá igual el `refresh_token` (la sesión de la persona es válida).
- Guardá `data.user` y `data.tenants` para la UI.
- Mostrá una pantalla de **"elegí una empresa"** listando las filas de `tenants` con
  `status: "accepted"` (si hay más de una, es el caso típico de esta rama) — al elegir una,
  llamá a `POST /auth/switch-tenant` (§4) con ese slug para conseguir el `access_token`.
- Si **no hay ninguna fila `accepted`** (todas son `invited`/`rejected`/etc.), no hay ninguna
  empresa a la que entrar todavía — mostrá la pantalla de "invitaciones pendientes" (§3.3) en vez
  de un selector, porque no hay nada que "seleccionar" hasta que se acepte una.

### 3.6 Errores de `POST /auth/login`

| HTTP | Código | Cuándo |
|---|---|---|
| 401 | `UNAUTHORIZED` | Email inexistente, contraseña incorrecta, o cuenta sin contraseña fijada (anti-enumeración, ver §3.2a) |
| 401 | `ACCOUNT_LOCKED` | 5+ intentos fallidos consecutivos (§3.2b) |
| 400 | validación estándar de `class-validator` | `email`/`password` vacíos o faltantes |

---

## 4. Refresh, logout y cambio de tenant

### 4.1 `POST /auth/refresh` — renovar el `access_token` cuando expira

```jsonc
// Request
{ "refreshToken": "9f8e7d6c..." }
```

```jsonc
// Response
{
  "success": true,
  "data": {
    "refresh_token": "AB12CD34...(NUEVO — reemplazá el que tenías guardado por este)",
    "access_token": "eyJhbGciOi...(o null, mismo criterio de §3.4/§3.5 pero SIN tenant pedido)",
    "token_type": "Bearer",
    "expires_in": 28800,
    "tenant": { "slug": "acme", "siteUrl": "...", "id": "...", "vertical": "general" }
  }
}
```

**Reglas importantes:**
- El `refresh_token` de la respuesta **siempre es distinto** al que mandaste (rotación). Guardá
  el nuevo y descartá el viejo — si volvés a usar el viejo por error, ver la nota de seguridad
  de abajo.
- El `access_token` nuevo se resuelve para el **mismo tenant que estaba activo antes** (si la
  persona pertenece a varios, no hace falta volver a elegir cada vez que se refresca — el
  backend no tiene forma de saber "cuál pestaña" está pidiendo el refresh, así que usa el mismo
  criterio de default que el login sin `tenant` explícito, §3.4 puntos 3-5). **Si tu app maneja
  varios tenants en simultáneo en pestañas distintas**, cada pestaña necesita gestionar su propio
  ciclo de refresh y, después de refrescar, verificar con `switch-tenant` si el tenant activo que
  volvió no es el que esa pestaña necesita.
- Llamalo desde tu interceptor HTTP habitual, cuando una llamada de negocio devuelva 401 por
  token expirado — mismo patrón que ya tenías con el JWT único de antes.

**⚠️ Seguridad — detección de robo de token:** si se usa un `refreshToken` que **ya fue
consumido antes** (por ejemplo, dos pestañas intentaron refrescar al mismo tiempo, o alguien
capturó un token viejo), el backend interpreta esto como una posible sesión comprometida y
**revoca automáticamente toda la sesión** (todos los tokens derivados de esa cadena). La
respuesta es:

```jsonc
// 401
{ "success": false, "error": { "code": "UNAUTHORIZED", "message": "Sesión inválida", "statusCode": 401 } }
```

Si tu interceptor ve este error específico en `/auth/refresh`, **no reintentes** — hay que forzar
un login completo de nuevo (limpiar todo el estado de auth y redirigir a la pantalla de login).
Para evitar que esto pase por una carrera de tu propio código (dos llamadas simultáneas
disparando refresh a la vez), poné una sola promesa "en vuelo" para el refresh (patrón mutex /
single-flight) en tu interceptor — es el mismo patrón que ya se necesita con cualquier esquema de
refresh token, no es nuevo de este cambio.

### 4.2 `POST /auth/logout`

```jsonc
// Request
{ "refreshToken": "9f8e7d6c...", "all": false }
```

- `all: false` (o el campo omitido) — cierra **esta** sesión únicamente (este navegador/
  dispositivo).
- `all: true` — cierra **todas** las sesiones activas de la persona, en todos sus dispositivos.
  Usalo para un botón tipo "Cerrar sesión en todos los dispositivos" si tu UI lo ofrece (por
  ejemplo, dentro de la pantalla de perfil/seguridad).

```jsonc
// Response
{ "success": true, "data": { "message": "Sesión cerrada" } }
```

Después de un logout exitoso: limpiá `refresh_token`, `access_token`, y todo el estado de
`user`/`tenants` del store, y redirigí a la pantalla de login. No hace falta ningún otro
endpoint — el `access_token` que ya tenías en memoria simplemente dejará de servir en la próxima
llamada (el backend también invalida la sesión asociada por su `sid` interno, así que ni
esperar a que expiren las 8 horas).

### 4.3 `POST /auth/switch-tenant` — cambiar de empresa sin re-loguear

```jsonc
// Request
{ "refreshToken": "9f8e7d6c...", "tenant": "beta" }
```

```jsonc
// Response (200)
{
  "success": true,
  "data": {
    "access_token": "eyJhbGciOi...",
    "token_type": "Bearer",
    "expires_in": 28800,
    "tenant": { "slug": "beta", "siteUrl": "http://beta.dev:8000", "id": "...", "vertical": "farmacia" }
  }
}
```

- Este endpoint **no rota el `refresh_token`** — seguís usando el mismo. Solo devuelve un
  `access_token` nuevo, para OTRO tenant.
- Usalo desde tu selector de empresa (el mismo widget de "cambiar de tenant" que probablemente ya
  existía en la app, si soportaba multi-tenant de algún modo antes) y desde la pantalla de §3.5.
- **Errores posibles, con código específico:**

| HTTP | Código | Mensaje | Cuándo |
|---|---|---|---|
| 401 | `UNAUTHORIZED` | `Sesión inválida o expirada` | El `refreshToken` no es válido, ya fue revocado, o expiró |
| 401 | `UNAUTHORIZED` | `Usuario no encontrado` | Caso de borde interno, no debería verse en operación normal |
| 403 | `TENANT_ACCESS_DENIED` | `No tiene una membresía activa en el tenant "beta".` | El slug pedido no tiene una membresía `accepted` para esta persona — no lo mostraste bien filtrado en tu selector, o alguien lo perdió (revocado) mientras tenía la sesión abierta |
| 403 | `TENANT_NOT_ACTIVE` | `El tenant "beta" no está activo.` | El tenant en sí está suspendido/cancelado a nivel de plataforma (nada que ver con la membresía de la persona) |

Ante un `TENANT_ACCESS_DENIED`/`TENANT_NOT_ACTIVE`, mostrá el mensaje tal cual y quitá esa opción
del selector (volvé a pedir `POST /auth/login` o refrescá la lista de tenants si el usuario
insiste, por si el estado cambió).

---

## 5. Doble factor de autenticación (2FA) — configuración y uso en el login

El 2FA es **de la persona**, no del tenant — se configura una vez en el perfil y aplica en el
login sin importar a qué empresa se esté entrando.

### 5.1 Login con 2FA activo — el segundo paso

Retomando §3.2(c): cuando `POST /auth/login` responde `mfaRequired: true`, mostrá una pantalla
(o modal) pidiendo el código, y llamá:

```jsonc
// POST /auth/mfa/verify
{
  "mfaToken": "f8a1b2c3...",       // el mismo que vino en el login
  "factorId": "a1b2c3d4-...",      // opcional — solo hace falta si `factors` traía más de uno
  "code": "123456",                // el código TOTP de 6 dígitos, el de email, o un código de recuperación
  "tenant": "acme"                 // opcional — mandá el MISMO valor que mandaste en el login original, si mandaste alguno
}
```

- Si el login original NO mandó `tenant`, tampoco lo mandes acá.
- `code` acepta **tres formatos distintos** sin que el frontend tenga que distinguirlos:
  un código TOTP de 6 dígitos, un código enviado por correo (también 6 dígitos), o uno de los 10
  códigos de recuperación de un solo uso (formato `XXXXX-XXXXX`, ver §5.4). El backend prueba
  primero si es un código de recuperación válido; si no, lo valida contra el factor
  correspondiente. Tu UI puede tener un solo campo de texto para "código", sin necesidad de un
  campo separado para "código de recuperación" (aunque podés ofrecerlo como un link/toggle
  "¿No tenés acceso a tu segundo factor? Usar un código de recuperación" que apunte al mismo
  campo).
- La respuesta exitosa es el mismo `AuthResult` completo de §3.2(d) — mismo manejo que un login
  normal desde ahí en adelante.
- **Errores:**

| HTTP | Mensaje | Cuándo |
|---|---|---|
| 401 | `Código inválido` | El código no matchea (ni como TOTP/email, ni como recuperación) |
| 401 | `Demasiados intentos — inicie sesión de nuevo para recibir un nuevo código.` | 5 intentos fallidos sobre el mismo `mfaToken` — hay que volver a `POST /auth/login` desde cero, no hay forma de "reintentar" este mismo desafío |
| 401 | `Desafío de verificación inválido o ya usado` | El `mfaToken` ya se usó, o nunca existió |
| 401 | `Desafío de verificación expirado — inicie sesión de nuevo` | Pasaron más de 5 minutos desde el login original |

Ante cualquiera de los 3 últimos, la única salida es volver a la pantalla de login (no hay
manera de "refrescar" un `mfaToken" vencido — hay que generar uno nuevo con un login nuevo).

### 5.2 Reenviar el código por correo

Solo tiene sentido si el factor activo de la persona es `type: "email"` (ver `factors[]` de la
respuesta del login, §3.2c):

```jsonc
// POST /auth/mfa/resend
{ "mfaToken": "f8a1b2c3..." }
```

```jsonc
{ "success": true, "data": { "message": "Código reenviado" } }
```

Mostrá un botón "Reenviar código" con un cooldown de UI (ej. deshabilitado 30-60 segundos) para
que no lo golpeen a repetición — el backend no tiene un límite de tasa específico para este
endpoint más allá del rate limiting global de la API.

### 5.3 Configurar 2FA — pantalla de "Seguridad" en el perfil del usuario

Necesitás una pantalla nueva (probablemente dentro de "Mi perfil" / "Configuración de cuenta")
con dos secciones: **factores activos** y **alta de un factor nuevo**.

#### 5.3.1 Listar mis factores

```jsonc
// GET /me/mfa/factors
{
  "success": true,
  "data": [
    {
      "id": "a1b2c3d4-...",
      "type": "totp",
      "label": "iPhone de María",
      "confirmed": true,
      "isPreferred": true
    }
  ]
}
```

- `confirmed: false` significa que alguien empezó el alta de TOTP (§5.3.2) pero nunca lo
  confirmó (§5.3.3) — no cuenta para el login. Podés mostrarlo como "pendiente de confirmar" con
  la opción de continuar el alta o descartarlo (`DELETE /me/mfa/:factorId`).
- `isPreferred` marca cuál factor se usa por defecto si hay más de uno confirmado (hoy el
  backend lo asigna automáticamente al primero que se confirma — no hay un endpoint para
  cambiarlo manualmente; si hace falta, es un pedido aparte).

#### 5.3.2 Alta de TOTP (Google Authenticator / Microsoft Authenticator / cualquier app compatible)

```jsonc
// POST /me/mfa/totp
{ "label": "iPhone de María" }   // opcional, para identificar el dispositivo en la lista
```

```jsonc
{
  "success": true,
  "data": {
    "secret": "JBSWY3DPEHPK3PXP",
    "otpauthUrl": "otpauth://totp/GenSuite:maria%40empresa.com?secret=JBSWY3DPEHPK3PXP&issuer=GenSuite"
  }
}
```

- Renderizá `otpauthUrl` como un **código QR** (cualquier librería de QR del lado del cliente,
  ej. `qrcode.react` o equivalente — no hace falta pedirle nada más al backend) para que la
  persona lo escanee con su app de autenticación.
- Mostrá también `secret` como texto plano, con un botón de copiar, para quien prefiera
  ingresarlo a mano en vez de escanear el QR (caso típico: setups remotos, algunos gestores de
  contraseñas).
- Este paso **no activa nada todavía** — hace falta confirmar con un código real (§5.3.3) antes
  de que este factor cuente para el login.

#### 5.3.3 Confirmar el alta — con esto se activa de verdad

```jsonc
// POST /me/mfa/totp/confirm
{ "code": "123456" }   // el código que la app de autenticación está mostrando en este momento
```

```jsonc
{
  "success": true,
  "data": {
    "message": "TOTP confirmado",
    "recoveryCodes": [
      "8K3M2-P9X4Q", "R7T1Y-B5N8W", "... (10 códigos en total) ..."
    ],
    "recoveryCodesWarning": "Guarde estos códigos en un lugar seguro — es la ÚNICA vez que se muestran."
  }
}
```

**Esto es crítico:** `recoveryCodes` viene **una sola vez**, en esta respuesta, y nunca más se
puede volver a pedir (el backend solo guarda su hash, no puede mostrarlos de nuevo). La UI
**debe**:
- Mostrar los 10 códigos en una pantalla que **no se cierre por accidente** (no un toast, no un
  modal que se cierra con un clic afuera).
- Ofrecer copiarlos/descargarlos (un botón "Copiar todos" y/o "Descargar como archivo .txt" es
  el mínimo razonable).
- Exigir una confirmación explícita antes de continuar (ej. un checkbox "Ya guardé estos
  códigos" antes de habilitar el botón "Listo"), porque perderlos significa que si la persona
  pierde el teléfono, pierde el acceso a su cuenta (hasta que un administrador... en realidad
  **no hay** un mecanismo de "resetear 2FA de otro usuario" en este backend todavía — perder
  el teléfono Y los códigos de recuperación es una situación sin salida automática hoy. Comunicá
  esto con la seriedad que amerita en el texto de la UI).

**Errores:**

| HTTP | Mensaje | Cuándo |
|---|---|---|
| 400 | `No hay un registro de TOTP pendiente de confirmar` | Se llamó a `confirm` sin haber llamado antes a `POST /me/mfa/totp` (o ya se descartó) |
| 401 | `Código inválido` | El código de 6 dígitos no matchea contra el secreto (puede ser reloj desincronizado del teléfono — el backend tolera ±30s, si sigue fallando revisá la hora del dispositivo) |

#### 5.3.4 Activar 2FA por correo (alternativa/complemento a TOTP)

```jsonc
// POST /me/mfa/email   (sin body)
```

```jsonc
{ "success": true, "data": { "message": "2FA por correo activado" } }
```

Este factor **no requiere confirmación previa** (a diferencia de TOTP) — queda activo de
inmediato. Es la opción para quien no quiere instalar una app de autenticación, aunque es
estrictamente menos segura (depende de que el correo no esté comprometido).

#### 5.3.5 Eliminar un factor

```jsonc
// DELETE /me/mfa/:factorId
```

```jsonc
{ "success": true, "data": { "message": "Factor eliminado" } }
```

No pide confirmación de contraseña en este endpoint puntual (a diferencia de cambiar la
contraseña, §7.2) — poné vos una confirmación de UI ("¿Seguro que querés eliminar este factor?")
antes de llamarlo, especialmente si es el único factor activo (eso desactivaría el 2FA por
completo para esa persona).

### 5.4 Resumen de la pantalla de Seguridad — checklist de UI

- [ ] Lista de factores (`GET /me/mfa/factors`) con badge de "confirmado"/"pendiente".
- [ ] Botón "Agregar autenticador" → QR + secreto en texto (§5.3.2) → campo de código →
      confirmar (§5.3.3) → pantalla de códigos de recuperación con confirmación explícita.
- [ ] Botón "Activar 2FA por correo" (§5.3.4), sin flujo de confirmación adicional.
- [ ] Botón eliminar por factor, con confirmación de UI.
- [ ] Considerar mostrar, en algún lado accesible, un botón "Ver mis cuentas vinculadas" que
      lleve a la sección de §8 (Google) — es la misma pantalla de "Seguridad" en la mayoría de
      los diseños típicos.

---

## 6. Módulo Usuarios — de "crear con contraseña" a "invitar"

Esta es la pantalla de administración de usuarios de un tenant (probablemente ya existe en el
frontend con una tabla + un botón "Nuevo usuario" + un formulario de edición). Cambia el flujo de
alta por completo; el resto (roles, sucursales, almacenes, PIN, código de carnet) sigue igual.

### 6.1 Los 5 estados de una membresía — tabla completa con transiciones

```
                 ┌──────────── re-invitar ─────────────┐
                 ▼                                     │
(nada) ──invitar──► INVITED ──acepta──► ACCEPTED ──tenant revoca──► REVOKED
                     │                     │                          │
                     │ rechaza             │ tenant suspende          │
                     ▼                     ▼                          │
                  REJECTED ◄───────── SUSPENDED ──reactiva──► ACCEPTED│
                     │                                                │
                     └──────────── re-invitar ────────────────────────┘
```

| Estado | Qué significa | ¿Puede entrar al tenant? | Quién lo puso en este estado | Acciones disponibles desde acá |
|---|---|---|---|---|
| `invited` | Se envió la invitación, la persona todavía no respondió | No | El tenant (al invitar) | Reenviar invitación |
| `accepted` | La persona aceptó — es un miembro activo | **Sí** | La propia persona (al aceptar) | Editar roles, revocar, suspender |
| `rejected` | La persona **rechazó** explícitamente la invitación | No | La propia persona | Reenviar invitación (vuelve a `invited`) |
| `revoked` | El tenant le **quitó el acceso** después de que ya lo tenía | No | Un administrador del tenant | Reenviar invitación (vuelve a `invited`) |
| `suspended` | Acceso **temporalmente** bloqueado (no es un rechazo ni una expulsión definitiva) | No | Un administrador del tenant | Reactivar (vuelve directo a `accepted`, sin pasar por invitación de nuevo) |

**La distinción entre `rejected`/`revoked`/`suspended` es intencional y hay que respetarla en la
UI** (por ejemplo, con colores/iconos distintos en la tabla de usuarios):
- `rejected` = decisión de la persona.
- `revoked` = decisión del tenant, definitiva hasta una nueva invitación.
- `suspended` = decisión del tenant, pensada como temporal — por eso tiene un camino directo de
  vuelta (`reactivar`) sin pasar de nuevo por todo el ciclo de invitación.

### 6.2 `GET /usuarios/lookup` — buscar antes de invitar (paso previo obligatorio en la UI)

Antes de mostrar el formulario de "invitar usuario nuevo", tu UI debería primero preguntar el
email y consultar si esa persona ya existe en el sistema:

```
GET /usuarios/lookup?email=maria@empresa.com
```

**Caso 1 — el email no existe en ningún lado del sistema:**
```json
{ "success": true, "data": { "exists": false } }
```
→ Mostrá el formulario completo pidiendo `firstName` (obligatorio) y `lastName`/`mobileNo`
(opcionales) además del email.

**Caso 2 — el email ya existe (es una persona real en el sistema, en otro tenant o en ninguno
activo todavía) y NO es miembro de este tenant:**
```json
{
  "success": true,
  "data": {
    "exists": true,
    "firstName": "María",
    "lastName": "González",
    "phone": "809-555-0100",
    "alreadyMember": false,
    "membershipStatus": null
  }
}
```
→ Mostrá `firstName`/`lastName`/`phone` **en modo solo-lectura** (no editable) — el nombre es de
la persona, no lo puede fijar este tenant. Dejá que el administrador solo elija roles/perfiles y
confirme la invitación.

**Caso 3 — el email ya existe y YA es miembro activo de este tenant:**
```json
{
  "success": true,
  "data": {
    "exists": true,
    "firstName": "María",
    "lastName": "González",
    "phone": "809-555-0100",
    "alreadyMember": true,
    "membershipStatus": "accepted"
  }
}
```
→ Bloqueá el alta con un mensaje ("Este usuario ya es miembro de este tenant") y, si tiene
sentido en tu UX, ofrecé un link directo a su ficha existente en vez de dejar seguir con el
formulario de invitación.

`membershipStatus` puede venir también en `invited`/`rejected`/`revoked`/`suspended` si la
persona tuvo alguna relación previa con este tenant que no llegó a `accepted` — en esos casos
`alreadyMember` es `false` (solo es `true` para `accepted`) y podés sugerir usar
`POST /usuarios/:email/reinvitar` en vez de una invitación nueva desde cero, si ya existe una fila
(tu UI puede simplemente intentar `POST /usuarios` igual — el backend lo maneja como
"re-invitación" automáticamente, ver §6.3, así que no es estrictamente necesario que differencies
esto en el cliente).

**Nota de seguridad de este endpoint:** deliberadamente **nunca** devuelve en qué otros tenants
está esa persona — solo nombre/apellido/teléfono y el estado respecto a ESTE tenant. No intentes
inferir ni pedir esa información por otra vía.

### 6.3 `POST /usuarios` — invitar

```jsonc
// Caso: usuario nuevo (no existía, GET /usuarios/lookup dio exists:false)
{
  "email": "maria@empresa.com",
  "firstName": "María",
  "lastName": "González",
  "mobileNo": "809-555-0100",
  "perfiles": ["Ventas RD"],
  "adminCode": "EMP-00231"
}
```

```jsonc
// Caso: usuario ya existente (GET /usuarios/lookup dio exists:true, alreadyMember:false)
// firstName/lastName se IGNORAN si se mandan — no hace falta ni conviene mandarlos
{
  "email": "maria@empresa.com",
  "perfiles": ["Ventas RD"]
}
```

- `perfiles` **o** `roles` (no ambos — mismo criterio de siempre, ver la validación existente de
  "perfiles son autoritativos"). Al menos uno de los dos es obligatorio.
- Si mandás `firstName` para un email que YA existe, el backend simplemente lo ignora (no da
  error, pero tampoco tiene efecto) — igual, no lo mandes, para no confundir a quien lea el
  payload en el network tab.
- Si el email **no existe** y no mandás `firstName`, el backend responde:
  ```json
  { "success": false, "error": { "code": "BAD_REQUEST", "message": "El correo no existe todavía — envíe `firstName` (y opcionalmente `lastName`) para crear la cuenta.", "statusCode": 400 } }
  ```

**Respuesta exitosa:**
```jsonc
{
  "success": true,
  "data": {
    "email": "maria@empresa.com",
    "firstName": "María",
    "lastName": "González",
    "status": "invited",
    "purpose": "registration"   // o "invitation" — ver abajo
  }
}
```

`purpose` te dice qué tipo de correo se le mandó a la persona (informativo, no necesitás hacer
nada distinto en la UI del tenant por esto — es la persona invitada quien ve la diferencia en su
propio correo, ver §7):
- `"registration"` — la persona es nueva en el sistema, el correo la invita a **confirmar y
  fijar su contraseña**.
- `"invitation"` — la persona ya tenía cuenta (en otro tenant), el correo solo le pide
  **confirmar o rechazar** — no toca su contraseña existente.

**Error si ya es miembro activo:**
```json
{ "success": false, "error": { "code": "CONFLICT", "message": "El usuario 'maria@empresa.com' ya es miembro activo de este tenant", "statusCode": 409 } }
```
No debería pasar nunca si hiciste el `lookup` primero y respetaste `alreadyMember`.

### 6.4 `POST /usuarios/:email/reinvitar` — reenviar (invalida el link anterior)

Para un usuario en estado `invited`/`rejected`/`revoked`/`suspended` (cualquiera que no sea
`accepted`): reenvía el correo con un **link nuevo** (el anterior queda invalidado, aunque no lo
haya usado nadie).

```jsonc
// Sin body
POST /usuarios/maria@empresa.com/reinvitar
```
```jsonc
{ "success": true, "data": { "message": "Invitación reenviada" } }
```

```jsonc
// Error si ya está accepted:
{ "success": false, "error": { "code": "BAD_REQUEST", "message": "El usuario ya aceptó la invitación — no hace falta reenviar.", "statusCode": 400 } }
```

Mostrá el botón "Reenviar invitación" en la tabla de usuarios **solo** para filas cuyo `status`
no sea `accepted` (deshabilitalo u ocultalo para `accepted`).

### 6.5 `GET /usuarios` — listado (ahora con filtro de estado)

Sin cambios de fondo respecto a como ya lo llamabas (paginado, `limit`/`offset`/`q`/`role`), con
**un query param nuevo**:

```
GET /usuarios?status=invited&limit=20&offset=0
```

`status` acepta uno de: `invited`, `accepted`, `rejected`, `revoked`, `suspended`. Agregalo como
un filtro/tab en la tabla de usuarios (por ejemplo, tabs "Todos / Activos / Pendientes /
Rechazados / Revocados / Suspendidos" mapeados a este parámetro, o un dropdown de filtro — a
tu criterio de diseño).

**Response** (cada fila es una membresía, no solo un `User` de ERPNext):
```jsonc
{
  "success": true,
  "data": [
    {
      "email": "maria@empresa.com",
      "firstName": "María",
      "lastName": "González",
      "fullName": "María González",
      "phone": "809-555-0100",
      "status": "accepted",
      "isDefault": true,
      "roles": ["Ventas RD"],
      "invitedAt": "2026-09-01T14:30:00.000Z",
      "acceptedAt": "2026-09-01T15:02:11.000Z"
    }
  ],
  "meta": { "total": 42, "limit": 20, "offset": 0, "hasMore": true }
}
```

`GET /usuarios/:email` (detalle de uno) devuelve el mismo shape de una sola fila, sin `meta`.

**Qué ya NO viene en esta respuesta** (y por lo tanto hay que sacar de cualquier pantalla de
detalle/edición que lo mostrara): `enabled` (booleano de ERPNext) — reemplazado por `status`,
que es mucho más expresivo (5 valores en vez de 2).

### 6.6 `PUT /usuarios/:email` — editar (ya NO acepta nombre/apellido)

**El cambio más importante de esta sección:** el body **ya no acepta** `firstName` ni
`lastName`. Si tu formulario de edición de usuario todavía tiene esos dos campos, **quitalos por
completo** de ese formulario — mostrá el nombre completo como texto de solo lectura (viene de
`GET /usuarios/:email` → `fullName`) y, si el propio administrador necesita corregir un nombre
mal escrito, la única vía es pedirle a esa persona que lo corrija ella misma desde su perfil
(`PATCH /me/profile`, §7.1) — no hay ningún atajo de administrador para esto, es una decisión de
diseño explícita (el nombre es de la persona, no del tenant).

Si tu cliente HTTP manda `firstName`/`lastName` de todas formas en el body (por ejemplo, porque
el formulario viejo seguía construyendo el payload completo), el backend los **rechaza** con
`400` (la validación tiene `forbidNonWhitelisted: true` — cualquier campo no reconocido en el
DTO hace fallar la request entera, no solo lo ignora en silencio). Asegurate de que el payload
de tu formulario de edición **no incluya esas dos claves en absoluto**.

**Todo lo demás sigue igual** — este es el shape completo que sí sigue aceptando:

```jsonc
{
  "mobileNo": "809-555-0200",
  "perfiles": ["Ventas RD"],           // o "roles", excluyentes entre sí
  "warehouses": ["Almacén Principal"], // deprecado, usar "branches"
  "defaultWarehouse": "Almacén Principal - JB",
  "branches": ["Sucursal Norte"],
  "defaultBranch": "Sucursal Norte",
  "defaultPosProfile": "POS Caja 1",
  "maxDiscountPct": 15,
  "adminPin": "482913",
  "adminCode": "EMP-00231"
}
```

Todos los campos son opcionales e independientes — mandá solo los que el usuario tocó en el
formulario, como ya hacías.

### 6.7 Revocar, suspender, reactivar — tres botones nuevos, tres endpoints

Reemplazan al viejo par "Desactivar/Activar" (`DELETE /usuarios/:email` con semántica de
`enabled=0`/`enable`). Ahora hay tres acciones distintas, cada una con su propio significado
(ver tabla de §6.1):

**Revocar** (el tenant le quita el acceso a alguien que ya lo tenía — definitivo hasta nueva
invitación):
```jsonc
// DELETE /usuarios/:email
{ "reason": "Ya no trabaja en la empresa" }   // opcional, la persona lo ve si intenta entrar
```
```json
{ "success": true, "data": { "message": "Acceso revocado" } }
```

**Suspender** (temporal — pensado para reactivarse después):
```jsonc
// POST /usuarios/:email/suspender
{ "reason": "Licencia médica" }   // opcional
```
```json
{ "success": true, "data": { "message": "Usuario suspendido" } }
```

**Reactivar** (solo tiene sentido desde `suspended` — vuelve directo a `accepted`):
```jsonc
// POST /usuarios/:email/reactivar   (sin body)
```
```json
{ "success": true, "data": { "message": "Usuario reactivado" } }
```

**Sugerencia de UI:** en la tabla de usuarios, mostrá los botones condicionalmente según
`status` de la fila:
- `accepted` → mostrar "Revocar" y "Suspender".
- `suspended` → mostrar "Reactivar" (y opcionalmente "Revocar" también, si tu negocio quiere
  permitir pasar directo de suspendido a revocado sin reactivar primero — el backend no lo
  prohíbe).
- `invited`/`rejected`/`revoked` → mostrar "Reenviar invitación" (§6.4) en vez de cualquiera de
  estos tres.

### 6.8 Lo que se elimina por completo del módulo Usuarios

- El campo `password` en el formulario de creación — **ya no existe**, `POST /usuarios` no lo
  acepta (rechazado por `forbidNonWhitelisted` si lo mandás).
- El toggle/selector de "modo de creación de contraseña" (`email` vs `directo`) que pudiera
  haber en alguna pantalla de Configuración → Seguridad — **eliminalo**. El endpoint
  `PUT /config/seguridad` ya no acepta ningún campo (ver §9), y `GET /config/seguridad` ya no
  devuelve `modoCreacionPassword`.
- El botón "Resetear contraseña" con un campo `newPassword` en el formulario de edición de
  usuario (`POST /usuarios/:email/reset-password`) — **el endpoint ya no existe**. Si necesitás
  ofrecer algo parecido desde la administración del tenant, lo más cercano es "Reenviar
  invitación" (§6.4), que no toca contraseñas — la persona sigue siendo la única que puede
  cambiar su propia contraseña (§7.2) o recuperarla si la olvidó (§7.3, un flujo global, sin
  intervención del tenant).

---

## 7. Perfil propio — `PATCH /me/profile`, cambio de contraseña, cuentas vinculadas

Esta es una pantalla nueva (o una sección nueva dentro de una pantalla de "Mi cuenta" que ya
exista) — autoservicio total, sin necesidad de ningún permiso especial del catálogo (está exento
del sistema de permisos, es "lo que cualquiera puede hacer sobre sus propios datos").

### 7.1 `GET /me/profile` y `PATCH /me/profile`

```jsonc
// GET /me/profile
{
  "success": true,
  "data": {
    "id": "3f2e1d0c-...",
    "email": "maria@empresa.com",
    "firstName": "María",
    "lastName": "González",
    "phone": "809-555-0100",
    "locale": "es",
    "timeZone": "America/Santo_Domingo",
    "mfaEnabled": true,
    "tenants": [
      { "slug": "acme", "name": "ACME SRL", "status": "accepted", "isDefault": true, "roles": ["Ventas RD"] },
      { "slug": "beta", "name": "Beta SA", "status": "invited", "isDefault": false, "roles": [] }
    ]
  }
}
```

```jsonc
// PATCH /me/profile — todos los campos opcionales, mandá solo lo que cambió
{
  "firstName": "María José",
  "lastName": "González Pérez",
  "phone": "809-555-0300"
}
```
```jsonc
{
  "success": true,
  "data": {
    "id": "3f2e1d0c-...",
    "firstName": "María José",
    "lastName": "González Pérez",
    "phone": "809-555-0300"
  }
}
```

El cambio se propaga automáticamente a **todos** los tenants donde la persona tenga membresía
(sin importar el estado) — no hace falta ningún parámetro adicional, y no hay ninguna acción de
UI extra que hacer en las pantallas de los otros tenants; es responsabilidad exclusiva del
backend mantenerlos sincronizados.

### 7.2 `POST /me/password` — cambiar mi propia contraseña

```jsonc
{
  "currentPassword": "MiClave2026!",
  "newPassword": "MiClaveNueva2027!"
}
```
```jsonc
{
  "success": true,
  "data": { "message": "Contraseña actualizada — cierre sesión y vuelva a entrar." }
}
```

**Importante:** este endpoint **revoca todas las demás sesiones** de la persona (todos los
`refresh_token` activos, en todos los dispositivos, excepto — de hecho, sin excepción, incluido
el actual). Después de un cambio de contraseña exitoso, el frontend debe:
1. Limpiar el estado de auth local (`refresh_token`, `access_token`, todo).
2. Redirigir a la pantalla de login con un mensaje tipo "Tu contraseña se actualizó — iniciá
   sesión de nuevo".

No intentes seguir usando la sesión actual después de este endpoint — el `access_token` en
memoria puede seguir "pareciendo" válido hasta que expire (es un JWT autocontenido), pero
cualquier intento de refresh con el `refresh_token` viejo va a fallar, así que lo más prolijo es
forzar el logout de inmediato en el cliente en vez de esperar a que falle.

**Errores:**

| HTTP | Mensaje | Cuándo |
|---|---|---|
| 400 | `El usuario no tiene contraseña fijada` | Caso de borde — alguien que nunca aceptó ninguna invitación de tipo `registration` no debería poder llegar a esta pantalla en primer lugar (no tiene sesión) |
| 401 | `Contraseña actual incorrecta` | `currentPassword` no matchea |

### 7.3 Recuperar contraseña — flujo completo, sin sesión (global)

**Pedir el link** (pantalla "Olvidé mi contraseña", accesible desde el login):
```jsonc
// POST /auth/forgot-password
{ "email": "maria@empresa.com" }
```
```jsonc
{
  "success": true,
  "data": { "message": "Si el correo está registrado, recibirás instrucciones para recuperarlo." }
}
```
Esta respuesta **siempre es la misma**, exista o no el email (anti-enumeración) — no muestres
ningún mensaje distinto según lo que pase por detrás, ni intentes "confirmar" si el email existía
con otra llamada.

**Completar con el token del correo** (el link apunta a `TU_FRONTEND/reset-password?token=...`
— necesitás una ruta/página en tu app que lea el query param `token` de la URL):
```jsonc
// POST /auth/reset-password
{ "token": "9f8e7d6c...", "newPassword": "MiClaveNueva2027!" }
```

La respuesta exitosa es el `AuthResult` completo de §3.2(d) — **autologuea** a la persona de
una vez, tal como pasaba con el flujo anterior. Procesalo con la misma lógica que un login
normal.

```jsonc
// Error si el link es inválido/ya se usó/expiró:
{ "success": false, "error": { "code": "BAD_REQUEST", "message": "El enlace es inválido o ya expiró. Solicite uno nuevo.", "statusCode": 400 } }
```

### 7.4 `GET /auth/invitations/:token` y accept/reject — la pantalla de invitación

El correo de invitación (tanto para usuario nuevo como para uno existente, §6.3) apunta a
`TU_FRONTEND/invitacion?token=...` — necesitás una página que:

1. Al cargar, llame a `GET /auth/invitations/:token` (**sin** consumir el token — es de solo
   lectura, podés llamarlo cuantas veces haga falta, por ejemplo si la persona recarga la
   página):

```jsonc
{
  "success": true,
  "data": {
    "tenantName": "ACME SRL",
    "tenantSlug": "acme",
    "email": "maria@empresa.com",
    "purpose": "registration",       // o "invitation"
    "requiresPassword": true,        // ver abajo
    "expiresAt": "2026-09-08T14:30:00.000Z"
  }
}
```

2. Mostrar una pantalla tipo *"ACME SRL te invitó a unirte como maria@empresa.com. ¿Aceptás?"*
   con dos botones: **Aceptar** y **Rechazar**.
   - Si `requiresPassword: true` (usuario nuevo, todavía sin contraseña fijada), el botón
     "Aceptar" debe abrir un formulario pidiendo la contraseña nueva **antes** de confirmar (dos
     campos: contraseña + confirmar contraseña, con la validación de fortaleza que tu proyecto
     ya use en otros formularios de contraseña — el backend solo exige mínimo 8 caracteres).
   - Si `requiresPassword: false` (la persona ya tiene contraseña, viene de otro tenant), el
     botón "Aceptar" no necesita ningún campo adicional — es una confirmación simple.
   - Si `expiresAt` ya pasó, o el `GET` inicial da un error (ver abajo), no muestres los botones
     — mostrá el estado de error correspondiente con una explicación.

3. **Aceptar:**
```jsonc
// POST /auth/invitations/:token/accept
{ "password": "MiClave2026!" }   // SOLO si requiresPassword era true; omitir el campo si era false
```
La respuesta exitosa es el `AuthResult` completo (§3.2d) — autologuea de una vez, con el tenant
de la invitación ya activado como tenant actual (no hace falta `switch-tenant` después de
aceptar). Redirigí directo a la aplicación.

```jsonc
// Error si requiresPassword era true y no se mandó password:
{ "success": false, "error": { "code": "BAD_REQUEST", "message": "Este registro requiere fijar una contraseña — envíe `password`.", "statusCode": 400 } }
```

4. **Rechazar:**
```jsonc
// POST /auth/invitations/:token/reject   (sin body)
```
```jsonc
{ "success": true, "data": { "message": "Invitación rechazada" } }
```
Mostrá una pantalla de confirmación simple ("Rechazaste la invitación a ACME SRL") — no hay
autologin acá, la persona no queda con ninguna sesión iniciada solo por rechazar.

**Errores de `GET /auth/invitations/:token` (y también aplican al intentar accept/reject sobre
un token en ese estado):**

| HTTP | Cuándo |
|---|---|
| 404 | El token no existe (nunca existió, o es un typo en la URL) |
| 410 (Gone) | El token **ya se usó** (ya se aceptó o rechazó antes) |
| 410 (Gone) | El token **expiró** (por defecto, 7 días desde que se invitó/reinvitó) |

Para el caso de 410, mostrá un mensaje sugiriendo contactar al administrador del tenant para que
use "Reenviar invitación" (§6.4) — el frontend de esta pantalla de invitación no tiene forma de
auto-generar un link nuevo.

---

## 8. Login con Google (OAuth2)

**Regla de negocio explícita y no negociable: Google sirve para ENTRAR a una cuenta que ya
existe, nunca para registrarse.** Si alguien intenta "iniciar sesión con Google" con un correo
que el sistema no conoce, se rechaza — no se crea una cuenta nueva por esa vía. Esto es a
propósito: la única forma de entrar al sistema por primera vez es aceptando una invitación
(§6.3, §7.4).

### 8.1 El flujo completo (redirects de navegador, no llamadas AJAX)

```
1. Usuario hace clic en "Continuar con Google" en tu pantalla de login
   → El navegador navega (no fetch/axios) a: GET /api/v1/auth/oauth/google
                                                          │
2. El backend responde con un 302 hacia accounts.google.com
   (con PKCE ya armado del lado del servidor — el frontend no genera nada acá)
                                                          │
3. Google muestra su propia pantalla de consentimiento/selección de cuenta
                                                          │
4. Google redirige de vuelta a: GET /api/v1/auth/oauth/google/callback?code=...&state=...
   (el backend, NO el frontend, recibe esto directamente)
                                                          │
5. El backend valida el id_token, resuelve la cuenta, y redirige al FRONTEND:
                                                          │
   ├─ Éxito:  TU_FRONTEND/oauth/callback?ticket=AbC123...
   └─ Error:  TU_FRONTEND/oauth/callback?error=OAUTH_NO_ACCOUNT
                                                          │
6. Tu página en /oauth/callback lee el query param y:
   - si hay `ticket` → POST /auth/oauth/exchange { ticket } → AuthResult completo → login normal
   - si hay `error`  → mostrar el mensaje correspondiente (tabla abajo) y volver al login
```

**Lo que el frontend necesita implementar concretamente:**

- Un botón/link "Continuar con Google" que sea una **navegación real** (`<a href="...">` o
  `window.location.href = ...`, **no** un `fetch`) a:
  ```
  ${API_BASE_URL}/api/v1/auth/oauth/google
  ```
- Una ruta/página nueva en el frontend: `/oauth/callback`, que:
  1. Lee `ticket` o `error` de los query params de la URL actual.
  2. Si hay `ticket`: llama a `POST /auth/oauth/exchange { ticket }`, procesa la respuesta como
     un login normal (§3.2d), y redirige a la app.
  3. Si hay `error`: muestra el mensaje de la tabla de abajo y ofrece volver al login.
  4. Mientras tanto, mostrá un spinner/estado de carga — todo este intercambio es rápido pero no
     instantáneo.

### 8.2 `POST /auth/oauth/exchange`

```jsonc
{ "ticket": "AbC123..." }
```

Respuesta exitosa: el `AuthResult` completo de §3.2(d) — mismo procesamiento que cualquier otro
login.

```jsonc
// Error — ticket ya usado, expirado (5 minutos de vida), o inválido:
{ "success": false, "error": { "code": "UNAUTHORIZED", "message": "Ticket inválido o expirado", "statusCode": 401 } }
```

Si esto pasa (por ejemplo, la persona recargó la página de callback dos veces), mandala de
vuelta al login para que reintente el botón de Google desde cero — el ticket es de un solo uso,
no hay forma de "reobtenerlo".

### 8.3 Tabla de errores del callback (`?error=...`)

| Valor de `error` | Qué mostrar |
|---|---|
| `OAUTH_NO_ACCOUNT` | **El más importante de manejar con un mensaje claro.** *"No hay ninguna cuenta registrada con ese correo de Google. Si tu empresa ya te invitó, revisá tu bandeja de entrada; si no, pedile a un administrador que te invite primero."* — nunca sugieras "registrate con Google", esa opción no existe |
| `OAUTH_ERROR` | Genérico — *"No se pudo completar el inicio de sesión con Google. Intentá de nuevo."* Cubre casos como que Google no devolviera el `id_token`, o que el correo de Google no viniera verificado (`email_verified: false`) |

### 8.4 Cuentas de Google vinculadas — gestión desde el perfil

Una vez que alguien entró con Google la primera vez, queda vinculado automáticamente (no hace
falta un paso de "vincular" separado del login). Podés mostrar, en la pantalla de perfil/
seguridad:

```jsonc
// GET /me/identities
{
  "success": true,
  "data": [
    {
      "id": "b2c3d4e5-...",
      "provider": "google",
      "emailAtLink": "maria@gmail.com",
      "linkedAt": "2026-09-10T10:00:00.000Z"
    }
  ]
}
```

```jsonc
// DELETE /me/identities/:identityId
{ "success": true, "data": { "message": "Cuenta desvinculada" } }
```

Después de desvincular, esa persona ya no puede entrar con ese botón de Google — tendría que
volver a hacerlo (lo que la re-vincularía automáticamente, ya que su email de control-plane
sigue existiendo). Mostrá esto como una lista simple con un botón "Desvincular" por fila; no
hace falta ningún flujo de "agregar cuenta de Google" manual — se agrega sola al usar el botón
de login con Google estando ya autenticado de otra forma... **aclaración importante:** hoy el
backend **no** ofrece un endpoint de "vincular Google estando ya logueado" — la vinculación
ocurre **únicamente** como efecto secundario del primer login exitoso con ese correo de Google
(§8.1, resolución de cuenta por email verificado). Si el email de Google de la persona coincide
con su email de control-plane y Google lo tiene verificado, se vincula sola en ese primer intento
de "Continuar con Google" — no hace falta que la persona esté logueada primero. Si tu diseño
necesita un botón explícito de "Vincular Google" dentro del perfil (en vez de que ocurra
implícitamente en el próximo login), es una función que **no existe todavía** — quedaría como
pedido aparte al backend.

---

## 9. Configuración — qué se elimina de la pantalla de "Seguridad" del tenant

Si el frontend tenía una sección de Configuración → Seguridad con controles de nivel de tenant
para la gestión de contraseñas, hay que revisarla:

```jsonc
// GET /config/seguridad — response actual, mucho más chico que antes
{
  "success": true,
  "data": { "invitationLinkExpiryHours": 168 }
}
```

- **Ya no existe** `modoCreacionPassword` (`"email"`/`"directo"`) — **quitá ese selector por
  completo** de la UI. Ya no hay un modo "directo" donde el admin fija la contraseña a mano; toda
  alta pasa por invitación (§6.3).
- **Ya no existe** `resetPasswordLinkExpiryMinutes` editable — el único dato que queda es
  informativo (`invitationLinkExpiryHours`, de solo lectura, viene de una variable de entorno
  global del backend, no configurable por tenant).
- `PUT /config/seguridad` **ya no acepta ningún campo** — si lo llamás con cualquier body,
  responde:
  ```json
  { "success": false, "error": { "code": "BAD_REQUEST", "message": "La configuración de seguridad de invitaciones se controla por variables de entorno (INVITATION_TTL_HOURS) — ya no hay nada que actualizar por tenant.", "statusCode": 400 } }
  ```
  **Quitá el botón "Guardar" de esta sección por completo** — no hay nada que un tenant pueda
  cambiar acá. Si querés, dejá `GET /config/seguridad` solo para mostrar
  `invitationLinkExpiryHours` como un dato informativo de solo lectura, o eliminá la sección
  entera de la pantalla de Configuración si no aporta valor mostrarla sola.

---

## 10. Tabla resumen de TODOS los endpoints de este documento

| Método | Ruta | Requiere sesión | Requiere `X-Tenant` | Qué hace |
|---|---|---|---|---|
| POST | `/auth/login` | No | No (opcional, ver §3.1) | Login global, primer paso |
| POST | `/auth/mfa/verify` | No | No | Segundo paso del login con 2FA |
| POST | `/auth/mfa/resend` | No | No | Reenvía código de 2FA por correo |
| POST | `/auth/refresh` | No (usa `refreshToken`) | No | Renueva el `access_token` |
| POST | `/auth/logout` | No (usa `refreshToken`) | No | Cierra sesión (una o todas) |
| POST | `/auth/switch-tenant` | No (usa `refreshToken`) | No | Emite `access_token` para otro tenant |
| GET | `/auth/invitations/:token` | No | No | Detalle de una invitación (no la consume) |
| POST | `/auth/invitations/:token/accept` | No | No | Acepta invitación — autologuea |
| POST | `/auth/invitations/:token/reject` | No | No | Rechaza invitación |
| GET | `/auth/oauth/google` | No | No | Redirect a Google (navegación de navegador) |
| GET | `/auth/oauth/google/callback` | No | No | Lo recibe el backend, no el frontend |
| POST | `/auth/oauth/exchange` | No | No | Canjea el ticket del callback por tokens |
| POST | `/auth/forgot-password` | No | No | Pide el link de recuperación |
| POST | `/auth/reset-password` | No | No | Completa la recuperación — autologuea |
| GET | `/me/profile` | Sí | **Sí** | Mi perfil global |
| PATCH | `/me/profile` | Sí | **Sí** | Editar mi nombre/apellido/teléfono |
| POST | `/me/password` | Sí | **Sí** | Cambiar mi contraseña — revoca otras sesiones |
| GET | `/me/mfa/factors` | Sí | **Sí** | Listar mis factores de 2FA |
| POST | `/me/mfa/totp` | Sí | **Sí** | Iniciar alta de TOTP (QR) |
| POST | `/me/mfa/totp/confirm` | Sí | **Sí** | Confirmar TOTP — devuelve códigos de recuperación |
| POST | `/me/mfa/email` | Sí | **Sí** | Activar 2FA por correo |
| DELETE | `/me/mfa/:factorId` | Sí | **Sí** | Eliminar un factor |
| GET | `/me/identities` | Sí | **Sí** | Cuentas externas vinculadas |
| DELETE | `/me/identities/:identityId` | Sí | **Sí** | Desvincular una cuenta |
| GET | `/usuarios/lookup` | Sí | Sí | Buscar antes de invitar |
| GET | `/usuarios` | Sí | Sí | Listar (con filtro `status`) |
| GET | `/usuarios/:email` | Sí | Sí | Detalle |
| POST | `/usuarios` | Sí | Sí | Invitar |
| POST | `/usuarios/:email/reinvitar` | Sí | Sí | Reenviar invitación |
| PUT | `/usuarios/:email` | Sí | Sí | Editar (sin nombre/apellido) |
| DELETE | `/usuarios/:email` | Sí | Sí | Revocar |
| POST | `/usuarios/:email/suspender` | Sí | Sí | Suspender |
| POST | `/usuarios/:email/reactivar` | Sí | Sí | Reactivar |

---

## 11. Checklist de implementación

- [ ] Regenerado el cliente/tipos desde el `openapi.json` actualizado.
- [ ] Store de auth rediseñado alrededor de dos tokens (`refresh_token` persistente,
      `access_token` en memoria por tenant activo) — no un solo JWT como antes (§1).
- [ ] `POST /auth/login` ya no manda `X-Tenant` obligatorio; el campo `tenant` es opcional
      (§3.1).
- [ ] Manejo de las 3 respuestas de login: `mfaRequired`, `access_token: null` (selector de
      tenant), y login completo (§3.2-§3.5).
- [ ] Interceptor HTTP con single-flight de `POST /auth/refresh` ante 401 de negocio, y manejo
      del caso "sesión inválida por reuso de refresh" → forzar logout completo (§4.1).
- [ ] Selector de tenant / pantalla de "elegí una empresa" para cuando `access_token` es `null`
      (§3.5), y botón de "cambiar de empresa" usando `switch-tenant` (§4.3).
- [ ] Pantalla de 2FA en el login (código + reenviar + códigos de recuperación como alternativa)
      (§5.1-§5.2).
- [ ] Sección "Seguridad" en el perfil: alta/confirmación de TOTP con QR y pantalla de códigos
      de recuperación con confirmación explícita, activar 2FA por correo, listar/eliminar
      factores (§5.3).
- [ ] Módulo Usuarios: `lookup` antes de invitar (con los 3 casos de §6.2), formulario de
      invitación sin campo de contraseña, filtro por `status` en el listado, botones
      condicionales revocar/suspender/reactivar/reenviar según el estado de cada fila (§6).
- [ ] **Quitados** del formulario de edición de usuario: `firstName`, `lastName`, cualquier
      campo de contraseña (§6.6, §6.8).
- [ ] Pantalla de perfil propio con `PATCH /me/profile` (nombre/apellido/teléfono) y
      `POST /me/password` (con logout forzado después) (§7.1-§7.2).
- [ ] Pantalla "Olvidé mi contraseña" (`/auth/forgot-password`) y su completar
      (`/reset-password?token=`, `/auth/reset-password`) (§7.3).
- [ ] Página `/invitacion?token=` con los 3 estados (pendiente/aceptada con o sin contraseña
      nueva/rechazada) y el manejo de token expirado/ya usado (§7.4).
- [ ] Botón "Continuar con Google" como navegación real (no AJAX) y página `/oauth/callback` que
      procesa `?ticket=` o `?error=` (§8).
- [ ] Sección de cuentas vinculadas (Google) en el perfil (§8.4).
- [ ] Quitado el selector "modo de creación de contraseña" y el botón "Guardar" de
      Configuración → Seguridad, o toda la sección si no queda nada que mostrar (§9).
- [ ] Verificado que ningún endpoint de negocio existente (facturación, inventario, etc.) se vio
      afectado — todos siguen esperando `Authorization: Bearer` + `X-Tenant` exactamente igual
      que antes (§0.3).
