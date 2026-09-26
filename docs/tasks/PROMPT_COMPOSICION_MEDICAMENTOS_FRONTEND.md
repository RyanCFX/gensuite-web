# Implementación frontend — Composición de medicamentos y motor de recomendación (Farmacia)

> **Para quien recibe este documento:** el backend (BFF) ya está implementado, testeado (251
> tests unitarios en verde) y su contrato queda reflejado en el `openapi.json` del repo del
> frontend — **regeneralo/actualizalo antes de empezar** (o pedile a quien lo genera que lo
> actualice) para tener el detalle exacto de cada schema, porque acá se transcribe el contrato
> pero el `openapi.json` es la fuente que **NestJS/Swagger genera del código real** y por lo
> tanto nunca puede desincronizarse. Este documento no reemplaza al `openapi.json`: lo explica,
> le da contexto de negocio, y dice qué construir con él — usalos juntos, no uno en vez del otro.
>
> Este documento es **autosuficiente en el dominio**: no asume que quien lo implementa sabe qué
> es un principio activo, una firma de composición o un "motor de recomendación por composición".
> Se explica todo desde cero en la §1. Si en algún punto tenés que adivinar algo que no está
> escrito acá ni en el `openapi.json`, **no improvises silenciosamente** — es señal de que hay
> que preguntar antes de construir esa parte.
>
> Plan de backend completo (útil si necesitás el "por qué" de una decisión que acá se da por
> sentada): `docs/plans/PLAN_COMPOSICION_MEDICAMENTOS_RECOMENDACION.md` (en el repo del BFF).

---

## Índice

