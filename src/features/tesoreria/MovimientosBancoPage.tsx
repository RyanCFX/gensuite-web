import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Search, ChevronLeft, ChevronRight } from 'lucide-react'
import { getMovimientos, getResumenMovimientos } from '@/shared/api/tesoreria'
import { CuentaBancariaSelect } from './components/CuentaBancariaSelect'
import { formatDate, formatDOP } from '@/lib/formatters'
import { DatePicker } from '@/shared/ui/DatePicker'
import { FilterField } from '@/shared/ui/FilterField'
import { PageHeader } from '@/components/shared/PageHeader'

const PAGE_SIZE = 30

// Mismo criterio que el kardex de cuentas contables (CuentaMovimientosModal): reutilizar las
// pantallas de detalle ya existentes de cada módulo en vez de intentar adivinar si un Payment
// Entry / Journal Entry nació específicamente en Tesorería — la entidad es la misma sin importar
// desde qué módulo se creó, así que estas rutas ya resuelven el documento correctamente.
function voucherLink(voucherType: string, voucherNo: string): string | null {
  switch (voucherType) {
    case 'Sales Invoice':    return `/facturas/${voucherNo}`
    case 'Purchase Invoice': return `/compras/${voucherNo}`
    case 'Payment Entry':    return `/cobros/${voucherNo}`
    case 'Journal Entry':    return `/asientos/${voucherNo}`
    default:                  return null
  }
}

function firstOfMonth(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
}

