#!/usr/bin/env node
// BFF SIMULADO (no es el real) para probar el módulo Delivery de gensuite-web de punta a punta.
// Sin dependencias: http nativo + un mini servidor Socket.IO (EIO4, solo websocket) para realtime.
//
//   node scripts/mock-bff-delivery.mjs            # puerto 4010
//   VITE_API_PROXY_TARGET=http://localhost:4010 npx vite --port 5196 --strictPort
//
// Control:
//   POST /__mock/escenario   { preset?: string, ...campos }  (ver PRESETS) — reinicia datos si reset:true
//   POST /__mock/inject      { method, path (regex string), status, code, message, details, once }
//   POST /__mock/emit        { event, payload }   (realtime)
//   GET  /__mock/estado      estado en memoria (debug)
//   GET  /__mock/log         últimas requests (incluye las no reconocidas -> catch-all)
//
// Formato: éxito { success:true, data, meta? }  error { success:false, error:{code,message,statusCode,details} }

import http from 'node:http'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const PORT = Number(process.env.MOCK_PORT || 4010)
const __dirname = path.dirname(fileURLToPath(import.meta.url))

// ───────────────────────── utilidades ─────────────────────────
const round2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100
const now = () => new Date().toISOString()
const today = () => new Date().toISOString().slice(0, 10)
const clone = (o) => JSON.parse(JSON.stringify(o))

function send(res, status, body, headers = {}) {
  const buf = Buffer.isBuffer(body) ? body : Buffer.from(JSON.stringify(body))
  res.writeHead(status, { 'Content-Type': Buffer.isBuffer(body) ? 'application/pdf' : 'application/json', ...headers })
  res.end(buf)
}
const ok = (res, data, meta, status = 200) => send(res, status, meta ? { success: true, data, meta } : { success: true, data })
const fail = (res, status, code, message, details) =>
  send(res, status, { success: false, error: { code, message, statusCode: status, ...(details !== undefined ? { details } : {}) } })
class HttpErr extends Error {
  constructor(status, code, message, details) { super(message); this.status = status; this.code = code; this.details = details }
}
const E = (status, code, message, details) => new HttpErr(status, code, message, details)

function paginate(arr, q) {
  const limit = Math.min(Number(q.limit) || 20, 100)
  const offset = Number(q.offset) || 0
  return { rows: arr.slice(offset, offset + limit), meta: { total: arr.length, limit, offset, hasMore: offset + limit < arr.length } }
}

// ───────────────────────── permisos / escenarios ─────────────────────────
const ALL_ACCIONES = (() => {
  try {
    const src = fs.readFileSync(path.join(__dirname, '../src/shared/permissions/acciones.generated.ts'), 'utf8')
    const ids = new Set()
    for (const m of src.matchAll(/^  '([a-z0-9_.\-]+)',?$/gm)) ids.add(m[1])
    return [...ids]
  } catch { return [] }
})()

const DELIVERY_ACCIONES = ALL_ACCIONES.filter((a) => a.startsWith('delivery.') || a.startsWith('config.delivery.'))

const DEFAULT_SC = {
  preset: 'normal',
  feature: true,              // features.delivery
  despachoFeature: true,      // features.despacho
  habilitado: true,           // deliveryHabilitado
  despachoHabilitado: true,
  usaModuloPos: true,
  flujoCobro: 'caja',         // 'caja' | 'directo'
  permiteDiferencias: true,   // deliveryPermiteDiferencias
  cuentaDiferencias: '5101 - Diferencia de caja - D',
  confirmaConcilia: false,    // deliveryConfirmarEntregaConciliaCobro
  conciliaConfirma: false,    // deliveryConciliarCobroConfirmaEntrega
  turnoAbierto: true,
  puenteCuadra: true,
  denied: [],                 // acciones denegadas
  allowOnly: null,            // si es array: solo estas acciones delivery.* / config.delivery.*
  repartidorCrear403: false,
  forceAutoOmit: null,        // 'ERROR' | 'COBRO_NO_PENDIENTE' fuerza autoConciliacion.omitida
  seedData: true,
}

const PRESETS = {
  normal: {},
  caja_directo: { flujoCobro: 'directo', usaModuloPos: false },
  sin_pos: { usaModuloPos: false, flujoCobro: 'directo' },
  sin_permisos: { denied: ['__todo_delivery__'] },
  // solo lectura de pantallas
  solo_lectura: { allowOnly: ['delivery.pendientes.listar', 'delivery.viajes.listar', 'delivery.cobros.listar', 'delivery.repartidores.listar', 'delivery.vehiculos.listar'] },
  // cajero: lista y concilia, sin faltante
  cajero: { allowOnly: ['delivery.cobros.listar', 'delivery.cobros.conciliar'] },
  // cajero con permiso de faltante
  cajero_con_faltante: { allowOnly: ['delivery.cobros.listar', 'delivery.cobros.conciliar', 'delivery.cobros.conciliar-con-diferencia'] },
  // despacho: todo menos cobros
  despacho: { denied: ['delivery.cobros.listar', 'delivery.cobros.conciliar', 'delivery.cobros.conciliar-con-diferencia'] },
  drenaje: { feature: false },
  apagado_sin_pendientes: { feature: false, seedData: false },
  sin_feature_sin_permiso: { feature: false, seedData: false, denied: ['__todo_delivery__'] },
  sin_habilitar: { habilitado: false },
  sin_habilitar_sin_despacho: { habilitado: false, despachoHabilitado: false },
  automatismos: { confirmaConcilia: true, conciliaConfirma: true },
  sin_diferencias: { permiteDiferencias: false },
  turno_cerrado: { turnoAbierto: false },
  sin_datos: { seedData: false },
}

let sc = { ...DEFAULT_SC }
let injects = []
const reqLog = []
let S = null

function accionesMap() {
  const out = {}
  for (const id of ALL_ACCIONES) out[id] = true
  const deniedAll = sc.denied.includes('__todo_delivery__')
  for (const id of DELIVERY_ACCIONES) {
    if (deniedAll) out[id] = false
    if (sc.allowOnly) out[id] = sc.allowOnly.includes(id)
    if (sc.denied.includes(id)) out[id] = false
  }
  return out
}
const can = (id) => accionesMap()[id] === true
function needPerm(id) {
  if (!can(id)) {
    throw E(403, 'PERMISO_INSUFICIENTE', `No tienes permiso para esta acción (${id}).`, { accion: id })
  }
}
function needFeature() {
  if (!sc.feature) throw E(403, 'FEATURE_NO_CONTRATADO', 'Tu empresa no tiene contratado el módulo Delivery.', { features: ['delivery'] })
}
function needHabilitado() {
  if (!sc.habilitado) throw E(400, 'DELIVERY_NO_HABILITADO', 'Delivery no está habilitado en este tenant.')
}

// ───────────────────────── datos semilla ─────────────────────────
const CUSTOMERS = {
  'C-001': { id: 'C-001', customerName: 'Cliente Uno SRL', address: 'Calle Duarte #12, Santo Domingo', phone: '809-555-0001', hasCredit: false, rnc: '131000001' },
  'C-002': { id: 'C-002', customerName: 'María Gómez', address: 'Av. Independencia 450, Piantini', phone: '809-555-0002', hasCredit: false },
  'C-CRED': { id: 'C-CRED', customerName: 'Ferretería Crédito SA', address: 'Zona Industrial Herrera', phone: '809-555-0003', hasCredit: true, creditLimit: 500000, creditDays: 30, rnc: '131000009' },
  'C-NOADDR': { id: 'C-NOADDR', customerName: 'Cliente Sin Dirección', address: '', phone: '', hasCredit: false },
}
const ITEMS = {
  'ART-001': { id: 'ART-001', itemName: 'Producto simple', type: 'product', standardRate: 500, prices: { A: 500, B: 480, C: 450 }, stockUom: 'Unidad', uom: 'Unidad', currentStock: 100, disponible: 100 },
  'ART-002': { id: 'ART-002', itemName: 'Producto caro', type: 'product', standardRate: 1500, prices: { A: 1500, B: 1400, C: 1300 }, stockUom: 'Unidad', uom: 'Unidad', currentStock: 50, disponible: 50 },
  'LAP-001': { id: 'LAP-001', itemName: 'Laptop (serial)', type: 'product', standardRate: 30000, prices: { A: 30000, B: 29000, C: 28000 }, stockUom: 'Unidad', uom: 'Unidad', currentStock: 5, disponible: 5, hasSerialNo: true },
  'ART-NOSTOCK': { id: 'ART-NOSTOCK', itemName: 'Sin existencia', type: 'product', standardRate: 700, prices: { A: 700, B: 700, C: 700 }, stockUom: 'Unidad', uom: 'Unidad', currentStock: 0, disponible: 0 },
}

function mkInvoice(o) {
  const grand = o.grandTotal
  const inv = {
    id: o.id, status: o.status ?? 'submitted', paymentStatus: 'unpaid',
    customer: o.customer, customerName: CUSTOMERS[o.customer]?.customerName ?? o.customerName ?? o.customer,
    postingDate: today(), dueDate: today(), branch: 'Sucursal Principal',
    ncf: o.status === 'draft' ? undefined : (o.ncf ?? `B0200000${String(o.id).slice(-3)}`), ncfType: 'B02',
    subtotal: round2(grand / 1.18), grandTotal: grand, roundedTotal: grand, roundingAdjustment: 0, taxAmount: round2(grand - grand / 1.18),
    outstandingAmount: 0, items: o.items ?? [{ itemCode: 'ART-001', description: 'Producto simple', qty: Math.max(1, Math.round(grand / 500)), rate: 500, amount: grand, uom: 'Unidad', warehouse: 'Almacén Principal - D' }],
    sequence: 1, createdAt: now(), modifiedAt: now(), currency: 'DOP',
    esClienteOcasional: false,
    _turno: o.turno ?? null, _tracking: o.tracking ?? [], _trackingProvided: {}, _flags: o.flags ?? {}, _despacho: o.despacho ?? null,
    _enCaja: !!o.enCaja, _motivo: null, _confirmadoPor: null, _confirmadoEn: null, _repartidor: null,
  }
  if (o.delivery) {
    inv.delivery = {
      esDelivery: true, direccion: o.delivery.direccion ?? CUSTOMERS[o.customer]?.address, telefono: o.delivery.telefono, referencia: o.delivery.referencia,
      estado: o.delivery.estado ?? 'pendiente', viaje: o.delivery.viaje,
      cobro: {
        estado: o.delivery.cobroEstado ?? 'por_conciliar',
        montoPorConciliar: o.delivery.cobroEstado === 'conciliado' || o.delivery.cobroEstado === 'revertido' ? 0 : (o.delivery.montoPorConciliar ?? grand),
        previsto: o.delivery.previsto ?? [{ modeOfPayment: 'Efectivo', amount: grand }],
        ...(o.delivery.cobroEstado === 'conciliado' ? { conciliadoPor: 'cajero@demo.do', conciliadoEn: now() } : {}),
      },
    }
  }
  return inv
}

