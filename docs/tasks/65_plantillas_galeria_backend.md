# Prompt para agente de frontend — Conectar la galería de plantillas prediseñadas al backend real

> Este documento es un prompt autocontenido para un agente de IA de frontend. Describe cómo
> reemplazar el mock `fetchTemplateGallery()` / `MOCK_TEMPLATE_GALLERY`
> (`src/features/invoice-template-editor/mocks.ts`) por una llamada real al BFF, ahora que el
> endpoint que faltaba ya está implementado y desplegado:
>
> ```
> GET /plantillas/galeria
> GET /plantillas/galeria?type=Pos%20Invoice
> ```
>
> Asume que el resto del editor de plantillas de impresión (`Pos Invoice` / `Label 5x2`) **ya
> está conectado** contra el BFF real tal como describe
> `docs/frontend-tasks/55_plantillas_impresion_editor_pos_y_etiquetas.md` — este documento NO
> repite esas convenciones generales (auth, envoltorio `{success, data}`, que `type` en la API es
> `"Pos Invoice"` / `"Label 5x2"` con espacio, nunca `pos_invoice`/`label_5x2`). Si el editor
> todavía no está conectado, implementa primero el documento 55 y vuelve a este después.
>
> **Refresca tu `openapi.json`** desde `GET /api/docs-json` (o desde Scalar en
> `https://gensapi.ryancfx.click/api/docs`) **antes de empezar** — el endpoint `GET
> /plantillas/galeria` es nuevo y no vas a encontrar su schema (`GaleriaPlantillaDto`,
> `GaleriaPlantillaEnvelopeDto`, `ListaGaleriaPlantillaQueryDto`) en una copia vieja del spec. Todo
> lo que este documento describe está reflejado ahí — úsalo como fuente de verdad para los tipos
> exactos si algo no queda claro en el texto. API base
> `https://gensapi.ryancfx.click/api/v1` (o `http://localhost:4000/api/v1` en desarrollo).

---

## 0 — Contexto: qué cambia y qué NO cambia

Hoy, en la pestaña lateral **"Plantillas"** del editor (`config/plantillas-facturas` y su
equivalente de etiquetas), el componente `TemplateGalleryTab.tsx` recibe su contenido desde
`fetchTemplateGallery()` en `src/features/invoice-template-editor/mocks.ts` — una función que
devuelve un array **hardcodeado en el propio frontend**, sin ningún llamado de red. Ese mock ya
cumplió su función como placeholder mientras el backend no existía. Ahora existe, y esta tarea es
pura plomería: reemplazar la función mock por un fetch real, sin cambiar el contrato visual ni el
comportamiento que el usuario ya conoce.

**Lo que NO cambia:**
- El shape de cada ítem de galería (`id`, `type`/`plantillaType` según cómo lo mapees, `name`,
  `description`, `document`) es exactamente el mismo tipo `TemplateGalleryItem` /
  `TemplateDocument` que el frontend ya tiene modelado en `types.ts` — el mismo que usa
  `documentJson` en el resto del módulo. No hay que tocar el modelo de datos ni el componente que
  renderiza la vista previa de cada tarjeta.
- El botón "Usar" sigue haciendo exactamente lo que hace hoy: tomar el `document` del ítem
  seleccionado y cargarlo como estado inicial del canvas del editor. Ese flujo no cambia, solo
  cambia de dónde sale el array de ítems disponibles.
- Las 5 plantillas que ya conocías (POS Minimalista, POS Completa, POS con Logo y Código de
  Barras, Etiqueta Simple, Etiqueta con Código de Barras) sirven **contenido idéntico** al que
  tenías mockeado — coordenadas, textos de ejemplo y bindings son los mismos, migrados 1:1. No
  deberías notar ninguna diferencia visual en su preview.

**Lo que SÍ cambia:**
- Aparece una **6ta plantilla nueva**, `POS Farmacia — Cobertura ARS`, que **solo es visible para
  tenants del vertical farmacia** (ver Fase 3). Un tenant normal (`vertical: "general"`) nunca la
  va a ver en la respuesta — ni siquiera oculta o deshabilitada, directamente no viene en el
  array. No necesitas escribir ningún filtro adicional en el frontend para ocultarla: el filtrado
  ya lo hace el servidor.
