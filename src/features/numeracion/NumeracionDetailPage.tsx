import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useLocation, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  AlertTriangle,
  ArrowLeft,
  ChevronDown,
  ChevronUp,
  Hash,
  History,
  Info,
  Plus,
  Save,
  Star,
  Trash2,
} from 'lucide-react'
import {
  fijarContadorNumeracion,
  getNumeracionEstado,
  getNumeracionIndice,
  previewNumeracion,
  updateNumeracion,
} from '@/shared/api/numeracion'
import { isApiErrorCode } from '@/shared/api/client'
import type {
  NombradoPor,
  NumeracionEstado,
  ReglaSucursal,
  SerieNumeracion,
} from '@/shared/api/types'
import { listSucursales } from '@/shared/api/sucursales'
import { PlantillaInput } from './PlantillaInput'
import { PageHeader } from '@/components/shared/PageHeader'
import { RecargarButton } from '@/components/shared/RecargarButton'
import { Select, SelectItem } from '@/components/ui/select'
import { ConfirmModal, Modal } from '@/shared/ui/Modal'
import { useTabs } from '@/contexts/TabsContext'
import ModuloNoContratadoPage from '@/features/_shared/ModuloNoContratadoPage'
import SinAccesoPage from '@/features/_shared/SinAccesoPage'
import {
  AYUDA_SUCURSAL_FACTURA_VENTA,
  AYUDA_SUCURSAL_GENERAL,
  AYUDA_SUCURSAL_MIGRACION,
  AYUDA_SUCURSAL_NOTA_CREDITO,
  NUMERACION_RUTAS_FISCALES,
  PLANTILLA_TOKENS,
  REGLAS_SUCURSAL_MAX_CANTIDAD,
  opcionesNombradoPor,
  proximoConValor,
  validarListaReglasSucursal,
  validarListaSeries,
  validarPlantilla,
  validarPlantillaReglaDevolucion,
  validarPlantillaSucursal,
} from './numeracionReferencia'
import './Numeracion.css'

// ─── Detalle — docs/tasks/PROMPT_NUMERACION_DOCUMENTOS_FRONTEND.md §6 ────────
// Tres `modo`s: `series` (editor de lista), `regla-devolucion` (plantilla única) y
// `lote` (interruptor + prefijo). Nada se aplica sin Guardar, excepto "Fijar contador".

let filaSeq = 0
function nuevaFilaId(): string {
  filaSeq += 1
  return `fila-${Date.now()}-${filaSeq}`
}

interface FilaBorrador {
  id: string
  plantilla: string
  /** Serie del servidor (null = recién agregada, sin próximo/contador hasta guardar). */
  server: SerieNumeracion | null
}

// ─── Vista previa en vivo (§4.5) ─────────────────────────────────────────────
// Debounce ~400 ms, cancela la anterior (se ignoran respuestas viejas por secuencia).
// `[]` ⇒ "Plantilla no válida" (no es un error HTTP). Con `{campos}` no se puede previsualizar.

function PreviewPlantilla({ ruta, plantilla }: { ruta: string; plantilla: string }) {
  const [estado, setEstado] = useState<{ fase: 'idle' | 'cargando' | 'ok' | 'invalida'; ejemplos: string[] }>({
    fase: 'idle',
    ejemplos: [],
  })
  const seq = useRef(0)

  useEffect(() => {
    const valor = plantilla.trim()
    if (!valor || validarPlantilla(valor) !== null) {
      setEstado({ fase: 'idle', ejemplos: [] })
      return
    }
    if (valor.includes('{') || valor.includes('}')) {
      setEstado({ fase: 'idle', ejemplos: [] })
      return
    }
    setEstado((prev) => (prev.fase === 'ok' ? prev : { fase: 'cargando', ejemplos: [] }))
    const miSeq = ++seq.current
    const timer = setTimeout(() => {
      setEstado({ fase: 'cargando', ejemplos: [] })
      previewNumeracion(ruta, valor)
        .then((ejemplos) => {
          if (seq.current !== miSeq) return
          setEstado(ejemplos.length === 0 ? { fase: 'invalida', ejemplos: [] } : { fase: 'ok', ejemplos })
        })
        .catch(() => {
          if (seq.current !== miSeq) return
          setEstado({ fase: 'invalida', ejemplos: [] })
        })
    }, 400)
    return () => clearTimeout(timer)
  }, [ruta, plantilla])

  const valor = plantilla.trim()
  if (!valor || validarPlantilla(valor) !== null) return null
  if (valor.includes('{') || valor.includes('}')) {
    return (
      <div className="num-preview-box">
        <span>No se puede previsualizar: usa campos del documento</span>
      </div>
    )
  }
  if (estado.fase === 'cargando' || estado.fase === 'idle') {
    return (
      <div className="num-preview-box">
        <span style={{ color: 'var(--text-tertiary)' }}>Vista previa…</span>
      </div>
    )
  }
  if (estado.fase === 'invalida') {
    return (
      <div className="num-preview-box">
        <span style={{ color: 'var(--error-text)' }}>Plantilla no válida</span>
      </div>
    )
  }
  return (
    <div className="num-preview-box" aria-live="polite">
      <span style={{ color: 'var(--text-tertiary)' }}>Se vería así:</span>
      {estado.ejemplos.map((e) => (
        <code key={e}>{e}</code>
      ))}
    </div>
  )
}

// ─── Banners obligatorios (§8) ───────────────────────────────────────────────

function BannersDetalle({ estado }: { estado: NumeracionEstado }) {
  const segmento = estado.ruta.split('/').pop() ?? estado.ruta
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 16 }}>
      <div className="inline-alert inline-alert-info">
        <Info size={14} style={{ flexShrink: 0 }} />
        <span>
          Los cambios aplican <strong>solo a documentos nuevos</strong>. Los documentos ya
          emitidos conservan su número.
        </span>
      </div>
      {estado.modo === 'series' && (
        <div className="inline-alert inline-alert-info">
          <Info size={14} style={{ flexShrink: 0 }} />
          <span>
            La <strong>primera</strong> serie de la lista es la que el sistema usa al crear
            documentos automáticamente. Cambiar el orden cambia cuál se usa.
          </span>
        </div>
      )}
      {NUMERACION_RUTAS_FISCALES.has(segmento) && (
        <div className="inline-alert inline-alert-info">
          <Info size={14} style={{ flexShrink: 0 }} />
          <span>
            Esto cambia el <strong>número interno</strong> del documento. El NCF/e-NCF fiscal se
            configura aparte (Configuración → Secuencias NCF) y <strong>no</strong> se ve afectado.
          </span>
        </div>
      )}
      {estado.reservadas.length > 0 && (
        <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>
          El sistema mantiene además series reservadas (
          {estado.reservadas.map((r) => (
            <code key={r} style={{ fontSize: 11 }}>{r}</code>
          )).reduce<React.ReactNode[]>((acc, el, i) => (i === 0 ? [el] : [...acc, ', ', el]), [])}
          ) para facturas de apertura. No se pueden modificar.
        </div>
      )}
    </div>
  )
}

// ─── Ayuda de sintaxis + chips (§6.1) ────────────────────────────────────────

function AyudaPlantillas({ onInsertar }: { onInsertar: (token: string) => void }) {
  const [abierta, setAbierta] = useState(false)
  return (
    <div className="card" style={{ marginTop: 16 }}>
      <button
        type="button"
        className="card-header"
        onClick={() => setAbierta((v) => !v)}
        aria-expanded={abierta}
        style={{ width: '100%', cursor: 'pointer', background: 'none', border: 'none', textAlign: 'left' }}
      >
        <span className="card-title">¿Cómo se escribe una plantilla?</span>
        <ChevronDown size={14} style={{ transform: abierta ? 'rotate(180deg)' : undefined, transition: 'transform 0.15s' }} />
      </button>
      {abierta && (
        <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 10, fontSize: 13, color: 'var(--text-secondary)' }}>
          <p style={{ margin: 0 }}>
            Una plantilla son <strong>partes separadas por punto</strong>. El número consecutivo se
            escribe con <code>#</code> precedido de punto: <code>.#####</code> = 5 dígitos. Ej.:{' '}
            <code>FAC-.YYYY.-.#####</code> → <code>FAC-2026-00001</code>.
          </p>
          <p style={{ margin: 0 }}>
            Si la plantilla <strong>no tiene `#`</strong>, el sistema agrega <code>.#####</code> solo:{' '}
            <code>FAC-.YYYY.-</code> → <code>FAC-2026-00001</code>.
          </p>
          <p style={{ margin: 0 }}>
            Variables de fecha (entre puntos): <code>.YYYY.</code> año de 4 dígitos,{' '}
            <code>.YY.</code> año de 2, <code>.MM.</code> mes, <code>.DD.</code> día,{' '}
            <code>.FY.</code> año fiscal. Ej.: <code>COT-.YY.-.MM.-.####</code> →{' '}
            <code>COT-26-10-0001</code>.
          </p>
          <p style={{ margin: 0 }}>
            Caracteres permitidos: letras, números, <code>- _ . / # {'{ }'}</code> y espacio.
          </p>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
            <span style={{ fontSize: 12 }}>Clic para insertar en el campo activo (o escribí <code>..</code> en el campo para elegir):</span>
            {PLANTILLA_TOKENS.map((t) => (
              <button key={t} type="button" className="num-token-chip" onClick={() => onInsertar(t)}>
                {t}
              </button>
            ))}
          </div>
          <p style={{ margin: 0 }}>
            El sistema exige: al menos un punto; si hay <code>#</code>, tiene que ir precedido de
            punto (<code>.#</code>); <strong>dos tipos de documento no pueden compartir la misma
            serie</strong>. Las plantillas con campos entre llaves (ej. <code>{'{customer_group}'}</code>)
            son válidas, pero no se pueden previsualizar ni fijar su contador desde acá.
          </p>
        </div>
      )}
    </div>
  )
}

