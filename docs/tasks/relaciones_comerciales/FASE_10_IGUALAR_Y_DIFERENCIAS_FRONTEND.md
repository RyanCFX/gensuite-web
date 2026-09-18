# Prompt para el agente de frontend — Relaciones Comerciales, Fase 10: diferencias e igualar

Copia y pega este prompt completo al agente de frontend. Antes de implementar, abre `openapi.json`
y confirma los tipos exactos de cada campo/endpoint mencionado.

> Backend: fase completada el 2026-09-18 · plan: docs/plans/relaciones_comerciales/FASE_10_IGUALAR_Y_DIFERENCIAS.md

## 1. Contexto

Cuando el socio editó antes de aceptar, las dos empresas quedan con versiones distintas de la
misma operación. Esta fase entrega el diff estructurado y los dos botones de "Igualar" — uno para
cuando el documento local sigue en borrador, otro (mucho más serio) para cuando ya está sometido.

## 2. Pantalla — Comparación lado a lado

En el detalle de una transacción `Editada`, agregar la zona de diferencias:

| Columna | Contenido |
|---|---|
| Lo que envió/tiene el socio | `itemOrigen`, cantidad/precio/descuento/uom "origen" |
| Lo que tiene usted | `itemDestino`, los mismos campos "destino" |
| Estado | Badge: `igual` (gris, no mostrar por defecto) · `modificada` (amarillo) · `agregada` (azul, "usted agregó esto") · `eliminada` (rojo, "el socio la tiene y usted no") |

Cabecera: mostrar `cabecera[]` como una tabla corta de 2 columnas (Origen / Usted) — no se compara
`fecha` (la fecha contable siempre la resiembra el destino, no es una diferencia real).

`totales.diferenciaPct` — mostrar destacado ("−4.2%" o "+12,000 RD$") junto al resumen.

## 3. Endpoints (`JwtAuthGuard` + `PermisoGuard` + `X-Tenant`)

| Método | Ruta | Permiso | Notas |
|---|---|---|---|
| `GET` | `/relaciones/transacciones/:uid/diff` | `relaciones.transacciones.ver` | Recalculado en vivo |
| `POST` | `/relaciones/transacciones/:uid/igualar` | `relaciones.compra.igualar` | Solo si el documento local sigue en BORRADOR |
| `POST` | `/relaciones/transacciones/:uid/igualar-con-enmienda` | `relaciones.venta.igualar` | Solo si el documento local está SOMETIDO |

**Estos dos botones nunca coexisten en la misma pantalla** — cuál mostrar depende de si el
`documentoLocal` de la transacción (Fase 06 §4) está en borrador o sometido. Consultarlo antes de
decidir cuál renderizar.

### `GET /diff` — respuesta

```json
{
  "huboCambios": true,
  "cabecera": [{ "campo": "fechaVencimiento", "origen": "2026-10-17", "destino": "2026-10-20" }],
  "lineas": [
    {
      "estado": "modificada",
      "indiceOrigen": 1,
      "itemOrigen": { "itemCode": "ART-001", "itemName": "Arroz Selecto 5lb" },
      "itemDestino": { "itemCode": "ARZ-3LB", "itemName": "Arroz 3lb Local" },
      "cambios": [{ "campo": "cantidad", "origen": 10, "destino": 8, "deltaPct": -20 }]
    }
  ],
  "totales": { "origen": 11800, "destino": 10440, "diferencia": -1360, "diferenciaPct": -11.5 },
  "resumenTexto": "1 línea(s) modificada(s); total -11.5%"
}
```

### `POST /igualar` — body y errores

```json
{ "aplicar": ["lineas", "cabecera"] }
```

(`aplicar` es opcional — por defecto aplica todo.)

| HTTP | `code` | Cuándo | Qué mostrar |
|---|---|---|---|
| 400 | — | El documento local ya no es un borrador | "Use el otro botón — sugerirlo directamente" |
| 409 | `MAPEO_INCOMPLETO` | Una línea nueva del socio no tiene equivalente mapeado | Llevar al formulario de mapeo (Fase 07) con `itemCodesSinMapeo` resaltados, **nada se aplicó** |

Respuesta exitosa: `{ message, diff }` — el `diff` recalculado (debe dar `huboCambios: false`).
**No se somete nada** — decirlo explícitamente después de igualar: "El documento fue actualizado;
revíselo y sométalo cuando esté listo."

### `POST /igualar-con-enmienda` — body y errores

```json
{ "confirmoAnulacion": true, "motivoAnulacion": "El proveedor cambió los precios acordados" }
```

**El diálogo de confirmación es obligatorio y debe decir, con todas las letras**: *"Esto anulará
la factura [NCF actual] y creará una nueva versión en borrador con un NCF distinto. La factura
anulada no se puede recuperar."* `confirmoAnulacion` es literalmente el checkbox de ese diálogo.

| HTTP | `code` | Cuándo | Qué mostrar (siempre sugiriendo la nota de crédito como alternativa) |
|---|---|---|---|
| 400 | — | Falta `confirmoAnulacion: true`, o el documento no está sometido | Mensaje tal cual |
| 409 | `FACTURA_COBRADA` | Tiene cobros aplicados | "Revierta el cobro antes de igualar, o emita una nota de crédito por la diferencia" |
| 409 | `NOTAS_CREDITO_ENLAZADAS` | Tiene notas de crédito/débito enlazadas | "Resuélvalas antes, o emita una nota de crédito adicional" |
| 409 | `ECF_YA_EMITIDO` | Tiene un e-CF emitido | "Anular un e-CF tiene su propio procedimiento — use una nota de crédito por la diferencia" |
| 409 | `PERMISOS_INSUFICIENTES` | Falta permiso de cancelar, enmendar o someter | Mensaje tal cual |

Respuesta exitosa: `{ message, nuevoDocname, diff }` — **la enmienda queda en borrador, SIN NCF
todavía**. El mensaje debe decir explícitamente que hay que revisarla y someterla a mano — no
prometer que ya se envió al socio (ese es un paso manual posterior con el botón normal de
"Enviar", usando `reenvioDe`).

## 4. Cosas que NO están implementadas todavía

- El correo de "editada" no trae una tabla con las líneas cambiadas — solo el texto de una línea
  (`resumenTexto`). El detalle completo hay que verlo en la pantalla, no en el correo.
- `igualar-con-enmienda` no verifica si el período contable está cerrado ni si hay secuencia NCF
  disponible — si alguna de esas dos cosas falla, el error aparecerá recién si el usuario intenta
  someter la enmienda después (no al enmendar).
- `condicionPago` se detecta en el diff pero **no se aplica** al igualar un borrador — si cambia,
  queda como una diferencia informativa nada más.

## 5. Checklist de aceptación para el frontend

- [ ] Los dos botones de igualar nunca aparecen juntos — se decide por el estado del documento local.
- [ ] El diálogo de "igualar con enmienda" explica la anulación y el NCF nuevo antes de confirmar.
- [ ] `MAPEO_INCOMPLETO` lleva al formulario de mapeo, no a un toast genérico.
- [ ] Ningún mensaje de error de `igualar-con-enmienda` deja al usuario sin salida — todos
      sugieren la nota de crédito como alternativa.