- El endpoint acepta un query param `?type=` opcional para filtrar por tipo del lado del servidor
  (ver Fase 2) — hoy tu componente probablemente recibe el array completo (5 ítems, mezclando POS
  y etiquetas) y no filtra por pantalla. Esta tarea incluye corregir eso.

---

## Fase 1 — Reemplazar el mock por el fetch real

### 1.1 Ubicar el código a tocar

- `src/features/invoice-template-editor/mocks.ts` — contiene `fetchTemplateGallery()` y la
  constante `MOCK_TEMPLATE_GALLERY` (junto con los builders `buildMinimalPosInvoice`,
  `buildCompletePosInvoice`, `buildLogoPosInvoice`, `buildSimpleLabel`, `buildBarcodeLabel` que la
  arman). Todo este archivo puede tratarse como **solo de lectura de referencia** a partir de
  ahora para esta función específica — una vez conectado el endpoint real, `fetchTemplateGallery`
  y todo lo que solo exista para construirla dejan de usarse.
- El o los componentes que llaman a `fetchTemplateGallery()` — típicamente
  `TemplateGalleryTab.tsx` y/o el componente contenedor del editor
  (`InvoiceTemplateEditorPage.tsx` / `TemplateEditorLeftPanel.tsx`, según cómo esté armado el data
  fetching en tu versión actual del código). Busca todas las referencias a
  `fetchTemplateGallery` y `templateGallery` antes de tocar nada, para no dejar un import roto.

### 1.2 La función real que reemplaza al mock

Crea (o modifica, si ya existe un cliente HTTP compartido para `/plantillas`) una función que
llame al endpoint real, siguiendo el mismo patrón de auth/headers que ya usa el resto del módulo
`/plantillas` (`fetchTemplatesList`, `fetchDefaultTemplate`, etc. — mismo cliente HTTP, mismos
headers `Authorization`/`X-Tenant`, mismo manejo de errores):

```
GET /plantillas/galeria
GET /plantillas/galeria?type=Pos%20Invoice
GET /plantillas/galeria?type=Label%205x2
```

Respuesta (200):

```json
{
  "success": true,
  "data": [
    {
      "id": "pos_invoice_minimal",
      "type": "Pos Invoice",
      "name": "POS Minimalista",
      "description": "Solo lo esencial: encabezado, fecha, items y total.",
      "document": { "page": { "...": "..." }, "pages": [ { "...": "..." } ] }
    }
  ]
}
```

Notas exactas sobre el shape (verifícalas contra tu `openapi.json` refrescado, componente
`GaleriaPlantillaDto`):

- `id`: string. **Son los mismos slugs que ya usabas en el mock** para los primeros 5 ítems
  (`pos_invoice_minimal`, `pos_invoice_completa`, `pos_invoice_logo_barcode`,
  `label_5x2_simple`, `label_5x2_barcode`) más uno nuevo, `pos_invoice_farmacia_ars`. Si tu
  código de frontend usaba esos ids como keys de React o para lógica de "plantilla ya usada",
  sigue funcionando sin cambios.
- `type`: `"Pos Invoice"` | `"Label 5x2"` — **con el espacio literal**, igual que en todo el resto
  del módulo. Si tu modelo interno de frontend usa `pos_invoice`/`label_5x2` (snake_case, como
  advierte la nota de contexto de doc 55), este es el punto donde tienes que mapear
  `"Pos Invoice" → 'pos_invoice'` / `"Label 5x2" → 'label_5x2'`, tal como ya haces para el resto
  de los endpoints de `/plantillas`. No asumas que puedes usar el string de la API directamente
  como tu enum interno sin pasar por ese mapeo, si ese mapeo ya existe en tu código para los otros
  endpoints — reutilízalo, no inventes uno nuevo solo para galería.
- `name` / `description`: strings ya en español, listos para mostrar tal cual — no hay claves de
  i18n que resolver, no hay que truncar ni formatear.
- `document`: es el mismo `TemplateDocument` (`page` + `pages[].elements[]`) que ya manejas como
  `documentJson` en el resto del módulo — pásalo tal cual al mismo tipo/estado que usas hoy para
  cargar una plantilla en el canvas. No lo valides ni le agregues casos especiales de parsing: es
  un blob opaco, igual que en el resto de la API.
