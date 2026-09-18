# Prompt para el agente de frontend — Relaciones Comerciales, Fase 07: mapeo de catálogo

Copia y pega este prompt completo al agente de frontend. Antes de implementar, abre `openapi.json`
y confirma los tipos exactos de cada campo/endpoint mencionado.

> Backend: fase completada el 2026-09-17 · plan: docs/plans/relaciones_comerciales/FASE_07_MAPEO_CATALOGO.md

## 1. Contexto

Son dos inventarios distintos. Antes de aceptar una transacción (Fase 08/09, todavía sin
endpoint), el destino tiene que decir, para cada artículo del socio, cuál es su equivalente local.
**El sistema nunca decide solo** — construye este formulario ahora, aunque el botón "Aceptar" que
lo dispara todavía no exista, porque comparte pantalla con el detalle de la transacción (Fase 06).

## 2. Pantalla — Formulario de mapeo (§2.5 del mapa general)

Una fila por línea del documento del socio:

| Columna | Contenido |
|---|---|
| Artículo del socio | Código, nombre, código de barras, cantidad, precio — de `origen` |
| Mi artículo | Selector con buscador sobre el catálogo propio. **Pre-llenado SOLO** si `sugerencia` viene en la respuesta |
| Estado | Badge con uno de los 4 valores de §3 |
| Advertencias | Lista de `advertencias[]` de esa línea, en amarillo, nunca bloqueante por sí sola |
| Acciones | "Usar este" (confirma la sugerencia o el que se buscó) · "Crear artículo desde el socio" · "Buscar otro" |

Botón **"Confirmar todas las sugerencias"**: llama `PUT .../mapeo` con una decisión por cada línea
que ya tenga `sugerencia` (usando exactamente el `itemCode` sugerido). Las líneas `sin_sugerencia`
o `ambigua` igual necesitan que el usuario elija a mano.

Checkbox **"Sincronizar códigos de barra"**, con este texto exacto: *"Los códigos de barra del
socio se agregarán a sus artículos, para reconocerlos automáticamente la próxima vez."* Después de
confirmar, mostrar el resultado (`barcodesSincronizados`), incluidos los omitidos con su motivo.

**No se puede confirmar/aceptar hasta que todas las líneas estén `confirmada`** — el botón
principal de esta pantalla queda deshabilitado mientras `puedeAceptar: false`.

## 3. Endpoints (`JwtAuthGuard` + `PermisoGuard` + `X-Tenant`)

| Método | Ruta | Permiso | Notas |
|---|---|---|---|
| `GET` | `/relaciones/transacciones/:uid/mapeo` | `relaciones.transacciones.ver` | Recalculado en vivo — el catálogo pudo cambiar desde que llegó la transacción |
| `PUT` | `/relaciones/transacciones/:uid/mapeo` | `relaciones.mapeo.guardar` | Confirma decisiones; opcionalmente `sincronizarBarcodes: true` |
| `POST` | `/relaciones/transacciones/:uid/mapeo/crear-articulo` | `relaciones.mapeo.crear-articulo` | Crea el artículo local desde los datos del socio |
| `GET` | `/relaciones/:id/mapeo` | `relaciones.ver` | Mapeo acumulado de la relación (pantalla de mantenimiento, fuera del flujo de una transacción) |
| `PUT` | `/relaciones/:id/mapeo` | `relaciones.mapeo.guardar` | Edita el mapeo acumulado — **reemplaza la lista completa**, no un PATCH incremental |

### `GET /relaciones/transacciones/:uid/mapeo` — respuesta

