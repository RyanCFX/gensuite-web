// Datos del artículo: qué información de Productos/Inventario ve cada usuario.
// docs/tasks/PROMPT_DATOS_ARTICULO_FRONTEND.md §3.
// A propósito sin imports salvo tipos y el store (hook al final): la lógica pura de abajo se
// prueba con node compilando el módulo (ver scripts/test-datos-articulo.mjs).

import { usePermissionsStore } from '@/stores/permissions.store'
import type { AccesoModo } from './acceso'

/** Los 7 datos recortables — mismos valores que trae `meta.datosRestringidos` (§3.2). */
export type DatoArticulo =
  | 'precioA' | 'precioB' | 'precioC'
  | 'stock' | 'descuento' | 'costo' | 'existenciasAlmacen';

const DATOS_ARTICULO: readonly DatoArticulo[] = [
  'precioA', 'precioB', 'precioC', 'stock', 'descuento', 'costo', 'existenciasAlmacen',
];

/** Componente del catálogo de acceso (`tipo: "dato"`, pantalla `catalogo.datos-articulo`) por dato. */
export const COMPONENTE_DATO: Record<DatoArticulo, string> = {
  precioA: 'catalogo.datos-articulo.ver-precio-a',
  precioB: 'catalogo.datos-articulo.ver-precio-b',
  precioC: 'catalogo.datos-articulo.ver-precio-c',
  stock: 'catalogo.datos-articulo.ver-stock',
  descuento: 'catalogo.datos-articulo.ver-descuento',
  costo: 'catalogo.datos-articulo.ver-costo',
  existenciasAlmacen: 'catalogo.datos-articulo.ver-existencias-almacen',
};

export type VisibilidadArticulo = Record<DatoArticulo, boolean>;

/** Qué datos del artículo ve el usuario — Fuente A (§3.1, para esconder controles ANTES de
 *  pedir). En `off`/`sombra` no hay recorte: todo visible. `componentes` acepta array o Set
 *  (el store guarda un `Set`, el DTO crudo trae array). */
export function visibilidadArticulo(acceso: {
  modo: AccesoModo | string;
  componentes: Iterable<string>;
}): VisibilidadArticulo {
  const set = acceso.componentes instanceof Set ? acceso.componentes : new Set(acceso.componentes);
  const ve = (d: DatoArticulo) => acceso.modo !== 'activo' || set.has(COMPONENTE_DATO[d]);
  return {
    precioA: ve('precioA'),
    precioB: ve('precioB'),
    precioC: ve('precioC'),
    stock: ve('stock'),
    descuento: ve('descuento'),
    costo: ve('costo'),
    existenciasAlmacen: ve('existenciasAlmacen'),
  };
}

/** ¿Ve al menos un nivel de precio? */
export const veAlgunPrecio = (v: VisibilidadArticulo): boolean => v.precioA || v.precioB || v.precioC;

/** Datos recortados en UNA respuesta — Fuente B (§3.2, para pintar cada valor). Solo acepta
 *  los 7 valores conocidos; cualquier otra cosa se ignora (nunca rompe el render). */
export function restringidosDe(res: {
  meta?: { datosRestringidos?: unknown } | null;
}): Set<DatoArticulo> {
  const lista = res?.meta?.datosRestringidos;
  if (!Array.isArray(lista)) return new Set();
  return new Set(lista.filter((d): d is DatoArticulo => typeof d === 'string' && (DATOS_ARTICULO as readonly string[]).includes(d)));
}

/** Une lo que trae la respuesta con lo que ya sabía el store: si la respuesta lista un dato
 *  que el store creía visible, hay que refrescar `GET /me/acceso` (§3.2). Devuelve `true` si
 *  detectó ese desfase. */
export function hayDesfaseDeAcceso(
  restringidos: Set<DatoArticulo>,
  visibilidad: VisibilidadArticulo,
): boolean {
  for (const d of restringidos) {
    if (visibilidad[d]) return true;
  }
  return false;
}

/** Visibilidad del usuario logueado (lee el acceso ya cargado en el store, sin pedir nada). */
export function useDatosArticulo(): VisibilidadArticulo {
  const acceso = usePermissionsStore((s) => s.acceso);
  return visibilidadArticulo(acceso);
}
