# Instrucciones del proyecto

## Kit de UI reutilizable (`vendor/gensuite-ui-kit`)

Este proyecto tiene un submódulo git en `vendor/gensuite-ui-kit` (repo: https://github.com/RyanCFX/gensuite-ui-kit) con componentes de UI genéricos y su design system, pensado para reutilizarse en varios proyectos.

**Cuando crees un componente de UI nuevo que sea genérico** — es decir, que NO dependa de tipos, endpoints o reglas de negocio específicas de GenSuite (facturación, ERP, farmacia, ECF, etc.) y que razonablemente podría usarse en cualquier otro proyecto — agrégalo (o su equivalente) también al submódulo, no solo a `src/`:

- Componentes hechos a mano (buscadores, modales, tablas, inputs, etc.) van en `vendor/gensuite-ui-kit/src/components/`.
- Componentes sobre Radix UI (dialogs, selects, tabs, etc.) van en `vendor/gensuite-ui-kit/src/primitives/`.
- Hooks genéricos van en `vendor/gensuite-ui-kit/src/hooks/`.
- Estilos del componente van en `vendor/gensuite-ui-kit/src/styles/design-system.css`.
- Todos los imports **dentro** del submódulo deben ser relativos (nunca `@/...`) — no depende del alias del proyecto host. Ver el `README.md` del submódulo para más detalle sobre esta convención y sobre qué se considera "genérico" vs "acoplado a negocio".

**No** agregues al submódulo componentes acoplados a lógica de negocio de GenSuite (ej. algo que llame a `@/shared/api/*`, dependa de tipos como `Customer`/`Item`/`Aseguradora`, o de hooks de reglas de negocio como `useUomMustBeWholeNumber`). Esos se quedan solo en `src/`.

Para publicar un cambio en el submódulo:
```bash
cd vendor/gensuite-ui-kit
git add -A
git commit -m "..."
git push
cd ../..
git add vendor/gensuite-ui-kit
git commit -m "chore: actualiza puntero de gensuite-ui-kit"
```

Si tienes dudas sobre si algo es "genérico" o no, pregunta antes de mover/duplicar código.
