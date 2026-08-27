# Índice — Tesorería/Bancos y cambios relacionados (esta serie de prompts)

> Este archivo es un índice de lectura, no un prompt de implementación por sí mismo. Da el mapa
> completo de lo que cambió/se agregó en el BFF en esta sesión de trabajo y en qué orden conviene
> implementarlo en el frontend. Cada archivo listado abajo es autocontenido y puede pasarse solo a
> un agente de frontend, pero el orden importa porque hay dependencias de datos entre módulos.

API base: `https://gensapi.ryancfx.click/api/v1` (prod) / `http://localhost:4000/api/v1` (dev).
Todos los endpoints requieren `Authorization: Bearer <token>` + header `X-Tenant`, salvo que se
indique lo contrario.

**Fuente de verdad para shapes exactos de request/response**: el `openapi.json` que ya existe en
el proyecto de frontend (regenerable desde `GET /api/docs-json` del BFF, o consultable en
`https://gensapi.ryancfx.click/api/docs`). Los prompts de esta serie describen reglas de negocio,
flujos de UX y nombres de campo — no repiten cada `@ApiProperty`; para el shape exacto, formato de
error, y códigos HTTP, ir siempre al openapi.json.

## Orden recomendado de implementación

1. **[35_cuentas_bancarias_tipo_y_plantilla_cheque.md](35_cuentas_bancarias_tipo_y_plantilla_cheque.md)**
   — cambios en Cuentas Bancarias (`tipoCuenta`, `chequePrintTemplate`). Base para todo lo demás:
   Tesorería referencia cuentas bancarias constantemente.
2. **[36_tesoreria_tipos_documento.md](36_tesoreria_tipos_documento.md)** — catálogo `Bank Document
   Type` (CRUD). Los demás submódulos de Tesorería dependen de este catálogo para saber qué tipo de
   documento se está emitiendo/depositando.
3. **[37_tesoreria_emisiones.md](37_tesoreria_emisiones.md)** — egresos (cheques, transferencias
   salientes, pagos a proveedores).
4. **[38_tesoreria_depositos.md](38_tesoreria_depositos.md)** — ingresos (depósitos, cobros de
   clientes vía tesorería).
5. **[39_tesoreria_transferencias_internas.md](39_tesoreria_transferencias_internas.md)** —
   movimientos entre cuentas bancarias propias.
6. **[40_tesoreria_movimientos.md](40_tesoreria_movimientos.md)** — libro de banco / kardex con
   saldo corrido, agregando todo lo anterior en una sola vista de lectura.
7. **[41_tesoreria_impresion_cheques.md](41_tesoreria_impresion_cheques.md)** — configurador de
   `Cheque Print Template` nativo + botón de impresión. Depende de 35 y 37.
8. **[42_historial_cxc_cxp_ampliado.md](42_historial_cxc_cxp_ampliado.md)** — cambios en aging de
   CxC/CxP (filtros por cliente/proveedor, `groupBy`, historial ampliado a Pay+Receive). Módulo
   independiente de Tesorería, se puede hacer en paralelo.

## Resumen ejecutivo del modelo de datos (para orientarse antes de leer los prompts)

Tesorería introduce un **doctype nuevo de ERPNext**, `Bank Document Type` (catálogo configurable
de tipos de documento bancario: Cheque, Depósito, Transferencia, Transferencia interna, Ajuste
bancario, Nota de débito, Nota de crédito, Otro), y usa **dos doctypes nativos de ERPNext en
paralelo** para registrar las transacciones según si tienen o no un beneficiario/origen (cliente o
proveedor):

- **Con beneficiario/origen** (ej. pagar a un proveedor, cobrar a un cliente) → se crea un
  **Payment Entry** nativo. Esto habilita reconciliación automática con facturas, saldo a favor,
  etc.
- **Sin beneficiario/origen** (ej. una comisión bancaria, un ajuste, un traspaso entre cuentas
  propias) → se crea un **Journal Entry** nativo, que permite distribuir el monto entre N cuentas
  contables libremente (algo que Payment Entry no soporta).

**El frontend NO necesita saber esto para operar día a día** — cada endpoint de Tesorería
(`/tesoreria/emisiones`, `/tesoreria/depositos`, `/tesoreria/transferencias-internas`) abstrae esa
decisión: el BFF decide internamente si crea un Payment Entry o un Journal Entry según si el
usuario mandó `beneficiario`/`origen` en el body, y siempre responde con el mismo shape
normalizado (`TreasuryTransaction`, campo `origen: 'pe' | 'je'` informativo solamente). Esto se
explica en detalle en los prompts 37–39 porque **sí afecta la UX**: ciertos campos solo aplican
en un camino u otro (ver cada archivo).

## Convención de nombres

Todos los campos expuestos por el BFF están en **camelCase**, aunque el doctype de ERPNext
subyacente use snake_case (ej. `custom_bank_document_type` en ERPNext → `tipoDocumento` en la
respuesta del BFF). No asumir nombres de campo por el nombre del doctype de ERPNext — usar siempre
los nombres documentados en cada prompt / en openapi.json.

## Estado de cada pieza (para que el frontend sepa qué está garantizado y qué no)

- Todo lo descrito en 35–40 y 42 está **implementado, compilado, y verificado en vivo** contra el
  tenant real `jbc.ryancfx.click` (creación, sometimiento, cancelación, cálculo de saldos —
  incluyendo limpieza de los datos de prueba usados para verificar).
- **41 (impresión nativa de cheques) tiene una salvedad**: la generación de PDF vía el motor
  nativo de ERPNext (`Cheque Print Template` → `Print Format` → `download_pdf`) falló en el
  entorno de pruebas del BFF por un problema de infraestructura (resolución de URLs de assets del
  lado de ERPNext, no relacionado con el código del BFF ni del frontend) — **no se pudo confirmar
  en vivo que el PDF nativo se genere correctamente en producción**. El prompt 41 documenta esto
  explícitamente y pide al frontend implementar el flujo completo de todos modos (configurador +
  botón), con manejo de error claro para el caso en que la generación falle del lado del servidor.
