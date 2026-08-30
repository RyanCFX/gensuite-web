import { Link } from 'react-router-dom'

// Acceso directo entre documentos del ciclo de venta (cotización → pedido → factura).
// Se muestra en el detalle de cotizaciones, pedidos y facturas.

export interface RelatedDocRow {
  label: string
  /** 1 elemento → enlace directo; varios → lista de códigos, cada uno enlazable. */
  links: { code: string; to: string }[]
}

const linkStyle: React.CSSProperties = {
  fontFamily: 'var(--font-mono, monospace)',
  color: 'var(--color-brand)',
  textDecoration: 'underline',
  width: 'fit-content',
}

export function RelatedDocsCard({ rows }: { rows: RelatedDocRow[] }) {
  const visibles = rows.filter((r) => r.links.length > 0)
  if (visibles.length === 0) return null

  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <div className="card-header">
        <h2 className="card-title">Documentos relacionados</h2>
      </div>
      <div className="card-body">
        <div className="fields-grid">
          {visibles.map((row) => (
            <div className="detail-field" key={row.label}>
              <span className="detail-label">{row.label}</span>
              {row.links.length === 1 ? (
                <Link to={row.links[0].to} className="detail-value" style={linkStyle}>
                  {row.links[0].code}
                </Link>
              ) : (
                <span className="detail-value" style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                  {row.links.map((l, i) => (
                    <span key={l.to}>
                      <Link to={l.to} style={linkStyle}>{l.code}</Link>
                      {i < row.links.length - 1 && <span style={{ color: 'var(--text-tertiary)' }}>·</span>}
                    </span>
                  ))}
                </span>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
