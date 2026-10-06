import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { usePermissionsStore } from '@/stores/permissions.store'
import {
  listAuditoriaTransacciones,
  resolverDestinoLink,
  AUDITORIA_FILTRO_USUARIO,
  AUDITORIA_PANTALLA,
  type AuditoriaTransaccion,
} from '@/shared/api/auditoria'
import { PageHeader } from '@/components/shared/PageHeader'
import { RecargarButton } from '@/components/shared/RecargarButton'
import { SearchInput } from '@/shared/ui/SearchInput'
import { FilterField } from '@/shared/ui/FilterField'
import { DatePicker } from '@/shared/ui/DatePicker'
import { Select, SelectItem } from '@/components/ui/select'
import { Drawer } from '@/shared/ui/Drawer'
import { useFiltrosPantalla } from '@/shared/permissions/useAcceso'
import { formatDateTime } from '@/lib/formatters'
import { ChevronLeft, ChevronRight, ExternalLink, SlidersHorizontal, ScrollText } from 'lucide-react'
import { AuditoriaDetailModal } from './AuditoriaDetailModal'

const PAGE_SIZE = 20

/**
 * Auditoría de Transacciones — docs/tasks/PROMPT_AUDITORIA_TRANSACCIONES_FRONTEND.md.
 * Pantalla de SOLO LECTURA: tabla paginada + filtros + detalle en modal. Sin crear, editar,
 * eliminar, exportar, montos ni gráficos (§2).
 */
