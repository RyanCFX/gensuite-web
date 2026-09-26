import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ShieldOff, ChevronLeft, ChevronRight, CheckCircle2, XCircle } from 'lucide-react'
import { PageHeader } from '@/components/shared/PageHeader'
import { RecargarButton } from '@/components/shared/RecargarButton'
import { listAdminPinLog } from '@/shared/api/auth'
import { formatDateTime } from '@/lib/formatters'
import { usePermissionsStore } from '@/stores/permissions.store'
import { useResizableColumns } from '@/shared/hooks/useResizableColumns'

const PAGE_SIZE = 30

const ADMIN_PIN_LOG_COLUMNS = [
  { key: 'fecha', width: 130 },
  { key: 'accion', width: 200 },
  { key: 'solicitadoPor', width: 140 },
  { key: 'autorizadoPor', width: 140 },
  { key: 'resultado', width: 110 },
  { key: 'motivo', width: 220 },
]

const ACCION_LABELS: Record<string, string> = {
  override_descuento: 'Override de descuento',
  cambiar_clasificacion_cliente: 'Cambiar clasificación de cliente',
}

export default function AdminPinLogPage() {
  const roles = usePermissionsStore((s) => s.roles)
  const canView = roles.includes('System Manager') || roles.includes('Auditor')
  const [page, setPage] = useState(1)
  const offset = (page - 1) * PAGE_SIZE
  const { widths: colWidths, startResize } = useResizableColumns(ADMIN_PIN_LOG_COLUMNS)

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
        title={<><span className="page-title-dot" />Auditoría de PIN</>}
        description="Cada intento de autorización con PIN de administrador (override de descuento, etc.) — éxito o fallo, quién lo pidió y quién autorizó"
        action={<RecargarButton />}
      />

      <div className="card navy-table-card">
        <div className="table-scroll">
          <table className="data-table navy-table items-table-resizable">
            <colgroup>
              {ADMIN_PIN_LOG_COLUMNS.map((c) => <col key={c.key} style={{ width: colWidths[c.key] }} />)}
            </colgroup>
            <thead>
              <tr>
                <th>
                  Fecha
                  <span className="col-resize-handle" onMouseDown={startResize('fecha')} />
                </th>
                <th>
                  Acción
                  <span className="col-resize-handle" onMouseDown={startResize('accion')} />
                </th>
                <th>
                  Solicitado por
                  <span className="col-resize-handle" onMouseDown={startResize('solicitadoPor')} />
                </th>
                <th>
                  Autorizado por
                  <span className="col-resize-handle" onMouseDown={startResize('autorizadoPor')} />
                </th>
                <th>
                  Resultado
                  <span className="col-resize-handle" onMouseDown={startResize('resultado')} />
                </th>
                <th>
                  Motivo
                  <span className="col-resize-handle" onMouseDown={startResize('motivo')} />
                </th>
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
                    <td style={{ fontFamily: 'var(--font-body)', fontSize: 12 }}>{row.solicitadoPor ?? '—'}</td>
                    <td style={{ fontFamily: 'var(--font-body)', fontSize: 12 }}>{row.autorizadoPor ?? '—'}</td>
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
