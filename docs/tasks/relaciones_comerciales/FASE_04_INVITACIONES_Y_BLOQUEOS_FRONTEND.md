# Prompt para el agente de frontend — Relaciones Comerciales, Fase 04: invitaciones y bloqueos

Copia y pega este prompt completo al agente de frontend. Antes de implementar, abre `openapi.json`
y confirma los tipos exactos de cada campo/endpoint mencionado.

> Backend: fase completada el 2026-09-18 · plan: docs/plans/relaciones_comerciales/FASE_04_INVITACIONES_Y_BLOQUEOS.md

## 1. Contexto

El trámite completo para que dos empresas se vuelvan socias. Al terminar esta fase la invitación
queda aceptada y encolada para activarse — la pantalla que muestra el `Customer`/`Supplier` ya
creados es la Fase 05 (todavía no existe: hoy, tras aceptar, la relación queda en estado
`invitada` un rato hasta que corra la activación).

## 2. Pantallas

"Relaciones comerciales" con tres tabs (Socios / Invitaciones / Bloqueadas — Socios lo llena la
Fase 05), más el asistente de "Nueva relación comercial" (paso 2, después del directorio de la
Fase 03): formulario de mensaje + términos comerciales opcionales, y la pantalla pública que abre
el link del correo (3 estados: pendiente con botones, ya respondida, vencida).

## 3. Endpoints autenticados (`JwtAuthGuard` + `X-Tenant`)

| Método | Ruta | Permiso |
|---|---|---|
| `POST` | `/relaciones/invitaciones` | `relaciones.invitacion.crear` |
| `GET` | `/relaciones/invitaciones?direccion=enviadas\|recibidas&estado=...` | `relaciones.invitacion.listar` |
| `GET` | `/relaciones/invitaciones/:id` | `relaciones.invitacion.listar` |
| `POST` | `/relaciones/invitaciones/:id/cancelar` | `relaciones.invitacion.cancelar` |
| `POST` | `/relaciones/invitaciones/:id/reenviar` | `relaciones.invitacion.crear` |
| `POST` | `/relaciones/invitaciones/:id/aceptar` | `relaciones.invitacion.responder` |
| `POST` | `/relaciones/invitaciones/:id/rechazar` | `relaciones.invitacion.responder` |
| `GET` | `/relaciones/bloqueos?incluirLevantados=true` | `relaciones.bloqueo.listar` |
| `POST` | `/relaciones/bloqueos` | `relaciones.bloqueo.crear` |
| `POST` | `/relaciones/bloqueos/:id/levantar` | `relaciones.bloqueo.levantar` |

`GET /relaciones/bloqueos` **solo** devuelve lo que la propia empresa bloqueó — no existe (ni
existirá) un endpoint para ver quién te bloqueó a ti.

### `POST /relaciones/invitaciones` — body

```json
{
  "tenantDestinoId": "8f3c...",
  "mensaje": "Somos su distribuidor desde 2019, formalicemos el canal.",
  "terminos": { "tieneCredito": true, "diasCredito": 30, "grupoCliente": "Mayorista" }
}
```

`tenantDestinoId` sale del directorio (Fase 03) — nunca un slug ni un RNC. `terminos` es
opcional, forma completa en `TerminosComercialesDto` (ver Fase 01 §2.3): `tieneCredito`,
`diasCredito`, `limiteCredito`, `grupoCliente`, `cuentaCxcAlterna`, `encargadoCxc`,
`formaPagoDefault`, y del lado proveedor `grupoProveedor`, `diasCreditoProveedor`,
`cuentaCxpAlterna`, `tipoBienes606`, `formaPago606`.

### Errores de `POST /relaciones/invitaciones` (y de `reenviar`) — todos con `code` + `message`

| HTTP | `code` | Cuándo | Texto sugerido |
|---|---|---|---|
| 404 | — | Empresa no existe o no está activa | "Empresa no encontrada." |
| 400 | — | Es la propia empresa | "No puede relacionarse con su propia empresa." |
| 409 | `RELACION_BLOQUEADA` | Bloqueo activo (destino→origen) | "Esta empresa no está aceptando solicitudes de relación comercial." |
| 409 | `RELACION_YA_EXISTE` | Ya hay relación activa | "Ya existe una relación comercial activa con esta empresa." |
| 409 | `INVITACION_PENDIENTE` | Ya hay invitación pendiente | "Ya hay una invitación pendiente entre ambas empresas." |
| 409 | `TENANT_SIN_CUENTA_SERVICIO` | Falta aprovisionar (raro, error operativo) | Mostrar tal cual, es para soporte |
| 400 | — | Un término no existe en tu catálogo | Mostrar el mensaje tal cual — nombra el campo |

