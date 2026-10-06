# Prompt para agente de frontend — Conversión de Ítem Genérico a Ítem Dimensionado

> **Para quien recibe este documento.** Esto describe una funcionalidad nueva que **requiere como
> prerrequisito** que ya tengas implementado `docs/frontend/PROMPT_INVENTORY_DIMENSIONS_FRONTEND.md`
> (Dimensiones de Inventario) — este documento asume que conocés y ya construiste: el concepto de
> "dimensión de inventario" (`usaDimensiones`, `dimensiones[]` del artículo), el patrón de
> selectores en cascada para elegir una combinación, la pantalla de Catálogo de Dimensiones y
> Valores, y las pantallas de Ajuste/Reclasificación de Combinación (`POST
> /inventory/ajustes-dimension`, `POST /inventory/reclasificaciones`). **Si todavía no implementaste
> ese documento, hacelo primero** — nada de lo de acá tiene sentido sin ese contexto. No repito acá
> conceptos ya explicados ahí (qué es una dimensión, cómo funcionan los selectores en cascada, cómo
> se lee el saldo por combinación) salvo cuando hace falta precisión adicional.
>
> **Qué resuelve esto, en una frase:** permite que un tenant **compre un artículo sin especificar
> una dimensión** (ej. 30 "Bumper genérico") y **recién decida la combinación exacta (año, color)
> antes de venderlo**, mediante un paso explícito de "conversión" — sin relajar ninguna de las
> reglas que ya conocés de Dimensiones de Inventario (la obligatoriedad simétrica, la
> inmutabilidad por artículo, el balance real por combinación siguen intactos). Es **estrictamente
> opt-in y configurado por producto, nunca por tenant** — un tenant puede tener artículos
> dimensionados que usan este flujo y otros que no, sin ningún interruptor global de por medio.
>
> Todo lo descrito acá ya está **implementado, probado (tests unitarios en verde) y compila sin
> errores** del lado del backend (NestJS/ERPNext) — no hay nada pendiente de decisión de diseño
> para lo descrito acá.
>
> **En el repo del frontend hay un archivo `openapi.json` con la documentación completa y
> actualizada del API** (se genera desde el backend con `GET /api/docs-json`, también navegable en
> Scalar en `https://gensapi.ryancfx.click/api/docs`). **Regenerá tu cliente/tipos desde ese
> archivo antes de empezar** — ahí está el shape exacto y tipado de cada campo nuevo. Los campos
> nuevos de `Item` (`itemGenericoOrigen`, `isSalesItem`, `isPurchaseItem`) aparecen dentro del DTO
> de `POST/PUT /catalog/items` de siempre (tag **Catálogo**); el endpoint nuevo aparece bajo el tag
> **`Inventario`**, junto a `ajustes-dimension`/`reclasificaciones` que ya conocés. Este documento
> no reemplaza el spec: explica el **flujo de negocio**, qué pantalla toca qué campo, en qué orden
> pasan las cosas y cómo manejar cada error. Si este documento y el `openapi.json` llegaran a
> diferir en el nombre exacto de un campo, **gana el `openapi.json`** — pero no debería pasar: todo
> lo escrito acá se extrajo directamente del código fuente ya mergeado.
>
> Documento relacionado que asumimos ya tienes implementado, sin cambios en este documento:
> `docs/frontend/PROMPT_PERMISOS_FRONTEND.md` (contrato de permisos, `GET /me/permissions` →
> `data.acciones`, manejo de `403`).

---

## 0. Resumen ejecutivo

| | Qué es | Dónde |
|---|---|---|
| 3 campos nuevos en `Item` | `itemGenericoOrigen`, `isSalesItem`, `isPurchaseItem` | `POST/PUT/GET /catalog/items` (endpoint ya existente) |
| 1 endpoint nuevo | Convertir N unidades de un ítem genérico en N unidades de un ítem dimensionado, asignando la combinación | `POST /inventory/conversion-dimension` |
| 1 permiso nuevo | Gatea el endpoint de conversión | `inventario.convertir-dimension` |
| Pantallas a tocar | Catálogo → Artículos (3 campos nuevos en el formulario) + 1 pantalla/acción nueva ("Conversión a Ítem Dimensionado", mismo lugar donde ya tienes Ajuste/Reclasificación de Combinación) | — |