function seed() {
  const st = {
    counters: { inv: 100, viaje: 10, dn: 50, pe: 1, nc: 1, vehOps: 0, ncf: 200 },
    invoices: new Map(), viajes: new Map(),
    repartidores: [
      { id: 'DRV-001', nombre: 'Juan Pérez', telefono: '809-111-0001', licencia: 'L-1001', empleado: 'EMP-001', usuario: 'juan@demo.do', transportista: '', estado: 'activo' },
      { id: 'DRV-002', nombre: 'Pedro Motoconcho', telefono: '809-111-0002', licencia: '', empleado: '', usuario: '', transportista: 'Motoconchos RD', estado: 'activo' },
      { id: 'DRV-003', nombre: 'Luis Suspendido', telefono: '', licencia: '', empleado: '', usuario: '', transportista: '', estado: 'suspendido' },
    ],
    vehiculos: [
      { id: 'GENERICO', placa: 'GENERICO', marca: 'Genérico', modelo: 'Vehículo por defecto', color: '' },
      { id: 'A123456', placa: 'A123456', marca: 'Honda', modelo: 'CG 150', color: 'Rojo' },
      { id: 'L987654', placa: 'L987654', marca: 'Toyota', modelo: 'Hilux', color: 'Blanco' },
    ],
    turno: { openingEntryId: 'POS-OPE-0001', posProfile: 'POS Principal', company: 'Demo SRL', periodStartDate: now(), turnoMaxHoras: 24, modoPagoCaja: 'Efectivo', montoCaja: 2000, modeOfPayment: 'Efectivo', openingAmount: 2000 },
    turnoSeq: 1, cerrados: [], notaCreditoSeq: 1,
    config: { cuentaDiferencias: sc.cuentaDiferencias, vehiculoPorDefecto: 'GENERICO', ciudadPorDefecto: 'Santo Domingo' },
  }
  if (sc.seedData) {
    const T = st.turno.openingEntryId
    const add = (o) => { const i = mkInvoice(o); st.invoices.set(i.id, i); return i }
    // pendientes de asignar
    add({ id: 'INV-0001', customer: 'C-001', grandTotal: 1000, turno: T, delivery: { telefono: '809-555-0001', referencia: 'Portón negro', previsto: [{ modeOfPayment: 'Efectivo', amount: 1000 }] } })
    add({ id: 'INV-0002', customer: 'C-002', grandTotal: 2500, turno: T, delivery: { previsto: [{ modeOfPayment: 'Tarjeta', amount: 1500 }, { modeOfPayment: 'Efectivo', amount: 1000 }] } })
    add({ id: 'INV-0003', customer: 'C-001', grandTotal: 60000, turno: T, items: [{ itemCode: 'LAP-001', description: 'Laptop (serial)', qty: 2, rate: 30000, amount: 60000, uom: 'Unidad', warehouse: 'Almacén Principal - D' }], tracking: [{ itemCode: 'LAP-001', qty: 2, tipo: 'serial' }], delivery: { previsto: [{ modeOfPayment: 'Efectivo', amount: 60000 }] } })
    add({ id: 'INV-0004', customer: 'C-002', grandTotal: 800, turno: T, flags: { stockOnce: true }, delivery: { previsto: [{ modeOfPayment: 'Efectivo', amount: 800 }] } })
    add({ id: 'INV-0005', customer: 'C-001', grandTotal: 900, turno: T, flags: { dnsOnce: true }, delivery: { previsto: [{ modeOfPayment: 'Efectivo', amount: 900 }] } })
    add({ id: 'INV-0006', customer: 'C-002', grandTotal: 700, turno: T, flags: { parcialOnce: true }, delivery: { previsto: [{ modeOfPayment: 'Efectivo', amount: 700 }] } })
    // con despacho previo (para DELIVERY_FACTURA_YA_DESPACHADA)
    add({ id: 'INV-0007', customer: 'C-001', grandTotal: 1200, turno: T, despacho: { dn: 'DN-0099', viaje: 'V-0099' }, delivery: { previsto: [{ modeOfPayment: 'Efectivo', amount: 1200 }] } })
    // no entregada, cobro por conciliar -> anular
    add({ id: 'INV-0008', customer: 'C-002', grandTotal: 1800, turno: T, delivery: { estado: 'no_entregado', previsto: [{ modeOfPayment: 'Efectivo', amount: 1800 }] } })
    // no entregada pero ya conciliada -> DELIVERY_ANULACION_NO_PERMITIDA
    add({ id: 'INV-0009', customer: 'C-001', grandTotal: 1100, turno: T, delivery: { estado: 'no_entregado', cobroEstado: 'conciliado', previsto: [{ modeOfPayment: 'Efectivo', amount: 1100 }] } })
    // en ruta (para confirmar) dentro de V-0002
    add({ id: 'INV-0010', customer: 'C-001', grandTotal: 3000, turno: T, despacho: { dn: 'DN-0010', viaje: 'V-0002' }, delivery: { estado: 'en_ruta', viaje: 'V-0002', previsto: [{ modeOfPayment: 'Efectivo', amount: 3000 }] } })
    add({ id: 'INV-0011', customer: 'C-002', grandTotal: 1500, turno: T, despacho: { dn: 'DN-0011', viaje: 'V-0002' }, delivery: { estado: 'en_ruta', viaje: 'V-0002', previsto: [{ modeOfPayment: 'Efectivo', amount: 700 }, { modeOfPayment: 'Tarjeta', amount: 800 }] } })
    add({ id: 'INV-0012', customer: 'C-001', grandTotal: 2200, turno: T, despacho: { dn: 'DN-0012', viaje: 'V-0002' }, delivery: { estado: 'en_ruta', viaje: 'V-0002', previsto: [{ modeOfPayment: 'Efectivo', amount: 2200 }] } })
    // asignada a viaje borrador V-0001
    add({ id: 'INV-0013', customer: 'C-002', grandTotal: 950, turno: T, despacho: { dn: 'DN-0013', viaje: 'V-0001' }, delivery: { estado: 'asignado', viaje: 'V-0001', previsto: [{ modeOfPayment: 'Efectivo', amount: 950 }] } })
    // entregada con cobro por conciliar (V-0003 completado)
    add({ id: 'INV-0014', customer: 'C-001', grandTotal: 4000, turno: T, despacho: { dn: 'DN-0014', viaje: 'V-0003' }, delivery: { estado: 'entregado', viaje: 'V-0003', previsto: [{ modeOfPayment: 'Efectivo', amount: 4000 }] } })
    add({ id: 'INV-0015', customer: 'C-002', grandTotal: 5000, turno: T, despacho: { dn: 'DN-0015', viaje: 'V-0003' }, delivery: { estado: 'entregado', viaje: 'V-0003', previsto: [{ modeOfPayment: 'Tarjeta', amount: 3000 }, { modeOfPayment: 'Efectivo', amount: 2000 }] } })
    // entregada ya conciliada
    add({ id: 'INV-0016', customer: 'C-001', grandTotal: 1300, turno: T, despacho: { dn: 'DN-0016', viaje: 'V-0003' }, delivery: { estado: 'entregado', viaje: 'V-0003', cobroEstado: 'conciliado', previsto: [{ modeOfPayment: 'Efectivo', amount: 1300 }] } })
    // factura normal
    add({ id: 'INV-0020', customer: 'C-001', grandTotal: 590 })
    // cola de caja (draft)
    add({ id: 'INV-0030', status: 'draft', enCaja: true, customer: 'C-001', grandTotal: 1180, delivery: { direccion: 'Calle Duarte #12, Santo Domingo', previsto: [{ modeOfPayment: 'Efectivo', amount: 1180 }] } })
    add({ id: 'INV-0031', status: 'draft', enCaja: true, customer: 'C-002', grandTotal: 590 })
    add({ id: 'INV-0032', status: 'draft', enCaja: true, customer: 'C-NOADDR', grandTotal: 2360 })
    for (const k of ['INV-0030']) st.invoices.get(k).delivery.estado = undefined
    // viajes
    const par = (id, orden) => ({ invoiceId: id, orden })
    st.viajes.set('V-0001', { id: 'V-0001', estado: 'borrador', repartidor: 'DRV-001', vehiculo: 'A123456', salida: now(), notas: 'Viaje de prueba', branch: 'Sucursal Principal', stops: [par('INV-0013', 1)] })
    st.viajes.set('V-0002', { id: 'V-0002', estado: 'en_ruta', repartidor: 'DRV-002', vehiculo: 'L987654', salida: now(), notas: '', branch: 'Sucursal Principal', stops: [par('INV-0010', 1), par('INV-0011', 2), par('INV-0012', 3)] })
    st.viajes.set('V-0003', { id: 'V-0003', estado: 'completado', repartidor: 'DRV-001', vehiculo: 'A123456', salida: now(), notas: '', branch: 'Sucursal Principal', stops: [par('INV-0014', 1), par('INV-0015', 2), par('INV-0016', 3)] })
    for (const id of ['INV-0014', 'INV-0015', 'INV-0016']) { const i = st.invoices.get(id); i._confirmadoPor = 'despacho@demo.do'; i._confirmadoEn = now() }
    for (const id of ['INV-0013']) st.invoices.get(id)._repartidor = 'DRV-001'
    for (const id of ['INV-0010', 'INV-0011', 'INV-0012']) st.invoices.get(id)._repartidor = 'DRV-002'
    for (const id of ['INV-0014', 'INV-0015', 'INV-0016']) st.invoices.get(id)._repartidor = 'DRV-001'
    st.counters.viaje = 3
  }
  return st
}
S = seed()

// ───────────────────────── vistas ─────────────────────────
const pubInvoice = (inv) => {
  const o = {}
  for (const [k, v] of Object.entries(inv)) if (!k.startsWith('_')) o[k] = v
  return o
}
const repNombre = (id) => S.repartidores.find((r) => r.id === id)?.nombre
const cobroOf = (inv) => inv.delivery?.cobro ?? { estado: 'no_aplica', montoPorConciliar: 0, previsto: [] }

function filaPendiente(inv) {
  const d = inv.delivery
  return {
    invoiceId: inv.id, ncf: inv.ncf, customer: inv.customer, customerName: inv.customerName,
    direccion: d.direccion, telefono: d.telefono, referencia: d.referencia, grandTotal: inv.grandTotal,
    postingDate: inv.postingDate, branch: inv.branch, estadoEntrega: d.estado, viaje: d.viaje ?? null,
    cobro: d.cobro, origen: 'factura',
  }
}
function filaCobro(inv) {
  const viaje = inv.delivery.viaje ? S.viajes.get(inv.delivery.viaje) : null
  return {
    ...filaPendiente(inv), turno: inv._turno,
    repartidor: inv._repartidor ? { id: inv._repartidor, nombre: repNombre(inv._repartidor) } : null,
    estadoViaje: viaje?.estado ?? null,
  }
}
function viajeView(v, { conParadas = true } = {}) {
  const base = { id: v.id, estado: v.estado, repartidor: v.repartidor, repartidorNombre: repNombre(v.repartidor), vehiculo: v.vehiculo, salida: v.salida, notas: v.notas, branch: v.branch }
  if (!conParadas) return base
  base.paradas = v.stops.map((s, i) => {
    const inv = S.invoices.get(s.invoiceId)
    const d = inv.delivery
    const visitada = d.estado === 'entregado' || d.estado === 'no_entregado'
    const prov = inv._trackingProvided
    const pend = inv._tracking.filter((t) => !trackingCubierto(inv, t))
    return {
      orden: s.orden ?? i + 1, invoiceId: inv.id, ncf: inv.ncf, customer: inv.customer, customerName: inv.customerName,
      direccion: d.direccion, telefono: d.telefono, referencia: d.referencia, grandTotal: inv.grandTotal, estadoEntrega: d.estado,
      visitada, resultado: d.estado === 'entregado' ? 'entregado' : d.estado === 'no_entregado' ? 'no_entregado' : 'pendiente',
      motivo: inv._motivo ?? undefined, confirmadoPor: inv._confirmadoPor ?? undefined, confirmadoEn: inv._confirmadoEn ?? undefined,
      cobro: d.cobro, despacho: inv._despacho?.dn, despachoEstado: v.estado === 'borrador' ? 'Borrador' : 'Sometido',
      trackingPendiente: v.estado === 'borrador' ? pend : [],
      _prov: undefined,
    }
  })
  return base
}
function trackingCubierto(inv, t) {
  const p = inv._trackingProvided[t.itemCode]
  if (!p) return false
  if (t.tipo === 'serial') return (p.serials?.length ?? 0) >= t.qty
  return (p.batches ?? []).reduce((a, b) => a + (b.qty || 0), 0) >= t.qty
}

