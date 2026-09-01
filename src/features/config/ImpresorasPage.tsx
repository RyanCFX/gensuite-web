import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useForm, Controller } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import { toast } from 'sonner'
import { Plus, Pencil, Trash2, RefreshCw, Printer, ShieldCheck } from 'lucide-react'
import { PageHeader } from '@/components/shared/PageHeader'
import { ActionsMenu, ActionsMenuItem } from '@/shared/ui/ActionsMenu'
import { ConfirmModal } from '@/shared/ui/Modal'
import { useConfirmClose } from '@/shared/hooks/useConfirmClose'
import { listQzPrinters } from '@/shared/printing/qz'
import { QzCertificateModal } from './QzCertificateModal'
import {
  listImpresoras,
  createImpresora,
  updateImpresora,
  deleteImpresora,
  getMiSeleccion,
  setMiSeleccion,
} from '@/shared/api/impresoras'
import type { Impresora } from '@/shared/api/types'

const printerSchema = z.object({
  name: z.string().min(1, 'El nombre es requerido'),
  brand: z.string().min(1, 'La marca es requerida'),
  model: z.string().min(1, 'El modelo es requerido'),
  qzPrinterName: z.string().min(1, 'Selecciona una impresora de QZ Tray'),
})

type PrinterFormValues = z.infer<typeof printerSchema>