// ─── Borrador de reglas por sucursal (actualización §4) ───────────────────────
// Forma parte del MISMO borrador y del MISMO PUT que las series: el hook vive en cada editor
// (series / regla-devolución) y su `dirty`/`error` se combinan con los de las series.

interface ReglaFila {
  id: string
  sucursal: string
  plantilla: string
  /** Regla del servidor (null = recién agregada, sin próximo/contador hasta guardar). */
  server: ReglaSucursal | null
}

function reglasAFilas(reglas: ReglaSucursal[]): ReglaFila[] {
  return reglas.map((r) => ({ id: nuevaFilaId(), sucursal: r.sucursal, plantilla: r.plantilla, server: r }))
}

function useBorradorReglas(servidor: NumeracionEstado, resetSignal: number) {
  const [reglas, setReglas] = useState<ReglaFila[]>(() => reglasAFilas(servidor.reglasSucursal ?? []))

  useEffect(() => {
    setReglas(reglasAFilas(servidor.reglasSucursal ?? []))
    // eslint-disable-next-line react-hooks/exhaustive-deps -- solo al cambiar el snapshot del servidor
  }, [servidor])

  useEffect(() => {
    if (resetSignal === 0) return
    setReglas(reglasAFilas(servidor.reglasSucursal ?? []))
    // eslint-disable-next-line react-hooks/exhaustive-deps -- señal explícita de descarte
  }, [resetSignal])

  const baseServidor = useMemo(
    () => (servidor.reglasSucursal ?? []).map((r) => ({ sucursal: r.sucursal, plantilla: r.plantilla })),
    [servidor],
  )
  const baseBorrador = useMemo(
    () => reglas.map((r) => ({ sucursal: r.sucursal, plantilla: r.plantilla.trim() })),
    [reglas],
  )
  const dirty = JSON.stringify(baseBorrador) !== JSON.stringify(baseServidor)
  const error = validarListaReglasSucursal(reglas.map((r) => ({ sucursal: r.sucursal, plantilla: r.plantilla })))

  const reset = useCallback(() => {
    setReglas(reglasAFilas(servidor.reglasSucursal ?? []))
  }, [servidor])

  return { reglas, setReglas, dirty, error, reset }
}

// ─── Sección "Numeración por sucursal" (actualización §4) ────────────────────
// Solo se renderiza si `soportaSucursal`. Tabla Sucursal | Plantilla | Próximo | Último |
// Acciones (editar plantilla, fijar contador, quitar). El guardado lo hace el editor dueño
// con el mismo PUT y el mismo botón Guardar (se envía `reglasSucursal` completa).