- Array **plano, sin agrupar por tipo** — si pediste sin `?type=`, vienen los 6 ítems (o 5, si el
  tenant no es farmacia) mezclados, cada uno autoidentificado por su propio campo `type`. No
  esperes una respuesta con forma `{ posInvoice: [...], label: [...] }`.
- **No está paginado.** No hay `meta`, no hay `limit`/`offset`, no hay `hasMore`. Es un catálogo
  fijo y chico — trátalo como una lista completa siempre.

### 1.3 Reemplazo concreto

```ts
// Antes (mocks.ts)
export async function fetchTemplateGallery(): Promise<TemplateGalleryItem[]> {
  return MOCK_TEMPLATE_GALLERY;
}

// Después (donde corresponda en tu capa de API real de /plantillas)
export async function fetchTemplateGallery(
  type?: PlantillaType, // ver Fase 2 — mismo tipo que ya usas para /plantillas?type=
): Promise<TemplateGalleryItem[]> {
  const params = type ? { type } : undefined;
  const { data } = await apiClient.get('/plantillas/galeria', { params });
  return data.data.map(mapGaleriaItemToTemplateGalleryItem); // ver 1.2 para el mapeo de `type`
}
```

Ajusta nombres de variables/cliente HTTP al patrón real que ya usa tu código para
`/plantillas?type=` (mismo `apiClient`, mismo interceptor de `Authorization`/`X-Tenant`, mismo
manejo de 401/403 global). El objetivo de este snippet es solo mostrar la forma — no lo copies
literal si tu cliente HTTP tiene otra firma.

Una vez reemplazada, **borra** `MOCK_TEMPLATE_GALLERY` y los builders que solo existían para
armarla (`buildMinimalPosInvoice`, `buildCompletePosInvoice`, `buildLogoPosInvoice`,
`buildSimpleLabel`, `buildBarcodeLabel`) de `mocks.ts`, siempre que ningún otro lugar del código
los importe (verifícalo con una búsqueda de referencias antes de borrar — si algún test unitario
los usa como fixture, está bien dejarlos ahí pero fuera del path de producción, o migrarlos a un
archivo de fixtures de test).

---

## Fase 2 — Filtrar por tipo según la pantalla activa

### 2.1 El bug pendiente que esta fase corrige

Ahora mismo (con el mock), `TemplateEditorLeftPanel.tsx` → `InvoiceTemplateEditorPage.tsx` pasa el
arreglo completo de la galería (`templateGallery`, sin filtrar) a la pestaña "Plantillas" sin
importar si la pantalla activa es de facturas POS o de etiquetas. Esto significa que hoy, un
usuario en `/config/plantillas-facturas` **también ve las 2 plantillas de etiquetas** mezcladas en
la lista, y viceversa en la pantalla de etiquetas. Es un bug cosmético menor, pero con 6 ítems (en
vez de 5) en el catálogo va a ser un poco más notorio, así que esta fase lo corrige de una vez.

### 2.2 Qué hacer