export default function AuditoriaPage() {
  const navigate = useNavigate()

  const [search, setSearch] = useState('')
  const [desde, setDesde] = useState('')
  const [hasta, setHasta] = useState('')
  const [usuario, setUsuario] = useState('')
  const [accion, setAccion] = useState('all')
  const [doctype, setDoctype] = useState('all')
  const [page, setPage] = useState(1)
  const [moreFiltersOpen, setMoreFiltersOpen] = useState(false)
  const [detalle, setDetalle] = useState<AuditoriaTransaccion | null>(null)

  const offset = (page - 1) * PAGE_SIZE

  // Permisos v2 §1-§3: el filtro `usuario` es sensible y NO viene con "pantalla completa".
  // Se muestra solo si el componente está otorgado explícitamente (además de no bloqueado).
  const filtros = useFiltrosPantalla(AUDITORIA_PANTALLA)
  const acceso = usePermissionsStore((s) => s.acceso)
  const mostrarFiltroUsuario =
    acceso.modo !== 'activo'
      ? true
      : acceso.componentes.has(AUDITORIA_FILTRO_USUARIO) && filtros.puedeFiltrar('usuario')

  const rawParams = {
    search: search || undefined,
    // DatePicker da 'yyyy-MM-dd'; el backend filtra por createdAt ISO inclusivo (§3).
    // Se envía inicio/fin de día en ISO para cubrir el día completo.
    desde: desde ? new Date(`${desde}T00:00:00`).toISOString() : undefined,
    hasta: hasta ? new Date(`${hasta}T23:59:59.999`).toISOString() : undefined,
    usuario: mostrarFiltroUsuario && usuario ? usuario : undefined,
    accion: accion !== 'all' ? accion : undefined,
    doctype: doctype !== 'all' ? doctype : undefined,
    limit: PAGE_SIZE,
    offset,
  }
  const { limpios: params, quitados } = filtros.sanear(rawParams)

  const { data, isLoading, isError } = useQuery({
    queryKey: [
      'auditoria-transacciones',
      { search, desde, hasta, usuario: mostrarFiltroUsuario ? usuario : '', accion, doctype, offset },
    ],
    queryFn: () => listAuditoriaTransacciones(params),
  })

  // Selectores de acción/doctype poblados con valores reales del listado (§3/§5) — nunca
  // hardcodeados (el universo puede crecer sin aviso).
  const accionesDisponibles = useMemo(() => {
    const set = new Map<string, string>()
    for (const row of data?.items ?? []) {
      if (row.accion && !set.has(row.accion)) set.set(row.accion, row.label || row.accion)
    }
    if (accion !== 'all' && !set.has(accion)) set.set(accion, accion)
    return [...set.entries()].sort((a, b) => a[1].localeCompare(b[1]))
  }, [data, accion])

  const doctypesDisponibles = useMemo(() => {
    const set = new Set<string>()
    for (const row of data?.items ?? []) {
      if (row.doctype) set.add(row.doctype)
    }
    if (doctype !== 'all') set.add(doctype)
    return [...set].sort()
  }, [data, doctype])

  const totalPages = data ? Math.max(1, Math.ceil(data.meta.total / PAGE_SIZE)) : 1
  const activeMoreFiltersCount =
    (desde ? 1 : 0) + (hasta ? 1 : 0) + (mostrarFiltroUsuario && usuario ? 1 : 0)

  function resetPage() {
    setPage(1)
  }

  function clearMoreFilters() {
    setDesde('')
    setHasta('')
    setUsuario('')
    resetPage()
  }

  function clearAll() {
    setSearch('')
    setAccion('all')
    setDoctype('all')
    clearMoreFilters()
  }

  /** Navegación vía `link` absoluto del servidor (§6): router interno si mismo origen. */
  function abrirDocumento(row: AuditoriaTransaccion) {
    if (!row.link) return
    const { pathname, href } = resolverDestinoLink(row.link)
    if (pathname) {
      navigate(pathname)
    } else {
      // Fallback dominio distinto (§6): navegación completa, nunca ignorar en silencio.
      window.location.assign(href)
    }
  }

  /** "Ver historial de este documento" (§7): mismo listado con search=<docname> precargado. */
  function verHistorial(docname: string) {
    setDetalle(null)
    setSearch(docname)
    setAccion('all')
    setDoctype('all')
    setDesde('')
    setHasta('')
    setUsuario('')
    resetPage()
  }

  return (
    <div className="page-container">
      <PageHeader
        title={<><span className="page-title-dot" />Auditoría de Transacciones</>}
        description="Quién hizo qué transacción, cuándo y dónde ver el documento real. Solo lectura, sin montos."
        action={<RecargarButton />}
      />

      {quitados.length > 0 && (
        <p className="td-muted" style={{ fontSize: 12, margin: '0 0 12px' }}>
          Se quitó el filtro {quitados.join(', ')}: no tiene permiso para usarlo.
        </p>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        <div className="card filter-card-navy">
          <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div className="filter-bar" style={{ margin: 0 }}>
              <div className="filter-bar-left">
                <SearchInput
                  placeholder="Buscar resumen o documento…"
                  value={search}
                  onChange={(v) => { setSearch(v); resetPage() }}
                />
                {filtros.puedeFiltrar('accion') && (
                  <FilterField label="Acción" style={{ minWidth: 200 }}>
                    <Select value={accion} onValueChange={(v) => { setAccion(v); resetPage() }}>
                      <SelectItem value="all">Todas</SelectItem>
                      {accionesDisponibles.map(([value, label]) => (
                        <SelectItem key={value} value={value}>{label}</SelectItem>
                      ))}
                    </Select>
                  </FilterField>
                )}
                {filtros.puedeFiltrar('doctype') && (
                  <FilterField label="Tipo de documento" style={{ minWidth: 200 }}>
                    <Select value={doctype} onValueChange={(v) => { setDoctype(v); resetPage() }}>
                      <SelectItem value="all">Todos</SelectItem>
                      {doctypesDisponibles.map((d) => (
                        <SelectItem key={d} value={d}>{d}</SelectItem>
                      ))}
                    </Select>
                  </FilterField>
                )}
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
            <table className="data-table navy-table">
              <thead>
                <tr>
                  <th>Transacción</th>
                  <th>Documento</th>
                  <th>Actor</th>
                  <th>Fecha</th>
                  <th style={{ width: 48 }} aria-label="Abrir" />
                </tr>
              </thead>
              <tbody>
                {isLoading
                  ? Array.from({ length: 8 }).map((_, i) => (
                      <tr key={i}>
                        {Array.from({ length: 5 }).map((__, j) => (
                          <td key={j}><span className="skeleton-box" style={{ height: 16, width: '100%', display: 'block' }} /></td>
                        ))}
                      </tr>
                    ))
                  : isError
                    ? (
                        <tr>
                          <td colSpan={5} style={{ textAlign: 'center', padding: '32px 0', color: 'var(--error-text)' }}>
                            Error al cargar las transacciones
                          </td>
                        </tr>
                      )
                    : data?.items.length === 0
                      ? (
                          <tr>
                            <td colSpan={5}>
                              <div className="empty-state">
                                <div className="empty-icon"><ScrollText size={20} /></div>
                                <p className="empty-title">Sin transacciones</p>
                                <p className="empty-sub">No hay transacciones para los filtros actuales.</p>
                                <button className="btn btn-secondary btn-size-sm" onClick={clearAll}>
                                  Limpiar filtros
                                </button>
                              </div>
                            </td>
                          </tr>
                        )
                      : data?.items.map((row) => (
                          <tr
                            key={row.id}
                            className="table-row-clickable"
                            onClick={() => setDetalle(row)}
                            title={row.resumen ?? `${row.label} — ${row.doctype} ${row.docname}`}
                          >
                            <td>
                              <div style={{ fontWeight: 600 }}>{row.label}</div>
                              {row.resumen ? (
                                <div className="td-muted" style={{ fontSize: 12 }}>{row.resumen}</div>
                              ) : (
                                <div className="td-muted" style={{ fontSize: 12 }}>{row.doctype} {row.docname}</div>
                              )}
                            </td>
                            <td className="td-muted" style={{ fontFamily: 'var(--font-body)', fontSize: 12 }}>
                              <div>{row.doctype}</div>
                              <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{row.docname}</div>
                            </td>
                            <td style={{ fontSize: 12 }}>{row.actorEmail}</td>
                            <td className="td-muted" style={{ fontSize: 12, whiteSpace: 'nowrap' }}>
                              {formatDateTime(row.createdAt)}
                            </td>
                            <td onClick={(e) => e.stopPropagation()}>
                              <button
                                type="button"
                                className="btn btn-ghost btn-size-icon-sm"
                                onClick={() => abrirDocumento(row)}
                                disabled={!row.link}
                                title={row.link ? `Abrir ${row.docname}` : 'Sin enlace'}
                                aria-label={`Abrir ${row.docname}`}
                              >
                                <ExternalLink size={14} />
                              </button>
                            </td>
                          </tr>
                        ))}
              </tbody>
            </table>
          </div>

          {data && data.meta.total > PAGE_SIZE && (
            <div className="pagination">
              <span className="pagination-info">
                Mostrando {offset + 1}–{Math.min(offset + PAGE_SIZE, data.meta.total)} de {data.meta.total}
              </span>
              <div className="pagination-controls">
                <button className="btn btn-ghost btn-size-icon-sm" disabled={page === 1} onClick={() => setPage((p) => p - 1)} aria-label="Anterior">
                  <ChevronLeft size={14} />
                </button>
                <span style={{ fontSize: 12, color: 'var(--text-secondary)', padding: '0 8px' }}>
                  {page} / {totalPages}
                </span>
                <button className="btn btn-ghost btn-size-icon-sm" disabled={!data.meta.hasMore} onClick={() => setPage((p) => p + 1)} aria-label="Siguiente">
                  <ChevronRight size={14} />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      <Drawer
        open={moreFiltersOpen}
        onClose={() => setMoreFiltersOpen(false)}
        title="Más filtros"
        subtitle="Refina la búsqueda de transacciones"
        footer={
          <>
            <button className="btn btn-ghost" onClick={clearMoreFilters}>Limpiar</button>
            <button className="btn btn-navy" onClick={() => setMoreFiltersOpen(false)}>Aplicar</button>
          </>
        }
      >
        {(filtros.puedeFiltrar('desde') || filtros.puedeFiltrar('hasta')) && (
          <div className="ff-wrap">
            <label className="ff-label">Fecha de transacción</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <DatePicker value={desde} onChange={(v) => { setDesde(v); resetPage() }} clearable max={hasta || undefined} />
              <span style={{ color: 'var(--text-secondary)', fontSize: 13 }}>—</span>
              <DatePicker value={hasta} onChange={(v) => { setHasta(v); resetPage() }} clearable min={desde || undefined} />
            </div>
          </div>
        )}

        {mostrarFiltroUsuario && (
          <div className="ff-wrap">
            <label className="ff-label">Usuario (email exacto)</label>
            <input
              className="ff-input"
              placeholder="usuario@empresa.com"
              value={usuario}
              onChange={(e) => { setUsuario(e.target.value); resetPage() }}
            />
          </div>
        )}
      </Drawer>

      <AuditoriaDetailModal
        row={detalle}
        onClose={() => setDetalle(null)}
        onVerHistorial={verHistorial}
        onAbrirDocumento={abrirDocumento}
      />
    </div>
  )
}
