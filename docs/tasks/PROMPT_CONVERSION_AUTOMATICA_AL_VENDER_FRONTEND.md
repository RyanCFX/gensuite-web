# Prompt para agente de frontend — Conversión automática genérico→dimensionado al vender

> **Para quien recibe este documento.** Esto describe un cambio nuevo que **requiere como
> prerrequisito** que ya tengas implementado `docs/frontend/PROMPT_CONVERSION_ITEM_DIMENSIONADO_FRONTEND.md`
> (conversión MANUAL genérico→dimensionado) y, antes que ese, `docs/frontend/PROMPT_INVENTORY_DIMENSIONS_FRONTEND.md`
> (Dimensiones de Inventario en general). Este documento asume que ya conocés y tenés construido:
> el concepto de "ítem genérico" y "ítem dimensionado", el campo `itemGenericoOrigen` en el ítem
> dimensionado, la pantalla de Catálogo → Artículos con sus selectores de dimensión, y la pantalla
> manual "Conversión a Ítem Dimensionado" (`POST /inventory/conversion-dimension`). **No repito acá
> ningún concepto ya explicado en esos dos documentos** — solo lo nuevo.
>
> **Qué resuelve esto, en una frase:** hasta ahora, convertir un ítem genérico en uno dimensionado
> era un paso MANUAL y separado, que alguien de inventario tenía que hacer ANTES de que el cajero
> pudiera vender el dimensionado. Ahora esa conversión puede pasar a ser **automática**: el cajero
> busca y vende directamente el ítem GENÉRICO, el frontend le pide la combinación de dimensión en
> ese momento, y al someter la venta el backend hace la conversión solo — la factura final queda
> con el ítem DIMENSIONADO, el genérico nunca aparece en ningún documento de venta.
>
> **La pantalla manual de conversión (`POST /inventory/conversion-dimension`) NO desaparece ni
> cambia.** Sigue existiendo tal cual, para los ítems que un tenant prefiera convertir a mano (por
> ejemplo, para preparar stock con anticipación sin esperar a que llegue una venta). Lo nuevo es una
> **segunda forma, opcional por producto**, de llegar al mismo resultado — un ítem puede usar una,
> la otra, ambas, o ninguna.
>
> Todo lo descrito acá ya está **implementado, probado (107 tests unitarios en verde across 12
> suites) y compila sin errores** del lado del backend (NestJS/ERPNext) — no hay nada pendiente de
> decisión de diseño.
>
> **En el repo del frontend hay un archivo `openapi.json` con la documentación completa y
> actualizada del API** (se genera desde el backend con `GET /api/docs-json`, también navegable en
> Scalar en `https://gensapi.ryancfx.click/api/docs`). **Regenerá tu cliente/tipos desde ese
> archivo antes de empezar** — ahí está el shape exacto y tipado de cada campo nuevo. Los campos
> nuevos de `Item` (`destinoConversionAutomatica` al escribir, `conversionAutomatica` al leer)
> aparecen dentro del DTO de `POST/PUT/GET /catalog/items` de siempre (tag **Catálogo**); no hay
> ningún endpoint nuevo — el swap automático ocurre **dentro** de `POST /invoices` y
> `PUT /invoices/:id` (tag **Facturación**), que ya conocés. Si este documento y el `openapi.json`
> llegaran a diferir en el nombre exacto de un campo, **gana el `openapi.json`**.
>
> Documento relacionado que asumimos ya tenés implementado, sin cambios en este documento:
> `docs/frontend/PROMPT_PERMISOS_FRONTEND.md` (contrato de permisos, `GET /me/permissions` →
> `data.acciones`).

---

## 0. Resumen ejecutivo