**Lo que NO cambia:**
- Nada de lo que ya implementaste de `PROMPT_INVENTORY_DIMENSIONS_FRONTEND.md` cambia de
  comportamiento — las reglas de obligatoriedad/inmutabilidad/balance por combinación siguen
  exactamente iguales.
- Los artículos existentes que no configuren `itemGenericoOrigen` no ven ningún cambio: el campo es
  `null`/ausente por default y el formulario de Catálogo → Artículos puede dejarlo oculto o en
  blanco sin que nada se rompa.
- `isSalesItem`/`isPurchaseItem` son campos **nativos** de ERPNext (`is_sales_item`/
  `is_purchase_item`) — antes de este cambio el backend los fijaba siempre en `true` (ningún
  artículo podía marcarse como "no vendible" o "no comprable" desde el BFF); ahora son opcionales,
  con default `true` si se omiten — **ningún artículo existente cambia de comportamiento** al
  desplegar esto.

---

## 1. El concepto, en una frase

Se usan **dos artículos relacionados**, nunca uno solo:

- Un **ítem GENÉRICO**: sin dimensiones declaradas (`usaDimensiones: false`), el que se compra
  normalmente, sin elegir ninguna combinación.
- Un **ítem DIMENSIONADO**: con dimensiones declaradas (`usaDimensiones: true`), el que se vende —
  exige la combinación completa en cada venta, como cualquier artículo dimensionado que ya conocés.

El ítem dimensionado tiene un campo (`itemGenericoOrigen`) que apunta al ítem genérico del que se
alimenta. Un **Stock Entry de conversión** (una pantalla/acción nueva, igual de simple que Ajuste o
Reclasificación de Combinación que ya conocés) consume N unidades del genérico y produce N unidades
del dimensionado, asignando la combinación elegida en ese momento.

**Ejemplo del caso de uso real**: un comercio de autopartes compra 30 "Bumper genérico" (sin saber
todavía para qué año/color los va a necesitar). Cuando llega el momento de alistar stock para
vender, convierte 10 unidades en "Bumper" (año=2024, color=Rojo), 10 en "Bumper" (año=2024,
color=Azul), y deja 10 sin convertir para decidir después. Cada venta de "Bumper" exige elegir la
combinación exacta, como ya sabés de Dimensiones de Inventario.

---

## 2. Permisos — acción nueva

| Acción | Gatea |
|---|---|
| `inventario.convertir-dimension` | Botón "Convertir" de la pantalla nueva (§4) |

Igual mecánica que ya conocés: si `GET /me/permissions → data.acciones['inventario.convertir-dimension']`
es `false`, ocultá o deshabilitá el botón/pantalla — no asumas que mostrarlo y dejar que el backend
rechace con `403` es suficiente.

---

## 3. Catálogo → Artículos — 3 campos nuevos en el formulario

### 3.1 `itemGenericoOrigen` — vínculo al ítem genérico

Campo del ítem **DIMENSIONADO**. Solo tiene sentido mostrarlo/habilitarlo cuando el artículo que se
está editando tiene `usaDimensiones: true` (mismo gating que ya aplicás a los selectores de
dimensiones/reglas de combinación de §4 de `PROMPT_INVENTORY_DIMENSIONS_FRONTEND.md`).

```jsonc
// GET /catalog/items/:id (respuesta, campo nuevo)
{
  "data": {
    // ...el resto de los campos del artículo que ya conocés...
    "usaDimensiones": true,
    "dimensiones": [ /* ... */ ],
    "itemGenericoOrigen": "BUMPER-GEN"   // NUEVO — string con el item_code genérico, o null si no está configurado
  }
}
```

```jsonc
// POST/PUT /catalog/items (request)
{
  // ...el resto de los campos...
  "itemGenericoOrigen": "BUMPER-GEN"
}
```

Para **quitar** el vínculo (el artículo deja de participar del flujo de conversión), mandá el campo
como cadena vacía `""` — mismo patrón que otros campos de tipo Link opcionales de este mismo
endpoint (ej. `purchaseTaxTemplate`).

