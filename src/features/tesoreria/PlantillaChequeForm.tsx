import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { ArrowLeft, RefreshCw } from 'lucide-react'
import {
  getChequePrintTemplate,
  createChequePrintTemplate,
  updateChequePrintTemplate,
  regenerarChequePrintTemplate,
} from '@/shared/api/tesoreria'
import type { ChequePrintTemplateSize, CreateChequePrintTemplateDto } from '@/shared/api/types'
import { PageHeader } from '@/components/shared/PageHeader'
import { Select, SelectItem } from '@/components/ui/select'

type FormValues = Omit<CreateChequePrintTemplateDto, 'bankName'> & { bankName: string }

const EMPTY: FormValues = {
  bankName: '',
  chequeSize: 'Regular',
  startingPositionFromTopEdge: undefined,
  chequeWidth: undefined,
  chequeHeight: undefined,
  isAccountPayable: false,
  accPayDistFromTopEdge: undefined,
  accPayDistFromLeftEdge: undefined,
  messageToShow: '',
  dateDistFromTopEdge: undefined,
  dateDistFromLeftEdge: undefined,
  payerNameFromTopEdge: undefined,
  payerNameFromLeftEdge: undefined,
  amtInWordsFromTopEdge: undefined,
  amtInWordsFromLeftEdge: undefined,
  amtInWordWidth: undefined,
  amtInWordsLineSpacing: undefined,
  amtInFiguresFromTopEdge: undefined,
  amtInFiguresFromLeftEdge: undefined,
  accNoDistFromTopEdge: undefined,
  accNoDistFromLeftEdge: undefined,
  signatoryFromTopEdge: undefined,
  signatoryFromLeftEdge: undefined,
}

function NumberField({ label, value, onChange, disabled }: { label: string; value: number | undefined; onChange: (v: number | undefined) => void; disabled?: boolean }) {
  return (
    <div className="ff-wrap">
      <label className="ff-label">{label}</label>
      <div style={{ position: 'relative' }}>
        <input
          className="ff-input"
          type="number"
          step="0.1"
          disabled={disabled}
          value={value ?? ''}
          onChange={(e) => onChange(e.target.value === '' ? undefined : parseFloat(e.target.value))}
          style={{ paddingRight: 32 }}
        />
        <span style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', fontSize: 12, color: 'var(--text-tertiary)' }}>cm</span>
      </div>
    </div>
  )
}

