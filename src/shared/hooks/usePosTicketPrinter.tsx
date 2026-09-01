import { useState } from 'react'
import { flushSync } from 'react-dom'
import { getRenderDataPosInvoice } from '@/shared/api/plantillas'
import { printDocument } from '@/features/invoice-template-editor/printUtils'
import { TemplateEditorPrintTarget } from '@/features/invoice-template-editor/TemplateEditorPrintTarget'
import type { TemplateDocument } from '@/features/invoice-template-editor/types'

/**
 * Resuelve una Sales Invoice contra la plantilla `Pos Invoice` default (GET
 * /plantillas/render-data, §3 del doc de plantillas) e imprime el ticket térmico —
 * usado en el momento real de cierre de venta (el cobro en Caja, no el sometimiento
 * de la factura — una venta de consumo en un tenant con módulo POS solo se completa
 * ahí; ver CajaPage.tsx) y desde el botón manual "Imprimir POS" en InvoiceDetail.
 *
 * Devuelve `tryPrintPosTicket` (true si imprimió, false si no hay plantilla default
 * configurada u otro error impidió resolverla — nunca lanza, el caller decide el
 * fallback) y `printTargetNode`, que debe montarse en el árbol del componente que usa
 * este hook (nodo oculto hasta `window.print()`, ver TemplateEditorPrintTarget).
 */
export function usePosTicketPrinter() {
  const [payload, setPayload] = useState<{ document: TemplateDocument; values: Record<string, unknown> } | null>(null)

  async function tryPrintPosTicket(invoiceId: string): Promise<boolean> {
    try {
      const renderData = await getRenderDataPosInvoice({ sourceId: invoiceId })
      const document = renderData.template.document as unknown as TemplateDocument
      // `flushSync` fuerza a React a commitear el nodo oculto de impresión ANTES de seguir —
      // depender de requestAnimationFrame aquí es un bug real: rAF nunca se ejecuta si la
      // pestaña está en background (confirmado en pruebas), dejando la impresión sin
      // disparar en silencio en cualquier terminal POS cuya pestaña no esté enfocada.
      flushSync(() => setPayload({ document, values: renderData.values }))
      await printDocument(document)
      return true
    } catch {
      return false
    }
  }

  const printTargetNode = payload ? (
    <TemplateEditorPrintTarget doc={payload.document} fields={[]} values={payload.values} />
  ) : null

  return { tryPrintPosTicket, printTargetNode }
}
