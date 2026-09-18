# Prompt para el agente de frontend — Relaciones Comerciales, Fase 02: permisos y notificaciones

> Backend: fase completada el 2026-09-17 · plan: docs/plans/relaciones_comerciales/FASE_02_PERMISOS_Y_NOTIFICACIONES.md

## 1. Contexto

Esta fase no agrega pantallas — deja listo el catálogo de permisos y de notificaciones que las
pantallas de las fases siguientes van a consultar. Sí hay dos cosas que el frontend puede empezar
a preparar ya: la matriz de qué botón depende de qué acción, y la lista de tipos de notificación
para la pantalla de configuración de destinatarios (que ya existe — es la misma de siempre, solo
con 10 filas nuevas).

## 2. Acciones `relaciones.*` (consultar con `GET /me/permissions`)

Cada clave de abajo aparece en la respuesta de `GET /me/permissions` como `true`/`false`. Úsala
para mostrar/ocultar/deshabilitar el control indicado — **nunca inventes la lógica de negocio en
el frontend a partir del nombre de la acción**, el backend es quien decide si el botón "podría"
funcionar.

| Acción | Pantalla | Qué habilita |
|---|---|---|
| `relaciones.directorio.buscar` | Nueva relación comercial | Campo de búsqueda por RNC |
| `relaciones.listar` | Relaciones comerciales | Ver la lista (tab Socios) |
| `relaciones.ver` | Detalle de relación | Abrir el detalle |
| `relaciones.configurar` | Detalle de relación | Botón "Guardar configuración" |
| `relaciones.terminar` | Detalle de relación | Botón "Terminar relación" |
| `relaciones.invitacion.crear` | Nueva relación comercial | Botón "Enviar invitación" |
| `relaciones.invitacion.cancelar` | Relaciones comerciales | Botón "Cancelar invitación enviada" |
| `relaciones.invitacion.listar` | Invitaciones | Ver la lista (tab Invitaciones) |
| `relaciones.invitacion.responder` | Invitaciones | Botones "Aceptar"/"Rechazar" |
| `relaciones.bloqueo.listar` | Empresas bloqueadas | Ver la lista (tab Bloqueadas) |
| `relaciones.bloqueo.crear` | Invitaciones | Botón "Bloquear empresa" |
| `relaciones.bloqueo.levantar` | Empresas bloqueadas | Botón "Desbloquear" |
| `relaciones.transacciones.listar` | Bandeja B2B | Ver la bandeja |
| `relaciones.transacciones.ver` | Detalle de transacción | Abrir el detalle |
| `relaciones.venta.enviar` | Detalle de factura | Botón "Enviar al cliente socio" |
| `relaciones.compra.enviar-a-proveedor` | Detalle de compra (borrador) | Botón "Enviar a proveedor" |
| `relaciones.transaccion.aceptar-compra` | Bandeja B2B | Botón "Aceptar" (lado compra) |
| `relaciones.transaccion.aceptar-venta` | Bandeja B2B | Botón "Aceptar" (lado venta) |
| `relaciones.transaccion.rechazar` | Bandeja B2B | Botón "Rechazar" |
| `relaciones.transaccion.reenviar` | Bandeja B2B | Botón "Reenviar" |
| `relaciones.compra.igualar` | Detalle de compra (borrador) | Botón "Igualar factura al proveedor" |
| `relaciones.venta.igualar` | Detalle de factura | Botón "Igualar factura al cliente" — si falta, explicar que el ciclo Cancelar→Enmendar no está habilitado para este usuario, no solo ocultar el botón |
| `relaciones.mapeo.guardar` | Mapeo de artículos | Botón "Guardar mapeo" |
| `relaciones.mapeo.crear-articulo` | Mapeo de artículos | Botón "Crear artículo desde el socio" |
| `relaciones.mapeo.sincronizar-barcodes` | Mapeo de artículos | Checkbox "Sincronizar códigos de barra" |
| `relaciones.transaccion.enlazar-compra` | Bandeja B2B | Botón "Enlazar mi compra existente" |
| `relaciones.transaccion.enlazar-venta` | Bandeja B2B | Botón "Enlazar mi factura existente" |
| `relaciones.transaccion.buscar-candidatos` | Bandeja B2B | Buscador de documentos para enlazar |
| `relaciones.compra.enlazar-y-enviar` | Detalle de compra (sometida) | Botón "Enviar al proveedor" (desde un documento ya sometido) |

Nota de UX ya decidida en el backend: **no existe un botón de "aceptar automáticamente" para
documentos entrantes** — aceptar siempre es una acción explícita de una persona, con el mapeo de
artículos confirmado antes. Lo único configurable de antemano es "auto-enviar" del lado propio
(mis ventas/compras se envían solas al socio), que vive en la configuración de la relación, no en
la bandeja.

## 3. Notificaciones — 10 tipos nuevos

Aparecen en `GET /api/v1/notificaciones/tipos` bajo la categoría **"Relaciones Comerciales"**,
en la misma pantalla de configuración de destinatarios que ya existe (nada nuevo que construir
ahí, solo van a aparecer filas nuevas):

| Código | Nombre visible |
|---|---|
| `relaciones_invitacion_recibida` | Invitación de relación comercial recibida |
| `relaciones_invitacion_aceptada` | Invitación de relación comercial aceptada |
| `relaciones_invitacion_rechazada` | Invitación de relación comercial rechazada |
| `relaciones_compra_entrante` | Compra entrante de un socio |
| `relaciones_venta_entrante` | Venta entrante de un socio |
| `relaciones_transaccion_aceptada` | Transacción B2B aceptada |
| `relaciones_transaccion_editada` | Transacción B2B aceptada con cambios |
| `relaciones_transaccion_rechazada` | Transacción B2B rechazada |
| `relaciones_transaccion_enlazada` | Transacción B2B enlazada |
| `relaciones_transaccion_error` | Transacción B2B con error de entrega |

Todos nacen `activo=0` (opt-in): un tenant nuevo no recibe nada de este módulo hasta que un admin
los active desde esa misma pantalla. Excepción documentada en el backend:
`relaciones_invitacion_recibida` le llega igual al contacto del tenant aunque nadie haya
configurado destinatarios (si no, una invitación podría morir en silencio).

## 4. Checklist de aceptación para el frontend

No hay nada que construir todavía — esta fase es de catálogo. Cuando lleguen los endpoints
(Fase 03 en adelante), usar la tabla de §2 tal cual para las reglas de habilitación de cada botón.
