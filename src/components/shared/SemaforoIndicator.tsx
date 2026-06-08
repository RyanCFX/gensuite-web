interface SemaforoIndicatorProps {
  status: 'verde' | 'amarillo' | 'rojo'
  usagePct?: number
  totalOutstanding?: number
  creditLimit?: number
  label?: string
}

export function SemaforoIndicator({ status, usagePct, totalOutstanding, creditLimit, label }: SemaforoIndicatorProps) {
  const labels: Record<string, string> = {
    verde: 'Crédito OK',
    amarillo: 'Cerca del límite',
    rojo: 'Límite excedido',
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <span className={`semaforo semaforo-${status}`}>
        <span className="semaforo-dot" aria-hidden="true" />
        {label ?? labels[status]}
        {usagePct !== undefined && ` (${usagePct.toFixed(0)}%)`}
      </span>
      {totalOutstanding !== undefined && creditLimit !== undefined && (
        <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>
          RD${totalOutstanding.toLocaleString('es-DO')} / RD${creditLimit.toLocaleString('es-DO')}
        </span>
      )}
    </div>
  )
}
