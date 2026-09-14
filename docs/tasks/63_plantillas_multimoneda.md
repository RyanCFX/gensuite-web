# Prompt para agente de frontend — Desglose multimoneda en el editor de plantillas de impresión

> Este documento es un prompt autocontenido para un agente de IA de frontend. Asume que el editor
> de plantillas de impresión (`Pos Invoice` / `Label 5x2`) **ya está conectado** contra el BFF
> real, tal como describe `docs/frontend-tasks/55_plantillas_impresion_editor_pos_y_etiquetas.md`
> — este documento NO repite ese contexto, solo agrega lo nuevo: 6 bindings de multimoneda en el
> catálogo de `Pos Invoice` y una plantilla default nueva que ya los usa como referencia visual.
> Si el editor todavía NO está conectado, implementa primero el documento 55 y vuelve a este
> después.
>
> **Refresca tu `openapi.json`** desde `GET /api/docs-json` antes de empezar — los bindings nuevos
> no van a aparecer documentados si tu copia es de antes de este cambio (no hay un endpoint nuevo,
> `GET /plantillas/campos-disponibles?type=Pos%20Invoice` simplemente devuelve más filas ahora).
> API base `https://gensapi.ryancfx.click/api/v1` (o `http://localhost:4000/api/v1` en
> desarrollo).

---

## 0 — Contexto de negocio: por qué existe esto

El sistema ahora soporta facturación en DOP, USD o EUR (`docs/frontend-tasks/60_multimoneda_dop_usd_eur.md`
cubre configuración/cobros/pagos; las ventas en sí ya aceptan `currency`/`conversionRate` en
`POST /invoices` — si tu copia de ese documento dice lo contrario, está desactualizada, no la
sigas para esa parte). Cuando una factura se emite en USD o EUR, el negocio necesita que el
ticket impreso muestre, además del total en la moneda de la venta, su equivalente en la moneda
base de la empresa (la que usa la contabilidad — hoy siempre DOP) — es el mismo criterio que ya
usa la DGII en los reportes fiscales: la venta se hace en la moneda que el cliente pagó, pero el
libro contable y los reportes siempre reducen a una sola moneda.

**El backend nunca calcula nada nuevo para esto.** Los montos "equivalentes" ya existen como
campos nativos de ERPNext (`base_net_total`, `base_grand_total`, etc. — el motor contable los
calcula al guardar la factura); el BFF solo los expone como bindings más en el catálogo que ya
consume tu editor. Si una factura está en DOP, estos campos son idénticos a los que ya usas
(`factura.subtotal`, `factura.total`) — no hay caso especial que programar para eso, los números
simplemente coinciden.

---

## 1 — Los 6 bindings nuevos

Todos son **nativos** (`Puede faltar: No`) — a diferencia de varios bindings de
`docs/frontend-tasks/55...md` §2.1 que dependen de un Custom Field del tenant, estos existen en
cualquier `Sales Invoice`/`Company` de cualquier tenant, tenga o no la multimoneda habilitada.
Van a aparecer siempre en `GET /plantillas/campos-disponibles?type=Pos%20Invoice`.

| Key | Descripción | Tipo | Ejemplo (factura de 500 USD, tasa 60) |
|---|---|---|---|
| `factura.moneda` | Código de moneda de la venta (`DOP`/`USD`/`EUR`) | string | `"USD"` |
| `factura.tasaCambio` | Tasa de cambio aplicada a esta factura (moneda → moneda base) | number | `60` |
| `factura.subtotalBase` | Subtotal (`factura.subtotal`) convertido a la moneda base | number | `30000` |
| `factura.impuestosBase` | Impuestos (`factura.impuestos`) convertidos a la moneda base | number | `5400` |
| `factura.totalBase` | Total (`factura.total`) convertido a la moneda base | number | `35400` |
| `empresa.monedaBase` | Moneda base de la empresa (para comparar contra `factura.moneda`, ver §2) | string | `"DOP"` |

`factura.subtotal`/`factura.impuestos`/`factura.total` (ya existentes, ver doc 55 §2.1) siguen
siendo los montos **en la moneda de la venta** (`factura.moneda`) — no cambian de significado.
Los `*Base` son el par nuevo, siempre en `empresa.monedaBase`.

En una factura en DOP (el caso de hoy para casi todos los tenants): `factura.moneda === "DOP"`,
`factura.tasaCambio === 1`, y `factura.totalBase === factura.total` (idéntico, no solo parecido).

---

## 2 — Cómo mostrarlo: mostrar siempre vs. condicional

Hay dos formas válidas de maquetar esto en el editor — cualquiera es correcta, es una decisión de
diseño, no del backend:

**Opción A — bloque siempre visible (la que usa la plantilla default nueva, ver §3).** Se
maqueta un bloque fijo "Moneda: {{factura.moneda}}", "Tasa: {{factura.tasaCambio}}", etc., que
siempre se imprime. En una factura DOP se ve un poco redundante (dice "Moneda: DOP" y repite el
mismo total dos veces) pero nunca es incorrecto, y es más simple de maquetar porque no depende de
que el editor soporte lógica condicional.

**Opción B — bloque condicional, solo cuando la factura es en moneda extranjera.** Si tu editor
ya tiene el elemento `conditional` (mencionado como tipo reconocido en doc 55 §7, con su
evaluador todavía pendiente de conectar a datos reales según el mismo documento), la condición
correcta es comparar `values['factura.moneda']` contra `values['empresa.monedaBase']` — **nunca
hardcodees `'DOP'` como la moneda base**, porque no todos los tenants necesariamente la tienen
en DOP a futuro. Oculta el bloque completo (moneda/tasa/equivalentes) cuando son iguales.

