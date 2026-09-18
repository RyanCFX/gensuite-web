# Prompt para el agente de frontend — Relaciones Comerciales, Fase 09: flujo de compra

Copia y pega este prompt completo al agente de frontend. Antes de implementar, abre `openapi.json`
y confirma los tipos exactos de cada campo/endpoint mencionado.

> Backend: fase completada el 2026-09-17 · plan: docs/plans/relaciones_comerciales/FASE_09_FLUJO_COMPRA.md

## 1. Contexto

Es el reverso de la Fase 08: B tiene una compra en **borrador** y se la manda al proveedor en vez
de teclear los datos fiscales a mano. Cuando A acepta, el NCF real vuelve, y si nadie editó nada y
B lo autorizó de antemano, su compra se somete sola.

## 2. Pantallas

- **Detalle de compra en borrador**: botón **"Enviar a proveedor"** con un checkbox **"someter
  automáticamente al aceptar"**. El checkbox puede aparecer deshabilitado si el usuario no tiene
  permiso de someter esa compra — mostrar un tooltip explicando por qué en vez de ocultarlo sin
  más.
- **Detalle de compra ya enviada**: reemplaza el botón por un indicador de estado —
  `GET /compras/:id/estado-socio` trae `estadoSocio` (`Enviada`/`Aceptada`/`Editada`/`Rechazada`),
  y si `estadoSocio` es `Rechazada`, ofrecer **"Reenviar"** (mismo endpoint, con `reenvioDe`).
- **Detalle de venta (en A)**: cuando la venta nace de una compra de un socio (`po_no` trae el
  número de la compra de B), mostrar el precio que propuso B junto al de la lista propia, para que
  la diferencia salte a la vista antes de aceptar o editar.

## 3. Endpoints nuevos

| Método | Ruta | Permiso | Notas |
|---|---|---|---|
| `POST` | `/compras/:id/enviar-a-proveedor` | `relaciones.compra.enviar-a-proveedor` | Body `{ "autoSometer"?, "nota"?, "reenvioDe"? }` |
| `POST` | `/compras/:id/cancelar-envio` | `relaciones.compra.enviar-a-proveedor` | Solo si el proveedor todavía no respondió |
| `GET` | `/compras/:id/estado-socio` | `compras.factura.listar` | Estado B2B sin ir a la bandeja |

Aceptar/rechazar la venta entrante en A usan los mismos endpoints de la Fase 08
(`POST /relaciones/transacciones/:uid/aceptar` con `relaciones.transaccion.aceptar-venta`, y
`/rechazar`).

### `POST .../enviar-a-proveedor` — errores

| HTTP | Cuándo |
|---|---|
| 400 | La compra ya está sometida, no tiene líneas con cantidad > 0, o el proveedor no es un socio con relación activa |
| 403 | Se pidió `autoSometer: true` sin tener permiso real de someter esa compra — **igual se puede reenviar sin esa opción** |
| 409 | Ya hay un envío en curso — usar `reenvioDe` para reenviar tras un rechazo |

### `GET .../estado-socio` — respuesta

```json
{
  "transaccionUid": "b0e1...",
  "estadoSocio": "Aceptada",
  "autoSometerAutorizadoPor": "ana@empresa.do",
  "ncf": "B0100000123",
  "billNo": "ACC-SINV-00042"
}
```

Todos los campos pueden ser `null` si la compra nunca se envió por este canal.

## 4. Reglas de UI

1. El checkbox de auto-someter **no promete nada si no hay permiso** — mostrar el 403 como
   explicación ("Necesita permiso para someter compras para activar esto"), no como error genérico.
2. **Si `estadoSocio` es `Editada`**, mostrar la advertencia de que el proveedor cambió algo y
   ofrecer "Igualar factura al proveedor" (Fase 10 — todavía no tiene endpoint, dejar el botón
   deshabilitado o pendiente).
3. Auto-someter **nunca es instantáneo** — pasa cuando A acepta, que puede ser horas después. La UI
   no debe sugerir que se somete al momento de enviar.
4. Si `autoSometerAutorizadoPor` quedó lleno pero la compra sigue en borrador después de que A
   aceptó, es porque el auto-someter no pudo ejecutarse (usuario sin permiso ya, o compra de
   Contado) — mostrar el mensaje que traiga la bandeja, no asumir que "algo falló".

## 5. Cosas que NO están implementadas todavía

- Precio sugerido de la lista propia junto a cada línea del borrador de venta en A — se puede
  calcular en el frontend consultando `/config/listas-precio` para ese cliente si hace falta antes
  de que el backend lo traiga resuelto.
- Recordatorio automático a los 3 días si A no responde — no hay nada que mostrar de esto todavía.
- El diff detallado de qué cambió exactamente (Fase 10).

## 6. Checklist de aceptación para el frontend

- [ ] El botón "Enviar a proveedor" desaparece (se reemplaza por el estado) una vez enviado.
- [ ] "Reenviar" solo aparece cuando `estadoSocio === 'Rechazada'`.
- [ ] El 403 de `autoSometer` no bloquea el envío sin esa opción.
- [ ] El precio del socio se muestra junto al de la lista propia en el detalle de venta entrante.
