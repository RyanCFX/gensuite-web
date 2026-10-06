/** Id del input de cantidad de la línea `index` — se asigna al `QtyInput` de cada fila. */
export const lineQtyId = (index: number) => `line-qty-${index}`

/**
 * Enfoca (y selecciona) el input de cantidad de la línea `index`. Pensado para después de agregar
 * un artículo por código de barras: la fila puede no estar renderizada todavía, así que se
 * reintenta unos cuadros hasta que el input exista y esté habilitado. No hace nada si la
 * pantalla no tiene ese input.
 */
export function focusLineQty(index: number, attempts = 20) {
  const el = document.getElementById(lineQtyId(index)) as HTMLInputElement | null
  if (el && !el.disabled) {
    el.focus()
    el.select()
    return
  }
  if (attempts > 0) setTimeout(() => focusLineQty(index, attempts - 1), 50)
}