function today(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export default function MovimientosBancoPage() {
  const navigate = useNavigate()
  const [cuentaBancaria, setCuentaBancaria] = useState('')
  const [fromDate, setFromDate] = useState(firstOfMonth())
  const [toDate, setToDate] = useState(today())
  const [appliedRange, setAppliedRange] = useState({ fromDate: firstOfMonth(), toDate: today() })
  const [page, setPage] = useState(1)
  const offset = (page - 1) * PAGE_SIZE

  const { data, isLoading } = useQuery({
    queryKey: ['tesoreria-movimientos', cuentaBancaria, appliedRange, offset],
    queryFn: () => getMovimientos({ cuentaBancaria, ...appliedRange, limit: PAGE_SIZE, offset }),
    enabled: !!cuentaBancaria,
  })

  const { data: resumen, isLoading: isResumenLoading } = useQuery({
    queryKey: ['tesoreria-movimientos-resumen', cuentaBancaria, appliedRange],
    queryFn: () => getResumenMovimientos({ cuentaBancaria, ...appliedRange }),
    enabled: !!cuentaBancaria,
  })

  function handleBuscar() {
    setAppliedRange({ fromDate, toDate })
    setPage(1)
  }

  const rows = data?.items ?? []
  const meta = data?.meta
  const totalPages = meta ? Math.ceil(meta.total / PAGE_SIZE) : 1

  return (
    <div className="page-container">
      <PageHeader
        title="Movimientos Bancarios"
        description="Estado de cuenta / kardex con saldo corrido — se alimenta de todo lo que afecta la cuenta, no solo lo registrado desde Tesorería"
      />

      <div className="filter-bar">
        <div className="filter-bar-left" style={{ flexWrap: 'wrap', gap: 10 }}>
          <FilterField label="Cuenta bancaria" style={{ minWidth: 260 }}>
            <CuentaBancariaSelect
              value={cuentaBancaria}
              onChange={(id) => { setCuentaBancaria(id); setPage(1) }}
              placeholder="Selecciona una cuenta bancaria…"
            />
          </FilterField>
          <FilterField label="Desde">
            <DatePicker className="ff-input" value={fromDate} onChange={setFromDate} clearable />
          </FilterField>
          <FilterField label="Hasta">
            <DatePicker className="ff-input" value={toDate} onChange={setToDate} clearable />
          </FilterField>
          <button className="btn btn-primary btn-size-sm" onClick={handleBuscar} disabled={!cuentaBancaria}>
            <Search size={13} /> Buscar
          </button>
        </div>
      </div>

      {!cuentaBancaria ? (
        <div className="card">
          <div className="empty-state" style={{ padding: '48px 0' }}>
            <p className="empty-title">Selecciona una cuenta bancaria</p>
            <p className="empty-sub">Elige una cuenta arriba para ver sus movimientos y saldo corrido.</p>
          </div>
        </div>
      ) : (
        <>
          <div className="card" style={{ marginBottom: 16 }}>
            <div className="card-body" style={{ display: 'flex', gap: 32, flexWrap: 'wrap' }}>
              {isResumenLoading || !resumen ? (
                Array.from({ length: 4 }).map((_, i) => (
                  <span key={i} className="skeleton-box" style={{ height: 40, width: 140 }} />
                ))
              ) : (
                <>
                  <div className="detail-field">
                    <span className="detail-label">Saldo inicial</span>
                    <span className="detail-value" style={{ fontSize: 16, fontWeight: 600 }}>{formatDOP(resumen.saldoInicial)}</span>
                  </div>
                  <div className="detail-field">
                    <span className="detail-label">Entradas</span>
                    <span style={{ fontSize: 16, fontWeight: 600, color: 'var(--success-text)' }}>{formatDOP(resumen.entradas)}</span>
                  </div>
                  <div className="detail-field">
                    <span className="detail-label">Salidas</span>
                    <span style={{ fontSize: 16, fontWeight: 600, color: 'var(--error-text)' }}>{formatDOP(resumen.salidas)}</span>
                  </div>
                  <div className="detail-field">
                    <span className="detail-label">Saldo final</span>
                    <span style={{ fontSize: 18, fontWeight: 700 }}>{formatDOP(resumen.saldoFinal)}</span>
                  </div>
                </>
              )}
            </div>
          </div>

          <div className="card">
            <div className="table-scroll">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Fecha</th>
                    <th>Tipo</th>
                    <th>Documento</th>
                    <th>Referencia</th>
                    <th style={{ textAlign: 'right' }}>Débito</th>
                    <th style={{ textAlign: 'right' }}>Crédito</th>
                    <th style={{ textAlign: 'right' }}>Saldo corrido</th>
                  </tr>
                </thead>
                <tbody>
                  {isLoading ? (
                    Array.from({ length: 8 }).map((_, i) => (
                      <tr key={i}>
                        {Array.from({ length: 7 }).map((__, j) => (
                          <td key={j}><div className="skeleton-box" style={{ height: 14, width: '100%' }} /></td>
                        ))}
                      </tr>
                    ))
                  ) : (
                    <>
                      {meta && (
                        <tr style={{ background: 'var(--surface-subtle, rgba(0,0,0,0.02))' }}>
                          <td colSpan={6} style={{ fontStyle: 'italic', color: 'var(--text-secondary)', fontSize: 12 }}>
                            Saldo inicial al {formatDate(appliedRange.fromDate)}
                          </td>
                          <td style={{ textAlign: 'right', fontFamily: 'monospace', fontWeight: 600, fontSize: 12 }}>
                            {formatDOP(meta.saldoInicialDelRango)}
                          </td>
                        </tr>
                      )}
                      {rows.length === 0 ? (
                        <tr>
                          <td colSpan={7}>
                            <div className="empty-state" style={{ padding: '24px 0' }}>
                              <p className="empty-title">Sin movimientos</p>
                              <p className="empty-sub">No se encontraron registros para el período seleccionado</p>
                            </div>
                          </td>
                        </tr>
                      ) : (
                        rows.map((row, i) => {
                          const link = voucherLink(row.voucherType, row.voucherNo)
                          const balanceColor = row.saldoCorrido > 0
                            ? 'var(--success-text)'
                            : row.saldoCorrido < 0 ? 'var(--error-text)' : undefined
                          return (
                            <tr key={i}>
                              <td className="td-muted" style={{ fontSize: 12 }}>{formatDate(row.fecha)}</td>
                              <td className="td-muted" style={{ fontSize: 12 }}>{row.voucherType}</td>
                              <td>
                                {link
                                  ? (
                                      <button
                                        className="btn btn-ghost btn-size-sm"
                                        style={{ padding: '0 4px', fontSize: 12 }}
                                        onClick={() => navigate(link)}
                                      >
                                        {row.voucherNo}
                                      </button>
                                    )
                                  : <span style={{ fontSize: 12 }}>{row.voucherNo}</span>}
                              </td>
                              <td className="td-muted" style={{ fontSize: 12 }}>{row.party ?? row.remarks ?? '—'}</td>
                              <td style={{ textAlign: 'right', fontFamily: 'monospace', fontSize: 12 }}>
                                {row.debito ? formatDOP(row.debito) : '—'}
                              </td>
                              <td style={{ textAlign: 'right', fontFamily: 'monospace', fontSize: 12 }}>
                                {row.credito ? formatDOP(row.credito) : '—'}
                              </td>
                              <td style={{ textAlign: 'right', fontFamily: 'monospace', fontSize: 12, color: balanceColor }}>
                                {formatDOP(row.saldoCorrido)}
                              </td>
                            </tr>
                          )
                        })
                      )}
                    </>
                  )}
                </tbody>
              </table>
            </div>

            {meta && meta.total > PAGE_SIZE && (
              <div className="pagination">
                <span className="pagination-info">
                  Mostrando {offset + 1}–{Math.min(offset + PAGE_SIZE, meta.total)} de {meta.total}
                </span>
                <div className="pagination-controls">
                  <button className="btn btn-ghost btn-size-icon-sm" disabled={page === 1} onClick={() => setPage((p) => p - 1)}>
                    <ChevronLeft size={14} />
                  </button>
                  <span style={{ fontSize: 12, color: 'var(--text-secondary)', padding: '0 8px' }}>
                    {page} / {totalPages}
                  </span>
                  <button className="btn btn-ghost btn-size-icon-sm" disabled={!meta.hasMore} onClick={() => setPage((p) => p + 1)}>
                    <ChevronRight size={14} />
                  </button>
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
