import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { listCompras } from '@/shared/api/compras-gastos'
import { applyDevolucionToCxp } from '@/shared/api/devoluciones-compras'
import { Search } from 'lucide-react'
import { formatDOP, formatDate } from '@/lib/formatters'
import { StatusBadge } from '@/components/shared/StatusBadge'

export interface ApplyToCxpModalProps {
  devolucionId: string
  supplier: string
  supplierName?: string
  availableAmount: number
  onClose: () => void
  onSuccess: () => void
}

export function ApplyToCxpModal({ devolucionId, supplier, supplierName, availableAmount, onClose, onSuccess }: ApplyToCxpModalProps) {
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [invoiceId, setInvoiceId] = useState<string>('')
  const [amount, setAmount] = useState<string>('')

  const { data, isLoading } = useQuery({
    queryKey: ['compras-by-supplier', supplier],
    queryFn: () => listCompras({ supplier, status: undefined, limit: 50 }),
    enabled: !!supplier,
    staleTime: 30_000,
  })

  const invoices = (data?.items ?? []).filter((c) => c.status !== 'cancelled')
  const filtered = search
    ? invoices.filter((c) =>
        `${c.id} ${c.billNo ?? ''} ${c.ncfProveedor ?? ''}`.toLowerCase().includes(search.toLowerCase()),
      )
     : invoices
  const maxApply = availableAmount

  const aplicarMutation = useMutation({
    mutationFn: () =>
      applyDevolucionToCxp(devolucionId, {
        invoiceId,
        amount: amount ? Number(amount) : undefined,
      }),
    onSuccess: () => {
      toast.success('Saldo aplicado a la CxP')
      queryClient.invalidateQueries({ queryKey: ['devolucion', devolucionId] })
      queryClient.invalidateQueries({ queryKey: ['devoluciones-saldo-favor', supplier] })
      onSuccess()
    },
    onError: (err: { message?: string; code?: string }) => {
      const code = (err as { code?: string })?.code
      if (code === 'CONFLICT') {
        toast.error('Esta devolución ya está aplicada a esa factura. Revisa la sección "Aplicado a" y revierte si es necesario.')
      } else {
        toast.error(err?.message ?? 'No se pudo aplicar el saldo a la CxP')
      }
    },
  })

  function handleApply() {
    if (!invoiceId) return toast.error('Selecciona una factura de compra')
    aplicarMutation.mutate()
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box modal-box-lg" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2 className="modal-title">Aplicar saldo a CxP</h2>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>

        <div className="modal-body" style={{ maxHeight: 420, overflowY: 'auto' }}>
          <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 12 }}>
            Proveedor: <strong>{supplierName ?? supplier}</strong> — Disponible: <strong>{formatDOP(availableAmount)}</strong>
          </p>

          <div className="search-input-wrap" style={{ marginBottom: 8 }}>
            <Search size={14} className="search-input-icon" />
            <input
              className="search-input"
              placeholder="Buscar factura (NCF, # factura)…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          {isLoading ? (
            <p style={{ fontSize: 13, color: 'var(--text-tertiary)' }}>Cargando facturas del proveedor…</p>
          ) : filtered.length === 0 ? (
            <p style={{ fontSize: 13, color: 'var(--text-tertiary)' }}>No hay facturas de compra para este proveedor.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {filtered.map((c) => {
                const outstanding = c.outstandingAmount ?? 0
                const canUse = outstanding > 0
                return (
                  <label
                    key={c.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                      padding: '8px 10px',
                      border: '1px solid var(--border-default)',
                      borderRadius: 6,
                      cursor: canUse ? 'pointer' : 'not-allowed',
                      opacity: canUse ? 1 : 0.5,
                    }}
                    onClick={(e) => {
                      if (!canUse) { e.preventDefault(); return }
                      setInvoiceId(c.id)
                      const defaultAmt = Math.min(maxApply, Math.abs(outstanding))
                      setAmount(defaultAmt ? String(defaultAmt) : '')
                    }}
                  >
                    <input
                      type="radio"
                      name="invoice"
                      checked={invoiceId === c.id}
                      onChange={() => {}}
                      disabled={!canUse}
                    />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>{c.id}</span>
                        <span className="td-muted" style={{ fontFamily: 'var(--font-mono)', fontSize: 11 }}>{c.ncfProveedor ?? '—'}</span>
                        <StatusBadge status={c.status} dot />
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>
                        {formatDate(c.postingDate)} · Total {formatDOP(c.grandTotal)} · Pendiente {formatDOP(Math.abs(outstanding))}
                      </div>
                    </div>
                  </label>
                )
              })}
            </div>
          )}
        </div>

        <div className="modal-foot" style={{ gap: 8, alignItems: 'center' }}>
          <label style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
            Monto a aplicar
            <input
              type="number"
              className="ff-input ff-input-sm"
              style={{ width: 120, marginLeft: 8 }}
              min={0}
              max={maxApply}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00"
            />
          </label>
          <div style={{ flex: 1 }} />
          <button className="btn btn-secondary btn-size-sm" onClick={onClose}>Cancelar</button>
          <button
            className="btn btn-primary btn-size-sm"
            onClick={handleApply}
            disabled={aplicarMutation.isPending || !invoiceId}
          >
            {aplicarMutation.isPending ? 'Aplicando…' : 'Aplicar'}
          </button>
        </div>
      </div>
    </div>
  )
}
