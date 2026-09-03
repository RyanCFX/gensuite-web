// Enlace manual (caso excepcional) a una Orden de Compra desde un documento en blanco — el
// usuario arrancó una Compra o Recepción sin recordar que ya existía una orden. El camino normal
// y recomendado sigue siendo POST /compras/ordenes/:id/recibir y /:id/facturar (§2.4/§2.5), que
// generan el conduce/factura ya enlazados automáticamente — este modal es solo para el caso de
// que el usuario ya esté parado en un formulario en blanco y quiera traer los pendientes de una
// orden existente.

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { toast } from 'sonner'
import { getOrdenCompra, listOrdenesCompra } from '@/shared/api/ordenes-compra'
import { formatDOP } from '@/lib/formatters'
import { SearchSelect } from '@/shared/ui/SearchSelect'
import type { SearchSelectOption } from '@/shared/ui/SearchSelect'
import { QtyInput } from '@/shared/ui/QtyInput'
import { AlertTriangle } from 'lucide-react'

export interface OrdenCompraImportLine {
  itemCode: string
  description?: string
  qty: number
  rate: number
  uom?: string
  warehouse?: string
  ordenCompra: string
  ordenCompraItem: string
}

interface Props {
  open: boolean
  onClose: () => void
  /** 'compra' = Compras (factura directa, update_stock=1) — el backend rechaza el enlace si la
   *  orden ya tiene perReceived > 0. 'recepcion' = Recepción de Mercancía — sin ese guard. */
  mode: 'compra' | 'recepcion'
  onImport: (lines: OrdenCompraImportLine[], orden: { id: string; supplier: string; supplierName: string }) => void
}

interface RemanenteLine {
  ordenCompraItem: string
  itemCode: string
  itemName?: string
  uom?: string
  warehouse?: string
  remanente: number
  rate: number
  checked: boolean
  qty: number
}