function turnoView() {
  if (!sc.turnoAbierto) return null
  const por = [...S.invoices.values()].filter((i) => i._turno === S.turno.openingEntryId && i.delivery?.cobro.estado === 'por_conciliar' && i.status !== 'cancelled')
  return {
    ...S.turno,
    cobrosDeliveryPorConciliar: {
      cantidad: por.length, monto: round2(por.reduce((a, i) => a + i.delivery.cobro.montoPorConciliar, 0)),
      facturas: por.map((i) => ({ invoiceId: i.id, customer: i.customer, customerName: i.customerName, monto: i.delivery.cobro.montoPorConciliar, estadoEntrega: i.delivery.estado, viaje: i.delivery.viaje })),
    },
    puedeCerrar: por.length === 0,
  }
}

// ───────────────────────── lógica de negocio ─────────────────────────
function newNcf() { return `B02${String(++S.counters.ncf).padStart(8, '0')}` }
function emit(event, payload = {}) { sioEmit(event, { tenantId: 'demo-tenant', timestamp: now(), ...payload }) }

function validarDeliveryBody(b, { cliente } = {}) {
  if (!b.esDelivery) return
  needFeature()
  needHabilitado()
  if (b.despachoFuturo === false) throw E(400, 'DELIVERY_REQUIERE_DESPACHO_FUTURO', 'Una venta con delivery debe ser a despacho futuro.')
  if (b.currency && b.currency !== 'DOP') throw E(400, 'DELIVERY_MONEDA_NO_SOPORTADA', 'Delivery solo admite la moneda de la compañía (DOP).')
  const dir = (b.direccionEntrega ?? '').trim()
  if (!dir) throw E(400, 'DELIVERY_DIRECCION_REQUERIDA', 'La dirección de entrega es obligatoria en una venta con delivery.')
}
function validarStock(items) {
  const falt = []
  for (const it of items ?? []) {
    const art = ITEMS[it.itemCode]
    if (art && art.disponible < it.qty) falt.push({ itemCode: it.itemCode, itemName: art.itemName, warehouse: it.warehouse ?? 'Almacén Principal - D', solicitado: it.qty, disponible: art.disponible, reservedStock: 0, faltante: it.qty - art.disponible })
  }
  if (falt.length) throw E(409, 'STOCK_INSUFFICIENT_OR_RESERVED', 'Stock insuficiente o reservado para otro cliente.', { faltantes: falt })
}
function calcItems(items) {
  return (items ?? []).map((it, i) => {
    const gross = it.qty * it.rate
    const disc = it.discountPct ? gross * it.discountPct / 100 : (it.discountAmount ?? 0)
    return { id: `row-${i}`, itemCode: it.itemCode, description: it.description ?? ITEMS[it.itemCode]?.itemName ?? it.itemCode, qty: it.qty, rate: it.rate, discountPct: it.discountPct ?? 0, discountAmount: it.discountAmount ?? 0, amount: round2(gross - disc), uom: it.uom ?? 'Unidad', warehouse: it.warehouse }
  })
}
function applyInvoiceBody(inv, b) {
  inv.customer = b.customer ?? inv.customer
  inv.customerName = b.customer ? (CUSTOMERS[b.customer]?.customerName ?? b.customer) : (b.clienteOcasionalNombre ?? inv.customerName)
  inv.esClienteOcasional = !b.customer
  if (!b.customer) { inv.clienteOcasionalNombre = b.clienteOcasionalNombre; inv.clienteOcasionalDireccion = b.clienteOcasionalDireccion; inv.clienteOcasionalRnc = b.clienteOcasionalRnc }
  inv.items = calcItems(b.items)
  const net = round2(inv.items.reduce((a, i) => a + i.amount, 0))
  inv.subtotal = net
  inv.taxAmount = round2(net * 0.18)
  inv.grandTotal = round2(net * 1.18)
  inv.roundedTotal = inv.grandTotal
  inv.ncfType = b.ncfType ?? inv.ncfType
  inv.outstandingAmount = inv.grandTotal
  if (b.esDelivery) {
    const prev = inv.delivery
    inv.delivery = {
      esDelivery: true, direccion: b.direccionEntrega?.trim(), telefono: b.telefonoEntrega || undefined, referencia: b.referenciaEntrega || undefined,
      estado: prev?.estado, viaje: prev?.viaje, cobro: prev?.cobro ?? { estado: 'no_aplica', montoPorConciliar: 0, previsto: [] },
    }
  } else {
    delete inv.delivery
  }
  inv.modifiedAt = now()
}

function procesarPagos(inv, payments, { cliente } = {}) {
  const esDel = !!inv.delivery?.esDelivery
  const total = inv.roundedTotal ?? inv.grandTotal
  const lines = payments ?? []
  const credito = CUSTOMERS[inv.customer]?.hasCredit
  for (const p of lines) {
    if (p.contraEntrega === true && !esDel) throw E(400, 'DELIVERY_CONTRA_ENTREGA_SIN_DELIVERY', 'Solo una venta con delivery admite pagos contra entrega.')
    if (p.contraEntrega !== false && esDel && credito) throw E(400, 'DELIVERY_CONTRA_ENTREGA_CLIENTE_CREDITO', 'Un cliente a crédito no cobra contra entrega: solo logística.')
  }
  const suma = round2(lines.reduce((a, p) => a + (p.amount ?? 0), 0))
  if (esDel && !credito && lines.length && suma + 0.01 < total) throw E(400, 'DELIVERY_PAGO_INCOMPLETO', `La venta delivery debe cubrir el total (${total}). Recibido: ${suma}.`)
  return { suma, total, lines, esDel }
}
function aplicarCobroDelivery(inv, lines) {
  // contraEntrega por defecto true en venta delivery
  const ce = lines.filter((p) => p.contraEntrega !== false)
  const tienda = lines.filter((p) => p.contraEntrega === false)
  const previsto = {}
  for (const p of ce) previsto[p.modeOfPayment ?? 'Efectivo'] = round2((previsto[p.modeOfPayment ?? 'Efectivo'] ?? 0) + p.amount)
  const total = round2(ce.reduce((a, p) => a + p.amount, 0))
  inv.delivery.estado = inv.delivery.estado ?? 'pendiente'
  inv.delivery.cobro = { estado: total > 0 ? 'por_conciliar' : 'no_aplica', montoPorConciliar: total, previsto: Object.entries(previsto).map(([modeOfPayment, amount]) => ({ modeOfPayment, amount })) }
  inv._tiendaPagado = round2(tienda.reduce((a, p) => a + p.amount, 0))
}

function conciliarUno(it, user = 'cajero@demo.do') {
  const inv = S.invoices.get(it.invoiceId)
  const err = (status, code, message, details) => ({ invoiceId: it.invoiceId, ok: false, error: { code, message, details, statusCode: status } })
  if (!inv || !inv.delivery?.esDelivery) return err(404, 'NOT_FOUND', `Factura ${it.invoiceId} no encontrada o no es delivery.`)
  const cobro = inv.delivery.cobro
  if (cobro.estado !== 'por_conciliar') return err(409, 'DELIVERY_COBRO_NO_PENDIENTE', 'Este cobro ya no está pendiente: otro cajero lo conciliaron. Refresca la lista.', { estadoCobro: cobro.estado })
  if (!['en_ruta', 'entregado'].includes(inv.delivery.estado)) {
    if (inv.delivery.estado === 'no_entregado') return err(409, 'DELIVERY_COBRO_NO_PENDIENTE', 'La entrega fue fallida: anula la venta en lugar de conciliar el cobro.')
    return err(409, 'DELIVERY_ENTREGA_NO_DESPACHADA', 'La factura aún no salió en un viaje despachado.')
  }
  if (sc.usaModuloPos && !sc.turnoAbierto) return err(409, 'TURNO_NO_ABIERTO', 'Abre un turno de caja primero: el dinero entra a la gaveta del cajero que concilia.')
  const recibido = it.recibido ?? []
  const suma = round2(recibido.reduce((a, r) => a + (r.amount ?? 0), 0))
  const pend = cobro.montoPorConciliar
  if (suma - pend > 0.01) return err(400, 'DELIVERY_COBRO_MONTO_NO_CUADRA', `Lo recibido (${suma}) supera lo pendiente (${pend}).`, { recibido: suma, pendiente: pend })
  let diferencia = 0
  if (pend - suma > 0.01) {
    diferencia = round2(pend - suma)
    if (!it.diferencia?.motivo?.trim()) return err(400, 'DELIVERY_COBRO_DIFERENCIA_NO_PERMITIDA', 'Falta dinero: indica el motivo del faltante.', { faltante: diferencia })
    if (!can('delivery.cobros.conciliar-con-diferencia')) return err(403, 'DELIVERY_COBRO_DIFERENCIA_NO_PERMITIDA', 'No tienes permiso para conciliar con faltante.', { faltante: diferencia })
    if (!sc.permiteDiferencias) return err(400, 'DELIVERY_COBRO_DIFERENCIA_NO_PERMITIDA', 'El tenant no permite conciliar con faltante.', { faltante: diferencia })
  }
  if (recibido.some((r) => (r.modeOfPayment ?? '') === 'Delivery por conciliar')) return err(400, 'VALIDATION_ERROR', 'No puedes recibir con el modo puente.')
  cobro.estado = 'conciliado'; cobro.montoPorConciliar = 0; cobro.conciliadoPor = user; cobro.conciliadoEn = now()
  inv.outstandingAmount = 0; inv.paymentStatus = 'paid'
  const out = { invoiceId: inv.id, ok: true, paymentEntryIds: recibido.map(() => `ACC-PAY-${String(S.counters.pe++).padStart(4, '0')}`), journalEntryId: diferencia ? `ACC-JV-${S.counters.pe}` : undefined, estadoCobro: 'conciliado', estadoEntrega: inv.delivery.estado }
  if (sc.conciliaConfirma && inv.delivery.estado === 'en_ruta') {
    inv.delivery.estado = 'entregado'; inv._confirmadoPor = user; inv._confirmadoEn = now()
    out.estadoEntrega = 'entregado'; out.autoConfirmacion = { omitida: false }
    cerrarViajeSiCompleto(inv.delivery.viaje)
  } else if (sc.conciliaConfirma) {
    out.autoConfirmacion = { omitida: true, motivo: 'YA_CONFIRMADA' }
  }
  emit('delivery.cobro.conciliado', { id: inv.id, turno: inv._turno })
  return out
}
function cerrarViajeSiCompleto(vid) {
  const v = S.viajes.get(vid)
  if (!v) return
  if (v.stops.every((s) => ['entregado', 'no_entregado'].includes(S.invoices.get(s.invoiceId).delivery.estado))) v.estado = 'completado'
}
function liberar(inv) {
  inv.delivery.estado = 'pendiente'; inv.delivery.viaje = undefined; inv._despacho = null; inv._repartidor = null; inv._trackingProvided = {}
}
function asignar(v, stops) {
  const dnPrefix = `DN-${String(++S.counters.dn).padStart(4, '0')}`
  for (const s of stops) {
    const inv = S.invoices.get(s.invoiceId)
    inv.delivery.estado = 'asignado'; inv.delivery.viaje = v.id; inv._despacho = { dn: `${dnPrefix}-${s.invoiceId.slice(-2)}`, viaje: v.id }; inv._repartidor = v.repartidor
  }
}
function validarStops(facturas, { exceptViaje } = {}) {
  if (!Array.isArray(facturas) || facturas.length < 1 || facturas.length > 100) throw E(400, 'VALIDATION_ERROR', 'facturas debe tener entre 1 y 100 elementos.')
  for (const f of facturas) {
    const inv = S.invoices.get(f.invoiceId)
    if (!inv || !inv.delivery?.esDelivery) throw E(404, 'NOT_FOUND', `La factura ${f.invoiceId} no existe o no es de delivery.`)
    const ya = inv._despacho && inv._despacho.viaje !== exceptViaje ? inv._despacho : null
    if (ya) throw E(409, 'DELIVERY_FACTURA_YA_DESPACHADA', `La factura ${inv.id} ya tiene un despacho (${ya.dn}) en el viaje ${ya.viaje}.`, { invoiceId: inv.id, despacho: ya.dn, viaje: ya.viaje })
    if (inv.delivery.estado === 'no_entregado') throw E(409, 'DELIVERY_FACTURA_NO_DISPONIBLE', `La factura ${inv.id} tuvo entrega fallida: anúlala (no se reprograma).`, { usar: '/delivery/viajes' })
  }
}
function despacharLogica(v, tracking) {
  if (v.estado !== 'borrador') {
    if (v.estado === 'cancelado') throw E(409, 'DELIVERY_VIAJE_NO_EDITABLE', 'El viaje está cancelado.')
    return { ...viajeView(v), yaDespachado: true }
  }
  // tracking recibido
  for (const t of tracking ?? []) {
    const inv = S.invoices.get(t.invoiceId); if (!inv) continue
    for (const it of t.items ?? []) inv._trackingProvided[it.itemCode] = { serials: it.serials, batches: it.batches }
  }
  const faltan = []
  for (const s of v.stops) {
    const inv = S.invoices.get(s.invoiceId)
    const pend = inv._tracking.filter((t) => !trackingCubierto(inv, t))
    if (pend.length) faltan.push({ invoiceId: inv.id, items: pend })
  }
  if (faltan.length) throw E(409, 'DELIVERY_TRACKING_PENDIENTE', 'Faltan seriales o lotes para despachar.', { facturas: faltan })
  for (const s of v.stops) {
    const inv = S.invoices.get(s.invoiceId)
    if (inv._flags.stockOnce) { inv._flags.stockOnce = false; throw E(409, 'STOCK_INSUFFICIENT_OR_RESERVED', 'Sin stock físico para despachar.', { faltantes: [{ itemCode: 'ART-001', itemName: 'Producto simple', warehouse: 'Almacén Principal - D', solicitado: 8, disponible: 3, reservedStock: 0, faltante: 5 }] }) }
    if (inv._flags.parcialOnce) { inv._flags.parcialOnce = false; throw E(409, 'DELIVERY_DESPACHO_PARCIAL_REVERTIDO', 'Algo falló y se revirtió lo ya sometido. Reintenta despachar.', { invoiceId: inv.id }) }
  }
  for (const s of v.stops) {
    const inv = S.invoices.get(s.invoiceId)
    if (inv._flags.dnsOnce) {
      inv._flags.dnsOnce = false
      v.estado = 'borrador'
      return { ...viajeView(v), estado: 'dns_sometidos_trip_pendiente', advertencia: 'El stock salió pero el viaje no quedó sometido. Reintenta despachar.' }
    }
  }
  v.estado = 'en_ruta'; v.salida = v.salida ?? now()
  for (const s of v.stops) S.invoices.get(s.invoiceId).delivery.estado = 'en_ruta'
  emit('delivery.viaje.despachado', { id: v.id })
  return viajeView(v)
}

