// Bandeja de e-CF recibidos de terceros (F8) — comprobantes electrónicos que otros nos emitieron
// (compras/gastos entrantes). Permite conciliar con una Purchase Invoice y decidir la aprobación
// comercial (ACECF).
//
// CONSTANCIA: las pruebas end-to-end con datos reales quedan pendientes — ningún tenant tiene Aura
// conectado y no existe todavía ningún e-CF recibido de un tercero en los entornos de prueba.

import { useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { ChevronLeft, ChevronRight, Search, Upload, Link2 } from 'lucide-react'
import { listEcfRecibidos, vincularEcfRecibido } from '@/shared/api/ecf-recibidos'
import type { EcfRecibidoListItem, EcfStatusDgii, EcfTipoElectronico } from '@/shared/api/types'
import { useDebounce } from '@/lib/useDebounce'
import { formatDate, formatDOP } from '@/lib/formatters'
import {
  ecfStatusLabel, ecfStatusBadge, ecfConciliacionLabel, ecfConciliacionBadge,
  acecfStatusLabel, acecfBadge, ecfTipoLabel,
} from '@/lib/dgii'
import { ECF_TIPOS } from '@/lib/dgii'
import { FilterField } from '@/shared/ui/FilterField'
import { DatePicker } from '@/shared/ui/DatePicker'
import { Select, SelectItem } from '@/components/ui/select'
import { CargarXmlModal } from './CargarXmlModal'

const PAGE_SIZE = 20

const ESTADOS_DGII: EcfStatusDgii[] = [
  'PENDING', 'SIGNED', 'IN_PROCESS', 'ACCEPTED', 'CONDITIONAL', 'REJECTED',
  'NOT_FOUND', 'WAITING_DEFERRED', 'VOIDED', 'FAILED',
]

export default function EcfRecibidosPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [estado, setEstado] = useState('')
  const [rnc, setRnc] = useState('')
  const [typeId, setTypeId] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [showCargarXml, setShowCargarXml] = useState(false)

  const debouncedSearch = useDebounce(search, 300)
  const debouncedRnc = useDebounce(rnc, 300)
  const offset = (page - 1) * PAGE_SIZE

  const { data, isLoading, isError } = useQuery({
    queryKey: ['ecf-recibidos', { debouncedSearch, debouncedRnc, estado, typeId, from, to, offset }],
    queryFn: () =>
      listEcfRecibidos({
        search: debouncedSearch || undefined,
        rnc: debouncedRnc || undefined,
        estado: (estado || undefined) as EcfStatusDgii | undefined,
        typeId: (typeId || undefined) as EcfTipoElectronico | undefined,
        from: from || undefined,
        to: to || undefined,
        limit: PAGE_SIZE,
        offset,
      }),
  })

  const vincularRapido = useMutation({
    mutationFn: ({ voucherId, purchaseInvoice }: { voucherId: string; purchaseInvoice: string }) =>
      vincularEcfRecibido(voucherId, { purchaseInvoice }),
    onSuccess: () => {
      toast.success('e-CF vinculado con la factura de compra')
      queryClient.invalidateQueries({ queryKey: ['ecf-recibidos'] })
    },
    onError: (err: { message?: string }) => toast.error(err?.message ?? 'No se pudo vincular'),
  })

  const handleSearchChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setSearch(e.target.value)
    setPage(1)
  }, [])

  const items = (data?.items ?? []) as EcfRecibidoListItem[]
  const totalPages = data ? Math.max(1, Math.ceil(data.meta.total / PAGE_SIZE)) : 1

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h1 className="page-title">e-CF Recibidos</h1>
          {data && <p className="page-sub">{data.meta.total} comprobantes recibidos de terceros</p>}
        </div>
        <button className="btn btn-secondary" onClick={() => setShowCargarXml(true)}>
          <Upload size={16} /> Cargar XML manualmente
        </button>
      </div>

      <div className="filter-bar">
        <div className="filter-bar-left">
          <div className="search-input-wrap">
            <Search size={15} className="search-input-icon" />
            <input
              className="search-input"
              placeholder="Buscar por NCF, proveedor…"
              value={search}
              onChange={handleSearchChange}
            />
          </div>
          <FilterField label="RNC emisor">
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
          <FilterField label="Desde">
            <DatePicker className="ff-input ff-input-sm" value={from} onChange={(v) => { setFrom(v); setPage(1) }} style={{ width: 144 }} clearable />
          </FilterField>
          <FilterField label="Hasta">
            <DatePicker className="ff-input ff-input-sm" value={to} onChange={(v) => { setTo(v); setPage(1) }} style={{ width: 144 }} clearable />
          </FilterField>
        </div>
      </div>

      <div className="table-scroll">
        <table className="data-table">
          <thead>
            <tr>
              <th>NCF</th>
              <th>Proveedor</th>
              <th style={{ textAlign: 'right' }}>Total</th>
              <th>Estado DGII</th>
              <th>Conciliación</th>
              <th>Aprobación comercial</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              Array.from({ length: 6 }).map((_, i) => (
                <tr key={i}>
                  {Array.from({ length: 7 }).map((__, j) => (
                    <td key={j}><div className="skeleton-box" style={{ height: 14, width: '100%' }} /></td>
                  ))}
                </tr>
              ))
            ) : isError ? (
              <tr>
                <td colSpan={7} style={{ textAlign: 'center', padding: '32px 0', color: 'var(--error-text)' }}>
                  Error al cargar los e-CF recibidos
                </td>
              </tr>
            ) : items.length === 0 ? (
              <tr>
                <td colSpan={7}>
                  <div className="empty-state">
                    <div className="empty-title">Sin e-CF recibidos</div>
                    <p className="empty-sub">
                      Los comprobantes electrónicos que tus proveedores te emitan aparecerán aquí automáticamente.
                    </p>
                  </div>
                </td>
              </tr>
            ) : (
              items.map((it) => (
                <tr
                  key={it.voucherId}
                  className="table-row-clickable"
                  onClick={() => navigate(`/ecf-recibidos/${encodeURIComponent(it.voucherId)}`)}
                >
                  <td style={{ fontFamily: 'monospace', fontSize: 12 }}>{it.ncf}</td>
                  <td>
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                      <span>{it.counterpartName || '—'}</span>
                      <span className="td-muted" style={{ fontSize: 11 }}>{it.counterpartRnc}</span>
                    </div>
                  </td>
                  <td style={{ textAlign: 'right', fontWeight: 500 }}>
                    {formatDOP(it.total)}{it.currency && it.currency !== 'DOP' ? ` ${it.currency}` : ''}
                  </td>
                  <td><span className={`badge ${ecfStatusBadge(it.status)}`}>{ecfStatusLabel(it.status)}</span></td>
                  <td onClick={(e) => e.stopPropagation()}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                      <span className={`badge ${ecfConciliacionBadge(it.conciliacion)}`}>
                        {ecfConciliacionLabel(it.conciliacion)}
                      </span>
                      {it.conciliacion === 'UNICO' && it.candidatosConciliacion[0] && (
                        <button
                          className="btn btn-ghost btn-size-xs"
                          disabled={vincularRapido.isPending}
                          onClick={() =>
                            vincularRapido.mutate({ voucherId: it.voucherId, purchaseInvoice: it.candidatosConciliacion[0] })
                          }
                        >
                          <Link2 size={12} /> Vincular con {it.candidatosConciliacion[0]}
                        </button>
                      )}
                    </div>
                  </td>
                  <td><span className={`badge ${acecfBadge(it.acecf?.status)}`}>{acecfStatusLabel(it.acecf?.status)}</span></td>
                  <td style={{ textAlign: 'right' }}>
                    <span className="td-muted" style={{ fontSize: 12 }}>{formatDate(it.issuedAt)}</span>
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

      {showCargarXml && <CargarXmlModal onClose={() => setShowCargarXml(false)} />}
    </div>
  )
}
