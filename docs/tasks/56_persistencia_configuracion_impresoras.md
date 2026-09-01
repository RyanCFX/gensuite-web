# Prompt para agente de backend — Configuración de impresoras + firma de mensajes QZ Tray

> Este documento es un prompt autocontenido para un agente de IA de backend. Describe qué
> construyó el frontend, cómo lo está simulando temporalmente sin backend, y qué debe construir
> el backend para reemplazarlo: (A) persistencia de impresoras configuradas y (B) firma de
> mensajes de QZ Tray para eliminar el diálogo de confianza que hoy aparece en cada conexión.

---

## 0. Contexto — qué es esto y qué NO es

- El frontend integró **QZ Tray** (agente de escritorio local del usuario, no relacionado con
  este backend) para imprimir tickets/etiquetas POS **directo a la impresora, sin el diálogo de
  impresión del navegador**. QZ Tray corre en la máquina del usuario y se conecta desde el
  navegador por WebSocket local (`wss://localhost:8181` o similar) — **el backend nunca
  participa en el acto de imprimir**, ni ve el contenido impreso. Lo único que el backend hace
  es (A) guardar metadata de impresoras y (B) firmar, a pedido del navegador del usuario, los
  mensajes que QZ Tray exige firmar — sin eso, QZ Tray trata cada conexión como "sin verificar".
- **"Marca" y "Modelo" son campos de texto libre, puramente descriptivos** — el backend los
  guarda y devuelve tal cual, no valida ni interpreta su contenido. El único campo con
  significado técnico es `qzPrinterName`: el nombre exacto que reporta `qz.printers.find()` en
  la máquina del usuario (ej. `"Star TSP143 (STR_T-001) 2"`) — tampoco lo valida el backend,
  es opaco para él también.
- Confirmado con hardware real: **sin firma, QZ Tray puede colgarse indefinidamente** en
  `qz.printers.find()`/`qz.print()` esperando una aprobación manual en un diálogo del propio QZ
  Tray (en el escritorio, fuera del navegador) que en un terminal POS desatendido nadie ve ni
  puede aceptar. Este documento (parte B) es la forma soportada de eliminar ese bloqueo.

---

## PARTE A — Persistencia de impresoras configuradas

### A.1 Modelo de datos sugerido

Dos entidades:

**`Impresora`** (por tenant — compartida entre todos los usuarios del tenant, cualquiera puede
crear/editar/eliminar por ahora, no hay roles especiales para esto):

| Campo | Tipo | Notas |
|---|---|---|
| `id` | string | |
| `name` | string | Nombre visible, ej. "Caja 1" |
| `brand` | string | Texto libre, ej. "Star" |
| `model` | string | Texto libre, ej. "TSP143" |
| `qzPrinterName` | string | Nombre exacto reportado por QZ Tray en la máquina del usuario |

**Selección por usuario** — qué `Impresora` (o ninguna) usa el usuario actualmente logueado.
Puede modelarse como una tabla `UsuarioImpresoraSeleccionada { userId, tenantId, impresoraId | null }`
o como un campo más en el perfil/preferencias del usuario si ya existe algo así. `impresoraId =
null` (o el registro ausente) significa "ninguna" — el frontend cae al diálogo del navegador.

### A.2 Endpoints sugeridos

Los nombres/firmas del frontend (`src/shared/printing/printerConfigs.ts`) ya están pensados
para mapear 1:1 a esto, para minimizar el diff cuando se conecte la API real:

| Función frontend actual (localStorage) | Endpoint sugerido |
|---|---|
| `listPrinterConfigs(tenantSlug)` | `GET /impresoras` |
| `createPrinterConfig(tenantSlug, data)` | `POST /impresoras` |
| `updatePrinterConfig(tenantSlug, id, data)` | `PUT /impresoras/:id` |
| `deletePrinterConfig(tenantSlug, id)` | `DELETE /impresoras/:id` |
| `getSelectedPrinterConfig(tenantSlug, userEmail)` | `GET /impresoras/mi-seleccion` |
| `setSelectedPrinterConfig(tenantSlug, userEmail, id \| null)` | `PUT /impresoras/mi-seleccion` (body `{ impresoraId: string \| null }`) |

Convenciones esperadas (iguales al resto de la API, ver `FRONTEND_CONTEXT.md`):
`Authorization: Bearer <jwt>`, `X-Tenant: <slug>`, respuestas envueltas en
`{ "success": true, "data": ... }`, `GET /impresoras/mi-seleccion` puede devolver
`{ "success": true, "data": null }` cuando el usuario no ha seleccionado ninguna (no es error).

`DELETE /impresoras/:id` sobre una impresora que está actualmente seleccionada por algún
usuario: no hace falta protegerlo ni notificar — el frontend ya maneja localmente el caso de
"mi impresora seleccionada ya no existe" (cae a "ninguna" sin romper pantalla).

---

## PARTE B — Firma de mensajes QZ Tray

### B.0 Por qué esto importa (no es opcional/cosmético)

Sin firma, cada vez que el navegador le pide algo a QZ Tray (listar impresoras, imprimir), QZ
Tray no puede verificar quién es el sitio que pregunta y trata la conexión como "no verificada":
muestra su propio diálogo de aprobación en el escritorio del usuario. Confirmado en pruebas
reales: si nadie está mirando ese diálogo (terminal POS desatendida, o simplemente porque queda
detrás de la ventana del navegador), la promesa de `qz-tray.js` se queda colgada — la UI del
frontend queda pegada en "Conectando…" indefinidamente.