| | Antes de este cambio | Después de este cambio |
|---|---|---|
| ¿Cómo se obtiene stock del ítem dimensionado a partir del genérico? | Solo manual: pantalla "Conversión a Ítem Dimensionado" (`POST /inventory/conversion-dimension`), un paso aparte, ANTES de vender | Igual que antes, **más** una opción automática: vender el genérico directo, con la combinación en la misma línea de venta |
| ¿Qué ítem busca/elige el cajero para vender? | Solo el dimensionado (si ya se convirtió a mano) | El GENÉRICO, si el producto tiene la conversión automática configurada — el dimensionado nunca se busca/vende directo en este flujo |
| ¿Dónde se activa esto? | N/A | Un campo nuevo en el ítem GENÉRICO (`destinoConversionAutomatica`) — configuración **por producto**, nunca un interruptor de tenant |
| ¿En qué pantallas de venta aplica? | N/A | Solo donde se descuenta stock de verdad: Factura (`POST/PUT /invoices`, con `update_stock=1`) y el flujo de Caja/POS que completa esas facturas. **Cotizaciones y Pedidos quedan fuera de alcance** — ver §5 |
| ¿Hace falta un permiso nuevo? | — | No. `inventario.convertir-dimension` sigue gateando SOLO la pantalla manual — el swap automático corre dentro de los permisos de facturación que el usuario ya tiene |

**Lo que NO cambia:**
- La pantalla manual de conversión sigue funcionando exactamente igual, para cualquier ítem,
  tenga o no configurada la conversión automática.
- Un ítem dimensionado que NO tiene ningún genérico apuntándole con conversión automática se
  vende exactamente igual que siempre (buscás el dimensionado, elegís la combinación, listo).
- El shape de `dimensiones` en una línea de factura (`Record<string,string>`) no cambia — es el
  mismo campo que ya mandás para cualquier línea de ítem dimensionado.

---

## 1. El concepto, en una frase

Un ítem GENÉRICO puede declarar, además de (opcionalmente) un vínculo hacia atrás que ya conocías
(`itemGenericoOrigen` vive en el DIMENSIONADO), un vínculo **hacia adelante**: el genérico dice "si
me vendés con una combinación, convertime automáticamente en este otro ítem". Cuando eso está
configurado:

- El genérico aparece en el selector de venta (aunque `isSalesItem=false`).
- Al vender el genérico con una combinación de dimensión en la línea, la factura resultante NO
  tiene el genérico — tiene el ítem dimensionado destino, con esa combinación, como si el cajero
  lo hubiera elegido directamente.
- Todo esto pasa en una sola llamada a `POST /invoices` (o `PUT /invoices/:id`) — no hay una
  segunda llamada, no hay un paso intermedio visible para el cajero.

---

## 2. Catálogo → Artículos — 2 campos nuevos

### 2.1 `destinoConversionAutomatica` — en el ítem GENÉRICO (request)

```jsonc
// POST/PUT /catalog/items (en el ítem GENÉRICO, ej. "BUMPER-GEN")
{
  // ...el resto de los campos del artículo...
  "destinoConversionAutomatica": "BUMPER-DIM"
}
```

Reglas de validación del servidor (`400` si fallan):

- El destino debe ser un ítem que exista, con dimensiones declaradas (`usaDimensiones: true`).
- El destino debe tener su propio `itemGenericoOrigen` apuntando de vuelta a ESTE genérico — es
  decir, hay que configurar primero el vínculo que ya conocías
  (`itemGenericoOrigen` en el dimensionado) y DESPUÉS este nuevo campo en el genérico, no al revés.
  Mensaje exacto si no son consistentes:
  ```jsonc
  { "code": "BAD_REQUEST", "statusCode": 400,
    "message": "«BUMPER-DIM» no puede ser destino de conversión automática: su «Ítem genérico de origen» no apunta de vuelta a «BUMPER-GEN»." }
  ```
