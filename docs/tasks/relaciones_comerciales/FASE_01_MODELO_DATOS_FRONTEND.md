# Prompt para el agente de frontend — Relaciones Comerciales, Fase 01: modelo de datos

> Backend: fase completada el 2026-09-17 · plan: docs/plans/relaciones_comerciales/FASE_01_MODELO_DATOS.md

## Sin impacto en frontend

Esta fase no expone ni cambia ningún endpoint — solo crea la persistencia (tablas del
control-plane, 4 doctypes nuevos en ERPNext, custom fields en `Customer`/`Supplier`/`Sales
Invoice`/`Purchase Invoice`). No hay nada que el frontend pueda o deba construir todavía.

Lo único a adelantar, para que el vocabulario ya esté fijado cuando lleguen los endpoints
(Fase 03 en adelante):

- **Forma de `TerminosComerciales`** (se usará en la invitación, Fase 04): `tieneCredito`,
  `diasCredito`, `limiteCredito`, `grupoCliente`, `cuentaCxcAlterna`, `encargadoCxc`,
  `formaPagoDefault`, y del lado proveedor `grupoProveedor`, `diasCreditoProveedor`,
  `cuentaCxpAlterna`, `tipoBienes606`, `formaPago606`.
- **Estados de la relación**: `invitada | activa | rechazada | revocada | suspendida`.
- **Estados de una transacción B2B**: `Pendiente de entrega | Pendiente | Requiere Mapeo |
  Requiere Configuración | Aceptada | Editada | Enlazada | Rechazada | Cancelada | Error`.

No hay checklist de aceptación de frontend para esta fase.
