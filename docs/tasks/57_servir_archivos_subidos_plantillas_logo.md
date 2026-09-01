# Prompt para agente de backend — Falta la ruta que sirve los archivos subidos (`/files/*`)

> Este documento es un prompt autocontenido para un agente de IA de backend. Describe un bug
> confirmado en producción: `POST /plantillas/logo` guarda el archivo y responde con éxito, pero
> **no existe ningún endpoint que lo sirva de vuelta** — el logo nunca puede mostrarse ni
> imprimirse porque la URL que el propio backend devuelve da 404.

---

## 0. Contexto

El editor de plantillas de impresión (facturas POS/etiquetas, ver
`docs/tasks/55_plantillas_impresion_editor_pos_y_etiquetas.md`) permite subir un logo para
usarlo en el ticket. El flujo es:

1. Frontend sube el archivo → `POST /plantillas/logo` (multipart).
2. Backend responde `{ success: true, data: { fileUrl, fileName } }` — confirmado en producción,
   ejemplo real: `{"fileUrl":"/files/test_logo-termicod1d533.png","fileName":"test_logo-termicod1d533.png"}`.
3. Frontend guarda ese `fileUrl` en el elemento `logo` de la plantilla y lo usa como `src` de un
   `<img>` para mostrarlo/imprimirlo.

**El paso 3 falla siempre, con cualquier archivo, incluso uno recién subido.** El frontend ya
resuelve correctamente `fileUrl` (que viene como ruta relativa) contra el origen real del
backend — eso no es el problema, ya se corrigió del lado frontend. El problema es que **esa
ruta no existe en el backend en absoluto**:

```bash
$ curl -i http://<host-backend>/files/test_logo-termicod1d533.png
HTTP/1.1 404 Not Found
content-type: application/json; charset=utf-8

{"success":false,"error":{"code":"NOT_FOUND","message":"Cannot GET /files/test_logo-termicod1d533.png","statusCode":404}}
```

Ese `"Cannot GET ..."` es el 404 genérico de framework (Fastify) para una ruta que nunca se
registró — no es un 404 "de negocio" (archivo no encontrado), es que **no hay ningún handler
para `GET /files/*`** montado en la app en absoluto. Se probó también con el prefijo
`/api/v1/files/...` por si el `fileUrl` debía llevarlo — mismo resultado, tampoco existe ahí.

## 1. Qué se necesita

Registrar una ruta que sirva los archivos ya guardados por `POST /plantillas/logo`, en la
**misma ruta que el propio backend ya devuelve** en `fileUrl` (para no tener que cambiar nada
del lado frontend) — es decir, `GET /files/:fileName` debe responder con el archivo real
(`Content-Type` de imagen correspondiente, ej. `image/png`), no un 404.

Puntos a confirmar/implementar:

- **Dónde vive físicamente el archivo hoy.** `POST /plantillas/logo` ya lo guarda en algún
  lugar (disco local, bucket, etc.) — la ruta nueva debe leer de ahí. Si ya existe una utilidad
  de "servir archivo estático" en el proyecto para otro propósito (ej. adjuntos, comprobantes),
  reusarla en vez de crear una nueva.
- **Nombre de archivo seguro.** `fileName` ya viene con un sufijo aleatorio agregado por el
  propio backend al guardar (ej. `test_logo-termicod1d533.png`) — al servir, sanitizar/validar
  el parámetro de ruta igual (nada de path traversal tipo `../../`).
- **Cache headers razonables** (`Cache-Control: public, max-age=...`) ya que estos archivos no
  cambian una vez subidos — no es obligatorio para que funcione, pero es una mejora barata dado
  que se sirve la misma imagen en cada vista previa/impresión.
- Confirmar si el endpoint debe requerir auth (`Authorization`/`X-Tenant`) o ser público. Dado
  que un `<img src>` de HTML no puede mandar headers custom, **debe poder cargarse sin
  `Authorization`** (igual que `GET /qz/certificado`, ver `docs/tasks/56_...md` §B.2) — si el
  archivo necesita quedar protegido por tenant, la protección tiene que venir de que el nombre
  de archivo generado sea impredecible (ya lo es, trae un sufijo aleatorio), no de un header que
  un tag `<img>` no puede enviar.

## 2. Cómo probarlo

1. `POST /plantillas/logo` con un archivo de prueba, tomar el `fileUrl` de la respuesta.
2. `GET` esa misma URL (sin ningún header especial, como haría un `<img src>` del navegador) →
   debe responder `200` con el archivo (`content-type` de imagen, no `application/json`).
3. Confirmar que un archivo que nunca existió (nombre inventado) sigue devolviendo `404` limpio
   (no debe listar el directorio ni devolver un 500).

## 3. Fuera de alcance

- No hace falta ningún cambio en `POST /plantillas/logo` en sí — ya funciona y ya devuelve el
  `fileUrl` correcto, solo falta la ruta `GET` que lo sirva.
- El frontend ya resuelve la URL relativa contra el origen correcto — no requiere ningún ajuste
  adicional una vez que este endpoint exista.
