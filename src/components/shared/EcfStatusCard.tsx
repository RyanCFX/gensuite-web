import { Receipt } from 'lucide-react'
import type { EcfSubmitResult } from '@/shared/api/types'
import { ecfStatusLabel } from '@/lib/dgii'

// Bloque de estado del Comprobante Fiscal Electrónico (e-CF) — reutilizado en el detalle de
// facturas de venta, compras y gastos. El campo `ecf` llega tanto en la respuesta de `submit`
// (recién emitido) como en el GET del documento (estado actualizado por webhook en segundo plano).
export function EcfStatusCard({ ecf }: { ecf: EcfSubmitResult }) {
  return (
    <div
      className={`inline-alert ${ecf.deferred ? 'inline-alert-warn' : 'inline-alert-info'}`}
      style={{ marginBottom: 16, display: 'flex', alignItems: 'flex-start', gap: 8 }}
    >
      <Receipt size={16} style={{ flexShrink: 0, marginTop: 1 }} />
      <div style={{ fontSize: 13, display: 'flex', flexDirection: 'column', gap: 2 }}>
        <strong>Comprobante Fiscal Electrónico</strong>
        <span>{ecfStatusLabel(ecf.status)}</span>
        {ecf.message && <span style={{ color: 'var(--text-secondary)' }}>{ecf.message}</span>}
        {ecf.deferred && (
          <span style={{ color: 'var(--warning-text)' }}>
            Emitido en modo contingencia — se reintentará automáticamente cuando el servicio se restablezca.
          </span>
        )}
        {ecf.qrUrl ? (
          <a href={ecf.qrUrl} target="_blank" rel="noreferrer">
            Ver representación fiscal
          </a>
        ) : (
          <span style={{ color: 'var(--text-tertiary)' }}>
            Código QR en proceso — disponible cuando la DGII confirme el comprobante.
          </span>
        )}
      </div>
    </div>
  )
}
