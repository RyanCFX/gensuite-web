# Prompt para agente de frontend — Cuentas Bancarias: numeración manual/automática de cheques

> Prompt autocontenido. Da contexto de negocio y qué construir en la UI del módulo de Cuentas
> Bancarias existente — **no** el shape exacto de cada endpoint, eso está en `openapi.json` (tag
> **"Cuentas Bancarias"**). API base `https://gensapi.ryancfx.click/api/v1`.
>
> Requiere haber leído [35_cuentas_bancarias_tipo_y_plantilla_cheque.md](35_cuentas_bancarias_tipo_y_plantilla_cheque.md)
> primero (los campos `chequeFormat`/`chequePrintTemplate` ya existían; este prompt solo cambia el
> comportamiento de `chequesManuales`/`ultimoCheque`, que también ya existían en el formulario).

## Qué cambió

`chequesManuales` (booleano, ya existía en el formulario) dejó de ser un campo decorativo — ahora
**gobierna de verdad cómo se numeran los cheques emitidos desde esa cuenta**, y `ultimoCheque` pasó
a ser un contador real, no solo informativo.

- `chequesManuales: true` (**default**) — el usuario digita el número de cheque en cada pago/emisión.
  El sistema solo valida que no se repita en esa cuenta y sugiere el siguiente.
- `chequesManuales: false` — el sistema asigna el número automáticamente a partir de
  `ultimoCheque`. El usuario **ya no puede** indicar un número manualmente en ese caso — si lo
  hace, el backend responde 400.

**La numeración es siempre por cuenta bancaria — nunca por tenant ni por compañía.** Dos cuentas
bancarias distintas llevan talonarios completamente independientes: la cuenta A puede ir por el
cheque `0005` (próximo `0006`) mientras la cuenta B va por el `0019` (próximo `0020`), y ambas
pueden incluso usar el mismo número sin ningún conflicto entre sí. No hay ningún selector ni
config "global" de numeración — todo vive en el formulario de cada cuenta bancaria individual.

## Cambios de validación a replicar en el formulario

1. **Al crear una cuenta bancaria** con `chequesManuales: false`, el campo `ultimoCheque` pasa a
   ser **requerido** en esa misma request (el backend responde 400 si falta). Es el punto de
   partida del contador — sin él, el sistema no sabe qué número asignar primero.
2. **Al editar una cuenta bancaria** y cambiarla de manual a automático (`chequesManuales: false`
   cuando antes era `true`), si la cuenta no tiene ya un `ultimoCheque` guardado, también hay que
   enviar `ultimoCheque` en la misma request — mismo error 400 si falta.
3. En modo manual, `ultimoCheque` sigue siendo opcional (solo sirve como semilla de la sugerencia).

### UX sugerida

- En el formulario de Cuenta Bancaria, junto al toggle "Cheques Manuales" (ya existe), agrega
  lógica condicional: cuando el usuario lo desactiva (pasa a automático), si el campo "Número
  Último Cheque" está vacío, muéstralo como requerido con validación inline antes de enviar —
  evita el viaje redondo al backend para un error predecible.
- Aclara en el texto de ayuda del toggle: "Automático: el sistema asigna el número de cheque solo,
  a partir del último usado. Manual: usted digita el número en cada pago — el sistema solo valida
  que no se repita." (o tu propia redacción, el punto es que quede claro qué hace cada modo).
- Si la cuenta ya tiene cheques emitidos y el usuario intenta pasarla a automático sin
  `ultimoCheque`, el mensaje de error del backend ya trae la instrucción — mostrarlo tal cual.

## Nada más cambió en este módulo

El resto de Cuentas Bancarias (balance, `chequeFormat`, `chequePrintTemplate`, tipo de cuenta,
etc.) no tuvo cambios de contrato en esta sesión — si ya está implementado en el frontend, no
tocar. Ver [35_cuentas_bancarias_tipo_y_plantilla_cheque.md](35_cuentas_bancarias_tipo_y_plantilla_cheque.md)
para esos campos.
