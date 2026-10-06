# Prompt para agente de frontend — Auditoría de Transacciones

> **Leé este bloque completo antes de escribir una sola línea de código.** Es largo a propósito:
> el objetivo es que no tengas que inferir, adivinar ni "completar con sentido común" ningún
> detalle de este módulo. Si en algún momento te encontrás pensando "me imagino que esto funciona
> así", pará y buscá la respuesta exacta en este documento o en el `openapi.json` del proyecto —
> casi siempre ya está contestado acá. El `openapi.json` tiene la forma EXACTA (tipos, nombres de
> campo, enums) de cada request/response citado acá — si algo en este documento y el
> `openapi.json` no coinciden, **gana el `openapi.json`** (puede haber cambiado después de
> escribir esto), pero el comportamiento/reglas de negocio descritas acá siguen siendo la fuente
> de verdad.

## 0. Qué es esto, en una frase

Una pantalla nueva, de **solo lectura**, donde un administrador del tenant puede ver **todas las
transacciones de negocio hechas dentro de ese tenant**: quién la hizo, cuándo, qué tipo de
transacción fue (factura creada, orden sometida, cobro anulado...), y un link que abre el
documento real en su pantalla correspondiente (si es una factura, abre la factura; si es una
orden de compra, abre la orden de compra). No hay creación, edición ni eliminación de nada en
este módulo — es un visor.

## 1. Prerrequisitos — no construyas nada de esto desde cero acá

Este módulo se apoya en **dos mecanismos que tu frontend ya debería tener implementados** (si no
los tenés, implementalos primero consultando los prompts que les corresponden, no los reinventes
acá):

1. **Features de tenant** — este módulo completo está detrás del feature
   `auditoria_transacciones` (`type: 'modulo'`), exactamente igual que `compras` o `gastos` hoy.
   Si tu frontend ya tiene el patrón de "ocultar/mostrar una sección del menú según
   `GET /me/features` (o como se llame tu endpoint real de features resuelto)", usá el mismo acá
   — no inventes un mecanismo paralelo. Si el tenant no tiene el feature contratado, **la pantalla
   no debe aparecer en el menú** y cualquier intento directo de navegar a la ruta debe mostrar el
   mismo estado de "no disponible" que ya usás para Compras/Gastos quand no están contratados.

2. **Permisos v2** (pantallas, componentes, filtros) — ver `docs/frontend/
   PROMPT_PERMISOS_V2_Y_DASHBOARD_MODULAR_FRONTEND.md` si todavía no lo implementaste. Esta
   pantalla entra al mismo catálogo Módulo → Pantalla → Componente que gobierna el resto del
   sistema. Específicamente:
   - Pantalla: `administracion.auditoria` (acción `administracion.auditoria.listar`).
   - Un componente de **filtro**, auto-derivado, `administracion.auditoria.filtro.usuario` —
     protege específicamente el query param `usuario` del listado (ver §3). Este filtro es
     **sensible** (quién hizo qué transacción es más delicado que el resto del listado) y por
     diseño **NO viene incluido gratis cuando se otorga "pantalla completa"** a un perfil — un
     admin del tenant tiene que otorgarlo explícitamente, aparte, si quiere que alguien pueda
     filtrar por usuario. Tu UI de administración de permisos (si ya la construiste) debe mostrar
     este componente como una fila separada, no agrupada dentro de "todo lo de Auditoría".
   - Si tu frontend ya resuelve el catálogo de permisos dinámicamente (`GET /acceso/catalogo` o
     como se llame), **no hace falta hardcodear nada de esto** — va a aparecer solo. Esta sección
     es para que entiendas qué vas a ver aparecer, no para que lo codees a mano.

Nada de esto es nuevo en su mecánica — es el mismo patrón que ya aplica a Compras, Gastos,
Inventario, etc. Si tenés dudas de cómo se ve "un módulo gateado por feature + permisos v2" en tu
código actual, mirá cómo implementaste Compras o Gastos y replicá esa misma estructura acá.

