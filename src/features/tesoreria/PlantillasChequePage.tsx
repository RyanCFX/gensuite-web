import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Plus, Pencil, CheckCircle2, AlertTriangle } from 'lucide-react'
import { listChequePrintTemplates } from '@/shared/api/tesoreria'
import { PageHeader } from '@/components/shared/PageHeader'

export default function PlantillasChequePage() {
  const navigate = useNavigate()

  const { data, isLoading, isError } = useQuery({
    queryKey: ['tesoreria-cheque-print-templates'],
    queryFn: () => listChequePrintTemplates({ limit: 100 }),
  })

  const plantillas = data?.items ?? []

  return (
    <div className="page-container">
      <PageHeader
        title="Plantillas de Cheque"
        description="Coordenadas para imprimir cheques sobre el papel pre-impreso de un talonario, usando el motor nativo de ERPNext"
        action={
          <button className="btn btn-primary" onClick={() => navigate('/config/tesoreria/plantillas-cheque/nueva')}>
            <Plus size={16} />
            Nueva Plantilla
          </button>
        }
      />

      <div className="inline-alert inline-alert-warn" style={{ marginBottom: 16 }}>
        <p style={{ margin: 0, fontSize: 13 }}>
          La generación de PDF con el motor nativo de ERPNext puede fallar por un problema de
          infraestructura conocido (resolución de assets del lado de ERPNext) — no está confirmado
          que funcione en producción. Si falla al imprimir un cheque, el mensaje de error lo
          indicará explícitamente.
        </p>
      </div>

      <div className="card">
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>Nombre</th>
                <th>Tamaño</th>
                <th>Print Format</th>
                <th style={{ width: 48 }} />
              </tr>
            </thead>
            <tbody>
              {isLoading
                ? Array.from({ length: 4 }).map((_, i) => (
                    <tr key={i}>
                      {Array.from({ length: 4 }).map((__, j) => (
                        <td key={j}><div className="skeleton-box" style={{ height: 14, width: '100%' }} /></td>
                      ))}
                    </tr>
                  ))
                : isError
                  ? (
                      <tr>
                        <td colSpan={4} style={{ textAlign: 'center', padding: '32px 0', color: 'var(--color-error)' }}>
                          Error al cargar las plantillas
                        </td>
                      </tr>
                    )
                  : plantillas.length === 0
                    ? (
                        <tr>
                          <td colSpan={4}>
                            <div className="empty-state">
                              <p className="empty-title">Sin plantillas de cheque</p>
                              <p className="empty-sub">Crea la primera plantilla para imprimir cheques con coordenadas exactas.</p>
                            </div>
                          </td>
                        </tr>
                      )
                    : plantillas.map((p) => (
                        <tr key={p.bankName}>
                          <td style={{ fontWeight: 500 }}>{p.bankName}</td>
                          <td className="td-muted">{p.chequeSize ?? 'Regular'}</td>
                          <td>
                            {p.hasPrintFormat
                              ? <span className="badge badge-success" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><CheckCircle2 size={12} /> Generado</span>
                              : <span className="badge badge-muted" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><AlertTriangle size={12} /> Sin generar</span>}
                          </td>
                          <td onClick={(e) => e.stopPropagation()} className="actions-cell">
                            <button
                              className="btn btn-ghost btn-size-icon-sm"
                              onClick={() => navigate(`/config/tesoreria/plantillas-cheque/${encodeURIComponent(p.bankName)}`)}
                            >
                              <Pencil size={14} />
                            </button>
                          </td>
                        </tr>
                      ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
