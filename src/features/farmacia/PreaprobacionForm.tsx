import { useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { createPreaprobacion } from '@/shared/api/farmacia'
import { listCustomers } from '@/shared/api/customers'
import type { CreatePreaprobacionDto } from '@/shared/api/types'
import type { Item } from '@/shared/api/types'
import { ItemSelect } from '@/shared/ui/ItemSelect'
import { SearchSelect } from '@/shared/ui/SearchSelect'
import type { SearchSelectOption } from '@/shared/ui/SearchSelect'
import { DatePicker } from '@/shared/ui/DatePicker'
import { formatDOP, round2 } from '@/lib/formatters'
import { ArrowLeft, Save, Plus, Trash2, Loader2 } from 'lucide-react'

interface LineItem {
  itemCode: string
  itemLabel?: string
  cantidad: number
  precioUnitario: number
}

function emptyLine(): LineItem {
  return { itemCode: '', cantidad: 1, precioUnitario: 0 }
}

export default function PreaprobacionForm() {
  const navigate = useNavigate()

  const [aseguradoraId, setAseguradoraId] = useState('')
  const [aseguradoraLabel, setAseguradoraLabel] = useState('')
  const [aseguradoraQuery, setAseguradoraQuery] = useState('')
  const [clienteId, setClienteId] = useState('')
  const [clienteLabel, setClienteLabel] = useState('')
  const [clienteQuery, setClienteQuery] = useState('')
  const [numeroAprobacion, setNumeroAprobacion] = useState('')
  const [carnetAfiliado, setCarnetAfiliado] = useState('')
  const [cedula, setCedula] = useState('')
  const [telefonoPaciente, setTelefonoPaciente] = useState('')
  const [fechaAprobacion, setFechaAprobacion] = useState('')
  const [valorCoberturaArs, setValorCoberturaArs] = useState<number>(0)
  const [items, setItems] = useState<LineItem[]>([emptyLine()])
  const [submitted, setSubmitted] = useState(false)

  const { data: aseguradorasData, isLoading: aseguradorasLoading } = useQuery({
    queryKey: ['customerSearch-ars', aseguradoraQuery],
    queryFn: () => listCustomers({ search: aseguradoraQuery || undefined, limit: 15 }),
  })
  const aseguradoraOptions: SearchSelectOption[] = (aseguradorasData?.items ?? []).map((c) => ({
    value: c.id,
    label: c.customerName,
  }))

  const { data: clientesData, isLoading: clientesLoading } = useQuery({
    queryKey: ['customerSearch', clienteQuery],
    queryFn: () => listCustomers({ search: clienteQuery || undefined, limit: 15 }),
  })
  const clienteOptions: SearchSelectOption[] = (clientesData?.items ?? []).map((c) => ({
    value: c.id,
    label: c.customerName,
    sublabel: c.rnc ?? c.cedula,
  }))

  function updateItem(index: number, patch: Partial<LineItem>) {
    setItems((prev) => prev.map((row, i) => (i === index ? { ...row, ...patch } : row)))
  }

  function selectCatalogItem(index: number, catalogItem: Item) {
    updateItem(index, {
      itemCode: catalogItem.id,
      itemLabel: catalogItem.itemName,
      precioUnitario: catalogItem.standardRate ?? 0,
    })
  }

  function addRow() {
    setItems((prev) => [...prev, emptyLine()])
  }

  function removeRow(index: number) {
    setItems((prev) => prev.filter((_, i) => i !== index))
  }

  const montoTotalReceta = items.reduce((sum, i) => sum + i.cantidad * i.precioUnitario, 0)

  const createMutation = useMutation({
    mutationFn: (dto: CreatePreaprobacionDto) => createPreaprobacion(dto),
    onSuccess: (preaprobacion) => {
      toast.success('Preaprobación registrada correctamente')
      navigate(`/farmacia/preaprobaciones/${preaprobacion.id}`)
    },
    onError: (err: { message?: string }) => {
      toast.error(err?.message ?? 'Error al registrar la preaprobación')
    },
  })

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitted(true)

    if (!aseguradoraId) { toast.error('Selecciona la ARS'); return }
    if (!clienteId) { toast.error('Selecciona el paciente'); return }
    if (!numeroAprobacion.trim()) { toast.error('El número de autorización es requerido'); return }
    if (!carnetAfiliado.trim()) { toast.error('El carnet de afiliado es requerido'); return }
    if (valorCoberturaArs <= 0) { toast.error('El valor de cobertura ARS debe ser mayor a 0'); return }
    if (items.length === 0 || items.some((i) => !i.itemCode)) { toast.error('Agrega al menos un medicamento'); return }
    if (items.some((i) => !i.cantidad || i.cantidad <= 0)) { toast.error('Cada línea necesita una cantidad válida'); return }
    if (items.some((i) => !i.precioUnitario || i.precioUnitario <= 0)) { toast.error('Cada línea necesita un precio unitario válido'); return }

    createMutation.mutate({
      aseguradora: aseguradoraId,
      numeroAprobacion: numeroAprobacion.trim(),
      cliente: clienteId,
      cedula: cedula || undefined,
      telefonoPaciente: telefonoPaciente || undefined,
      carnetAfiliado: carnetAfiliado.trim(),
      fechaAprobacion: fechaAprobacion || undefined,
      valorCoberturaArs,
      detalle: items.map((i) => ({
        item: i.itemCode,
        cantidad: i.cantidad,
        precioUnitario: i.precioUnitario,
      })),
    })
  }

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <a className="page-back-link" onClick={() => navigate('/farmacia/preaprobaciones')}>
            <ArrowLeft size={14} /> Preaprobaciones ARS
          </a>
          <h1 className="page-title">Nueva Preaprobación</h1>
        </div>
      </div>

      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
        <div className="card">
          <div className="card-header">
            <h2 className="card-title">Información General</h2>
          </div>
          <div className="card-body">
            <div className="form-row form-row-3">
              <div className="ff-wrap">
                <label className="ff-label ff-required" htmlFor="aseguradora">ARS</label>
                <SearchSelect
                  id="aseguradora"
                  value={aseguradoraId}
                  selectedLabel={aseguradoraLabel}
                  onChange={(val, opt) => { setAseguradoraId(val); setAseguradoraLabel(opt?.label ?? '') }}
                  options={aseguradoraOptions}
                  onSearch={setAseguradoraQuery}
                  loading={aseguradorasLoading}
                  placeholder="Buscar ARS…"
                  error={submitted && !aseguradoraId}
                />
              </div>

              <div className="ff-wrap">
                <label className="ff-label ff-required" htmlFor="cliente">Paciente</label>
                <SearchSelect
                  id="cliente"
                  value={clienteId}
                  selectedLabel={clienteLabel}
                  onChange={(val, opt) => { setClienteId(val); setClienteLabel(opt?.label ?? '') }}
                  options={clienteOptions}
                  onSearch={setClienteQuery}
                  loading={clientesLoading}
                  placeholder="Buscar paciente…"
                  error={submitted && !clienteId}
                />
              </div>

              <div className="ff-wrap">
                <label className="ff-label ff-required" htmlFor="numeroAprobacion">N.º de autorización</label>
                <input
                  id="numeroAprobacion"
                  className={`ff-input${submitted && !numeroAprobacion.trim() ? ' items-input-error' : ''}`}
                  value={numeroAprobacion}
                  onChange={(e) => setNumeroAprobacion(e.target.value)}
                  placeholder="Ej. AUTH-2026-00981"
                />
              </div>

              <div className="ff-wrap">
                <label className="ff-label ff-required" htmlFor="carnetAfiliado">Carnet de afiliado</label>
                <input
                  id="carnetAfiliado"
                  className={`ff-input${submitted && !carnetAfiliado.trim() ? ' items-input-error' : ''}`}
                  value={carnetAfiliado}
                  onChange={(e) => setCarnetAfiliado(e.target.value)}
                />
              </div>

              <div className="ff-wrap">
                <label className="ff-label" htmlFor="cedula">Cédula</label>
                <input id="cedula" className="ff-input" value={cedula} onChange={(e) => setCedula(e.target.value)} />
              </div>

              <div className="ff-wrap">
                <label className="ff-label" htmlFor="telefonoPaciente">Teléfono del paciente</label>
                <input id="telefonoPaciente" className="ff-input" value={telefonoPaciente} onChange={(e) => setTelefonoPaciente(e.target.value)} />
              </div>

              <div className="ff-wrap">
                <label className="ff-label" htmlFor="fechaAprobacion">Fecha de aprobación</label>
                <DatePicker id="fechaAprobacion" className="ff-input" value={fechaAprobacion} onChange={setFechaAprobacion} clearable />
              </div>

              <div className="ff-wrap">
                <label className="ff-label ff-required" htmlFor="valorCoberturaArs">Valor cobertura ARS (RD$)</label>
                <input
                  id="valorCoberturaArs"
                  className={`ff-input${submitted && valorCoberturaArs <= 0 ? ' items-input-error' : ''}`}
                  type="number"
                  min="0"
                  step="0.01"
                  value={valorCoberturaArs || ''}
                  onChange={(e) => setValorCoberturaArs(parseFloat(e.target.value) || 0)}
                  style={{ textAlign: 'right' }}
                />
                <p className="ff-hint">Lo que la ARS aprobó en total para esta receta, tal cual lo indica su plataforma.</p>
              </div>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <h2 className="card-title">Medicamentos</h2>
          </div>
          <div className="items-table-wrap">
            <table className="items-table">
              <thead>
                <tr>
                  <th style={{ minWidth: 220 }}>Medicamento</th>
                  <th style={{ textAlign: 'right', width: 100 }}>Cant.</th>
                  <th style={{ textAlign: 'right', width: 140 }}>Precio Unit.</th>
                  <th style={{ textAlign: 'right', width: 140 }}>Precio Línea</th>
                  <th style={{ width: 40 }} />
                </tr>
              </thead>
              <tbody>
                {items.map((row, index) => (
                  <tr key={index}>
                    <td style={{ minWidth: 220 }}>
                      <ItemSelect
                        value={row.itemCode}
                        selectedLabel={row.itemLabel}
                        onSelect={(item) => selectCatalogItem(index, item)}
                        onClear={() => updateItem(index, { itemCode: '', itemLabel: undefined, precioUnitario: 0 })}
                      />
                    </td>
                    <td>
                      <input
                        className="items-input"
                        type="number"
                        min="0"
                        step="1"
                        value={row.cantidad}
                        onChange={(e) => updateItem(index, { cantidad: parseFloat(e.target.value) || 0 })}
                        style={{ textAlign: 'right' }}
                      />
                    </td>
                    <td>
                      <input
                        className="items-input"
                        type="number"
                        min="0"
                        step="0.01"
                        value={round2(row.precioUnitario)}
                        onChange={(e) => updateItem(index, { precioUnitario: parseFloat(e.target.value) || 0 })}
                        style={{ textAlign: 'right' }}
                      />
                    </td>
                    <td style={{ textAlign: 'right', fontWeight: 500 }}>
                      {formatDOP(row.cantidad * row.precioUnitario)}
                    </td>
                    <td onClick={(e) => e.stopPropagation()} className="actions-cell">
                      <button type="button" className="btn btn-ghost btn-size-sm" onClick={() => removeRow(index)} disabled={items.length === 1}>
                        <Trash2 size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div style={{ padding: '8px 16px', borderTop: '1px solid var(--border)' }}>
              <button type="button" className="btn btn-ghost btn-size-sm" onClick={addRow}>
                <Plus size={14} /> Agregar medicamento
              </button>
            </div>

            <div className="items-total-row">
              <div className="items-total-line" style={{ fontWeight: 700, fontSize: 15 }}>
                <span>Total receta</span>
                <span>{formatDOP(montoTotalReceta)}</span>
              </div>
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
          <button type="button" className="btn btn-ghost" onClick={() => navigate('/farmacia/preaprobaciones')}>
            Cancelar
          </button>
          <button type="submit" className="btn btn-primary" disabled={createMutation.isPending}>
            {createMutation.isPending ? <Loader2 size={15} style={{ animation: 'spin 1s linear infinite' }} /> : <Save size={15} />}
            Guardar Preaprobación
          </button>
        </div>
      </form>
    </div>
  )
}
