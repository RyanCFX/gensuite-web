import { Wallet } from 'lucide-react'
import { formatDOP } from '@/lib/formatters'
import type { CorteCaja } from '@/shared/api/types'

/**
 * Renderiza las secciones del reporte "Corte de Caja" (por turno o consolidado
 * del día — mismo shape en ambos casos). No hay fila "Delivery" en este sistema.
 * "Ventas a Crédito" y "Recibos de Contado" siempre vienen en 0 — es correcto,
 * no un dato faltante. "Importe a Entregar" es solo el efectivo físico (Cash).
 */
export function CorteCajaView({ corteCaja }: { corteCaja: CorteCaja }) {
  const row = (label: string, value: number, opts?: { bold?: boolean; muted?: boolean }) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: 13 }}>
      <span style={{ color: opts?.muted ? 'var(--text-tertiary)' : 'var(--text-secondary)' }}>{label}</span>
      <span style={{ fontFamily: 'var(--font-mono)', fontWeight: opts?.bold ? 700 : 500 }}>{formatDOP(value)}</span>
    </div>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16 }}>
        <div className="card" style={{ padding: '14px 16px' }}>
          <div className="card-title" style={{ fontSize: 13, marginBottom: 8 }}>Ventas del Día</div>
          {row('Ventas de contado', corteCaja.ventasDelDia.ventasContado)}
          {row('Ventas a crédito', corteCaja.ventasDelDia.ventasCredito, { muted: true })}
          {row('Total', corteCaja.ventasDelDia.total, { bold: true })}
        </div>

        <div className="card" style={{ padding: '14px 16px' }}>
          <div className="card-title" style={{ fontSize: 13, marginBottom: 8 }}>Devoluciones</div>
          {row('Total', corteCaja.devoluciones.total, { bold: true })}
        </div>

        <div className="card" style={{ padding: '14px 16px' }}>
          <div className="card-title" style={{ fontSize: 13, marginBottom: 8 }}>Recibos Cobrados</div>
          {row('Total', corteCaja.recibosCobrados.total, { muted: true, bold: true })}
        </div>

        <div className="card" style={{ padding: '14px 16px' }}>
          <div className="card-title" style={{ fontSize: 13, marginBottom: 8 }}>Ventas Netas</div>
          {row('Total', corteCaja.ventasNetas.total, { bold: true })}
        </div>
      </div>

      {/* Ingresos — filas dinámicas por método de pago real del tenant */}
      <div className="card">
        <div className="card-header">
          <span className="card-title">Ingresos</span>
        </div>
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>Método</th>
                <th style={{ textAlign: 'right' }}>Ventas de Contado</th>
                <th style={{ textAlign: 'right' }}>Recibos Cobrados</th>
                <th style={{ textAlign: 'right' }}>Total</th>
              </tr>
            </thead>
            <tbody>
              {corteCaja.ingresos.length === 0 ? (
                <tr>
                  <td colSpan={4} style={{ textAlign: 'center', padding: 24, color: 'var(--text-tertiary)' }}>
                    Sin ingresos registrados
                  </td>
                </tr>
              ) : (
                corteCaja.ingresos.map((i) => (
                  <tr key={i.metodo}>
                    <td>{i.metodo}</td>
                    <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)' }}>{formatDOP(i.ventasContado)}</td>
                    <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)' }}>{formatDOP(i.recibosCobrados)}</td>
                    <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontWeight: 600 }}>{formatDOP(i.total)}</td>
                  </tr>
                ))
              )}
            </tbody>
            {corteCaja.ingresos.length > 0 && (
              <tfoot>
                <tr style={{ borderTop: '2px solid var(--border-strong)' }}>
                  <td style={{ fontWeight: 600 }}>Total</td>
                  <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontWeight: 600 }}>
                    {formatDOP(corteCaja.ingresos.reduce((s, i) => s + i.ventasContado, 0))}
                  </td>
                  <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontWeight: 600 }}>
                    {formatDOP(corteCaja.ingresos.reduce((s, i) => s + i.recibosCobrados, 0))}
                  </td>
                  <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontWeight: 700 }}>
                    {formatDOP(corteCaja.ingresos.reduce((s, i) => s + i.total, 0))}
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16 }}>
        <div className="card" style={{ padding: '14px 16px' }}>
          <div className="card-title" style={{ fontSize: 13, marginBottom: 8 }}>Egresos</div>
          {row('Devoluciones', corteCaja.egresos.devoluciones)}
          {row('Otros egresos', corteCaja.egresos.otrosEgresos)}
          {row('Total', corteCaja.egresos.total, { bold: true })}
        </div>

        <div className="card" style={{ padding: '14px 16px' }}>
          <div className="card-title" style={{ fontSize: 13, marginBottom: 8 }}>Fondo de Apertura</div>
          <div style={{ fontSize: 20, fontWeight: 700, fontFamily: 'var(--font-mono)' }}>
            {formatDOP(corteCaja.fondoApertura)}
          </div>
        </div>

        <div className="card" style={{ padding: '14px 16px', borderColor: 'var(--brand-primary)' }}>
          <div className="card-title" style={{ fontSize: 13, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
            <Wallet size={14} /> Importe a Entregar
          </div>
          <div style={{ fontSize: 20, fontWeight: 700, fontFamily: 'var(--font-mono)', color: 'var(--brand-primary)' }}>
            {formatDOP(corteCaja.importeAEntregar)}
          </div>
          <p style={{ fontSize: 11, color: 'var(--text-tertiary)', margin: '4px 0 0' }}>
            Solo efectivo físico (métodos de pago tipo Cash).
          </p>
        </div>
      </div>
    </div>
  )
}