// ───────────────────────── rutas ─────────────────────────
const routes = []
const R = (method, pattern, handler) => routes.push({ method, re: new RegExp('^' + pattern.replace(/:[a-zA-Z]+/g, '([^/]+)') + '/?$'), handler })

const FACT_CFG = () => ({
  usaModuloPos: sc.usaModuloPos, posProfileDefault: 'POS Principal', modoPagoCaja: 'Efectivo', modosPagoConciliar: ['Efectivo'], arqueoEfectivoRequerido: false,
  flujoCobro: sc.flujoCobro, despachoHabilitado: sc.despachoHabilitado, despachoFuturoHabilitado: true, despachoFuturoBloqueaVenta: false,
  turnoMaxHoras: 24, formatoImpresionDefault: 'a4', formatosPermitidos: ['a4', 'carta', 'a6', 'pos'], monedasHabilitadas: ['DOP'], monedaBase: 'DOP',
  deliveryHabilitado: sc.habilitado, deliveryModoPagoTransito: sc.habilitado ? 'Delivery por conciliar' : null,
  deliveryVehiculoPorDefecto: S.config.vehiculoPorDefecto, deliveryCiudadPorDefecto: S.config.ciudadPorDefecto,
  deliveryConfirmarEntregaConciliaCobro: sc.confirmaConcilia, deliveryConciliarCobroConfirmaEntrega: sc.conciliaConfirma,
  deliveryPermiteDiferencias: sc.permiteDiferencias, deliveryCuentaDiferencias: S.config.cuentaDiferencias ?? null,
  redondeoTotalDeshabilitado: true, creditoVigenciaDias: 0,
})

// — auth
R('POST', '/auth/refresh', ({ body }) => ({
  refresh_token: 'mock-refresh-' + crypto.randomUUID(), access_token: fakeJwt(), token_type: 'Bearer', expires_in: 3600,
  tenant: { slug: 'demo', siteUrl: 'demo.local', id: 'demo-tenant', vertical: 'general' },
}))
R('POST', '/auth/logout', () => ({ message: 'ok' }))
function fakeJwt() {
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url')
  return `${b64({ alg: 'none' })}.${b64({ sub: 'admin@demo.do', defaultWarehouse: 'Almacén Principal - D', warehouses: ['Almacén Principal - D'], exp: Math.floor(Date.now() / 1000) + 3600 })}.mock`
}

// — me
R('GET', '/me/profile', () => ({ id: 'u-1', email: 'admin@demo.do', firstName: 'Admin', lastName: 'Demo', mfaEnabled: false, tenants: [{ slug: 'demo', name: 'Demo SRL', vertical: 'general', status: 'accepted', isDefault: true, roles: ['System Manager', 'Accounts Manager'] }] }))
R('GET', '/me/permissions', () => ({ email: 'admin@demo.do', roles: ['System Manager', 'Accounts Manager'], doctypes: {}, acciones: accionesMap(), vertical: 'general' }))
R('GET', '/me/acceso', () => ({ modo: 'off', version: 'mock', modulos: [], pantallas: [], componentes: [], recursos: [], filtrosBloqueados: {} }))
R('GET', '/me/bootstrap', () => { throw E(404, 'NOT_FOUND', 'bootstrap no disponible en el mock') })
R('GET', '/me/features', () => {
  const f = {}
  for (const k of ['compras', 'comprasOrdenes', 'comprasSolicitudes', 'devolucionesCompras', 'gastos', 'proveedores', 'caja', 'contabilidad', 'cuentasPorCobrar', 'cuentasPorPagar', 'tesoreria', 'inventario', 'productos', 'servicios', 'relacionesComerciales', 'cotizaciones', 'devoluciones', 'notasCredito', 'notasDebito', 'pedidos']) f[k] = true
  f.despacho = sc.despachoFeature; f.delivery = sc.feature
  return { features: f, reportesHabilitados: [], featuresAdicionales: [], limites: { maxUsuarios: null, maxSucursales: null, usuariosActuales: 1, sucursalesActuales: 1 } }
})
R('GET', '/me/configuracion-operativa', () => {
  const c = FACT_CFG()
  return { facturacion: { usaModuloPos: c.usaModuloPos, flujoCobro: c.flujoCobro, despachoHabilitado: c.despachoHabilitado, despachoFuturoHabilitado: true, despachoFuturoBloqueaVenta: false, deliveryHabilitado: c.deliveryHabilitado, deliveryConfirmarEntregaConciliaCobro: c.deliveryConfirmarEntregaConciliaCobro, deliveryConciliarCobroConfirmaEntrega: c.deliveryConciliarCobroConfirmaEntrega, deliveryPermiteDiferencias: c.deliveryPermiteDiferencias }, ecf: {} }
})
R('GET', '/me/reference-version', () => ({ version: 'v1' }))

// — config
R('GET', '/config/facturacion', () => FACT_CFG())
R('GET', '/opciones/config/facturacion', () => FACT_CFG())
R('PUT', '/config/facturacion', ({ body }) => { if ('flujoCobro' in body) sc.flujoCobro = body.flujoCobro; return FACT_CFG() })
R('GET', '/opciones/config/denominaciones', () => [{ id: 'D2000', denominacion: 'RD$ 2,000', valor: 2000, activo: true }, { id: 'D1000', denominacion: 'RD$ 1,000', valor: 1000, activo: true }, { id: 'D500', denominacion: 'RD$ 500', valor: 500, activo: true }, { id: 'D100', denominacion: 'RD$ 100', valor: 100, activo: true }, { id: 'D50', denominacion: 'RD$ 50', valor: 50, activo: true }])
R('GET', '/opciones/config/catalogos-fiscales', () => ({ ncfTypes: [{ value: 'B02', label: 'B02 - Consumidor final' }, { value: 'B01', label: 'B01 - Crédito fiscal' }], ncfTypesFisicos: [{ value: 'B02', label: 'B02' }], tipoBienes606: [], formaPago606: [], facturacionElectronicaHabilitada: false }))
R('GET', '/config/catalogos-fiscales', () => ({ ncfTypes: [{ value: 'B02', label: 'B02 - Consumidor final' }, { value: 'B01', label: 'B01 - Crédito fiscal' }], ncfTypesFisicos: [{ value: 'B02', label: 'B02' }], tipoBienes606: [], formaPago606: [], facturacionElectronicaHabilitada: false }))
R('GET', '/opciones/config/stock-settings', () => ({ allowNegativeStock: false }))
R('GET', '/opciones/config/ecf', () => ({ habilitado: false }))
R('GET', '/opciones/bancos', () => [{ id: 'BHD', name: 'BHD' }, { id: 'Popular', name: 'Banco Popular' }])
R('GET', '/config/ecf', () => ({ habilitado: false }))