## 2. Qué NO hay que construir

- **Nada de crear, editar, enmendar ni cancelar.** Es 100% lectura.
- **Nada de exportar a Excel/PDF** — no está en el alcance de esta versión. No agregues un botón
  de exportar "porque las otras pantallas lo tienen".
- **Nada de gráficos, agregaciones ni dashboards** — es una tabla con filtros, nada más.
- **No muestra montos.** Ninguna fila de esta pantalla tiene ni va a tener un campo de dinero —
  es metadata operativa (quién, cuándo, qué pasó, dónde verlo), nunca una cifra. Si en algún
  momento pensás "esto necesitaría mostrar el monto de la factura", la respuesta es: no — si el
  usuario quiere ver el monto, hace click en el link y lo ve en el documento real.

## 3. Endpoint: listado — `GET /api/v1/auditoria/transacciones`

Consultá el `openapi.json` (path `/auditoria/transacciones`, método `GET`) para el shape exacto
de query params y response — lo que sigue es la semántica de cada uno, no una promesa de nombres
exactos de campo (que sí están en el spec).

**Query params** (todos opcionales, salvo paginación):
- `limit` / `offset` — paginación estándar del proyecto (igual que cualquier otro listado). Máximo
  100 filas por página — si pedís más, el backend lo recorta a 100, no es un error.
- `search` — búsqueda libre de texto: busca coincidencias parciales sobre el resumen de la
  transacción Y sobre el nombre/código del documento (`docname`). Usalo para la caja de búsqueda
  genérica de la pantalla, no inventes un campo de búsqueda separado.
- `desde` / `hasta` — rango de fecha/hora (ISO), filtra por cuándo ocurrió la transacción
  (`createdAt`), inclusive en ambos extremos.
- `usuario` — email EXACTO del usuario que hizo la transacción (no es búsqueda parcial). Este es
  el query param protegido por el componente de filtro sensible mencionado en §1 — si el usuario
  actual no tiene ese permiso otorgado y tu UI intenta mandar este param igual, el backend
  responde 403 específico para ese filtro (no tumba el resto del listado). **No muestres el
  selector/input de "filtrar por usuario" si el catálogo de permisos resuelto para el usuario
  actual no incluye ese componente** — mismo patrón que ya usás para ocultar cualquier otro filtro
  no otorgado en otras pantallas.
- `accion` — filtra por la acción exacta (ver tabla de posibles valores en §5 — son los mismos
  strings de `@RequierePermiso` que ya conocés del catálogo de permisos, ej. `"gastos.someter"`,
  `"ventas.factura.anular"`). Si querés un selector desplegable para este filtro, poblalo con los
  valores reales que te devuelva el propio listado (no hardcodees la lista completa — puede
  crecer) o con el catálogo de acciones si ya lo tenés disponible en el frontend.
- `doctype` — filtra por el doctype de ERPNext exacto (ej. `"Sales Invoice"`, `"Purchase
  Invoice"`). Igual criterio que `accion` para un selector, si lo necesitás.

**Response** — cada fila trae (nombres exactos en `openapi.json`):
- `id` — id de la fila de auditoría (para pedir el detalle, ver §4).
- `accion` — el string crudo (ej. `"gastos.someter"`). **No lo muestres crudo al usuario.**
- `label` — el texto YA RESUELTO en español para mostrar (ej. "Someter"), resuelto del lado del
  servidor contra el catálogo de permisos. Usá este campo para la UI, no `accion`.
- `actorEmail` — email de quien hizo la transacción.
- `doctype` / `docname` — el doctype de ERPNext y el identificador del documento real (ej.
  `"Sales Invoice"` / `"FAC-0001"`). Útiles para agrupar/relacionar visualmente varias filas del
  mismo documento (ver §6), pero NO los uses para construir vos mismo un link — para eso está
  `link` (ver abajo).