El editor ya sabe, en cualquier punto donde se renderiza (`fixedType` o una prop equivalente que
indique si la pantalla activa es `Pos Invoice` o `Label 5x2` — usa el nombre real que tenga esa
prop en tu código, revisa cómo el resto del editor ya distingue "estoy en la pantalla de
facturas" vs "estoy en la de etiquetas"), qué tipo de plantilla corresponde a la pantalla actual.
Con eso:

1. Pasa ese tipo como el parámetro `type` al llamar `fetchTemplateGallery(type)` (la firma que
   armaste en 1.3) — el filtro ya lo hace el servidor, así que la respuesta ya viene solo con los
   ítems de ese tipo. **Preferí filtrar en el servidor (`?type=`) antes que traer los 6 y filtrar
   en el cliente** — es menos payload y evita que, si el backend agrega un 7mo ítem de un tipo que
   tu frontend todavía no maneja, se filtre mal por una lista hardcodeada de ids en el cliente.
2. Si por alguna razón tu arquitectura de fetching ya trae el catálogo completo una sola vez (por
   ejemplo, cacheado a nivel de un contexto/store superior que no conoce todavía qué pantalla está
   activa) y filtrar server-side no es práctico ahí, como alternativa válida podés filtrar
   client-side por `item.type === fixedType` (con el mapeo de 1.2 ya aplicado) — pero es la opción
   B, no la preferida.
3. Verifica que, tras este cambio, la pestaña "Plantillas" en `/config/plantillas-facturas`
   muestre únicamente `POS Minimalista`, `POS Completa`, `POS con Logo y Código de Barras` (y
   `POS Farmacia — Cobertura ARS` si el tenant es farmacia, ver Fase 3) — nunca las 2 de
   etiquetas. Y que la pantalla de etiquetas muestre únicamente `Etiqueta Simple` y `Etiqueta con
   Código de Barras`.

---

## Fase 3 — El ítem de farmacia y el gating por vertical

### 3.1 No hay nada que filtrar en el frontend — y eso es a propósito

El ítem `pos_invoice_farmacia_ars` (`POS Farmacia — Cobertura ARS`) **ya viene excluido del array
por el servidor** para cualquier tenant cuyo vertical no sea `farmacia`. Esto es deliberado: el
backend resuelve el vertical del tenant actual con la misma lógica que ya usa
`GET /me/permissions` (campo `vertical: "general" | "farmacia"` que tu código ya consume en
`src/shared/api/me.ts` / `src/shared/permissions/rutas.ts` para la regla `soloFarmacia` de rutas
enteras).

**Qué implica esto para ti:**
- **No agregues ningún filtro nuevo en el frontend para este ítem.** No hace falta comparar
  `vertical === 'farmacia'` en ningún lado nuevo antes de mostrar la tarjeta de la plantilla —
  el ítem directamente no va a estar en `data` para un tenant no-farmacia. Si escribís un filtro
  redundante, no rompe nada, pero es trabajo de más que el servidor ya te resuelve.
- **No hay ningún campo `vertical` ni `soloFarmacia` en la respuesta del ítem.** No intentes leer
  `item.vertical` o `item.soloFarmacia` para decidir si mostrarlo — esos campos no existen en el
  JSON, es una marca puramente interna del backend.
- Para probar esto en desarrollo: necesitas un tenant configurado con `vertical: "farmacia"` para
  ver la 6ta tarjeta aparecer. Contra un tenant normal, `GET /plantillas/galeria` (con o sin
  `?type=`) siempre te va a devolver 5 ítems como máximo, nunca 6.

### 3.2 Una vez que el ítem es visible (tenant farmacia): qué esperar del preview

Cuando el usuario esté en un tenant farmacia y vea la tarjeta `POS Farmacia — Cobertura ARS`, su
`document` trae una tabla de items con dos columnas **visibles por defecto** que en las otras
plantillas vienen ocultas: `coberturaArs` (label "ARS") y `montoPaciente` (label "Paciente"). El
componente de preview de la galería no necesita ningún cambio para renderizar esto — si ya sabe
pintar una columna de tabla marcada `visible: true`, esta plantilla no es un caso especial.

**Aviso importante para no perder tiempo debuggeando algo que no es un bug de frontend:** si en
algún momento posterior conectas esta plantilla contra una factura real (fuera del preview
estático de la galería, es decir cuando el usuario la "usa" y luego imprime/previsualiza contra
`render-data` de una venta real), es esperable que las columnas `coberturaArs`/`montoPaciente`
vengan **vacías o sin binding resuelto** — el catálogo de campos disponibles
(`campos-disponibles`/`render-data`, doc 55 §2.1) todavía no expone esos dos bindings ni una
categoría `seguro.*` para farmacia. Es un gap conocido del lado del backend (ver doc 55 y el
seguimiento abierto sobre `items.tabla`), no algo que el frontend deba resolver ni ocultar con un
workaround — si lo notás durante pruebas, no es un bug tuyo.

---

## Fase 4 — Manejo de errores

Sigue exactamente el mismo patrón de errores que ya usas para el resto de `/plantillas` (envoltorio
`{ success: false, error: { code, message, statusCode } }` vía el filtro global de excepciones del
BFF):

| Caso | Qué hace el backend | Qué debe hacer el frontend |
|---|---|---|
| `?type=` con un valor que no es `"Pos Invoice"` ni `"Label 5x2"` | `400`, mensaje `type inválido. Valores permitidos: "Pos Invoice", "Label 5x2".` | No debería ocurrir en uso normal si armas el query param desde tu propio enum interno mapeado (1.2) — pero si tu llamado construye el query string a mano en algún punto, valida antes de mandar, o al menos no dejes que un 400 acá tumbe toda la pestaña "Plantillas": mostrá el error igual que ya manejas otros 400 del módulo. |
| Sin `type`, o `type` válido pero sin ítems para ese tenant (ej. tenant no-farmacia filtrando expresamente algo que no aplica) | `200` con `data: []` | **Nunca es un error.** Renderiza el estado vacío normal de la pestaña "Plantillas" (si ya tenés uno para "no hay plantillas guardadas" en el CRUD, uno equivalente acá está bien) — no muestres un mensaje de error ni un spinner infinito para un array vacío legítimo. |
| Fallo de red / 401 / 403 / 5xx | Igual que cualquier otro endpoint de `/plantillas` | Reusa el mismo manejo global que ya tenés (interceptor de auth, mensaje de error genérico, retry si aplica) — no es un caso especial de este endpoint. |

No hay caso `404` para este endpoint — no lo agregues como posibilidad a manejar.

---

## Fase 5 — Checklist de verificación antes de dar por terminada la tarea

Verifica cada uno de estos puntos manualmente (o con tests, si tu proyecto ya tiene tests para
`TemplateGalleryTab.tsx`) antes de considerar esta tarea completa:

1. `mocks.ts` ya no tiene ningún llamado real pasando por `MOCK_TEMPLATE_GALLERY` en producción —
   la pestaña "Plantillas" hace un fetch de red real a `GET /plantillas/galeria`.
2. En un tenant **no** farmacia:
   - `/config/plantillas-facturas` → pestaña "Plantillas" muestra exactamente 3 tarjetas: POS
     Minimalista, POS Completa, POS con Logo y Código de Barras. **Nunca** aparece "POS Farmacia
     — Cobertura ARS", y **nunca** aparecen las 2 de etiquetas.
   - La pantalla de etiquetas → pestaña "Plantillas" muestra exactamente 2 tarjetas: Etiqueta
     Simple, Etiqueta con Código de Barras.
3. En un tenant farmacia:
   - `/config/plantillas-facturas` → pestaña "Plantillas" muestra las 3 anteriores **más** "POS
     Farmacia — Cobertura ARS" (4 en total).
4. El botón "Usar" en cada una de las 6 tarjetas sigue cargando el documento correcto en el
   canvas del editor, igual que antes de este cambio (verificar visualmente que el preview/canvas
   coincide con lo que se veía en la tarjeta).
5. Ningún import roto ni warning de "unused variable" tras borrar el código muerto de `mocks.ts`
   (Fase 1.3).
6. Si tu proyecto tiene tests de snapshot o unitarios sobre `TemplateGalleryTab.tsx` que mockeaban
   `fetchTemplateGallery`, actualízalos para mockear la nueva firma (con `type` opcional) en vez
   de asumir el array estático viejo.

---

## Resumen de lo que debe entregar el frontend

1. `fetchTemplateGallery(type?)` real, contra `GET /plantillas/galeria?type=`, con el mismo
   cliente HTTP/headers/manejo de errores que el resto de `/plantillas` — Fase 1.
2. Filtro por `type` pasado server-side desde la pantalla activa (facturas vs. etiquetas),
   corrigiendo el bug de mezcla de tipos que existía con el mock — Fase 2.
3. Nada que hacer para el gating de farmacia salvo **no** agregar un filtro redundante — ya viene
   resuelto por el servidor — Fase 3.
4. Manejo de errores y de la respuesta vacía (`data: []`) igual que el resto del módulo — Fase 4.
5. Checklist de Fase 5 verificado antes de cerrar la tarea.

---

*Generado a partir del prompt de backend que originó `GET /plantillas/galeria`
(`docs/frontend-tasks/55_plantillas_impresion_editor_pos_y_etiquetas.md` como base de
convenciones), y del código real de
`src/modules/plantillas/{plantillas.controller.ts,plantillas.service.ts,plantillas.galeria.ts,dto/plantilla-impresion.dto.ts}`
en el repo del BFF.*