```json
{
  "lineas": [
    {
      "indice": 1,
      "estado": "sugerida",
      "origen": { "itemCode": "ART-001", "itemName": "Arroz Selecto 5lb", "barcodes": ["7501234567890"], "uom": "Unidad", "cantidad": 10, "precioUnitario": 1000 },
      "sugerencia": { "itemCode": "ARZ-3LB", "itemName": "Arroz 3lb Local", "motivo": "barcode" },
      "local": { "itemCode": "ARZ-3LB", "itemName": "Arroz 3lb Local", "uom": "Unidad", "conversionFactor": 1, "isStockItem": true },
      "advertencias": [],
      "barcodesACopiar": []
    },
    {
      "indice": 2,
      "estado": "ambigua",
      "origen": { "itemCode": "ART-002", "itemName": "Coca Cola 2L", "barcodes": ["111"], "uom": "Unidad", "cantidad": 5, "precioUnitario": 150 },
      "candidatos": [
        { "itemCode": "COCA-2L-A", "itemName": "Coca Cola 2L (bodega)", "motivo": "barcode" },
        { "itemCode": "COCA-2L-B", "itemName": "Coca 2 Litros", "motivo": "barcode" }
      ],
      "advertencias": [],
      "barcodesACopiar": []
    }
  ],
  "puedeAceptar": false,
  "resumen": { "confirmadas": 0, "sugeridas": 1, "sinSugerencia": 0, "ambiguas": 1 }
}
```

**`estado: "ambigua"`** — no ofrezcas "usar este" con ninguno de los candidatos preseleccionado:
el usuario debe elegir explícitamente entre los `candidatos`, o buscar un tercero.

### `PUT /relaciones/transacciones/:uid/mapeo` — body y respuesta

```json
{
  "decisiones": [
    { "indiceLinea": 1, "itemCodeLocal": "ARZ-3LB" },
    { "indiceLinea": 2, "itemCodeLocal": "COCA-2L-A", "uomLocal": "Unidad", "factorConversion": 1 }
  ],
  "sincronizarBarcodes": true
}
```

Respuesta: el mismo `ResultadoMapeo` de arriba (con las líneas ya `confirmada`), más:

```json
{
  "barcodesSincronizados": [
    { "itemCode": "ARZ-3LB", "agregados": ["7501234567890"], "omitidos": [] }
  ],
  "sincronizacionOmitida": null
}
```

Si `sincronizacionOmitida` viene con texto (el usuario pidió sincronizar pero no tiene el permiso),
**mostrarlo como aviso, no como error** — el mapeo sí se confirmó.

### `POST .../mapeo/crear-articulo` — body y respuesta

```json
{ "indiceLinea": 3, "itemGroup": "Mercancía", "isStockItem": true, "itemCode": null, "crearPrecioCompra": false }
```

```json
{ "itemCode": "ART-NUEVO-1", "mapeo": { "lineas": [...], "puedeAceptar": false, "resumen": {...} } }
```

La línea 3 queda `confirmada` automáticamente — refresca la tabla con el `mapeo` que viene en la
misma respuesta, no hace falta un segundo `GET`.

## 4. Los 4 estados de línea — nunca los derives en el cliente

| Estado | Color sugerido | ¿Deja confirmar el formulario? |
|---|---|---|
| `confirmada` | Verde | — (ya está) |
| `sugerida` | Amarillo | No hasta apretar "Usar este" o "Confirmar todas" |
| `sin_sugerencia` | Gris | No — buscar o crear artículo |
| `ambigua` | Naranja | No — elegir uno de `candidatos` |

## 5. Cosas que NO están implementadas todavía

- No existe todavía el botón "Aceptar" que consuma este mapeo — nace en la Fase 08/09. Esta
  pantalla se puede construir y probar de forma aislada contra `GET`/`PUT .../mapeo` igual.
- La verificación fina de UOM ("¿esta unidad está entre las permitidas del artículo?") no se hace
  en el backend en esta fase — si `origen.uom` difiere de `local.uom`, viene una advertencia
  pidiendo confirmar el factor, pero no hay validación adicional contra una lista de UOMs
  permitidas. No construyas UI que dependa de esa validación existiendo.

## 6. Checklist de aceptación para el frontend

- [ ] El botón principal de la pantalla está deshabilitado mientras `puedeAceptar` sea `false`.
- [ ] Ninguna línea se pre-llena por `item_code` o nombre igual — solo por `sugerencia` explícita.
- [ ] `ambigua` nunca preselecciona un candidato.
- [ ] El checkbox de sincronizar barcodes explica el efecto con el texto exacto de §2.
- [ ] `sincronizacionOmitida` se muestra como aviso informativo, no bloquea nada.