Si tu editor NO tiene todavía un evaluador de `conditional` funcional contra datos reales, usa la
Opción A — no bloquees este trabajo esperando esa pieza.

---

## 3 — Plantilla default nueva de referencia: "Factura General RD"

El BFF ahora provisiona (al activar el módulo POS para un tenant, si ese tenant no tenía ya un
default propio) una plantilla `Pos Invoice` llamada **"Factura General RD"** que ya incluye el
bloque multimoneda (Opción A de arriba) maquetado como ejemplo real. Es útil como referencia de
qué texto/formato usar, no hace falta que la repliques exacto:

- `GET /plantillas?type=Pos%20Invoice` en un tenant que tenga el módulo POS activo debería
  listarla si ese tenant no había creado ninguna plantilla propia todavía.
- `GET /plantillas/default?type=Pos%20Invoice` la devuelve directamente si es la default vigente.
- Su `documentJson` trae un bloque de texto "DESGLOSE MULTIMONEDA" centrado, seguido de 5 líneas
  con los bindings de la tabla de §1 — puedes inspeccionar sus coordenadas/tamaños de fuente
  (`x`, `y`, `fontSize`, `align`) en la respuesta de esos dos endpoints para calibrar tu propio
  diseño por defecto si decides crear uno equivalente en el editor visual.

No hay ningún endpoint para "descargar" esta plantilla como archivo — solo existe como un
`Plantilla Impresion RD` real en cada tenant (la puedes abrir y editar como cualquier otra desde
el editor, incluido borrarla o dejar de usarla como default).

---

## 4 — Formato sugerido para los valores nuevos

El backend entrega los números crudos (`factura.tasaCambio: 60`, no `"60.0000"` ni `"RD$ 60.00"`)
— el formato de presentación es responsabilidad del frontend, igual que ya haces con
`factura.total` hoy. Sugerencias (no obligatorias):

- `factura.tasaCambio`: 4 decimales (`60.0000`), consistente con cómo se muestra la tasa en el
  resto de la app (cobros/pagos, doc 60 §2).
- `factura.subtotalBase`/`impuestosBase`/`totalBase`: mismo formato de moneda que ya usas para
  `factura.total`, pero con el símbolo de `empresa.monedaBase` en vez del de `factura.moneda`
  (para una empresa en DOP, `RD$`).
- Si maquetas la Opción A (bloque siempre visible), es razonable prefijar esas 3 líneas con un
  texto como "Equivalente:" para dejar claro que no es un monto adicional a cobrar, sino la
  misma cifra en otra moneda.

---

## 5 — Qué NO cambia

- El endpoint `GET /plantillas/render-data?type=Pos%20Invoice&sourceId=...` sigue teniendo
  exactamente la misma forma de respuesta (`{success, data: {template, values}}`) — solo el
  objeto `values` tiene 5 keys más (+ `empresa.monedaBase`, ya presente desde antes en el sentido
  de que `empresa.*` ya existía como namespace, pero `monedaBase` es nueva).
- `Label 5x2` (etiquetas de producto) no tiene nada de esto — un artículo no tiene moneda propia,
  el catálogo de esa plantilla no cambió.
- No hay ningún endpoint ni campo nuevo fuera de `/plantillas/campos-disponibles` y
  `/plantillas/render-data` — no busques esto en `/invoices`, `/config`, etc.

---

## Checklist de implementación

- [ ] Refrescar `openapi.json` y confirmar que `GET /plantillas/campos-disponibles?type=Pos%20Invoice`
      devuelve los 6 bindings de §1 (5 de `factura.*` + `empresa.monedaBase`).
- [ ] Agregar los 6 bindings nuevos a la paleta de campos disponibles del editor (mismo lugar
      donde hoy aparecen `factura.subtotal`/`factura.total`, etc.).
- [ ] Decidir Opción A (bloque siempre visible) u Opción B (condicional contra
      `empresa.monedaBase`) según el estado actual del evaluador `conditional` del editor — ver §2.
- [ ] Aplicar el formato sugerido de §4 a los 5 valores numéricos/moneda nuevos.
- [ ] Probar imprimiendo/previsualizando una factura real en USD o EUR contra un tenant con
      multimoneda habilitada (ver doc 60 para cómo crear una) — confirmar que
      `factura.totalBase` corresponde al total real convertido, y que en una factura DOP el
      bloque no genera confusión (ya sea oculto por la Opción B, o visiblemente redundante y
      correcto por la Opción A).

### Pruebas manuales

- [ ] `GET /plantillas/campos-disponibles?type=Pos%20Invoice` — confirmar las 6 keys nuevas.
- [ ] `GET /plantillas/default?type=Pos%20Invoice` en un tenant con el módulo POS activo y sin
      plantilla propia creada — confirmar que devuelve "Factura General RD" con el bloque
      multimoneda, como referencia visual.
- [ ] `GET /plantillas/render-data?type=Pos%20Invoice&sourceId=<una-factura-en-USD>` — confirmar
      que `values['factura.moneda'] === "USD"`, `values['factura.tasaCambio']` es la tasa real
      aplicada, y `values['factura.totalBase']` es el total en DOP (no igual a
      `values['factura.total']`, que sigue en USD).
- [ ] La misma consulta contra una factura en DOP — confirmar que `factura.totalBase === factura.total`.
