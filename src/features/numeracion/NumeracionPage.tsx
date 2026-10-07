import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ChevronRight, Hash, Search } from 'lucide-react'
import { getNumeracionIndice } from '@/shared/api/numeracion'
import { PageHeader } from '@/components/shared/PageHeader'
import { RecargarButton } from '@/components/shared/RecargarButton'
import { NUMERACION_AREAS_ORDEN, etiquetaModo } from './numeracionReferencia'

// ─── Índice — docs/tasks/PROMPT_NUMERACION_DOCUMENTOS_FRONTEND.md §7.2 ───────
// Fuente de verdad de qué tipos mostrar: `GET /config/numeracion` (ya hace la
// intersección feature ∩ permiso — no recalcularla a mano, §2 regla de oro).
// No muestra contadores ni "próximo": eso requiere una llamada por tipo, se ve en el detalle.

const MODO_CHIP_TONE: Record<string, string> = {
  'regla-devolucion': 'badge-warning',
  lote: 'badge-info',
}

export default function NumeracionPage() {
  const [busqueda, setBusqueda] = useState('')

  const { data: tipos, isLoading, isError, refetch } = useQuery({
    queryKey: ['numeracion-indice'],
    queryFn: getNumeracionIndice,
  })

  const grupos = useMemo(() => {
    const lista = tipos ?? []
    const q = busqueda.trim().toLowerCase()
    const filtrada = q
      ? lista.filter(
          (t) =>
            t.nombre.toLowerCase().includes(q) ||
            t.doctype.toLowerCase().includes(q) ||
            t.ejemplo.toLowerCase().includes(q),
        )
      : lista
    return NUMERACION_AREAS_ORDEN.map((area) => ({
      area,
      items: filtrada.filter((t) => t.area === area),
    })).filter((g) => g.items.length > 0)
  }, [tipos, busqueda])

  // Tipos con un `area` que no está en el orden conocido: se muestran al final en vez de
  // desaparecer (el backend manda el universo; el orden de §3.1 es "recomendado").
  const extras = useMemo(() => {
    const conocidas = new Set<string>(NUMERACION_AREAS_ORDEN)
    return (tipos ?? []).filter(
      (t) =>
        !conocidas.has(t.area) &&
        (!busqueda.trim() ||
          t.nombre.toLowerCase().includes(busqueda.trim().toLowerCase())),
    )
  }, [tipos, busqueda])

  return (
    <div className="page-container">
      <PageHeader
        overline="Configuración"
        title={<><span className="page-title-dot" />Numeración de documentos</>}
        description="Cómo se numeran los documentos del ERP (series de nombrado). Los cambios aplican solo a documentos nuevos."
        action={<RecargarButton />}
      />

      <div className="card filter-card-navy" style={{ marginBottom: 20 }}>
        <div className="card-body">
          <div className="filter-bar" style={{ margin: 0 }}>
            <div className="filter-bar-left">
              <div className="search-input-wrap">
                <Search size={14} className="search-input-icon" />
                <input
                  className="search-input"
                  placeholder="Buscar por nombre, tipo o ejemplo…"
                  value={busqueda}
                  onChange={(e) => setBusqueda(e.target.value)}
                />
              </div>
            </div>
            <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>
              {(tipos ?? []).length} tipos disponibles
            </span>
          </div>
        </div>
      </div>

      {isLoading && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i}>
              <span className="skeleton-box" style={{ height: 18, width: 140, display: 'block', marginBottom: 12 }} />
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }}>
                {Array.from({ length: 3 }).map((__, j) => (
                  <span key={j} className="skeleton-box" style={{ height: 96, display: 'block' }} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {isError && (
        <div className="inline-alert inline-alert-error">
          <span>No se pudo cargar la numeración. Reintentá en unos minutos.</span>
          <button className="btn btn-ghost btn-size-xs" onClick={() => refetch()}>Reintentar</button>
        </div>
      )}

      {!isLoading && !isError && (tipos ?? []).length === 0 && (
        <div className="card">
          <div className="card-body">
            <div className="empty-state">
              <Hash size={28} style={{ color: 'var(--text-tertiary)', marginBottom: 8 }} />
              <p className="empty-title">Sin tipos de documento habilitados</p>
              <p className="empty-sub">
                No tienes tipos de documento habilitados para configurar. Si lo necesitás,
                pedile a un administrador que active la numeración y te otorgue acceso.
              </p>
            </div>
          </div>
        </div>
      )}

      {!isLoading && !isError && (tipos ?? []).length > 0 && grupos.length === 0 && extras.length === 0 && (
        <div className="card">
          <div className="card-body">
            <div className="empty-state">
              <p className="empty-title">Sin resultados</p>
              <p className="empty-sub">Ningún tipo coincide con “{busqueda}”.</p>
            </div>
          </div>
        </div>
      )}

      {grupos.map((g) => (
        <section key={g.area} style={{ marginBottom: 24 }}>
          <h2 style={{ fontSize: 13, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-tertiary)', margin: '0 0 12px 2px' }}>
            {g.area}
          </h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }}>
            {g.items.map((t) => {
              const chip = etiquetaModo(t.modo)
              return (
                <Link
                  key={t.slug}
                  to={`/config/numeracion/${encodeURIComponent(t.ruta.split('/').pop() ?? t.ruta)}`}
                  className="card"
                  style={{ textDecoration: 'none', color: 'inherit', display: 'block', transition: 'border-color 0.12s' }}
                >
                  <div className="card-body" style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                        <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>{t.nombre}</span>
                        {chip && <span className={`badge ${MODO_CHIP_TONE[t.modo] ?? 'badge-neutral'}`}>{chip}</span>}
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 2 }}>{t.doctype}</div>
                      <div style={{ marginTop: 8 }}>
                        <code style={{ fontSize: 12, background: 'var(--surface-sunken)', border: '1px solid var(--border-subtle)', borderRadius: 6, padding: '2px 8px', color: 'var(--text-secondary)' }}>
                          {t.ejemplo}
                        </code>
                      </div>
                    </div>
                    <ChevronRight size={16} style={{ color: 'var(--text-tertiary)', flexShrink: 0, marginTop: 2 }} />
                  </div>
                </Link>
              )
            })}
          </div>
        </section>
      ))}

      {extras.length > 0 && (
        <section style={{ marginBottom: 24 }}>
          <h2 style={{ fontSize: 13, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-tertiary)', margin: '0 0 12px 2px' }}>
            Otros
          </h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }}>
            {extras.map((t) => (
              <Link
                key={t.slug}
                to={`/config/numeracion/${encodeURIComponent(t.ruta.split('/').pop() ?? t.ruta)}`}
                className="card"
                style={{ textDecoration: 'none', color: 'inherit', display: 'block' }}
              >
                <div className="card-body" style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>{t.nombre}</span>
                    <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 2 }}>{t.doctype}</div>
                  </div>
                  <ChevronRight size={16} style={{ color: 'var(--text-tertiary)', flexShrink: 0, marginTop: 2 }} />
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