R('POST', '/config/delivery/habilitar', () => {
  needPerm('config.delivery.habilitar')
  if (!sc.despachoHabilitado) throw E(409, 'DELIVERY_REQUIERE_DESPACHO_HABILITADO', 'Delivery requiere que el despacho esté habilitado.')
  sc.habilitado = true
  return { habilitado: true, modoPagoTransito: 'Delivery por conciliar', vehiculoPorDefecto: S.config.vehiculoPorDefecto }
})
R('POST', '/config/delivery/deshabilitar', () => {
  needPerm('config.delivery.deshabilitar')
  const c = pendientesResumen()
  if (c.pendientesEntrega || c.viajesAbiertos || c.cobrosPorConciliar.cantidad) throw E(409, 'DELIVERY_CON_PENDIENTES', 'Hay delivery pendiente: termina lo pendiente antes de deshabilitar.', c)
  sc.habilitado = false
  return { habilitado: false }
})
function pendientesResumen() {
  const inv = [...S.invoices.values()].filter((i) => i.delivery?.esDelivery && i.status !== 'cancelled')
  const por = inv.filter((i) => i.delivery.cobro.estado === 'por_conciliar')
  return {
    pendientesEntrega: inv.filter((i) => ['pendiente', 'asignado', 'en_ruta'].includes(i.delivery.estado) && i.status === 'submitted').length,
    viajesAbiertos: [...S.viajes.values()].filter((v) => ['borrador', 'programado', 'en_ruta'].includes(v.estado)).length,
    cobrosPorConciliar: { cantidad: por.length, monto: round2(por.reduce((a, i) => a + i.delivery.cobro.montoPorConciliar, 0)) },
  }
}
R('PUT', '/config/delivery', ({ body }) => {
  needPerm('config.delivery.configurar')
  const keys = ['confirmarEntregaConciliaCobro', 'conciliarCobroConfirmaEntrega', 'permiteDiferencias', 'cuentaDiferencias', 'vehiculoPorDefecto', 'ciudadPorDefecto']
  if (!keys.some((k) => k in body)) throw E(400, 'VALIDATION_ERROR', 'Envía al menos un campo.')
  const cuenta = 'cuentaDiferencias' in body ? body.cuentaDiferencias : S.config.cuentaDiferencias
  if (body.permiteDiferencias === true && !cuenta) throw E(400, 'DELIVERY_CUENTA_DIFERENCIAS_REQUERIDA', 'Permitir diferencias requiere una cuenta de diferencias.')
  if ('confirmarEntregaConciliaCobro' in body) sc.confirmaConcilia = !!body.confirmarEntregaConciliaCobro
  if ('conciliarCobroConfirmaEntrega' in body) sc.conciliaConfirma = !!body.conciliarCobroConfirmaEntrega
  if ('permiteDiferencias' in body) sc.permiteDiferencias = !!body.permiteDiferencias
  if ('cuentaDiferencias' in body) S.config.cuentaDiferencias = body.cuentaDiferencias || null
  if ('vehiculoPorDefecto' in body) S.config.vehiculoPorDefecto = body.vehiculoPorDefecto
  if ('ciudadPorDefecto' in body) S.config.ciudadPorDefecto = body.ciudadPorDefecto
  return FACT_CFG()
})

// — opciones (selects)
const OPC = {
  sucursales: [{ value: 'Sucursal Principal', label: 'Sucursal Principal', custom_almacen_venta: 'Almacén Principal - D' }],
  almacenes: [{ value: 'Almacén Principal - D', label: 'Almacén Principal - D', custom_branch: 'Sucursal Principal' }],
  'metodos-pago': [
    { value: 'Efectivo', label: 'Efectivo', type: 'Cash', currency: 'DOP', account: '1101' },
    { value: 'Tarjeta', label: 'Tarjeta', type: 'Bank', currency: 'DOP', account: '1102', requires_bank_account: 0 },
    { value: 'Transferencia', label: 'Transferencia', type: 'Bank', currency: 'DOP', account: '1103', requires_bank_account: 0 },
  ],
  monedas: [{ value: 'DOP', label: 'Peso dominicano', symbol: 'RD$' }],
  departamentos: [], 'cuentas-bancarias': [], uom: [{ value: 'Unidad', label: 'Unidad' }],
  cuentas: [{ value: '5101 - Diferencia de caja - D', label: '5101 - Diferencia de caja - D', account_number: '5101', root_type: 'Expense' }, { value: '5102 - Otros gastos - D', label: '5102 - Otros gastos - D', account_number: '5102', root_type: 'Expense' }],
}
R('GET', '/opciones/clientes', ({ query }) => Object.values(CUSTOMERS).filter((c) => !query.q || c.customerName.toLowerCase().includes(String(query.q).toLowerCase())).map((c) => ({ value: c.id, label: c.customerName, tax_id: c.rnc, custom_tiene_credito: c.hasCredit ? 1 : 0, custom_ncf_type_default: 'B02' })))
R('GET', '/opciones/clientes/:id/detalle', ({ params }) => {
  const c = CUSTOMERS[params[0]]; if (!c) throw E(404, 'NOT_FOUND', 'Cliente no encontrado')
  return { ...c, customerType: 'Individual', isCompany: false, isGovernment: false, creditLimit: c.creditLimit ?? 0, creditDays: c.creditDays ?? 0, disabled: false, ncfTypeDefault: 'B02', priceTier: 'A' }
})
R('GET', '/opciones/clientes/:id/semaforo', ({ params }) => { const c = CUSTOMERS[params[0]]; return { tieneCredito: !!c?.hasCredit, customer: params[0], customerName: c?.customerName, creditLimit: c?.creditLimit ?? 0, balance: 0, pctUsado: 0, semaforo: 'verde' } })
R('GET', '/opciones/repartidores', () => S.repartidores.filter((r) => r.estado === 'activo').map((r) => ({ value: r.id, label: r.nombre })))
R('GET', '/opciones/vehiculos', () => S.vehiculos.map((v) => ({ value: v.id, label: `${v.placa} · ${v.marca} ${v.modelo}` })))
R('GET', '/opciones/:recurso', ({ params }) => OPC[params[0]] ?? [])
R('GET', '/catalog/items/lookup', ({ query }) => {
  const rows = Object.values(ITEMS).filter((i) => !query.search || (i.itemName + i.id).toLowerCase().includes(String(query.search).toLowerCase()))
  const p = paginate(rows, query); return { __paginated: true, rows: p.rows, meta: p.meta }
})
R('GET', '/catalog/items/lookup/:id', ({ params }) => { const i = ITEMS[params[0]]; if (!i) throw E(404, 'NOT_FOUND', 'Artículo no encontrado'); return { ...i, stockByWarehouse: { 'Almacén Principal - D': i.currentStock } } })
R('GET', '/catalog/items/lookup/:id/stock', ({ params }) => { const i = ITEMS[params[0]]; return { itemCode: params[0], totalDisponible: i?.disponible ?? 0, almacenes: [{ warehouse: 'Almacén Principal - D', actual: i?.currentStock ?? 0, reservado: 0, disponible: i?.disponible ?? 0 }] } })
R('GET', '/catalog/items/lookup/:id/variants', () => [])
R('GET', '/usuarios/:email', ({ params }) => ({ email: params[0], fullName: 'Admin Demo', maxDiscountPct: 100, enabled: true }))
R('GET', '/usuarios/:email/sucursales', () => ({ branches: ['Sucursal Principal'], defaultBranch: 'Sucursal Principal', allBranches: true }))
R('GET', '/monedas/tasas/vigente', () => ({ rate: 1 }))

// — POS
R('GET', '/pos/turnos/actual', () => turnoView())
R('POST', '/pos/turnos/abrir', ({ body }) => { sc.turnoAbierto = true; S.turnoSeq++; S.turno = { ...S.turno, openingEntryId: `POS-OPE-${String(S.turnoSeq).padStart(4, '0')}`, periodStartDate: now(), openingAmount: body.openingAmount ?? 0, montoCaja: body.openingAmount ?? 0 }; return turnoView() })
function previewCierre() {
  const tv = turnoView()
  const c = tv.cobrosDeliveryPorConciliar
  const concil = [...S.invoices.values()].filter((i) => i.delivery?.cobro.conciliadoPor && i._turno).length
  const lines = [
    { modeOfPayment: 'Efectivo', openingAmount: S.turno.openingAmount, expectedAmount: 7000, closingAmount: 0, difference: 0, requiereConciliacion: true },
    { modeOfPayment: 'Tarjeta', openingAmount: 0, expectedAmount: 3000, closingAmount: 0, difference: 0, requiereConciliacion: false },
  ]
  if (c.cantidad > 0 || sc.habilitado) lines.push({ modeOfPayment: 'Delivery por conciliar', openingAmount: 0, expectedAmount: c.monto, closingAmount: 0, difference: 0, requiereConciliacion: false, esDeliveryTransito: true })
  return {
    posOpeningEntry: S.turno.openingEntryId, periodStartDate: S.turno.periodStartDate, periodEndDate: now(), grandTotal: 10000 + c.monto, netTotal: 10000 + c.monto, totalQuantity: 10,
    paymentReconciliation: lines, cobrosDeliveryPorConciliar: c, puedeCerrar: tv.puedeCerrar,
    desgloseLiquidacionesDelivery: [{ modo: 'Efectivo', expectedNativo: 5000, liquidacionesDelivery: 2000, expected: 7000 }],
  }
}
R('GET', '/pos/turnos/:id/preview-cierre', () => { if (!sc.turnoAbierto) throw E(404, 'NOT_FOUND', 'No hay turno abierto'); return previewCierre() })
R('POST', '/pos/turnos/:id/cerrar', ({ body, params }) => {
  const tv = turnoView()
  if (!tv) throw E(409, 'TURNO_NO_ABIERTO', 'No hay turno abierto.')
  if (tv.cobrosDeliveryPorConciliar.cantidad > 0) {
    throw E(409, 'TURNO_CON_COBROS_DELIVERY_POR_CONCILIAR', `El turno tiene ${tv.cobrosDeliveryPorConciliar.cantidad} cobro(s) delivery por conciliar. Concílialos o anula las ventas antes de cerrar.`, { facturas: tv.cobrosDeliveryPorConciliar.facturas })
  }
  const id = S.turno.openingEntryId
  const recon = previewCierre().paymentReconciliation
  sc.turnoAbierto = false
  S.cerrados.push(id)
  return { id: `POS-CLO-${id}`, status: 'Submitted', paymentReconciliation: recon, user: 'admin@demo.do', closedBy: 'admin@demo.do' }
})
R('GET', '/pos/turnos', ({ query }) => ({ __paginated: true, rows: [{ id: S.turno.openingEntryId, cajero: 'admin@demo.do', posProfile: 'POS Principal', company: 'Demo SRL', periodStartDate: S.turno.periodStartDate, status: sc.turnoAbierto ? 'Open' : 'Closed', grandTotal: 10000 }], meta: { total: 1, limit: 20, offset: 0, hasMore: false } }))
R('GET', '/pos/turnos/:id', ({ params }) => ({
  id: params[0], status: 'Closed', posProfile: 'POS Principal', company: 'Demo SRL', user: 'admin@demo.do', periodStartDate: S.turno.periodStartDate, modeOfPayment: 'Efectivo', openingAmount: 2000,
  closing: { id: 'CLO-1', status: 'Submitted', posOpeningEntry: params[0], posProfile: 'POS Principal', user: 'admin@demo.do', periodStartDate: S.turno.periodStartDate, periodEndDate: now(), grandTotal: 12000, netTotal: 12000, totalQuantity: 10,
    paymentReconciliation: [{ modeOfPayment: 'Efectivo', openingAmount: 2000, expectedAmount: 7000, closingAmount: 7000, difference: 0, requiereConciliacion: true }, { modeOfPayment: 'Delivery por conciliar', openingAmount: 0, expectedAmount: 2000, closingAmount: 0, difference: 0, requiereConciliacion: false, esDeliveryTransito: true }],
    denominacionesEfectivo: [],
    corteCaja: { ventasDelDia: { ventasContado: 12000, ventasCredito: 0, total: 12000 }, devoluciones: { total: 0 }, recibosCobrados: { total: 0 }, ventasNetas: { total: 12000 },
      ingresos: [{ metodo: 'Efectivo', ventasContado: 5000, recibosCobrados: 0, total: 7000, liquidacionesDelivery: 2000 }, { metodo: 'Delivery por conciliar', ventasContado: 2000, recibosCobrados: 0, total: 2000, esDeliveryTransito: true, esDeliveryPorConciliar: true }],
      egresos: { devoluciones: 0, otrosEgresos: 0, total: 0 }, fondoApertura: 2000, importeAEntregar: 9000, delivery: { ventasContraEntrega: 2000, liquidacionesRecibidas: 2000, liquidacionesEfectivo: 2000 } } },
}))

