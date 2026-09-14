// Cuadre de la migración (solo lectura) — docs/tasks/PROMPT_APERTURA_FRONTEND.md §10.

import { useQuery } from '@tanstack/react-query'
import { CheckCircle2, AlertTriangle } from 'lucide-react'
import { getAperturaResumen } from '@/shared/api/apertura'
import { PageHeader } from '@/components/shared/PageHeader'
import { formatMoney, formatNumber } from '@/lib/formatters'

export default function ResumenPage() {
  const { data: resumen, isLoading } = useQuery({
    queryKey: ['apertura-resumen'],
    queryFn: getAperturaResumen,
  })

  return (
    <div className="page-container">
      <PageHeader
        title={<><span className="page-title-dot" />Cuadre de la Migración</>}
        description="Verifica que el saldo contable de la cuenta de apertura coincida con lo migrado."
      />

      {isLoading || !resumen ? (
        <span className="skeleton-box" style={{ height: 320, width: '100%', display: 'block' }} />
      ) : (
        <>
          <div className="form-row form-row-3" style={{ marginBottom: 16 }}>
            <div className="card">
              <div className="card-header"><h2 className="card-title">Ventas migradas</h2></div>
              <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <span style={{ fontSize: 22, fontWeight: 700 }}>{formatMoney(resumen.ventas.montoMigrado)}</span>
                <span className="td-muted" style={{ fontSize: 13 }}>{formatNumber(resumen.ventas.cantidad)} facturas confirmadas</span>
                <span className="td-muted" style={{ fontSize: 13 }}>Saldo pendiente: {formatMoney(resumen.ventas.saldoPendiente)}</span>
              </div>
            </div>
            <div className="card">
              <div className="card-header"><h2 className="card-title">Compras migradas</h2></div>
              <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <span style={{ fontSize: 22, fontWeight: 700 }}>{formatMoney(resumen.compras.montoMigrado)}</span>
                <span className="td-muted" style={{ fontSize: 13 }}>{formatNumber(resumen.compras.cantidad)} facturas confirmadas</span>
                <span className="td-muted" style={{ fontSize: 13 }}>Saldo pendiente: {formatMoney(resumen.compras.saldoPendiente)}</span>
              </div>
            </div>
            <div className="card">
              <div className="card-header"><h2 className="card-title">Cuenta de Apertura</h2></div>
              <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <span style={{ fontSize: 14, fontWeight: 600 }}>{resumen.cuentaApertura.cuenta ?? '—'}</span>
                <span className="td-muted" style={{ fontSize: 13 }}>Saldo real: {formatMoney(resumen.cuentaApertura.saldo)}</span>
                <span className="td-muted" style={{ fontSize: 13 }}>Esperado: {formatMoney(resumen.cuentaApertura.esperado)}</span>
              </div>
            </div>
          </div>

          <div className={`card ${resumen.cuentaApertura.cuadra ? '' : ''}`} style={{ marginBottom: 16 }}>
            <div className="card-body">
              {resumen.cuentaApertura.cuadra ? (
                <div className="inline-alert inline-alert-success" style={{ margin: 0 }}>
                  <CheckCircle2 size={20} />
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 15 }}>Cuadra</div>
                    <div style={{ fontSize: 13 }}>El saldo contable de la cuenta de apertura coincide con lo migrado.</div>
                  </div>
                </div>
              ) : (
                <div className="inline-alert inline-alert-error" style={{ margin: 0 }}>
                  <AlertTriangle size={20} />
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 15 }}>No cuadra — revisar</div>
                    <div style={{ fontSize: 13 }}>
                      El saldo contable de la cuenta de apertura no coincide con lo migrado. Esto puede indicar
                      que alguien registró un asiento manual sobre esa cuenta. Contacte a Contabilidad/Soporte
                      antes de seguir cargando facturas.
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {resumen.pendienteDeCierre && (
            <div className="inline-alert inline-alert-info" style={{ marginBottom: 16 }}>
              La cuenta puente de apertura todavía tiene saldo distinto de cero — falta el asiento contable
              final que la salda contra Resultados de Años Anteriores. Esa acción es manual, desde el módulo
              de Asientos Contables — este módulo no la ejecuta.
            </div>
          )}

          {resumen.porAnio.length > 0 && (
            <div className="card">
              <div className="card-header"><h2 className="card-title">Por año</h2></div>
              <div className="table-scroll">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Año</th>
                      <th style={{ textAlign: 'right' }}>Ventas</th>
                      <th style={{ textAlign: 'right' }}>Compras</th>
                    </tr>
                  </thead>
                  <tbody>
                    {resumen.porAnio.map((row) => (
                      <tr key={row.anio}>
                        <td>{row.anio}</td>
                        <td style={{ textAlign: 'right' }}>{formatMoney(row.ventas)}</td>
                        <td style={{ textAlign: 'right' }}>{formatMoney(row.compras)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