export default function PlantillaChequeForm() {
  const { id } = useParams<{ id: string }>()
  const isEdit = !!id
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const [values, setValues] = useState<FormValues>(EMPTY)
  const [pendienteRegenerar, setPendienteRegenerar] = useState(false)

  const { data: existing, isLoading } = useQuery({
    queryKey: ['tesoreria-cheque-print-template', id],
    queryFn: () => getChequePrintTemplate(id!),
    enabled: isEdit,
  })

  useEffect(() => {
    if (existing) setValues(existing)
  }, [existing])

  function set<K extends keyof FormValues>(key: K, val: FormValues[K]) {
    setValues((v) => ({ ...v, [key]: val }))
  }

  const createMutation = useMutation({
    mutationFn: (dto: CreateChequePrintTemplateDto) => createChequePrintTemplate(dto),
    onSuccess: (t) => {
      toast.success('Plantilla creada — ajusta las coordenadas y regenera cuando estén listas')
      queryClient.invalidateQueries({ queryKey: ['tesoreria-cheque-print-templates'] })
      navigate(`/config/tesoreria/plantillas-cheque/${encodeURIComponent(t.bankName)}`)
    },
    onError: (err: { message?: string }) => toast.error(err?.message ?? 'Error al crear la plantilla'),
  })

  const updateMutation = useMutation({
    mutationFn: (dto: Parameters<typeof updateChequePrintTemplate>[1]) => updateChequePrintTemplate(id!, dto),
    onSuccess: () => {
      toast.success('Coordenadas actualizadas')
      queryClient.invalidateQueries({ queryKey: ['tesoreria-cheque-print-template', id] })
      queryClient.invalidateQueries({ queryKey: ['tesoreria-cheque-print-templates'] })
      // No confiar en hasPrintFormat de la respuesta del PUT — el doc 41 advierte que puede no
      // reflejar el estado real hasta releer el detalle. Mostrar el banner siempre tras un PUT.
      setPendienteRegenerar(true)
    },
    onError: (err: { message?: string }) => toast.error(err?.message ?? 'Error al actualizar la plantilla'),
  })

  const regenerarMutation = useMutation({
    mutationFn: () => regenerarChequePrintTemplate(id!),
    onSuccess: () => {
      toast.success('Plantilla regenerada')
      queryClient.invalidateQueries({ queryKey: ['tesoreria-cheque-print-template', id] })
      queryClient.invalidateQueries({ queryKey: ['tesoreria-cheque-print-templates'] })
      setPendienteRegenerar(false)
    },
    onError: (err: { message?: string }) => toast.error(err?.message ?? 'Error al regenerar la plantilla'),
  })

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!values.bankName) {
      toast.error('El nombre de la plantilla es requerido')
      return
    }
    if (isEdit) {
      // `values` es una variable (no un literal), así que TS permite el campo extra `bankName`
      // aunque el DTO de update no lo declare — el backend lo ignora, no es editable tras crear.
      updateMutation.mutate(values)
    } else {
      createMutation.mutate(values)
    }
  }

  if (isEdit && isLoading) {
    return (
      <div className="page-container">
        <span className="skeleton-box" style={{ height: 28, width: 240, display: 'block', marginBottom: 24 }} />
        <span className="skeleton-box" style={{ height: 320, display: 'block' }} />
      </div>
    )
  }

  return (
    <div className="page-container">
      <a className="page-back-link" onClick={() => navigate('/config/tesoreria/plantillas-cheque')}>
        <ArrowLeft size={14} /> Plantillas de Cheque
      </a>

      <PageHeader
        title={isEdit ? `Editar Plantilla: ${id}` : 'Nueva Plantilla de Cheque'}
        description="Coordenadas en centímetros desde el borde superior/izquierdo del papel pre-impreso"
      />

      {pendienteRegenerar && (
        <div className="inline-alert inline-alert-warn" style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 13 }}>Coordenadas actualizadas — debe regenerar la plantilla para que se reflejen en la impresión.</span>
          <button type="button" className="btn btn-primary btn-size-sm" onClick={() => regenerarMutation.mutate()} disabled={regenerarMutation.isPending}>
            <RefreshCw size={13} /> {regenerarMutation.isPending ? 'Regenerando…' : 'Regenerar plantilla'}
          </button>
        </div>
      )}

      <form onSubmit={handleSubmit}>
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="card-header"><h2 className="card-title">Identificación</h2></div>
          <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              <div className="ff-wrap" style={{ flex: 1, minWidth: 200 }}>
                <label className="ff-label ff-required">Nombre de la plantilla</label>
                {isEdit ? (
                  <>
                    <input className="ff-input" value={values.bankName} disabled />
                    <p className="ff-hint">No editable — para renombrar, crea una plantilla nueva.</p>
                  </>
                ) : (
                  <input className="ff-input" placeholder="Ej: Popular Estandar" value={values.bankName} onChange={(e) => set('bankName', e.target.value)} />
                )}
              </div>
              <div className="ff-wrap" style={{ flex: 1, minWidth: 160 }}>
                <label className="ff-label">Tamaño de cheque</label>
                <Select value={values.chequeSize ?? 'Regular'} onValueChange={(v) => set('chequeSize', v as ChequePrintTemplateSize)} clearable={false}>
                  <SelectItem value="Regular">Regular</SelectItem>
                  <SelectItem value="A4">A4</SelectItem>
                </Select>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              <NumberField label="Ancho del cheque" value={values.chequeWidth} onChange={(v) => set('chequeWidth', v)} />
              <NumberField label="Alto del cheque" value={values.chequeHeight} onChange={(v) => set('chequeHeight', v)} />
              <NumberField
                label="Posición desde borde superior (solo A4)"
                value={values.startingPositionFromTopEdge}
                onChange={(v) => set('startingPositionFromTopEdge', v)}
                disabled={values.chequeSize !== 'A4'}
              />
            </div>
          </div>
        </div>

        <div className="card" style={{ marginBottom: 16 }}>
          <div className="card-header"><h2 className="card-title">Fecha</h2></div>
          <div className="card-body" style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <NumberField label="Desde borde superior" value={values.dateDistFromTopEdge} onChange={(v) => set('dateDistFromTopEdge', v)} />
            <NumberField label="Desde borde izquierdo" value={values.dateDistFromLeftEdge} onChange={(v) => set('dateDistFromLeftEdge', v)} />
          </div>
        </div>

        <div className="card" style={{ marginBottom: 16 }}>
          <div className="card-header"><h2 className="card-title">Beneficiario</h2></div>
          <div className="card-body" style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <NumberField label="Desde borde superior" value={values.payerNameFromTopEdge} onChange={(v) => set('payerNameFromTopEdge', v)} />
            <NumberField label="Desde borde izquierdo" value={values.payerNameFromLeftEdge} onChange={(v) => set('payerNameFromLeftEdge', v)} />
          </div>
        </div>

        <div className="card" style={{ marginBottom: 16 }}>
          <div className="card-header"><h2 className="card-title">Monto en Letras</h2></div>
          <div className="card-body" style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <NumberField label="Desde borde superior" value={values.amtInWordsFromTopEdge} onChange={(v) => set('amtInWordsFromTopEdge', v)} />
            <NumberField label="Desde borde izquierdo" value={values.amtInWordsFromLeftEdge} onChange={(v) => set('amtInWordsFromLeftEdge', v)} />
            <NumberField label="Ancho" value={values.amtInWordWidth} onChange={(v) => set('amtInWordWidth', v)} />
            <NumberField label="Espaciado entre líneas" value={values.amtInWordsLineSpacing} onChange={(v) => set('amtInWordsLineSpacing', v)} />
          </div>
        </div>

        <div className="card" style={{ marginBottom: 16 }}>
          <div className="card-header"><h2 className="card-title">Monto en Números</h2></div>
          <div className="card-body" style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <NumberField label="Desde borde superior" value={values.amtInFiguresFromTopEdge} onChange={(v) => set('amtInFiguresFromTopEdge', v)} />
            <NumberField label="Desde borde izquierdo" value={values.amtInFiguresFromLeftEdge} onChange={(v) => set('amtInFiguresFromLeftEdge', v)} />
          </div>
        </div>

        <div className="card" style={{ marginBottom: 16 }}>
          <div className="card-header"><h2 className="card-title">Cuenta</h2></div>
          <div className="card-body" style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <NumberField label="Desde borde superior" value={values.accNoDistFromTopEdge} onChange={(v) => set('accNoDistFromTopEdge', v)} />
            <NumberField label="Desde borde izquierdo" value={values.accNoDistFromLeftEdge} onChange={(v) => set('accNoDistFromLeftEdge', v)} />
          </div>
        </div>

        <div className="card" style={{ marginBottom: 16 }}>
          <div className="card-header"><h2 className="card-title">Firma</h2></div>
          <div className="card-body" style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <NumberField label="Desde borde superior" value={values.signatoryFromTopEdge} onChange={(v) => set('signatoryFromTopEdge', v)} />
            <NumberField label="Desde borde izquierdo" value={values.signatoryFromLeftEdge} onChange={(v) => set('signatoryFromLeftEdge', v)} />
          </div>
        </div>

        <div className="card" style={{ marginBottom: 16 }}>
          <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h2 className="card-title">Leyenda "Account Pay Only"</h2>
            <label className="ff-check" style={{ margin: 0 }}>
              <input type="checkbox" checked={!!values.isAccountPayable} onChange={(e) => set('isAccountPayable', e.target.checked)} />
              Incluir leyenda
            </label>
          </div>
          {values.isAccountPayable && (
            <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div className="ff-wrap">
                <label className="ff-label">Texto de la leyenda</label>
                <input className="ff-input" placeholder="Account Pay Only" value={values.messageToShow ?? ''} onChange={(e) => set('messageToShow', e.target.value)} />
              </div>
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                <NumberField label="Desde borde superior" value={values.accPayDistFromTopEdge} onChange={(v) => set('accPayDistFromTopEdge', v)} />
                <NumberField label="Desde borde izquierdo" value={values.accPayDistFromLeftEdge} onChange={(v) => set('accPayDistFromLeftEdge', v)} />
              </div>
            </div>
          )}
        </div>

        <div className="doc-actions-bar">
          <button type="button" className="btn btn-ghost" onClick={() => navigate('/config/tesoreria/plantillas-cheque')}>Cancelar</button>
          <button type="submit" className="btn btn-primary" disabled={createMutation.isPending || updateMutation.isPending}>
            {createMutation.isPending || updateMutation.isPending ? 'Guardando…' : isEdit ? 'Guardar' : 'Crear Plantilla'}
          </button>
        </div>
      </form>
    </div>
  )
}