**Firmar no elimina el diálogo la primerísima vez** (QZ Tray siempre pide aprobar un sitio que
nunca ha visto) — lo que sí logra:
- El diálogo muestra el certificado como **verificado/de confianza** (con el nombre de la
  organización) en vez de una advertencia genérica de "sitio no identificado".
  "Recordar esta decisión" queda persistido de forma confiable y permanente (en modo sin firmar,
  esa opción es poco confiable y puede no sobrevivir reinicios).
- Todas las conexiones futuras (incluida la primera de cada terminal nuevo, una vez aprobada)
  ya no vuelven a colgarse esperando aprobación.
- Existe además un mecanismo 100% offline para terminales POS dedicadas que nunca deben mostrar
  ningún diálogo, ni siquiera la primera vez — ver B.5 (no requiere backend, es configuración
  local de QZ Tray, pero solo tiene sentido una vez que hay un certificado real que confiar).

### B.1 Qué generar

Un par de claves RSA de 2048 bits + un certificado X.509 autofirmado (no hace falta una CA
comercial — QZ Tray acepta certificados autofirmados sin problema, es lo mismo que genera su
propia herramienta de demo):

```bash
openssl genrsa -out private-key.pem 2048
openssl req -x509 -new -key private-key.pem -out digital-certificate.txt -days 3650 \
  -subj "/C=DO/O=JORGES BUSINESS CONSULTING/CN=GenSuite QZ Tray"
```

- `private-key.pem` — **nunca sale del backend**. Guardar como secreto (variable de entorno /
  secrets manager), nunca en el repo, nunca expuesto por ningún endpoint.
- `digital-certificate.txt` — el certificado público (PEM). Este sí se sirve al navegador tal
  cual (texto plano, no envuelto en JSON).

### B.2 Endpoint 1 — servir el certificado público

```
GET /qz/certificado
```
- Devuelve el contenido de `digital-certificate.txt` **tal cual, como texto plano**
  (`Content-Type: text/plain`), sin envolver en `{success, data}` — QZ Tray espera el PEM crudo.
- Puede requerir el mismo `Authorization`/`X-Tenant` que el resto de la API, o ser público — es
  solo la mitad pública de la llave, no hay nada sensible en exponerlo sin autenticación si eso
  simplifica la integración (el certificado es igual para todos los tenants, no es por-tenant).

### B.3 Endpoint 2 — firmar un mensaje

```
POST /qz/firmar
Body: { "request": "<string exacto que QZ Tray pidió firmar>" }
```
- Firma ese string exacto con `private-key.pem` usando **SHA512withRSA**, codifica el resultado
  en **base64**, y responde `{ "success": true, "data": { "signature": "<base64>" } }`.
- **Sí requiere autenticación** (`Authorization: Bearer <jwt>` + `X-Tenant`) — a diferencia del
  certificado, este endpoint firma bajo demanda y no debe quedar abierto como oráculo de firma
  para cualquiera; solo un usuario ya logueado en el sistema debe poder pedir firmas.
- Ejemplo en Node (backend ya es Node/Fastify por el resto de la API):

```js
const crypto = require('node:crypto')

function signForQz(dataToSign, privateKeyPem) {
  const signer = crypto.createSign('RSA-SHA512')
  signer.update(dataToSign)
  signer.end()
  return signer.sign(privateKeyPem, 'base64')
}

// POST /qz/firmar
fastify.post('/qz/firmar', { preHandler: [authRequired] }, async (req, reply) => {
  const { request } = req.body
  const signature = signForQz(request, process.env.QZ_PRIVATE_KEY_PEM)
  return { success: true, data: { signature } }
})
```

### B.4 Qué hará el frontend con esto (pendiente del lado frontend hasta que existan estos endpoints)

En cuanto B.2/B.3 existan, el frontend (`src/shared/printing/qz.ts`) reemplazará el handshake
"sin firmar" actual por algo como esto (informativo, para que quede claro el contrato completo
extremo a extremo — no es responsabilidad del backend implementarlo):

```js
qz.security.setCertificatePromise((resolve, reject) => {
  fetch('/api/v1/qz/certificado').then((r) => r.text()).then(resolve).catch(reject)
})

qz.security.setSignaturePromise((toSign) => (resolve, reject) => {
  fetch('/api/v1/qz/firmar', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, 'X-Tenant': tenant },
    body: JSON.stringify({ request: toSign }),
  })
    .then((r) => r.json())
    .then((body) => resolve(body.data.signature))
    .catch(reject)
})
```
No se necesita ninguna acción del backend para esta parte — se documenta aquí solo para que el
agente de backend entienda el contrato completo extremo a extremo.

### B.5 Opcional — cero diálogos incluso la primera vez (no requiere backend)

Para terminales POS dedicadas que nunca deben ver ningún diálogo (ni siquiera el primero), QZ
Tray soporta pre-aprobar un certificado colocando manualmente estos archivos en la máquina antes
de usarla (fuera del alcance de este backend, es configuración de IT en cada terminal):
`override.crt` (el mismo `digital-certificate.txt` de B.1, renombrado) dentro de la carpeta de
QZ Tray, o el `allowed.txt` correspondiente. Mencionarlo aquí solo para que quede documentado
como la vía existente si el negocio pide "cero clics jamás" en las cajas — no bloquea nada de lo
pedido en la Parte A/B de este documento.

---

## Resumen de lo que debe entregar el backend

1. Parte A: 6 endpoints de `/impresoras` (CRUD + selección por usuario).
2. Parte B: par de llaves generado y guardado como secreto, `GET /qz/certificado` (texto plano),
   `POST /qz/firmar` (autenticado, SHA512withRSA + base64).
