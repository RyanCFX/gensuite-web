import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { getPagosPendientes } from '@/shared/api/pagos'
import { PageHeader } from '@/components/shared/PageHeader'
import { RecargarButton } from '@/components/shared/RecargarButton'
import { formatDate, formatDOP } from '@/lib/formatters'
import { Search, Wallet } from 'lucide-react'

export default function PendientesPagoPage() {
  const navigate = useNavigate()
  const [search, setSearch] = useState('')
  const [overdueOnly, setOverdueOnly] = useState(false)

  const { data, isLoading } = useQuery({
    queryKey: ['pagos-pendientes', search, overdueOnly],
    queryFn: () => getPagosPendientes({ supplier: search || undefined, overdueOnly: overdueOnly || undefined, limit: 50 }),
  })

  const facturas = data?.items ?? []

  return (
    <div className="page-container">
      <PageHeader
        title={<><span className="page-title-dot" />Facturas Pendientes de Pago</>}
        description="Facturas de compra con saldo pendiente a proveedores"
        action={<RecargarButton />}
      />

      <div className="card filter-card-navy" style={{ marginBottom: 20 }}>
        <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="filter-bar" style={{ margin: 0 }}>
            <div className="filter-bar-left">
              <div className="search-input-wrap">
                <Search size={15} className="search-input-icon" />
                <input
                  className="search-input"
                  placeholder="Buscar por proveedor…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
            </div>
          </div>

          <label className="ff-toggle-wrap">
            <span className="ff-toggle">
              <input
                type="checkbox"
                checked={overdueOnly}
                onChange={(e) => setOverdueOnly(e.target.checked)}
              />
              <span className="ff-toggle-track"><span className="ff-toggle-thumb" /></span>
            </span>
            Solo vencidas
          </label>
        </div>
      </div>

      <div className="card navy-table-card">
        <div className="table-scroll">
          <table className="data-table navy-table">
            <thead>
              <tr>
                <th>Factura</th>
                <th>Proveedor</th>
                <th>Vencimiento</th>
                <th style={{ textAlign: 'right' }}>Total</th>
                <th style={{ textAlign: 'right' }}>Pendiente</th>
                <th style={{ width: 40 }} />
              </tr>
            </thead>
            <tbody>
              {isLoading
                ? Array.from({ length: 8 }).map((_, i) => (
                    <tr key={i}>
                      {Array.from({ length: 6 }).map((__, j) => (
                        <td key={j}>
                          <span className="skeleton-box" style={{ height: 16, width: '100%', display: 'block' }} />
                        </td>
                      ))}
                    </tr>
                  ))
                : facturas.length === 0
                ? (
                    <tr>
                      <td colSpan={6} style={{ textAlign: 'center', padding: '32px 0', color: 'var(--text-tertiary)', fontSize: 13 }}>
                        Sin facturas pendientes de pago
                      </td>
                    </tr>
                  )
                : facturas.map((f) => (
                    <tr key={f.id}>
                      <td>
                        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 500 }}>{f.id}</span>
                      </td>
                      <td>{f.supplierName}</td>
                      <td>
                        {formatDate(f.dueDate)}
                        {f.isOverdue && (
                          <span className="badge badge-error" style={{ marginLeft: 8, fontSize: 10 }}>
                            {f.daysOverdue}d vencida
                          </span>
                        )}
                      </td>
                      <td style={{ textAlign: 'right' }}>{formatDOP(f.grandTotal)}</td>
                      <td style={{ textAlign: 'right', fontWeight: 600, color: f.isOverdue ? 'var(--error-text)' : undefined }}>
                        {formatDOP(f.outstandingAmount)}
                      </td>
                      <td>
                        <button
                          className="btn btn-ghost btn-size-sm"
                          title="Registrar pago"
                          onClick={() =>
                            navigate(`/pagos/nuevo?supplier=${encodeURIComponent(f.supplier)}&invoice=${encodeURIComponent(f.id)}`)
                          }
                        >
                          <Wallet size={14} /> Registrar pago
                        </button>
                      </td>
                    </tr>
                  ))}
            </tbody>
          </table>
        </div>

        {!isLoading && data?.meta && (
          <div className="table-footer">
            <span className="table-footer-count">
              {facturas.length} de {data.meta.total} facturas pendientes
            </span>
          </div>
        )}
      </div>
    </div>
  )
}
