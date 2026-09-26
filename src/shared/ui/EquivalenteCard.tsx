// Tarjeta compartida para un resultado del motor de recomendación por composición — mismo shape
// en GET /catalog/items/:id/equivalentes (Pantalla C) y en GET /farmacia/busqueda-asistida
// (Pantalla D). docs/tasks/PROMPT_COMPOSICION_MEDICAMENTOS_FRONTEND.md §10.
//
// Reglas de negocio que este componente respeta a propósito (§2):
// - Nunca preselecciona ni dispara la acción de "agregar" sola — siempre requiere el clic
//   explícito del usuario (regla 1).
// - Nunca usa la palabra "bioequivalente" (regla 3).
// - `coincidencia` es el dato principal, `banda` es apoyo — nunca al revés (regla 5).
// - `nivel`/`bonoNegocio` nunca se muestran como dato principal — a lo sumo en el detalle
//   expandible (`nivel`) o nunca (`bonoNegocio`, puramente interno para el orden).
import { useState } from 'react'
import { ChevronDown, ChevronUp, Package } from 'lucide-react'
import { formatDOP } from '@/lib/formatters'
import type { BandaEquivalente, EquivalenteResponseDto } from '@/shared/api/types'

const BANDA_INFO: Record<BandaEquivalente, { texto: string; className: string }> = {
  intercambiable: { texto: 'Misma composición', className: 'badge-success' },
  equivalente: { texto: 'Mismo principio activo', className: 'badge-info' },
  similar: { texto: 'Composición parecida', className: 'badge-warning' },
  relacionado: { texto: 'Comparte principios', className: 'badge-neutral' },
}

const TOPE_TEXTO: Record<string, string> = {
  DATOS_INCOMPLETOS: 'Puntaje limitado por datos incompletos',
  PRINCIPIOS_ADICIONALES: 'Puntaje limitado porque este producto tiene principios adicionales',
}

function Barrita({ label, value }: { label: string; value: number | null }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
      <span style={{ width: 70, color: 'var(--text-secondary)' }}>{label}</span>
      {value === null ? (
        <span style={{ color: 'var(--text-tertiary)' }}>—</span>
      ) : (
        <>
          <div style={{ flex: 1, height: 6, background: 'var(--surface-sunken)', borderRadius: 3, overflow: 'hidden' }}>
            <div style={{ width: `${value}%`, height: '100%', background: 'var(--color-brand)' }} />
          </div>
          <span style={{ width: 34, textAlign: 'right' }}>{value}%</span>
        </>
      )}
    </div>
  )
}

export function EquivalenteCard({
  equivalente,
  onVerFicha,
  onAgregar,
  agregarLabel = 'Agregar',
}: {
  equivalente: EquivalenteResponseDto
  onVerFicha?: (itemId: string) => void
  /** Siempre una elección explícita del usuario (§2 regla 1) — nunca se llama sola. */
  onAgregar?: (equivalente: EquivalenteResponseDto) => void
  agregarLabel?: string
}) {
  const [expandido, setExpandido] = useState(false)
  const { item, coincidencia, banda, detalleCoincidencia, motivo, stock, precio, diferenciaPrecioPct } = equivalente
  const bandaInfo = BANDA_INFO[banda]

  return (
    <div className="card" style={{ padding: 12 }}>
      <div style={{ display: 'flex', gap: 12 }}>
        <div
          style={{
            width: 48, height: 48, borderRadius: 8, background: 'var(--surface-sunken)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, overflow: 'hidden',
          }}
        >
          {item.image
            ? <img src={item.image} alt={item.itemName} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            : <Package size={20} style={{ color: 'var(--text-tertiary)' }} />}
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
            <div style={{ minWidth: 0 }}>
              <a
                style={{ fontWeight: 600, fontSize: 14, cursor: onVerFicha ? 'pointer' : undefined, textDecoration: onVerFicha ? 'underline' : undefined }}
                onClick={() => onVerFicha?.(item.id)}
              >
                {item.itemName}
              </a>
              {item.brand && <span className="td-muted" style={{ marginLeft: 6, fontSize: 12 }}>{item.brand}</span>}
            </div>
            <div style={{ textAlign: 'right', flexShrink: 0 }}>
              <div style={{ fontSize: 18, fontWeight: 700 }}>{coincidencia}%</div>
              <span className={`badge ${bandaInfo.className}`} style={{ fontSize: 10 }}>{bandaInfo.texto}</span>
            </div>
          </div>

          <p className="td-muted" style={{ fontSize: 12, margin: '4px 0' }}>{motivo}</p>

          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', fontSize: 12 }}>
            {precio !== undefined && (
              <span style={{ fontWeight: 600 }}>
                {formatDOP(precio)}
                {diferenciaPrecioPct !== null && (
                  <span style={{ color: diferenciaPrecioPct < 0 ? 'var(--color-success)' : 'var(--color-error)', marginLeft: 4, fontWeight: 500 }}>
                    ({diferenciaPrecioPct > 0 ? '+' : ''}{diferenciaPrecioPct}% {diferenciaPrecioPct < 0 ? 'más barato' : 'más caro'})
                  </span>
                )}
              </span>
            )}
            {stock === null
              ? <span className="td-muted">—</span>
              : stock === 0
                ? <span style={{ color: 'var(--color-error)' }}>Agotado</span>
                : <span style={{ color: 'var(--color-success)' }}>En existencia ({stock})</span>}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 6 }}>
            <button type="button" className="btn btn-ghost btn-size-xs" onClick={() => setExpandido((v) => !v)}>
              {expandido ? <ChevronUp size={12} /> : <ChevronDown size={12} />} Ver detalle
            </button>
            {onAgregar && (
              <button type="button" className="btn btn-secondary btn-size-xs" onClick={() => onAgregar(equivalente)}>
                {agregarLabel}
              </button>
            )}
          </div>

          {expandido && (
            <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--border-subtle)', display: 'flex', flexDirection: 'column', gap: 6 }}>
              <Barrita label="Principios" value={detalleCoincidencia.principios} />
              <Barrita label="Dosis" value={detalleCoincidencia.dosis} />
              <Barrita label="Forma" value={detalleCoincidencia.forma} />
              {detalleCoincidencia.compartidos.length > 0 && (
                <p style={{ fontSize: 12, margin: 0 }}>
                  <span className="td-muted">Compartidos: </span>{detalleCoincidencia.compartidos.join(', ')}
                </p>
              )}
              {detalleCoincidencia.soloEnCandidato.length > 0 && (
                <div className="inline-alert inline-alert-warn" style={{ fontSize: 12, padding: 8 }}>
                  Este producto tiene además: {detalleCoincidencia.soloEnCandidato.join(', ')}
                </div>
              )}
              {detalleCoincidencia.topeAplicado && (
                <p className="td-muted" style={{ fontSize: 11, margin: 0 }} title={detalleCoincidencia.topeAplicado}>
                  {TOPE_TEXTO[detalleCoincidencia.topeAplicado]}
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
