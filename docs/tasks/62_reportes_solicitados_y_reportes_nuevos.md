# Prompt para agente de frontend — Reportes Solicitados (async) + 9 reportes nativos nuevos

> Este documento es un prompt autocontenido para un agente de IA de frontend. API base
> `https://gensapi.ryancfx.click/api/v1` (o `http://localhost:4000/api/v1` en desarrollo).
>
> **Refresca tu `openapi.json`** desde `GET /api/docs-json` antes de empezar — todos los
> endpoints de este documento son nuevos. El spec te da el shape exacto de cada DTO de filtros;
> este documento da el contexto de negocio, el patrón de UI y cosas que el spec no puede
> explicar (el flujo de "solicitar → consultar", el manejo de errores).

---

## Parte 1 — Reportes Solicitados (ejecución en background)

### 1.1 Qué es y por qué existe

Algunos reportes (hoy: Movimientos de Inventario / Stock Ledger) pueden tardar mucho en un
tenant con suficiente volumen de datos. En vez de que el usuario se quede esperando con la
pantalla congelada, el backend ahora ofrece un modo alternativo: **encolar el reporte y
consultarlo después**, con una pantalla de "Reportes Solicitados" que muestra el estado de cada
solicitud (en cola / procesando / listo / error).

**Importante — esto es opcional, no un reemplazo:** el endpoint síncrono de siempre
(`GET /reportes/inventario/movimientos`) sigue funcionando exactamente igual que antes. El modo
"solicitar" es una alternativa para cuando el usuario prefiere no esperar, o cuando el reporte
es tan grande que el síncrono se vuelve incómodo. No lo escondas detrás del otro — ofrécelos
como dos formas de pedir el mismo reporte (ej. un botón "Ver ahora" junto a otro "Generar en
segundo plano").

### 1.2 Los 3 endpoints

#### `POST /reportes/inventario/movimientos/solicitar`

Mismos query params que `GET /reportes/inventario/movimientos` (`fromDate`, `toDate`,
`warehouse`, `itemCode`, `branch`). Encola el reporte y responde de inmediato:

```jsonc
{
  "success": true,
  "data": { "solicitudId": "6atkd8f39r", "reportName": "Stock Ledger", "status": "Queued" }
}
```

Guarda `solicitudId` — es lo único que necesitas para consultar el resultado después.

#### `GET /reportes/solicitudes` — listado de solicitudes del usuario actual

Query params opcionales: `reportName` (filtrar por reporte, ej. `"Stock Ledger"`), `limit`
(default 20, máx 100), `offset` (default 0).

```jsonc
{
  "success": true,
  "data": [
    {
      "solicitudId": "6atkd8f39r",
      "reportName": "Stock Ledger",
      "status": "Completed",        // "Queued" | "Started" | "Completed" | "Error"
      "queuedAt": "2026-09-12 20:06:07.775238",
      "completedAt": "2026-09-12 20:06:09.225712",  // null si no ha terminado
      "errorMessage": null
    }
  ],
  "meta": { "limit": 20, "offset": 0 }
}
```

Esta es la pantalla de "Reportes Solicitados" en sí — una tabla con estas filas, ordenadas más
reciente primero. Ojo: **no trae un total** — para paginar, pide una página más y comprueba si
`data.length < limit` (no hay más) o si vino vacío.

#### `GET /reportes/solicitudes/:id` — consultar una solicitud puntual

El shape de la respuesta cambia según `status`:

```jsonc
// Todavía en curso — solo el estado, sin datos
{ "success": true, "data": { "solicitudId": "...", "reportName": "Stock Ledger", "status": "Queued" } }

// Falló
{ "success": true, "data": { "solicitudId": "...", "reportName": "Stock Ledger", "status": "Error",
  "errorMessage": "..." } }

// Listo — el reporte completo, mismo shape {columns, rows} que ya conoces de otros reportes
// nativos (Sales Analytics, Balance Sheet, etc.)
{
  "success": true,
  "data": {
    "solicitudId": "...", "reportName": "Stock Ledger", "status": "Completed",
    "report": { "columns": [...], "rows": [...], "totalRows": 342 }
  }
}
```

### 1.3 Flujo de UI sugerido

1. En la pantalla de Movimientos de Inventario, agrega un botón "Generar en segundo plano" junto
   al comportamiento actual. Al hacer clic, llama a `POST .../solicitar` con los mismos filtros
   que ya tenga aplicados el usuario, y muestra un toast: *"Reporte encolado. Puedes seguir
   trabajando — te avisamos cuando esté listo en Reportes Solicitados."*
2. Pantalla nueva **"Reportes Solicitados"** (ej. bajo el menú de Reportes): tabla de
   `GET /reportes/solicitudes`, columnas Reporte / Estado / Solicitado / Completado. Cada fila en
   `Queued`/`Started` debería seguir haciendo polling (ej. cada 5-10s) o refrescarse al re-entrar
   a la pantalla.
3. Al hacer clic en una fila con `status: "Completed"`, llama a `GET /reportes/solicitudes/:id` y
   renderiza `data.report` con el mismo componente de tabla genérica que ya usas para otros
   reportes `{columns, rows}` — no hace falta un componente nuevo.
4. Una fila en `Error` debería mostrar `errorMessage` y quizás un botón para reintentar (volver a
   llamar `POST .../solicitar` con los mismos filtros).

### 1.4 Permisos

- `reportes.inventario.movimientos.ver` — gatea también el botón "Generar en segundo plano"
  (es el mismo permiso que ya usas para el reporte síncrono, no uno nuevo).
- `reportes.solicitudes.ver` — gatea toda la pantalla "Reportes Solicitados" (listado y consulta
  puntual).

### 1.5 Qué NO hacer todavía

- Solo `POST /reportes/inventario/movimientos/solicitar` existe hoy — no hay endpoint
  `/solicitar` para ningún otro reporte (ni los de la Parte 2 de este documento, ni Libro
  Diario/Mayor, ni ninguno de los ya existentes). No construyas un botón "Generar en segundo
  plano" genérico para todas las pantallas de reportes — solo para Movimientos de Inventario.
- No intentes deducir cuánto va a tardar un reporte — no hay estimación de tiempo en la
  respuesta, solo el estado.

---

## Parte 2 — 9 reportes nativos nuevos

Todos siguen exactamente el mismo patrón que ya conoces de los reportes nativos existentes
(Sales Analytics, Balance Sheet, Stock Ledger, etc.): `GET` con query params → `{success, data:
{columns, rows, totalRows}}`, más un `/pdf` gemelo con los mismos filtros que responde
`application/pdf` binario. Ningún shape nuevo que aprender — la única razón de este documento es
que **el frontend hoy no sabe que estos endpoints existen**.

| Reporte | Endpoint JSON | Filtros (todos opcionales) | Permiso `.ver` |
|---|---|---|---|
| Flujo de Efectivo (Cash Flow) | `GET /reportes/flujo-efectivo` | `fromDate`, `toDate`, `periodicity` (`Monthly`\|`Quarterly`\|`Yearly`), `branch`, `department` | `reportes.contabilidad.flujo-efectivo.ver` |
| Analítica de Compras (Purchase Analytics) | `GET /reportes/compras/analitica` | `fromDate`, `toDate`, `supplier`, `itemCode` | `reportes.compras.analitica.ver` |
| Registro de Compras (Purchase Register) | `GET /reportes/compras/registro` | `fromDate`, `toDate`, `supplier`, `branch`, `department` | `reportes.compras.registro.ver` |
| Registro de Ventas por Artículo (Item-wise Sales Register) | `GET /reportes/ventas/item-wise` | `fromDate`, `toDate`, `customer`, `itemCode` | `reportes.ventas.item-wise.ver` |
| Registro de Compras por Artículo (Item-wise Purchase Register) | `GET /reportes/compras/item-wise` | `fromDate`, `toDate`, `supplier`, `itemCode` | `reportes.compras.item-wise.ver` |
| Analítica de Pedidos (Sales Order Analysis) | `GET /reportes/pedidos/analitica` | `fromDate`, `toDate`, `customer` | `reportes.pedidos.analitica.ver` |
| Analítica de Órdenes de Compra (Purchase Order Analysis) | `GET /reportes/compras/ordenes-analitica` | `fromDate`, `toDate`, `supplier` | `reportes.compras.ordenes-analitica.ver` |
| Antigüedad de Inventario (Stock Ageing) | `GET /reportes/inventario/antiguedad` | `date` (corte, default hoy), `warehouse`, `itemCode` | `reportes.inventario.antiguedad.ver` |
| Proyección de Inventario (Stock Projected Qty) | `GET /reportes/inventario/proyeccion` | `warehouse`, `itemCode` (sin fecha — es una foto en vivo) | `reportes.inventario.proyeccion.ver` |

Cada uno tiene su `/pdf` gemelo (mismo path + `/pdf`, mismos filtros, mismo permiso pero con
sufijo `.imprimir` en vez de `.ver`) — ej. `GET /reportes/flujo-efectivo/pdf` +
`reportes.contabilidad.flujo-efectivo.imprimir`.

### 2.1 Notas puntuales

- **Analítica de Pedidos / Órdenes de Compra** son reportes de *funnel* — muestran cantidad
  pedida vs. entregada/recibida vs. facturada, no montos contables. Sus columnas incluyen
  `pending_qty`, `billed_qty`, `qty_to_bill`, etc. — útil mostrarlos como una barra de progreso
  por línea si el diseño lo permite, no obligatorio.
- **Proyección de Inventario** no tiene rango de fechas — es intencional, es una foto del stock
  actual/reservado/proyectado en este momento, no un reporte histórico.
- **Antigüedad de Inventario** sí tiene un corte (`date`, default hoy) pero no un rango — es
  "¿cómo está el inventario a esta fecha?", no un período.

### 2.2 Qué debe hacer el frontend

- [ ] Agregar las 9 pantallas/reportes de la tabla de arriba en el módulo de Reportes, en la
      sección que corresponda (Contabilidad, Compras, Ventas, Pedidos, Inventario).
- [ ] Cada uno con su botón de descarga de PDF.
- [ ] Gatear cada pantalla/botón con su permiso correspondiente (`GET /me/permissions`), mismo
      mecanismo que ya usas para el resto de `reportes.*`.
- [ ] Implementar la Parte 1 completa (Reportes Solicitados) — pantalla nueva + botón en
      Movimientos de Inventario.
- [ ] Probar contra un tenant con datos reales en cada uno — varios de estos reportes (Pedidos,
      Órdenes de Compra) pueden venir vacíos si el tenant de prueba no tiene esos documentos
      todavía; no es un bug, es falta de datos de prueba.