- `resumen` — texto corto en español, ya armado del lado del servidor (ej. "Factura FAC-0001
  sometida a Cliente ACME"). Puede venir `null` en algunos casos — si es `null`, mostrá solo
  `label` + `doctype`/`docname`, no rompas el layout.
- `link` — **URL absoluta completa**, ya resuelta del lado del servidor (incluye el dominio del
  frontend) — ver §6 para cómo tratarla.
- `createdAt` — fecha/hora ISO de cuándo ocurrió.

No hay campo de monto en ninguna fila — no esperes uno ni lo agregues a la tabla.

## 4. Endpoint: detalle — `GET /api/v1/auditoria/transacciones/:id`

Mismos campos que una fila del listado, más:
- `metadata` — objeto libre con ids relacionados (ej. `{ customerId: "...", branch: "..." }`) —
  puede venir vacío o con claves que varían según el tipo de transacción. Mostralo como una lista
  simple de pares clave/valor si querés un panel de detalle, pero no le des un layout rígido
  pensado para un shape fijo — varía.
- `versiones` — **puede venir `null`**. Es un intento best-effort de traer el historial fino de
  cambios de campo desde ERPNext (el mecanismo nativo `Version` de Frappe) — el backend lo
  consulta en vivo contra ERPNext al pedir el detalle, y **puede fallar silenciosamente** (permiso
  insuficiente del usuario sobre ese doctype en ERPNext, timeout, lo que sea). Si `versiones` es
  `null`, significa "no se pudo traer el detalle fino" — mostrá un estado tipo "Detalle fino no
  disponible", **nunca** un error ni un estado de carga infinito. Si no es `null`, es un array
  (shape en `openapi.json`) con el diff crudo de ERPNext — mostralo como texto/JSON secundario,
  no es algo para diseñar una UI elaborada todavía (es información de depuración/auditoría fina,
  no el contenido principal de la pantalla).

No hay un endpoint separado de "exportar detalle" ni "imprimir" — si el usuario quiere el
documento real, usa `link`.

## 5. Valores posibles de `accion` / `doctype` (para armar selectores de filtro, opcional)

No hace falta que los hardcodees — es información de contexto para que entiendas el universo de
datos que vas a ver, no una lista cerrada que deba aparecer en un `<select>` fijo (puede crecer
sin aviso a este documento). Ejemplos reales que vas a ver en `accion`: `ventas.factura.crear`,
`ventas.factura.someter`, `ventas.factura.anular`, `ventas.factura.enmendar`,
`compras.factura.crear/.someter/.anular/.enmendar`, `gastos.crear/.someter/.anular/.enmendar`,
`pedidos.crear/.someter/.anular/.enmendar/.facturar`, `despachos.crear/.someter/.cancelar`,
`ventas.devolucion.crear/.anular`, `compras.factura.devolver`,
`ventas.nota-credito.crear/.someter`, `ventas.nota-debito.crear/.someter`,
`cobros.pago.crear/.someter/.anular`, `caja.cobrar`, `tesoreria.emision.*`,
`tesoreria.deposito.*`, `tesoreria.transferencia.*`, `tesoreria.cheques.anular`,
`inventario.convertir-dimension`, `inventario.ajustar`,
`relaciones.transaccion.aceptar-compra/.rechazar`. Y en `doctype`: `Sales Invoice`, `Purchase
Invoice`, `Sales Order`, `Delivery Note`, `Payment Entry`, `Journal Entry`, `Stock Entry`,
`Relacion Comercial Transaccion`, entre otros.

## 6. El campo `link` — cómo tratarlo, y por qué NO es tan simple como un href cualquiera

`link` es una **URL absoluta completa** (ej.
`https://tu-dominio.com/facturas/FAC-0001`), construida del lado del servidor — **ya resuelta**,
no un path relativo que tengas que completar ni un doctype que tengas que mapear vos. Dos formas
válidas de usarla, elegí la que mejor calce con tu router:

- **Simple**: `<a href={row.link}>` / `window.location.href = row.link` — funciona siempre,
  provoca una recarga completa de página.
- **Mejor (si tu app es SPA con router propio)**: extraé el `pathname` de esa URL
  (`new URL(row.link).pathname`) y navegá con tu router interno (`navigate(pathname)`) para evitar
  el full reload — **solo si** el dominio de `row.link` coincide con el de tu propio frontend
  (debería coincidir siempre en producción normal; si por algún motivo no coincide, usá el
  `href` completo como fallback, nunca ignores la discrepancia en silencio).

**Casos especiales que tenés que manejar sin romper nada:**
- **Nota de Débito**: hoy no existe pantalla de detalle para este tipo de documento en el
  frontend — el `link` que te manda el backend para estas filas apunta a la **lista** de notas de
  débito (`/notas-debito`), sin ningún id al final. Es intencional, no un bug — el link sigue
  siendo válido y clickeable, simplemente no aterriza en un documento puntual.
- **Conversión/Ajuste de dimensión de inventario**: mismo caso — no hay pantalla de detalle
  (`Stock Entry` de conversión/ajuste), el `link` apunta al **formulario de creación**
  (`/inventario/conversion-dimension` o `/inventario/ajustes-dimension`), sin id.
- En ambos casos de arriba: **no intentes "arreglarlo"** agregando un id a mano ni asumiendo que
  `docname` se puede concatenar — simplemente navegá a la URL tal cual viene. Si en el futuro se
  agrega una pantalla de detalle para estos casos, el backend va a empezar a mandar un `link` con
  id sin que tengas que cambiar nada de tu lado (seguís usando el campo tal cual).

No necesitás (ni debés) mantener vos mismo un mapa "doctype → ruta" — toda esa lógica ya vive del
lado del servidor. Tu única responsabilidad acá es: mostrar `link` como un link clickeable que
funciona.

## 7. "Relacionar" transacciones del mismo documento

El pedido original de producto incluye poder "ver todo el historial de un documento puntual" (ej.
ver que la Factura FAC-0001 fue creada, luego sometida, luego cancelada). Esto NO es un endpoint
separado — se resuelve con el mismo listado de §3, filtrando por `doctype` + buscando/filtrando
por el mismo `docname` (vía el campo `search`, que matchea sobre `docname`). Si querés una UX más
directa para esto, un botón "Ver historial de este documento" en cualquier fila podría disparar
una navegación al mismo listado con `search=<docname>` precargado — es una decisión de UX tuya, no
hay contrato especial de backend para "ver relacionados" más allá de filtrar el mismo listado.

## 8. Checklist de implementación

- [ ] Ítem de menú nuevo "Auditoría de Transacciones", oculto si el tenant no tiene el feature
      `auditoria_transacciones` contratado.
- [ ] Pantalla oculta/bloqueada si el usuario no tiene la pantalla `administracion.auditoria`
      otorgada (igual criterio que cualquier otra pantalla gateada por Permisos v2).
- [ ] Tabla paginada: columnas sugeridas `label` (texto grande/principal), `resumen` (secundario,
      puede faltar), `actorEmail`, `createdAt`, y la fila entera o un ícono clickeable que navegue
      a `link`.
- [ ] Filtros: fecha desde/hasta, búsqueda libre, selector de acción (opcional), selector de
      doctype (opcional), y el filtro de usuario — **oculto si el componente
      `administracion.auditoria.filtro.usuario` no está otorgado al usuario actual**.
- [ ] Vista de detalle (modal o pantalla aparte) al hacer click en una fila para ver `metadata` y
      `versiones` (con el estado "no disponible" cuando `versiones` es `null`).
- [ ] Ningún botón de crear/editar/eliminar/exportar en esta pantalla.
- [ ] Verificar contra `openapi.json` los nombres EXACTOS de cada campo antes de tipar tus DTOs de
      frontend — este documento describe la semántica, el spec tiene la verdad sintáctica.