**La respuesta de crear NUNCA contiene el token** — no lo esperes en ningún campo.

### Respuesta de crear/aceptar — incluye `maestrosLocales` (D15)

```json
{
  "id": "...", "status": "pendiente", "fromTenantId": "...", "toTenantId": "...",
  "mensaje": "...", "expiresAt": "2026-09-25T...", "createdAt": "2026-09-18T...",
  "maestrosLocales": {
    "customer": { "name": "CUST-0043", "nombre": "Distribuidora Ejemplo", "disabled": false },
    "supplier": null,
    "duplicados": { "customer": false, "supplier": false }
  }
}
```

Mismo aviso de adopción que en el directorio (Fase 03 §6) — muéstralo también acá, antes de que
el usuario confirme.

### `POST /relaciones/invitaciones/:id/rechazar` — body

```json
{ "motivo": "No trabajamos con distribuidores fuera de la región", "bloquear": false }
```

Si `bloquear: true`, además queda bloqueada — no hay confirmación extra del backend, el checkbox
en el formulario ES la confirmación.

## 4. Endpoints públicos (sin login) — pantalla del correo

| Método | Ruta |
|---|---|
| `GET` | `/relaciones/invitaciones/token/:token` |
| `POST` | `/relaciones/invitaciones/token/:token/aceptar` (body: `{ "email"?: string }`) |
| `POST` | `/relaciones/invitaciones/token/:token/rechazar` (body: `{ "motivo"?, "bloquear"?, "email"? }`) |

`email` es **informativo, nunca verificado** — no lo trates como autenticación.

### Respuesta del `GET` — 3 estados posibles

**Pendiente** (muestra botones Aceptar/Rechazar):
```json
{
  "estado": "pendiente",
  "empresaOrigen": { "nombre": "Distribuidora Ejemplo", "rnc": "131234567" },
  "empresaDestino": { "nombre": "Mi Empresa SRL" },
  "mensaje": "...",
  "expiraEl": "2026-09-25T14:03:00Z",
  "terminosPropuestos": { "tieneCredito": true, "diasCredito": 30 }
}
```

**Ya respondida** (`estado`: `aceptada`/`rechazada`/`cancelada` — sin botones, solo el resultado):
```json
{ "estado": "aceptada", "empresaOrigen": {...}, "empresaDestino": {...}, "resultado": { "respondidoEl": "...", "motivo": null } }
```

**Vencida o inexistente**: el `GET` de un token vencido devuelve `estado: "expirada"` con 200 (no
error) — pero **aceptar/rechazar** un token vencido sí da `410`, y un token que nunca existió da
`404` con el mismo mensaje genérico que el vencido (no reveles la diferencia en la UI tampoco).

### Errores de `POST .../aceptar` y `.../rechazar`

| HTTP | Cuándo | Qué mostrar |
|---|---|---|
| 404 | Token inexistente | "Esta invitación no existe o ya no está disponible." |
| 410 | Token vencido | "Esta invitación venció. Pida que se la reenvíen." |
| 409 | Ya fue respondida | Muestra el `resultado` que viene en el body del error (mismo shape que el `GET`) |

## 5. Checklist de aceptación para el frontend

- [ ] El formulario de invitar muestra el aviso de `maestrosLocales` antes de confirmar.
- [ ] Cada código de error de la tabla de §3 tiene su texto exacto, sin inventar mensajes nuevos.
- [ ] La pantalla pública nunca pide login, y trata `estado: "expirada"` del `GET` igual que un
      token vencido en un POST (mismo mensaje).
- [ ] "Reenviar" no reutiliza el link viejo — después de reenviar, cualquier link anterior queda
      inválido para responder (aunque el `GET` público del token viejo lo siga mostrando con su
      resultado histórico si ya se había respondido).
- [ ] El tab "Bloqueadas" no tiene forma de ver quién te bloqueó — ese caso ni siquiera es un
      estado en la UI, es simplemente indistinguible de otros "no se puede invitar".