export default function ImpresorasPage() {
  const queryClient = useQueryClient()

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<Impresora | null>(null)
  const [toDelete, setToDelete] = useState<Impresora | null>(null)
  const [certModalOpen, setCertModalOpen] = useState(false)

  const { data: configs = [], isLoading: configsLoading } = useQuery({
    queryKey: ['impresoras'],
    queryFn: listImpresoras,
  })

  const { data: selected } = useQuery({
    queryKey: ['impresoras-mi-seleccion'],
    queryFn: getMiSeleccion,
  })
  const selectedId = selected?.id ?? null

  const {
    data: qzPrinters,
    isLoading: qzLoading,
    isError: qzError,
    refetch: refetchQzPrinters,
  } = useQuery({
    queryKey: ['qz-printers'],
    queryFn: listQzPrinters,
    enabled: dialogOpen,
    retry: false,
    staleTime: 0,
  })

  const {
    register,
    control,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<PrinterFormValues>({
    resolver: zodResolver(printerSchema),
    defaultValues: { name: '', brand: '', model: '', qzPrinterName: '' },
  })

  const { requestClose, confirming, confirmDiscard, cancelDiscard } = useConfirmClose(isDirty, closeDialog)

  const createMutation = useMutation({
    mutationFn: createImpresora,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['impresoras'] })
      toast.success('Impresora creada')
      closeDialog()
    },
    onError: (err: { message?: string }) => toast.error(err?.message ?? 'No se pudo crear la impresora'),
  })

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: PrinterFormValues }) => updateImpresora(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['impresoras'] })
      queryClient.invalidateQueries({ queryKey: ['impresoras-mi-seleccion'] })
      toast.success('Impresora actualizada')
      closeDialog()
    },
    onError: (err: { message?: string }) => toast.error(err?.message ?? 'No se pudo actualizar la impresora'),
  })

  const deleteMutation = useMutation({
    mutationFn: deleteImpresora,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['impresoras'] })
      // El backend desasocia sola la selección del usuario si borró la impresora que tenía
      // elegida (FK ON DELETE SET NULL) — solo hace falta refrescar para reflejarlo.
      queryClient.invalidateQueries({ queryKey: ['impresoras-mi-seleccion'] })
      toast.success('Impresora eliminada')
      setToDelete(null)
    },
    onError: (err: { message?: string }) => toast.error(err?.message ?? 'No se pudo eliminar la impresora'),
  })

  const selectMutation = useMutation({
    mutationFn: setMiSeleccion,
    onSuccess: (_, impresoraId) => {
      queryClient.invalidateQueries({ queryKey: ['impresoras-mi-seleccion'] })
      toast.success(impresoraId ? 'Impresora seleccionada' : 'Se usará el diálogo del navegador')
    },
    onError: (err: { message?: string }) => toast.error(err?.message ?? 'No se pudo cambiar la selección'),
  })

  function openCreate() {
    setEditTarget(null)
    reset({ name: '', brand: '', model: '', qzPrinterName: '' })
    setDialogOpen(true)
  }

  function openEdit(c: Impresora) {
    setEditTarget(c)
    reset({ name: c.name, brand: c.brand ?? '', model: c.model ?? '', qzPrinterName: c.qzPrinterName })
    setDialogOpen(true)
  }

  function closeDialog() {
    setDialogOpen(false)
    setEditTarget(null)
    reset()
  }

  function onSubmit(values: PrinterFormValues) {
    if (editTarget) {
      updateMutation.mutate({ id: editTarget.id, data: values })
    } else {
      createMutation.mutate(values)
    }
  }

  return (
    <div className="page-container">
      <PageHeader
        title="Impresoras"
        description="Configura impresoras para imprimir directo (sin diálogo del navegador) vía QZ Tray — cada usuario elige cuál usar."
        action={
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-secondary" onClick={() => setCertModalOpen(true)}>
              <ShieldCheck size={16} /> Certificado QZ Tray
            </button>
            <button className="btn btn-primary" onClick={openCreate}>
              <Plus size={16} /> Nueva Impresora
            </button>
          </div>
        }
      />

      <div className="card">
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th style={{ width: 40 }} />
                <th>Nombre</th>
                <th>Marca</th>
                <th>Modelo</th>
                <th>Impresora (QZ Tray)</th>
                <th style={{ width: 48 }} />
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>
                  <input
                    type="radio"
                    name="printer-selection"
                    checked={selectedId === null}
                    onChange={() => selectMutation.mutate(null)}
                  />
                </td>
                <td colSpan={4} style={{ fontStyle: 'italic', color: 'var(--text-secondary)' }}>
                  Ninguna — usar el diálogo de impresión del navegador
                </td>
                <td />
              </tr>
              {!configsLoading && configs.length === 0 ? (
                <tr>
                  <td colSpan={6}>
                    <div className="empty-state">
                      <Printer size={28} style={{ color: 'var(--text-tertiary)' }} />
                      <p className="empty-title">Sin impresoras configuradas</p>
                      <p className="empty-sub">Crea una para imprimir directo sin el diálogo del navegador.</p>
                    </div>
                  </td>
                </tr>
              ) : (
                configs.map((c) => (
                  <tr key={c.id}>
                    <td>
                      <input
                        type="radio"
                        name="printer-selection"
                        checked={selectedId === c.id}
                        onChange={() => selectMutation.mutate(c.id)}
                      />
                    </td>
                    <td style={{ fontWeight: 500 }}>{c.name}</td>
                    <td className="td-muted">{c.brand}</td>
                    <td className="td-muted">{c.model}</td>
                    <td className="td-muted" style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>
                      {c.qzPrinterName}
                    </td>
                    <td onClick={(e) => e.stopPropagation()} className="actions-cell">
                      <ActionsMenu>
                        <ActionsMenuItem onClick={() => openEdit(c)}>
                          <Pencil size={14} /> Editar
                        </ActionsMenuItem>
                        <ActionsMenuItem onClick={() => setToDelete(c)}>
                          <Trash2 size={14} /> Eliminar
                        </ActionsMenuItem>
                      </ActionsMenu>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {dialogOpen && (
        <div className="modal-overlay" onClick={requestClose}>
          <div className="modal-box" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <h2 className="modal-title">{editTarget ? 'Editar Impresora' : 'Nueva Impresora'}</h2>
              <button className="modal-close" type="button" onClick={requestClose}>×</button>
            </div>
            <form onSubmit={handleSubmit(onSubmit)}>
              <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div className="ff-wrap">
                  <label className="ff-label ff-required" htmlFor="prName">Nombre</label>
                  <input id="prName" className={`ff-input${errors.name ? ' ff-input-error' : ''}`} placeholder="Ej: Caja 1" {...register('name')} />
                  {errors.name && <p className="ff-error">{errors.name.message}</p>}
                </div>
                <div className="form-row form-row-2">
                  <div className="ff-wrap">
                    <label className="ff-label ff-required" htmlFor="prBrand">Marca</label>
                    <input id="prBrand" className={`ff-input${errors.brand ? ' ff-input-error' : ''}`} placeholder="Ej: Star" {...register('brand')} />
                    {errors.brand && <p className="ff-error">{errors.brand.message}</p>}
                  </div>
                  <div className="ff-wrap">
                    <label className="ff-label ff-required" htmlFor="prModel">Modelo</label>
                    <input id="prModel" className={`ff-input${errors.model ? ' ff-input-error' : ''}`} placeholder="Ej: TSP143" {...register('model')} />
                    {errors.model && <p className="ff-error">{errors.model.message}</p>}
                  </div>
                </div>

                <div className="ff-wrap">
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <label className="ff-label ff-required" htmlFor="prQzPrinter">Impresora (QZ Tray)</label>
                    <button
                      type="button"
                      className="btn btn-ghost btn-size-xs"
                      onClick={() => refetchQzPrinters()}
                      disabled={qzLoading}
                    >
                      <RefreshCw size={12} /> {qzLoading ? 'Conectando…' : 'Reintentar conexión'}
                    </button>
                  </div>
                  {qzError && (
                    <p className="ff-error">
                      No se pudo conectar con QZ Tray. Confirma que la aplicación esté instalada y corriendo en esta
                      máquina, y revisa si apareció un diálogo de QZ Tray en el escritorio (puede quedar detrás del
                      navegador) pidiendo aprobar la conexión — acéptalo y reintenta.
                    </p>
                  )}
                  <Controller
                    name="qzPrinterName"
                    control={control}
                    render={({ field }) => (
                      <select
                        id="prQzPrinter"
                        className={`ff-input ff-select${errors.qzPrinterName ? ' ff-input-error' : ''}`}
                        value={field.value}
                        onChange={(e) => field.onChange(e.target.value)}
                        disabled={qzLoading || !qzPrinters || qzPrinters.length === 0}
                      >
                        <option value="">
                          {qzLoading ? 'Conectando con QZ Tray…' : qzPrinters?.length ? '— Selecciona una impresora —' : 'Sin impresoras disponibles'}
                        </option>
                        {qzPrinters?.map((p) => (
                          <option key={p} value={p}>{p}</option>
                        ))}
                        {/* Si se está editando y la impresora ya no aparece en la lista actual de QZ, se
                            conserva como opción para no perder el valor guardado silenciosamente. */}
                        {editTarget && qzPrinters && !qzPrinters.includes(editTarget.qzPrinterName) && (
                          <option value={editTarget.qzPrinterName}>{editTarget.qzPrinterName} (no detectada ahora)</option>
                        )}
                      </select>
                    )}
                  />
                  {errors.qzPrinterName && <p className="ff-error">{errors.qzPrinterName.message}</p>}
                </div>
              </div>
              <div className="modal-foot">
                <button type="button" className="btn btn-ghost" onClick={requestClose}>Cancelar</button>
                <button type="submit" className="btn btn-primary" disabled={isSubmitting}>
                  {editTarget ? 'Guardar' : 'Crear'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <ConfirmModal
        open={confirming}
        onClose={cancelDiscard}
        onConfirm={confirmDiscard}
        title="¿Descartar cambios?"
        description="Tienes cambios sin guardar en este formulario. Si continúas, se perderán."
        confirmLabel="Descartar cambios"
        variant="danger"
      />

      {toDelete && (
        <div className="modal-overlay" onClick={() => setToDelete(null)}>
          <div className="modal-box modal-box-sm" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <h2 className="modal-title">¿Eliminar impresora?</h2>
              <button className="modal-close" type="button" onClick={() => setToDelete(null)}>×</button>
            </div>
            <div className="modal-body">
              <p style={{ fontSize: 14 }}>
                Se eliminará <strong>{toDelete.name}</strong>. Esta acción no se puede deshacer.
              </p>
            </div>
            <div className="modal-foot">
              <button className="btn btn-ghost" onClick={() => setToDelete(null)}>Cancelar</button>
              <button className="btn btn-danger" onClick={() => deleteMutation.mutate(toDelete.id)} disabled={deleteMutation.isPending}>
                {deleteMutation.isPending ? 'Eliminando…' : 'Eliminar'}
              </button>
            </div>
          </div>
        </div>
      )}

      <QzCertificateModal open={certModalOpen} onClose={() => setCertModalOpen(false)} />
    </div>
  )
}