// — caja
R('GET', '/caja/por-cobrar', ({ query }) => {
  const rows = [...S.invoices.values()].filter((i) => i._enCaja && i.status === 'draft').map((i) => ({
    id: i.id, customer: i.customer, customerName: i.customerName, esDelivery: !!i.delivery?.esDelivery, direccionEntrega: i.delivery?.direccion,
    grandTotal: i.grandTotal, roundedTotal: i.roundedTotal, montoACobrar: i.roundedTotal, ncfType: i.ncfType, postingDate: i.postingDate, esClienteOcasional: !!i.esClienteOcasional, currency: 'DOP',
  }))
  const p = paginate(rows, query); return { __paginated: true, rows: p.rows, meta: p.meta }
})
R('GET', '/caja/pendientes', ({ query }) => ({ __paginated: true, rows: [], meta: { total: 0, limit: 20, offset: 0, hasMore: false } }))
R('POST', '/caja/facturas/:id/completar-cobro', ({ params, body }) => {
  const inv = S.invoices.get(params[0])
  if (!inv || !inv._enCaja || inv.status !== 'draft') throw E(404, 'NOT_FOUND', 'La factura no está en la cola de caja.')
  if (sc.usaModuloPos && !sc.turnoAbierto) throw E(409, 'TURNO_NO_ABIERTO', 'Abre un turno de caja para cobrar.')
  // switch delivery
  if ('esDelivery' in body) {
    if (body.esDelivery) {
      needFeature(); needHabilitado()
      const dir = (body.direccionEntrega ?? inv.delivery?.direccion ?? '').trim()
      if (!dir) throw E(400, 'DELIVERY_DIRECCION_REQUERIDA', 'La dirección de entrega es obligatoria para encender delivery.')
      inv.delivery = inv.delivery ?? { esDelivery: true, cobro: { estado: 'no_aplica', montoPorConciliar: 0, previsto: [] } }
      Object.assign(inv.delivery, { esDelivery: true, direccion: dir, telefono: body.telefonoEntrega ?? inv.delivery.telefono, referencia: body.referenciaEntrega ?? inv.delivery.referencia })
    } else { delete inv.delivery }
  }
  const { suma, total, lines, esDel } = procesarPagos(inv, body.payments)
  if (!esDel && Math.abs(suma - total) > 0.01 && !(suma > total && body.vuelto)) {
    if (suma + 0.01 < total) throw E(400, 'PAYMENT_AMOUNT_MISMATCH', `La suma de pagos (${suma}) no cuadra con el total (${total}).`)
  }
  inv.status = 'submitted'; inv._enCaja = false; inv.ncf = newNcf(); inv._turno = S.turno.openingEntryId
  if (esDel) { aplicarCobroDelivery(inv, lines); emit('delivery.pendiente.nuevo', { id: inv.id, branch: inv.branch }); if (inv.delivery.cobro.montoPorConciliar > 0) emit('delivery.cobro.por_conciliar', { id: inv.id, turno: inv._turno }) }
  inv.outstandingAmount = esDel ? inv.delivery.cobro.montoPorConciliar : 0
  return { invoiceId: inv.id, ncf: inv.ncf, ncfType: inv.ncfType, isPos: true, paymentEntryIds: lines.map(() => `ACC-PAY-${String(S.counters.pe++).padStart(4, '0')}`), outstandingAmount: inv.outstandingAmount, roundedTotal: total, fullyPaid: true, vuelto: body.vuelto ?? [], esClienteOcasional: false, ...(inv.delivery ? { delivery: { estado: inv.delivery.estado, cobro: inv.delivery.cobro } } : {}) }
})
R('DELETE', '/caja/facturas/:id', ({ params }) => { S.invoices.delete(params[0]); return { message: 'ok' } })

// — invoices
R('GET', '/invoices', ({ query }) => {
  let rows = [...S.invoices.values()].filter((i) => !i._enCaja || true)
  if (query.status && query.status !== 'all') rows = rows.filter((i) => i.status === query.status)
  if (query.esDelivery === 'true') rows = rows.filter((i) => i.delivery?.esDelivery)
  if (query.esDelivery === 'false') rows = rows.filter((i) => !i.delivery?.esDelivery)
  if (query.estadoDelivery) rows = rows.filter((i) => i.delivery?.estado === query.estadoDelivery)
  if (query.estadoCobroDelivery) rows = rows.filter((i) => i.delivery?.cobro.estado === query.estadoCobroDelivery)
  if (query.search) rows = rows.filter((i) => (i.id + (i.ncf ?? '') + i.customerName).toLowerCase().includes(String(query.search).toLowerCase()))
  const p = paginate(rows.map(pubInvoice), query); return { __paginated: true, rows: p.rows, meta: p.meta }
})
R('GET', '/invoices/:id', ({ params }) => { const i = S.invoices.get(params[0]); if (!i) throw E(404, 'NOT_FOUND', 'Factura no encontrada'); return pubInvoice(i) })
R('POST', '/invoices', ({ body }) => {
  validarDeliveryBody(body)
  if (body.esDelivery) validarStock(body.items)
  for (const it of body.items ?? []) { if (it.itemCode === 'ART-INACTIVO') throw E(400, 'DELIVERY_ARTICULO_INACTIVO', 'El artículo está inactivo.', { itemCode: it.itemCode }) }
  const id = `INV-${String(++S.counters.inv).padStart(4, '0')}`
  const inv = mkInvoice({ id, status: 'draft', customer: body.customer ?? 'C-001', grandTotal: 0 })
  inv.paymentStatus = 'unpaid'
  applyInvoiceBody(inv, body)
  S.invoices.set(id, inv)
  return pubInvoice(inv)
})
R('PATCH', '/invoices/:id', ({ params, body }) => {
  const inv = S.invoices.get(params[0]); if (!inv) throw E(404, 'NOT_FOUND', 'Factura no encontrada')
  if (inv.status !== 'draft') throw E(400, 'INVOICE_NOT_DRAFT', 'Solo se edita en borrador.')
  validarDeliveryBody(body); if (body.esDelivery) validarStock(body.items)
  applyInvoiceBody(inv, body); inv.sequence++
  return pubInvoice(inv)
})
R('POST', '/invoices/:id/submit', ({ params, body }) => {
  const inv = S.invoices.get(params[0]); if (!inv) throw E(404, 'NOT_FOUND', 'Factura no encontrada')
  const credito = CUSTOMERS[inv.customer]?.hasCredit
  // POS + cliente sin crédito → cola de caja
  if (sc.usaModuloPos && !credito) {
    if (inv.delivery?.esDelivery && body?.payments?.some((p) => p.contraEntrega === true) && false) { /* n/a */ }
    inv._enCaja = true
    return { invoiceId: inv.id, status: 'pendiente_cobro', message: 'Enviada a caja' }
  }
  const { suma, total, lines, esDel } = procesarPagos(inv, body?.payments ?? [])
  if (!esDel && !credito && lines.length && suma + 0.01 < total) throw E(400, 'PAYMENT_AMOUNT_MISMATCH', `La suma de pagos (${suma}) no cuadra con el total (${total}).`)
  inv.status = 'submitted'; inv.ncf = newNcf(); inv._turno = sc.usaModuloPos ? S.turno.openingEntryId : null
  let lineasDef = lines
  // Sin POS, contado y sin payments: 100% contra entrega con método por defecto
  if (esDel && !credito && !lines.length) lineasDef = [{ modeOfPayment: 'Efectivo', amount: total, contraEntrega: true }]
  if (esDel) { aplicarCobroDelivery(inv, lineasDef); emit('delivery.pendiente.nuevo', { id: inv.id, branch: inv.branch }); if (inv.delivery.cobro.montoPorConciliar > 0) emit('delivery.cobro.por_conciliar', { id: inv.id }) }
  inv.outstandingAmount = esDel ? inv.delivery.cobro.montoPorConciliar : (credito ? total : 0)
  const out = pubInvoice(inv)
  if (lines.length) out.cobro = { invoiceId: inv.id, paymentEntryIds: ['ACC-PAY-' + S.counters.pe++], outstandingAmount: inv.outstandingAmount, fullyPaid: inv.outstandingAmount === 0, vuelto: body?.vuelto ?? [] }
  return out
})
R('POST', '/invoices/:id/cancel', ({ params }) => { const i = S.invoices.get(params[0]); if (i) i.status = 'cancelled'; return i ? pubInvoice(i) : null })
R('GET', '/invoices/:id/history', () => [])
R('GET', '/credit-notes/saldo-favor/:id', ({ params }) => ({ customer: params[0], balance: 0, vencidoAmount: 0, entries: [] }))
R('GET', '/cobros/saldo-favor/:id', ({ params }) => ({ customer: params[0], balance: 0, vencidoAmount: 0, entries: [] }))
R('GET', '/pos/turnos/:id/pdf', () => ({ __pdf: true }))
R('GET', '/invoices/:id/pdf', () => ({ __pdf: true }))

