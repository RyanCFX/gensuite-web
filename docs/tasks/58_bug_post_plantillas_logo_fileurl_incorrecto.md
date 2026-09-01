# Prompt para agente de backend — `POST /plantillas/logo` devuelve `fileUrl` incorrecto / el archivo subido no se puede recuperar

> Este documento es un prompt autocontenido para un agente de IA de backend. Reporta un bug
> confirmado en producción, encontrado al verificar el fix de `GET /files/:fileName`
> (ver `docs/tasks/57_servir_archivos_subidos_plantillas_logo.md`, ya implementado).

---

## 0. Contexto

`GET /files/:fileName` ya está desplegado y funciona correctamente en el caso "no existe":
responde `404` con JSON limpio (`{"success":false,"error":{"code":"NOT_FOUND","message":"Archivo
no encontrado","statusCode":404}}`) en vez del 404 genérico de Fastify de antes. Ese fix está
bien.

Pero al probar el flujo completo extremo a extremo (subir un logo nuevo → intentar mostrarlo),
se encontraron **dos bugs nuevos** en `POST /plantillas/logo`, verificados en vivo contra
`http://207.180.235.134:4000` (tenant con token válido, header `X-Tenant` correcto):

### Bug A — `fileUrl` de la respuesta no corresponde al archivo recién subido

Se hicieron dos llamadas `POST /plantillas/logo?termico=true` con archivos **distintos** (mismo
contenido PNG de prueba, nombres originales distintos: `verifyA.png` y `verifyB.png`):

```json
// POST con archivo "verifyA.png"
{"success":true,"data":{"fileUrl":"/files/test_logo-termicod1d533.png","fileName":"verifyA-termico.png"}}

// POST con archivo "verifyB.png" (llamada independiente, inmediatamente después)
{"success":true,"data":{"fileUrl":"/files/test_logo-termicod1d533.png","fileName":"verifyB-termico.png"}}
```

Nótese que:
- `fileName` sí cambia correctamente entre llamadas (`verifyA-termico.png` vs
  `verifyB-termico.png`) — el backend sí distingue cada subida internamente.
- Pero **`fileUrl` es idéntico en ambas respuestas**, y además es el de un archivo de una prueba
  de hace días (`test_logo-termicod1d533.png`) que **ya no existe** (confirmado con `curl`, ver
  Bug B). Es decir, `fileUrl` no se está calculando a partir del `fileName` recién generado —
  parece estar devolviendo un valor obsoleto o cacheado en vez del correspondiente a la subida
  actual.
- El frontend usa exactamente el `fileUrl` de la respuesta como `src` de la imagen — con este
  bug, **es imposible que el logo subido se muestre jamás**, sin importar ningún cambio del lado
  frontend.

### Bug B — Ninguno de los archivos subidos se puede recuperar vía `GET /files/:fileName`

Se probó `GET /files/<fileName>` con **cada uno** de los `fileName` reales devueltos por las
subidas de prueba, y también con el `fileUrl` devuelto:

```bash
$ curl -i http://207.180.235.134:4000/files/verifyA-termico.png
HTTP/1.1 404
{"success":false,"error":{"code":"NOT_FOUND","message":"Archivo no encontrado","statusCode":404}}

$ curl -i http://207.180.235.134:4000/files/verifyB-termico.png
HTTP/1.1 404
{"success":false,"error":{"code":"NOT_FOUND","message":"Archivo no encontrado","statusCode":404}}

$ curl -i http://207.180.235.134:4000/files/test_logo-termicod1d533.png   # el fileUrl que devolvió el POST
HTTP/1.1 404
{"success":false,"error":{"code":"NOT_FOUND","message":"Archivo no encontrado","statusCode":404}}
```

Es decir: **ningún archivo subido por `POST /plantillas/logo` puede recuperarse jamás**, ni con
el `fileName` real de la respuesta ni con el `fileUrl` real de la respuesta. Esto apunta a que
el registro en la tabla de mapeo (`plantilla_logo_files` según la implementación descrita para
`GET /files/:fileName`) no se está creando al subir el archivo, o se está creando con un
`fileName`/tenant que no coincide con lo que `POST /plantillas/logo` devuelve, o el archivo
nunca llega a guardarse físicamente en ERPNext pese a que la respuesta indica éxito (`201
Created`, `success: true`).

## 1. Qué se necesita

1. Revisar el handler de `POST /plantillas/logo`: confirmar que **el `fileUrl` que arma la
   respuesta se construye a partir del `fileName`/resultado real de esa subida específica**, no
   de un valor reciclado de una subida anterior (revisar si hay alguna variable compartida/no
   reseteada entre requests, un caché, o un valor por defecto que no se está sobrescribiendo).
2. Confirmar que, al subir el archivo, se inserta correctamente la fila en la tabla de mapeo
   que usa `GET /files/:fileName` para resolver el tenant/sitio (`plantilla_logo_files` o como
   se haya llamado) — con el `fileName` exacto que se devuelve en la respuesta de `POST
   /plantillas/logo`.
3. Confirmar que el archivo realmente se guarda en ERPNext (vía
   `frappe.utils.file_manager.upload_file` o el mecanismo que se use) antes de responder
   `201`/`success: true` — si la subida a ERPNext falla silenciosamente, la respuesta no debería
   reportar éxito.
4. Re-probar el ciclo completo: `POST /plantillas/logo` con un archivo de prueba → tomar el
   `fileUrl` de la respuesta **de esa misma llamada** → `GET` esa URL exacta → debe responder
   `200` con la imagen real (`content-type: image/png` o similar, no JSON).

## 2. Cómo probarlo

```bash
# 1. Subir un archivo de prueba (ajustar auth/tenant reales)
curl -s -X POST "http://<host>/plantillas/logo?termico=true" \
  -H "Authorization: Bearer <token>" -H "X-Tenant: <tenant>" \
  -F "file=@/ruta/a/prueba.png"
# -> anotar el fileUrl exacto de la respuesta

# 2. Pedir ese mismo fileUrl
curl -i "http://<host><fileUrl-de-arriba>"
# -> debe ser 200, content-type de imagen, NO 404 ni application/json

# 3. Repetir con un segundo archivo de prueba (nombre distinto) y confirmar que el fileUrl
#    de la segunda respuesta es DISTINTO al de la primera, y que ambos se pueden recuperar
#    simultáneamente (la subida anterior no debe romperse ni desaparecer).
```

## 3. Fuera de alcance

- El comportamiento de `GET /files/:fileName` ante un archivo que genuinamente no existe (404
  limpio) ya funciona bien — no tocar esa parte.
- No hay ningún cambio pendiente del lado frontend — el frontend ya usa el `fileUrl` de la
  respuesta tal cual, correctamente resuelto contra el origen del backend
  (`src/shared/api/client.ts`, `resolveFileUrl`). Una vez que `fileUrl` apunte al archivo
  correcto y ese archivo sea recuperable, el logo se mostrará sin ningún cambio adicional.