**Selector**: un selector de artículo (el mismo componente que ya usás para elegir un `Item` en
cualquier otro lugar del catálogo — ej. el selector de `variantOf`), filtrado idealmente a artículos
con `usaDimensiones: false` (ítems planos) para guiar al usuario, aunque esto es una ayuda de UX, no
una validación — la validación real la hace el servidor (ver §3.3).

**Texto sugerido**: *"Ítem genérico de origen — este artículo se obtiene convirtiendo este otro
ítem (sin dimensiones). Dejalo vacío si este artículo se compra y vende directo con su propia
combinación."*

### 3.2 `isSalesItem` / `isPurchaseItem` — recomendación de uso, no obligatorios

```jsonc
{
  "isSalesItem": false,     // default true si se omite
  "isPurchaseItem": false   // default true si se omite
}
```

Son campos **nativos** de ERPNext (`is_sales_item`/`is_purchase_item`) — controlan si el artículo
puede aparecer en absoluto en un selector de venta o de compra en TODO el sistema (no son
específicos de este flujo, son genéricos de cualquier artículo). Se recomienda (no es obligatorio)
usarlos así en una pareja genérico+dimensionado:

- Ítem **genérico**: `isSalesItem: false` — se compra, nunca se vende directo sin convertir antes.
- Ítem **dimensionado**: `isPurchaseItem: false` — nunca se compra directo, solo se obtiene
  convirtiendo su genérico.

**Esto es una recomendación de configuración, no una regla que el backend fuerce.** Un tenant puede
dejar ambos campos en `true` (default) si prefiere permitir comprar/vender ambos ítems directamente
además de usar la conversión — el backend no lo impide. Mostrá estos dos checkboxes en el
formulario de artículo (sección general, cerca de "Es artículo de venta"/"Es artículo de compra" si
ya existieran como checkboxes nativos de ERPNext en tu UI; si no existían antes, son checkboxes
nuevos para vos también).

**Texto sugerido**:
- `isSalesItem`: *"Se puede vender este artículo"* (default activado).
- `isPurchaseItem`: *"Se puede comprar este artículo"* (default activado). Desactivalo para un
  artículo dimensionado que solo se debe obtener por conversión desde su ítem genérico.

### 3.3 Validación del servidor — ítem genérico debe ser plano

Si al guardar `itemGenericoOrigen` el ítem elegido **tiene dimensiones propias configuradas**
(`usaDimensiones: true`), el servidor rechaza con `400`:

```jsonc
{
  "code": "BAD_REQUEST",
  "statusCode": 400,
  "message": "«BUMPER-X» no puede ser el ítem genérico de origen: ya tiene dimensiones de inventario configuradas. El ítem genérico debe ser un artículo plano, sin ninguna dimensión declarada."
}
```

Y si se intenta apuntar un artículo a sí mismo:

```jsonc
{
  "code": "BAD_REQUEST",
  "statusCode": 400,
  "message": "El ítem genérico de origen no puede ser el mismo artículo."
}
```

Mostrá ambos mensajes tal cual en el formulario de artículo, asociados al campo `itemGenericoOrigen`.

---

## 4. Pantalla/acción nueva: "Conversión a Ítem Dimensionado"

Mismo lugar y mismo nivel que Ajuste de Combinación y Reclasificación de Combinación que ya
implementaste (§8.5/§8.6 de `PROMPT_INVENTORY_DIMENSIONS_FRONTEND.md`) — agregala como una tercera
opción en ese mismo menú/sección de operaciones de inventario.

`POST /inventory/conversion-dimension` — permiso `inventario.convertir-dimension`.

```jsonc
// Request
{
  "itemOrigen": "BUMPER-GEN",       // opcional — ver §4.2
  "itemDestino": "BUMPER-DIM",
  "warehouse": "ALM-01",
  "qty": 10,
  "dimensiones": { "anio": "ANIO-2024", "color": "COLOR-ROJO" },
  "postingDate": "2026-01-20",
  "remarks": "Conversión para pedido de cliente",
  "branch": "Principal"
}
```

