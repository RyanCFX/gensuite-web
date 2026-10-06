import type { ReactNode } from 'react'

// Marcador neutro para un dato recortado por permisos (§5.1 del doc de datos del artículo):
// NUNCA 0, $0.00, "Sin stock" ni vacío sin explicación — un null por permiso se confundiría
// con un dato real. Legible por lector de pantalla ("sin acceso").
export function DatoRestringido({
  children = '—',
  bloqueante = false,
}: {
  /** Contenido a mostrar cuando SÍ hay acceso. */
  children?: ReactNode;
  /** Solo informativo: si es true se muestra el marcador; si es false, los children. */
  bloqueante?: boolean;
}) {
  if (!bloqueante) return <>{children}</>;
  return (
    <span
      aria-label="Sin acceso"
      title="No tenés acceso a este dato"
      style={{ color: 'var(--text-tertiary)' }}
    >
      —
    </span>
  );
}