// — delivery
const ESTADOS_PEND = ['pendiente', 'no_entregado']
R('GET', '/delivery/pendientes', ({ query }) => {
  needPerm('delivery.pendientes.listar')
  let rows = [...S.invoices.values()].filter((i) => i.delivery?.esDelivery && i.status === 'submitted' && (i.delivery.estado === 'pendiente' || i.delivery.estado === 'no_entregado') && i.delivery.cobro.estado !== 'revertido')
  if (query.estado) rows = rows.filter((i) => i.delivery.estado === query.estado)
  if (query.customer) rows = rows.filter((i) => i.customer === query.customer)
  if (query.q) rows = rows.filter((i) => (i.id + i.customerName + (i.delivery.direccion ?? '')).toLowerCase().includes(String(query.q).toLowerCase()))
  const p = paginate(rows.map(filaPendiente), query); return { __paginated: true, rows: p.rows, meta: p.meta }
})
R('GET', '/delivery/cobros/resumen', () => {
  needPerm('delivery.cobros.listar')
  const por = [...S.invoices.values()].filter((i) => i.delivery?.cobro.estado === 'por_conciliar' && i.status === 'submitted')
  const sum = (a) => round2(a.reduce((x, i) => x + i.delivery.cobro.montoPorConciliar, 0))
  const grp = (keyFn) => { const m = new Map(); for (const i of por) { const k = keyFn(i); if (!k) continue; m.set(k, [...(m.get(k) ?? []), i]) } return m }
  const saldo = sum(por)
  return {
    total: { cantidad: por.length, monto: saldo },
    porTurno: [...grp((i) => i._turno)].map(([turno, a]) => ({ turno, cantidad: a.length, monto: sum(a) })),
    porRepartidor: [...grp((i) => i._repartidor)].map(([repartidor, a]) => ({ repartidor, nombre: repNombre(repartidor), cantidad: a.length, monto: sum(a) })),
    cuentaPuente: sc.habilitado ? { cuenta: '1105 - Delivery por conciliar - D', saldo: sc.puenteCuadra ? saldo : saldo + 350, diferencia: sc.puenteCuadra ? 0 : 350, cuadra: sc.puenteCuadra } : null,
  }
})
R('GET', '/delivery/cobros', ({ query }) => {
  needPerm('delivery.cobros.listar')
  const est = query.estado ?? 'por_conciliar'
  let rows = [...S.invoices.values()].filter((i) => i.delivery?.esDelivery && i.status !== 'draft')
  if (est !== 'todos') rows = rows.filter((i) => i.delivery.cobro.estado === est)
  if (query.repartidor) rows = rows.filter((i) => i._repartidor === query.repartidor)
  if (query.viaje) rows = rows.filter((i) => i.delivery.viaje === query.viaje)
  if (query.turno) rows = rows.filter((i) => i._turno === query.turno)
  if (query.estadoEntrega) rows = rows.filter((i) => i.delivery.estado === query.estadoEntrega)
  if (query.q) rows = rows.filter((i) => (i.id + i.customerName).toLowerCase().includes(String(query.q).toLowerCase()))
  const p = paginate(rows.map(filaCobro), query); return { __paginated: true, rows: p.rows, meta: p.meta }
})
R('POST', '/delivery/cobros/conciliar', ({ body }) => {
  needPerm('delivery.cobros.conciliar')
  const arr = body.conciliaciones
  if (!Array.isArray(arr) || arr.length < 1 || arr.length > 100) throw E(400, 'VALIDATION_ERROR', 'conciliaciones debe tener entre 1 y 100 ítems.')
  return arr.map((it) => conciliarUno(it))
})
R('POST', '/delivery/entregas/confirmar', ({ body }) => {
  needPerm('delivery.entregas.confirmar')
  const arr = body.entregas
  if (!Array.isArray(arr) || arr.length < 1 || arr.length > 100) throw E(400, 'VALIDATION_ERROR', 'entregas debe tener entre 1 y 100 ítems.')
  return arr.map((it) => {
    const inv = S.invoices.get(it.invoiceId)
    const er = (status, code, message, details) => ({ invoiceId: it.invoiceId, ok: false, error: { code, message, details, statusCode: status } })
    if (!inv?.delivery?.esDelivery) return er(404, 'NOT_FOUND', 'Factura no encontrada.')
    if (it.resultado === 'no_entregado' && !(it.motivo ?? '').trim()) return er(400, 'VALIDATION_ERROR', 'El motivo es obligatorio si no se entregó.')
    if (['entregado', 'no_entregado'].includes(inv.delivery.estado)) {
      if (inv.delivery.estado === it.resultado) return { invoiceId: inv.id, ok: true, estado: inv.delivery.estado, resultado: it.resultado, yaConfirmada: true }
      return er(409, 'DELIVERY_ENTREGA_YA_CONFIRMADA', `La entrega ya fue confirmada como ${inv.delivery.estado}.`)
    }
    if (inv.delivery.estado !== 'en_ruta') return er(409, 'DELIVERY_ENTREGA_NO_DESPACHADA', 'La factura aún no salió en un viaje despachado.')
    inv.delivery.estado = it.resultado; inv._motivo = it.motivo ?? null; inv._confirmadoPor = 'despacho@demo.do'; inv._confirmadoEn = now()
    const out = { invoiceId: inv.id, ok: true, estado: inv.delivery.estado, resultado: it.resultado }
    if (sc.confirmaConcilia && it.resultado === 'entregado') {
      if (sc.forceAutoOmit) out.autoConciliacion = { omitida: true, motivo: sc.forceAutoOmit, detalle: sc.forceAutoOmit === 'ERROR' ? 'Falló el asiento contable (simulado).' : 'Otro cajero ya lo concilió.' }
      else if (!can('delivery.cobros.conciliar')) out.autoConciliacion = { omitida: true, motivo: 'SIN_PERMISO', detalle: 'No tienes permiso para conciliar cobros.' }
      else if (inv.delivery.cobro.estado !== 'por_conciliar') out.autoConciliacion = { omitida: true, motivo: 'COBRO_NO_PENDIENTE' }
      else {
        const r = conciliarUno({ invoiceId: inv.id, recibido: inv.delivery.cobro.previsto.map((p) => ({ modeOfPayment: p.modeOfPayment, amount: p.amount })) })
        out.autoConciliacion = r.ok ? { omitida: false, paymentEntryIds: r.paymentEntryIds } : { omitida: true, motivo: 'ERROR', detalle: r.error.message }
      }
    }
    cerrarViajeSiCompleto(inv.delivery.viaje)
    emit('delivery.entrega.confirmada', { id: inv.id, resultado: it.resultado })
    return out
  })
})
R('POST', '/delivery/facturas/:id/anular', ({ params, body }) => {
  needPerm('delivery.entregas.anular')
  const inv = S.invoices.get(params[0]); if (!inv?.delivery?.esDelivery) throw E(404, 'NOT_FOUND', 'Factura no encontrada.')
  const motivo = (body.motivo ?? '').trim()
  if (motivo.length < 10 || motivo.length > 500) throw E(400, 'VALIDATION_ERROR', 'El motivo debe tener entre 10 y 500 caracteres.')
  if (inv.delivery.cobro.estado === 'revertido') return { invoiceId: inv.id, notaCredito: inv._nc, devolucionDespacho: inv._dev, yaAnulada: true, delivery: inv.delivery }
  if (inv.delivery.cobro.estado === 'conciliado') throw E(409, 'DELIVERY_ANULACION_NO_PERMITIDA', 'El cobro ya fue conciliado: usa el flujo normal de Devoluciones (/devoluciones).')
  if (!['no_entregado', 'cancelado'].includes(inv.delivery.estado)) throw E(409, 'DELIVERY_ANULACION_NO_PERMITIDA', 'Solo se anula una venta con entrega fallida o cancelada.')
  inv._nc = `NC-${String(S.counters.nc++).padStart(4, '0')}`; inv._dev = `DN-RET-${S.counters.nc}`
  inv.delivery.estado = 'cancelado'; inv.delivery.cobro.estado = 'revertido'; inv.delivery.cobro.montoPorConciliar = 0
  inv.outstandingAmount = 0
  emit('delivery.cobro.conciliado', { id: inv.id, turno: inv._turno })
  return { invoiceId: inv.id, notaCredito: inv._nc, devolucionDespacho: inv._dev, yaAnulada: false, delivery: inv.delivery, advertencias: body.motivo.includes('advertencia') ? ['La NC se emitió pero el e-CF quedó en cola (simulado).'] : undefined }
})

// viajes
R('GET', '/delivery/viajes', ({ query }) => {
  needPerm('delivery.viajes.listar')
  let rows = [...S.viajes.values()]
  if (query.estado) rows = rows.filter((v) => v.estado === query.estado)
  if (query.repartidor) rows = rows.filter((v) => v.repartidor === query.repartidor)
  if (query.branch) rows = rows.filter((v) => v.branch === query.branch)
  rows.sort((a, b) => b.id.localeCompare(a.id))
  const p = paginate(rows.map((v) => viajeView(v, { conParadas: false })), query); return { __paginated: true, rows: p.rows, meta: p.meta }
})
R('GET', '/delivery/viajes/:id', ({ params }) => { needPerm('delivery.viajes.listar'); const v = S.viajes.get(params[0]); if (!v) throw E(404, 'NOT_FOUND', `Viaje ${params[0]} no encontrado.`); return viajeView(v) })
R('POST', '/delivery/viajes', ({ body }) => {
  needPerm('delivery.viajes.crear'); needFeature()
  if (body.despachar) needPerm('delivery.viajes.despachar')
  if (!body.repartidor) throw E(400, 'DELIVERY_REPARTIDOR_REQUERIDO', 'Selecciona un repartidor.')
  const r = S.repartidores.find((x) => x.id === body.repartidor)
  if (!r || r.estado !== 'activo') throw E(400, 'DELIVERY_REPARTIDOR_INACTIVO', 'El repartidor no está activo.')
  validarStops(body.facturas)
  const id = `V-${String(++S.counters.viaje).padStart(4, '0')}`
  const v = { id, estado: 'borrador', repartidor: body.repartidor, vehiculo: body.vehiculo ?? S.config.vehiculoPorDefecto, salida: body.salida ?? now(), notas: body.notas ?? '', branch: 'Sucursal Principal', stops: body.facturas.map((f, i) => ({ invoiceId: f.invoiceId, orden: f.orden ?? i + 1 })) }
  S.viajes.set(id, v); asignar(v, v.stops)
  emit('delivery.viaje.actualizado', { id })
  if (body.despachar) {
    try { return despacharLogica(v, body.tracking) }
    catch (e) { if (e instanceof HttpErr) e.details = { ...(e.details ?? {}), viaje: v.id }; throw e }
  }
  // tracking enviado sin despachar: se guarda
  for (const t of body.tracking ?? []) { const inv = S.invoices.get(t.invoiceId); for (const it of t.items ?? []) inv._trackingProvided[it.itemCode] = { serials: it.serials, batches: it.batches } }
  return viajeView(v)
})
R('PUT', '/delivery/viajes/:id', ({ params, body }) => {
  needPerm('delivery.viajes.editar'); needFeature()
  const v = S.viajes.get(params[0]); if (!v) throw E(404, 'NOT_FOUND', 'Viaje no encontrado.')
  if (v.estado !== 'borrador') throw E(409, 'DELIVERY_VIAJE_NO_EDITABLE', 'El viaje ya fue sometido: no se puede editar.')
  if (body.repartidor) { const r = S.repartidores.find((x) => x.id === body.repartidor); if (!r || r.estado !== 'activo') throw E(400, 'DELIVERY_REPARTIDOR_INACTIVO', 'El repartidor no está activo.'); v.repartidor = body.repartidor }
  if (body.vehiculo !== undefined) v.vehiculo = body.vehiculo
  if (body.salida) v.salida = body.salida
  if (body.notas !== undefined) v.notas = body.notas
  if (body.facturas) {
    validarStops(body.facturas, { exceptViaje: v.id })
    for (const s of v.stops) if (!body.facturas.some((f) => f.invoiceId === s.invoiceId)) liberar(S.invoices.get(s.invoiceId))
    v.stops = body.facturas.map((f, i) => ({ invoiceId: f.invoiceId, orden: f.orden ?? i + 1 }))
    asignar(v, v.stops.filter((s) => !S.invoices.get(s.invoiceId)._despacho))
    for (const s of v.stops) { const inv = S.invoices.get(s.invoiceId); inv._repartidor = v.repartidor; inv.delivery.viaje = v.id; inv.delivery.estado = 'asignado' }
  } else for (const s of v.stops) S.invoices.get(s.invoiceId)._repartidor = v.repartidor
  emit('delivery.viaje.actualizado', { id: v.id })
  return viajeView(v)
})
R('DELETE', '/delivery/viajes/:id', ({ params }) => {
  needPerm('delivery.viajes.cancelar')
  const v = S.viajes.get(params[0]); if (!v) throw E(404, 'NOT_FOUND', 'Viaje no encontrado.')
  if (v.estado !== 'borrador') throw E(409, 'DELIVERY_VIAJE_NO_EDITABLE', 'Solo se borra un viaje en borrador.')
  for (const s of v.stops) liberar(S.invoices.get(s.invoiceId))
  S.viajes.delete(v.id); emit('delivery.viaje.actualizado', { id: v.id })
  return { message: 'Viaje eliminado' }
})
R('POST', '/delivery/viajes/:id/despachar', ({ params, body }) => {
  needPerm('delivery.viajes.despachar')
  const v = S.viajes.get(params[0]); if (!v) throw E(404, 'NOT_FOUND', 'Viaje no encontrado.')
  return despacharLogica(v, body?.tracking)
})
R('POST', '/delivery/viajes/:id/cancelar', ({ params, body }) => {
  needPerm('delivery.viajes.cancelar')
  const v = S.viajes.get(params[0]); if (!v) throw E(404, 'NOT_FOUND', 'Viaje no encontrado.')
  const m = (body.motivo ?? '').trim()
  if (m.length < 10 || m.length > 500) throw E(400, 'VALIDATION_ERROR', 'El motivo debe tener entre 10 y 500 caracteres.')
  if (v.estado === 'cancelado') return viajeView(v)
  if (v.stops.some((s) => ['entregado', 'no_entregado'].includes(S.invoices.get(s.invoiceId).delivery.estado))) throw E(409, 'DELIVERY_VIAJE_CON_ENTREGAS', 'El viaje tiene entregas ya confirmadas: no se puede cancelar.')
  for (const s of v.stops) liberar(S.invoices.get(s.invoiceId))
  v.estado = 'cancelado'; emit('delivery.viaje.actualizado', { id: v.id })
  return viajeView(v)
})
R('GET', '/delivery/viajes/:id/pdf', ({ params }) => {
  needPerm('delivery.viajes.imprimir')
  if (!S.viajes.get(params[0])) throw E(404, 'NOT_FOUND', 'Viaje no encontrado.')
  return { __pdf: true }
})

