# Prompt para agente de frontend — Tesorería: Impresión de Cheques

> Prompt autocontenido. Contexto de negocio y UX — shapes exactos en `openapi.json`, tag
> **"Tesorería — Plantillas de Impresión de Cheque"**. API base
> `https://gensapi.ryancfx.click/api/v1`. Requiere haber leído
> [35_cuentas_bancarias_tipo_y_plantilla_cheque.md](35_cuentas_bancarias_tipo_y_plantilla_cheque.md)
> y [37_tesoreria_emisiones.md](37_tesoreria_emisiones.md) primero.

> ⚠️ **Salvedad importante, leer antes de implementar**: la generación de PDF nativa (descrita
> abajo) fue verificada en el entorno de desarrollo del BFF y **falló por un problema de
> infraestructura del lado de ERPNext** (resolución de URLs de assets al generar el PDF con
> `wkhtmltopdf`), no relacionado con este contrato de API ni con código del frontend. **No se pudo
> confirmar en vivo que la impresión nativa funcione correctamente en producción.** Implementa el
> flujo completo de todos modos — es la decisión de arquitectura ya tomada (usar el motor nativo de
> ERPNext en vez de reimplementarlo) — pero **maneja el caso de error de generación de PDF de forma
> explícita y clara** (ver sección "Manejo de errores" abajo), porque es una falla real y esperable
> hasta que alguien verifique/corrija la configuración del servidor ERPNext en producción.

## Qué es y por qué existe

Para imprimir cheques que calcen exactamente sobre el papel pre-impreso físico de un talonario de
banco, hace falta control fino de coordenadas (dónde va el monto en letras, la fecha, la firma,
etc.), que varía según el diseño de cada banco. En vez de reimplementar esto, se usa el doctype
**nativo** de ERPNext `Cheque Print Template`: cada campo numérico es una coordenada en centímetros
desde el borde superior/izquierdo del papel. El usuario ajusta estos números hasta que el texto
calza sobre el talonario real — típicamente por ensayo y error, imprimiendo una hoja de prueba y
midiendo el desfase.

**Esto solo aplica a cheques emitidos con beneficiario (Payment Entry)** — ERPNext no soporta
generar este tipo de Print Format para Journal Entry. Una emisión "sin beneficiario" (Journal
Entry) siempre usa el comprobante genérico del BFF al imprimir (ver más abajo), nunca el formato
nativo con coordenadas.

## Parte 1 — Configurador de plantillas (CRUD)

```
GET    /tesoreria/cheque-print-templates          listar (paginado)
GET    /tesoreria/cheque-print-templates/:id       detalle
POST   /tesoreria/cheque-print-templates           crear
PUT    /tesoreria/cheque-print-templates/:id        actualizar coordenadas
POST   /tesoreria/cheque-print-templates/:id/regenerar   regenerar el Print Format nativo
```

### Campos (todos en centímetros salvo donde se indique; ver openapi.json para tipos exactos)

- `bankName` (string, requerido, **es el identificador/nombre de la plantilla, no editable
  después de crear** — es el docname nativo de ERPNext. Para "renombrar" hay que crear una nueva y
  borrar la vieja; no ofrecer un campo de edición de `bankName` en el formulario de editar, solo en
  el de crear).
- `chequeSize` (select: `'Regular' | 'A4'`, opcional).
- `startingPositionFromTopEdge` (número, opcional — **solo relevante si `chequeSize` es "A4"**;
  ocultar/deshabilitar este campo cuando `chequeSize` es "Regular").
- `chequeWidth`, `chequeHeight` (números, opcionales) — dimensiones del cheque.
- `isAccountPayable` (boolean, opcional) — si el cheque debe incluir la leyenda "Account Pay Only" /
  "Páguese únicamente a la orden de" o similar.
- `accPayDistFromTopEdge`, `accPayDistFromLeftEdge` (números, opcionales) — mostrar/habilitar solo
  si `isAccountPayable` está activo.
- `messageToShow` (string, opcional, ej. "Account Pay Only") — el texto de esa leyenda.
- `dateDistFromTopEdge`, `dateDistFromLeftEdge` — posición de la fecha.
- `payerNameFromTopEdge`, `payerNameFromLeftEdge` — posición del nombre del beneficiario.
- `amtInWordsFromTopEdge`, `amtInWordsFromLeftEdge`, `amtInWordWidth`, `amtInWordsLineSpacing` —
  posición y ancho del monto en letras (puede ocupar varias líneas, de ahí `amtInWordsLineSpacing`).
