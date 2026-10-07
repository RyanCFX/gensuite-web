# Prompt para el agente de frontend: Features adicionales por usuario ("acceso adicional")

> **Para quien recibe este documento:** sos el agente que implementa el frontend de GenSuite
> (React). No tenés memoria de ninguna conversación previa. Todo lo que necesitás está acá y en el
> `openapi.json` del repo del frontend.
>
> - El **`openapi.json`** manda en la forma de los DTO. Esto lo que el `openapi.json` no puede
>   expresar y está solo acá: el significado de `featuresAdicionales`/`componentesAdicionales`,
>   `details.origenPosible` y las reglas de UI. Si encontrás una contradicción, anotala en tu resumen
>   final; no la resuelvas en silencio.
> - El backend **ya está implementado**. No inventes endpoints ni campos.
> - Este documento **extiende** `docs/frontend/PROMPT_PERMISOS_V2_Y_DASHBOARD_MODULAR_FRONTEND.md`
>   (`/me/acceso`, `/me/features`, menú por acceso). Todo lo que ya hace el frontend con eso **sigue
>   valiendo y no hay que romperlo**.

---

## 0. Resumen en 12 líneas

1. Un usuario puede tener acceso a un **módulo que su empresa (tenant) no contrata**, porque
   **GenSuite** se lo dio a él (caso real: el contador externo que usa **Gastos** en el tenant de su
   cliente). Lo llamamos **acceso adicional**.
2. Para ese usuario, el módulo **aparece como cualquier otro**: en `features`, en `/me/acceso`, en el
   menú, en el dashboard y en los lookups. **El frontend no calcula nada nuevo**: el backend ya devuelve
   las features y el acceso **efectivos** (contrato del tenant ∪ acceso adicional).
3. La lista **`featuresAdicionales`** (en `GET /me/features` y `GET /me/bootstrap`) es **solo para la
   UI**: etiqueta "Adicional" y aviso de vencimiento. **Nunca derives acceso de esa lista.**
4. `GET /me/acceso` agrega **`componentesAdicionales`** (subconjunto de `componentes`), también solo
   para la UI.
5. El **administrador del tenant no ve nada nuevo**, salvo un booleano `accesoAdicionalGestionado` en la
   lista y la ficha de usuarios (tooltip, sin detalle). No hay pantalla para gestionar accesos
   adicionales en esta app: eso lo hace GenSuite Control.
6. **Prioridad del tenant:** si el tenant contrata el módulo después, el acceso adicional deja de aplicar
   y el usuario accede **solo** si su administrador se lo otorga. Esto lo decide el backend; para el
   frontend se ve como "el usuario pierde el módulo" (403 `PERMISO_INSUFICIENTE`).
7. Un acceso adicional puede **vencer**. Después de vencer (aunque sea en plena sesión) el siguiente
   request recibe `403 FEATURE_NO_CONTRATADO` con `details.origenPosible = "adicional"`.
8. Los accesos adicionales son **por tenant**: al cambiar de tenant hay que recargar el bootstrap y no
   reutilizar el menú.
9. No cambia el login ni el JWT. El acceso adicional rige desde el **siguiente request** de quien lo
   recibe, sin re-login (para verlo en el menú, refrescá `GET /me/acceso` cuando cambie su `version`).
10. El admin del tenant **no debe "limpiar" roles/perfiles desconocidos** de un usuario: el backend
    preserva los roles del acceso adicional al guardar.
11. Nada de esto es seguridad del lado del cliente: el backend aplica todo.
12. Tareas: etiqueta "Adicional", aviso de vencimiento, manejo del 403 nuevo, indicador en usuarios,
    verificación de no-cache entre tenants (§10).

---

## 1. Qué cambia para cada tipo de persona

| Persona | Qué ve | Qué cambia |
|---|---|---|
| **Usuario con acceso adicional** (p. ej. contador) | El módulo extra en el menú y en sus pantallas, igual que los demás | Etiqueta "Adicional" opcional; aviso si vence pronto; mensaje propio si venció |
| **Compañero del mismo tenant sin acceso adicional** | Nada nuevo | Nada. Sigue recibiendo `403 FEATURE_NO_CONTRATADO` en ese módulo |
| **Administrador del tenant** | Nada nuevo en Permisos | Solo el indicador `accesoAdicionalGestionado` en usuarios. **No** ve el módulo en el catálogo ni puede otorgarlo |
| **Tenant que contrata el módulo después** | El módulo (contratado) | El usuario con acceso adicional **pasa a depender de su administrador** (ver §5) |

---

