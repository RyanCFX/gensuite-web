import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ShieldOff, ChevronLeft, ChevronRight, CheckCircle2, XCircle } from 'lucide-react'
import { PageHeader } from '@/components/shared/PageHeader'
import { listAdminPinLog } from '@/shared/api/auth'
import { formatDateTime } from '@/lib/formatters'
import { useAuthStore } from '@/stores/auth.store'

const PAGE_SIZE = 30

const ACCION_LABELS: Record<string, string> = {
  override_descuento: 'Override de descuento',
  cambiar_clasificacion_cliente: 'Cambiar clasificación de cliente',
}

export default function AdminPinLogPage() {
  const roles = useAuthStore((s) => s.user?.roles) ?? []
  const canView = roles.includes('System Manager') || roles.includes('Auditor')
  const [page, setPage] = useState(1)
  const offset = (page - 1) * PAGE_SIZE

  const { data, isLoading, isError } = useQuery({
    queryKey: ['admin-pin-log', offset],
    queryFn: () => listAdminPinLog({ limit: PAGE_SIZE, offset }),
    enabled: canView,
  })

  if (!canView) {
    return (
      <div className="page-container">
        <PageHeader title="Auditoría de PIN" description="Bitácora de autorizaciones con PIN de administrador" />
        <div className="empty-state">
          <span className="empty-icon"><ShieldOff size={20} /></span>
          <p className="empty-title">Acceso restringido</p>
          <p className="empty-sub">Esta sección requiere el rol System Manager o Auditor.</p>
        </div>
      </div>
    )
  }

  const rows = data?.items ?? []
  const meta = data?.meta
  const totalPages = meta ? Math.ceil(meta.total / PAGE_SIZE) : 1

  return (
    <div className="page-container">
      <PageHeader
        title="Auditoría de PIN"
        description="Cada intento de autorización con PIN de administrador (override de descuento, etc.) — éxito o fallo, quién lo pidió y quién autorizó"
      />

      <div className="card">
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Acción</th>
                <th>Solicitado por</th>
                <th>Autorizado por</th>
                <th>Resultado</th>
                <th>Motivo</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                Array.from({ length: 8 }).map((_, i) => (
                  <tr key={i}>
                    {Array.from({ length: 6 }).map((__, j) => (
                      <td key={j}><div className="skeleton-box" style={{ height: 14, width: '100%' }} /></td>
                    ))}
                  </tr>
                ))
              ) : isError ? (
                <tr>
                  <td colSpan={6} style={{ textAlign: 'center', padding: '32px 0', color: 'var(--error-text)' }}>
                    Error al cargar la bitácora
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={6}>
                    <div className="empty-state" style={{ padding: '24px 0' }}>
                      <p className="empty-title">Sin registros</p>
                      <p className="empty-sub">Todavía no se ha usado el PIN de administrador para autorizar nada.</p>
                    </div>
                  </td>
                </tr>
              ) : (
                rows.map((row) => (
                  <tr key={row.id}>
                    <td className="td-muted" style={{ fontSize: 12 }}>{formatDateTime(row.fecha)}</td>
                    <td style={{ fontSize: 12 }}>{ACCION_LABELS[row.accion] ?? row.accion}</td>
                    <td style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>{row.solicitadoPor ?? '—'}</td>
                    <td style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>{row.autorizadoPor ?? '—'}</td>
                    <td>
                      {row.exito
                        ? <span className="badge badge-success" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><CheckCircle2 size={12} /> Autorizado</span>
                        : <span className="badge badge-error" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><XCircle size={12} /> Rechazado</span>}
                    </td>
                    <td className="td-muted" style={{ fontSize: 12 }}>{row.motivo ?? '—'}</td>
                  </tr>
                ))
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
    </div>
  )
}
