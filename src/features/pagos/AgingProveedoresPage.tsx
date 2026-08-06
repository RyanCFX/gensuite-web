import { useQuery, useMutation } from '@tanstack/react-query'
import { toast } from 'sonner'
import { getAgingProveedores } from '@/shared/api/pagos'
import { downloadCxpAgingPdf } from '@/shared/api/reportes'
import { PageHeader } from '@/components/shared/PageHeader'
import { formatDOP } from '@/lib/formatters'
import { Info, Download, Loader2 } from 'lucide-react'

const DEFAULT_LABELS = ['Corriente', '0–30 días', '31–60 días', '61–90 días', '+90 días']

export default function AgingProveedoresPage() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['aging-proveedores'],
    queryFn: getAgingProveedores,
  })

  const downloadPdfMutation = useMutation({
    mutationFn: downloadCxpAgingPdf,
    onError: () => toast.error('No se pudo descargar el PDF'),
  })

  const AGING_THRESHOLD = 10_000
  const labels = data?.config?.rangos ?? DEFAULT_LABELS
  const rows = data?.rows ?? []

  function agingStyle(amount: number): React.CSSProperties {
    return amount > AGING_THRESHOLD ? { color: 'var(--error-text)', fontWeight: 600 } : {}
  }

  return (
    <div className="page-container">
      <PageHeader
        title="Aging de Cuentas por Pagar"
        description="Análisis de saldos vencidos a proveedores"
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

      {data?.note && (
        <div className="inline-alert inline-alert-info" style={{ marginBottom: 16 }}>
          <Info size={15} />
          <span>{data.note}</span>
        </div>
      )}

      <div>
        <div className="card">
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Proveedor</th>
                  {labels.map((label, i) => (
                    <th key={i} style={{ textAlign: 'right' }}>{label}</th>
                  ))}
                  <th style={{ textAlign: 'right', fontWeight: 700 }}>Total</th>
                </tr>
              </thead>
              <tbody>
                {isLoading
                  ? Array.from({ length: 8 }).map((_, i) => (
                      <tr key={i}>
                        {Array.from({ length: labels.length + 2 }).map((__, j) => (
                          <td key={j}><span className="skeleton-box" style={{ height: 16, width: '100%', display: 'block' }} /></td>
                        ))}
                      </tr>
                    ))
                  : isError
                    ? (
                        <tr>
                          <td colSpan={labels.length + 2} style={{ textAlign: 'center', padding: '32px 0', color: 'var(--error-text)' }}>
                            Error al cargar el aging
                          </td>
                        </tr>
                      )
                    : rows.length === 0
                      ? (
                          <tr>
                            <td colSpan={labels.length + 2}>
                              <div className="empty-state">
                                <p className="empty-title">Sin cuentas por pagar</p>
                                <p className="empty-sub">No hay saldos pendientes a proveedores.</p>
                              </div>
                            </td>
                          </tr>
                        )
                      : rows.map((entry, i) => (
                          <tr key={`${entry.supplier}-${i}`}>
                            <td style={{ fontWeight: 500 }}>{entry.supplierName ?? entry.supplier}</td>
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

        {rows.length > 0 && (
          <div style={{ marginTop: 12, display: 'flex', justifyContent: 'flex-end', fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>
            Total por pagar: {formatDOP(rows.reduce((sum, e) => sum + e.totalOutstanding, 0))}
          </div>
        )}
      </div>
    </div>
  )
}