export function SeleccionarOrdenCompraModal({ open, onClose, mode, onImport }: Props) {
  const [ordenId, setOrdenId] = useState('')
  const [ordenSearch, setOrdenSearch] = useState('')
  const [lines, setLines] = useState<RemanenteLine[]>([])

  const { data: ordenesData, isLoading: ordenesLoading } = useQuery({
    queryKey: ['ordenes-compra-para-enlazar', mode, ordenSearch],
    queryFn: () =>
      listOrdenesCompra({
        search: ordenSearch || undefined,
        status: 'submitted',
        receiptStatus: mode === 'recepcion' ? 'pending' : undefined,
        billingStatus: mode === 'compra' ? 'pending' : undefined,
        limit: 20,
      }),
    enabled: open,
  })
  const ordenOptions: SearchSelectOption[] = (ordenesData?.items ?? []).map((o) => ({
    value: o.id,
    label: o.id,
    sublabel: o.supplierName,
  }))

  const { data: orden, isLoading: ordenLoading } = useQuery({
    queryKey: ['orden-compra', ordenId],
    queryFn: () => getOrdenCompra(ordenId),
    enabled: open && !!ordenId,
  })

  // Reinicia las líneas cada vez que se resuelve una orden distinta.
  const [loadedFor, setLoadedFor] = useState('')
  if (orden && orden.id !== loadedFor) {
    setLoadedFor(orden.id)
    setLines(
      orden.items
        .map((it) => {
          const remanente = mode === 'recepcion'
            ? it.qty - it.receivedQty
            : it.rate > 0 ? Math.max(0, (it.amount - it.billedAmt) / it.rate) : it.qty
          return {
            ordenCompraItem: it.id,
            itemCode: it.itemCode,
            itemName: it.itemName,
            uom: it.uom,
            warehouse: it.warehouse,
            remanente: Math.round(remanente * 1000) / 1000,
            rate: it.rate,
            checked: false,
            qty: Math.round(remanente * 1000) / 1000,
          }
        })
        .filter((l) => l.remanente > 0),
    )
  }

  const bloqueadaPorRecepcion = mode === 'compra' && (orden?.perReceived ?? 0) > 0

  function toggleLine(idx: number) {
    setLines((prev) => prev.map((l, i) => (i === idx ? { ...l, checked: !l.checked } : l)))
  }

  function updateQty(idx: number, qty: number) {
    setLines((prev) => prev.map((l, i) => (i === idx ? { ...l, qty: Math.min(Math.max(qty, 0), l.remanente) } : l)))
  }

  function handleClose() {
    setOrdenId('')
    setLoadedFor('')
    setLines([])
    onClose()
  }

  function handleImport() {
    const checked = lines.filter((l) => l.checked && l.qty > 0)
    if (checked.length === 0) {
      toast.error('Selecciona al menos un artículo con cantidad mayor a cero')
      return
    }
    onImport(
      checked.map((l) => ({
        itemCode: l.itemCode,
        description: l.itemName,
        qty: l.qty,
        rate: l.rate,
        uom: l.uom,
        warehouse: l.warehouse,
        ordenCompra: ordenId,
        ordenCompraItem: l.ordenCompraItem,
      })),
      { id: ordenId, supplier: orden!.supplier, supplierName: orden!.supplierName },
    )
    handleClose()
  }

  if (!open) return null

  return (
    <div className="modal-overlay" onClick={handleClose}>
      <div className="modal-box" style={{ maxWidth: 680 }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2 className="modal-title">Enlazar Orden de Compra</h2>
          <button className="modal-close" onClick={handleClose}>×</button>
        </div>
        <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 16, maxHeight: '70vh', overflowY: 'auto' }}>
          <p style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
            Caso excepcional — si ya sabías que había una orden, lo normal es {mode === 'compra' ? 'facturarla' : 'recibirla'} directamente
            desde su propio detalle (Órdenes de Compra). Usa esto solo para traer los pendientes de una orden a este documento en blanco.
          </p>

          <div className="ff-wrap">
            <label className="ff-label">Orden de Compra</label>
            <SearchSelect
              value={ordenId}
              onChange={(val) => setOrdenId(val)}
              options={ordenOptions}
              onSearch={setOrdenSearch}
              loading={ordenesLoading}
              selectedLabel={ordenId}
              placeholder="Buscar por número o proveedor…"
            />
          </div>

          {ordenId && ordenLoading && (
            <span className="skeleton-box" style={{ height: 96, width: '100%', display: 'block' }} />
          )}

          {orden && (
            <>
              {bloqueadaPorRecepcion && (
                <div className="inline-alert inline-alert-error" style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                  <AlertTriangle size={16} style={{ flexShrink: 0, marginTop: 2 }} />
                  <span>
                    Esta orden ya tiene mercancía recibida por conduce ({Math.round(orden.perReceived)}% recibido) — facturarla aquí
                    duplicaría ese inventario. Usa <strong>Facturar</strong> desde el detalle de la Recepción, o desde el detalle de esta
                    Orden de Compra, en su lugar.
                  </span>
                </div>
              )}

              {!bloqueadaPorRecepcion && lines.length === 0 && (
                <p style={{ fontSize: 13, color: 'var(--text-tertiary)', textAlign: 'center', padding: '16px 0' }}>
                  Esta orden no tiene remanente {mode === 'recepcion' ? 'por recibir' : 'por facturar'}.
                </p>
              )}

              {!bloqueadaPorRecepcion && lines.length > 0 && (
                <table className="items-table">
                  <thead>
                    <tr>
                      <th style={{ width: 32 }} />
                      <th>Artículo</th>
                      <th style={{ width: '16%', textAlign: 'right' }}>Remanente</th>
                      <th style={{ width: '18%', textAlign: 'right' }}>Cantidad</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lines.map((line, idx) => (
                      <tr key={line.ordenCompraItem} style={{ opacity: line.checked ? 1 : 0.7 }}>
                        <td style={{ textAlign: 'center' }}>
                          <input type="checkbox" checked={line.checked} onChange={() => toggleLine(idx)} />
                        </td>
                        <td>
                          <div style={{ fontWeight: 500 }}>{line.itemName ?? line.itemCode}</div>
                          <div style={{ fontSize: 11, color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)' }}>{line.itemCode}</div>
                        </td>
                        <td style={{ textAlign: 'right' }}>{line.remanente} {line.uom}</td>
                        <td>
                          <QtyInput
                            className="items-input"
                            style={{ textAlign: 'right' }}
                            max={line.remanente}
                            uom={line.uom}
                            value={line.qty}
                            disabled={!line.checked}
                            onChange={(v) => updateQty(idx, v)}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}

              {mode === 'compra' && !bloqueadaPorRecepcion && lines.length > 0 && (
                <p style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
                  El remanente se estima a partir de lo ya facturado ({formatDOP(orden.items.reduce((s, i) => s + i.billedAmt, 0))} de {formatDOP(orden.grandTotal)}).
                </p>
              )}
            </>
          )}
        </div>
        <div className="modal-foot">
          <button className="btn btn-secondary" onClick={handleClose}>Cancelar</button>
          <button
            className="btn btn-primary"
            onClick={handleImport}
            disabled={!orden || bloqueadaPorRecepcion || lines.length === 0}
          >
            Traer Artículos
          </button>
        </div>
      </div>
    </div>
  )
}