1. [El dominio, explicado desde cero](#1-el-dominio-explicado-desde-cero)
2. [Reglas de negocio que la UI está OBLIGADA a respetar](#2-reglas-de-negocio-que-la-ui-está-obligada-a-respetar)
3. [Gating: cuándo mostrar esto y cuándo no](#3-gating-cuándo-mostrar-esto-y-cuándo-no)
4. [Mapa de endpoints (resumen)](#4-mapa-de-endpoints-resumen)
5. [Pantalla A — Catálogo maestro de Principios Activos](#5-pantalla-a--catálogo-maestro-de-principios-activos)
6. [Pantalla B — Composición dentro de la ficha de un Artículo](#6-pantalla-b--composición-dentro-de-la-ficha-de-un-artículo)
7. [Filtros nuevos en el listado de Catálogo de Artículos](#7-filtros-nuevos-en-el-listado-de-catálogo-de-artículos)
8. [Pantalla C — Equivalentes por composición (en la ficha del artículo)](#8-pantalla-c--equivalentes-por-composición-en-la-ficha-del-artículo)
9. [Pantalla D — Búsqueda asistida (mostrador / POS)](#9-pantalla-d--búsqueda-asistida-mostrador--pos)
10. [Componente compartido: tarjeta/fila de "Equivalente"](#10-componente-compartido-tarjetafila-de-equivalente)
11. [Manejo de errores](#11-manejo-de-errores)
12. [Casos vacíos y de borde — qué mostrar en cada uno](#12-casos-vacíos-y-de-borde--qué-mostrar-en-cada-uno)
13. [Checklist de implementación](#13-checklist-de-implementación)

---

## 1. El dominio, explicado desde cero

### 1.1 Qué es un "principio activo" y por qué esto no es lo mismo que un combo

Un medicamento comercial (lo que se vende en una caja, con nombre y marca) contiene una o más
**sustancias que producen el efecto terapéutico**: los **principios activos**. Tres cajas de tres
marcas distintas ("Panadol", "Tylenol", "Acetaminofén Genérico") pueden tener **el mismo**
principio activo ("Acetaminofén") en la misma dosis — son, en la práctica, el mismo medicamento
vendido por tres laboratorios distintos a tres precios distintos.

⚠️ **Esto NO es lo mismo que un "combo"/"bundle" del catálogo** (que ya existe en el sistema, en
`/catalog/bundles`: un kit comercial tipo "cuaderno + lápiz + regla" que se explota en líneas al
facturar). Un principio activo es puramente descriptivo — no tiene stock propio, no se vende por
separado, no se "explota" en nada. Si en algún componente ya existente usás la palabra
"componente" para los items de un bundle, **no reutilices esa palabra ni ese componente para
esto** — son conceptos completamente distintos aunque el usuario final coloquialmente diga
"componentes" para ambos. En el código y las variables usá "principio activo"/`activeIngredient`,
nunca "componente"/`component`.

### 1.2 Concentración: cantidad Y/O porcentaje (ambas opcionales)

Un principio activo se declara con, opcionalmente, **cuánto** hay de él:

- **Cantidad absoluta por unidad**: "500 mg por 1 tableta" (sólidos), o "250 mg por 5 mL"
  (líquidos/jarabes).
- **Porcentaje**: "Hidrocortisona 1%" (cremas, ungüentos, soluciones).
- **Unidades biológicas**: "Insulina 100 UI por mL" — las UI **no equivalen a miligramos**, son
  su propia unidad.

El campo de concentración es **siempre opcional**: se puede declarar solo "qué contiene" un
artículo sin decir "cuánto", y completarlo después. La UI **nunca debe forzar** al usuario a
llenar concentración para poder guardar una composición.

### 1.3 Forma farmacéutica y vía de administración

- **Forma farmacéutica**: Tableta, Cápsula, Jarabe, Crema, Inyectable, etc. — un catálogo abierto
  que el propio tenant puede ampliar (no es una lista fija hardcodeada en el frontend; se
  administra como un Link/selector, ver §6).
- **Vía de administración**: Oral, Tópica, Oftálmica, etc. — esta sí es una lista **cerrada**
  (ver el enum exacto en §6.2).

Importan porque "Acetaminofén 500 mg tableta" y "Acetaminofén 120 mg/5 mL jarabe" **no son
intercambiables** (uno es para adulto, el otro para niño) aunque compartan principio activo.

### 1.4 El "motor de recomendación": qué problema de negocio resuelve

Escenario real de mostrador: el cliente pide "Panadol". Está agotado, o cuesta más de lo que
quiere pagar. Hoy el cajero tiene que **saberse de memoria** que "Acetaminofén Genérico" sirve
igual y es más barato. Si es nuevo, no lo sabe, y se pierde la venta.

El motor resuelve esto: dado un artículo, devuelve una lista de **otros artículos con
composición parecida**, puntuados de 0 a 100 según qué tanto se parecen, ordenados de forma útil
(no solo por el puntaje: también importa si hay stock y si es más barato). La coincidencia
**textual exacta siempre sigue siendo el resultado principal** — el motor solo aporta una sección
aparte de sugerencias.

### 1.5 "Nivel" vs "Coincidencia" — dos cosas relacionadas pero DISTINTAS (importante para la UI)

Cada resultado del motor trae dos números/etiquetas que NO significan lo mismo y que la UI no
debe confundir:

- **`coincidencia`** (0 a 100, con 1 decimal): **cuánto se parece** el candidato al artículo
  original. **Este es el número que se muestra al usuario y el que define el orden dentro de un
  grupo.**
- **`nivel`** (1, 2 o 3): **cómo lo encontró** el motor (nivel 1 = firma de composición
  idéntica; nivel 2 = mismo principio activo, distinta dosis/forma; nivel 3 = comparte solo
  algunos principios de un combinado). Es **diagnóstico interno** — mostralo, si acaso, en un
  tooltip o en un detalle expandible, **nunca como el dato principal** ni como lo que ordena la
  lista.

### 1.6 Advertencia de encuadre — leer antes de diseñar cualquier pantalla

**Esto no es un motor de sustitución terapéutica ni consejo médico.** Es una ayuda de catálogo:
"estos otros artículos de tu inventario declaran una composición parecida". La decisión de
sustituir siempre es de una persona (farmacéutico, cajero, cliente). Ver la lista completa de
reglas obligatorias en la §2 — no son sugerencias de estilo, son requisitos del producto.

---

## 2. Reglas de negocio que la UI está OBLIGADA a respetar

Estas reglas no son negociables — están acá porque el backend explícitamente las decidió así y
romperlas en el frontend reintroduce un riesgo que el backend ya evitó:

1. **Nunca sustituir automáticamente nada.** El motor solo *sugiere*. Ningún flujo de la UI puede
   cambiar la línea de una factura, pedido o despacho automáticamente por un "equivalente" — el
   usuario siempre elige explícitamente y con un clic consciente (nunca preseleccionado).
2. **El texto `aviso` que trae CADA respuesta del motor tiene que mostrarse en pantalla,
   siempre**, no importa si hay 0, 1 o 50 resultados. Es un texto fijo del backend (no lo
   hardcodees en el frontend — mostralo tal cual viene en la respuesta, por si cambia). Ejemplo
   del texto actual: *"Sugerencias basadas en la composición declarada en el catálogo.
   Verificación profesional obligatoria antes de sustituir."*
3. **Nunca uses la palabra "bioequivalente"** en ningún label, tooltip o mensaje de la UI. Que
   dos productos declaren la misma composición **no prueba** que el cuerpo los absorba igual —
   eso es un concepto regulatorio distinto que el sistema no evalúa. La forma correcta de
   nombrarlo en la UI es **"misma composición declarada"** o **"equivalente de catálogo"**.
4. **Las coincidencias exactas (búsqueda textual) y los equivalentes (por composición) van
   SIEMPRE en secciones visualmente separadas** — nunca intercalados en una sola lista, nunca
   reordenados entre sí. Ver §9 para el detalle exacto de cómo viene esto en la respuesta de
   búsqueda asistida.
5. **El número de `coincidencia` es el dato principal a mostrar**, con la banda (`intercambiable`
   / `equivalente` / `similar` / `relacionado`) como etiqueta de apoyo — nunca al revés (nunca
   ocultar el número y mostrar solo un ícono de semáforo sin más contexto).

---

## 3. Gating: cuándo mostrar esto y cuándo no

Todo lo de este documento es **exclusivo del vertical Farmacia**. El sistema es multi-vertical
(hoy: `general` y `farmacia`) y un tenant de comercio general (ferretería, colmado, etc.) **no
debe ver absolutamente nada de esto**: ni el menú, ni pestañas, ni botones, ni siquiera
deshabilitados — directamente ausentes de la UI.

### 3.1 Cómo saber si el tenant actual es de vertical Farmacia

Llamá a `GET /api/v1/me` (mismo endpoint que ya usa el resto del sistema para permisos). La
respuesta trae:

```jsonc
{
  "success": true,
  "data": {
    "email": "...",
    "vertical": "farmacia",   // o "general" — ESTA es la bandera de gating de vertical
    "roles": [ /* ... */ ],
    "doctypes": { /* ... */ },
    "acciones": {
      "farmacia.principios-activos.listar": true,
      "farmacia.principios-activos.crear": true,
      "farmacia.principios-activos.editar": true,
      "farmacia.principios-activos.eliminar": false,
      "farmacia.principios-activos.fusionar": false,
      "catalogo.items.ver-composicion": true,
      "catalogo.items.editar-composicion": true,
      "farmacia.equivalentes.consultar": true
      // ... el resto de las acciones del sistema, mismo mecanismo ya usado en todo el frontend
    }
  }
}
```

Regla: **si `data.vertical !== 'farmacia'`, todo lo de este documento queda oculto** — sin
excepción. Esto es exactamente el mismo patrón que ya usa el resto del sistema para las pantallas
de Aseguradoras/Lotes ARS (ver `PROMPT_ASEGURADORAS_FRONTEND.md` si lo tenés a mano como
referencia de un gating por vertical ya implementado).

### 3.2 Cómo saber qué puede hacer el usuario (dentro de un tenant Farmacia)

Con `vertical === 'farmacia'` confirmado, cada acción puntual (botón "Nuevo principio activo",
pestaña "Composición", botón "Ver equivalentes", etc.) se habilita/oculta según
`data.acciones['<id-de-la-acción>']`. Las 8 acciones nuevas de esta feature, con su significado:

| Acción | Qué controla en la UI |
|---|---|
| `farmacia.principios-activos.listar` | Ver el catálogo maestro de principios activos (pantalla A) |
| `farmacia.principios-activos.crear` | Botón "Nuevo principio activo" |
| `farmacia.principios-activos.editar` | Botón "Editar" (incluye renombrar) en un principio activo |
| `farmacia.principios-activos.eliminar` | Botón "Deshabilitar" |
| `farmacia.principios-activos.fusionar` | Botón/acción "Fusionar duplicados" |
| `catalogo.items.ver-composicion` | Ver la pestaña/sección "Composición" en la ficha de un artículo |
| `catalogo.items.editar-composicion` | Botón "Editar composición" dentro de esa pestaña (modo solo-lectura si falta este permiso pero sí está el de arriba) |
| `farmacia.equivalentes.consultar` | Ver la sección de equivalentes sugeridos (tanto en la ficha del artículo como en la búsqueda asistida del mostrador/POS) |

**Importante**: esto es UX, no seguridad — el servidor vuelve a validar cada permiso en cada
llamada (devuelve 403 si no corresponde, ver §11). Ocultar el botón evita que el usuario llegue a
un error, no reemplaza la validación real.

---

## 4. Mapa de endpoints (resumen)

Todos bajo el prefijo global `/api/v1/`. Todos requieren el header **`X-Tenant`** (igual que el
resto del sistema) y el `Authorization: Bearer <jwt>` de siempre. Todos (salvo que se aclare lo
contrario) exigen `vertical === 'farmacia'` — un tenant general recibe **403** con
`code: "VERTICAL_NO_HABILITADO"` si por algún motivo se les llama.

| Método | Ruta | Para qué | Detalle |
|---|---|---|---|
| `GET` | `/farmacia/principios-activos` | Listar el catálogo maestro | §5.3 |
| `GET` | `/farmacia/principios-activos/:id` | Detalle (incluye artículos que lo usan) | §5.4 |
| `POST` | `/farmacia/principios-activos` | Crear | §5.5 |
| `PUT` | `/farmacia/principios-activos/:id` | Editar (incluye renombrar) | §5.6 |
| `DELETE` | `/farmacia/principios-activos/:id` | Deshabilitar (nunca borra) | §5.7 |
| `POST` | `/farmacia/principios-activos/:id/fusionar` | Fusionar un duplicado en otro | §5.8 |
| `GET` | `/catalog/items/:id/composicion` | Ver la composición de un artículo | §6.3 |
| `PUT` | `/catalog/items/:id/composicion` | Reemplazar TOTAL la composición | §6.4 |
| `GET` | `/catalog/items` | Listado de artículos — **3 filtros nuevos** | §7 |
| `GET` | `/catalog/items/:id/equivalentes` | Motor de recomendación sobre un artículo puntual | §8 |
| `GET` | `/farmacia/busqueda-asistida` | Búsqueda de mostrador con equivalentes aparte | §9 |

Adicionalmente, `POST`/`PUT` de `/catalog/items` (creación/edición normal de un artículo) ganan un
bloque **opcional** `composicion` en el body — ver §6.2 — para poder cargar todo en un solo paso
al crear un medicamento nuevo, sin tener que hacer una segunda llamada a
`PUT .../composicion` después.

---

## 5. Pantalla A — Catálogo maestro de Principios Activos

Es una pantalla de administración de catálogo, del mismo estilo que ya tiene el sistema para
Marcas o Categorías (`/catalog/brands`, `/catalog/categories`) — reutilizá esos componentes de
lista/formulario si ya existen, el patrón es idéntico: listado paginado con búsqueda, formulario
de alta/edición, botón deshabilitar en vez de eliminar.

Sugerencia de ubicación en el menú: dentro de "Catálogo" o dentro de un submenú propio de
"Farmacia" (según cómo esté organizado hoy el menú de Aseguradoras/Lotes ARS en tu frontend —
seguí ese mismo criterio de agrupación).

### 5.1 Modelo de datos (lo que ve/edita el usuario)

| Campo (nombre en la UI) | Campo en el JSON | Tipo | Obligatorio | Notas |
|---|---|---|---|---|
| Principio activo | `nombre` | texto | Sí (al crear) | Máx 140 caracteres. Es también el identificador (`id`) — ver §5.6 sobre qué pasa al renombrar. |
| Sinónimos | `sinonimos` | array de strings | No | Uno por línea en la UI (ej. un textarea con un sinónimo por renglón), se envía como array. Ej.: `["Paracetamol"]` para "Acetaminofén". |
| Código ATC | `codigoAtc` | texto | No | Máx 20 caracteres. Código de la clasificación ATC de la OMS — campo libre, no hace falta validarlo contra un catálogo. |
| Sustancia controlada | `esControlado` | boolean | No (default `false`) | Checkbox. Ver nota de UI abajo. |
| Descripción / notas | `descripcion` | texto | No | Libre, multilínea. |

**Nota de UI sobre "Sustancia controlada"**: hoy es solo informativo (el sistema no implementa
control de recetas todavía). Aun así, mostralo con un ícono/badge distintivo en la lista y el
detalle — es información sensible que un farmacéutico necesita ver de un vistazo.

**Campos que el backend calcula y NUNCA se editan desde el frontend** (vienen en las respuestas,
son de solo lectura si los mostrás):
- `id`: el identificador real del registro (ver §5.6, coincide con `nombre` salvo que se haya
  renombrado).
- `deshabilitado`: booleano, se cambia con la acción "Deshabilitar" (§5.7), no con un formulario.
- `cantidadArticulos`: solo viene si se pidió `incluirConteo=true` en el listado (ver §5.3).

### 5.2 Comportamiento del formulario de alta/edición

- Un solo formulario sirve para crear y editar (mismos campos).
- **No hay selector de duplicados en el formulario** — el backend valida por vos: si el nombre
  normalizado (sin tildes, mayúsculas, espacios colapsados) ya existe, la petición devuelve
  **409 Conflict** con este shape:
  ```json
  {
    "message": "Ya existe el principio activo \"Acetaminofén\" con el mismo nombre normalizado.",
    "candidato": { "id": "Acetaminofén", "nombre": "Acetaminofén", "esControlado": false, "deshabilitado": false, "..." : "..." }
  }
  ```
  **La UI debe capturar este 409 explícitamente** y mostrar un mensaje claro con el `candidato`
  ya existente (ej. "Ya existe 'Acetaminofén' — ¿querías usar ese en vez de crear uno nuevo?"),
  con un link/botón directo a su detalle. No lo trates como un error genérico de validación.

### 5.3 `GET /farmacia/principios-activos` — listado

Query params (todos opcionales):

| Param | Tipo | Default | Descripción |
|---|---|---|---|
| `search` | string | — | Búsqueda de texto (nombre, sinónimos, nombre normalizado) |
| `soloActivos` | boolean | — (trae todos) | `true` excluye los deshabilitados |
| `esControlado` | boolean | — | Filtra por sustancia controlada |
| `incluirConteo` | boolean | `false` | Si `true`, cada fila trae `cantidadArticulos` — **cuesta una consulta extra en el backend**, no lo pidas en cada tecla del buscador; pedilo, por ejemplo, al abrir la pantalla o al cambiar de página, no en cada debounce de búsqueda si podés evitarlo |
| `limit` | int | 20 | Paginación estándar del sistema (máx 100) |
| `offset` | int | 0 | Paginación estándar |
| `orderBy` | string | `nombre asc` | Mismo mecanismo de ordenamiento que el resto del catálogo |

Respuesta (paginación estándar del sistema, igual que cualquier otro listado):
```jsonc
{
  "success": true,
  "data": [ /* PrincipioActivoResponseDto[] — ver §5.1 */ ],
  "meta": { "total": 42, "limit": 20, "offset": 0, "hasMore": true }
}
```

### 5.4 `GET /farmacia/principios-activos/:id` — detalle

Devuelve el mismo shape que una fila del listado **más** un array `items`:

```jsonc
{
  "success": true,
  "data": {
    "id": "Acetaminofén",
    "nombre": "Acetaminofén",
    "sinonimos": ["Paracetamol"],
    "codigoAtc": "N02BE01",
    "esControlado": false,
    "deshabilitado": false,
    "descripcion": null,
    "items": [
      { "id": "MED-PANADOL-500", "nombre": "Panadol 500 mg" },
      { "id": "MED-ACETA-GEN-500", "nombre": "Acetaminofén Genérico 500 mg" }
    ]
  }
}
```

`items` está acotado a 100 resultados (no paginado más allá de eso) — es informativo ("¿quién usa
esto hoy?"), mostralo como una lista simple con link a cada artículo. Si necesitás explorar más
de 100, no hay endpoint dedicado a paginarlo — es un caso de borde que no debería ocurrir en la
práctica salvo con un principio activo extremadamente genérico.

### 5.5 `POST /farmacia/principios-activos` — crear

Body: los campos de §5.1 en camelCase (`nombre`, `sinonimos?`, `codigoAtc?`, `esControlado?`,
`descripcion?`). Respuesta: `{ success: true, data: PrincipioActivoResponseDto }`. Ver 409 en
§5.2.

### 5.6 `PUT /farmacia/principios-activos/:id` — editar (incluye renombrar)

Mismo body que crear, pero **todos los campos son opcionales** (solo se actualiza lo que se
manda). Detalle importante: **el `nombre` es también el identificador del registro** — si el
usuario edita el nombre, el `id` del recurso **cambia** en la respuesta. Consecuencias para la
UI:

- Si estás en la pantalla de detalle de un principio activo y el usuario le cambia el nombre,
  tras guardar exitosamente **navegá a la nueva URL con el nuevo `id`** (no sigas usando el viejo
  `id` en el estado local — quedaría apuntando a un recurso que ya no existe).
- El backend, al renombrar, también recalcula internamente las firmas de todos los artículos que
  usan ese principio (es transparente para el frontend, no hay nada que disparar manualmente).
- Mismo 409 de duplicado que en creación si el nuevo nombre ya existe.

### 5.7 `DELETE /farmacia/principios-activos/:id` — deshabilitar

**Nunca borra** — deshabilita (`disabled=1` del lado de ERPNext). Respuesta:

```jsonc
{
  "success": true,
  "data": {
    "message": "Principio activo deshabilitado correctamente",
    "advertencia": "Sigue asociado a 3 artículo(s) — no se modifican, pero dejan de aparecer en nuevas búsquedas por principio."
    // `advertencia` es undefined si no hay artículos asociados — no mostrar el campo en ese caso
  }
}
```

UI: pedí confirmación antes de deshabilitar (es una acción con efecto real, aunque reversible
re-habilitando por edición). Si la respuesta trae `advertencia`, mostrala como un toast/aviso
posterior a la confirmación de éxito — no bloquea la acción, solo informa.

### 5.8 `POST /farmacia/principios-activos/:id/fusionar` — fusionar duplicados

Para cuando el usuario detecta que, por ejemplo, "Acetaminofen" (sin tilde, mal cargado hace
tiempo) y "Acetaminofén" son el mismo principio y quiere unificarlos.

Body: `{ "destino": "Acetaminofén" }` (el `id` del principio que **absorbe** al actual, es decir,
al `:id` de la URL).

UI sugerida: en la pantalla de detalle de un principio activo (o en un modal desde el listado),
un flujo tipo "Fusionar este principio con otro" que:
1. Deja buscar/seleccionar el principio **destino** (un selector con búsqueda sobre el mismo
   listado de §5.3).
2. Advierte explícitamente, antes de confirmar, que esto es **irreversible en la práctica**: todas
   las filas de composición que usaban el actual pasarán a usar el destino, y el actual quedará
   deshabilitado.
3. Al confirmar, navegá al detalle del `destino` (el `:id` original queda deshabilitado y no
   tiene sentido seguir mostrando su pantalla).

Respuesta: `{ success: true, data: { articulosAfectados: number, procesados: number, actualizados: number } }` — mostrá al menos `articulosAfectados` en el mensaje de éxito ("Se reasignaron 12 artículos a 'Acetaminofén'").

---

## 6. Pantalla B — Composición dentro de la ficha de un Artículo

Esto se agrega a la ficha de artículo **ya existente** del catálogo (`/catalog/items/:id`), como
una sección o pestaña nueva — **no es una pantalla separada**. Sugerido: una pestaña llamada
"Composición" al lado de las que ya existan (Precios, Variantes, etc.), visible solo si
`vertical === 'farmacia'` y el usuario tiene `catalogo.items.ver-composicion`.

### 6.1 Lo que ya trae el artículo sin pedir nada extra

`GET /catalog/items/:id` (el endpoint de ficha que ya existe) ahora trae, además de todo lo que ya
traía, tres campos nuevos (siempre presentes, `false`/vacíos en un tenant no-Farmacia):

```jsonc
{
  // ...todos los campos que ya conocés del artículo...
  "esMedicamento": true,
  "formaFarmaceutica": "Tableta",
  "viaAdministracion": "Oral"
}
```

Usalos para, por ejemplo, mostrar un badge "Medicamento" en la cabecera de la ficha sin tener que
pedir el detalle completo de composición. **La lista de principios activos NO viene acá** — hace
falta el endpoint dedicado de §6.3 (evita pagar esa consulta extra en cada fila de un listado
donde nadie la necesita).

### 6.2 El interruptor maestro: `esMedicamento`

Todo el bloque de composición cuelga de un booleano `esMedicamento`. Regla de UI:

- Si `esMedicamento` es `false`: la pestaña "Composición" puede seguir existiendo pero muestra
  solo un toggle/checkbox "Es medicamento" apagado y nada más — el resto de los campos
  (`formaFarmaceutica`, `viaAdministracion`, `principiosActivos`) están **ocultos**, no solo
  deshabilitados.
- Al activar `esMedicamento`, recién ahí aparecen los demás campos, todos vacíos/editables:
  - **Forma farmacéutica** (`formaFarmaceutica`): selector con búsqueda contra un catálogo de
    "Dosage Form" — **no es una lista fija**, es un catálogo administrable del lado de ERPNext.
    (Si tu frontend no tiene hoy un endpoint genérico de catálogos personalizados de ERPNext,
    marcá esto como pendiente de confirmar con backend qué endpoint expone `Dosage Form` — no
    está en el alcance explícito de este documento, ver nota al final de esta sección.)
  - **Vía de administración** (`viaAdministracion`): selector de **lista cerrada**, estos son
    los ÚNICOS valores válidos, en este orden sugerido:
    `Oral, Tópica, Oftálmica, Ótica, Nasal, Rectal, Vaginal, Inhalatoria, Intravenosa,
    Intramuscular, Subcutánea` (más la opción vacía/"sin especificar").
  - **Principios activos** (`principiosActivos`): una grilla editable (filas agregables/
    eliminables), ver detalle de cada fila abajo.

> **Nota pendiente de confirmar con backend**: este documento no especifica un endpoint de
> listado para el catálogo `Dosage Form` (formas farmacéuticas) porque no forma parte del
> contrato HTTP de esta feature — es un doctype de ERPNext que hoy se administra únicamente vía
> el catálogo maestro sembrado por backend. Si tu frontend necesita un selector con búsqueda en
> vivo contra ese catálogo, es una pieza que falta y hay que pedirla explícitamente — no la
> inventes ni la hardcodees como lista fija (a diferencia de "vía de administración", que sí es
> una lista cerrada legítima). Mientras tanto, un `<input type="text">` libre para
> `formaFarmaceutica` es una alternativa razonable y no rompe nada del contrato (el campo es un
> string libre en el JSON).

### 6.2.1 Cada fila de `principiosActivos` (grilla editable)

| Campo (UI) | Campo JSON | Tipo | Obligatorio | Notas |
|---|---|---|---|---|
| Principio activo | `activeIngredient` | string (id) | **Sí** | Selector con búsqueda contra `GET /farmacia/principios-activos?search=...` (pantalla A). El usuario NUNCA escribe texto libre acá — siempre selecciona de ese catálogo, para que el motor de recomendación funcione (texto libre rompe el matcheo). |
| Concentración | `strengthValue` | número | No | Ver regla de pareja abajo. |
| Unidad | `strengthUom` | string, lista cerrada | No (obligatorio SI se llenó concentración) | Valores válidos EXACTOS: `mg`, `g`, `mcg`, `UI`, `mL`, `%`, `mEq` |
| "Por" (denominador) | `perValue` | número | No, default `1` | Ej. el "5" de "250 mg por 5 mL" |
| "Por" unidad | `perUom` | string, lista cerrada | No, default `Unidad` | Valores válidos EXACTOS: `Unidad`, `mL`, `g`, `Aplicación`, `Dosis` |
| Principal | `isPrimary` | boolean | No, default `false` | Checkbox. Ver regla "a lo sumo uno" abajo. |
| Notas | `notes` | string | No | Libre |

**Regla de pareja obligatoria (el backend la valida y devuelve 400 si se viola — mejor
prevenirla en el frontend)**: `strengthValue` y `strengthUom` van **juntos o ninguno**. Si el
usuario llena uno, exigí el otro antes de dejar guardar (o limpiá ambos si borra uno). Mismo
criterio para no dejar "500" sin unidad ni "mg" sin valor.

**Regla de unicidad**: no puede haber dos filas con el **mismo** `activeIngredient` — si el
usuario intenta agregar el mismo principio dos veces, bloqueálo en el cliente (el backend también
lo rechaza con 400, pero es mejor no dejar llegar a ese punto).

**Regla de "Principal"**: a lo sumo **una** fila puede tener `isPrimary=true` — es un checkbox de
selección única entre las filas (como un radio button conceptualmente, aunque el campo sea
booleano por fila). Útil solo quando hay más de un principio (productos combinados) — con un
solo principio no aporta nada, podés ocultarlo si `principiosActivos.length <= 1`.

**Ejemplos reales para probar la UI** (tomados del propio plan de backend, usalos como casos de
prueba):

| Producto | Fila(s) |
|---|---|
| Acetaminofén 500 mg tableta | 1 fila: Acetaminofén, 500, mg, 1, Unidad |
| Jarabe acetaminofén 250 mg/5 mL | 1 fila: Acetaminofén, 250, mg, 5, mL |
| Crema hidrocortisona 1% | 1 fila: Hidrocortisona, 1, %, 1, Unidad |
| Insulina 100 UI/mL | 1 fila: Insulina Humana, 100, UI, 1, mL |
| Panadol Antigripal (combinado) | 3 filas: Acetaminofén (500/mg/1/Unidad, principal), Fenilefrina (5/mg/1/Unidad), Clorfeniramina (2/mg/1/Unidad) |

### 6.3 `GET /catalog/items/:id/composicion` — leer el detalle completo

Se llama al entrar a la pestaña "Composición" (no hace falta pedirlo si el usuario nunca abre esa
pestaña). Respuesta:

```jsonc
{
  "success": true,
  "data": {
    "esMedicamento": true,
    "formaFarmaceutica": "Tableta",
    "viaAdministracion": "Oral",
    "principiosActivos": [
      {
        "activeIngredient": "Acetaminofén",
        "activeIngredientNombre": "Acetaminofén",   // nombre legible — mostralo, no `activeIngredient` crudo (aunque hoy suelen coincidir, no asumas que siempre será igual — ver §5.6 sobre renombrados)
        "strengthValue": 500,
        "strengthUom": "mg",
        "perValue": 1,
        "perUom": "Unidad",
        "isPrimary": true,
        "notes": null
      }
    ],
    "firmas": {
      "principios": "ACETAMINOFEN",
      "composicion": "TABLETA#ACETAMINOFEN:500000MCG/1UNIDAD"
    }
  }
}
```

⚠️ **El campo `firmas` es exclusivamente de depuración interna del motor — NUNCA lo muestres en
la UI, ni lo uses para ninguna lógica de negocio del frontend.** Es un detalle de implementación
del backend que se expone solo para que soporte/backend puedan diagnosticar un caso raro.

### 6.4 `PUT /catalog/items/:id/composicion` — guardar (reemplazo TOTAL)

**Esto es un reemplazo completo, no un parche.** El body que mandás es la lista COMPLETA de
principios activos que debe quedar — no hay forma de "agregar una fila" con una llamada parcial.
Body:

```jsonc
{
  "esMedicamento": true,
  "formaFarmaceutica": "Tableta",
  "viaAdministracion": "Oral",
  "principiosActivos": [
    { "activeIngredient": "Acetaminofén", "strengthValue": 500, "strengthUom": "mg", "perValue": 1, "perUom": "Unidad", "isPrimary": true }
  ]
}
```

Consecuencia de UI: el botón "Guardar" de esta pestaña siempre manda **el estado completo actual
del formulario** (todas las filas que el usuario ve en pantalla en ese momento, incluidas las que
no tocó), nunca un diff. Si el usuario "quita" una fila en la grilla y guarda, esa fila
desaparece de verdad del artículo.

Si `esMedicamento` se manda en `false`, el backend limpia todo el resto del bloque
automáticamente — podés mandar el body mínimo `{ "esMedicamento": false }` al desactivar el
interruptor, no hace falta seguir mandando las filas vacías.

Errores esperables de esta llamada (400, ver también §11): fila repetida, más de un `isPrimary`,
concentración sin unidad o viceversa, `activeIngredient` que no existe o está deshabilitado en el
catálogo maestro. El backend devuelve un `message` legible para cada uno — mostralo tal cual en
un toast de error, no lo reinterpretes.

### 6.5 Crear un medicamento completo en un solo paso (alta de artículo)

En el formulario de **creación** de un artículo nuevo (`POST /catalog/items`, el que ya existe),
y también en su **edición** general (`PUT /catalog/items/:id`), se puede incluir el mismo bloque
`composicion` de §6.4 como parte opcional del body — así se puede cargar todo de una sola vez sin
tener que crear el artículo y después ir a la pestaña de composición. **Es completamente
opcional**: si el formulario de alta de artículos no diferencia todavía entre "es medicamento" o
no, no hace falta tocar ese flujo — se puede seguir usando exclusivamente la pestaña dedicada de
la ficha (§6.3/§6.4). Si sí querés integrarlo en el alta (recomendado a mediano plazo, para
verticales Farmacia), agregá el mismo interruptor + grilla de §6.2 como una sección condicional
del formulario de alta, enviando el bloque `composicion` con la misma forma exacta.

---

## 7. Filtros nuevos en el listado de Catálogo de Artículos

`GET /catalog/items` (el listado que ya existe) suma tres query params opcionales, todos
combinables entre sí y con los filtros que ya existían:

| Param | Tipo | Descripción |
|---|---|---|
| `principioActivo` | string (id de un Active Ingredient) | Solo artículos que declaran ese principio en su composición |
| `esMedicamento` | boolean | Solo artículos con (o sin, si `false`) el interruptor activado |
| `formaFarmaceutica` | string (id de un Dosage Form) | Solo artículos con esa forma farmacéutica |

UI sugerida: en el panel de filtros del catálogo (donde ya estén Categoría/Marca/Tipo), agregar,
**solo si `vertical === 'farmacia'`**, un filtro "Principio activo" (selector con búsqueda contra
`/farmacia/principios-activos`) y un checkbox/toggle "Solo medicamentos". No hace falta exponer
`formaFarmaceutica` como filtro de primera si no hay espacio — es el menos prioritario de los
tres.

---

## 8. Pantalla C — Equivalentes por composición (en la ficha del artículo)

Sección nueva en la ficha de un artículo (`/catalog/items/:id`), visible solo si el artículo es
un medicamento (`esMedicamento === true`, ver §6.1 — no hace falta llamar a este endpoint si el
artículo no es medicamento, el backend te lo confirma igual mediante `motivo`, ver abajo, pero
evitá la llamada innecesaria) y el usuario tiene el permiso `farmacia.equivalentes.consultar`.

Sugerido: una sección "Equivalentes sugeridos" debajo o al lado de la de Composición, con un
listado de tarjetas/filas (ver el componente compartido de §10).

### 8.1 `GET /catalog/items/:id/equivalentes`

Query params (todos opcionales, con sus defaults):

| Param | Tipo | Default | Descripción |
|---|---|---|---|
| `nivelMinimo` | 1 \| 2 \| 3 | `2` | Nivel más laxo aceptado (§1.5). `1` = solo idénticos; `2` (default) = idénticos + mismo principio; `3` = también combinados que comparten solo algunos principios (más delicado clínicamente — ver nota abajo). |
| `coincidenciaMinima` | 0–100 | `60` | Puntaje mínimo para aparecer. |
| `orden` | `relevancia` \| `coincidencia` | `relevancia` | Ver §8.3. |
| `limit` | 1–50 | `10` | Paginación simple (no hay `offset` en este endpoint — es una lista corta de sugerencias, no un listado completo). |
| `branch` | string | — | Si se pasa, el `stock` de cada resultado se calcula solo contra los almacenes de esa sucursal (mismo concepto que ya existe en otras partes del sistema). |
| `soloConStock` | boolean | — | Si `true`, oculta los que no tienen existencia. |

**Nota de UI sobre `nivelMinimo=3`**: el propio backend lo trata como "off por defecto" porque
puede traer productos con principios ADICIONALES a los que buscabas (ej. buscás Acetaminofén
simple y aparece un antigripal con Acetaminofén + otras dos sustancias). Sugerido: no lo actives
por default en la UI; ofrecelo como un toggle/link explícito tipo "Ver más alternativas
(incluye combinados)" que el usuario activa a propósito.

### 8.2 La respuesta — shape completo de cada resultado

```jsonc
{
  "success": true,
  "data": [
    {
      "item": {
        "id": "MED-ACETA-GEN-500",
        "itemName": "Acetaminofén Genérico 500 mg",
        "brand": "Genfar",
        "category": "Analgesicos y Antipireticos",
        "image": "https://.../imagen.jpg",
        "standardRate": 45.0,
        "disabled": false
      },
      "coincidencia": 100,
      "banda": "intercambiable",
      "nivel": 1,
      "detalleCoincidencia": {
        "principios": 100,
        "dosis": 100,
        "forma": 100,
        "compartidos": ["ACETAMINOFEN"],
        "soloEnAncla": [],
        "soloEnCandidato": [],
        "tienePrincipiosAdicionales": false,
        "topeAplicado": null
      },
      "motivo": "Misma composición declarada (Tableta)",
      "bonoNegocio": 245,
      "stock": 120,
      "precio": 45.0,
      "diferenciaPrecioPct": -75.0
    }
  ],
  "ancla": "MED-PANADOL-500",
  "aviso": "Sugerencias basadas en la composición declarada en el catálogo. Verificación profesional obligatoria antes de sustituir."
}
```

Cuando NO hay resultados por una razón conocida (artículo sin composición declarada, o no es
medicamento), la respuesta trae `data: []` y un campo `motivo` a nivel raíz — ver §12.

Campo por campo, qué hacer con cada uno en la UI:

| Campo | Qué hacer |
|---|---|
| `item.*` | Mostrar nombre, marca, imagen — es el "resumen liviano" del artículo (§10). Si el usuario quiere el detalle completo, link a `/catalog/items/:id` con `item.id`. |
| `coincidencia` | **El número principal a mostrar** (ej. "100%", "94.2%"). Con 1 decimal tal cual viene, no redondees vos. |
| `banda` | Etiqueta de apoyo junto al número — ver mapeo sugerido de textos/colores en §10.2. Valores posibles, EXACTOS: `intercambiable`, `equivalente`, `similar`, `relacionado`. |
| `nivel` | NO mostrar como dato principal (§1.5) — a lo sumo en un tooltip/detalle expandible ("encontrado por: mismo principio activo"). |
| `detalleCoincidencia` | Opcional mostrarlo expandido/en tooltip para el usuario avanzado — ver §10.3 para una propuesta de cómo desglosarlo. `dosis` y `forma` pueden venir `null` (significa "no se pudo comparar con los datos cargados", NO significa 0% — no lo muestres como "0%", mostralo como "—" o "sin dato"). |
| `motivo` | Texto legible ya armado por el backend (ej. "Mismo principio activo (Acetaminofén), misma presentación — dosis distinta: 650 mg vs 500 mg") — mostralo tal cual, no lo reconstruyas vos mismo. |
| `bonoNegocio` | **NO mostrar este número al usuario** — es puramente interno para el ordenamiento (desempate dentro de una banda). Si querés dar una pista visual de por qué algo aparece primero dentro del mismo puntaje, mostrá directamente `stock`/`precio`/`diferenciaPrecioPct`, no este número compuesto. |
| `stock` | Número o `null`. `null` significa "no se pudo calcular" (ej. el usuario no tiene permiso de lectura sobre existencias) — mostrá "—" o directamente omití el dato, nunca "0" en ese caso. `0` (número) sí significa agotado de verdad — mostralo distinto a `null` (ej. "Agotado" en rojo vs "Existencia no disponible" en gris). |
| `precio` | Puede venir `undefined` si no hay precio configurado — ocultá el campo en ese caso, no muestres "$0" ni "$undefined". |
| `diferenciaPrecioPct` | Número (puede ser negativo = más barato, positivo = más caro) o `null` si falta algún precio para compararlo. Sugerido: "-75% más barato" / "+20% más caro", con `null` → no mostrar nada. |

### 8.3 Orden de los resultados (ya viene ordenado — no reordenes en el frontend)

La respuesta **ya viene en el orden correcto** para `orden=relevancia` (el default): primero por
banda (intercambiable > equivalente > similar > relacionado), y dentro de la misma banda, primero
los que tienen stock y mejor precio, y recién ahí por el puntaje exacto. Con `orden=coincidencia`
viene estrictamente por puntaje descendente, ignorando stock/precio. **En ningún caso el frontend
debe volver a ordenar el array `data`** — hacerlo rompe el criterio de negocio que el backend ya
aplicó (ver §10.3 del plan de backend si querés el detalle completo de por qué se diseñó así).

---

## 9. Pantalla D — Búsqueda asistida (mostrador / POS)

Este es el endpoint que resuelve el caso de uso central del encargo (§1.4): el operador teclea
algo en la caja/mostrador, y además de los resultados de siempre, aparece — **en una sección
aparte, nunca mezclada** — una lista de equivalentes por composición.

Ubicación sugerida: dondequiera que hoy el operador busque artículos para agregar a una venta
(POS, pantalla de despacho, etc.) — como reemplazo o complemento del buscador textual actual,
**solo dentro del vertical Farmacia**. Si hoy ya existe un componente de búsqueda de artículos
reutilizable en varias pantallas, este endpoint puede alimentarlo en vez de `GET /catalog/items`
directamente, cuando el contexto sea "Farmacia" — evaluá el costo/beneficio según cómo esté
armado ese componente hoy; si es muy invasivo cambiarlo, alcanza con agregar esta sección de
equivalentes como un panel adicional al costado de los resultados de siempre.

### 9.1 `GET /farmacia/busqueda-asistida`

Query params:

| Param | Tipo | Obligatorio | Default | Descripción |
|---|---|---|---|---|
| `q` | string | **Sí** | — | El texto que tecleó el operador — mismo criterio de búsqueda que ya usa `GET /catalog/items?search=`. |
| `limit` | 1–50 | No | `10` | Aplica tanto al tamaño de `coincidencias` como al de `equivalentes`. |
| `branch` | string | No | — | Igual que en §8.1. |
| `soloConStock` | boolean | No | — | Igual que en §8.1, aplica solo a `equivalentes`. |

No expone `nivelMinimo`/`coincidenciaMinima`/`orden` — este endpoint usa internamente los mismos
defaults del motor (nivel ≤ 2, coincidencia mínima 60, orden por relevancia). Si en algún momento
hace falta exponerlos acá también, es un cambio de backend a pedir explícitamente — no está en
el contrato de hoy.

### 9.2 La respuesta — la estructura que separa las dos secciones

```jsonc
{
  "success": true,
  "data": {
    "coincidencias": {
      "success": true,
      "data": [ /* mismísimo ItemResponseDto que ya devuelve GET /catalog/items — reutilizá el mismo componente de fila/tarjeta que ya tenés para el listado de catálogo */ ],
      "meta": { "total": 3, "limit": 20, "offset": 0, "hasMore": false }
    },
    "equivalentes": [ /* mismo shape de cada elemento que en §8.2 (EquivalenteResponseDto[]) */ ],
    "ancla": "MED-PANADOL-500",
    "aviso": "Sugerencias basadas en la composición declarada en el catálogo. Verificación profesional obligatoria antes de sustituir."
  }
}
```

Reglas de layout **obligatorias** (repitiendo la regla 4 de la §2 con el detalle exacto de este
endpoint):

- `coincidencias` se pinta **exactamente igual** que el resultado normal de una búsqueda de
  catálogo — mismo componente, mismo orden que trae el array, sin tocarlo.
- `equivalentes` va **en un bloque visualmente distinto** (ej. un panel lateral, una sección
  colapsable "Otras opciones con la misma composición", o una segunda columna) — nunca dentro de
  la misma lista que `coincidencias`, nunca intercalado.
- `equivalentes` **nunca repite** un artículo que ya esté en `coincidencias` (el backend ya lo
  garantiza filtrándolo — no hace falta que el frontend vuelva a deduplicar, pero tampoco rompe
  nada si lo hacés por las dudas).
- El `aviso` se muestra **siempre**, en alguna parte visible de esta pantalla — sugerido: un
  texto chico debajo del panel de equivalentes, o un tooltip en el título de esa sección
  ("Sugerencias ⓘ").

### 9.3 Casos especiales de esta pantalla

- Si `data.ancla` es `null`: la búsqueda textual no encontró nada — `equivalentes` viene vacío
  también (no hay ancla de la cual partir). Mostrá el estado vacío normal de "sin resultados" y no
  muestres el panel de equivalentes en absoluto (ni un estado vacío para él — directamente
  omitilo).
- Si `data.coincidencias.data` tiene resultados pero `data.equivalentes` viene vacío: es
  completamente normal (el primer resultado puede no tener composición declarada, o no tener
  ningún equivalente que supere el puntaje mínimo). No lo trates como error — mostrá el panel de
  equivalentes con un estado vacío discreto (ej. "No hay otras opciones con la misma composición
  para este artículo") o directamente ocultá la sección entera si preferís una UI más limpia.

---

## 10. Componente compartido: tarjeta/fila de "Equivalente"

Construí **un solo componente** (`EquivalenteCard`, o el nombre que uses) para pintar cada
elemento de `data[]` en §8.2 y de `equivalentes[]` en §9.2 — es exactamente el mismo shape en
los dos lugares, no dupliques la lógica de render.

### 10.1 Contenido mínimo de la tarjeta

1. Imagen/miniatura del artículo (`item.image`, con placeholder si falta).
2. Nombre (`item.itemName`) y marca (`item.brand`, si viene) — clic navega a la ficha completa
   (`item.id`).
3. **Coincidencia**, grande y clara: `"${coincidencia}%"` junto al badge de banda.
4. Precio (`precio`, si viene) y, si `diferenciaPrecioPct` viene, un indicador chico de ahorro/
   sobreprecio.
5. Estado de stock: `stock > 0` → "En existencia" (o la cantidad); `stock === 0` → "Agotado";
   `stock === null` → sin indicador de stock (o "—").
6. El texto de `motivo`, como subtítulo/descripción corta debajo del nombre.
7. Botón/acción para agregar el artículo al carrito/pedido/lo que corresponda en ese contexto —
   **esta acción es siempre una elección explícita del usuario** (ver regla 1 de la §2: nunca
   preseleccionado, nunca disparado automáticamente).

### 10.2 Mapeo sugerido de banda → texto y color

No hay un color oficial impuesto por el backend — esto es una sugerencia de UX razonable, ajustá
a la paleta de tu design system, pero **mantené la idea de "semáforo de confianza descendente"**:

| `banda` | Texto sugerido | Tono sugerido |
|---|---|---|
| `intercambiable` | "Misma composición" | Verde fuerte |
| `equivalente` | "Mismo principio activo" | Verde/azul |
| `similar` | "Composición parecida" | Amarillo/naranja |
| `relacionado` | "Comparte principios" | Gris/neutro (y solo aparece si se bajó `coincidenciaMinima` explícitamente, ver §8.1) |

### 10.3 Si decidís mostrar el detalle expandible (`detalleCoincidencia`)

Es opcional pero recomendado para el usuario avanzado (farmacéutico) que quiere entender **por
qué** el sistema sugirió algo. Sugerido como un acordeón/tooltip "Ver detalle":

- **Principios compartidos** (`compartidos`): lista de nombres.
- Si `soloEnCandidato` no está vacío: alerta suave "Este producto tiene además: X, Y" (son los
  principios que el artículo original NO tiene — es la situación de `tienePrincipiosAdicionales:
  true`, la más delicada clínicamente, ver §1.6).
- Si `topeAplicado` no es `null`: es informativo para power-users, ej. mostrar un pequeño ícono
  con tooltip "Puntaje limitado por datos incompletos" (`DATOS_INCOMPLETOS`) o "Puntaje limitado
  porque este producto tiene principios adicionales" (`PRINCIPIOS_ADICIONALES`) — no es
  obligatorio mostrarlo, pero si lo hacés, no inventes otro texto: son exactamente esos dos
  valores posibles.
- `principios`/`dosis`/`forma` (cada uno 0–100 o `null`): podés graficarlos como 3 barritas de
  progreso chicas dentro del acordeón, con "—" donde venga `null`.

---

## 11. Manejo de errores

Todos los endpoints de esta feature devuelven errores con el mismo formato que ya usa el resto
del sistema (interceptor global de excepciones) — no hay nada nuevo que aprender en el shape del
error en sí, pero estos son los casos específicos que hay que contemplar:

| Código | Cuándo | Qué mostrar |
|---|---|---|
| **403** `VERTICAL_NO_HABILITADO` | Se llamó a cualquiera de estos endpoints desde un tenant que no es Farmacia | No debería pasar nunca si el gating de §3 está bien hecho — si aparece, es un bug del frontend (llamada disparada sin chequear vertical), tratalo como un error genérico, no hace falta un mensaje especial para el usuario final |
| **403** (permiso) | El usuario no tiene la acción correspondiente (§3.2) | Igual que arriba — no debería llegar a pasar si se ocultó bien el botón/pantalla |
| **404** | `:id` de un principio activo o artículo que no existe | Mensaje estándar "no encontrado", volver al listado |
| **409** | Al crear/renombrar un principio activo duplicado (§5.2/§5.6) | **Manejo especial obligatorio** — mostrar el `candidato` que ya existe, no un error genérico |
| **400** | Validaciones de composición (§6.4): fila repetida, más de un `isPrimary`, concentración incompleta, principio inexistente/deshabilitado | Mostrar el `message` del backend tal cual — son mensajes ya redactados para el usuario final, no los reescribas |

---

## 12. Casos vacíos y de borde — qué mostrar en cada uno

| Situación | Cómo se ve en la respuesta | Qué mostrar en la UI |
|---|---|---|
| Artículo consultado en `/equivalentes` no es medicamento | `data: []`, `motivo: "NO_ES_MEDICAMENTO"` a nivel raíz | Ocultar la sección de equivalentes por completo (ya sabés esto de antemano por `esMedicamento` en la ficha, §6.1 — evitá incluso hacer la llamada) |
| Artículo es medicamento pero sin principios cargados todavía | `data: []`, `motivo: "SIN_COMPOSICION_DECLARADA"` | Mostrar un estado vacío invitando a completar la composición: "Este artículo no tiene principios activos declarados — completá la composición para ver sugerencias." con link directo a la pestaña de composición (si el usuario tiene el permiso de editar) |
| Hay composición, pero ningún otro artículo del catálogo la comparte | `data: []`, sin `motivo` (ausente) | Estado vacío neutro: "No se encontraron artículos con composición similar en el catálogo." — esto NO es un error ni una alerta, es información normal |
| Catálogo de principios activos vacío (tenant recién habilitado) | Listado de §5.3 con `data: []` | Estado vacío de "todavía no cargaste ningún principio activo", con el botón de "Nuevo" bien visible si el usuario tiene permiso |
| Un principio activo se deshabilitó pero sigue usado por artículos | Sigue apareciendo en `activeIngredientNombre` de esos artículos (§6.3) | No hace falta tratamiento especial — se sigue mostrando normalmente; si querés ser prolijo, un badge chico "(deshabilitado)" junto al nombre en la grilla de composición no está de más, pero no es obligatorio |

---

## 13. Checklist de implementación

- [ ] Gating de vertical: nada de esta feature es visible si `GET /me` no devuelve
      `vertical: "farmacia"` (§3.1).
- [ ] Gating de permisos: cada botón/pantalla puntual respeta la tabla de acciones de §3.2.
- [ ] Pantalla A (Catálogo de Principios Activos): listado + alta + edición (con renombrado) +
      deshabilitar + fusionar, con el manejo especial del 409 de duplicados (§5).
- [ ] Pestaña "Composición" en la ficha de artículo: interruptor maestro, campos condicionales,
      grilla de principios con las reglas de pareja/unicidad/único-principal, guardado como
      reemplazo total (§6).
- [ ] Filtros nuevos en el listado de catálogo, condicionados al vertical (§7).
- [ ] Sección "Equivalentes sugeridos" en la ficha de artículo, con el componente compartido de
      tarjeta (§8, §10).
- [ ] Pantalla/panel de Búsqueda asistida en el mostrador/POS, con las dos secciones
      (`coincidencias`/`equivalentes`) SIEMPRE separadas y el `aviso` SIEMPRE visible (§9).
- [ ] El texto `aviso` se muestra tal cual viene del backend, en cualquier pantalla que use el
      motor — nunca hardcodeado, nunca omitido (§2, regla 2).
- [ ] Nunca se usa la palabra "bioequivalente" en ningún string de la UI (§2, regla 3).
- [ ] Ningún flujo sustituye automáticamente un artículo por su equivalente — siempre es una
      acción explícita del usuario (§2, regla 1).
- [ ] El orden de `data`/`equivalentes` que devuelve el backend nunca se reordena en el cliente
      (§8.3).
- [ ] Manejo de errores 409 (duplicado) y 400 (validación de composición) con los mensajes
      específicos de §11, no como errores genéricos.
- [ ] Los 4 estados vacíos de §12 están todos contemplados (no solo el "sin resultados"
      genérico).
- [ ] Verificado contra el `openapi.json` actualizado del proyecto — todos los nombres de campo,
      enums y rutas de este documento coinciden con lo que ahí figura. Si algo no coincide,
      **el `openapi.json` manda** y hay que avisar para corregir este documento.