// repartidores / vehículos
R('GET', '/delivery/repartidores', ({ query }) => {
  needPerm('delivery.repartidores.listar')
  let rows = [...S.repartidores]
  if (query.estado) rows = rows.filter((r) => r.estado === query.estado)
  if (query.q) rows = rows.filter((r) => (r.nombre + r.id).toLowerCase().includes(String(query.q).toLowerCase()))
  const p = paginate(rows, query); return { __paginated: true, rows: p.rows, meta: p.meta }
})
R('GET', '/delivery/repartidores/:id', ({ params }) => { needPerm('delivery.repartidores.listar'); const r = S.repartidores.find((x) => x.id === params[0]); if (!r) throw E(404, 'NOT_FOUND', 'Repartidor no encontrado.'); return r })
R('POST', '/delivery/repartidores', ({ body }) => {
  needPerm('config.delivery.gestionar'); needFeature()
  if (sc.repartidorCrear403) throw E(403, 'FORBIDDEN', 'Crear repartidores requiere un rol de administración (System Manager) en ERPNext.')
  if (!body.nombre?.trim()) throw E(400, 'VALIDATION_ERROR', 'El nombre es obligatorio.')
  const r = { id: `DRV-${String(S.repartidores.length + 1).padStart(3, '0')}`, nombre: body.nombre, telefono: body.telefono ?? '', licencia: body.licencia ?? '', empleado: body.empleado ?? '', usuario: body.usuario ?? '', transportista: body.transportista ?? '', estado: body.estado ?? 'activo' }
  S.repartidores.push(r); return r
})
R('PUT', '/delivery/repartidores/:id', ({ params, body }) => {
  needPerm('config.delivery.gestionar'); needFeature()
  const r = S.repartidores.find((x) => x.id === params[0]); if (!r) throw E(404, 'NOT_FOUND', 'Repartidor no encontrado.')
  Object.assign(r, body); return r
})
R('GET', '/delivery/vehiculos', ({ query }) => {
  needPerm('delivery.vehiculos.listar')
  let rows = [...S.vehiculos]
  if (query.search) rows = rows.filter((v) => (v.placa + v.marca + v.modelo).toLowerCase().includes(String(query.search).toLowerCase()))
  const p = paginate(rows, query); return { __paginated: true, rows: p.rows, meta: p.meta }
})
R('GET', '/delivery/vehiculos/:id', ({ params }) => { needPerm('delivery.vehiculos.listar'); const v = S.vehiculos.find((x) => x.id === params[0]); if (!v) throw E(404, 'NOT_FOUND', 'Vehículo no encontrado.'); return v })
R('POST', '/delivery/vehiculos', ({ body }) => {
  needPerm('config.delivery.gestionar'); needFeature()
  if (!body.placa || !body.marca || !body.modelo) throw E(400, 'VALIDATION_ERROR', 'placa, marca y modelo son obligatorios.')
  if (S.vehiculos.some((v) => v.id === body.placa)) throw E(409, 'DUPLICATE_ENTRY', `Ya existe un vehículo con la placa ${body.placa}.`)
  const v = { id: body.placa, placa: body.placa, marca: body.marca, modelo: body.modelo, color: body.color ?? '' }
  S.vehiculos.push(v); return v
})
R('PUT', '/delivery/vehiculos/:id', ({ params, body }) => {
  needPerm('config.delivery.gestionar'); needFeature()
  const v = S.vehiculos.find((x) => x.id === params[0]); if (!v) throw E(404, 'NOT_FOUND', 'Vehículo no encontrado.')
  for (const k of ['marca', 'modelo', 'color']) if (k in body) v[k] = body[k]
  return v
})

// ───────────────────────── servidor HTTP ─────────────────────────
const PDF_MIN = Buffer.from('%PDF-1.1\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 300 200]>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF')

async function readBody(req) {
  const chunks = []
  for await (const c of req) chunks.push(c)
  const raw = Buffer.concat(chunks).toString('utf8')
  if (!raw) return {}
  try { return JSON.parse(raw) } catch { return {} }
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x')
  const method = req.method
  const q = Object.fromEntries(url.searchParams)
  const body = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method) ? await readBody(req) : {}
  let p = url.pathname

  // control
  if (p === '/__mock/escenario' && method === 'POST') {
    const preset = body.preset ? PRESETS[body.preset] : null
    if (body.preset && !preset) return fail(res, 400, 'BAD_PRESET', `Presets: ${Object.keys(PRESETS).join(', ')}`)
    const { preset: pn, reset, ...fields } = body
    sc = { ...DEFAULT_SC, ...(pn ? { preset: pn, ...preset } : (reset ? {} : sc)), ...fields }
    S = seed(); injects = []
    return ok(res, { sc, acciones: Object.entries(accionesMap()).filter(([k, v]) => DELIVERY_ACCIONES.includes(k)).map(([k, v]) => `${k}=${v}`) })
  }
  if (p === '/__mock/estado') return ok(res, { sc, invoices: [...S.invoices.values()].map((i) => ({ id: i.id, status: i.status, delivery: i.delivery, turno: i._turno })), viajes: [...S.viajes.values()], turno: turnoView() })
  if (p === '/__mock/log') return ok(res, reqLog.slice(-200))
  if (p === '/__mock/inject' && method === 'POST') { injects.push({ ...body }); return ok(res, { injects: injects.length }) }
  if (p === '/__mock/emit' && method === 'POST') { sioEmit(body.event, { tenantId: 'demo-tenant', timestamp: now(), ...(body.payload ?? {}) }); return ok(res, { emitidoA: sioClients.size }) }

  if (!p.startsWith('/api/v1')) return fail(res, 404, 'NOT_FOUND', 'Mock: solo /api/v1')
  p = p.slice('/api/v1'.length) || '/'

  const entry = { t: now(), method, path: p, q, body: ['POST', 'PUT', 'PATCH'].includes(method) ? body : undefined, status: 0, matched: false }
  reqLog.push(entry); if (reqLog.length > 1000) reqLog.shift()
  const done = (status) => { entry.status = status }

  try {
    // inyecciones
    const ix = injects.findIndex((i) => (!i.method || i.method === method) && new RegExp(i.path).test(p))
    if (ix >= 0) {
      const i = injects[ix]; if (i.once !== false) injects.splice(ix, 1)
      entry.matched = true; done(i.status ?? 500)
      return fail(res, i.status ?? 500, i.code ?? 'INJECTED', i.message ?? 'Error inyectado', i.details)
    }
    const route = routes.find((r) => r.method === method && r.re.test(p))
    if (route) {
      entry.matched = true
      const m = p.match(route.re)
      const out = await route.handler({ params: m.slice(1).map(decodeURIComponent), query: q, body })
      if (out && out.__pdf) { done(200); return send(res, 200, PDF_MIN) }
      if (out && out.__paginated) { done(200); return ok(res, out.rows, out.meta) }
      done(200); return ok(res, out === undefined ? { message: 'ok' } : out)
    }
    // catch-all
    entry.matched = false
    if (method === 'GET') { done(200); return ok(res, [], { total: 0, limit: 20, offset: 0, hasMore: false }) }
    done(200); return ok(res, { message: 'ok (mock catch-all)' })
  } catch (e) {
    if (e instanceof HttpErr) { done(e.status); return fail(res, e.status, e.code, e.message, e.details) }
    console.error('[mock] error', e); done(500)
    return fail(res, 500, 'MOCK_INTERNAL_ERROR', String(e?.message ?? e))
  }
})

// ───────────────────────── mini Socket.IO (EIO4, solo websocket, namespace /realtime) ─────────────────────────
const sioClients = new Set()
function wsFrame(str) {
  const payload = Buffer.from(str)
  const len = payload.length
  let head
  if (len < 126) head = Buffer.from([0x81, len])
  else if (len < 65536) { head = Buffer.alloc(4); head[0] = 0x81; head[1] = 126; head.writeUInt16BE(len, 2) }
  else { head = Buffer.alloc(10); head[0] = 0x81; head[1] = 127; head.writeBigUInt64BE(BigInt(len), 2) }
  return Buffer.concat([head, payload])
}
function wsParse(buf) {
  const msgs = []
  let off = 0
  while (off + 2 <= buf.length) {
    const b0 = buf[off], b1 = buf[off + 1]
    const opcode = b0 & 0x0f
    let len = b1 & 0x7f
    let p = off + 2
    if (len === 126) { len = buf.readUInt16BE(p); p += 2 } else if (len === 127) { len = Number(buf.readBigUInt64BE(p)); p += 8 }
    const masked = (b1 & 0x80) !== 0
    let mask
    if (masked) { mask = buf.subarray(p, p + 4); p += 4 }
    if (p + len > buf.length) break
    const data = Buffer.from(buf.subarray(p, p + len))
    if (masked) for (let i = 0; i < data.length; i++) data[i] ^= mask[i % 4]
    msgs.push({ opcode, data: data.toString('utf8') })
    off = p + len
  }
  return msgs
}
function sioEmit(event, payload) {
  const frame = wsFrame(`42/realtime,${JSON.stringify([event, payload])}`)
  for (const c of sioClients) { try { c.write(frame) } catch {} }
}
server.on('upgrade', (req, socket) => {
  const url = new URL(req.url, 'http://x')
  if (!url.pathname.startsWith('/socket.io')) return socket.destroy()
  const key = req.headers['sec-websocket-key']
  const accept = crypto.createHash('sha1').update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64')
  socket.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`)
  const sid = crypto.randomBytes(8).toString('hex')
  socket.write(wsFrame(`0${JSON.stringify({ sid, upgrades: [], pingInterval: 20000, pingTimeout: 20000, maxPayload: 1000000 })}`))
  const ping = setInterval(() => { try { socket.write(wsFrame('2')) } catch {} }, 20000)
  socket.on('data', (buf) => {
    for (const m of wsParse(buf)) {
      if (m.opcode === 8) { socket.end(); return }
      if (m.data === '3') continue
      if (m.data.startsWith('40/realtime')) {
        socket.write(wsFrame(`40/realtime,${JSON.stringify({ sid: crypto.randomBytes(8).toString('hex') })}`))
        sioClients.add(socket); console.log('[mock] socket.io cliente conectado a /realtime')
      } else if (m.data === '2') socket.write(wsFrame('3'))
    }
  })
  const bye = () => { clearInterval(ping); sioClients.delete(socket) }
  socket.on('close', bye); socket.on('error', bye)
})

server.listen(PORT, () => {
  console.log(`[mock-bff-delivery] http://localhost:${PORT}  (BFF SIMULADO, no es el real)`)
  console.log(`  presets: ${Object.keys(PRESETS).join(', ')}`)
})
