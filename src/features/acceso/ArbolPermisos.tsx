import { useMemo, useState } from 'react'
import { Lock, Info, TriangleAlert } from 'lucide-react'
import type { AccesoCatalogo, AccesoCatalogoModulo, AccesoCatalogoPantalla } from '@/shared/api/types'
import {
  conRequisitos,
  dependientesMarcados,
  type EstadoPantalla,
} from '@/shared/permissions/acceso'

// Editor de árbol Módulo → Pantalla → Componente (perfiles y excepciones de usuario).
// docs/tasks/PROMPT_PERMISOS_V2_Y_DASHBOARD_MODULAR_FRONTEND.md §7.3.

export type FiltroTipo = 'todos' | 'vista' | 'accion' | 'filtro' | 'exportar' | 'widget' | 'dato'

const TIPO_LABEL: Record<string, string> = {
  vista: 'Vista',
  accion: 'Acción',
  filtro: 'Filtro',
  exportar: 'Exportar',
  widget: 'Dashboard',
  // Datos del artículo (docs/tasks/PROMPT_DATOS_ARTICULO_FRONTEND.md §9): qué información del
  // artículo ve la persona dentro de Productos e Inventario. Un tipo desconocido cae al genérico
  // (`?? c.tipo`), nunca rompe el árbol.
  dato: 'Dato',
}

function vacio(): EstadoPantalla {
  return { marcados: new Set(), incluirFuturos: true }
}

function noSensibles(p: AccesoCatalogoPantalla): string[] {
  return p.componentes.filter((c) => c.incluirEnCompleta !== false).map((c) => c.key)
}

