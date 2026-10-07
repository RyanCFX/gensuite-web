/**
 * Etiqueta "Adicional" (docs/tasks/PROMPT_FEATURES_ADICIONALES_FRONTEND.md §4.1).
 * Badge pequeño, solo informativo, sin acción. Se usa en el ítem de menú del módulo y en el
 * encabezado de sus pantallas (vía PageHeader, que lo resuelve solo por ruta).
 */
export function AdicionalBadge({ compact = false }: { compact?: boolean }) {
  return (
    <span
      className="badge badge-info"
      style={compact ? { fontSize: 9, padding: '0 5px', marginLeft: 6, whiteSpace: 'nowrap' } : { fontSize: 10, marginLeft: 6, whiteSpace: 'nowrap' }}
      title="Este módulo es un acceso adicional gestionado por GenSuite"
      aria-label="Acceso adicional gestionado por GenSuite"
    >
      Adicional
    </span>
  )
}