| Campo | Tipo | Obligatorio | Notas |
|---|---|---|---|
| `itemOrigen` | string | **No** | El ítem genérico de origen. Si se omite, el servidor lo resuelve automáticamente desde `Item.itemGenericoOrigen` del `itemDestino` — ver §4.2. Indicalo explícito solo si querés usar un genérico distinto al configurado por defecto en el artículo |
| `itemDestino` | string | Sí | El ítem DIMENSIONADO al que se convierte |
| `warehouse` | string | Sí | Mismo almacén para la salida del genérico y la entrada del dimensionado — esto no es una transferencia entre almacenes |
| `qty` | number | Sí, `> 0` | Cantidad a convertir |
| `dimensiones` | objeto `{codigo: id}` | **Sí, y NO puede venir vacío** | La combinación completa a asignar al ítem destino — mismo shape y mismo patrón de selectores en cascada que ya conocés de Ajuste/Reclasificación de Combinación (§4.3/§8.3 del documento base) |
| `postingDate` | string (fecha) | No, default hoy | — |
| `remarks` | string | No | Si se omite, el servidor genera una nota automática describiendo la conversión |
| `branch` | string | No | Misma cascada automática de sucursal que ya conocés de otras pantallas de inventario |

### 4.1 Formulario sugerido

1. Selector de ítem destino (el artículo dimensionado al que se quiere convertir) — filtrá por
   `usaDimensiones: true` **y** `itemGenericoOrigen` no vacío (solo artículos que de verdad tienen
   un genérico configurado tienen sentido acá).
2. Una vez elegido el destino, mostrá de forma informativa (no editable, salvo que el usuario abra
   "usar otro ítem de origen") el `itemGenericoOrigen` de ese artículo — es el que se va a consumir.
3. Selector de almacén.
4. Cantidad a convertir — opcionalmente, mostrá el saldo disponible del ítem genérico en ese
   almacén (mismo endpoint de stock que ya usás en cualquier otra pantalla de inventario para un
   ítem sin dimensiones — no es `stock-por-dimension`, porque el genérico no tiene combinación) para
   que el usuario no intente convertir más de lo que hay.
5. Selectores en cascada de la combinación a asignar — EXACTAMENTE el mismo patrón de componente
   que ya implementaste para elegir una combinación en cualquier línea de documento (§4.3/§5 de
   `PROMPT_INVENTORY_DIMENSIONS_FRONTEND.md`), usando las dimensiones declaradas por el `itemDestino`.
6. Campos opcionales: fecha, nota, sucursal — mismo patrón que Ajuste/Reclasificación.

### 4.2 Resolución automática del ítem de origen

Si tu formulario no muestra un selector editable para `itemOrigen` (la UX recomendada en §4.1,
punto 2, es mostrarlo solo informativo), simplemente **no mandes el campo `itemOrigen` en el
request** — el servidor lo resuelve automáticamente leyendo `Item.custom_item_generico_origen` del
`itemDestino`. Si el artículo destino no tiene ese campo configurado, el servidor rechaza con `400`
(ver §4.4) — tu pantalla no debería dejar llegar a este caso si filtraste el selector de destino
como se sugiere en el punto 1 de §4.1, pero manejá el mensaje igual por si el catálogo cambia entre
que se cargó la pantalla y que se envía el formulario.

### 4.3 Response exitosa

```jsonc
{
  "success": true,
  "data": {
    "id": "MAT-STE-2026-00123",
    "tipo": "Conversion a Item Dimensionado",
    "itemOrigen": "BUMPER-GEN",
    "itemDestino": "BUMPER-DIM",
    "warehouse": "ALM-01",
    "qty": 10,
    "postingDate": "2026-01-20",
    "branch": "Principal",
    "remarks": "Conversión para pedido de cliente"
  }
}
```

Mostralo en el historial/detalle de inventario igual que ya hacés con los Ajustes/Reclasificaciones
— es un `Stock Entry` sometido, consultable como cualquier otro movimiento.

### 4.4 Errores propios de esta pantalla

