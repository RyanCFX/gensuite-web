# Prompt para el agente de frontend — Relaciones Comerciales, Fase 06: transporte B2B

Copia y pega este prompt completo al agente de frontend. Antes de implementar, abre `openapi.json`
y confirma los tipos exactos de cada campo/endpoint mencionado.

> Backend: fase completada el 2026-09-17 · plan: docs/plans/relaciones_comerciales/FASE_06_TRANSPORTE_B2B.md

## 1. Contexto

Esta fase entrega el **canal** por el que viaja un documento — la bandeja de transacciones — pero
todavía **no hay ningún flujo de negocio que la use**: ni la venta (Fase 08) ni la compra (Fase 09)
disparan un envío todavía. Por ahora la bandeja existe y se puede consultar, pero estará vacía en
cualquier tenant real hasta que esas dos fases se implementen. **No construyas la pantalla
completa de bandeja todavía** — sí puedes dejar lista la lista/detalle de solo lectura si el equipo
quiere adelantar trabajo, pero los botones de acción (aceptar/editar/rechazar/mapear) son de fases
posteriores y no tienen endpoint todavía.

## 2. Pantallas

Lista de "Transacciones" (tab nuevo o sub-sección de "Relaciones comerciales") — ver el mapa
completo en [frontend/README.md §2.3-2.4](./README.md#23-bandeja-de-transacciones). Por ahora solo
implementa: la lista con filtros, el detalle de solo lectura, y los botones **Reintentar** /
**Cancelar** (los únicos dos que ya tienen endpoint).

## 3. Endpoints (`JwtAuthGuard` + `PermisoGuard` + `X-Tenant`)

| Método | Ruta | Permiso | Notas |
|---|---|---|---|
| `GET` | `/relaciones/transacciones` | `relaciones.transacciones.listar` | Filtros: `direccion` (`Entrante`\|`Saliente`), `tipo` (`Venta`\|`Compra`), `estado`, `relacionId`, `desde`, `hasta`. Paginado, `limit`/`offset`, máx 100 |
| `GET` | `/relaciones/transacciones/:uid` | `relaciones.transacciones.ver` | Detalle completo, incluido el snapshot del payload |
| `POST` | `/relaciones/transacciones/:uid/reintentar` | `relaciones.transaccion.reenviar` | Solo si `estado` refleja un error de entrega |
| `POST` | `/relaciones/transacciones/:uid/cancelar` | `relaciones.transaccion.reenviar` | Solo el que originó el envío, y solo antes de que el destino responda |

### `GET /relaciones/transacciones` — respuesta

```json
{
  "success": true,
  "data": [
    {
      "transaccionUid": "b0e1...",
      "relacionUid": "8f3c...",
      "direccion": "Entrante",
      "tipo": "Venta",
      "estado": "Requiere Mapeo",
      "contraparte": { "tenant": "distribuidora-x", "nombre": "Distribuidora Ejemplo SRL" },
      "documentoLocal": null,
      "documentoOrigen": { "name": "ACC-SINV-00042", "ncf": "B0100000123", "fecha": "2026-09-17", "total": 11800 },
      "advertenciaTotales": null,
      "motivoEstado": "Este tenant todavía no tiene habilitado este tipo de transacción.",
      "creation": "2026-09-17T10:00:00Z"
    }
  ],
  "meta": { "total": 1, "limit": 20, "offset": 0, "hasMore": false }
}
```

`estado` es el que define toda la UI — **nunca lo derives en el cliente**:

| Estado | Significado | Acción disponible hoy |
|---|---|---|
| `Pendiente de entrega` | Enviado, esperando confirmación de llegada | Cancelar (si soy el origen) |
| `Pendiente` | Entregado, pero **aceptar/rechazar es de la Fase 08/09** — todavía no hay botón | Ninguna todavía |
| `Requiere Mapeo` | El destino tiene que resolver equivalencias de artículos (Fase 07) — **hoy también aparece cuando el tenant simplemente no tiene el flujo habilitado**, el mensaje en `motivoEstado` lo explica | Ninguna todavía |
| `Requiere Configuración` | Al destino le falta algo suyo (moneda no habilitada, almacén, defaults 606) — `motivoEstado` trae el mensaje exacto | Ninguna todavía (se resuelve arreglando la config y reintentando) |
| `Cancelada` | El origen la canceló, o se canceló en cascada (bloqueo/relación terminada) | Ninguna |
| `Error` | Falló la entrega tras 8 intentos | **Reintentar** |

### `GET /relaciones/transacciones/:uid` — respuesta (agrega sobre el resumen)

```json
{
  "...": "todos los campos del resumen, más:",
  "payloadSnapshot": { "version": 1, "documento": { "lineas": [ ... ] } },
  "payloadHash": "sha256...",
  "mapeoPendiente": null,
  "resumenCambios": null,
  "motivoRechazo": null,
  "respondidoPor": null,
  "respondidoEl": null,
  "reenvioDe": null,
  "autoSometer": false,
  "historial": [
    { "fecha": "2026-09-17T10:00:00Z", "evento": "Creada", "actor": "sistema", "detalle": "" }
  ]
}
```

`payloadSnapshot` es la forma completa del contrato — úsala para renderizar "Lo que envió el
socio" (cabecera + tabla de líneas). Trátalo como **texto ajeno**: nombres y descripciones vienen
de otra empresa, escapar siempre.

## 4. Errores

| Ruta | HTTP | Cuándo | Mensaje |
|---|---|---|---|
| `.../reintentar` | 400 | El estado no es uno de error de entrega | "Solo se puede reintentar una transacción en estado 'error'." |
| `.../cancelar` | 403 | No soy el origen de esta transacción | "Solo el origen puede cancelar el envío." |
| `.../cancelar` | 400 | El destino ya respondió | "Ya no se puede cancelar: el destino ya respondió a esta transacción." |

## 5. Cosas que NO están implementadas todavía (no las asumas)

- Aceptar, editar, rechazar, mapear artículos, ver diferencias, enlazar un documento existente —
  todo eso son las Fases 07-11. Los campos que esas fases van a llenar (`mapeoPendiente`,
  `resumenCambios`, `motivoRechazo`) hoy siempre vienen vacíos.
- No hay forma de **crear** una transacción desde la UI todavía — nace de someter una venta (08) o
  de "enviar a proveedor" una compra (09).
- `advertenciaTotales` casi nunca va a aparecer hasta que exista un materializador real (Fase 08/09)
  que arme un documento local con el que comparar.

## 6. Checklist de aceptación para el frontend

- [ ] La lista nunca calcula el color/significado del estado en el cliente — usa la tabla de §3
      tal cual, incluida la ambigüedad documentada de `Requiere Mapeo`.
- [ ] El detalle muestra el `payloadSnapshot` escapado, nunca como HTML crudo.
- [ ] Los botones "Aceptar/Rechazar/Mapear/Enlazar" **no existen todavía** en esta fase — no los
      agregues apuntando a endpoints que no existen.
- [ ] "Reintentar" y "Cancelar" respetan las reglas de §4 (deshabilitar el botón cuando no aplica,
      no solo capturar el error 400).