export function ArbolPermisos({ catalogo, estados, onChange, readOnly = false }: {
  catalogo: AccesoCatalogo
  estados: Record<string, EstadoPantalla>
  onChange: (estados: Record<string, EstadoPantalla>) => void
  readOnly?: boolean
}) {
  const [busqueda, setBusqueda] = useState('')
  const [tipo, setTipo] = useState<FiltroTipo>('todos')
  const modulos = useMemo(() => catalogo.modulos, [catalogo])

  const q = busqueda.trim().toLowerCase()
  function coincide(texto: string) {
    return !q || texto.toLowerCase().includes(q)
  }

  function setPantalla(key: string, e: EstadoPantalla) {
    onChange({ ...estados, [key]: e })
  }

  function marcarModulo(m: AccesoCatalogoModulo, modo: 'nada' | 'completo') {
    const next = { ...estados }
    for (const p of m.pantallas) {
      next[p.key] = modo === 'nada'
        ? vacio()
        : { marcados: new Set(p.componentes.map((c) => c.key)), incluirFuturos: true }
    }
    onChange(next)
  }

  function marcarPantalla(p: AccesoCatalogoPantalla, modo: 'nada' | 'completa' | 'personalizada') {
    if (modo === 'nada') {
      setPantalla(p.key, vacio())
    } else if (modo === 'completa') {
      setPantalla(p.key, { marcados: new Set(p.componentes.map((c) => c.key)), incluirFuturos: true })
    } else {
      const actual = estados[p.key] ?? vacio()
      setPantalla(p.key, { marcados: new Set(actual.marcados), incluirFuturos: false })
    }
  }

  function toggleComponente(p: AccesoCatalogoPantalla, key: string) {
    const actual = estados[p.key] ?? vacio()
    const marcados = new Set(actual.marcados)
    if (marcados.has(key)) {
      marcados.delete(key)
    } else {
      for (const k of conRequisitos(modulos, marcados, key)) marcados.add(k)
    }
    setPantalla(p.key, { marcados, incluirFuturos: actual.incluirFuturos })
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div className="filter-bar" style={{ margin: 0 }}>
        <div className="filter-bar-left" style={{ flex: 1 }}>
          <div className="search-input-wrap" style={{ minWidth: 220, flex: 1 }}>
            <input
              className="search-input"
              placeholder="Buscar módulo, pantalla o permiso…"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
            />
          </div>
          <label className="ff-label" style={{ margin: 0 }}>Tipo</label>
          <select
            className="ff-input ff-input-sm"
            value={tipo}
            onChange={(e) => setTipo(e.target.value as FiltroTipo)}
            style={{ width: 150 }}
          >
            <option value="todos">Todos</option>
            <option value="vista">Vistas</option>
            <option value="accion">Acciones</option>
            <option value="filtro">Filtros</option>
            <option value="exportar">Exportar</option>
            <option value="widget">Dashboard</option>
            <option value="dato">Datos</option>
          </select>
        </div>
      </div>

      {modulos.map((m) => {
        const pantallasVisibles = m.pantallas.filter((p) => {
          if (!coincide(m.nombre) && !coincide(p.nombre) && !p.componentes.some((c) => coincide(c.nombre))) return false
          if (tipo !== 'todos' && !p.componentes.some((c) => c.tipo === tipo)) return false
          return true
        })
        if (pantallasVisibles.length === 0) return null
        const estadosMod = m.pantallas.map((p) => estados[p.key] ?? vacio())
        const algoMarcado = estadosMod.some((e) => e.marcados.size > 0)
        const todoCompleto = m.pantallas.length > 0 && m.pantallas.every((p) => {
          const e = estados[p.key] ?? vacio()
          return e.incluirFuturos && noSensibles(p).every((k) => e.marcados.has(k))
        })
        const modoModulo = !algoMarcado ? 'nada' : todoCompleto ? 'completo' : 'personalizado'
        return (
          <div key={m.key} className="card" style={{ margin: 0 }}>
            <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                <strong style={{ fontSize: 14, minWidth: 140 }}>{m.nombre}</strong>
                {!readOnly && (
                  <div role="radiogroup" aria-label={m.nombre} style={{ display: 'flex', gap: 12, fontSize: 13 }}>
                    <label className="ff-check-wrap">
                      <input type="radio" className="ff-check" checked={modoModulo === 'nada'} onChange={() => marcarModulo(m, 'nada')} />
                      Nada
                    </label>
                    <label className="ff-check-wrap">
                      <input type="radio" className="ff-check" checked={modoModulo === 'completo'} onChange={() => marcarModulo(m, 'completo')} />
                      Completo
                    </label>
                    <span style={{ color: modoModulo === 'personalizado' ? 'var(--text-primary)' : 'var(--text-tertiary)' }}>
                      ● Personalizado
                    </span>
                  </div>
                )}
              </div>
              {pantallasVisibles.map((p) => {
                const e = estados[p.key] ?? vacio()
                const total = p.componentes.length
                const marcados = p.componentes.filter((c) => e.marcados.has(c.key)).length
                const nada = e.marcados.size === 0
                const completa = !nada && e.incluirFuturos && noSensibles(p).every((k) => e.marcados.has(k))
                const excepto = completa ? noSensibles(p).filter((k) => !e.marcados.has(k)) : []
                const comps = p.componentes.filter((c) => (tipo === 'todos' || c.tipo === tipo) && coincide(c.nombre))
                return (
                  <div key={p.key} style={{ borderTop: '1px solid var(--border-default)', paddingTop: 8 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 13, fontWeight: 600, minWidth: 140 }}>{p.nombre}</span>                      {!readOnly && (
                        <div role="radiogroup" aria-label={p.nombre} style={{ display: 'flex', gap: 12, fontSize: 13 }}>
                          <label className="ff-check-wrap">
                            <input type="radio" className="ff-check" checked={nada} onChange={() => marcarPantalla(p, 'nada')} />
                            Nada
                          </label>
                          <label className="ff-check-wrap">
                            <input type="radio" className="ff-check" checked={completa} onChange={() => marcarPantalla(p, 'completa')} />
                            Completa{excepto.length > 0 ? ' excepto…' : ''}
                          </label>
                          <label className="ff-check-wrap" title="Solo algunos componentes (no incluye lo que se agregue en el futuro)">
                            <input
                              type="radio" className="ff-check"
                              checked={!nada && !completa}
                              onChange={() => marcarPantalla(p, 'personalizada')}
                            />
                            Personalizada
                          </label>
                        </div>
                      )}
                      <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>{marcados} de {total}</span>
                    </div>
                    {p.key === 'catalogo.datos-articulo' && (
                      <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: '6px 0 0' }}>
                        Estos permisos limitan qué información del artículo ve la persona dentro de
                        Productos e Inventario. Código, descripción, categoría y marca siempre se ven.
                      </p>
                    )}                    {comps.length > 0 && (
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 4, marginTop: 6 }}>
                        {comps.map((c) => {
                          const marcado = e.marcados.has(c.key)
                          const deshabilitado = readOnly || !c.otorgable
                          const deps = marcado ? dependientesMarcados(modulos, e.marcados, c.key) : []
                          return (
                            <label
                              key={c.key}
                              className="ff-check-wrap"
                              style={{ fontSize: 13, opacity: deshabilitado && !readOnly ? 0.6 : 1 }}
                              title={[
                                c.descripcion ?? c.nombre,
                                ...(c.recursos.length > 0 ? [`Habilita lista de: ${c.recursos.join(', ')}`] : []),
                                ...(!c.otorgable ? ['No puede otorgar un permiso que usted no tiene'] : []),
                                ...(c.incluirEnCompleta === false ? ['No se incluye al dar la pantalla completa: hay que marcarlo a mano'] : []),
                                ...(deps.length > 0 ? [`Si lo quita, quedan sin efecto: ${deps.join(', ')}`] : []),
                              ].join('\n')}
                            >
                              <input
                                type="checkbox"
                                className="ff-check"
                                checked={marcado}
                                disabled={deshabilitado}
                                onChange={() => toggleComponente(p, c.key)}
                              />
                              {c.incluirEnCompleta === false && (
                                <Lock size={12} aria-label="Sensible: no se incluye al dar la pantalla completa" style={{ flexShrink: 0 }} />
                              )}
                              <span>{c.nombre}</span>
                              <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{TIPO_LABEL[c.tipo] ?? c.tipo}</span>
                              {c.recursos.length > 0 && (
                                <Info size={12} aria-label={`Habilita lista de: ${c.recursos.join(', ')}`} style={{ flexShrink: 0, color: 'var(--text-tertiary)' }} />
                              )}
                              {deps.length > 0 && (
                                <TriangleAlert size={12} aria-label={`Si lo quita, quedan sin efecto: ${deps.join(', ')}`} style={{ flexShrink: 0, color: 'var(--warning-text)' }} />
                              )}
                            </label>
                          )
                        })}
                      </div>
                    )}
                    {!nada && (
                      <label className="ff-check-wrap" style={{ fontSize: 12, marginTop: 6 }} title="Con esto marcado se guarda un permiso de pantalla (incluye lo que se agregue en el futuro). Sin esto, se guarda un permiso por componente.">
                        <input
                          type="checkbox"
                          className="ff-check"
                          checked={e.incluirFuturos}
                          disabled={readOnly}
                          onChange={() => setPantalla(p.key, { marcados: new Set(e.marcados), incluirFuturos: !e.incluirFuturos })}
                        />
                        Incluir lo que se agregue en el futuro
                      </label>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )
      })}
    </div>
  )
}
