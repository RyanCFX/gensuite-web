// Pestaña/sección "Composición" en la ficha de un Artículo (vertical Farmacia) — docs/tasks/
// PROMPT_COMPOSICION_MEDICAMENTOS_FRONTEND.md §6. No hace falta pedir GET .../composicion si el
// usuario nunca abre esta sección — por eso vive colapsada por default y solo dispara la query
// al expandirse la primera vez.
import { useEffect, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { ChevronDown, ChevronRight, FlaskConical, Plus, Trash2 } from 'lucide-react'
import { getComposicion, updateComposicion } from '@/shared/api/catalog'
import { listPrincipiosActivos } from '@/shared/api/principios-activos'
import { Select, SelectItem } from '@/components/ui/select'
import { SearchSelect } from '@/shared/ui/SearchSelect'
import type { SearchSelectOption } from '@/shared/ui/SearchSelect'
import type { ActiveIngredientRowDto, ApiError, PerUom, StrengthUom, ViaAdministracion } from '@/shared/api/types'
import { usePuede } from '@/shared/permissions/can'

const VIAS_ADMINISTRACION: ViaAdministracion[] = [
  'Oral', 'Tópica', 'Oftálmica', 'Ótica', 'Nasal', 'Rectal', 'Vaginal', 'Inhalatoria',
  'Intravenosa', 'Intramuscular', 'Subcutánea',
]
// El backend siembra automáticamente estas 16 formas farmacéuticas en todo tenant Farmacia —
// cualquier otro valor devuelve 400 ("Could not find Forma Farmacéutica: ..."), confirmado contra
// el backend real. NO es texto libre pese a lo que decía la primera versión del documento. Un
// tenant puede agregar formas propias desde el Desk — el endpoint de búsqueda en vivo contra ese
// catálogo sigue pendiente del lado del backend, así que por ahora esta lista fija es lo mejor
// disponible (ver docs/tasks/PROMPT_COMPOSICION_MEDICAMENTOS_FRONTEND.md §6.2).
const FORMAS_FARMACEUTICAS = [
  'Tableta', 'Cápsula', 'Jarabe', 'Suspensión', 'Solución', 'Gotas', 'Crema', 'Ungüento',
  'Gel', 'Supositorio', 'Óvulo', 'Inyectable', 'Spray', 'Parche', 'Polvo', 'Aerosol',
]
const STRENGTH_UOMS: StrengthUom[] = ['mg', 'g', 'mcg', 'UI', 'mL', '%', 'mEq']
const PER_UOMS: PerUom[] = ['Unidad', 'mL', 'g', 'Aplicación', 'Dosis']

// Fila con estado local de edición — `activeIngredientNombre` solo para mostrar en el selector.
interface FilaEdit extends ActiveIngredientRowDto {
  _key: string
  activeIngredientNombre?: string
}

let contadorFila = 0
function nuevaFila(): FilaEdit {
  contadorFila += 1
  return { _key: `nueva-${contadorFila}`, activeIngredient: '', perValue: 1, perUom: 'Unidad', isPrimary: false }
}

export function ComposicionPanel({ itemId }: { itemId: string }) {
  const queryClient = useQueryClient()
  const puedeVer = usePuede('catalogo.items.ver-composicion')
  const puedeEditar = usePuede('catalogo.items.editar-composicion')
  const [abierto, setAbierto] = useState(false)

  const { data, isLoading } = useQuery({
    queryKey: ['item-composicion', itemId],
    queryFn: () => getComposicion(itemId),
    enabled: abierto && puedeVer,
  })

  const [esMedicamento, setEsMedicamento] = useState(false)
  const [formaFarmaceutica, setFormaFarmaceutica] = useState('')
  const [viaAdministracion, setViaAdministracion] = useState<ViaAdministracion | ''>('')
  const [filas, setFilas] = useState<FilaEdit[]>([])
  const [dirty, setDirty] = useState(false)

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!data) return
    setEsMedicamento(data.esMedicamento)
    setFormaFarmaceutica(data.formaFarmaceutica ?? '')
    setViaAdministracion(data.viaAdministracion ?? '')
    setFilas(
      data.principiosActivos.map((p) => ({
        _key: p.activeIngredient,
        activeIngredient: p.activeIngredient,
        activeIngredientNombre: p.activeIngredientNombre,
        strengthValue: p.strengthValue,
        strengthUom: p.strengthUom,
        perValue: p.perValue ?? 1,
        perUom: p.perUom ?? 'Unidad',
        isPrimary: p.isPrimary ?? false,
        notes: p.notes ?? undefined,
      })),
    )
    setDirty(false)
  }, [data])
  /* eslint-enable react-hooks/set-state-in-effect */

  const saveMutation = useMutation({
    mutationFn: () => {
      if (!esMedicamento) return updateComposicion(itemId, { esMedicamento: false })
      return updateComposicion(itemId, {
        esMedicamento: true,
        formaFarmaceutica: formaFarmaceutica || undefined,
        viaAdministracion: viaAdministracion || undefined,
        principiosActivos: filas.map((fila): ActiveIngredientRowDto => ({
          activeIngredient: fila.activeIngredient,
          strengthValue: fila.strengthValue,
          strengthUom: fila.strengthUom,
          perValue: fila.perValue,
          perUom: fila.perUom,
          isPrimary: fila.isPrimary,
          notes: fila.notes,
        })),
      })
    },
    onSuccess: (result) => {
      toast.success('Composición guardada')
      queryClient.setQueryData(['item-composicion', itemId], result)
      queryClient.invalidateQueries({ queryKey: ['item', itemId] })
      setDirty(false)
    },
    onError: (err: ApiError) => toast.error(err?.message ?? 'Error al guardar la composición'),
  })

  function marcarDirty() {
    setDirty(true)
  }

  function agregarFila() {
    setFilas((prev) => [...prev, nuevaFila()])
    marcarDirty()
  }

  function quitarFila(key: string) {
    setFilas((prev) => prev.filter((f) => f._key !== key))
    marcarDirty()
  }

  function actualizarFila(key: string, patch: Partial<FilaEdit>) {
    setFilas((prev) => prev.map((f) => (f._key === key ? { ...f, ...patch } : f)))
    marcarDirty()
  }

  // Regla de pareja (§6.2.1): strengthValue y strengthUom van juntos o ninguno.
  function setStrengthValue(key: string, value: string) {
    const num = value === '' ? undefined : Number(value)
    actualizarFila(key, { strengthValue: num, ...(num === undefined ? { strengthUom: undefined } : {}) })
  }
  function setStrengthUom(key: string, uom: string) {
    actualizarFila(key, { strengthUom: (uom || undefined) as StrengthUom | undefined })
  }

  // Regla "a lo sumo un principal" (§6.2.1) — selección única entre filas, como un radio.
  function setPrimary(key: string) {
    setFilas((prev) => prev.map((f) => ({ ...f, isPrimary: f._key === key })))
    marcarDirty()
  }

  const idsUsados = new Set(filas.map((f) => f.activeIngredient).filter(Boolean))
  const hayDuplicados = idsUsados.size !== filas.filter((f) => f.activeIngredient).length
  const hayParejaIncompleta = filas.some((f) => (f.strengthValue != null) !== (!!f.strengthUom))
  const hayFilaSinPrincipio = filas.some((f) => !f.activeIngredient)
  const puedeGuardar = !hayDuplicados && !hayParejaIncompleta && !hayFilaSinPrincipio

  if (!puedeVer) return null

  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <div
        className="card-header"
        style={{ cursor: 'pointer' }}
        onClick={() => setAbierto((v) => !v)}
      >
        <h2 className="card-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {abierto ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
          <FlaskConical size={16} /> Composición
        </h2>
      </div>

      {abierto && (
        <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {isLoading ? (
            <span className="skeleton-box" style={{ height: 80, width: '100%', display: 'block' }} />
          ) : (
            <>
              <label className="ff-check-wrap">
                <input
                  type="checkbox"
                  checked={esMedicamento}
                  disabled={!puedeEditar}
                  onChange={(e) => { setEsMedicamento(e.target.checked); marcarDirty() }}
                />
                Es medicamento
              </label>

              {esMedicamento && (
                <>
                  <div className="form-row form-row-2">
                    <div className="ff-wrap">
                      <label className="ff-label">Forma farmacéutica</label>
                      <Select
                        value={formaFarmaceutica}
                        onValueChange={(val) => { setFormaFarmaceutica(val); marcarDirty() }}
                        disabled={!puedeEditar}
                        placeholder="Sin especificar"
                      >
                        {FORMAS_FARMACEUTICAS.map((f) => <SelectItem key={f} value={f}>{f}</SelectItem>)}
                      </Select>
                    </div>
                    <div className="ff-wrap">
                      <label className="ff-label">Vía de administración</label>
                      <Select
                        value={viaAdministracion}
                        onValueChange={(val) => { setViaAdministracion(val as ViaAdministracion); marcarDirty() }}
                        disabled={!puedeEditar}
                        placeholder="Sin especificar"
                      >
                        {VIAS_ADMINISTRACION.map((v) => <SelectItem key={v} value={v}>{v}</SelectItem>)}
                      </Select>
                    </div>
                  </div>

                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                      <span className="ff-label" style={{ margin: 0 }}>Principios activos</span>
                      {puedeEditar && (
                        <button type="button" className="btn btn-secondary btn-size-sm" onClick={agregarFila}>
                          <Plus size={14} /> Agregar principio
                        </button>
                      )}
                    </div>

                    {filas.length === 0 ? (
                      <p className="td-muted" style={{ fontSize: 13 }}>Sin principios activos declarados todavía.</p>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                        {filas.map((fila) => (
                          <FilaComposicion
                            key={fila._key}
                            fila={fila}
                            disabled={!puedeEditar}
                            mostrarPrincipal={filas.length > 1}
                            onChange={(patch) => actualizarFila(fila._key, patch)}
                            onStrengthValue={(v) => setStrengthValue(fila._key, v)}
                            onStrengthUom={(v) => setStrengthUom(fila._key, v)}
                            onPrimary={() => setPrimary(fila._key)}
                            onRemove={() => quitarFila(fila._key)}
                          />
                        ))}
                      </div>
                    )}
                    {hayDuplicados && <p className="ff-error">No puede haber dos filas con el mismo principio activo.</p>}
                    {hayParejaIncompleta && <p className="ff-error">Concentración y unidad van juntas o ninguna — completá ambas o dejá las dos vacías.</p>}
                    {hayFilaSinPrincipio && <p className="ff-error">Seleccioná un principio activo en cada fila (no se admite texto libre).</p>}
                  </div>
                </>
              )}

              {puedeEditar && (
                <div>
                  <button
                    type="button"
                    className="btn btn-primary"
                    disabled={!dirty || !puedeGuardar || saveMutation.isPending}
                    onClick={() => saveMutation.mutate()}
                  >
                    {saveMutation.isPending ? 'Guardando…' : 'Guardar composición'}
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}

function FilaComposicion({
  fila, disabled, mostrarPrincipal, onChange, onStrengthValue, onStrengthUom, onPrimary, onRemove,
}: {
  fila: FilaEdit
  disabled: boolean
  mostrarPrincipal: boolean
  onChange: (patch: Partial<FilaEdit>) => void
  onStrengthValue: (v: string) => void
  onStrengthUom: (v: string) => void
  onPrimary: () => void
  onRemove: () => void
}) {
  const [search, setSearch] = useState('')
  const { data } = useQuery({
    queryKey: ['principios-activos-picker', search],
    queryFn: () => listPrincipiosActivos({ search: search || undefined, soloActivos: true, limit: 20 }),
  })
  const options: SearchSelectOption[] = (data?.items ?? []).map((p) => ({ value: p.id, label: p.nombre }))

  return (
    <div className="card" style={{ padding: 10, background: 'var(--surface-sunken)' }}>
      <div className="form-row form-row-3" style={{ marginBottom: 8 }}>
        <div className="ff-wrap">
          <label className="ff-label ff-required">Principio activo</label>
          <SearchSelect
            value={fila.activeIngredient}
            onChange={(val, opt) => onChange({ activeIngredient: val, activeIngredientNombre: opt?.label })}
            options={options}
            onSearch={setSearch}
            selectedLabel={fila.activeIngredientNombre ?? fila.activeIngredient}
            placeholder="Buscar principio activo…"
            disabled={disabled}
          />
        </div>
        <div className="ff-wrap">
          <label className="ff-label">Concentración</label>
          <div style={{ display: 'flex', gap: 6 }}>
            <input
              type="number"
              className="ff-input"
              placeholder="Cantidad"
              value={fila.strengthValue ?? ''}
              disabled={disabled}
              onChange={(e) => onStrengthValue(e.target.value)}
            />
            <Select value={fila.strengthUom ?? ''} onValueChange={onStrengthUom} disabled={disabled} placeholder="Unidad">
              {STRENGTH_UOMS.map((u) => <SelectItem key={u} value={u}>{u}</SelectItem>)}
            </Select>
          </div>
        </div>
        <div className="ff-wrap">
          <label className="ff-label">Por</label>
          <div style={{ display: 'flex', gap: 6 }}>
            <input
              type="number"
              className="ff-input"
              value={fila.perValue ?? 1}
              disabled={disabled}
              onChange={(e) => onChange({ perValue: e.target.value === '' ? undefined : Number(e.target.value) })}
            />
            <Select value={fila.perUom ?? 'Unidad'} onValueChange={(v) => onChange({ perUom: v as PerUom })} disabled={disabled}>
              {PER_UOMS.map((u) => <SelectItem key={u} value={u}>{u}</SelectItem>)}
            </Select>
          </div>
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        <input
          className="ff-input"
          style={{ flex: 1 }}
          placeholder="Notas (opcional)"
          value={fila.notes ?? ''}
          disabled={disabled}
          onChange={(e) => onChange({ notes: e.target.value || undefined })}
        />
        {mostrarPrincipal && (
          <label className="ff-check-wrap" style={{ whiteSpace: 'nowrap' }}>
            <input type="radio" name="principal" checked={!!fila.isPrimary} disabled={disabled} onChange={onPrimary} />
            Principal
          </label>
        )}
        {!disabled && (
          <button type="button" className="btn btn-ghost btn-size-icon-sm" style={{ color: 'var(--color-error)' }} onClick={onRemove}>
            <Trash2 size={14} />
          </button>
        )}
      </div>
    </div>
  )
}