## 2. Contrato (ejemplos reales)

### 2.1 `GET /api/v1/me/features`

```jsonc
{
  "success": true,
  "data": {
    // EFECTIVAS: contrato del tenant ∪ acceso adicional del usuario. `gastos: true` aunque el tenant
    // no lo contrate, porque este usuario lo tiene como acceso adicional.
    "features": { "gastos": true, "compras": false, "ventas": true /* … todas las claves */ },
    "reportesHabilitados": ["gastos_por_periodo", "…"],
    "featuresAdicionales": [                 // NUEVO — solo informativo para la UI
      {
        "key": "gastos",
        "nombre": "Gastos",
        "tipo": "modulo",                    // modulo | reporte | dashboard_tipo | dashboard_reporte
        "origen": "adicional",
        "expiraEn": "2026-12-31T23:59:59.000Z"   // null = no vence
      }
    ],
    "limites": { "maxUsuarios": 10, "maxSucursales": null, "usuariosActuales": 4, "sucursalesActuales": 1 }
  }
}
```

- `features` y `reportesHabilitados` ya incluyen el acceso adicional. **El menú se arma igual que
  hoy:** `features` ∩ acceso (`/me/acceso`).
- `featuresAdicionales` **no** incluye los accesos *latentes* (los que el tenant ya contrata) ni los
  vencidos: si un acceso no está acá, no se lo muestres como adicional.
- `limites` son siempre los **del tenant**.
- Sin acceso adicional: `featuresAdicionales: []`.

### 2.2 `GET /api/v1/me/acceso` (y el bloque `acceso` de `GET /me/bootstrap`)

Sin cambios de forma. Agrega:

```jsonc
{
  "modo": "activo",
  "version": "240.7",                      // cambia cuando cambia el acceso adicional del tenant
  "modulos": ["gastos", "ventas", "…"],
  "componentes": ["gastos.registro.listar", "gastos.registro.crear", "ventas.factura.listar", "…"],
  "componentesAdicionales": ["gastos.registro.listar", "gastos.registro.crear"]   // NUEVO — subconjunto de `componentes`
  /* … pantallas, recursos, filtrosBloqueados como siempre */
}
```
`componentesAdicionales` son los componentes que el usuario tiene **solo** por el acceso adicional.
Úsalo únicamente para decorar la UI. El permiso real sigue siendo `componentes`.

### 2.3 `GET /api/v1/me/bootstrap`

Trae las mismas dos cosas dentro de sus bloques `features` (= `GET /me/features`) y `acceso`
(= `GET /me/acceso`). No hay otro cambio.

### 2.4 Error nuevo en detalle: `403 FEATURE_NO_CONTRATADO`

Ya existía (el tenant no contrata el módulo). Ahora puede traer una pista:

```json
{
  "success": false,
  "error": {
    "code": "FEATURE_NO_CONTRATADO",
    "message": "Este módulo no está incluido en el plan de este tenant.",
    "statusCode": 403,
    "details": { "featuresFaltantes": ["gastos"], "origenPosible": "adicional" }
  }
}
```
- **`details.origenPosible === "adicional"`** significa: *este usuario tuvo un acceso adicional a ese
  módulo que venció o dejó de aplicar*. Sin esa clave, es el "no contratado" de siempre.

### 2.5 Lista y ficha de usuarios (pantallas del administrador del tenant)

`GET /api/v1/usuarios`, `GET /api/v1/usuarios/:email` y `GET /api/v1/acceso/usuarios/:email` agregan:

```json
{ "email": "cpa@estudio.do", "fullName": "Ana Pérez", "roles": ["Consulta"], "accesoAdicionalGestionado": true }
```
`accesoAdicionalGestionado: true` = GenSuite le dio a esa persona acceso a módulos que el tenant no
contrata. **Es un booleano sin detalle** (no sabés qué módulo, hasta cuándo ni a qué precio, y no
tenés cómo saberlo).

---

## 3. Menú y rutas: cero lógica nueva

- **Fuente de verdad:** `features` (ya efectivas) ∩ acceso (`/me/acceso`). Es exactamente lo que hacés
  hoy; no agregues cálculo.
- **Nunca** derives acceso de `featuresAdicionales` ni de `componentesAdicionales`.
- **Guards de ruta** y botones: siguen usando `features`, `modulos`, `pantallas`, `componentes` y
  `GET /me/permissions` como antes.
- Si implementaste el menú con una lista fija de módulos por feature, verificá que un módulo cuyo
  feature es `true` **aparezca aunque no sea de los "habituales" del tenant** (no filtres por un plan
  asumido en el cliente).

