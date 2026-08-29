// Bandeja de e-CF emitidos (origin: ISSUED) — comprobantes electrónicos que emitimos ante la DGII
// (ventas y, desde F8, ciertas compras/gastos autogenerados). Solo lectura + "Refrescar estado".
// La emisión ocurre en el ciclo de la factura; la anulación, desde el flujo de cancelación de la
// factura (documento #50) — aquí no hay acciones de emitir/anular.
//
// CONSTANCIA: las pruebas end-to-end con datos reales quedan pendientes — ningún tenant tiene Aura
// conectado en producción. Contra el sandbox de Aura sí hay datos.

import { useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { ChevronLeft, ChevronRight, Search, RefreshCw, ExternalLink } from 'lucide-react'
import { listEcfEmitidos, refreshEcfEmitido } from '@/shared/api/ecf-emitidos'
import type { VoucherEmitido, EcfStatusDgii, EcfTipoElectronico, EcfEnv } from '@/shared/api/types'
import { useDebounce } from '@/lib/useDebounce'
import { formatDate, formatDOP } from '@/lib/formatters'
import {
  ecfStatusLabel, ecfStatusBadge, ecfTipoLabel, ecfEnvChip, ecfPuedeRefrescar, ECF_TIPOS,
} from '@/lib/dgii'
import { FilterField } from '@/shared/ui/FilterField'
import { DatePicker } from '@/shared/ui/DatePicker'
import { Select, SelectItem } from '@/components/ui/select'

const PAGE_SIZE = 20

const ESTADOS_DGII: EcfStatusDgii[] = [
  'PENDING', 'SIGNED', 'IN_PROCESS', 'ACCEPTED', 'CONDITIONAL', 'REJECTED',
  'NOT_FOUND', 'WAITING_DEFERRED', 'VOIDED', 'FAILED',
]

const ENVS: { value: EcfEnv; label: string }[] = [
  { value: 'TesteCF', label: 'Pruebas (TesteCF)' },
  { value: 'CerteCF', label: 'Certificación (CerteCF)' },
  { value: 'eCF', label: 'Producción (eCF)' },
]

function erpnextDocPath(erp: VoucherEmitido['erpnext']): string | null {
  if (!erp) return null
  return erp.doctype === 'Sales Invoice'
    ? `/facturas/${encodeURIComponent(erp.docname)}`
    : `/compras/${encodeURIComponent(erp.docname)}`
}

export default function EcfEmitidosPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [estado, setEstado] = useState('')
  const [rnc, setRnc] = useState('')
  const [typeId, setTypeId] = useState('')
  const [env, setEnv] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [archived, setArchived] = useState(false)

  const debouncedSearch = useDebounce(search, 300)
  const debouncedRnc = useDebounce(rnc, 300)
  const offset = (page - 1) * PAGE_SIZE

  const { data, isLoading, isError } = useQuery({
    queryKey: ['ecf-emitidos', { debouncedSearch, debouncedRnc, estado, typeId, env, from, to, archived, offset }],
    queryFn: () =>
      listEcfEmitidos({
        ncf: debouncedSearch || undefined,
        rnc: debouncedRnc || undefined,
        estado: (estado || undefined) as EcfStatusDgii | undefined,
        typeId: (typeId || undefined) as EcfTipoElectronico | undefined,
        env: (env || undefined) as EcfEnv | undefined,
        from: from || undefined,
        to: to || undefined,
        archived: archived || undefined,
        limit: PAGE_SIZE,
        offset,
      }),
  })

  const refreshMutation = useMutation({
    mutationFn: (voucherId: string) => refreshEcfEmitido(voucherId),
    onSuccess: (res) => {
      if (res.cambio) {
        toast.success(`Estado actualizado: ${ecfStatusLabel(res.statusPrevio)} → ${ecfStatusLabel(res.status)}`)
      } else {
        toast.info('El estado no ha cambiado')
      }
      queryClient.invalidateQueries({ queryKey: ['ecf-emitidos'] })
      queryClient.invalidateQueries({ queryKey: ['ecf-emitido', res.voucherId] })
    },
    onError: (err: { message?: string }) => toast.error(err?.message ?? 'No se pudo consultar el estado'),
  })

  const handleSearchChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setSearch(e.target.value)
    setPage(1)
  }, [])

  const items = (data?.items ?? []) as VoucherEmitido[]
  const totalPages = data ? Math.max(1, Math.ceil(data.meta.total / PAGE_SIZE)) : 1

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h1 className="page-title">e-CF Emitidos</h1>
          {data && <p className="page-sub">{data.meta.total} comprobantes electrónicos emitidos</p>}
        </div>
      </div>

      {data?.note && (
        <div className="inline-alert inline-alert-info" style={{ marginBottom: 12 }}>
          <span>{data.note}</span>
        </div>
      )}

      <div className="filter-bar">
        <div className="filter-bar-left">
          <div className="search-input-wrap">
            <Search size={15} className="search-input-icon" />
            <input
              className="search-input"
              placeholder="Buscar por e-NCF exacto…"
              value={search}
              onChange={handleSearchChange}
            />
          </div>
          <FilterField label="RNC comprador">
            <input
              className="ff-input ff-input-sm"
              style={{ width: 160 }}
              placeholder="RNC / Cédula"
              value={rnc}
              onChange={(e) => { setRnc(e.target.value); setPage(1) }}
            />
          </FilterField>
          <FilterField label="Estado DGII" style={{ width: 220 }}>
            <Select value={estado} onValueChange={(v) => { setEstado(v); setPage(1) }} placeholder="Todos los estados">
              {ESTADOS_DGII.map((s) => (
                <SelectItem key={s} value={s}>{ecfStatusLabel(s)}</SelectItem>
              ))}
            </Select>
          </FilterField>
          <FilterField label="Tipo" style={{ width: 220 }}>
            <Select value={typeId} onValueChange={(v) => { setTypeId(v); setPage(1) }} placeholder="Todos los tipos">
              {ECF_TIPOS.map((t) => (
                <SelectItem key={t.typeId} value={t.typeId}>{ecfTipoLabel(t.typeId)}</SelectItem>
              ))}
            </Select>
          </FilterField>
          <FilterField label="Ambiente" style={{ width: 200 }}>
            <Select value={env} onValueChange={(v) => { setEnv(v); setPage(1) }} placeholder="Todos">
              {ENVS.map((e) => (
                <SelectItem key={e.value} value={e.value}>{e.label}</SelectItem>
              ))}
            </Select>
          </FilterField>
          <FilterField label="Desde">
            <DatePicker className="ff-input ff-input-sm" value={from} onChange={(v) => { setFrom(v); setPage(1) }} style={{ width: 144 }} clearable />
          </FilterField>
          <FilterField label="Hasta">
            <DatePicker className="ff-input ff-input-sm" value={to} onChange={(v) => { setTo(v); setPage(1) }} style={{ width: 144 }} clearable />
          </FilterField>
          <FilterField label="Archivados">
            <label className="ff-checkbox-inline" style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, whiteSpace: 'nowrap' }}>
              <input
                type="checkbox"
                checked={archived}
                onChange={(e) => { setArchived(e.target.checked); setPage(1) }}
              />
              Incluir archivados
            </label>
          </FilterField>
        </div>
      </div>

      <div className="table-scroll">
        <table className="data-table">
          <thead>
            <tr>
              <th>e-NCF</th>
              <th>Tipo</th>
              <th>Fecha</th>
              <th>Comprador</th>
              <th style={{ textAlign: 'right' }}>Total</th>
              <th>Estado DGII</th>
              <th>Documento</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              Array.from({ length: 6 }).map((_, i) => (
                <tr key={i}>
                  {Array.from({ length: 8 }).map((__, j) => (
                    <td key={j}><div className="skeleton-box" style={{ height: 14, width: '100%' }} /></td>
                  ))}
                </tr>
              ))
            ) : isError ? (
              <tr>
                <td colSpan={8} style={{ textAlign: 'center', padding: '32px 0', color: 'var(--error-text)' }}>
                  Error al cargar los e-CF emitidos
                </td>
              </tr>
            ) : items.length === 0 ? (
              <tr>
                <td colSpan={8}>
                  <div className="empty-state">
                    <div className="empty-title">Sin e-CF emitidos</div>
                    <p className="empty-sub">
                      Los comprobantes electrónicos que emitas al someter una factura aparecerán aquí.
                    </p>
                  </div>
                </td>
              </tr>
            ) : (
              items.map((it) => {
                const chip = ecfEnvChip(it.env)
                const docPath = erpnextDocPath(it.erpnext)
                const canRefresh = ecfPuedeRefrescar(it.status, it.flujo?.esTerminal ?? true)
                return (
                  <tr
                    key={it.voucherId}
                    className="table-row-clickable"
                    onClick={() => navigate(`/ecf-emitidos/${encodeURIComponent(it.voucherId)}`)}
                  >
                    <td style={{ fontFamily: 'monospace', fontSize: 12 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                        {it.ncf}
                        {chip && <span className={`badge ${chip.className}`}>{chip.label}</span>}
                        {it.deferredSend && <span className="badge badge-info">Contingencia</span>}
                      </div>
                    </td>
                    <td>{ecfTipoLabel(it.typeId)}</td>
                    <td><span className="td-muted" style={{ fontSize: 12 }}>{formatDate(it.issuedAt)}</span></td>
                    <td>
                      <div style={{ display: 'flex', flexDirection: 'column' }}>
                        <span>{it.counterpartName || 'Consumidor final'}</span>
                        {it.counterpartRnc && (
                          <span className="td-muted" style={{ fontSize: 11 }}>{it.counterpartRnc}</span>
                        )}
                      </div>
                    </td>
                    <td style={{ textAlign: 'right', fontWeight: 500 }}>
                      {formatDOP(it.total)}{it.currency && it.currency !== 'DOP' ? ` ${it.currency}` : ''}
                    </td>
                    <td><span className={`badge ${ecfStatusBadge(it.status)}`}>{ecfStatusLabel(it.status)}</span></td>
                    <td onClick={(e) => e.stopPropagation()}>
                      {docPath ? (
                        <a
                          href={docPath}
                          onClick={(e) => { e.preventDefault(); navigate(docPath) }}
                          style={{ fontFamily: 'monospace', fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 4 }}
                        >
                          {it.erpnext!.docname} <ExternalLink size={11} />
                        </a>
                      ) : (
                        <span className="td-muted">—</span>
                      )}
                    </td>
                    <td onClick={(e) => e.stopPropagation()} style={{ textAlign: 'right' }}>
                      {canRefresh && (
                        <button
                          className="btn btn-ghost btn-size-xs"
                          disabled={refreshMutation.isPending && refreshMutation.variables === it.voucherId}
                          onClick={() => refreshMutation.mutate(it.voucherId)}
                        >
                          <RefreshCw
                            size={12}
                            style={refreshMutation.isPending && refreshMutation.variables === it.voucherId
                              ? { animation: 'spin 1s linear infinite' }
                              : undefined}
                          />
                          Refrescar
                        </button>
                      )}
                    </td>
                  </tr>
                )
              })
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
            <button className="btn btn-ghost btn-size-icon-sm" disabled={page === 1} onClick={() => setPage((p) => p - 1)}>
              <ChevronLeft size={16} />
            </button>
            <span style={{ fontSize: 13 }}>Página {page} de {totalPages}</span>
            <button className="btn btn-ghost btn-size-icon-sm" disabled={!data.meta.hasMore} onClick={() => setPage((p) => p + 1)}>
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