- El destino no puede ser el mismo ítem (`"El destino de conversión automática no puede ser el mismo artículo."`).
- **Un ítem no puede tener configurados a la vez `itemGenericoOrigen` Y `destinoConversionAutomatica`**
  — son roles excluyentes (uno es "soy el dimensionado que viene de un genérico", el otro es "soy
  el genérico que alimenta a un dimensionado"). Mensaje exacto:
  ```jsonc
  { "code": "BAD_REQUEST", "statusCode": 400,
    "message": "Un ítem no puede tener configurado «Ítem genérico de origen» y «Destino de conversión automática» a la vez — son roles excluyentes: el primero es para un ítem DIMENSIONADO, el segundo para un ítem GENÉRICO." }
  ```

Para quitar la configuración (el genérico deja de participar del flujo automático), mandá el campo
como cadena vacía `""` — mismo patrón que `itemGenericoOrigen`.

**UI sugerida**: en el formulario de artículo, mostrá este campo (selector de ítem) cuando el
artículo que se edita **no** tiene dimensiones propias (`usaDimensiones: false`) — es decir, en la
misma sección donde mostrarías el formulario de un ítem "plano" normal. No lo muestres en el
formulario de un ítem que SÍ tiene dimensiones (`usaDimensiones: true`) — ese es rol de
`itemGenericoOrigen`, no de este campo.

### 2.2 `conversionAutomatica` — en la respuesta (cualquier ítem)

```jsonc
// GET /catalog/items, GET /catalog/items/:id — respuesta de un ítem GENÉRICO con la config activa
{
  "data": {
    // ...el resto de los campos...
    "itemCode": "BUMPER-GEN",
    "isSalesItem": false,
    "conversionAutomatica": {
      "itemDestino": "BUMPER-DIM",
      "dimensiones": [
        { "dimension": "anio", "valoresPermitidos": ["ANIO-2024", "ANIO-2025"] },
        { "dimension": "color", "valoresPermitidos": [] }
      ]
    }
  }
}
```

- **Presente solo** si el ítem tiene `destinoConversionAutomatica` configurado. Ausente/`undefined`
  en cualquier otro ítem — no hace falta chequear nada especial para el resto del catálogo.
- `dimensiones` tiene el MISMO shape que ya usás para pintar los selectores en cascada de
  cualquier ítem dimensionado (`dimension`, `valoresPermitidos` — `valoresPermitidos: []` significa
  "cualquier valor activo de esa dimensión es válido", igual que ya sabés de
  `PROMPT_INVENTORY_DIMENSIONS_FRONTEND.md`).
- Son las dimensiones que declara el **destino** (`BUMPER-DIM`), no el genérico — el genérico en sí
  nunca tiene dimensiones propias.

---

## 3. Visibilidad en el selector de venta

**Regla nueva**: un ítem aparece en el listado/selector de venta (`GET /catalog/items`, sin
parámetros especiales — es el mismo listado de siempre) si:

```
isSalesItem === true  O  tiene conversionAutomatica configurada
```

Esto es 100% transparente para vos — no hace falta ningún query param nuevo ni ninguna lógica de
cliente para esto, el servidor ya filtra así. Lo único que tenés que hacer es **no asumir** que
todo ítem que aparece en ese listado tiene `isSalesItem: true` — ahora puede aparecer un ítem con
`isSalesItem: false` que trae el bloque `conversionAutomatica`. Tu UI debe tratar ese caso
especial (ver §4) en vez de, por ejemplo, ocultarlo por tener `isSalesItem: false` si vos mismo
agregaste ese chequeo en el cliente en algún lado.

---

## 4. Flujo de venta — qué hacer en el formulario de Factura/POS

### 4.1 Al agregar una línea con un ítem que trae `conversionAutomatica`

1. El cajero busca y selecciona el ítem — ej. escribe "bumper" y aparece "BUMPER-GEN" en los
   resultados (puede aparecer junto con otros ítems normales, no hay ninguna marca visual especial
   en el listado salvo que vos decidas agregarla).
2. Al agregarlo a la línea, tu formulario detecta `item.conversionAutomatica` presente y **abre el
   mismo selector en cascada de combinación** que ya usás para cualquier línea de un ítem
   dimensionado (§4.3/§5 de `PROMPT_INVENTORY_DIMENSIONS_FRONTEND.md`), usando
   `item.conversionAutomatica.dimensiones` como catálogo de dimensiones a pedir — EXACTAMENTE
   igual que si el ítem mismo fuera el dimensionado.
3. **La combinación es obligatoria** para poder agregar/confirmar esa línea — no dejes que el
   cajero continúe sin elegirla completa. Si el backend recibe la línea sin `dimensiones` (o
   incompleta), rechaza con `400` (ver §6) — tu UI debe evitar que el usuario llegue a ese error.
4. Mostrá un texto claro cerca de la línea o del selector, del estilo:
   > *"Este artículo se convertirá automáticamente a «Bumper» con la combinación elegida al
   > confirmar la venta."*
5. El resto del formulario (cantidad, precio, descuento) funciona exactamente igual que para
   cualquier línea — nada cambia ahí.

### 4.2 Qué manda el frontend al backend

```jsonc
// POST /invoices (o PUT /invoices/:id)
{
  // ...resto del payload de siempre...
  "items": [
    {
      "itemCode": "BUMPER-GEN",
      "qty": 2,
      "rate": 45.00,
      "dimensiones": { "anio": "ANIO-2024", "color": "COLOR-ROJO" }
      // sin ningún campo nuevo — es el mismo "dimensiones" de siempre, en la línea del GENÉRICO
    }
  ]
}
```

No hay ningún campo nuevo en el DTO de línea de factura — `dimensiones` (que ya existe y ya usás)
alcanza. El frontend NUNCA manda `itemCode: "BUMPER-DIM"` en este flujo — siempre manda el
genérico; el backend hace el swap internamente.

### 4.3 Qué devuelve el backend

La factura resultante (`GET /invoices/:id`, o la respuesta del propio `POST`/`PUT`) tiene la línea
con `itemCode: "BUMPER-DIM"` — el genérico **no aparece en ningún lado de la factura**. Si tu
pantalla de "revisar antes de confirmar" muestra el detalle de la factura recién creada, el
artículo que se ve ahí es el dimensionado, con su nombre/descripción real — no el genérico. Esto es
esperado, no un bug: no hagas ningún mapeo para "mostrar el genérico en su lugar".

### 4.4 Editar una factura en borrador con una línea ya convertida

Si el cajero vuelve a abrir (`PUT /invoices/:id`) un borrador que ya tiene una línea así, y cambia
algo (la combinación, la cantidad, o cualquier otra cosa de la factura), el backend **revierte la
conversión anterior y la rehace desde cero** según el estado actual del formulario — esto es
transparente para vos: no hace falta que hagas nada especial, solo mandá el payload completo de la
factura como ya hacés en cualquier `PUT`. Si tu formulario de edición vuelve a mostrar la línea del
ítem dimensionado como si fuera el genérico original (para permitir cambiar la combinación), eso es
una decisión de UX tuya — el backend acepta de nuevo `itemCode: "BUMPER-GEN"` + `dimensiones` en
esa línea aunque la factura ya la tuviera convertida, y la vuelve a procesar igual que la primera
vez.

### 4.5 Cancelar la factura

Si la factura (en borrador o ya sometida) se cancela (`POST /invoices/:id/cancel`, sin cambios en
ese contrato), el backend revierte automáticamente cualquier conversión asociada — el stock vuelve
al genérico. No hace falta ningún manejo especial en el frontend para esto.

---

## 5. Alcance — dónde aplica y dónde NO

**Aplica**: Factura (`POST/PUT /invoices`) con `update_stock=1` (venta normal, no despacho a
futuro) y el flujo de Caja/POS que completa esas facturas — es decir, cualquier pantalla de venta
que ya uses hoy para facturar con descuento de inventario real.

**NO aplica, a propósito, en esta versión**:
- **Despacho a futuro** (`despachoFuturo: true` en la factura): si la factura no descuenta stock
  de inmediato, la conversión automática tampoco corre — la línea del genérico no se convierte
  (la factura queda con el genérico tal cual, SIN exigir combinación, porque el genérico no la
  tiene). Si tu tenant usa despacho a futuro para artículos con esta configuración, **no mostrés el
  selector de combinación** en ese caso — el campo `dto.despachoFuturo` de la factura determina
  esto, no algo que debas inferir vos.
- **Cotizaciones** (`POST/PUT /quotations`) y **Pedidos** (`POST/PUT /pedidos`): ninguno de los dos
  dispara esta conversión. Si tu pantalla de Cotizaciones/Pedidos permite elegir un ítem con
  `conversionAutomatica` configurada, trátalo como cualquier ítem genérico normal — NO le pidas la
  combinación de dimensión ahí, porque el backend no la va a usar para nada en ese flujo (no hay
  swap ni conversión en Cotizaciones/Pedidos). Si tu catálogo filtra por `conversionAutomatica`
  para decidir si pedir dimensión, hacelo condicional a que la pantalla sea Factura/Caja, no en
  Cotizaciones/Pedidos.

---

## 6. Tabla de errores nuevos

| # | HTTP | Endpoint | Mensaje | Cuándo aparece | Acción sugerida en UI |
|---|---|---|---|---|---|
| 1 | 400 | `PUT /catalog/items` (ítem DIMENSIONADO) | `«X» no puede ser destino de conversión automática: su «Ítem genérico de origen» no apunta de vuelta a «Y».` | Se configuró `destinoConversionAutomatica` en un genérico apuntando a un ítem cuyo `itemGenericoOrigen` no coincide | Configurar primero `itemGenericoOrigen` en el dimensionado, luego `destinoConversionAutomatica` en el genérico |
| 2 | 400 | `PUT /catalog/items` | `El destino de conversión automática no puede ser el mismo artículo.` | Se intentó apuntar un ítem a sí mismo | No debería poder pasar si el selector excluye el propio ítem de sus opciones |
| 3 | 400 | `PUT /catalog/items` | `Un ítem no puede tener configurado «Ítem genérico de origen» y «Destino de conversión automática» a la vez...` | Se intentaron configurar ambos campos en el mismo ítem | Mostrar solo uno de los dos campos por formulario según el rol del ítem (§2.1) |
| 4 | 400 | `POST`/`PUT /invoices` | `El ítem "X" tiene configurada conversión automática a "Y" — debe indicar "dimensiones".` | Se mandó una línea con un ítem genérico-con-conversión-automática SIN `dimensiones`, en una factura con `update_stock=1` | No debería poder pasar si el formulario obliga a elegir la combinación (§4.1, punto 3) |
| 5 | 400 | `POST`/`PUT /invoices` | `No se pudo resolver almacén para convertir "X".` | No se pudo determinar un almacén de venta válido para la línea (mismo tipo de error que ya conocés de cualquier línea sin almacén resoluble) | Mismo manejo que ya tenés para errores de almacén en facturación |
| 6 | 400 | `POST`/`PUT /invoices` | `SALE_WAREHOUSE_MISMATCH` (código), mensaje sobre "esta sucursal solo puede vender desde..." | La sucursal tiene un almacén de venta forzado distinto al de la conversión | Mismo manejo que ya tenés para este error existente en facturación — no es nuevo, solo ahora también puede dispararse desde una línea con conversión automática |

Los demás errores de combinación de dimensión (falta un valor, combinación inválida, etc.) son los
MISMOS que ya conocés y manejás de cualquier línea de un ítem dimensionado — no hay mensajes nuevos
para esos casos.

---

## 7. Permisos

**No hay ningún permiso nuevo.** Reutilizá exactamente los que ya usás:

| Acción | Controla |
|---|---|
| (las que ya gatean crear/editar/cancelar factura) | Sin cambios — el swap automático corre dentro de esos mismos endpoints, para cualquier usuario que ya pueda facturar |
| `inventario.convertir-dimension` | Sigue gateando SOLO la pantalla manual (`POST /inventory/conversion-dimension`) — no tiene nada que ver con el flujo automático de este documento |
| `config.catalogos...`/los que ya gatean Catálogo → Artículos | Sin cambios — cubren también los 2 campos nuevos del ítem |

---

## 8. Qué NO hacer

- **No agregues un botón o pantalla de "convertir antes de vender"** para un ítem que ya tiene
  conversión automática configurada — no hace falta, el cajero vende el genérico directo. La
  pantalla manual sigue existiendo para quien prefiera prepararlo con anticipación, pero no la
  fuerces ni la sugieras como paso obligatorio para estos ítems.
- **No muestres el ítem dimensionado en el selector de venta** para este flujo — el cajero busca y
  elige siempre el genérico. Si el dimensionado también aparece en el listado (porque tiene
  `isSalesItem: true` configurado aparte), es una decisión del tenant, no algo que debas ocultar ni
  resaltar especialmente.
- **No implementes ningún cálculo de stock/costeo en el cliente** para la conversión — el backend
  resuelve el costo (`valuation_rate` del genérico) automáticamente; vos solo mostrás los totales
  de la factura tal cual los devuelve el servidor, como siempre.
- **No repliques esta lógica en Cotizaciones o Pedidos** — confirmado que no aplica ahí (§5). Si
  necesitás soportarlo en esas pantallas en el futuro, es un cambio de alcance que hay que pedir
  aparte — no lo asumas ni lo implementes por tu cuenta.
- **No agregues un toggle de tenant/configuración global** para esta función — la única
  configuración posible es por producto (`destinoConversionAutomatica` en el ítem genérico). Si en
  algún lugar de tu código sentís la tentación de agregar un switch general, es señal de que algo
  se entendió mal.

---

## 9. Checklist de implementación

- [ ] Regenerado el cliente/tipos desde el `openapi.json` actualizado.
- [ ] Catálogo → Artículos: campo `destinoConversionAutomatica` en el formulario de un ítem SIN
      dimensiones (selector de ítem dimensionado), con manejo de los 3 errores 400 de §6 (#1-#3).
- [ ] Catálogo → Artículos: confirmado que el campo se oculta/no aplica en un ítem CON dimensiones
      (ese usa `itemGenericoOrigen`, ya implementado antes).
- [ ] Lectura de `conversionAutomatica` en `GET /catalog/items`/`GET /catalog/items/:id`, guardado
      junto con el resto de los datos del ítem en el estado de la pantalla de venta.
- [ ] Confirmado que el selector de venta no filtra/oculta ítems con `isSalesItem: false` que
      traen `conversionAutomatica` (§3).
- [ ] Formulario de Factura/POS: al agregar una línea con `item.conversionAutomatica` presente,
      pedir la combinación con el mismo selector en cascada ya existente, usando
      `conversionAutomatica.dimensiones` como catálogo, y bloquear la línea hasta completarla.
- [ ] Texto de aviso sugerido en §4.1 mostrado cerca de la línea.
- [ ] Confirmado que el payload sigue mandando `itemCode` del GENÉRICO + `dimensiones` — sin
      campos nuevos en el DTO de línea.
- [ ] Confirmado que el detalle de la factura resultante muestra el ítem DIMENSIONADO (no el
      genérico), sin ningún mapeo especial de tu parte.
- [ ] Manejo de los errores 400/#4-#6 de §6 en el formulario de venta.
- [ ] Confirmado (o explícitamente excluido) que Cotizaciones/Pedidos NO piden combinación para
      estos ítems — no aplica ahí (§5).
- [ ] Confirmado que el despacho a futuro tampoco dispara esta conversión (§5).
- [ ] Confirmado que la pantalla manual "Conversión a Ítem Dimensionado" sigue intacta y funcional
      para cualquier ítem, tenga o no la conversión automática configurada.