- `amtInFiguresFromTopEdge`, `amtInFiguresFromLeftEdge` — posición del monto en números.
- `accNoDistFromTopEdge`, `accNoDistFromLeftEdge` — posición del número de cuenta.
- `signatoryFromTopEdge`, `signatoryFromLeftEdge` — posición de la línea de firma.

Todos excepto `bankName` son opcionales — un usuario puede crear una plantilla con solo el nombre y
ajustar coordenadas después.

### Campo adicional en la respuesta

- `hasPrintFormat` (boolean) — indica si ya existe un Print Format generado con las coordenadas
  **actuales**. Si el usuario edita coordenadas (`PUT`) y NO llama `POST /:id/regenerar` después,
  el PDF que se imprima seguirá usando las coordenadas viejas. **Mostrar un aviso claro en la UI**
  cuando se detecte esta situación — la forma más simple: después de cualquier `PUT` exitoso,
  mostrar un banner "Coordenadas actualizadas — debe regenerar la plantilla para que se reflejen
  en la impresión" con un botón directo a `POST /:id/regenerar`, y no confiar únicamente en
  `hasPrintFormat` de la respuesta del `PUT` (confirmar releyendo el detalle si hace falta).

### UX sugerida para el configurador

- Un editor visual es lo ideal (una vista previa tipo "papel" en la que el usuario arrastra cajas
  de texto y el sistema traduce la posición a cm), pero **no es obligatorio para una v1** — un
  formulario con todos los campos numéricos, agrupados visualmente por elemento (Fecha, Monto en
  letras, Monto en números, Beneficiario, Firma, Cuenta), con inputs tipo number y sufijo "cm", es
  una implementación aceptable y más simple.
- Si se implementa una vista previa, no hay endpoint de "preview" — tendría que ser una
  aproximación puramente visual del lado del frontend (un rectángulo del tamaño de
  `chequeWidth`/`chequeHeight` con cajas posicionadas según las coordenadas), no un render real del
  PDF final.
- Después de crear o editar, ofrecer un botón "Regenerar plantilla" → `POST /:id/regenerar`, y
  luego un botón/enlace para probarla imprimiendo un cheque real ya existente (ver Parte 2).

## Parte 2 — Selección de plantilla por cuenta bancaria

Ya cubierto en el prompt 35: el formulario de Cuenta Bancaria tiene un campo `chequePrintTemplate`
(selector poblado desde `GET /tesoreria/cheque-print-templates`) que vincula una plantilla a una
cuenta. Esa vinculación es lo que determina qué plantilla se usa al imprimir cheques de esa cuenta.

## Parte 3 — Botón de impresión y su lógica de fallback

```
GET /tesoreria/emisiones/:id/imprimir → PDF (Content-Type: application/pdf, inline)
```

Este es el único endpoint de impresión que el frontend necesita llamar — **toda la decisión de
"nativo vs. genérico" ocurre del lado del backend, el frontend no elige**:

1. Si la emisión es un Payment Entry (tiene beneficiario) **y** su `cuentaBancaria` tiene
   `chequePrintTemplate` configurado → el backend intenta generar el PDF con el motor nativo de
   ERPNext (coordenadas exactas sobre el papel del talonario).
2. En cualquier otro caso (Journal Entry, o Payment Entry sin plantilla configurada) → el backend
   genera un comprobante PDF genérico autocontenido (no calza sobre un talonario pre-impreso, es
   para imprimir en papel normal como constancia).

**El frontend simplemente llama el endpoint y muestra/descarga el PDF que reciba** — no necesita
saber cuál de los dos caminos se usó, salvo para mensajes de error (ver abajo).

### Manejo de errores

Si el camino nativo fue el elegido (caso 1) y la generación falla del lado de ERPNext (motivo
documentado arriba: problema de infraestructura no resuelto en este momento), el endpoint responde
un error (revisar el código HTTP exacto y el mensaje en `openapi.json`/en pruebas reales, pero
tratarlo como un 400 con mensaje explicativo tipo "No se pudo generar el PDF con la plantilla
'X'. Verifique que el Print Format esté generado"). **Mostrar ese mensaje de error al usuario de
forma clara**, con una sugerencia práctica: "Intente regenerar la plantilla desde
Configuración → Plantillas de Cheque, o quite la plantilla configurada en la cuenta bancaria para
usar el comprobante genérico mientras se resuelve." No hacer un fallback automático y silencioso a
otro formato del lado del frontend — si el usuario configuró explícitamente una plantilla, un
fallo ahí debe ser visible, no oculto.

### Dónde poner el botón

En la vista de detalle de una Emisión sometida (`estado: 'submitted'`) — no tiene sentido imprimir
un borrador (aún no es un documento contable real) ni un documento cancelado. Deshabilitar/ocultar
el botón de imprimir salvo en `estado === 'submitted'`.
