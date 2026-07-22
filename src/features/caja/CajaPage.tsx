import { useState, useCallback, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { listCajaPendientes, cobrarFactura } from '@/shared/api/caja'
import { getFacturacionConfig, listMetodosPago, listDenominaciones } from '@/shared/api/config'
import type { ApiError, CajaPendienteItem } from '@/shared/api/types'
import {
  EMPTY_PAYMENT_LINES_VALUE,
  isPaymentLinesValid,
  buildSubmitPayload,
  type PaymentLinesValue,
} from '@/lib/paymentLines'
import { PaymentLinesEditor } from '@/components/shared/PaymentLinesEditor'
import { SearchSelect } from '@/shared/ui/SearchSelect'
import type { SearchSelectOption } from '@/shared/ui/SearchSelect'
import { useDebounce } from '@/lib/useDebounce'
import { formatDate, formatDOP } from '@/lib/formatters'
import { ChevronLeft, ChevronRight, Search, Wallet, Loader2 } from 'lucide-react'

const PAGE_SIZE = 20

export default function CajaPage() {
  const queryClient = useQueryClient()

  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const debouncedSearch = useDebounce(search, 300)
  const offset = (page - 1) * PAGE_SIZE

  const [target, setTarget] = useState<CajaPendienteItem | null>(null)

  const { data, isLoading, isError } = useQuery({
    queryKey: ['caja-pendientes', { search: debouncedSearch, offset }],
    queryFn: () =>
      listCajaPendientes({
        search: debouncedSearch || undefined,
        limit: PAGE_SIZE,
        offset,
      }),
  })

  const handleSearchChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setSearch(e.target.value)
    setPage(1)
  }, [])

  const totalPages = data ? Math.ceil(data.meta.total / PAGE_SIZE) : 1

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h1 className="page-title">Caja</h1>
          {data && <p className="page-sub">{data.meta.total} facturas pendientes de cobro</p>}
        </div>
      </div>

      <div className="filter-bar">
        <div className="filter-bar-left">
          <div className="search-input-wrap">
            <Search size={15} className="search-input-icon" />
            <input
              className="search-input"
              placeholder="Buscar por cliente, NCF…"
              value={search}
              onChange={handleSearchChange}
            />
          </div>
        </div>
      </div>

      <div className="table-scroll">
        <table className="data-table">
          <thead>
            <tr>
              <th>Cliente</th>
              <th>NCF</th>
              <th>Fecha</th>
              <th style={{ textAlign: 'right' }}>Total</th>
              <th style={{ textAlign: 'right' }}>Pendiente</th>
              <th style={{ width: 100 }} />
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              Array.from({ length: 6 }).map((_, i) => (
                <tr key={i}>
                  {Array.from({ length: 6 }).map((__, j) => (
                    <td key={j}><div className="skeleton-box" style={{ height: 14, width: '100%' }} /></td>
                  ))}
                </tr>
              ))
            ) : isError ? (
              <tr>
                <td colSpan={6} style={{ textAlign: 'center', padding: '32px 0', color: 'var(--color-error)' }}>
                  Error al cargar las facturas pendientes de cobro
                </td>
              </tr>
            ) : data?.items.length === 0 ? (
              <tr>
                <td colSpan={6}>
                  <div className="empty-state">
                    <div className="empty-title">Sin facturas pendientes</div>
                    <p className="empty-sub">Todas las facturas sometidas están cobradas.</p>
                  </div>
                </td>
              </tr>
            ) : (
              data?.items.map((row) => (
                <tr key={row.id}>
                  <td style={{ fontWeight: 500 }}>{row.customerName}</td>
                  <td style={{ fontFamily: 'monospace', fontSize: 12 }}>{row.ncf ?? row.id}</td>
                  <td>{formatDate(row.postingDate)}</td>
                  <td style={{ textAlign: 'right' }}>{formatDOP(row.grandTotal)}</td>
                  <td style={{ textAlign: 'right', fontWeight: 500 }}>{formatDOP(row.outstandingAmount)}</td>
                  <td style={{ textAlign: 'right' }}>
                    <button className="btn btn-primary btn-size-sm" onClick={() => setTarget(row)}>
                      <Wallet size={13} /> Cobrar
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {data && data.meta.total > PAGE_SIZE && (
        <div className="pagination">
          <span className="pagination-info">
            Mostrando {offset + 1}–{Math.min(offset + PAGE_SIZE, data.meta.total)} de {data.meta.total}
          </span>
          <div className="pagination-controls">
            <button
              className="btn btn-ghost btn-size-icon-sm"
              disabled={page === 1}
              onClick={() => setPage((p) => p - 1)}
            >
              <ChevronLeft size={16} />
            </button>
            <span style={{ fontSize: 13 }}>Página {page} de {totalPages}</span>
            <button
              className="btn btn-ghost btn-size-icon-sm"
              disabled={!data.meta.hasMore}
              onClick={() => setPage((p) => p + 1)}
            >
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      )}

      {target && (
        <CobrarFacturaModal
          target={target}
          onClose={() => setTarget(null)}
          onCollected={() => {
            queryClient.invalidateQueries({ queryKey: ['caja-pendientes'] })
            setTarget(null)
          }}
        />
      )}
    </div>
  )
}

function CobrarFacturaModal({
  target,
  onClose,
  onCollected,
}: {
  target: CajaPendienteItem
  onClose: () => void
  onCollected: () => void
}) {
  const { data: facturacionConfig } = useQuery({
    queryKey: ['facturacion-config'],
    queryFn: getFacturacionConfig,
    staleTime: 5 * 60_000,
  })
  // Si la llamada falla o el campo no viene, se trata como "directo" (comportamiento seguro por defecto).
  const flujoCobro = facturacionConfig?.flujoCobro ?? 'directo'

  // ── Flujo "caja": múltiples métodos + vuelto (vía PaymentLinesEditor) ──────
  const [cajaValue, setCajaValue] = useState<PaymentLinesValue>(EMPTY_PAYMENT_LINES_VALUE)
  const { data: metodos } = useQuery({
    queryKey: ['metodos-pago'],
    queryFn: listMetodosPago,
    staleTime: 5 * 60_000,
  })
  const { data: denominaciones } = useQuery({
    queryKey: ['denominaciones'],
    queryFn: listDenominaciones,
    enabled: flujoCobro === 'caja',
    staleTime: 5 * 60_000,
  })

  // ── Flujo "directo": un solo método de pago, sin vuelto ────────────────────
  const [directoMetodo, setDirectoMetodo] = useState('')
  const [directoMetodoSearch, setDirectoMetodoSearch] = useState('')
  const [directoAmount, setDirectoAmount] = useState(target.outstandingAmount)

  const metodosOptions: SearchSelectOption[] = useMemo(() => {
    const q = directoMetodoSearch.toLowerCase()
    return (metodos ?? [])
      .filter((m) => !m.disabled)
      .filter((m) => !q || m.name.toLowerCase().includes(q))
      .map((m) => ({ value: m.name, label: m.name }))
  }, [metodos, directoMetodoSearch])

  const cobrarMutation = useMutation({
    mutationFn: () => {
      if (flujoCobro === 'caja') {
        return cobrarFactura(target.id, buildSubmitPayload(cajaValue))
      }
      return cobrarFactura(target.id, { payments: [{ modeOfPayment: directoMetodo, amount: directoAmount }] })
    },
    onSuccess: (result) => {
      toast.success(
        result.fullyPaid
          ? 'Factura cobrada completamente'
          : `Cobro parcial registrado — queda pendiente ${formatDOP(result.outstandingAmount)}`,
      )
      onCollected()
    },
    onError: (err: ApiError) => {
      toast.error(err?.message ?? 'Error al cobrar la factura')
    },
  })

  const directoValid = !!directoMetodo && directoAmount > 0 && directoAmount <= target.outstandingAmount + 0.01
  const cajaValid = isPaymentLinesValid(cajaValue, target.outstandingAmount, metodos ?? [], denominaciones ?? [])
  const canConfirm = flujoCobro === 'caja' ? cajaValid : directoValid

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box modal-box-lg" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2 className="modal-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Wallet size={16} /> Cobrar factura
          </h2>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: 24,
              padding: '16px 20px',
              borderRadius: 'var(--radius-lg)',
              background: 'var(--surface-sunken)',
              border: '1px solid var(--border-default)',
            }}
          >
            <div className="detail-field">
              <span className="detail-label">Factura</span>
              <span className="detail-value" style={{ fontFamily: 'monospace' }}>{target.ncf ?? target.id}</span>
            </div>
            <div className="detail-field">
              <span className="detail-label">Cliente</span>
              <span className="detail-value">{target.customerName}</span>
            </div>
            <div className="detail-field">
              <span className="detail-label">Pendiente</span>
              <span className="detail-value" style={{ fontWeight: 700, color: 'var(--color-error, var(--error-text))' }}>
                {formatDOP(target.outstandingAmount)}
              </span>
            </div>
          </div>

          {flujoCobro === 'caja' ? (
            <PaymentLinesEditor amountDue={target.outstandingAmount} value={cajaValue} onChange={setCajaValue} />
          ) : (
            <div className="form-section">
              <div className="form-row">
                <div className="ff-wrap">
                  <label className="ff-label ff-required">Método de pago</label>
                  <SearchSelect
                    value={directoMetodo}
                    selectedLabel={directoMetodo}
                    onChange={(val) => setDirectoMetodo(val)}
                    options={metodosOptions}
                    onSearch={setDirectoMetodoSearch}
                    placeholder="Método de pago…"
                  />
                </div>
                <div className="ff-wrap">
                  <label className="ff-label ff-required" htmlFor="directoAmount">Monto a cobrar</label>
                  <input
                    id="directoAmount"
                    className="ff-input"
                    type="number"
                    min="0.01"
                    max={target.outstandingAmount}
                    step="0.01"
                    value={directoAmount || ''}
                    onChange={(e) => setDirectoAmount(parseFloat(e.target.value) || 0)}
                  />
                </div>
              </div>
              <p className="ff-hint">
                Puede ser menor al pendiente — el resto queda disponible para un cobro posterior.
              </p>
            </div>
          )}
        </div>
        <div className="modal-foot">
          <button className="btn btn-secondary" onClick={onClose}>Cancelar</button>
          <button
            className="btn btn-primary"
            onClick={() => cobrarMutation.mutate()}
            disabled={!canConfirm || cobrarMutation.isPending}
          >
            {cobrarMutation.isPending && <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} />}
            <Wallet size={14} /> Confirmar cobro
          </button>
        </div>
      </div>
    </div>
  )
}
