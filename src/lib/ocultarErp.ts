/**
 * Los clientes de este producto no deben saber que ERPNext es el motor interno del ERP — algunos
 * mensajes que el backend redacta y devuelve tal cual (bloqueantes de `GET /apertura/preflight`,
 * `error.message` de cualquier 4xx/5xx) mencionan "ERPNext" directamente porque están pensados
 * originalmente para quien integra el backend, no para el usuario final.
 *
 * Esta función reescribe los patrones de oración conocidos a voz pasiva/impersonal (ej. "ERPNext
 * rechaza X" -> "se rechazará X"), que es la forma más natural de no nombrar el ERP. Cualquier
 * mención que no matchee un patrón cae al reemplazo genérico "ERPNext" -> "el sistema", que sigue
 * siendo correcto gramaticalmente aunque menos prolijo. Se aplica centralizado en el interceptor de
 * `client.ts` (cualquier `error.message` del backend) y explícitamente donde se muestre texto
 * suelto que no pasa por ahí (ej. `bloqueantes` de un 200).
 */
export function ocultarErp(texto: string): string {
  if (!texto) return texto
  return texto
    .replace(/\bERPNext\s+rechazar[áa]\b/gi, 'se rechazará')
    .replace(/\bERPNext\s+rechaza\b/gi, 'se rechazará')
    .replace(/\bERPNext\s+puede\s+rechazar\b/gi, 'puede rechazarse')
    .replace(/\bERPNext\s+generar[áa]\b/gi, 'se generará')
    .replace(/\bERPNext\s+ejecutar[áa]\b/gi, 'se ejecutará')
    .replace(/\bERPNext\s+no\s+bloquea\b/gi, 'no se bloquea')
    .replace(/\bERPNext\s+dejar[áa]\s+de\s+usarla\b/gi, 'dejará de usarse')
    .replace(/\bERPNext\s+volver[áa]\s+a\s+usarla\b/gi, 'volverá a usarse')
    .replace(/\bERPNext\s+recalcula\b/gi, 'se recalcula')
    .replace(/\bERPNext\s+usa\b/gi, 'se usa')
    .replace(/\bERPNext\s+(lo|los|la|las)\s+asigna\b/gi, 'se asigna')
    .replace(/\ben\s+ERPNext\b/gi, 'en el sistema')
    .replace(/\bpor\s+ERPNext\b/gi, 'por el sistema')
    .replace(/\bde\s+ERPNext\b/gi, 'del sistema')
    .replace(/\bdesde\s+ERPNext\b/gi, 'desde el sistema')
    .replace(/\bERPNext\b/g, 'el sistema')
}
