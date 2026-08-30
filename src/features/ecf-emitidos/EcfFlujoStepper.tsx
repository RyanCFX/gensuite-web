import { Check, X, AlertTriangle, Clock } from 'lucide-react'
import type { EcfFlujo, EcfFlujoPaso } from '@/shared/api/types'
import { formatDateTime } from '@/lib/formatters'

// Stepper horizontal del flujo de estado de un e-CF ante la DGII. El BFF **deriva** los pasos
// del estado actual (Aura no publica un log de eventos); solo algunos traen `at` real — los que
// no, se muestran como "completado, sin fecha" sin inventar timestamps.

type Tone = 'done' | 'current' | 'error' | 'warn' | 'pending'

function pasoTone(paso: EcfFlujoPaso, flujo: EcfFlujo): Tone {
  if (paso.actual && paso.terminal && flujo.requiereAtencion) {
    return paso.estado === 'CONDITIONAL' ? 'warn' : 'error'
  }
  if (paso.actual) return 'current'
  if (paso.alcanzado) return 'done'
  return 'pending'
}

const TONE_COLOR: Record<Tone, string> = {
  done: 'var(--success-text)',
  current: 'var(--brand-primary)',
  error: 'var(--error-text)',
  warn: 'var(--warning-text)',
  pending: 'var(--border-strong, var(--border-default))',
}

function NodeIcon({ tone }: { tone: Tone }) {
  if (tone === 'error') return <X size={13} strokeWidth={3} />
  if (tone === 'warn') return <AlertTriangle size={12} strokeWidth={2.5} />
  if (tone === 'done') return <Check size={13} strokeWidth={3} />
  if (tone === 'current') return <Clock size={12} strokeWidth={2.5} />
  return null
}

export function EcfFlujoStepper({ flujo }: { flujo: EcfFlujo }) {
  const pasos = flujo.pasos ?? []
  if (pasos.length === 0) return null

  return (
    <div
      className="table-scroll"
      style={{ display: 'flex', alignItems: 'flex-start', paddingBottom: 4, gap: 0 }}
    >
      {pasos.map((paso, i) => {
        const tone = pasoTone(paso, flujo)
        const color = TONE_COLOR[tone]
        const filled = tone !== 'pending'
        return (
          <div
            key={`${paso.estado}-${i}`}
            style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 1, minWidth: 120 }}
          >
            <div style={{ display: 'flex', alignItems: 'center', width: '100%' }}>
              <span
                style={{
                  flex: 1, height: 2, borderRadius: 2,
                  background: i === 0 ? 'transparent' : paso.alcanzado ? TONE_COLOR.done : TONE_COLOR.pending,
                }}
              />
              <span
                aria-hidden
                style={{
                  width: 24, height: 24, borderRadius: '50%', flexShrink: 0,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  border: `2px solid ${color}`,
                  background: filled ? color : 'var(--surface-base, transparent)',
                  color: filled ? 'var(--surface-base, #fff)' : color,
                  boxShadow: paso.actual ? `0 0 0 4px color-mix(in srgb, ${color} 20%, transparent)` : 'none',
                }}
              >
                <NodeIcon tone={tone} />
              </span>
              <span
                style={{
                  flex: 1, height: 2, borderRadius: 2,
                  background: i === pasos.length - 1 ? 'transparent' : pasos[i + 1]?.alcanzado ? TONE_COLOR.done : TONE_COLOR.pending,
                }}
              />
            </div>
            <div style={{ marginTop: 6, textAlign: 'center', padding: '0 4px' }}>
              <div style={{ fontSize: 12, fontWeight: paso.actual ? 600 : 500, color: paso.actual ? 'var(--text-primary)' : 'var(--text-secondary)' }}>
                {paso.label}
              </div>
              <div style={{ fontSize: 10.5, color: 'var(--text-tertiary)', marginTop: 2 }}>
                {paso.at ? formatDateTime(paso.at) : paso.alcanzado ? 'Completado' : '—'}
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