---

## 4. UI del acceso adicional

1. **Etiqueta "Adicional"** (badge pequeño) en:
   - el **ítem de menú** del módulo (cuando su `key` figura en `featuresAdicionales`), y
   - el **encabezado** de las pantallas de ese módulo.
   Solo informativa; sin acción. Tooltip: "Este módulo es un acceso adicional gestionado por GenSuite".
2. **Aviso de vencimiento:** si `expiraEn` no es `null` y faltan **≤ 7 días**, mostrar un aviso discreto
   (banner o ítem de notificación) en el módulo: "Tu acceso adicional a **{nombre}** vence el
   **{fecha}**. Contactá a GenSuite para renovarlo." Calculalo en el cliente con `expiraEn` (ISO) y la
   zona horaria del usuario. Menos de 24 h: tono de urgencia.
3. **Estado vacío** cuando vence **durante la sesión**: ver §5.
4. **Dashboard y reportes:** si llegan widgets o reportes por acceso adicional, se muestran **igual** que
   los demás (la etiqueta es opcional).

---

## 5. Errores y refresco de acceso

| Respuesta | Qué hacer |
|---|---|
| `403 FEATURE_NO_CONTRATADO` **con** `details.origenPosible === "adicional"` | Mostrar: **"Tu acceso adicional a {módulo} venció o fue retirado. Contactá a GenSuite."** (usá `featuresFaltantes[0]` para el nombre; resolvé el nombre legible desde el catálogo de módulos del menú). **Refrescá `GET /me/acceso` y `GET /me/features`**, sacá el módulo del menú y llevá al usuario al inicio. No reintentar. |
| `403 FEATURE_NO_CONTRATADO` **sin** `origenPosible` | Como hoy: "Este módulo no está incluido en el plan de tu empresa". |
| `403 PERMISO_INSUFICIENTE` en un módulo que el **tenant sí contrata** (y que el usuario tenía como adicional) | Mensaje **estándar**: "No tenés permiso. Pedí acceso al administrador de tu empresa." Es el caso de "el tenant contrató el módulo después": el acceso adicional dejó de aplicar y ahora manda el administrador del tenant. Refrescá `/me/acceso`. |

Regla general: ante cualquiera de estos, refrescar `GET /me/acceso` (cambió su `version`) y reconstruir
el menú. No mantengas el módulo visible "por las dudas".

---

## 6. Pantallas del administrador del tenant

- En **la lista de usuarios** y en **la ficha**, si `accesoAdicionalGestionado === true`, mostrá un
  pequeño ícono/badge (p. ej. un escudo) con tooltip: **"Este usuario tiene acceso a módulos adicionales
  gestionados por GenSuite."** Sin más detalle, sin enlace.
- **No hay** pantalla de gestión de accesos adicionales en esta app. Si algún diseño la pide, es de
  GenSuite Control, no de este frontend.
- El **editor de roles / perfiles de acceso** no requiere cambios: el backend **preserva** los roles
  que vienen del acceso adicional cuando el administrador guarda los del usuario. **No intentes
  "limpiar" roles o perfiles que el administrador no ve** en el formulario (si el backend devolviera un
  rol desconocido, tratalo con el genérico de siempre; no lo quites del payload por tu cuenta).
- El **catálogo de permisos** (`GET /acceso/catalogo`) **no** muestra el módulo adicional: es normal. No
  lo "agregues" desde otra fuente.

---

## 7. Cambio de tenant

Los accesos adicionales son **por tenant** (un mismo usuario puede tener uno en `acme` y ninguno en
`beta`). Al cambiar `X-Tenant`:

- recargá `GET /me/bootstrap` (ya lo hacés) y **reconstruí el menú desde cero**;
- **no cachees** el menú, `features`, `featuresAdicionales` ni `componentesAdicionales` entre tenants
  (la clave de cualquier caché debe incluir el tenant);
- limpiá avisos de vencimiento del tenant anterior.

---

## 8. Contrato de sincronización (cuándo refrescar)

`version` de `GET /me/acceso` cambia cuando se crea, cambia o vence un acceso adicional (y ante
cualquier cambio de acceso del tenant). Mantené lo que ya tenés (permisos v2 §2.1): refrescar al iniciar
sesión, al cambiar `version`, y tras los errores de §5. **No hace falta polling nuevo.**

---

## 9. Qué NO hacer

- ❌ Calcular acceso desde `featuresAdicionales` / `componentesAdicionales`.
- ❌ Mostrar a un compañero (sin acceso adicional) el módulo "porque el tenant lo vende": el
  `features` que recibe ya es el correcto.
