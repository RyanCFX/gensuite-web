# Ciclo de Vida de Documentos Fiscales

Todos los documentos transaccionales (facturas, compras, gastos, cotizaciones) comparten el mismo patrón de estados.

## Estados

| Estado | `docstatus` ERPNext | Color UI | Acciones disponibles |
|--------|--------------------|-----------|--------------------|
| `draft` | 0 | Gris | Editar, Someter, Eliminar |
| `submitted` | 1 | Verde | Ver PDF, Cancelar |
| `cancelled` | 2 | Rojo | Enmendar |

## Flujo Completo

```
                    ┌──────────────────────────────────────────────┐
                    │                                              │
            POST /[doc]                                           │
                ↓                                                 │
           ┌─────────┐                                           │
           │  Draft  │──── PUT /[doc]/:id ──→ [actualizar]       │
           └────┬────┘                                           │
                │                                                 │
         POST /:id/submit                                         │
                │                                                 │
                ↓                                                 │
         ┌────────────┐                                          │
         │ Submitted  │──── GET /:id/pdf ──→ [descargar]         │
         └─────┬──────┘                                          │
               │                                                  │
        POST /:id/cancel                                          │
               │                                                  │
               ↓                                                  │
         ┌───────────┐                                           │
         │ Cancelled │──── POST /:id/amend ──→ [nuevo Draft] ───┘
         └───────────┘
```

## Componente `<DocumentActions>`

```tsx
// src/components/shared/DocumentActions.tsx
interface DocumentActionsProps {
  status: 'draft' | 'submitted' | 'cancelled'
  onSubmit?: () => void
  onCancel?: () => void
  onAmend?: () => void
  onDelete?: () => void
  onDownloadPdf?: () => void
  hasPdf?: boolean                // Solo facturas y compras
  loading?: boolean
}

export const DocumentActions = ({
  status, onSubmit, onCancel, onAmend, onDelete, onDownloadPdf, hasPdf, loading
}: DocumentActionsProps) => {
  if (status === 'draft') return (
    <div className="flex gap-2">
      <Button variant="default" onClick={onSubmit} loading={loading}>
        ✓ Someter
      </Button>
      {onDelete && (
        <ConfirmDialog
          trigger={<Button variant="destructive">Eliminar</Button>}
          title="¿Eliminar borrador?"
          description="Esta acción no se puede deshacer."
          onConfirm={onDelete}
        />
      )}
    </div>
  )

  if (status === 'submitted') return (
    <div className="flex gap-2">
      {hasPdf && (
        <Button variant="outline" onClick={onDownloadPdf}>
          📄 Descargar PDF
        </Button>
      )}
      <ConfirmDialog
        trigger={<Button variant="outline">Cancelar</Button>}
        title="¿Cancelar documento?"
        description="Esta acción cancela el comprobante fiscal. Para corregirlo necesitarás crear una enmienda."
        onConfirm={onCancel!}
      />
    </div>
  )

  if (status === 'cancelled') return (
    <Button variant="outline" onClick={onAmend}>
      ✎ Enmendar
    </Button>
  )

  return null
}
```

## Mensajes de Confirmación Recomendados

```typescript
const SUBMIT_MESSAGES = {
  invoices: 'Esta acción asigna el NCF y registra los asientos contables. No se puede editar directamente después.',
  compras: 'Esta acción registra la compra en contabilidad y actualiza el inventario.',
  gastos: 'Esta acción registra el gasto en contabilidad. Asegúrate de que los campos 606 estén completos.',
  quotations: 'Esta acción confirma la cotización como Submitted.',
}

const CANCEL_MESSAGES = {
  invoices: 'Cancelar esta factura cancela el NCF asignado. Para emitir una nueva, usa "Enmendar" luego.',
  compras: 'Cancelar esta compra revierte el movimiento de inventario y los asientos contables.',
  gastos: 'Cancelar este gasto revierte los asientos contables.',
}
```

## Hook `useDocumentActions`

```typescript
// src/hooks/useDocumentActions.ts
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'

export const useDocumentActions = (module: string, id: string) => {
  const qc = useQueryClient()
  const invalidate = () => qc.invalidateQueries({ queryKey: [module, id] })

  const submit = useMutation({
    mutationFn: () => apiClient.post(`/${module}/${id}/submit`),
    onSuccess: () => { toast.success('Documento sometido exitosamente'); invalidate() },
    onError: (e: any) => toast.error(e.message),
  })

  const cancel = useMutation({
    mutationFn: () => apiClient.post(`/${module}/${id}/cancel`),
    onSuccess: () => { toast.success('Documento cancelado'); invalidate() },
    onError: (e: any) => toast.error(e.message),
  })

  const amend = useMutation({
    mutationFn: () => apiClient.post(`/${module}/${id}/amend`),
    onSuccess: (res) => {
      toast.success('Enmienda creada. Edita el nuevo borrador.')
      // Redirigir al nuevo documento
      window.location.href = `/${module}/${res.data.data.id}`
    },
    onError: (e: any) => toast.error(e.message),
  })

  const downloadPdf = () => {
    window.open(`${import.meta.env.VITE_API_BASE_URL}/${module}/${id}/pdf`, '_blank')
  }

  return { submit, cancel, amend, downloadPdf }
}
```
