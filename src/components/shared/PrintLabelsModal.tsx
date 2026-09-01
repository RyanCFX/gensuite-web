// Módulo nuevo (§6 del doc de plantillas de impresión) — no existía ningún punto de entrada
// para imprimir etiquetas Label 5x2 en la app. Reusable desde Catálogo/Inventario (un artículo)
// y desde Recepción de mercancía en Compras (varias líneas recién recibidas).

import { useState } from 'react'
import { flushSync } from 'react-dom'
import { toast } from 'sonner'
import { X, Printer } from 'lucide-react'
import { Modal } from '@/shared/ui/Modal'
import { ItemSelect } from '@/shared/ui/ItemSelect'
import { getRenderDataLabels } from '@/shared/api/plantillas'
import { printDocument } from '@/features/invoice-template-editor/printUtils'
import { TemplateEditorPrintTarget } from '@/features/invoice-template-editor/TemplateEditorPrintTarget'
import type { TemplateDocument } from '@/features/invoice-template-editor/types'
import type { ApiError } from '@/shared/api/types'

export interface PrintLabelsRow {
  itemCode: string
  itemName: string
  qty: number
}

interface Props {
  open: boolean
  onClose: () => void
  /** Prefill sugerido — ej. las líneas de una recepción de mercancía recién sometida, con la
   * cantidad recibida como cantidad de copias sugerida. El usuario puede editarlo todo. */
  initialItems?: PrintLabelsRow[]
}

export function PrintLabelsModal({ open, onClose, initialItems }: Props) {
  const [rows, setRows] = useState<PrintLabelsRow[]>([])
  const [addQuery, setAddQuery] = useState('')
  const [printing, setPrinting] = useState(false)
  const [printPayload, setPrintPayload] = useState<{ document: TemplateDocument; labels: Record<string, unknown>[] } | null>(null)

  // Reinicia rows/addQuery cada vez que el modal pasa de cerrado a abierto — ajustar estado
  // durante el render (en vez de un useEffect) evita un render de sobra en cascada.
  const [wasOpen, setWasOpen] = useState(open)
  if (open !== wasOpen) {
    setWasOpen(open)
    if (open) {
      setRows(initialItems ?? [])
      setAddQuery('')
    }
  }

  function addRow(itemCode: string, itemName: string) {
    setRows((prev) => {
      const existing = prev.find((r) => r.itemCode === itemCode)
      if (existing) {
        return prev.map((r) => (r.itemCode === itemCode ? { ...r, qty: r.qty + 1 } : r))
      }
      return [...prev, { itemCode, itemName, qty: 1 }]
    })
    setAddQuery('')
  }

  function updateQty(itemCode: string, qty: number) {
    setRows((prev) => prev.map((r) => (r.itemCode === itemCode ? { ...r, qty: Math.max(0, qty) } : r)))
  }

  function removeRow(itemCode: string) {
    setRows((prev) => prev.filter((r) => r.itemCode !== itemCode))
  }

  async function handlePrint() {
    const sourceIds = rows.flatMap((r) => Array(Math.max(0, Math.round(r.qty))).fill(r.itemCode))
    if (sourceIds.length === 0) {
      toast.error('Agrega al menos un artículo con cantidad mayor a 0')
      return
    }
    setPrinting(true)
    try {
      const renderData = await getRenderDataLabels({ sourceIds })
      const document = renderData.template.document as unknown as TemplateDocument
      // `flushSync` fuerza a React a commitear el nodo oculto de impresión ANTES de seguir —
      // depender de requestAnimationFrame aquí es un bug real: rAF nunca se ejecuta si la
      // pestaña está en background, dejando la impresión sin disparar en silencio.
      flushSync(() => setPrintPayload({ document, labels: renderData.labels.map((l) => l.values) }))
      await printDocument(document)
      onClose()
    } catch (err) {
      const apiErr = err as ApiError
      toast.error(apiErr?.message ?? 'No se pudieron generar las etiquetas')
    } finally {
      setPrinting(false)
    }
  }

  return (
    <>
      <Modal
        open={open}
        onClose={onClose}
        title="Imprimir etiquetas"
        subtitle="Selecciona los artículos y cuántas copias de cada uno quieres imprimir."
        footer={
          <>
            <button className="btn btn-secondary btn-size-sm" onClick={onClose} disabled={printing}>
              Cancelar
            </button>
            <button className="btn btn-primary btn-size-sm" onClick={handlePrint} disabled={printing || rows.length === 0}>
              {printing ? <span className="spinner spinner-white spinner-sm" /> : <><Printer size={14} /> Imprimir</>}
            </button>
          </>
        }
      >
        <div className="ff-wrap">
          <label className="ff-label">Agregar artículo</label>
          <ItemSelect
            value={addQuery}
            onSelect={(item) => addRow(item.id, item.itemName)}
            onClear={() => setAddQuery('')}
            typeFilter="product"
            placeholder="Buscar artículo por código o nombre…"
          />
        </div>

        {rows.length > 0 && (
          <table className="table" style={{ marginTop: 16 }}>
            <thead>
              <tr>
                <th>Artículo</th>
                <th style={{ width: 100, textAlign: 'right' }}>Copias</th>
                <th style={{ width: 32 }} />
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.itemCode}>
                  <td>
                    <div style={{ fontWeight: 500 }}>{row.itemName}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-tertiary)', fontFamily: 'monospace' }}>{row.itemCode}</div>
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    <input
                      type="number"
                      className="ff-input"
                      style={{ width: 70, textAlign: 'right' }}
                      min={0}
                      value={row.qty}
                      onChange={(e) => updateQty(row.itemCode, Number(e.target.value) || 0)}
                    />
                  </td>
                  <td>
                    <button className="btn btn-ghost btn-size-icon-sm" title="Quitar" onClick={() => removeRow(row.itemCode)}>
                      <X size={14} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Modal>

      {printPayload && (
        <TemplateEditorPrintTarget doc={printPayload.document} fields={[]} labels={printPayload.labels} />
      )}
    </>
  )
}