| Situación | Mensaje exacto |
|---|---|
| `dimensiones` vacío u omitido | `Debe indicar la combinación completa a asignar en "dimensiones" al convertir hacia un ítem dimensionado.` |
| `itemOrigen` omitido y el `itemDestino` no tiene `itemGenericoOrigen` configurado | `El ítem "{itemDestino}" no tiene configurado un ítem genérico de origen (Item.custom_item_generico_origen) — indique "itemOrigen" explícitamente, o configure ese campo en el ítem destino antes de convertir.` — si tu pantalla deja elegir un `itemDestino` sin genérico configurado (no debería, ver §4.1), mostrá este mensaje señalando que falta ir a Catálogo → Artículos y configurarlo (§3.1) |
| Algún código de `dimensiones` no es una dimensión activa del tenant | Mismo error que ya conocés de Ajuste/Reclasificación de Combinación (`«{codigo}» no es una dimensión de inventario de esta empresa...`) |
| Falta algún valor de la combinación, o la combinación no es válida para el artículo | Mismos mensajes de `_validar_fila`/`_validar_combinacion`/`_validar_jerarquia` que ya conocés y manejás de §11 del documento base — nada nuevo que programar, son los mismos errores de siempre |
| Stock insuficiente del ítem genérico en ese almacén | Error nativo de ERPNext de stock negativo (mismo que ya manejás en cualquier salida de inventario sin dimensión — no es un error nuevo de este flujo) |

---

## 5. Qué NO hacer

- **No crees un endpoint ni una pantalla para "deshacer" una conversión.** No existe conversión
  inversa en esta primera fase — si se convirtió con la combinación equivocada, usá Reclasificación
  de Combinación (§8.6 del documento base) sobre el ítem YA dimensionado para corregir la
  combinación, no para "devolverlo" al genérico.
- **No permitas repartir una sola conversión en varias combinaciones en un solo formulario.** Cada
  llamada a `POST /inventory/conversion-dimension` asigna UNA combinación. Para convertir 10
  unidades a (2024, Rojo) y 10 a (2024, Azul), son dos envíos separados del mismo formulario.
- **No agregues ningún toggle de "habilitar conversión" a nivel de tenant/configuración global.**
  No existe tal cosa — la capacidad se configura exclusivamente por artículo (`itemGenericoOrigen`,
  §3.1). Si ves la tentación de agregar un switch en una pantalla de Configuración general para
  esto, es una señal de que algo se entendió mal: no lo hagas.
- **No fuerces `isSalesItem`/`isPurchaseItem` a `false` automáticamente** cuando el usuario
  configura `itemGenericoOrigen` — son recomendaciones independientes (§3.2), el usuario decide
  cada campo por separado.
- **No asumas que el ítem genérico y el dimensionado comparten precio o costo por defecto en la UI**
  — la conversión transporta el **costo** (valuación) del genérico al dimensionado automáticamente
  del lado del servidor (no hace falta que el frontend calcule ni muestre nada de esto), pero el
  **precio de venta** del ítem dimensionado es independiente y se configura en su propia ficha,
  como cualquier otro artículo.

---

## 6. Checklist de implementación

- [ ] Regenerado el cliente/tipos desde el `openapi.json` actualizado.
- [ ] Confirmado que `docs/frontend/PROMPT_INVENTORY_DIMENSIONS_FRONTEND.md` ya está implementado
      (prerrequisito).
- [ ] Catálogo → Artículos: campo `itemGenericoOrigen` (selector de ítem, gateado por
      `usaDimensiones: true`), con manejo de los 2 errores 400 de §3.3.
- [ ] Catálogo → Artículos: checkboxes `isSalesItem`/`isPurchaseItem` (default `true` si no se
      tocan), con los textos sugeridos de §3.2.
- [ ] Nueva pantalla/acción "Conversión a Ítem Dimensionado", en el mismo lugar que Ajuste/
      Reclasificación de Combinación, gateada por `inventario.convertir-dimension`.
- [ ] Formulario de conversión: selector de destino filtrado a artículos dimensionados con
      genérico configurado, origen mostrado informativo (resuelto automáticamente, §4.2), cantidad,
      almacén, selectores en cascada de combinación (mismo componente ya existente).
- [ ] Manejo de los errores de §4.4, reusando el manejo de errores de combinación ya implementado
      para Ajuste/Reclasificación donde aplique.
- [ ] Verificado que un artículo sin `itemGenericoOrigen` configurado no muestra ningún cambio de
      comportamiento en ninguna pantalla existente.
- [ ] Verificado que `isSalesItem`/`isPurchaseItem` omitidos en un formulario existente no cambian
      ningún artículo ya creado (default `true`, comportamiento histórico preservado).
