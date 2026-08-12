import { useQuery, useMutation } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Download, Loader2 } from 'lucide-react'
import { getAging } from '@/shared/api/cobros'
import { downloadCxcAgingPdf } from '@/shared/api/reportes'
import { PageHeader } from '@/components/shared/PageHeader'
import { formatDOP } from '@/lib/formatters'

export default function AgingPage() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['aging'],
    queryFn: getAging,
  })

  const downloadPdfMutation = useMutation({
    mutationFn: downloadCxcAgingPdf,
    onError: () => toast.error('No se pudo descargar el PDF'),
  })

  const AGING_THRESHOLD = 10_000

  function agingStyle(amount: number): React.CSSProperties {
    return amount > AGING_THRESHOLD
      ? { color: 'var(--error-text)', fontWeight: 600 }
      : {}
  }

  return (
    <div className="page-container">
      <PageHeader
        title="Antiguedad de saldos por Cobrar"
        description="Análisis de saldos vencidos por cliente"
        action={
          <button
            className="btn btn-secondary btn-size-sm"
            onClick={() => downloadPdfMutation.mutate()}
            disabled={downloadPdfMutation.isPending}
          >
            {downloadPdfMutation.isPending ? <Loader2 size={13} className="spin" /> : <Download size={13} aria-hidden="true" />}
            {' '}Descargar PDF
          </button>
        }
      />

      <div>
        <div className="card">
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Cliente</th>
                  <th style={{ textAlign: 'right' }}>Corriente</th>
                  <th style={{ textAlign: 'right' }}>0–30 días</th>
                  <th style={{ textAlign: 'right' }}>31–60 días</th>
                  <th style={{ textAlign: 'right' }}>61–90 días</th>
                  <th style={{ textAlign: 'right' }}>+90 días</th>
                  <th style={{ textAlign: 'right', fontWeight: 700 }}>Total</th>
                </tr>
              </thead>
              <tbody>
                {isLoading
                  ? Array.from({ length: 8 }).map((_, i) => (
                      <tr key={i}>
                        {Array.from({ length: 7 }).map((__, j) => (
                          <td key={j}><span className="skeleton-box" style={{ height: 16, width: '100%', display: 'block' }} /></td>
                        ))}
                      </tr>
                    ))
                  : isError
                    ? (
                        <tr>
                          <td colSpan={7} style={{ textAlign: 'center', padding: '32px 0', color: 'var(--error-text)' }}>
                            Error al cargar el aging
                          </td>
                        </tr>
                      )
                    : !data || data.length === 0
                      ? (
                          <tr>
                            <td colSpan={7}>
                              <div className="empty-state">
                                <p className="empty-title">Sin cuentas por cobrar</p>
                                <p className="empty-sub">No hay saldos pendientes de cobro.</p>
                              </div>
                            </td>
                          </tr>
                        )
                      : data.map((entry) => (
                          <tr key={entry.customer}>
                            <td style={{ fontWeight: 500 }}>{entry.customer}</td>
                            <td style={{ textAlign: 'right' }}>{formatDOP(entry.current)}</td>
                            <td style={{ textAlign: 'right', ...agingStyle(entry.range1) }}>{formatDOP(entry.range1)}</td>
                            <td style={{ textAlign: 'right', ...agingStyle(entry.range2) }}>{formatDOP(entry.range2)}</td>
                            <td style={{ textAlign: 'right', ...agingStyle(entry.range3) }}>{formatDOP(entry.range3)}</td>
                            <td style={{ textAlign: 'right', ...agingStyle(entry.range4) }}>{formatDOP(entry.range4)}</td>
                            <td style={{ textAlign: 'right', fontWeight: 700 }}>{formatDOP(entry.totalOutstanding)}</td>
                          </tr>
                        ))}
              </tbody>
            </table>
          </div>
        </div>

        {data && data.length > 0 && (
          <div style={{ marginTop: 12, display: 'flex', justifyContent: 'flex-end', fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>
            Total por cobrar: {formatDOP(data.reduce((sum, e) => sum + e.totalOutstanding, 0))}
          </div>
        )}
      </div>
    </div>
  )
}