function SeccionSucursales({
  ruta,
  reglas,
  setReglas,
  gateContador,
}: {
  ruta: string
  reglas: ReglaFila[]
  setReglas: React.Dispatch<React.SetStateAction<ReglaFila[]>>
  gateContador: (t: ContadorTarget) => void
}) {
  const segmento = ruta.split('/').pop() ?? ruta
  const [aQuitar, setAQuitar] = useState<ReglaFila | null>(null)
  const inputsRef = useRef(new Map<string, HTMLInputElement>())
  const focoRef = useRef<{ id: string } | null>(null)

  const { data: sucursalesData, isLoading: cargandoSucursales, isError: errorSucursales, refetch: refetchSucursales } = useQuery({
    queryKey: ['sucursales-list', { limit: 100 }],
    queryFn: () => listSucursales({ limit: 100 }),
  })
  const sucursales = useMemo(() => sucursalesData?.items ?? [], [sucursalesData])
  const conRegla = useMemo(() => new Set(reglas.map((r) => r.sucursal).filter(Boolean)), [reglas])
  const disponibles = useMemo(() => sucursales.filter((s) => !conRegla.has(s.name)), [sucursales, conRegla])

  const errorLista = validarListaReglasSucursal(reglas.map((r) => ({ sucursal: r.sucursal, plantilla: r.plantilla })))
  // Duplicados por sucursal/plantilla para marcar la fila (el mensaje global va abajo).
  const sucursalesVistas = new Set<string>()
  const sucursalDuplicada = new Set<string>()
  for (const r of reglas) {
    if (!r.sucursal) continue
    if (sucursalesVistas.has(r.sucursal)) sucursalDuplicada.add(r.sucursal)
    sucursalesVistas.add(r.sucursal)
  }
  const plantillasVistas = new Set<string>()
  const plantillaDuplicada = new Set<string>()
  for (const r of reglas) {
    const n = r.plantilla.trim()
    if (!n) continue
    if (plantillasVistas.has(n)) plantillaDuplicada.add(n)
    plantillasVistas.add(n)
  }

  function agregar() {
    setReglas((prev) => [...prev, { id: nuevaFilaId(), sucursal: '', plantilla: '', server: null }])
  }

  function quitar(id: string) {
    setReglas((prev) => prev.filter((r) => r.id !== id))
    setAQuitar(null)
  }

  function insertarToken(token: string) {
    const foco = focoRef.current
    const input = foco ? inputsRef.current.get(foco.id) : undefined
    if (!foco || !input) {
      toast.info('Primero hacé clic en el campo de una plantilla.')
      return
    }
    const inicio = input.selectionStart ?? input.value.length
    const fin = input.selectionEnd ?? input.value.length
    const nuevoValor = input.value.slice(0, inicio) + token + input.value.slice(fin)
    setReglas((prev) => prev.map((r) => (r.id === foco.id ? { ...r, plantilla: nuevoValor } : r)))
    requestAnimationFrame(() => {
      input.focus()
      const pos = inicio + token.length
      input.setSelectionRange(pos, pos)
    })
  }

  return (
    <div className="card" style={{ marginTop: 16 }}>
      <div className="card-header">
        <span className="card-title">Numeración por sucursal</span>
        <span className="badge badge-neutral">{reglas.length} {reglas.length === 1 ? 'regla' : 'reglas'}</span>
      </div>
      <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div className="inline-alert inline-alert-info">
          <Info size={14} style={{ flexShrink: 0 }} />
          <span>{AYUDA_SUCURSAL_GENERAL}</span>
        </div>
        {segmento === 'factura-venta' && (
          <div className="inline-alert inline-alert-info">
            <Info size={14} style={{ flexShrink: 0 }} />
            <span>{AYUDA_SUCURSAL_FACTURA_VENTA}</span>
          </div>
        )}
        {segmento === 'nota-credito-venta' && (
          <div className="inline-alert inline-alert-info">
            <Info size={14} style={{ flexShrink: 0 }} />
            <span>{AYUDA_SUCURSAL_NOTA_CREDITO}</span>
          </div>
        )}

        {reglas.length === 0 ? (
          <div className="empty-state" style={{ padding: '20px 12px' }}>
            <p className="empty-title">Sin numeración por sucursal</p>
            <p className="empty-sub">
              Ninguna sucursal tiene numeración propia. Todas usan la serie predeterminada.
            </p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {reglas.map((regla) => {
              const errCampo = validarPlantillaSucursal(regla.plantilla)
              const esDupSucursal = sucursalDuplicada.has(regla.sucursal)
              const esDupPlantilla = plantillaDuplicada.has(regla.plantilla.trim()) && regla.plantilla.trim() !== ''
              const editable = !regla.server
              return (
                <div key={regla.id} className="card" style={{ background: 'var(--surface-sunken)' }}>
                  <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', flexWrap: 'wrap' }}>
                      <div className="ff-wrap" style={{ minWidth: 180, flex: '0 1 220px' }}>
                        <label className="ff-label">Sucursal</label>
                        {editable ? (
                          <Select
                            value={regla.sucursal}
                            onValueChange={(v) =>
                              setReglas((prev) => prev.map((r) => (r.id === regla.id ? { ...r, sucursal: v } : r)))
                            }
                            placeholder={cargandoSucursales ? 'Cargando…' : 'Elegir sucursal…'}
                          >
                            {regla.sucursal && !disponibles.some((s) => s.name === regla.sucursal) && (
                              <SelectItem value={regla.sucursal}>{regla.sucursal}</SelectItem>
                            )}
                            {disponibles.map((s) => (
                              <SelectItem key={s.id} value={s.name}>{s.name}</SelectItem>
                            ))}
                          </Select>
                        ) : (
                          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', paddingTop: 6 }}>
                            {regla.sucursal}
                          </div>
                        )}
                        {esDupSucursal && (
                          <div style={{ fontSize: 12, color: 'var(--error-text)', marginTop: 4 }}>
                            Sucursal duplicada: {regla.sucursal}
                          </div>
                        )}
                      </div>
                      <div className="ff-wrap" style={{ flex: '1 1 240px' }}>
                        <label className="ff-label">Plantilla</label>
                        <PlantillaInput
                          inputRef={(el) => {
                            if (el) inputsRef.current.set(regla.id, el)
                            else inputsRef.current.delete(regla.id)
                          }}
                          value={regla.plantilla}
                          placeholder="FAC-SD-.YYYY.-.#####"
                          onChange={(v) =>
                            setReglas((prev) => prev.map((r) => (r.id === regla.id ? { ...r, plantilla: v } : r)))
                          }
                          onFocus={() => {
                            focoRef.current = { id: regla.id }
                          }}
                          ariaLabel={`Plantilla de ${regla.sucursal || 'nueva regla'}`}
                        />
                        {regla.plantilla !== '' && errCampo && (
                          <div style={{ fontSize: 12, color: 'var(--error-text)', marginTop: 4 }}>{errCampo}</div>
                        )}
                        {esDupPlantilla && (
                          <div style={{ fontSize: 12, color: 'var(--error-text)', marginTop: 4 }}>
                            Dos sucursales no pueden usar la misma plantilla.
                          </div>
                        )}
                      </div>
                      <div style={{ display: 'flex', gap: 4, flexShrink: 0, paddingTop: 22 }}>
                        {regla.server && regla.server.prefijo !== null ? (
                          <button
                            type="button"
                            className="btn btn-ghost btn-size-icon-sm"
                            title="Fijar contador…"
                            aria-label={`Fijar contador de ${regla.sucursal}`}
                            onClick={() =>
                              gateContador({
                                plantilla: regla.server!.plantilla,
                                contador: regla.server!.contador ?? 0,
                                prefijo: regla.server!.prefijo as string,
                                proximo: regla.server!.proximo ?? '—',
                                sucursal: regla.server!.sucursal,
                              })
                            }
                          >
                            <History size={14} />
                          </button>
                        ) : (
                          <button
                            type="button"
                            className="btn btn-ghost btn-size-icon-sm"
                            disabled
                            title={
                              !regla.server
                                ? 'Guardá primero para fijar el contador de esta regla'
                                : 'No se puede fijar el contador de plantillas que usan campos del documento'
                            }
                          >
                            <History size={14} />
                          </button>
                        )}
                        <button
                          type="button"
                          className="btn btn-ghost btn-size-icon-sm"
                          title="Quitar (desactivar)"
                          aria-label={`Quitar regla de ${regla.sucursal || 'nueva regla'}`}
                          onClick={() => setAQuitar(regla)}
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                    <PreviewPlantilla ruta={ruta} plantilla={regla.plantilla} />
                    <div style={{ display: 'flex', gap: 16, fontSize: 12, color: 'var(--text-secondary)' }}>
                      <span>
                        Próximo: <strong style={{ color: 'var(--text-primary)' }}>{regla.server?.proximo ?? '—'}</strong>
                      </span>
                      <span>
                        Último emitido: <strong style={{ color: 'var(--text-primary)' }}>{regla.server?.contador ?? '—'}</strong>
                      </span>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {errorLista && reglas.length > 0 && (
          <div className="inline-alert inline-alert-error">
            <AlertTriangle size={14} style={{ flexShrink: 0 }} />
            <span>{errorLista}</span>
          </div>
        )}

        {errorSucursales && (
          <div className="inline-alert inline-alert-error">
            <AlertTriangle size={14} style={{ flexShrink: 0 }} />
            <span style={{ flex: 1 }}>No se pudieron cargar las sucursales.</span>
            <button className="btn btn-ghost btn-size-xs" onClick={() => refetchSucursales()}>Reintentar</button>
          </div>
        )}

        <div>
          <button
            type="button"
            className="btn btn-secondary btn-size-sm"
            onClick={agregar}
            disabled={reglas.length >= REGLAS_SUCURSAL_MAX_CANTIDAD || (!cargandoSucursales && !errorSucursales && disponibles.length === 0)}
            title={disponibles.length === 0 && !cargandoSucursales && !errorSucursales ? 'Todas las sucursales ya tienen regla' : undefined}
          >
            <Plus size={14} /> Agregar sucursal
          </button>
        </div>

        <AyudaPlantillas onInsertar={insertarToken} />

        <div className="inline-alert inline-alert-warn">
          <AlertTriangle size={14} style={{ flexShrink: 0 }} />
          <span>{AYUDA_SUCURSAL_MIGRACION}</span>
        </div>
      </div>

      <ConfirmModal
        open={aQuitar !== null}
        onClose={() => setAQuitar(null)}
        onConfirm={() => aQuitar && quitar(aQuitar.id)}
        title="¿Desactivar la numeración de esta sucursal?"
        description="La numeración propia de esta sucursal se desactiva y volverá a usar la serie predeterminada. Si la vuelves a agregar, recupera su contador."
        confirmLabel="Desactivar"
        variant="danger"
      />
    </div>
  )
}

// ─── Diálogo "Fijar contador" (§6.5) ─────────────────────────────────────────

interface ContadorTarget {
  plantilla: string
  contador: number
  prefijo: string
  proximo: string
  /** Presente al fijar el contador de una REGLA de sucursal: se envía `{ sucursal, valor }`. */
  sucursal?: string
}

function ContadorDialog({
  ruta,
  target,
  onClose,
  onExito,
}: {
  ruta: string
  target: ContadorTarget
  onClose: () => void
  onExito: (nuevo: NumeracionEstado) => void
}) {
  const [valor, setValor] = useState<string>(String(target.contador))
  const [entiendo, setEntiendo] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [aplicando, setAplicando] = useState(false)

  const parsed = Number(valor)
  const valido = valor.trim() !== '' && Number.isInteger(parsed) && parsed >= 0
  const baja = valido && parsed < target.contador
  const salta = valido && parsed > target.contador + 1
  const proximo = valido ? proximoConValor(target.prefijo, target.plantilla, parsed) : '—'

  async function aplicar() {
    if (!valido || !entiendo || aplicando) return
    setAplicando(true)
    setError(null)
    try {
      // Contador por sucursal (§3 de la actualización): se envía `sucursal` o `plantilla`.
      const body = target.sucursal
        ? { sucursal: target.sucursal, valor: parsed }
        : { plantilla: target.plantilla, valor: parsed }
      const nuevo = await fijarContadorNumeracion(ruta, body)
      toast.success(`Contador de ${target.sucursal ?? target.plantilla} fijado en ${parsed}`)
      onExito(nuevo)
      onClose()
    } catch (err) {
      if (isApiErrorCode(err, 'CONTADOR_NO_EDITABLE')) {
        setError('No se puede fijar el contador de plantillas que usan campos del documento.')
      } else if (typeof err === 'object' && err !== null && 'statusCode' in err && (err as { statusCode: number }).statusCode === 403) {
        setError('No tienes permisos en el sistema para esta operación.')
      } else {
        setError((err as { message?: string })?.message ?? 'No se pudo fijar el contador.')
      }
    } finally {
      setAplicando(false)
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={`Fijar contador de ${target.sucursal ?? target.plantilla}`}
      subtitle={target.sucursal ? target.plantilla : undefined}
      size="sm"
      footer={
        <>
          <button className="btn btn-secondary btn-size-sm" onClick={onClose} disabled={aplicando}>
            Cancelar
          </button>
          <button
            className="btn btn-danger btn-size-sm"
            onClick={aplicar}
            disabled={!valido || !entiendo || aplicando}
            title={!entiendo ? 'Marcá que entendés el riesgo para continuar' : undefined}
          >
            {aplicando ? 'Aplicando…' : 'Aplicar'}
          </button>
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, fontSize: 13 }}>
        <div style={{ display: 'flex', gap: 16 }}>
          <span style={{ color: 'var(--text-secondary)' }}>
            Último emitido: <strong style={{ color: 'var(--text-primary)' }}>{target.contador}</strong>
          </span>
          <span style={{ color: 'var(--text-secondary)' }}>
            Próximo: <strong style={{ color: 'var(--text-primary)' }}>{target.proximo}</strong>
          </span>
        </div>
        <div className="ff-wrap">
          <label className="ff-label" htmlFor="num-contador-valor">Último número emitido</label>
          <input
            id="num-contador-valor"
            type="number"
            min={0}
            step={1}
            className="ff-input"
            value={valor}
            onChange={(e) => setValor(e.target.value)}
          />
        </div>
        <div style={{ color: 'var(--text-secondary)' }}>
          El próximo documento será <code>{proximo}</code>
        </div>
        {baja && (
          <div className="inline-alert inline-alert-error">
            <AlertTriangle size={14} style={{ flexShrink: 0 }} />
            <span>
              Estás bajando el contador. Si ya existen documentos con esos números, el sistema
              fallará al crear nuevos documentos (nombre duplicado).
            </span>
          </div>
        )}
        {salta && (
          <div className="inline-alert inline-alert-warn">
            <AlertTriangle size={14} style={{ flexShrink: 0 }} />
            <span>Se va a saltar de número: quedará un hueco permanente en la secuencia.</span>
          </div>
        )}
        {error && (
          <div className="inline-alert inline-alert-error">
            <span>{error}</span>
          </div>
        )}
        <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={entiendo}
            onChange={(e) => setEntiendo(e.target.checked)}
            style={{ marginTop: 2 }}
          />
          <span>Entiendo el riesgo de cambiar el contador manualmente.</span>
        </label>
      </div>
    </Modal>
  )
}

// ─── Editor de series (modo `series`) ────────────────────────────────────────

function EditorSeries({
  ruta,
  servidor,
  onGuardarExito,
  onDirtyChange,
  contadorTarget,
  setContadorTarget,
  gateContador,
  resetSignal,
  soportaSucursal,
}: {
  ruta: string
  servidor: NumeracionEstado
  onGuardarExito: (nuevo: NumeracionEstado) => void
  onDirtyChange: (dirty: boolean) => void
  contadorTarget: ContadorTarget | null
  setContadorTarget: (t: ContadorTarget | null) => void
  gateContador: (t: ContadorTarget) => void
  resetSignal: number
  /** La sección de reglas por sucursal comparte borrador y PUT con las series (§4). */
  soportaSucursal: boolean
}) {
  const queryClient = useQueryClient()
  const [filas, setFilas] = useState<FilaBorrador[]>(() =>
    servidor.series.map((s) => ({ id: nuevaFilaId(), plantilla: s.plantilla, server: s })),
  )
  const [aEliminar, setAEliminar] = useState<FilaBorrador | null>(null)
  const [errorPut, setErrorPut] = useState<string | null>(null)
  const [dragId, setDragId] = useState<string | null>(null)
  const [dropId, setDropId] = useState<string | null>(null)
  const inputsRef = useRef(new Map<string, HTMLInputElement>())
  const focoRef = useRef<{ id: string; inicio: number | null; fin: number | null } | null>(null)

  const plantillas = useMemo(() => filas.map((f) => f.plantilla.trim()), [filas])
  const dirtySeries = useMemo(
    () => JSON.stringify(plantillas) !== JSON.stringify(servidor.series.map((s) => s.plantilla)),
    [plantillas, servidor],
  )
  const borradorReglas = useBorradorReglas(servidor, resetSignal)
  const dirty = dirtySeries || (soportaSucursal && borradorReglas.dirty)

  useEffect(() => {
    onDirtyChange(dirty)
  }, [dirty, onDirtyChange])

  // Tras un PUT exitoso el servidor es la nueva verdad: se reconstruye el borrador.
  // Ante un error NO se toca el borrador (§9: queda editable para corregir y reintentar).
  useEffect(() => {
    setFilas(servidor.series.map((s) => ({ id: nuevaFilaId(), plantilla: s.plantilla, server: s })))
    setErrorPut(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- solo al cambiar el snapshot del servidor
  }, [servidor])

  // "Descartar y continuar" desde el gate de contador (§6.5): vuelve al último estado del servidor.
  useEffect(() => {
    if (resetSignal === 0) return
    setFilas(servidor.series.map((s) => ({ id: nuevaFilaId(), plantilla: s.plantilla, server: s })))
    setErrorPut(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- señal explícita de descarte
  }, [resetSignal])

  const errorLista = validarListaSeries(filas.map((f) => f.plantilla))
  // Las reglas por sucursal viajan en el MISMO PUT (lista completa, §3): un solo Guardar.
  const errorGuardar = errorLista ?? (soportaSucursal ? borradorReglas.error : null)

  const guardarMutation = useMutation({
    mutationFn: () =>
      updateNumeracion(ruta, {
        series: filas.map((f) => f.plantilla.trim()),
        ...(soportaSucursal
          ? {
              reglasSucursal: borradorReglas.reglas.map((r) => ({
                sucursal: r.sucursal,
                plantilla: r.plantilla.trim(),
              })),
            }
          : {}),
      }),
    onSuccess: (nuevo) => {
      queryClient.setQueryData(['numeracion-estado', ruta], nuevo)
      toast.success('Numeración actualizada')
      onGuardarExito(nuevo)
    },
    onError: (err) => {
      if (isApiErrorCode(err, 'CONCURRENT_MODIFICATION')) {
        setErrorPut('Otro administrador guardó cambios mientras editabas. Recargá el estado del servidor y reintentá (tu borrador se conserva).')
      } else {
        // Se muestra el mensaje del servidor tal cual (§9/§10.3) — el borrador NO se descarta.
        setErrorPut((err as { message?: string })?.message ?? 'No se pudo guardar.')
      }
    },
  })

  function mover(id: string, dir: -1 | 1) {
    setFilas((prev) => {
      const i = prev.findIndex((f) => f.id === id)
      const j = i + dir
      if (i < 0 || j < 0 || j >= prev.length) return prev
      const next = [...prev]
      const [fila] = next.splice(i, 1)
      next.splice(j, 0, fila)
      return next
    })
  }

  function comoPredeterminada(id: string) {
    setFilas((prev) => {
      const i = prev.findIndex((f) => f.id === id)
      if (i <= 0) return prev
      const next = [...prev]
      const [fila] = next.splice(i, 1)
      next.unshift(fila)
      return next
    })
  }

  function pedirEliminar(fila: FilaBorrador) {
    setAEliminar(fila)
  }

  function confirmarEliminar() {
    if (!aEliminar) return
    setFilas((prev) => prev.filter((f) => f.id !== aEliminar.id))
    setAEliminar(null)
  }

  function agregar() {
    const id = nuevaFilaId()
    setFilas((prev) => [...prev, { id, plantilla: '', server: null }])
    requestAnimationFrame(() => inputsRef.current.get(id)?.focus())
  }

  function insertarToken(token: string) {
    const foco = focoRef.current
    const input = foco ? inputsRef.current.get(foco.id) : undefined
    if (!foco || !input) {
      toast.info('Primero hacé clic en el campo de una plantilla.')
      return
    }
    const inicio = input.selectionStart ?? input.value.length
    const fin = input.selectionEnd ?? input.value.length
    const actual = input.value
    const nuevoValor = actual.slice(0, inicio) + token + actual.slice(fin)
    setFilas((prev) => prev.map((f) => (f.id === foco.id ? { ...f, plantilla: nuevoValor } : f)))
    requestAnimationFrame(() => {
      input.focus()
      const pos = inicio + token.length
      input.setSelectionRange(pos, pos)
    })
  }

  function descartar() {
    setFilas(servidor.series.map((s) => ({ id: nuevaFilaId(), plantilla: s.plantilla, server: s })))
    borradorReglas.reset()
    setErrorPut(null)
  }

  function recargarServidor() {
    queryClient.invalidateQueries({ queryKey: ['numeracion-estado', ruta] })
  }

  return (
    <div>
      {isApiErrorCode(errorPut, 'CONCURRENT_MODIFICATION') || (errorPut && errorPut.startsWith('Otro administrador')) ? (
        <div className="inline-alert inline-alert-warn" style={{ marginBottom: 12 }}>
          <AlertTriangle size={14} style={{ flexShrink: 0 }} />
          <span style={{ flex: 1 }}>{errorPut}</span>
          <button className="btn btn-ghost btn-size-xs" onClick={recargarServidor}>Recargar</button>
        </div>
      ) : errorPut ? (
        <div className="inline-alert inline-alert-error" style={{ marginBottom: 12 }}>
          <AlertTriangle size={14} style={{ flexShrink: 0 }} />
          <span>{errorPut}</span>
        </div>
      ) : null}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {filas.map((fila, idx) => {
          const esPrimera = idx === 0
          const errCampo = validarPlantilla(fila.plantilla)
          return (
            <div
              key={fila.id}
              draggable
              onDragStart={(e) => {
                setDragId(fila.id)
                e.dataTransfer.effectAllowed = 'move'
              }}
              onDragOver={(e) => {
                e.preventDefault()
                if (fila.id !== dragId) setDropId(fila.id)
              }}
              onDragLeave={() => setDropId((prev) => (prev === fila.id ? null : prev))}
              onDrop={(e) => {
                e.preventDefault()
                if (dragId && dragId !== fila.id) {
                  setFilas((prev) => {
                    const from = prev.findIndex((f) => f.id === dragId)
                    const to = prev.findIndex((f) => f.id === fila.id)
                    if (from < 0 || to < 0) return prev
                    const next = [...prev]
                    const [movida] = next.splice(from, 1)
                    next.splice(to, 0, movida)
                    return next
                  })
                }
                setDragId(null)
                setDropId(null)
              }}
              onDragEnd={() => {
                setDragId(null)
                setDropId(null)
              }}
              className={`card${dragId === fila.id ? ' num-fila-dragging' : ''}${dropId === fila.id ? ' num-fila-dragover' : ''}`}
            >
              <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 4 }}>
                      {esPrimera ? (
                        <span className="badge badge-success">
                          <Star size={11} style={{ marginRight: 4 }} />Predeterminada
                        </span>
                      ) : (
                        <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>#{idx + 1}</span>
                      )}
                    </div>
                    <PlantillaInput
                      inputRef={(el) => {
                        if (el) inputsRef.current.set(fila.id, el)
                        else inputsRef.current.delete(fila.id)
                      }}
                      value={fila.plantilla}
                      placeholder="FAC-.YYYY.-.#####"
                      onChange={(v) =>
                        setFilas((prev) => prev.map((f) => (f.id === fila.id ? { ...f, plantilla: v } : f)))
                      }
                      onFocus={(e) => {
                        focoRef.current = { id: fila.id, inicio: e.target.selectionStart, fin: e.target.selectionEnd }
                      }}
                      onSelect={(e) => {
                        const t = e.target as HTMLInputElement
                        focoRef.current = { id: fila.id, inicio: t.selectionStart, fin: t.selectionEnd }
                      }}
                      ariaLabel={`Plantilla de serie ${idx + 1}`}
                    />
                    {fila.plantilla !== '' && errCampo && (
                      <div style={{ fontSize: 12, color: 'var(--error-text)', marginTop: 4 }}>{errCampo}</div>
                    )}
                    <PreviewPlantilla ruta={ruta} plantilla={fila.plantilla} />
                    <div style={{ display: 'flex', gap: 16, marginTop: 6, fontSize: 12, color: 'var(--text-secondary)' }}>
                      <span>
                        Próximo:{' '}
                        <strong style={{ color: 'var(--text-primary)' }}>{fila.server?.proximo ?? '—'}</strong>
                      </span>
                      <span>
                        Último emitido:{' '}
                        <strong style={{ color: 'var(--text-primary)' }}>
                          {fila.server?.contador ?? '—'}
                        </strong>
                      </span>
                    </div>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flexShrink: 0 }}>
                    <button
                      type="button"
                      className="btn btn-ghost btn-size-icon-sm"
                      title="Subir (anterior = más prioritaria)"
                      aria-label={`Subir serie ${idx + 1}`}
                      disabled={esPrimera}
                      onClick={() => mover(fila.id, -1)}
                    >
                      <ChevronUp size={14} />
                    </button>
                    <button
                      type="button"
                      className="btn btn-ghost btn-size-icon-sm"
                      title="Bajar"
                      aria-label={`Bajar serie ${idx + 1}`}
                      disabled={idx === filas.length - 1}
                      onClick={() => mover(fila.id, 1)}
                    >
                      <ChevronDown size={14} />
                    </button>
                    <button
                      type="button"
                      className="btn btn-ghost btn-size-icon-sm"
                      title="Eliminar"
                      aria-label={`Eliminar serie ${idx + 1}`}
                      onClick={() => pedirEliminar(fila)}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {!esPrimera && (
                    <button type="button" className="btn btn-ghost btn-size-xs" onClick={() => comoPredeterminada(fila.id)}>
                      <Star size={12} /> Establecer como predeterminada
                    </button>
                  )}
                  {fila.server && fila.server.prefijo !== null ? (
                    <button
                      type="button"
                      className="btn btn-ghost btn-size-xs"
                      onClick={() =>
                        gateContador({
                          plantilla: fila.server!.plantilla,
                          contador: fila.server!.contador ?? 0,
                          prefijo: fila.server!.prefijo as string,
                          proximo: fila.server!.proximo ?? '—',
                        })
                      }
                    >
                      <History size={12} /> Fijar contador…
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="btn btn-ghost btn-size-xs"
                      disabled
                      title="No se puede fijar el contador de plantillas que usan campos del documento"
                    >
                      <History size={12} /> Fijar contador…
                    </button>
                  )}
                </div>
              </div>
            </div>
          )
        })}
      </div>

      <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
        <button type="button" className="btn btn-secondary btn-size-sm" onClick={agregar} disabled={filas.length >= 20}>
          <Plus size={14} /> Agregar serie
        </button>
      </div>

      <AyudaPlantillas onInsertar={insertarToken} />

      {soportaSucursal && (
        <SeccionSucursales
          ruta={ruta}
          reglas={borradorReglas.reglas}
          setReglas={borradorReglas.setReglas}
          gateContador={gateContador}
        />
      )}

      <div
        style={{
          display: 'flex',
          gap: 8,
          alignItems: 'center',
          marginTop: 16,
          position: 'sticky',
          bottom: 0,
          background: 'var(--surface-app)',
          padding: '12px 0',
          borderTop: '1px solid var(--border-subtle)',
        }}
      >
        <button
          type="button"
          className="btn btn-navy"
          disabled={!dirty || errorGuardar !== null || guardarMutation.isPending}
          onClick={() => guardarMutation.mutate()}
          title={errorGuardar ?? undefined}
        >
          <Save size={14} />
          {guardarMutation.isPending ? 'Guardando…' : 'Guardar'}
        </button>
        <button type="button" className="btn btn-secondary" disabled={!dirty || guardarMutation.isPending} onClick={descartar}>
          Descartar cambios
        </button>
        {dirty && <span style={{ fontSize: 12, color: 'var(--warning-text)' }}>Tienes cambios sin guardar</span>}
      </div>

      <ConfirmModal
        open={aEliminar !== null}
        onClose={() => setAEliminar(null)}
        onConfirm={confirmarEliminar}
        title="¿Eliminar serie?"
        description={
          aEliminar?.server && (aEliminar.server.contador ?? 0) > 0
            ? `Los documentos ya emitidos con ${aEliminar.server.plantilla} conservan su nombre. A partir de ahora no se podrá elegir esta serie.`
            : 'Esta serie dejará de ofrecerse para documentos nuevos.'
        }
        confirmLabel="Eliminar"
        variant="danger"
      />
      {contadorTarget && (
        <ContadorDialog
          ruta={ruta}
          target={contadorTarget}
          onClose={() => setContadorTarget(null)}
          onExito={(nuevo) => {
            queryClient.setQueryData(['numeracion-estado', ruta], nuevo)
            onGuardarExito(nuevo)
          }}
        />
      )}
    </div>
  )
}

// ─── Editor de regla de devolución (modo `regla-devolucion`, §6.2) ──────────

function EditorReglaDevolucion({
  ruta,
  servidor,
  onGuardarExito,
  onDirtyChange,
  contadorTarget,
  setContadorTarget,
  gateContador,
  resetSignal,
  soportaSucursal,
}: {
  ruta: string
  servidor: NumeracionEstado
  onGuardarExito: (nuevo: NumeracionEstado) => void
  onDirtyChange: (dirty: boolean) => void
  contadorTarget: ContadorTarget | null
  setContadorTarget: (t: ContadorTarget | null) => void
  gateContador: (t: ContadorTarget) => void
  resetSignal: number
  /** La sección de reglas por sucursal comparte borrador y PUT con la regla (§4). */
  soportaSucursal: boolean
}) {
  const queryClient = useQueryClient()
  const actual = servidor.series[0]?.plantilla ?? ''
  const [plantilla, setPlantilla] = useState(actual)
  const [configurando, setConfigurando] = useState(false)
  const [aDesactivar, setADesactivar] = useState(false)
  const [errorPut, setErrorPut] = useState<string | null>(null)

  const sinRegla = servidor.series.length === 0
  const dirtyRegla = !sinRegla && plantilla.trim() !== actual
  const borradorReglas = useBorradorReglas(servidor, resetSignal)
  const dirty = dirtyRegla || (sinRegla && configurando) || (soportaSucursal && borradorReglas.dirty)

  useEffect(() => {
    onDirtyChange(dirty)
  }, [dirty, onDirtyChange])

  useEffect(() => {
    setPlantilla(servidor.series[0]?.plantilla ?? '')
    setConfigurando(false)
    setErrorPut(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- solo al cambiar el snapshot del servidor
  }, [servidor])

  useEffect(() => {
    if (resetSignal === 0) return
    setPlantilla(servidor.series[0]?.plantilla ?? '')
    setConfigurando(false)
    setErrorPut(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- señal explícita de descarte
  }, [resetSignal])

  const errorCampo = validarPlantillaReglaDevolucion(plantilla)
  const errorGuardar = errorCampo ?? (soportaSucursal ? borradorReglas.error : null)

  // Las reglas por sucursal viajan en el MISMO PUT (lista completa, §3). Desactivar la regla
  // general envía solo `series: []` y no toca las reglas por sucursal.
  function cuerpoConReglas(series: string[]) {
    return {
      series,
      ...(soportaSucursal
        ? {
            reglasSucursal: borradorReglas.reglas.map((r) => ({
              sucursal: r.sucursal,
              plantilla: r.plantilla.trim(),
            })),
          }
        : {}),
    }
  }

  const guardarMutation = useMutation({
    mutationFn: (series: string[]) => updateNumeracion(ruta, cuerpoConReglas(series)),
    onSuccess: (nuevo) => {
      queryClient.setQueryData(['numeracion-estado', ruta], nuevo)
      toast.success('Regla actualizada')
      setADesactivar(false)
      onGuardarExito(nuevo)
    },
    onError: (err) => {
      setErrorPut((err as { message?: string })?.message ?? 'No se pudo guardar.')
    },
  })

  // Guardar solo-reglas (cuando la regla general está sin configurar pero hay reglas
  // por sucursal que editar): PUT solo con `reglasSucursal`, sin tocar `series`.
  const guardarSoloReglasMutation = useMutation({
    mutationFn: () =>
      updateNumeracion(ruta, {
        reglasSucursal: borradorReglas.reglas.map((r) => ({
          sucursal: r.sucursal,
          plantilla: r.plantilla.trim(),
        })),
      }),
    onSuccess: (nuevo) => {
      queryClient.setQueryData(['numeracion-estado', ruta], nuevo)
      toast.success('Numeración actualizada')
      onGuardarExito(nuevo)
    },
    onError: (err) => {
      setErrorPut((err as { message?: string })?.message ?? 'No se pudo guardar.')
    },
  })

  if (sinRegla && !configurando) {
    // La regla general está sin configurar, pero las reglas por sucursal son independientes:
    // se siguen mostrando y guardan con su propio botón (mismo PUT, solo `reglasSucursal`).
    return (
      <>
        <div className="card">
          <div className="card-body">
            <div className="empty-state">
              <Hash size={24} style={{ color: 'var(--text-tertiary)', marginBottom: 8 }} />
              <p className="empty-title">Sin regla activa</p>
              <p className="empty-sub">
                Las devoluciones usan la numeración de las facturas de venta.
              </p>
              <button className="btn btn-navy btn-size-sm" style={{ marginTop: 12 }} onClick={() => { setPlantilla(''); setConfigurando(true) }}>
                <Plus size={14} /> Configurar
              </button>
            </div>
          </div>
        </div>
        {soportaSucursal && (
          <>
            {errorPut && (
              <div className="inline-alert inline-alert-error" style={{ marginTop: 16 }}>
                <AlertTriangle size={14} style={{ flexShrink: 0 }} />
                <span>{errorPut}</span>
              </div>
            )}
            <SeccionSucursales
              ruta={ruta}
              reglas={borradorReglas.reglas}
              setReglas={borradorReglas.setReglas}
              gateContador={gateContador}
            />
            {(borradorReglas.dirty || borradorReglas.error !== null) && (
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 12 }}>
                <button
                  type="button"
                  className="btn btn-navy btn-size-sm"
                  disabled={!borradorReglas.dirty || borradorReglas.error !== null || guardarSoloReglasMutation.isPending}
                  onClick={() => guardarSoloReglasMutation.mutate()}
                >
                  <Save size={14} /> {guardarSoloReglasMutation.isPending ? 'Guardando…' : 'Guardar sucursales'}
                </button>
                <button
                  type="button"
                  className="btn btn-secondary btn-size-sm"
                  disabled={!borradorReglas.dirty}
                  onClick={() => borradorReglas.reset()}
                >
                  Descartar cambios
                </button>
              </div>
            )}
          </>
        )}
      </>
    )
  }

  const server = servidor.series[0] ?? null

  function descartarRegla() {
    setPlantilla(actual)
    borradorReglas.reset()
    setErrorPut(null)
  }

  return (
    <>
    <div className="card">
      <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {errorPut && (
          <div className="inline-alert inline-alert-error">
            <AlertTriangle size={14} style={{ flexShrink: 0 }} />
            <span>{errorPut}</span>
          </div>
        )}
        <div className="ff-wrap">
          <label className="ff-label" htmlFor="num-regla-plantilla">Plantilla de la regla</label>
          <PlantillaInput
            id="num-regla-plantilla"
            value={plantilla}
            placeholder="NC-FAC-.YYYY.-.#####"
            onChange={setPlantilla}
            ariaLabel="Plantilla de la regla"
          />
          {plantilla !== '' && errorCampo && (
            <div style={{ fontSize: 12, color: 'var(--error-text)', marginTop: 4 }}>{errorCampo}</div>
          )}
        </div>
        <PreviewPlantilla ruta={ruta} plantilla={plantilla} />
        <div style={{ display: 'flex', gap: 16, fontSize: 12, color: 'var(--text-secondary)' }}>
          <span>Próximo: <strong style={{ color: 'var(--text-primary)' }}>{server?.proximo ?? '—'}</strong></span>
          <span>Último emitido: <strong style={{ color: 'var(--text-primary)' }}>{server?.contador ?? '—'}</strong></span>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 4 }}>
          <button
            type="button"
            className="btn btn-navy btn-size-sm"
            disabled={(!dirty && !configurando) || errorGuardar !== null || guardarMutation.isPending}
            onClick={() => guardarMutation.mutate([plantilla.trim()])}
            title={errorGuardar ?? undefined}
          >
            <Save size={14} /> {guardarMutation.isPending ? 'Guardando…' : 'Guardar'}
          </button>
          {!sinRegla && (
            <>
              <button type="button" className="btn btn-secondary btn-size-sm" onClick={descartarRegla} disabled={!dirty}>
                Descartar cambios
              </button>
              <button type="button" className="btn btn-ghost btn-size-sm" style={{ color: 'var(--error-text)' }} onClick={() => setADesactivar(true)}>
                <Trash2 size={14} /> Desactivar regla
              </button>
              {server && server.prefijo !== null && (
                <button
                  type="button"
                  className="btn btn-ghost btn-size-xs"
                  onClick={() =>
                    gateContador({
                      plantilla: server.plantilla,
                      contador: server.contador ?? 0,
                      prefijo: server.prefijo as string,
                      proximo: server.proximo ?? '—',
                    })
                  }
                >
                  <History size={12} /> Fijar contador…
                </button>
              )}
            </>
          )}
        </div>
      </div>
      <ConfirmModal
        open={aDesactivar}
        onClose={() => setADesactivar(false)}
        onConfirm={() => guardarMutation.mutate([])}
        title="¿Desactivar la regla?"
        description="Las notas de crédito volverán a numerarse con la serie de facturas de venta."
        confirmLabel="Desactivar"
        variant="danger"
        loading={guardarMutation.isPending}
      />
      {contadorTarget && (
        <ContadorDialog
          ruta={ruta}
          target={contadorTarget}
          onClose={() => setContadorTarget(null)}
          onExito={(nuevo) => {
            queryClient.setQueryData(['numeracion-estado', ruta], nuevo)
            onGuardarExito(nuevo)
          }}
        />
      )}
    </div>
    {soportaSucursal && (
      <SeccionSucursales
        ruta={ruta}
        reglas={borradorReglas.reglas}
        setReglas={borradorReglas.setReglas}
        gateContador={gateContador}
      />
    )}
    </>
  )
}

// ─── Editor de lote (modo `lote`, §6.3) ─────────────────────────────────────

function EditorLote({
  ruta,
  servidor,
  onGuardarExito,
  onDirtyChange,
  resetSignal,
}: {
  ruta: string
  servidor: NumeracionEstado
  onGuardarExito: (nuevo: NumeracionEstado) => void
  onDirtyChange: (dirty: boolean) => void
  resetSignal: number
}) {
  const queryClient = useQueryClient()
  const [usarSerie, setUsarSerie] = useState(servidor.lote?.usarSerie ?? false)
  const [prefijo, setPrefijo] = useState(servidor.lote?.prefijo ?? '')
  const [errorPut, setErrorPut] = useState<string | null>(null)

  const dirty =
    usarSerie !== (servidor.lote?.usarSerie ?? false) ||
    prefijo !== (servidor.lote?.prefijo ?? '')

  useEffect(() => {
    onDirtyChange(dirty)
  }, [dirty, onDirtyChange])

  useEffect(() => {
    setUsarSerie(servidor.lote?.usarSerie ?? false)
    setPrefijo(servidor.lote?.prefijo ?? '')
    setErrorPut(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- solo al cambiar el snapshot del servidor
  }, [servidor])

  useEffect(() => {
    if (resetSignal === 0) return
    setUsarSerie(servidor.lote?.usarSerie ?? false)
    setPrefijo(servidor.lote?.prefijo ?? '')
    setErrorPut(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- señal explícita de descarte
  }, [resetSignal])

  const errorPrefijo = prefijo.length > 40 ? 'Máximo 40 caracteres' : null

  const guardarMutation = useMutation({
    mutationFn: () => updateNumeracion(ruta, { lote: { usarSerie, prefijo } }),
    onSuccess: (nuevo) => {
      queryClient.setQueryData(['numeracion-estado', ruta], nuevo)
      toast.success('Numeración de lotes actualizada')
      onGuardarExito(nuevo)
    },
    onError: (err) => {
      setErrorPut((err as { message?: string })?.message ?? 'No se pudo guardar.')
    },
  })

  return (
    <div className="card">
      <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {errorPut && (
          <div className="inline-alert inline-alert-error">
            <AlertTriangle size={14} style={{ flexShrink: 0 }} />
            <span>{errorPut}</span>
          </div>
        )}
        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
          <button
            type="button"
            role="switch"
            aria-checked={usarSerie}
            aria-label="Numerar lotes automáticamente con una serie"
            className="num-switch"
            data-on={usarSerie}
            onClick={() => setUsarSerie((v) => !v)}
          />
          <div>
            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>
              Numerar lotes automáticamente con una serie
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>
              Si está apagado, el código del lote lo escribe el usuario manualmente.
            </div>
          </div>
        </div>
        <div className="ff-wrap" style={{ maxWidth: 320 }}>
          <label className="ff-label" htmlFor="num-lote-prefijo">Prefijo</label>
          <input
            id="num-lote-prefijo"
            className="ff-input num-mono"
            value={prefijo}
            maxLength={40}
            placeholder="LOT-"
            spellCheck={false}
            onChange={(e) => setPrefijo(e.target.value)}
          />
          {errorPrefijo && <div style={{ fontSize: 12, color: 'var(--error-text)', marginTop: 4 }}>{errorPrefijo}</div>}
          {!usarSerie && (
            <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 4 }}>
              Sin efecto mientras el interruptor esté apagado.
            </div>
          )}
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button
            type="button"
            className="btn btn-navy btn-size-sm"
            disabled={!dirty || errorPrefijo !== null || guardarMutation.isPending}
            onClick={() => guardarMutation.mutate()}
          >
            <Save size={14} /> {guardarMutation.isPending ? 'Guardando…' : 'Guardar'}
          </button>
          <button
            type="button"
            className="btn btn-secondary btn-size-sm"
            disabled={!dirty}
            onClick={() => {
              setUsarSerie(servidor.lote?.usarSerie ?? false)
              setPrefijo(servidor.lote?.prefijo ?? '')
            }}
          >
            Descartar cambios
          </button>
          {dirty && <span style={{ fontSize: 12, color: 'var(--warning-text)' }}>Tienes cambios sin guardar</span>}
        </div>
      </div>
    </div>
  )
}

// ─── Selector `nombradoPor` — solo cliente/proveedor (§6.4) ──────────────────

function SelectorNombradoPor({
  ruta,
  servidor,
  onGuardarExito,
  onDirtyChange,
  resetSignal,
}: {
  ruta: string
  servidor: NumeracionEstado
  onGuardarExito: (nuevo: NumeracionEstado) => void
  onDirtyChange: (dirty: boolean) => void
  resetSignal: number
}) {
  const queryClient = useQueryClient()
  const opciones = opcionesNombradoPor(ruta.split('/').pop() ?? ruta)
  const [valor, setValor] = useState<NombradoPor | ''>(servidor.nombradoPor ?? '')
  const [errorPut, setErrorPut] = useState<string | null>(null)

  const dirty = (servidor.nombradoPor ?? '') !== valor

  useEffect(() => {
    onDirtyChange(dirty)
  }, [dirty, onDirtyChange])

  useEffect(() => {
    setValor(servidor.nombradoPor ?? '')
    setErrorPut(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- solo al cambiar el snapshot del servidor
  }, [servidor])

  useEffect(() => {
    if (resetSignal === 0) return
    setValor(servidor.nombradoPor ?? '')
    setErrorPut(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- señal explícita de descarte
  }, [servidor, resetSignal])

  const guardarMutation = useMutation({
    mutationFn: () => updateNumeracion(ruta, { nombradoPor: valor as NombradoPor }),
    onSuccess: (nuevo) => {
      queryClient.setQueryData(['numeracion-estado', ruta], nuevo)
      toast.success('Nombrado actualizado')
      onGuardarExito(nuevo)
    },
    onError: (err) => {
      setErrorPut((err as { message?: string })?.message ?? 'No se pudo guardar.')
    },
  })

  if (!opciones) return null

  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {errorPut && (
          <div className="inline-alert inline-alert-error">
            <AlertTriangle size={14} style={{ flexShrink: 0 }} />
            <span>{errorPut}</span>
          </div>
        )}
        <div className="ff-wrap" style={{ maxWidth: 320 }}>
          <label className="ff-label" htmlFor="num-nombrado-por">Nombrado por</label>
          <Select value={valor} onValueChange={(v) => setValor(v as NombradoPor)} placeholder="Elegir…">
            {opciones.map((o) => (
              <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
            ))}
          </Select>
        </div>
        {valor !== '' && valor !== 'Naming Series' && (
          <div className="inline-alert inline-alert-warn">
            <AlertTriangle size={14} style={{ flexShrink: 0 }} />
            <span>Las series de abajo no se aplican mientras el nombrado sea por nombre/automático.</span>
          </div>
        )}
        {dirty && (
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <button type="button" className="btn btn-navy btn-size-sm" disabled={guardarMutation.isPending} onClick={() => guardarMutation.mutate()}>
              <Save size={14} /> {guardarMutation.isPending ? 'Guardando…' : 'Guardar nombrado'}
            </button>
            <button type="button" className="btn btn-secondary btn-size-sm" onClick={() => setValor(servidor.nombradoPor ?? '')}>
              Descartar
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Página ──────────────────────────────────────────────────────────────────

export default function NumeracionDetailPage() {
  const { ruta = '' } = useParams<{ ruta: string }>()
  const segmento = decodeURIComponent(ruta)
  const location = useLocation()
  const { setTabDirty } = useTabs()
  const queryClient = useQueryClient()

  const [servidor, setServidor] = useState<NumeracionEstado | null>(null)
  const [dirtySeries, setDirtySeries] = useState(false)
  const [dirtyNombrado, setDirtyNombrado] = useState(false)
  const [dirtyLote, setDirtyLote] = useState(false)
  const [contadorTarget, setContadorTarget] = useState<ContadorTarget | null>(null)
  const [contadorPendiente, setContadorPendiente] = useState<ContadorTarget | null>(null)
  const [resetSignal, setResetSignal] = useState(0)

  const dirty = dirtySeries || dirtyNombrado || dirtyLote

  const indiceQuery = useQuery({
    queryKey: ['numeracion-indice'],
    queryFn: getNumeracionIndice,
  })

  const estadoQuery = useQuery({
    queryKey: ['numeracion-estado', segmento],
    queryFn: () => getNumeracionEstado(segmento),
    retry: false,
  })

  const estado = estadoQuery.data ?? null

  // El snapshot del servidor solo avanza con datos frescos cuando no hay borrador sucio:
  // ante un error del PUT el borrador se conserva (§9) y un refetch no lo pisa.
  useEffect(() => {
    if (estado && !dirty) setServidor(estado)
    else if (estado && !servidor) setServidor(estado)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- sync intencional solo cuando está limpio
  }, [estado])

  useEffect(() => {
    setServidor(null)
    setDirtySeries(false)
    setDirtyNombrado(false)
    setDirtyLote(false)
    setContadorTarget(null)
    setContadorPendiente(null)
  }, [segmento])

  useEffect(() => {
    setTabDirty(location.pathname, dirty)
  }, [dirty, location.pathname, setTabDirty])

  useEffect(() => {
    if (!dirty) return
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault()
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [dirty])

  const onGuardarExito = useCallback(
    (nuevo: NumeracionEstado) => {
      setServidor(nuevo)
      queryClient.setQueryData(['numeracion-estado', segmento], nuevo)
    },
    [queryClient, segmento],
  )

  const onDirtySeries = useCallback((d: boolean) => setDirtySeries(d), [])
  const onDirtyNombrado = useCallback((d: boolean) => setDirtyNombrado(d), [])
  const onDirtyLote = useCallback((d: boolean) => setDirtyLote(d), [])

  // "Guardá antes de fijar" (§6.5): el contador opera sobre plantillas guardadas.
  const gateContador = useCallback(
    (t: ContadorTarget) => {
      if (dirty) setContadorPendiente(t)
      else setContadorTarget(t)
    },
    [dirty],
  )

  const nombreTipo = estado?.nombre ?? servidor?.nombre ?? segmento

  // ── Cargando: skeleton, no spinner bloqueante (§4.2) ──
  if (estadoQuery.isLoading) {
    return (
      <div className="page-container">
        <span className="skeleton-box" style={{ height: 18, width: 220, display: 'block', marginBottom: 8 }} />
        <span className="skeleton-box" style={{ height: 28, width: 320, display: 'block', marginBottom: 16 }} />
        <span className="skeleton-box" style={{ height: 120, display: 'block', marginBottom: 12 }} />
        <span className="skeleton-box" style={{ height: 200, display: 'block' }} />
      </div>
    )
  }

  // ── Errores del detalle (§7.3/§9) ──
  const err = estadoQuery.error
  if (estadoQuery.isError || (!estadoQuery.isLoading && !estado && !servidor)) {
    if (isApiErrorCode(err, 'NUMERACION_NO_DISPONIBLE')) {
      return (
        <div className="page-container">
          <Link to="/config/numeracion" className="btn btn-ghost btn-size-sm" style={{ marginBottom: 12 }}>
            <ArrowLeft size={14} /> Numeración de documentos
          </Link>
          <div className="card">
            <div className="card-body">
              <div className="empty-state">
                <Info size={24} style={{ color: 'var(--text-tertiary)', marginBottom: 8 }} />
                <p className="empty-title">Numeración no disponible</p>
                <p className="empty-sub">
                  La numeración de {nombreTipo} no está disponible en este sitio (requiere el módulo de RRHH instalado).
                </p>
              </div>
            </div>
          </div>
        </div>
      )
    }
    if (isApiErrorCode(err, 'FEATURE_NO_CONTRATADO')) return <ModuloNoContratadoPage />
    if (
      isApiErrorCode(err, 'PERMISO_INSUFICIENTE') ||
      (typeof err === 'object' && err !== null && 'statusCode' in err && (err as { statusCode: number }).statusCode === 403)
    ) {
      return <SinAccesoPage />
    }
    return (
      <div className="page-container">
        <Link to="/config/numeracion" className="btn btn-ghost btn-size-sm" style={{ marginBottom: 12 }}>
          <ArrowLeft size={14} /> Numeración de documentos
        </Link>
        <div className="inline-alert inline-alert-error">
          <AlertTriangle size={14} style={{ flexShrink: 0 }} />
          <span style={{ flex: 1 }}>
            {(err as { message?: string })?.message ?? 'No se pudo cargar la numeración.'}
          </span>
          <button className="btn btn-ghost btn-size-xs" onClick={() => estadoQuery.refetch()}>Reintentar</button>
        </div>
      </div>
    )
  }

  // Acceso directo a un tipo que no está en el índice: estado "No disponible", sin redirigir (§7.1).
  if (indiceQuery.isSuccess && estado) {
    const segmentos = new Set(indiceQuery.data.map((t) => (t.ruta.split('/').pop() ?? t.ruta).toLowerCase()))
    if (!segmentos.has(segmento.toLowerCase())) {
      return (
        <div className="page-container">
          <Link to="/config/numeracion" className="btn btn-ghost btn-size-sm" style={{ marginBottom: 12 }}>
            <ArrowLeft size={14} /> Numeración de documentos
          </Link>
          <div className="card">
            <div className="card-body">
              <div className="empty-state">
                <Info size={24} style={{ color: 'var(--text-tertiary)', marginBottom: 8 }} />
                <p className="empty-title">Tipo no disponible</p>
                <p className="empty-sub">
                  Este tipo de documento no está habilitado para tu usuario en este momento.
                </p>
              </div>
            </div>
          </div>
        </div>
      )
    }
  }

  const actual = servidor ?? estado
  if (!actual) return null

  const muestraNombrado = opcionesNombradoPor(segmento) !== null

  return (
    <div className="page-container">
      <Link to="/config/numeracion" className="btn btn-ghost btn-size-sm" style={{ marginBottom: 12 }}>
        <ArrowLeft size={14} /> Numeración de documentos
      </Link>
      <PageHeader
        overline={`Configuración · ${actual.area}`}
        title={<><span className="page-title-dot" />{actual.nombre}</>}
        description={`${actual.doctype} · ejemplo: ${actual.ejemplo}`}
        action={<RecargarButton />}
      />

      <BannersDetalle estado={actual} />

      {muestraNombrado && (
        <SelectorNombradoPor
          ruta={segmento}
          servidor={actual}
          onGuardarExito={onGuardarExito}
          onDirtyChange={onDirtyNombrado}
          resetSignal={resetSignal}
        />
      )}

      {actual.modo === 'lote' ? (
        <EditorLote
          ruta={segmento}
          servidor={actual}
          onGuardarExito={onGuardarExito}
          onDirtyChange={onDirtyLote}
          resetSignal={resetSignal}
        />
      ) : actual.modo === 'regla-devolucion' ? (
        <EditorReglaDevolucion
          ruta={segmento}
          servidor={actual}
          onGuardarExito={onGuardarExito}
          onDirtyChange={onDirtySeries}
          contadorTarget={contadorTarget}
          setContadorTarget={setContadorTarget}
          gateContador={gateContador}
          resetSignal={resetSignal}
          soportaSucursal={actual.soportaSucursal ?? false}
        />
      ) : (
        <EditorSeries
          ruta={segmento}
          servidor={actual}
          onGuardarExito={onGuardarExito}
          onDirtyChange={onDirtySeries}
          contadorTarget={contadorTarget}
          setContadorTarget={setContadorTarget}
          gateContador={gateContador}
          resetSignal={resetSignal}
          soportaSucursal={actual.soportaSucursal ?? false}
        />
      )}

      {/* "Guardá antes de fijar" (§6.5): guardar o descartar primero. */}
      <ConfirmModal
        open={contadorPendiente !== null}
        onClose={() => setContadorPendiente(null)}
        onConfirm={() => {
          // Descartar los borradores (los editores escuchan `resetSignal`) y abrir el diálogo.
          if (contadorPendiente) setContadorTarget(contadorPendiente)
          setContadorPendiente(null)
          setResetSignal((s) => s + 1)
        }}
        title="Tienes cambios sin guardar"
        description="El contador opera sobre las plantillas guardadas. Guardá los cambios del editor primero, o descartalos para continuar."
        confirmLabel="Descartar y continuar"
        variant="danger"
        secondaryAction={{
          label: 'Ir a guardar',
          onClick: () => setContadorPendiente(null),
        }}
      />
    </div>
  )
}