- ❌ Mostrar al administrador del tenant qué módulo adicional tiene alguien (no lo sabés ni debés).
- ❌ Ofrecer "contratar este módulo" dentro de la app para un usuario con acceso adicional (es un
  asunto comercial de GenSuite).
- ❌ Cachear nada entre tenants.

---

## 10. Plan de implementación (en orden)

1. Leer el `openapi.json` y este documento; anotar discrepancias. Regenerar tipos.
2. **Tipos:** `featuresAdicionales` en la respuesta de `/me/features`, `componentesAdicionales` en
   `/me/acceso`, `accesoAdicionalGestionado` en los DTO de usuarios, y `details.origenPosible` en el
   error de feature.
3. **Store/hook** `useFeaturesAdicionales()` que lee `featuresAdicionales` del store de `/me/features`
   (sin lógica de acceso).
4. **Menú:** etiqueta "Adicional" y encabezado de módulo (§4.1).
5. **Aviso de vencimiento** (§4.2) con prueba de zona horaria.
6. **Manejo de errores** (§5) en el interceptor/cliente HTTP: el caso `origenPosible` y el refresco de
   acceso.
7. **Usuarios (admin del tenant):** indicador (§6).
8. **Cambio de tenant:** verificar claves de caché y limpieza (§7).
9. **Pruebas** (checklist §11) y resumen final.
10. **Actualizar** `PROMPT_PERMISOS_V2_Y_DASHBOARD_MODULAR_FRONTEND.md` con la referencia cruzada (ya
    añadida por el backend; verificá que tu equipo la vea).

---

## 11. Checklist de QA

Escenario: tenant `acme` **sin** Gastos. Tres usuarios: **contador** (acceso adicional a Gastos),
**compañero** (sin acceso adicional), **admin** del tenant.

- [ ] **Contador:** ve Gastos en el menú con etiqueta "Adicional"; abre las pantallas y opera según su
      alcance; `GET /me/features` trae `features.gastos === true` y `featuresAdicionales` con `gastos`.
- [ ] **Compañero:** no ve Gastos; si fuerza la URL, recibe el 403 estándar de "no contratado" **sin**
      `origenPosible`.
- [ ] **Admin del tenant:** en Permisos **no** aparece Gastos; en la lista/ficha del contador ve el
      indicador `accesoAdicionalGestionado`; al guardar los roles del contador, no se rompe nada.
- [ ] **Vencimiento:** con `expiraEn` a ≤ 7 días, el contador ve el aviso; con vencimiento en plena
      sesión, el siguiente request da 403 con `origenPosible: "adicional"`, se muestra el mensaje de §5,
      se refresca el acceso y Gastos desaparece del menú.
- [ ] **Tenant contrata Gastos después:** el contador pierde el módulo hasta que el admin se lo otorga
      (403 `PERMISO_INSUFICIENTE`, mensaje estándar); tras otorgárselo, lo ve **sin** etiqueta
      "Adicional" (ya no es adicional: `featuresAdicionales` no lo trae).
- [ ] **Cambio de tenant:** el contador cambia a otro tenant donde no tiene el acceso: el menú no
      arrastra Gastos ni la etiqueta ni el aviso.
- [ ] **Dashboard/reportes** de un acceso adicional se ven como los demás.
- [ ] Ningún lugar del código deriva acceso de `featuresAdicionales`/`componentesAdicionales`
      (búsqueda en el repo).
- [ ] Lint, build y tests existentes pasan; el tipo de `details` del error no se asume sin
      `origenPosible`.

---

## 12. Qué entregar

1. El código con commits atómicos y mensajes claros.
2. Un **resumen final** con: archivos tocados (archivo → qué cambió), discrepancias con el
   `openapi.json`, y los casos de §11 que no pudiste probar (y por qué).
3. Una lista de **dudas o huecos** (no los resuelvas inventando).

---

## Apéndice — Códigos de error relacionados

| HTTP | `code` | Dónde | Qué hacer |
|---|---|---|---|
| 403 | `FEATURE_NO_CONTRATADO` (+ `details.origenPosible = "adicional"`) | cualquier ruta de un módulo | §5: mensaje de "venció o fue retirado" + refrescar acceso |
| 403 | `FEATURE_NO_CONTRATADO` (sin `origenPosible`) | cualquier ruta de un módulo | "No incluido en el plan de tu empresa" (como hoy) |
| 403 | `PERMISO_INSUFICIENTE` | módulo contratado por el tenant | Mensaje estándar; refrescar acceso |
