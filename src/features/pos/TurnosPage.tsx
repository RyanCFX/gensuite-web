import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ChevronLeft, ChevronRight, Lock } from 'lucide-react'
import { listTurnos, type ListTurnosParams } from '@/shared/api/pos'
import { listUsuarios } from '@/shared/api/usuarios'
import { formatDateTime, formatDOP } from '@/lib/formatters'
import { Select, SelectItem } from '@/components/ui/select'
import { DatePicker } from '@/shared/ui/DatePicker'
import { SearchSelect } from '@/shared/ui/SearchSelect'
import type { SearchSelectOption } from '@/shared/ui/SearchSelect'
import { CerrarTurnoModal } from '@/components/shared/CerrarTurnoModal'
import type { TurnoListItem } from '@/shared/api/types'

const PAGE_SIZE = 20

const STATUS_BADGE: Record<string, string> = {
  Open: 'badge-success',
  Closed: 'badge-draft',
}
const STATUS_LABEL: Record<string, string> = {
  Open: 'Abierto',
  Closed: 'Cerrado',
}

type StatusFilter = 'Open' | 'Closed' | 'all'

export default function TurnosPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [cajero, setCajero] = useState('')
  const [cajeroLabel, setCajeroLabel] = useState('')
  const [cajeroQuery, setCajeroQuery] = useState('')
  const [status, setStatus] = useState<StatusFilter>('all')
  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')
  const [grandTotalMin, setGrandTotalMin] = useState('')
  const [grandTotalMax, setGrandTotalMax] = useState('')
  const [page, setPage] = useState(1)
  const [closeTarget, setCloseTarget] = useState<TurnoListItem | null>(null)

  const offset = (page - 1) * PAGE_SIZE

  const { data: usuariosData, isLoading: usuariosLoading } = useQuery({
    queryKey: ['usuariosSearch', cajeroQuery],
    queryFn: () => listUsuarios({ search: cajeroQuery || undefined, limit: 15 }),
  })
  const cajeroOptions: SearchSelectOption[] = (usuariosData?.items ?? []).map((u) => ({
    value: u.email,
    label: u.fullName,
    sublabel: u.email,
  }))

  const params: ListTurnosParams = {
    cajero: cajero || undefined,
    status: status === 'all' ? undefined : status,
    from: fromDate || undefined,
    to: toDate || undefined,
    grandTotalMin: grandTotalMin !== '' ? Number(grandTotalMin) : undefined,
    grandTotalMax: grandTotalMax !== '' ? Number(grandTotalMax) : undefined,
    offset,
    limit: PAGE_SIZE,
  }

  const { data, isLoading } = useQuery({
    queryKey: ['turnos', params],
    queryFn: () => listTurnos(params),
  })

  const turnos = data?.items ?? []
  const totalPages = data?.meta ? Math.ceil((data.meta.total ?? 0) / PAGE_SIZE) : 1

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h1 className="page-title">Turnos de Caja</h1>
          <p className="page-sub">
            Historial de turnos de caja (POS)
            {data?.meta ? ` — ${data.meta.total} turno(s)` : ''}
          </p>
        </div>
      </div>

      <div className="filter-bar">
        <div className="filter-bar-left">
          <div style={{ width: 240 }}>
            <SearchSelect
              value={cajero}
              selectedLabel={cajeroLabel}
              onChange={(val, opt) => { setCajero(val); setCajeroLabel(opt?.label ?? ''); setPage(1) }}
              options={cajeroOptions}
              onSearch={setCajeroQuery}
              loading={usuariosLoading}
              placeholder="Filtrar por cajero…"
            />
          </div>
          <Select value={status} onValueChange={(val) => { setStatus(val as StatusFilter); setPage(1) }}>
            <SelectItem value="all">Todos los estados</SelectItem>
            <SelectItem value="Open">Abiertos</SelectItem>
            <SelectItem value="Closed">Cerrados</SelectItem>
          </Select>
          <DatePicker
            className="filter-select"
            value={fromDate}
            onChange={(v) => { setFromDate(v); setPage(1) }}
            clearable
          />
          <DatePicker
            className="filter-select"
            value={toDate}
            onChange={(v) => { setToDate(v); setPage(1) }}
            clearable
          />
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <input
              type="number"
              className="ff-input ff-input-sm"
              style={{ width: 100 }}
              placeholder="Mín."
              value={grandTotalMin}
              onChange={(e) => { setGrandTotalMin(e.target.value); setPage(1) }}
            />
            <span style={{ color: 'var(--text-secondary)', fontSize: 13 }}>—</span>
            <input
              type="number"
              className="ff-input ff-input-sm"
              style={{ width: 100 }}
              placeholder="Máx."
              value={grandTotalMax}
              onChange={(e) => { setGrandTotalMax(e.target.value); setPage(1) }}
            />
            <span className="ff-hint" title="El filtro de total solo aplica a turnos cerrados">Total (solo cerrados)</span>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Cajero</th>
                <th>Perfil POS</th>
                <th>Compañía</th>
                <th>Apertura</th>
                <th>Cierre</th>
                <th>Total</th>
                <th>Diferencia</th>
                <th>Estado</th>
                <th style={{ width: 90 }} />
              </tr>
            </thead>
            <tbody>
              {isLoading
                ? Array.from({ length: 6 }).map((_, i) => (
                    <tr key={i}>
                      {Array.from({ length: 10 }).map((__, j) => (
                        <td key={j}><div className="skeleton-box" style={{ height: 14, width: '100%' }} /></td>
                      ))}
                    </tr>
                  ))
                : turnos.length === 0
                  ? (
                      <tr>
                        <td colSpan={10}>
                          <div className="empty-state">
                            <p className="empty-title">Sin turnos</p>
                            <p className="empty-sub">No se encontraron turnos de caja con los filtros actuales.</p>
                          </div>
                        </td>
                      </tr>
                    )
                  : turnos.map((t) => (
                      <tr
                        key={t.id}
                        className="data-table-row-link"
                        onClick={() => navigate(`/turnos/${t.id}`)}
                      >
                        <td style={{ fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 500 }}>
                          {t.id}
                        </td>
                        <td>{t.cajero}</td>
                        <td className="td-muted">{t.posProfile}</td>
                        <td className="td-muted">{t.company}</td>
                        <td className="td-muted">{formatDateTime(t.periodStartDate)}</td>
                        <td className="td-muted">{t.periodEndDate ? formatDateTime(t.periodEndDate) : '—'}</td>
                        <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: 13 }}>
                          {t.grandTotal != null ? formatDOP(t.grandTotal) : '—'}
                        </td>
                        <td
                          style={{
                            textAlign: 'right',
                            fontFamily: 'var(--font-mono)',
                            fontSize: 13,
                            fontWeight: 600,
                            color:
                              t.totalDifference != null
                                ? t.totalDifference < 0
                                  ? 'var(--error-text)'
                                  : t.totalDifference > 0
                                    ? 'var(--warning-text)'
                                    : 'var(--text-secondary)'
                                : 'var(--text-tertiary)',
                          }}
                        >
                          {t.totalDifference != null
                            ? `${t.totalDifference > 0 ? '+' : ''}${formatDOP(t.totalDifference)}`
                            : '—'}
                        </td>
                        <td>
                          <span className={`badge ${STATUS_BADGE[t.status] ?? 'badge-draft'}`}>
                            {STATUS_LABEL[t.status] ?? t.status}
                          </span>
                        </td>
                        <td>
                          {t.status === 'Open' ? (
                            <button
                              className="btn btn-secondary btn-size-xs"
                              onClick={(e) => {
                                e.stopPropagation()
                                setCloseTarget(t)
                              }}
                            >
                              <Lock size={12} /> Cerrar
                            </button>
                          ) : null}
                        </td>
                      </tr>
                    ))}
            </tbody>
          </table>
        </div>

        {data?.meta && data.meta.total > PAGE_SIZE && (
          <div className="pagination">
            <span className="pagination-info">
              Mostrando {offset + 1}–{Math.min(offset + PAGE_SIZE, data.meta.total)} de {data.meta.total}
            </span>
            <div className="pagination-controls">
              <button className="btn btn-ghost btn-size-icon-sm" disabled={page === 1} onClick={() => setPage((p) => p - 1)}>
                <ChevronLeft size={14} />
              </button>
              <span style={{ fontSize: 12, color: 'var(--text-secondary)', padding: '0 8px' }}>
                {page} / {totalPages}
              </span>
              <button className="btn btn-ghost btn-size-icon-sm" disabled={!data.meta.hasMore} onClick={() => setPage((p) => p + 1)}>
                <ChevronRight size={14} />
              </button>
            </div>
          </div>
        )}
      </div>

      <CerrarTurnoModal
        open={!!closeTarget}
        openingEntryId={closeTarget?.id ?? null}
        turnoLabel={
          closeTarget
            ? `Cerrando el turno de ${closeTarget.cajero}${closeTarget.posProfile ? ` (${closeTarget.posProfile})` : ''}.`
            : undefined
        }
        onClose={() => setCloseTarget(null)}
        onClosed={() => {
          queryClient.invalidateQueries({ queryKey: ['turnos'] })
          if (closeTarget) queryClient.invalidateQueries({ queryKey: ['turno', closeTarget.id] })
        }}
      />
    </div>
  )
}
