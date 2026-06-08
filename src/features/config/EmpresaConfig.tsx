import { useEffect, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { getEmpresa, updateEmpresa } from '@/shared/api/config'
import type { Empresa } from '@/shared/api/types'
import { PageHeader } from '@/components/shared/PageHeader'
import { REGIMENES_FISCALES } from '@/lib/constants'
import { Building2, Save } from 'lucide-react'

export default function EmpresaConfig() {
  const queryClient = useQueryClient()

  const { data, isLoading } = useQuery({
    queryKey: ['empresa'],
    queryFn: getEmpresa,
  })

  const [form, setForm] = useState<Partial<Empresa>>({})

  useEffect(() => {
    if (data) setForm(data)
  }, [data])

  const saveMutation = useMutation({
    mutationFn: (dto: Partial<Empresa>) => updateEmpresa(dto),
    onSuccess: () => {
      toast.success('Datos de empresa actualizados')
      queryClient.invalidateQueries({ queryKey: ['empresa'] })
    },
    onError: () => toast.error('Error al guardar los datos'),
  })

  function set<K extends keyof Empresa>(key: K, value: Empresa[K]) {
    setForm((prev) => ({ ...prev, [key]: value }))
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    saveMutation.mutate(form)
  }

  if (isLoading) {
    return (
      <div className="page-container" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <span className="skeleton-box" style={{ height: 32, width: 200, display: 'block' }} />
        <div className="form-row">
          {Array.from({ length: 8 }).map((_, i) => (
            <span key={i} className="skeleton-box" style={{ height: 40, display: 'block' }} />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div>
      <PageHeader
        title="Configuración de Empresa"
        description="Datos fiscales y de contacto de la empresa"
        action={
          <button className="btn btn-primary" onClick={handleSubmit} disabled={saveMutation.isPending}>
            <Save size={16} />
            {saveMutation.isPending ? 'Guardando…' : 'Guardar'}
          </button>
        }
      />

      <form onSubmit={handleSubmit}>
        <div className="page-container" style={{ display: 'flex', flexDirection: 'column', gap: 20, maxWidth: 720 }}>
          {/* Datos Fiscales */}
          <div className="card">
            <div className="card-header">
              <span className="card-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Building2 size={16} />
                Datos Fiscales
              </span>
            </div>
            <div className="card-body">
              <div className="form-section">
                <p className="form-section-title">Información Fiscal</p>
                <div className="form-row">
                  <div className="ff-wrap">
                    <label className="ff-label">Nombre de la Empresa <span className="ff-required">*</span></label>
                    <input
                      className="ff-input"
                      value={form.companyName ?? ''}
                      onChange={(e) => set('companyName', e.target.value)}
                      placeholder="Mi Empresa SRL"
                    />
                  </div>
                  <div className="ff-wrap">
                    <label className="ff-label">RNC</label>
                    <input
                      className="ff-input"
                      value={form.rnc ?? ''}
                      onChange={(e) => set('rnc', e.target.value)}
                      placeholder="000000000"
                    />
                  </div>
                  <div className="ff-wrap">
                    <label className="ff-label">Régimen Fiscal</label>
                    <select
                      className="ff-select"
                      value={form.regimenFiscal ?? ''}
                      onChange={(e) => set('regimenFiscal', e.target.value as Empresa['regimenFiscal'])}
                    >
                      <option value="">Seleccionar régimen</option>
                      {REGIMENES_FISCALES.map((r) => (
                        <option key={r.value} value={r.value}>{r.label}</option>
                      ))}
                    </select>
                  </div>
                  <div className="ff-wrap">
                    <label className="ff-label">Actividad Económica</label>
                    <input
                      className="ff-input"
                      value={form.actividadEconomica ?? ''}
                      onChange={(e) => set('actividadEconomica', e.target.value)}
                      placeholder="Comercio al por mayor"
                    />
                  </div>
                  <div className="ff-wrap">
                    <label className="ff-label">Representante Legal</label>
                    <input
                      className="ff-input"
                      value={form.representanteLegal ?? ''}
                      onChange={(e) => set('representanteLegal', e.target.value)}
                    />
                  </div>
                  <div className="ff-wrap">
                    <label className="ff-label">Cédula del Representante</label>
                    <input
                      className="ff-input"
                      value={form.cedulaRepresentante ?? ''}
                      onChange={(e) => set('cedulaRepresentante', e.target.value)}
                      placeholder="000-0000000-0"
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Contacto */}
          <div className="card">
            <div className="card-header">
              <span className="card-title">Información de Contacto</span>
            </div>
            <div className="card-body">
              <div className="form-row">
                <div className="ff-wrap">
                  <label className="ff-label">Teléfono</label>
                  <input
                    className="ff-input"
                    value={form.telefono ?? ''}
                    onChange={(e) => set('telefono', e.target.value)}
                    placeholder="(809) 000-0000"
                  />
                </div>
                <div className="ff-wrap">
                  <label className="ff-label">Email</label>
                  <input
                    type="email"
                    className="ff-input"
                    value={form.email ?? ''}
                    onChange={(e) => set('email', e.target.value)}
                    placeholder="info@empresa.com"
                  />
                </div>
                <div className="ff-wrap">
                  <label className="ff-label">Sitio Web</label>
                  <input
                    className="ff-input"
                    value={form.website ?? ''}
                    onChange={(e) => set('website', e.target.value)}
                    placeholder="https://empresa.com"
                  />
                </div>
                <div className="ff-wrap" style={{ gridColumn: '1 / -1' }}>
                  <label className="ff-label">Dirección</label>
                  <input
                    className="ff-input"
                    value={form.direccion ?? ''}
                    onChange={(e) => set('direccion', e.target.value)}
                    placeholder="Calle Principal #1, Santo Domingo"
                  />
                </div>
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button type="submit" className="btn btn-primary" disabled={saveMutation.isPending}>
              <Save size={16} />
              {saveMutation.isPending ? 'Guardando…' : 'Guardar Cambios'}
            </button>
          </div>
        </div>
      </form>
    </div>
  )
}
