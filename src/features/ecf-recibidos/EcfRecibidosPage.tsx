// Bandeja de e-CF recibidos de terceros (F8) — comprobantes electrónicos que otros nos emitieron
// (compras/gastos entrantes). Permite conciliar con una Purchase Invoice y decidir la aprobación
// comercial (ACECF).
//
// CONSTANCIA: las pruebas end-to-end con datos reales quedan pendientes — ningún tenant tiene Vega
// conectado y no existe todavía ningún e-CF recibido de un tercero en los entornos de prueba.

import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { ChevronLeft, ChevronRight, Upload, Link2, SlidersHorizontal } from 'lucide-react'
import { listEcfRecibidos, vincularEcfRecibido } from '@/shared/api/ecf-recibidos'
import type { EcfRecibidoListItem, EcfStatusDgii, EcfTipoElectronico } from '@/shared/api/types'
import { formatDate, formatDOP } from '@/lib/formatters'
import {
  ecfStatusLabel, ecfStatusBadge, ecfConciliacionLabel, ecfConciliacionBadge,
  acecfStatusLabel, acecfBadge, ecfTipoLabel,
} from '@/lib/dgii'
import { ECF_TIPOS } from '@/lib/dgii'
import { FilterField } from '@/shared/ui/FilterField'
import { DatePicker } from '@/shared/ui/DatePicker'
import { Drawer } from '@/shared/ui/Drawer'
import { Select, SelectItem } from '@/components/ui/select'
import { RecargarButton } from '@/components/shared/RecargarButton'
import { CargarXmlModal } from './CargarXmlModal'
import { useResizableColumns } from '@/shared/hooks/useResizableColumns'
import { SearchInput } from '@/shared/ui/SearchInput'

const PAGE_SIZE = 20

const COLUMNS = [
  { key: 'ncf', width: 100 },
  { key: 'proveedor', width: 180 },
  { key: 'total', width: 120 },
  { key: 'estadoDgii', width: 130 },
  { key: 'conciliacion', width: 160 },
  { key: 'acecf', width: 160 },
  { key: 'fecha', width: 100 },
]

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
  const [moreFiltersOpen, setMoreFiltersOpen] = useState(false)
  const { widths: colWidths, startResize } = useResizableColumns(COLUMNS)

  const debouncedSearch = search
  const debouncedRnc = rnc
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


  const items = (data?.items ?? []) as EcfRecibidoListItem[]
  const totalPages = data ? Math.max(1, Math.ceil(data.meta.total / PAGE_SIZE)) : 1

  const activeMoreFiltersCount = [from, to].filter((v) => v !== '').length

  function clearMoreFilters() {
    setFrom('')
    setTo('')
    setPage(1)
  }

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h1 className="page-title"><span className="page-title-dot" />e-CF Recibidos</h1>
          {data && <p className="page-sub">{data.meta.total} comprobantes recibidos de terceros</p>}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          <RecargarButton />
          <button className="btn btn-secondary" onClick={() => setShowCargarXml(true)}>
            <Upload size={16} /> Cargar XML manualmente
          </button>
        </div>
      </div>

      <div className="card filter-card-navy" style={{ marginBottom: 20 }}>
        <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="filter-bar" style={{ margin: 0 }}>
            <div className="filter-bar-left">
              <SearchInput placeholder="Buscar por NCF, proveedor…" value={search} onChange={(v) => {
    setSearch(v)
    setPage(1)
  }} />
              <FilterField label="RNC emisor">
                <SearchInput variant="field" style={{ width: 160 }} placeholder="RNC / Cédula" value={rnc} onChange={(v) => { setRnc(v); setPage(1) }} /></FilterField>
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

              <button type="button" className="btn btn-secondary btn-size-sm" onClick={() => setMoreFiltersOpen(true)}>
                <SlidersHorizontal size={13} />
                Más filtros
                {activeMoreFiltersCount > 0 && (
                  <span className="badge badge-brand" style={{ marginLeft: 2 }}>{activeMoreFiltersCount}</span>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="card navy-table-card">
      <div className="table-scroll">
        <table className="data-table navy-table items-table-resizable">
          <colgroup>
            {COLUMNS.map((c) => <col key={c.key} style={{ width: colWidths[c.key] }} />)}
          </colgroup>
          <thead>
            <tr>
              <th>
                NCF
                <span className="col-resize-handle" onMouseDown={startResize('ncf')} />
              </th>
              <th>
                Proveedor
                <span className="col-resize-handle" onMouseDown={startResize('proveedor')} />
              </th>
              <th style={{ textAlign: 'right' }}>
                Total
                <span className="col-resize-handle" onMouseDown={startResize('total')} />
              </th>
              <th>
                Estado DGII
                <span className="col-resize-handle" onMouseDown={startResize('estadoDgii')} />
              </th>
              <th>
                Conciliación
                <span className="col-resize-handle" onMouseDown={startResize('conciliacion')} />
              </th>
              <th>
                Aprobación comercial
                <span className="col-resize-handle" onMouseDown={startResize('acecf')} />
              </th>
              <th>
                <span className="col-resize-handle" onMouseDown={startResize('fecha')} />
              </th>
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
                  <td style={{ fontFamily: 'var(--font-body)', fontSize: 12 }}>{it.ncf}</td>
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

      <Drawer
        open={moreFiltersOpen}
        onClose={() => setMoreFiltersOpen(false)}
        title="Más filtros"
        subtitle="Refina la búsqueda de e-CF recibidos"
        footer={
          <>
            <button className="btn btn-ghost" onClick={clearMoreFilters}>Limpiar</button>
            <button className="btn btn-navy" onClick={() => setMoreFiltersOpen(false)}>Aplicar</button>
          </>
        }
      >
        <div className="ff-wrap">
          <label className="ff-label">Fecha</label>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <DatePicker className="ff-input" value={from} onChange={(v) => { setFrom(v); setPage(1) }} clearable />
            <span style={{ color: 'var(--text-secondary)', fontSize: 13 }}>—</span>
            <DatePicker className="ff-input" value={to} onChange={(v) => { setTo(v); setPage(1) }} clearable />
          </div>
        </div>
      </Drawer>
    </div>
  )
}
