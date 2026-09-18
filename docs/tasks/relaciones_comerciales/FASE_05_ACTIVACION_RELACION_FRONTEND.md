# Prompt para el agente de frontend — Relaciones Comerciales, Fase 05: activación

Copia y pega este prompt completo al agente de frontend. Antes de implementar, abre `openapi.json`
y confirma los tipos exactos de cada campo/endpoint mencionado.

> Backend: fase completada el 2026-09-17 · plan: docs/plans/relaciones_comerciales/FASE_05_ACTIVACION_RELACION.md

## 1. Contexto

Al aceptar una invitación (Fase 04) la relación queda `invitada` mientras se crean, en cada site
de ERPNext, el `Customer` y el `Supplier` que representan al socio (y se adopta el que ya existía
si el RNC coincide con uno del catálogo, en vez de duplicarlo). Esta fase entrega el tab **Socios**
completo: listar, ver detalle, configurar automatización, editar términos, y resolver a mano los
dos únicos casos en los que el sistema se detiene a esperar una decisión humana.

## 2. Pantallas

Tab **Socios** de "Relaciones comerciales" (ver mapa completo en
[frontend/README.md §2](./README.md#21-relaciones-comerciales-menú-principal)): lista + detalle.
El detalle todavía no tiene "Mapeo de artículos" ni "Historial de transacciones" con datos reales
(Fases 07/08/09) — dejar esas secciones como "próximamente" o vacías, no como error.

## 3. Endpoints (`JwtAuthGuard` + `PermisoGuard` + `X-Tenant`)

| Método | Ruta | Permiso | Notas |
|---|---|---|---|
| `GET` | `/relaciones?limit=20&offset=0` | `relaciones.listar` | Paginado — máx `limit=100` |
| `GET` | `/relaciones/:id` | `relaciones.ver` | Detalle |
| `PUT` | `/relaciones/:id/configuracion` | `relaciones.configurar` | Almacén, 606, automatización |
| `PUT` | `/relaciones/:id/terminos` | `relaciones.configurar` | Reescribe términos sobre Customer/Supplier locales |
| `POST` | `/relaciones/:id/reintentar-activacion` | `relaciones.configurar` | Re-encola el outbox de este lado |
| `GET` | `/relaciones/:id/maestros-candidatos` | `relaciones.ver` | Para resolver `RNC_DUPLICADO_EN_SITE` |
| `POST` | `/relaciones/:id/adoptar-maestros` | `relaciones.configurar` | `{ customer?, supplier? }` — elige/cambia el vínculo |
| `POST` | `/relaciones/:id/suspender` | `relaciones.configurar` | No se envían ni aceptan transacciones nuevas |
| `POST` | `/relaciones/:id/reactivar` | `relaciones.configurar` | Vuelve a `activa` |
| `POST` | `/relaciones/:id/terminar` | `relaciones.terminar` | No borra los espejos, solo desvincula |

### `GET /relaciones` — respuesta (paginada, mismo shape que el resto del BFF)

```json
{
  "success": true,
  "data": [
    {
      "id": "8f3c...",
      "status": "activando",
      "contraparte": { "tenantId": "...", "nombre": "Distribuidora Ejemplo" },
      "activatedAt": null,
      "createdAt": "2026-09-17T10:00:00Z"
    }
  ],
  "meta": { "total": 3, "limit": 20, "offset": 0, "hasMore": false }
}
```

`status` puede ser `activando` (**derivado**, no es un valor real del enum — significa "la
invitación se aceptó, los espejos se están creando en este momento") además de
`invitada | activa | rechazada | revocada | suspendida`. Mostrar `activando` como un estado de
carga, no como error, y refrescar la lista con un intervalo razonable (no polling agresivo).

### `GET /relaciones/:id` — respuesta

```json
{
  "id": "8f3c...",
  "status": "activa",
  "contraparte": { "tenantId": "...", "nombre": "Distribuidora Ejemplo", "rnc": "131234567" },
  "customer": "CUST-0043",
  "supplier": "SUP-0012",
  "configuracion": {
    "almacenDestino": null,
    "tipoBienes606": null,
    "formaPago606": null,
    "autoEnviarVentas": true,
    "autoEnviarCompras": false,
    "mapeoEstricto": true
  },
  "activatedAt": "2026-09-17T10:02:00Z",
  "createdAt": "2026-09-17T10:00:00Z"
}
```

`configuracion` es `null` mientras este lado no se haya activado todavía (recién invitada). Si
`almacenDestino` sigue vacío, mostrarlo como advertencia: **es obligatorio antes de poder aceptar
una compra entrante con artículos de stock** (Fase 08/09) — puede configurarse ahora mismo desde
esta misma pantalla.

### `PUT /relaciones/:id/configuracion` — body (todos los campos opcionales, solo se aplican los que vengan)

```json
{
  "almacenDestino": "Almacén Principal - GS",
  "tipoBienes606": "01",
  "formaPago606": "01",
  "autoEnviarVentas": true,
  "autoEnviarCompras": false,
  "mapeoEstricto": true
}
```

### `PUT /relaciones/:id/terminos` — body

Mismo `TerminosComercialesDto` que en la invitación (Fase 04): `tieneCredito`, `diasCredito`,
`limiteCredito` (**no implementado todavía** — ver §6), `grupoCliente`, `cuentaCxcAlterna`,
`encargadoCxc`, `formaPagoDefault`, `grupoProveedor`, `diasCreditoProveedor`, `cuentaCxpAlterna`,
`tipoBienes606`, `formaPago606`. Se aplican sobre el `Customer`/`Supplier` **locales** de este
lado — nunca sobre los de la contraparte. Da `400` con el nombre del campo si referencia algo que
no existe en el catálogo del propio site (mismo validador que en la invitación).

## 4. Los dos errores que necesitan pantalla propia (no un toast)

### `RNC_DUPLICADO_EN_SITE`

La activación de un lado se detiene cuando el RNC del socio coincide con **más de un** `Customer`
o `Supplier` local. `GET /relaciones/:id/maestros-candidatos`:

```json
{
  "customers": [
    { "name": "CUST-0043", "nombre": "Distribuidora Ejemplo SRL", "disabled": false, "yaVinculadoAOtraRelacion": false, "documentos": 12, "saldo": 4500.0 },
    { "name": "CUST-0091", "nombre": "Distribuidora Ejemplo", "disabled": true, "yaVinculadoAOtraRelacion": false, "documentos": 0, "saldo": 0 }
  ],
  "suppliers": []
}
```

Mostrar **nombre, si está deshabilitado, cantidad de documentos y saldo** de cada candidato —
elegir mal tiene consecuencias contables, así que el saldo es obligatorio en la UI, no opcional.
`suppliers: []` significa que del lado proveedor no hay ambigüedad (0 o 1 candidato); no ofrecer un
selector vacío como si fuera un error.

`POST /relaciones/:id/adoptar-maestros` con `{ "customer": "CUST-0043" }` (y/o `"supplier"`)
vincula el elegido y relanza la activación. Sirve también para **cambiar** un vínculo hecho por
error.

### `MAESTRO_YA_VINCULADO`

El candidato encontrado ya es el espejo de **otra** relación comercial (normalmente, dos tenants
con el mismo RNC — un mismo grupo empresarial con dos cuentas de GenSuite). No hay autoservicio
para esto: mostrar el mensaje explicando la situación y ofrecer contactar soporte. No existe un
endpoint para "desvincular a la fuerza" desde este candidato — sería pisar la relación de otro
socio.

## 5. Estado de la sección "Registros vinculados" del detalle

Mientras `status` sea `invitada` o `activando`, no mostrar el bloque de `Customer`/`Supplier`
vinculados (todavía puede no existir de este lado). En cuanto `customer`/`supplier` del `GET
/relaciones/:id` dejen de ser `null`, mostrarlos con link al registro (`/clientes/:name`,
`/proveedores/:name`) — no hay forma de saber desde este endpoint si fueron **adoptados** o
**creados**; si esa distinción importa en la UI, pedirla en una fase posterior (hoy no viaja en la
respuesta).

## 6. Cosas que NO están implementadas todavía (no las asumas)

- `limiteCredito` en `PUT /relaciones/:id/terminos` **se acepta en el body pero no se aplica** —
  el backend no toca el `Customer Credit Limit` (child table) en esta fase. No mostrar el campo
  como si tuviera efecto, o marcarlo "próximamente".
- No hay endpoint para ver **quién** adoptó qué ni el detalle del `historial` del doctype — solo
  existe internamente en ERPNext. Si se necesita en la UI, es trabajo de una fase futura.
- "Mapeo de artículos" y "Historial de transacciones" del detalle (§2.2 del mapa general) son de
  las Fases 07/08/09 — todavía no hay datos que mostrar.

## 7. Checklist de aceptación para el frontend

- [ ] La lista de socios muestra `activando` como estado de carga (no como error) y se actualiza
      sola con un intervalo razonable.
- [ ] El detalle avisa de forma visible si `almacenDestino` está vacío, con acceso directo a
      configurarlo.
- [ ] `RNC_DUPLICADO_EN_SITE` tiene pantalla propia con saldo y cantidad de documentos por
      candidato — nunca un toast genérico.
- [ ] `MAESTRO_YA_VINCULADO` explica la situación sin ofrecer una acción que no existe.
- [ ] Suspender/Reactivar/Terminar piden confirmación explícita (terminar dice que los registros
      de cliente/proveedor **no** se borran).
- [ ] El campo `limiteCredito` del formulario de términos no promete un efecto que hoy no existe.
