import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Modal } from '@/shared/ui/Modal'
import { cargarManualEcf } from '@/shared/api/ecf-recibidos'

// Fallback: el e-CF no llegó automáticamente y el usuario lo descargó del portal de la DGII.
// Flujo de excepción — un textarea para pegar el XML alcanza.
export function CargarXmlModal({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [signedXml, setSignedXml] = useState('')

  const mutation = useMutation({
    mutationFn: () => cargarManualEcf({ signedXml: signedXml.trim() }),
    onSuccess: (res) => {
      toast.success('e-CF cargado')
      queryClient.invalidateQueries({ queryKey: ['ecf-recibidos'] })
      onClose()
      if (res?.voucherId) navigate(`/ecf-recibidos/${encodeURIComponent(res.voucherId)}`)
    },
    onError: (err: { message?: string }) => toast.error(err?.message ?? 'No se pudo cargar el XML'),
  })

  return (
    <Modal
      open
      onClose={() => !mutation.isPending && onClose()}
      title="Cargar e-CF manualmente"
      subtitle="Pega el XML firmado del emisor (descargado del portal de la DGII)."
      size="lg"
      footer={
        <>
          <button className="btn btn-secondary btn-size-sm" onClick={onClose} disabled={mutation.isPending}>
            Cancelar
          </button>
          <button
            className="btn btn-primary btn-size-sm"
            onClick={() => mutation.mutate()}
            disabled={!signedXml.trim() || mutation.isPending}
          >
            {mutation.isPending ? <span className="spinner spinner-white spinner-sm" /> : 'Cargar'}
          </button>
        </>
      }
    >
      <div className="ff-wrap">
        <label className="ff-label ff-required" htmlFor="ecfSignedXml">XML del comprobante</label>
        <textarea
          id="ecfSignedXml"
          className="ff-textarea"
          rows={12}
          value={signedXml}
          onChange={(e) => setSignedXml(e.target.value)}
          placeholder="<ECF>…</ECF>  (o el contenido en base64)"
          style={{ fontFamily: 'monospace', fontSize: 12 }}
          autoFocus
        />
      </div>
    </Modal>
  )
}
