# Prompt para el agente de frontend — Relaciones Comerciales, Fase 08: flujo de venta

Copia y pega este prompt completo al agente de frontend. Antes de implementar, abre `openapi.json`
y confirma los tipos exactos de cada campo/endpoint mencionado.

> Backend: fase completada el 2026-09-17 · plan: docs/plans/relaciones_comerciales/FASE_08_FLUJO_VENTA.md

## 1. Contexto

Cuando A le factura a un socio y somete, la factura viaja sola (si `auto_enviar_ventas` está
activo) y aparece en la bandeja de B como una compra pendiente, ya con un borrador armado. Esta
fase completa el ciclo: enviar a mano, aceptar (somete la compra de verdad, con inventario y
asientos), rechazar, y lo que pasa si A anula su factura después de enviarla.

## 2. Pantallas

- **Detalle de factura de venta** (existente): agregar un badge "Enviado a [socio]" + estado del
  envío B2B cuando el `customer` de la factura es el espejo de una relación activa, y un botón
  **"Enviar al cliente"** visible solo si `auto_enviar_ventas` está apagado o el envío automático
  falló (no hay forma de saber "falló" desde el frontend todavía más que mirando la bandeja — ver
  §5).
- **Bandeja de transacciones** (Fase 06): ahora los botones **Aceptar / Rechazar** tienen
  endpoint real para transacciones `Venta` entrantes. El flujo de "editar" es: ir al borrador de
  compra materializado (link ya viene en `documentoLocal`), editarlo con los endpoints normales de
  `/compras/:id`, y volver a la bandeja a aceptar.

## 3. Endpoints nuevos

| Método | Ruta | Permiso | Notas |
|---|---|---|---|
| `POST` | `/relaciones/ventas/:invoiceId/enviar` | `relaciones.venta.enviar` | Body opcional `{ "reenvioDe": "<transaccionUid>" }` |
| `POST` | `/relaciones/transacciones/:uid/aceptar` | `relaciones.transaccion.aceptar-compra` | Body `{ "mapeo": [...], "sincronizarBarcodes"? }` — **obligatorio** el mapeo completo (Fase 07) |
| `POST` | `/relaciones/transacciones/:uid/rechazar` | `relaciones.transaccion.rechazar` | Body `{ "motivo": "..." }` — motivo obligatorio |

### `POST .../enviar` — errores

| HTTP | Cuándo |
|---|---|
| 400 | La factura no existe, o no está sometida (`docstatus != 1`), o el cliente no es un socio con relación activa |
| 409 | Ya hay una transacción en curso para esa factura — usar `reenvioDe` si es un reenvío tras rechazo |

### `POST .../aceptar` — respuesta y errores

Devuelve la compra ya **sometida** (mismo shape que `POST /compras/:id/submit`), más `mapeo` (el
`ResultadoMapeo` final) y `barcodesSincronizados` si se pidió.

| HTTP | Cuándo | Mensaje |
|---|---|---|
| 400 | Estado no es `Pendiente`/`Requiere Mapeo` | "No se puede aceptar una transacción en estado ..." |
| 400 | El mapeo no está completo | "Todavía hay líneas sin confirmar en el mapeo de artículos — vea GET .../mapeo." |
| 400 | El borrador ya no está en Draft | "El borrador ya no está en estado editable..." |
| — | Cualquier error de `POST /compras/:id/submit` (606 incompleto, stock insuficiente, contado sin pago) sube tal cual — la transacción queda en `Pendiente`, se puede corregir y reintentar aceptar |

### `POST .../rechazar`

Borra el borrador de compra y notifica al origen. Sin respuesta especial más allá de
`{ success: true }`.

## 4. Reglas de UI (obligatorias, no cosméticas)

1. **El diálogo de "Aceptar" debe decir qué va a pasar**: "se registrará y someterá una compra por
   RD$ X, afectando inventario y contabilidad" — no es un simple "confirmar".
2. **El mapeo no se puede saltar.** Antes de mostrar el botón "Aceptar" con efecto, el usuario debe
   pasar por la pantalla de mapeo (Fase 07) y llegar a `puedeAceptar: true`.
3. Si el resultado es `Editada` (el borrador tenía cambios respecto al snapshot original), el
   origen verá luego "Igualar factura al proveedor" — esta fase no construye ese botón (es Fase
   10), pero no hay que prometer que "editar no tiene efecto".
4. **Rechazar exige motivo.** No hay botón de rechazo sin campo de texto.

## 5. Cosas que NO están implementadas todavía

- No hay ninguna señal explícita de "el envío automático falló" en el detalle de la factura — hoy
  solo se ve mirando si la bandeja de transacciones tiene una fila para ese documento. Si el envío
  automático nunca llegó a intentar (relación inactiva, `auto_enviar_ventas` apagado), tampoco hay
  fila. No construyas un indicador que dependa de un campo que no existe.
- Detección de "el destino ya tenía esta factura cargada a mano" (duplicado por `bill_no`) — no
  está implementada; llega con el enlace de documentos (Fase 11).
- El diff detallado línea por línea para "Editada" (qué cambió exactamente) es la Fase 10 — hoy
  `resumenCambios` es un texto genérico ("El total cambió de X a Y" o "La cantidad de líneas
  cambió de X a Y"), no una tabla comparativa.

## 6. Checklist de aceptación para el frontend

- [ ] El botón "Enviar al cliente" en el detalle de factura solo aparece cuando aplica (cliente es
      socio, relación activa, `auto_enviar_ventas` apagado o se sabe que falló).
- [ ] El diálogo de aceptar explica el efecto contable antes de confirmar.
- [ ] Rechazar exige motivo, sin excepciones.
- [ ] Los errores de `submit` de compras (606, stock, pago) se muestran tal cual llegan, sin
      reinterpretarlos.
