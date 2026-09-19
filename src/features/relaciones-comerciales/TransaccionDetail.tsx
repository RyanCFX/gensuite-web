// Detalle de una transacción B2B — docs/tasks/relaciones_comerciales, Fase 06 §2.4 + Fase 07/08/09/10/11.
//
// 3 zonas (lo que envió el socio / mi documento / diferencias) + acciones según estado. El texto
// del socio (payloadSnapshot) es contenido AJENO de otra empresa: se renderiza siempre vía `{}`
// (React escapa por defecto) — jamás dangerouslySetInnerHTML en esta pantalla.
import { useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { AlertTriangle, ArrowLeft, Ban, RefreshCw, RotateCw } from 'lucide-react'
import {
  getTransaccionB2B, reintentarTransaccionB2B, cancelarTransaccionB2B,
  getMapeoTransaccion, refrescarMapeoTransaccion, confirmarMapeoTransaccion, crearArticuloDesdeSocio,
  aceptarTransaccionB2B, rechazarTransaccionB2B,
  getDiffTransaccion, igualarBorradorTransaccion, igualarConEnmiendaTransaccion,
  getCandidatosEnlaceTransaccion, enlazarTransaccionB2B,
} from '@/shared/api/relaciones'
import { getCompra } from '@/shared/api/compras-gastos'
import { getInvoice } from '@/shared/api/invoices'
import type {
  ApiError, Compra, Invoice, DecisionMapeoDto, DocumentoEnlazable, CrearArticuloDesdeSocioDto,
  EnlazarTransaccionResponse,
} from '@/shared/api/types'
import { Badge } from '@/shared/ui/Badge'
import { Modal, ConfirmModal } from '@/shared/ui/Modal'
import { FilterField } from '@/shared/ui/FilterField'
import { DatePicker } from '@/shared/ui/DatePicker'
import { MapeoForm } from './components/MapeoForm'
import { DiffView } from './components/DiffView'
import { usePuede } from '@/shared/permissions/can'
import { formatDate, formatDateTime, formatDOP, formatNumber } from '@/lib/formatters'
import { ESTADO_TRANSACCION_BADGE, estadoNecesitaAccion } from './estadoTransaccion'

type EnlazarStep = 'buscar' | 'mapeo' | 'confirmar' | 'exito'

async function fetchDocumentoLocal(esVenta: boolean, docId: string): Promise<Compra | Invoice> {
  return esVenta ? getInvoice(docId) : getCompra(docId)
}

export default function TransaccionDetail() {
  const { uid } = useParams<{ uid: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const mapeoRef = useRef<HTMLDivElement>(null)

  const puedeVer = usePuede('relaciones.transacciones.ver')
  const puedeAceptarCompra = usePuede('relaciones.transaccion.aceptar-compra')
  const puedeAceptarVenta = usePuede('relaciones.transaccion.aceptar-venta')
  const puedeRechazar = usePuede('relaciones.transaccion.rechazar')
  const puedeReenviar = usePuede('relaciones.transaccion.reenviar')
  const puedeIgualarBorrador = usePuede('relaciones.compra.igualar')
  const puedeIgualarEnmienda = usePuede('relaciones.venta.igualar')
  const puedeMapeoGuardar = usePuede('relaciones.mapeo.guardar')
  const puedeMapeoCrearArticulo = usePuede('relaciones.mapeo.crear-articulo')
  const puedeMapeoSincronizarBarcodes = usePuede('relaciones.mapeo.sincronizar-barcodes')
  const puedeEnlazarCompra = usePuede('relaciones.transaccion.enlazar-compra')
  const puedeEnlazarVenta = usePuede('relaciones.transaccion.enlazar-venta')
  const puedeBuscarCandidatos = usePuede('relaciones.transaccion.buscar-candidatos')

  const { data: transaccion, isLoading, isError } = useQuery({
    queryKey: ['transaccion-b2b', uid],
    queryFn: () => getTransaccionB2B(uid!),
    enabled: !!uid && puedeVer,
  })

  const necesitaAccion = !!transaccion && estadoNecesitaAccion(transaccion.estado)

  // El mapeo (y todo lo que depende de él — Aceptar, Enlazar) es responsabilidad exclusiva del
  // lado que RECIBE el documento. El lado que lo originó ve el mismo `estado` ("Requiere Mapeo"
  // incluido) pero es puramente informativo: ya conoce sus propios artículos, no tiene nada que
  // mapear. Nunca derivar esto de `estado` — se repite igual en ambos lados. Ver prompt de fix
  // "pantalla de mapeo se muestra al lado equivocado".
  const esEntrante = transaccion?.direccion === 'Entrante'

  const mostrarAceptar = !!transaccion && necesitaAccion && esEntrante && transaccion.origenYaSometido !== true &&
    ((transaccion.tipo === 'Compra' && puedeAceptarCompra) || (transaccion.tipo === 'Venta' && puedeAceptarVenta))
  const mostrarRechazar = !!transaccion && necesitaAccion && puedeRechazar
  const mostrarEnlazar = !!transaccion && necesitaAccion && esEntrante &&
    ((transaccion.tipo === 'Compra' && puedeEnlazarCompra) || (transaccion.tipo === 'Venta' && puedeEnlazarVenta))
  const mostrarReintentar = !!transaccion && transaccion.estado === 'Error' && puedeReenviar
  const mostrarCancelar = !!transaccion && transaccion.estado === 'Pendiente de entrega' && puedeReenviar
  // Informativo puro para el lado Saliente — sin formulario, sin botones de mapeo.
  const mostrarEsperandoContraparte = !!transaccion && necesitaAccion && !esEntrante

  // ─── Mapeo de artículos (compartido entre el flujo de Aceptar y el de Enlazar) ─────────────
  // GET/PUT .../mapeo solo aplican al lado Entrante — nunca dispararlos para una transacción
  // Saliente, aunque por algún motivo se llegue a esta pantalla con `necesitaAccion` true.
  const mapeoQuery = useQuery({
    queryKey: ['mapeo-transaccion', uid],
    queryFn: () => getMapeoTransaccion(uid!),
    enabled: !!uid && necesitaAccion && esEntrante,
  })

  // Le vuelve a preguntar al emisor su catálogo actual (ej. si agregó un barcode después de
  // someter) y recalcula sugerencias — mismo shape que mapeoQuery, se reusa la misma vista/tabla.
  // No es un error si el socio no aportó nada nuevo: devuelve el mismo resultado en silencio.
  const refrescarMapeoMutation = useMutation({
    mutationFn: () => refrescarMapeoTransaccion(uid!),
    onSuccess: (r) => queryClient.setQueryData(['mapeo-transaccion', uid], r),
    onError: (err: ApiError) => toast.error(err.message ?? 'Error al actualizar las sugerencias'),
  })

  const confirmarMapeoMutation = useMutation({
    mutationFn: (vars: { decisiones: DecisionMapeoDto[]; sincronizarBarcodes: boolean }) =>
      confirmarMapeoTransaccion(uid!, { decisiones: vars.decisiones, sincronizarBarcodes: vars.sincronizarBarcodes }),
    onSuccess: (r) => {
      queryClient.setQueryData(['mapeo-transaccion', uid], r)
      if (r.sincronizacionOmitida) toast.info(r.sincronizacionOmitida)
    },
    onError: (err: ApiError) => toast.error(err.message ?? 'Error al confirmar el mapeo'),
  })

  const crearArticuloMutation = useMutation({
    mutationFn: (dto: CrearArticuloDesdeSocioDto) => crearArticuloDesdeSocio(uid!, dto),
    onSuccess: (r) => {
      queryClient.setQueryData(['mapeo-transaccion', uid], r.mapeo)
      toast.success(`Artículo ${r.itemCode} creado.`)
    },
    onError: (err: ApiError) => toast.error(err.message ?? 'Error al crear el artículo'),
  })

  // ─── Aceptar ────────────────────────────────────────────────────────────────────────────────
  const [aceptarConfirmOpen, setAceptarConfirmOpen] = useState(false)
  const [aceptarError, setAceptarError] = useState<string | null>(null)

  const aceptarMutation = useMutation({
    // aceptar() no lee el mapeo guardado por un PUT .../mapeo anterior — recalcula todo con lo
    // que llega en este mismo body, así que el `mapeo` se arma acá mismo a partir de las líneas
    // ya `confirmada` en pantalla.
    //
    // OJO — verificado contra el backend real (transacción 9bb4b6f2-...): un GET .../mapeo
    // "fresco" NUNCA devuelve `estado: "confirmada"` para una línea, ni siquiera immediatamente
    // después de un PUT que sí la confirmó — GET siempre la recalcula como "sugerida" con
    // `motivo: "mapeo_guardado"` (la sugerencia más fuerte, pero sigue siendo sugerencia, tal
    // como documenta el propio backend). El único momento en que una línea aparece como
    // `"confirmada"` es en la respuesta directa de ese PUT. Por eso este mutationFn usa
    // `mapeoQuery.data` (que `confirmarMapeoMutation`/`confirmarTodasLasSugerencias` actualizan
    // vía `setQueryData` con la respuesta real del PUT) y NO vuelve a pedir un GET antes de
    // aceptar — hacerlo reintroduce el bug original (manda `mapeo: []`) porque el GET siempre
    // "desconfirma" las líneas. Si el usuario navegó a otra pantalla y volvió, un remount de
    // `mapeoQuery` sí puede haber vuelto a mostrar "sugerida" — pero en ese caso `puedeAceptar`
    // también vuelve a `false` (mismo GET), así que el botón "Aceptar" queda deshabilitado hasta
    // que el usuario reconfirme desde la pantalla de mapeo — no hace falta lógica extra acá.
    mutationFn: () => aceptarTransaccionB2B(uid!, {
      mapeo: (mapeoQuery.data?.lineas ?? [])
        .filter((l) => l.estado === 'confirmada' && l.local)
        .map((l) => ({ indiceLinea: l.indice, itemCodeLocal: l.local!.itemCode })),
      sincronizarBarcodes: false,
    }),
    onSuccess: () => {
      toast.success('Transacción aceptada y sometida.')
      setAceptarConfirmOpen(false)
      setAceptarError(null)
      queryClient.invalidateQueries({ queryKey: ['transaccion-b2b', uid] })
      queryClient.invalidateQueries({ queryKey: ['transacciones-b2b'] })
    },
    onError: (err: ApiError) => {
      setAceptarConfirmOpen(false)
      const msg = err.message ?? 'Error al aceptar la transacción'
      setAceptarError(msg)
      if (/sin confirmar/i.test(msg)) {
        mapeoRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }
    },
  })

  // ─── Rechazar ───────────────────────────────────────────────────────────────────────────────
  const [rechazarOpen, setRechazarOpen] = useState(false)
  const [motivoRechazo, setMotivoRechazo] = useState('')

  const rechazarMutation = useMutation({
    mutationFn: () => rechazarTransaccionB2B(uid!, { motivo: motivoRechazo.trim() }),
    onSuccess: () => {
      toast.success('Transacción rechazada.')
      setRechazarOpen(false)
      setMotivoRechazo('')
      queryClient.invalidateQueries({ queryKey: ['transaccion-b2b', uid] })
      queryClient.invalidateQueries({ queryKey: ['transacciones-b2b'] })
    },
    onError: (err: ApiError) => toast.error(err.message ?? 'Error al rechazar la transacción'),
  })

  // ─── Reintentar / Cancelar envío ────────────────────────────────────────────────────────────
  const [cancelarOpen, setCancelarOpen] = useState(false)

  const reintentarMutation = useMutation({
    mutationFn: () => reintentarTransaccionB2B(uid!),
    onSuccess: () => {
      toast.success('Transacción reenviada para reintentar.')
      queryClient.invalidateQueries({ queryKey: ['transaccion-b2b', uid] })
      queryClient.invalidateQueries({ queryKey: ['transacciones-b2b'] })
    },
    onError: (err: ApiError) => toast.error(err.message ?? 'Error al reintentar la transacción'),
  })

  const cancelarMutation = useMutation({
    mutationFn: () => cancelarTransaccionB2B(uid!),
    onSuccess: () => {
      toast.success('Envío cancelado.')
      setCancelarOpen(false)
      queryClient.invalidateQueries({ queryKey: ['transaccion-b2b', uid] })
      queryClient.invalidateQueries({ queryKey: ['transacciones-b2b'] })
    },
    onError: (err: ApiError) => { toast.error(err.message ?? 'Error al cancelar el envío'); setCancelarOpen(false) },
  })

  // ─── Mi documento local (para saber si sigue en Borrador o ya está Sometido) ───────────────
  // Verificado contra un caso real: el backend puede devolver este campo como id plano o como
  // `{ doctype, name }` — normalizar siempre acá, nunca asumir que es un string ni renderizarlo
  // directo (React tira "Objects are not valid as a React child" si se le pasa el objeto).
  const documentoLocalId = typeof transaccion?.documentoLocal === 'string'
    ? transaccion.documentoLocal
    : (transaccion?.documentoLocal?.name ?? null)
  // `tipo` describe el TRATO (quién compró/vendió originalmente), no necesariamente el doctype
  // del documento de ESTE lado — verificado con un caso real: `direccion:"Entrante"` +
  // `tipo:"Compra"` con `documentoLocal.doctype: "Sales Invoice"` (el emisor recibe la compra del
  // socio y factura como venta). Cuando el backend manda el doctype, es la fuente de verdad; el
  // fallback a `tipo` queda solo para el shape viejo (string plano, sin doctype).
  const documentoLocalDoctype = transaccion?.documentoLocal && typeof transaccion.documentoLocal === 'object'
    ? transaccion.documentoLocal.doctype
    : undefined
  const documentoLocalEsVenta = documentoLocalDoctype
    ? documentoLocalDoctype === 'Sales Invoice'
    : transaccion?.tipo === 'Venta'

  const documentoLocalQuery = useQuery({
    queryKey: ['documento-local-transaccion', documentoLocalEsVenta, documentoLocalId],
    queryFn: () => fetchDocumentoLocal(documentoLocalEsVenta, documentoLocalId!),
    enabled: !!documentoLocalId,
  })

  const ncfActual = !documentoLocalEsVenta
    ? (documentoLocalQuery.data as Compra | undefined)?.ncfProveedor
    : (documentoLocalQuery.data as Invoice | undefined)?.ncf

  // Factura de venta local con saldo pendiente — el caso de "aceptada, falta cobro" (cobro
  // diferido en Caja: verificado contra un caso real que la factura queda en "draft" hasta que
  // se cobra — completar-cobro es lo que la somete y le asigna el NCF real, no algo de esta
  // pantalla — así que `outstandingAmount` es la señal correcta, no `status`).
  const facturaVentaPendienteDeCobro = documentoLocalEsVenta
    ? (documentoLocalQuery.data as Invoice | undefined)
    : undefined
  const mostrarPendienteDeCobro = esEntrante && !!documentoLocalId && !!facturaVentaPendienteDeCobro &&
    facturaVentaPendienteDeCobro.status !== 'cancelled' &&
    facturaVentaPendienteDeCobro.outstandingAmount > 0

  // ─── Diferencias / Igualar ──────────────────────────────────────────────────────────────────
  const diffQuery = useQuery({
    queryKey: ['diff-transaccion', uid],
    queryFn: () => getDiffTransaccion(uid!),
    enabled: !!uid && !!documentoLocalId,
  })

  const [igualarBorradorOpen, setIgualarBorradorOpen] = useState(false)
  const igualarBorradorMutation = useMutation({
    mutationFn: () => igualarBorradorTransaccion(uid!),
    onSuccess: (r) => {
      toast.success(`${r.message} El documento fue actualizado; revíselo y sométalo cuando esté listo.`, { duration: 8000 })
      setIgualarBorradorOpen(false)
      queryClient.invalidateQueries({ queryKey: ['transaccion-b2b', uid] })
      queryClient.invalidateQueries({ queryKey: ['diff-transaccion', uid] })
      queryClient.invalidateQueries({ queryKey: ['documento-local-transaccion'] })
    },
    onError: (err: ApiError) => {
      setIgualarBorradorOpen(false)
      if (err.code === 'MAPEO_INCOMPLETO') {
        toast.error('Faltan líneas por mapear antes de poder igualar — complete el mapeo de artículos.', { duration: 8000 })
        mapeoRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      } else {
        toast.error(err.message ?? 'Error al igualar con el borrador')
      }
    },
  })

  const [enmiendaOpen, setEnmiendaOpen] = useState(false)
  const [confirmoAnulacion, setConfirmoAnulacion] = useState(false)
  const [motivoAnulacion, setMotivoAnulacion] = useState('')
  const [enmiendaErrorBanner, setEnmiendaErrorBanner] = useState<string | null>(null)

  const ENMIENDA_ERRORES: Record<string, string> = {
    FACTURA_COBRADA: 'Revierta el cobro antes de igualar, o emita una nota de crédito por la diferencia',
    NOTAS_CREDITO_ENLAZADAS: 'Resuélvalas antes, o emita una nota de crédito adicional',
    ECF_YA_EMITIDO: 'Anular un e-CF tiene su propio procedimiento — use una nota de crédito por la diferencia',
  }

  function cerrarEnmienda() {
    setEnmiendaOpen(false)
    setConfirmoAnulacion(false)
    setMotivoAnulacion('')
    setEnmiendaErrorBanner(null)
  }

  const igualarEnmiendaMutation = useMutation({
    mutationFn: () => igualarConEnmiendaTransaccion(uid!, { confirmoAnulacion, motivoAnulacion: motivoAnulacion.trim() }),
    onSuccess: (r) => {
      toast.success(`${r.message} La enmienda quedó en BORRADOR sin NCF todavía — revísela y sométala manualmente cuando esté lista.`, { duration: 8000 })
      cerrarEnmienda()
      queryClient.invalidateQueries({ queryKey: ['transaccion-b2b', uid] })
      queryClient.invalidateQueries({ queryKey: ['diff-transaccion', uid] })
      queryClient.invalidateQueries({ queryKey: ['documento-local-transaccion'] })
    },
    onError: (err: ApiError) => {
      setEnmiendaErrorBanner(ENMIENDA_ERRORES[err.code] ?? err.message ?? 'Error al igualar con enmienda')
    },
  })

  // ─── Enlazar documento existente ────────────────────────────────────────────────────────────
  const [enlazarOpen, setEnlazarOpen] = useState(false)
  const [enlazarStep, setEnlazarStep] = useState<EnlazarStep>('buscar')
  const [candDesde, setCandDesde] = useState('')
  const [candHasta, setCandHasta] = useState('')
  const [candidatoElegido, setCandidatoElegido] = useState<DocumentoEnlazable | null>(null)
  const [decisionesEnlace, setDecisionesEnlace] = useState<DecisionMapeoDto[]>([])
  const [sincronizarBarcodesEnlace, setSincronizarBarcodesEnlace] = useState(false)
  const [notaParaElSocio, setNotaParaElSocio] = useState('')
  const [enlazarError, setEnlazarError] = useState<string | null>(null)
  const [enlazarResultado, setEnlazarResultado] = useState<EnlazarTransaccionResponse | null>(null)

  const candidatosQuery = useQuery({
    queryKey: ['candidatos-enlace-transaccion', uid, candDesde, candHasta],
    queryFn: () => getCandidatosEnlaceTransaccion(uid!, { desde: candDesde || undefined, hasta: candHasta || undefined }),
    enabled: enlazarOpen && enlazarStep === 'buscar' && puedeBuscarCandidatos,
  })

  function abrirEnlazar() {
    setEnlazarOpen(true)
    setEnlazarStep('buscar')
    setCandidatoElegido(null)
    setDecisionesEnlace([])
    setSincronizarBarcodesEnlace(false)
    setNotaParaElSocio('')
    setEnlazarError(null)
    setEnlazarResultado(null)
  }

  function mergeDecisiones(nuevas: DecisionMapeoDto[], sync: boolean) {
    setDecisionesEnlace((prev) => {
      const map = new Map(prev.map((d) => [d.indiceLinea, d]))
      nuevas.forEach((d) => map.set(d.indiceLinea, d))
      return Array.from(map.values())
    })
    setSincronizarBarcodesEnlace(sync)
  }

  const ENLAZAR_ERRORES: Record<string, string> = {
    DOCUMENTO_NO_SOMETIDO: 'Solo se pueden enlazar documentos ya sometidos',
    RNC_NO_COINCIDE: 'El cliente/proveedor del documento no coincide con el RNC de la contraparte — debe coincidir, sin excepciones.',
    DOCUMENTO_YA_ENLAZADO: 'Ya está conciliado con otra operación',
    YA_EXISTE_DOCUMENTO_SOMETIDO: 'Tiene dos documentos para la misma operación — anule uno antes de continuar',
  }

  const enlazarMutation = useMutation({
    mutationFn: () => enlazarTransaccionB2B(uid!, {
      docname: candidatoElegido!.name,
      mapeo: decisionesEnlace,
      sincronizarBarcodes: sincronizarBarcodesEnlace,
      notaParaElSocio: notaParaElSocio.trim() || undefined,
    }),
    onSuccess: (r) => {
      setEnlazarResultado(r)
      setEnlazarStep('exito')
      setEnlazarError(null)
      queryClient.invalidateQueries({ queryKey: ['transaccion-b2b', uid] })
      queryClient.invalidateQueries({ queryKey: ['transacciones-b2b'] })
      queryClient.invalidateQueries({ queryKey: ['diff-transaccion', uid] })
    },
    onError: (err: ApiError) => {
      if (err.code === 'MAPEO_INCOMPLETO') {
        setEnlazarStep('mapeo')
        setEnlazarError('Complete el mapeo de artículos antes de enlazar.')
        return
      }
      if (err.code === 'MONEDA_NO_COINCIDE') {
        const d = err.details as Record<string, unknown> | undefined
        const origen = (d?.monedaOrigen ?? d?.monedaDocumento) as string | undefined
        const destino = (d?.monedaDestino ?? d?.monedaContraparte) as string | undefined
        setEnlazarError(origen && destino
          ? `Las monedas no coinciden: documento en ${origen}, contraparte en ${destino}.`
          : (err.message ?? 'Las monedas no coinciden entre el documento y la contraparte.'))
        return
      }
      setEnlazarError(ENLAZAR_ERRORES[err.code] ?? err.message ?? 'Error al enlazar la transacción')
    },
  })

  if (isLoading) {
    return (
      <div className="page-container">
        <span className="skeleton-box" style={{ height: 28, width: 240, display: 'block', marginBottom: 16 }} />
        <span className="skeleton-box" style={{ height: 220, width: '100%', display: 'block' }} />
      </div>
    )
  }

  if (!puedeVer) {
    return (
      <div className="page-container">
        <a className="page-back-link" onClick={() => navigate('/relaciones-comerciales/transacciones')}><ArrowLeft size={14} /> Transacciones</a>
        <div className="card">
          <div className="empty-state">
            <p className="empty-title">Sin acceso</p>
            <p className="empty-sub">No tienes permiso para ver el detalle de esta transacción.</p>
          </div>
        </div>
      </div>
    )
  }

  if (isError || !transaccion) {
    return (
      <div className="page-container">
        <a className="page-back-link" onClick={() => navigate('/relaciones-comerciales/transacciones')}><ArrowLeft size={14} /> Transacciones</a>
        <div style={{ textAlign: 'center', padding: '48px 0', color: 'var(--text-tertiary)' }}>No se encontró la transacción</div>
      </div>
    )
  }

  const badge = ESTADO_TRANSACCION_BADGE[transaccion.estado]
  const documentoLocalEstado = documentoLocalQuery.data?.status
  const mostrarIgualarBorrador = transaccion.estado !== 'Enlazada' && documentoLocalEstado === 'draft' && puedeIgualarBorrador
  const mostrarIgualarEnmienda = transaccion.estado !== 'Enlazada' && documentoLocalEstado === 'submitted' && puedeIgualarEnmienda

  return (
    <div className="page-container">
      <a className="page-back-link" onClick={() => navigate('/relaciones-comerciales/transacciones')}><ArrowLeft size={14} /> Transacciones</a>

      <div className="page-header">
        <div>
          <h1 className="page-title" style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            {transaccion.transaccionUid}
            <Badge variant={badge.variant}>{badge.label}</Badge>
          </h1>
          <p className="page-sub">
            {transaccion.direccion} · {transaccion.tipo} · {transaccion.contraparte.nombre} · {formatDateTime(transaccion.creation)}
          </p>
          {transaccion.motivoEstado && (
            <div className="inline-alert inline-alert-warn" style={{ marginTop: 8 }}>
              <AlertTriangle size={14} />
              <span>{transaccion.motivoEstado}</span>
            </div>
          )}
        </div>
      </div>

      {transaccion.origenYaSometido === true && necesitaAccion && (
        <div className="inline-alert inline-alert-info" style={{ marginBottom: 16 }}>
          <AlertTriangle size={14} />
          <span>
            El socio ya sometió su documento con NCF — no se puede someter uno nuevo sin duplicar el comprobante.
            Use &quot;Enlazar&quot; para conciliar con un documento que usted ya tenga registrado, o rechace la transacción.
          </span>
        </div>
      )}

      <div className="doc-actions-bar">
        {mostrarRechazar && (
          <button className="btn btn-danger btn-size-sm" onClick={() => setRechazarOpen(true)}>Rechazar</button>
        )}
        {mostrarEnlazar && (
          <button className="btn btn-secondary btn-size-sm" onClick={abrirEnlazar}>
            {transaccion.tipo === 'Compra' ? 'Enlazar mi compra existente' : 'Enlazar mi factura existente'}
          </button>
        )}
        {mostrarReintentar && (
          <button className="btn btn-navy btn-size-sm" disabled={reintentarMutation.isPending} onClick={() => reintentarMutation.mutate()}>
            <RotateCw size={14} /> Reintentar
          </button>
        )}
        {mostrarCancelar && (
          <button className="btn btn-secondary btn-size-sm" onClick={() => setCancelarOpen(true)}>
            <Ban size={14} /> Cancelar envío
          </button>
        )}
      </div>

      {/* Zona 1 — Lo que envió el socio */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-header"><h2 className="card-title">Lo que envió el socio</h2></div>
        <div className="card-body">
          <PayloadSnapshotView payload={transaccion.payloadSnapshot} />
        </div>
      </div>

      {/* Zona 2 — Mi documento */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-header"><h2 className="card-title">Mi documento</h2></div>
        <div className="card-body">
          {documentoLocalId ? (
            <Link to={documentoLocalEsVenta ? `/facturas/${documentoLocalId}` : `/compras/${documentoLocalId}`}>
              {documentoLocalId}
            </Link>
          ) : (
            <span className="td-muted">Aún no se ha generado un documento local</span>
          )}
        </div>
      </div>

      {/* Factura de venta ya aceptada y sometida, pendiente de cobro en Caja — el paso pendiente
          real no es de Relaciones Comerciales, así que se linkea directo a la pantalla de cobro
          en vez de duplicar el flujo acá. Al cobrar, el NCF se le manda solo al socio. */}
      {mostrarPendienteDeCobro && (
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="card-body">
            <div className="inline-alert inline-alert-info">
              <AlertTriangle size={14} />
              <span>
                Factura aceptada, pendiente de cobro en Caja.{' '}
                <Link to={`/caja/por-cobrar?invoiceId=${encodeURIComponent(documentoLocalId!)}`}>
                  Ir a cobrar {documentoLocalId}
                </Link>
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Lado Saliente con "Requiere Mapeo"/"Pendiente" (o cualquier estado que necesita acción):
          esa acción es responsabilidad exclusiva de la contraparte que recibió el documento —
          acá solo se informa, sin formulario ni botones. El texto cambia según qué está
          esperando puntualmente (mapeo vs. que la contraparte cobre para poder emitir el NCF) —
          nunca inferir esto de una sola frase genérica, `estado` ya lo distingue. */}
      {mostrarEsperandoContraparte && (
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="card-body">
            <div className="inline-alert inline-alert-info">
              <AlertTriangle size={14} />
              <span>
                {transaccion.estado === 'Pendiente'
                  ? 'Esperando que el vendedor complete el cobro para recibir el comprobante fiscal (NCF).'
                  : 'Esperando que la contraparte mapee los artículos de esta transacción.'}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Mapeo de artículos — flujo de Aceptar */}
      {mostrarAceptar && (
        <div className="card" style={{ marginBottom: 16 }} ref={mapeoRef}>
          <div className="card-header">
            <h2 className="card-title">Mapeo de artículos</h2>
            <button
              className="btn btn-secondary btn-size-sm"
              disabled={refrescarMapeoMutation.isPending}
              onClick={() => refrescarMapeoMutation.mutate()}
              title="Vuelve a preguntarle al socio su catálogo actual — puede tardar un poco más que la carga normal"
            >
              <RefreshCw size={14} style={refrescarMapeoMutation.isPending ? { animation: 'spin 1s linear infinite' } : undefined} />
              {refrescarMapeoMutation.isPending ? 'Actualizando…' : 'Actualizar sugerencias'}
            </button>
          </div>
          <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {mapeoQuery.isLoading && <span className="skeleton-box" style={{ height: 120, width: '100%', display: 'block' }} />}
            {mapeoQuery.isError && (
              <div className="inline-alert inline-alert-error"><AlertTriangle size={14} /><span>No se pudo cargar el mapeo de artículos.</span></div>
            )}
            {mapeoQuery.data && (
              <MapeoForm
                resultado={mapeoQuery.data}
                onConfirmarLineas={(decisiones, sync) => confirmarMapeoMutation.mutate({ decisiones, sincronizarBarcodes: sync })}
                confirmando={confirmarMapeoMutation.isPending}
                onCrearArticulo={(dto) => crearArticuloMutation.mutate(dto)}
                creandoArticulo={crearArticuloMutation.isPending}
                puedeGuardar={puedeMapeoGuardar}
                puedeCrearArticulo={puedeMapeoCrearArticulo}
                puedeSincronizarBarcodes={puedeMapeoSincronizarBarcodes}
              />
            )}
            <div>
              <button className="btn btn-primary" disabled={!mapeoQuery.data?.puedeAceptar} onClick={() => setAceptarConfirmOpen(true)}>
                Aceptar
              </button>
            </div>
            {aceptarError && (
              <div className="inline-alert inline-alert-error">
                <AlertTriangle size={14} />
                <span>{aceptarError} La transacción permanece en estado &quot;Pendiente&quot; — corrija lo indicado y vuelva a intentarlo.</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Zona 3 — Diferencias */}
      {diffQuery.data && (
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="card-header"><h2 className="card-title">Diferencias</h2></div>
          <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <DiffView diff={diffQuery.data} />
            {(mostrarIgualarBorrador || mostrarIgualarEnmienda) && (
              <div style={{ display: 'flex', gap: 8 }}>
                {mostrarIgualarBorrador && (
                  <button className="btn btn-secondary btn-size-sm" onClick={() => setIgualarBorradorOpen(true)}>Igualar</button>
                )}
                {mostrarIgualarEnmienda && (
                  <button className="btn btn-danger btn-size-sm" onClick={() => setEnmiendaOpen(true)}>Igualar con enmienda</button>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Historial */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-header"><h2 className="card-title">Historial</h2></div>
        <div className="card-body">
          {transaccion.historial.length === 0 ? (
            <span className="td-muted">Sin eventos registrados</span>
          ) : (
            <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 10 }}>
              {transaccion.historial.map((h, i) => (
                <li key={i} style={{ fontSize: 13, borderBottom: '1px solid var(--border-subtle, #eee)', paddingBottom: 8 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                    <strong>{h.evento}</strong>
                    <span className="td-muted">{formatDateTime(h.fecha)}</span>
                  </div>
                  <div className="td-muted">{h.actor}{h.detalle ? ` — ${h.detalle}` : ''}</div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* ─── Modales ────────────────────────────────────────────────────────────────────────── */}

      <ConfirmModal
        open={aceptarConfirmOpen}
        onClose={() => setAceptarConfirmOpen(false)}
        onConfirm={() => aceptarMutation.mutate()}
        title="Confirmar aceptación"
        description={`Se registrará y someterá una ${transaccion.tipo === 'Compra' ? 'compra' : 'venta'} por ${formatDOP(transaccion.documentoOrigen?.total ?? 0)}, afectando inventario y contabilidad.`}
        confirmLabel="Aceptar y someter"
        variant="default"
        loading={aceptarMutation.isPending}
      />

      <Modal
        open={rechazarOpen}
        onClose={() => setRechazarOpen(false)}
        title="Rechazar transacción"
        footer={
          <>
            <button className="btn btn-ghost" onClick={() => setRechazarOpen(false)} disabled={rechazarMutation.isPending}>Cancelar</button>
            <button
              className="btn btn-danger"
              disabled={!motivoRechazo.trim() || rechazarMutation.isPending}
              onClick={() => rechazarMutation.mutate()}
            >
              {rechazarMutation.isPending ? <span className="spinner spinner-white spinner-sm" /> : 'Rechazar'}
            </button>
          </>
        }
      >
        <div className="ff-wrap">
          <label className="ff-label ff-required" htmlFor="motivoRechazo">Motivo</label>
          <textarea
            id="motivoRechazo"
            className="ff-textarea"
            rows={3}
            value={motivoRechazo}
            onChange={(e) => setMotivoRechazo(e.target.value)}
            placeholder="Explique por qué se rechaza esta transacción"
          />
        </div>
      </Modal>

      <ConfirmModal
        open={cancelarOpen}
        onClose={() => setCancelarOpen(false)}
        onConfirm={() => cancelarMutation.mutate()}
        title="Cancelar envío"
        description="¿Confirmas cancelar el envío de esta transacción? Solo se puede cancelar mientras el destino no haya respondido."
        confirmLabel="Cancelar envío"
        variant="danger"
        loading={cancelarMutation.isPending}
      />

      <ConfirmModal
        open={igualarBorradorOpen}
        onClose={() => setIgualarBorradorOpen(false)}
        onConfirm={() => igualarBorradorMutation.mutate()}
        title="Igualar con el borrador del socio"
        description="Se sobrescribirán la cabecera y las líneas de su documento en borrador con los datos que envió el socio. Podrá revisar los cambios antes de someterlo."
        confirmLabel="Igualar"
        variant="default"
        loading={igualarBorradorMutation.isPending}
      />

      <Modal
        open={enmiendaOpen}
        onClose={cerrarEnmienda}
        title="Igualar con enmienda"
        footer={
          <>
            <button className="btn btn-ghost" onClick={cerrarEnmienda} disabled={igualarEnmiendaMutation.isPending}>Cancelar</button>
            <button
              className="btn btn-danger"
              disabled={!confirmoAnulacion || !motivoAnulacion.trim() || igualarEnmiendaMutation.isPending}
              onClick={() => igualarEnmiendaMutation.mutate()}
            >
              {igualarEnmiendaMutation.isPending ? <span className="spinner spinner-white spinner-sm" /> : 'Igualar con enmienda'}
            </button>
          </>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div className="inline-alert inline-alert-warn">
            <AlertTriangle size={16} />
            <span>
              Esto anulará la factura {ncfActual || documentoLocalId} y creará una nueva versión en
              borrador con un NCF distinto. La factura anulada no se puede recuperar.
            </span>
          </div>
          <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 13 }}>
            <input type="checkbox" checked={confirmoAnulacion} onChange={(e) => setConfirmoAnulacion(e.target.checked)} style={{ marginTop: 2 }} />
            <span>Confirmo que entiendo que se anulará la factura actual y que la anulación no se puede recuperar.</span>
          </label>
          <div className="ff-wrap">
            <label className="ff-label ff-required" htmlFor="motivoAnulacion">Motivo de la anulación</label>
            <textarea
              id="motivoAnulacion"
              className="ff-textarea"
              rows={3}
              value={motivoAnulacion}
              onChange={(e) => setMotivoAnulacion(e.target.value)}
            />
          </div>
          {enmiendaErrorBanner && (
            <div className="inline-alert inline-alert-error">
              <AlertTriangle size={14} />
              <span>{enmiendaErrorBanner}</span>
            </div>
          )}
        </div>
      </Modal>

      <Modal
        open={enlazarOpen}
        onClose={() => setEnlazarOpen(false)}
        title={transaccion.tipo === 'Compra' ? 'Enlazar mi compra existente' : 'Enlazar mi factura existente'}
        subtitle={
          enlazarStep === 'buscar' ? 'Elija el documento que ya tiene registrado para conciliarlo con esta transacción.'
            : enlazarStep === 'mapeo' ? 'Empareje las líneas del documento elegido con los artículos del socio.'
              : enlazarStep === 'confirmar' ? 'Revise y confirme el enlace.'
                : 'Enlace completado'
        }
        size="lg"
        footer={
          enlazarStep === 'buscar' ? (
            <button className="btn btn-ghost" onClick={() => setEnlazarOpen(false)}>Cerrar</button>
          ) : enlazarStep === 'mapeo' ? (
            <>
              <button className="btn btn-ghost" onClick={() => setEnlazarStep('buscar')}>Atrás</button>
              <button className="btn btn-primary" onClick={() => setEnlazarStep('confirmar')}>Continuar</button>
            </>
          ) : enlazarStep === 'confirmar' ? (
            <>
              <button className="btn btn-ghost" onClick={() => setEnlazarStep('mapeo')} disabled={enlazarMutation.isPending}>Atrás</button>
              <button className="btn btn-primary" disabled={enlazarMutation.isPending} onClick={() => enlazarMutation.mutate()}>
                {enlazarMutation.isPending ? <span className="spinner spinner-white spinner-sm" /> : 'Confirmar enlace'}
              </button>
            </>
          ) : (
            <button className="btn btn-primary" onClick={() => setEnlazarOpen(false)}>Cerrar</button>
          )
        }
      >
        {enlazarStep === 'buscar' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ display: 'flex', gap: 12 }}>
              <FilterField label="Desde"><DatePicker value={candDesde} onChange={setCandDesde} clearable /></FilterField>
              <FilterField label="Hasta"><DatePicker value={candHasta} onChange={setCandHasta} clearable /></FilterField>
            </div>
            {!puedeBuscarCandidatos ? (
              <div className="inline-alert inline-alert-warn"><AlertTriangle size={14} /><span>No tienes permiso para buscar candidatos a enlazar.</span></div>
            ) : candidatosQuery.isLoading ? (
              <span className="skeleton-box" style={{ height: 120, width: '100%', display: 'block' }} />
            ) : candidatosQuery.isError ? (
              <div className="inline-alert inline-alert-error"><AlertTriangle size={14} /><span>No se pudieron cargar los candidatos.</span></div>
            ) : (candidatosQuery.data?.length ?? 0) === 0 ? (
              <span className="td-muted">Sin documentos candidatos para enlazar.</span>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {candidatosQuery.data!.map((c) => (
                  <button
                    key={c.name}
                    type="button"
                    className="btn btn-ghost"
                    style={{ justifyContent: 'flex-start', textAlign: 'left', flexDirection: 'column', alignItems: 'flex-start', gap: 4, padding: 12, border: '1px solid var(--border-subtle, #e5e5e5)' }}
                    onClick={() => { setCandidatoElegido(c); setEnlazarStep('mapeo') }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%' }}>
                      <strong>{c.name}</strong>
                      <span className="td-muted">score {formatNumber(c.score)}</span>
                    </div>
                    <div className="td-muted" style={{ fontSize: 12 }}>
                      {formatDate(c.fecha)} · {formatDOP(c.total)}
                      {c.ncf ? ` · NCF ${c.ncf}` : ''}{c.billNo ? ` · Factura ${c.billNo}` : ''}
                    </div>
                    {c.coincidencias.length > 0 && (
                      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                        {c.coincidencias.map((m) => <Badge key={m} variant="neutral">{m}</Badge>)}
                      </div>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {enlazarStep === 'mapeo' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
              {candidatoElegido ? (
                <div className="td-muted" style={{ fontSize: 13 }}>
                  Emparejando contra: <strong>{candidatoElegido.name}</strong> ({formatDate(candidatoElegido.fecha)}, {formatDOP(candidatoElegido.total)})
                </div>
              ) : <div />}
              <button
                className="btn btn-secondary btn-size-sm"
                disabled={refrescarMapeoMutation.isPending}
                onClick={() => refrescarMapeoMutation.mutate()}
                title="Vuelve a preguntarle al socio su catálogo actual — puede tardar un poco más que la carga normal"
              >
                <RefreshCw size={14} style={refrescarMapeoMutation.isPending ? { animation: 'spin 1s linear infinite' } : undefined} />
                {refrescarMapeoMutation.isPending ? 'Actualizando…' : 'Actualizar sugerencias'}
              </button>
            </div>
            {mapeoQuery.isLoading && <span className="skeleton-box" style={{ height: 120, width: '100%', display: 'block' }} />}
            {mapeoQuery.data && (
              <MapeoForm
                resultado={mapeoQuery.data}
                onConfirmarLineas={(decisiones, sync) => mergeDecisiones(decisiones, sync)}
                onCrearArticulo={(dto) => crearArticuloMutation.mutate(dto)}
                creandoArticulo={crearArticuloMutation.isPending}
                puedeGuardar={puedeMapeoGuardar}
                puedeCrearArticulo={puedeMapeoCrearArticulo}
                puedeSincronizarBarcodes={puedeMapeoSincronizarBarcodes}
              />
            )}
          </div>
        )}

        {enlazarStep === 'confirmar' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div className="inline-alert inline-alert-warn">
              <AlertTriangle size={14} />
              <span>Al enlazar se descartará el borrador que el sistema había preparado.</span>
            </div>
            {candidatoElegido && (
              <div className="fields-grid">
                <div className="detail-field"><span className="detail-label">Documento</span><span className="detail-value">{candidatoElegido.name}</span></div>
                <div className="detail-field"><span className="detail-label">Fecha</span><span className="detail-value">{formatDate(candidatoElegido.fecha)}</span></div>
                <div className="detail-field"><span className="detail-label">Total</span><span className="detail-value">{formatDOP(candidatoElegido.total)}</span></div>
              </div>
            )}
            <div className="ff-wrap">
              <label className="ff-label">Nota para el socio (opcional)</label>
              <textarea className="ff-textarea" rows={2} value={notaParaElSocio} onChange={(e) => setNotaParaElSocio(e.target.value)} />
            </div>
            {enlazarError && (
              <div className="inline-alert inline-alert-error"><AlertTriangle size={14} /><span>{enlazarError}</span></div>
            )}
          </div>
        )}

        {enlazarStep === 'exito' && enlazarResultado && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div className="inline-alert inline-alert-success"><span>{enlazarResultado.message}</span></div>
            {enlazarResultado.advertenciaFiscal && (
              <div className="inline-alert inline-alert-error">
                <AlertTriangle size={14} />
                <span><strong>Advertencia fiscal:</strong> {enlazarResultado.advertenciaFiscal}</span>
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  )
}

// ─── Zona 1 — payloadSnapshot genérico ─────────────────────────────────────────────────────────
// Shape variable según lo que envió el socio: si trae `documento.lineas[]` se arma una tabla; si
// no, se cae a JSON crudo legible. Todo el contenido es texto ajeno — nunca se interpreta como
// HTML/markdown, siempre vía `{}` (React escapa por defecto).
function PayloadSnapshotView({ payload }: { payload: Record<string, unknown> }) {
  const documento = payload?.documento as Record<string, unknown> | undefined
  const lineas = documento?.lineas

  if (!documento || !Array.isArray(lineas)) {
    return (
      <pre style={{ margin: 0, padding: 12, background: 'var(--surface-muted, #f7f7f8)', borderRadius: 8, fontSize: 12, whiteSpace: 'pre-wrap', wordBreak: 'break-word', maxHeight: 400, overflow: 'auto' }}>
        {JSON.stringify(payload, null, 2)}
      </pre>
    )
  }

  const cabecera = Object.entries(documento).filter(([k]) => k !== 'lineas')
  const lineasArr = lineas as Record<string, unknown>[]
  const columnasSet = new Set<string>()
  lineasArr.forEach((l) => Object.keys(l).forEach((k) => columnasSet.add(k)))
  const columnas = Array.from(columnasSet)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {cabecera.length > 0 && (
        <div className="fields-grid">
          {cabecera.map(([k, v]) => (
            <div className="detail-field" key={k}>
              <span className="detail-label">{k}</span>
              <span className="detail-value">{formatSnapshotValue(k, v)}</span>
            </div>
          ))}
        </div>
      )}
      {lineasArr.length > 0 && (
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>{columnas.map((c) => <th key={c}>{c}</th>)}</tr>
            </thead>
            <tbody>
              {lineasArr.map((l, i) => (
                <tr key={i}>
                  {columnas.map((c) => <td key={c}>{formatSnapshotValue(c, l[c])}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function formatSnapshotValue(key: string, v: unknown): string {
  if (v === null || v === undefined) return '—'
  if (typeof v === 'number') {
    const k = key.toLowerCase()
    if (k.includes('total') || k.includes('monto') || k.includes('precio')) return formatDOP(v)
    return formatNumber(v)
  }
  if (typeof v === 'boolean') return v ? 'Sí' : 'No'
  if (typeof v === 'object') return JSON.stringify(v)
  return String(v)
}
