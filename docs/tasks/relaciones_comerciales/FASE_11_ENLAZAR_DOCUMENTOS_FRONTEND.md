# Prompt para el agente de frontend — Relaciones Comerciales, Fase 11: enlazar documentos

Copia y pega este prompt completo al agente de frontend. Antes de implementar, abre `openapi.json`
y confirma los tipos exactos de cada campo/endpoint mencionado.

> Backend: fase completada el 2026-09-18 · plan: docs/plans/relaciones_comerciales/FASE_11_ENLAZAR_DOCUMENTOS.md

## 1. Contexto

Las dos empresas ya venían operando antes de formalizar la relación — la factura puede estar
registrada a mano en cualquiera de los dos lados. Esta fase agrega **enlazar**: en vez de crear un
documento nuevo, señalar "esto ya lo tengo" y conciliar. Es de solo lectura para los documentos:
nadie edita nada sometido.

## 2. Pantallas

- **Bandeja de transacciones — botón "Enlazar documento existente"**: aparece junto a Aceptar/
  Rechazar. Abre el buscador de candidatos.
- **Buscador de candidatos**: lista ordenada por `score`, mostrando `coincidencias` como chips
  ("NCF", "Total", "Fecha"). El usuario elige uno — **nunca se preselecciona nada**, ni con
  coincidencia de NCF exacta.
- **Formulario de emparejamiento de líneas**: igual al de mapeo (Fase 07), pero el título dice "a
  qué línea de ESTE documento corresponde" en vez de "a qué artículo de mi catálogo".
- **Vista de diferencias en modo solo lectura**: cuando la transacción queda `Enlazada`, se
  muestra el mismo diff de la Fase 10 pero **sin el botón "Igualar"** — los dos documentos están
  sometidos, nadie los edita.
- **Detalle de factura/compra sometida**: botón **"Enviar al proveedor"** (compra ya sometida) o
  usar el flujo normal de "Enviar" (venta ya sometida, Fase 08 — no hace falta un botón nuevo, el
  mismo sirve porque ya acepta documentos sometidos).

## 3. Endpoints (`JwtAuthGuard` + `PermisoGuard` + `X-Tenant`)

| Método | Ruta | Permiso | Notas |
|---|---|---|---|
| `GET` | `/relaciones/:id/documentos-enlazables?desde=&hasta=` | `relaciones.transaccion.buscar-candidatos` | Lado origen, venta: facturas sometidas del Customer espejo |
| `POST` | `/compras/:id/enlazar-y-enviar` | `relaciones.compra.enlazar-y-enviar` | Lado origen, compra YA SOMETIDA — sin `autoSometer` |
| `GET` | `/relaciones/transacciones/:uid/candidatos-enlace?desde=&hasta=` | `relaciones.transaccion.buscar-candidatos` | Lado destino |
| `POST` | `/relaciones/transacciones/:uid/enlazar` | `relaciones.transaccion.enlazar-compra` | Lado destino |

### `GET .../candidatos-enlace` — respuesta

```json
[
  { "name": "PINV-0042", "fecha": "2026-09-10", "total": 11800, "ncf": "B0100000123", "billNo": "ACC-SINV-1", "score": 170, "coincidencias": ["ncf", "total", "fecha"] }
]
```

Ordenado por `score` descendente — no reordenar en el cliente. Mostrar `coincidencias` como la
explicación de por qué aparece cada candidato.

### `POST /compras/:id/enlazar-y-enviar` — body

```json
{ "relacionId": "8f3c...", "nota": "Factura recibida en físico el 2026-09-10" }
```

Errores: 400 si la compra no está sometida (sugerir el botón normal de "Enviar a proveedor" para
un borrador), 400 si `relacionId` no corresponde al proveedor del documento, 409 si ya hay un
envío en curso.

### `POST /relaciones/transacciones/:uid/enlazar` — body

```json
{
  "docname": "ACC-PINV-2026-00311",
  "mapeo": [{ "indiceLinea": 1, "itemCodeLocal": "ARZ-5LB" }],
  "sincronizarBarcodes": true,
  "notaParaElSocio": "Ya la teníamos registrada del 10/09"
}
```

`mapeo` es obligatorio y completo — igual que aceptar (Fase 07/08).

| HTTP | `code` | Cuándo | Qué mostrar |
|---|---|---|---|
| 400 | `DOCUMENTO_NO_SOMETIDO` | El documento a enlazar no está sometido | "Solo se pueden enlazar documentos ya sometidos" |
| 400 | `RNC_NO_COINCIDE` | El cliente/proveedor del documento no tiene el RNC de la contraparte | Explicar que debe coincidir el RNC — sin excepciones |
| 400 | `MONEDA_NO_COINCIDE` | Monedas distintas | Mostrar ambas monedas |
| 409 | `DOCUMENTO_YA_ENLAZADO` | Ese documento ya está enlazado a otra transacción | "Ya está conciliado con otra operación" |
| 400 | `MAPEO_INCOMPLETO` | Faltan líneas por emparejar | Volver al formulario de mapeo |
| 409 | `YA_EXISTE_DOCUMENTO_SOMETIDO` | El borrador que el sistema había preparado ya fue sometido por otra vía | "Tiene dos documentos para la misma operación — anule uno antes de continuar" |

Respuesta exitosa: `{ message, diff, advertenciaFiscal? }` — si `advertenciaFiscal` viene, mostrarla
con máxima prioridad (rojo, no un toast que desaparece): significa que dos NCF no coinciden.

## 4. La restricción de NCF (§3.3) — muy importante para la UI

Cuando una transacción de tipo compra viene con `origen_ya_sometido` (consultar el detalle de la
transacción, Fase 06), **el botón "Aceptar" no debe mostrarse**. En su lugar: "Enlazar mi factura"
y "Rechazar". Si el usuario de todas formas intenta aceptar (por ejemplo, llamando el endpoint
viejo desde una pestaña vieja), el backend devuelve `409 ORIGEN_YA_SOMETIDO` con el mensaje
explicando por qué — mostrarlo, no reintentar.

## 5. Cosas que NO están implementadas todavía

- El buscador de candidatos no pondera "misma cantidad de líneas" — el `score` solo usa NCF,
  número de factura, total y fecha.
- Cuando el RNC coincide pero el cliente/proveedor enlazado no es el espejo registrado de la
  relación (un duplicado viejo), el enlace se permite pero la respuesta **no** trae un código de
  advertencia distinto — no se puede mostrar un aviso especial para ese caso todavía.
- La notificación al origen cuando el destino enlaza usa el mismo texto que "aceptada" —
  `relaciones_transaccion_enlazada` existe como plantilla pero no se está disparando todavía con
  su texto específico ("su socio ya tenía esto registrado").

## 6. Checklist de aceptación para el frontend

- [ ] El botón "Enlazar" nunca preselecciona un candidato, ni con NCF idéntico.
- [ ] La vista de diferencias de una transacción `Enlazada` nunca muestra "Igualar".
- [ ] Cuando `origen_ya_sometido` es verdadero, "Aceptar" no aparece — solo Enlazar/Rechazar.
- [ ] `advertenciaFiscal` se muestra de forma prominente, no como un toast que desaparece solo.
