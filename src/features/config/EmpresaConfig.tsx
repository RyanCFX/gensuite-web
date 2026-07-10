import { useEffect, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { getEmpresa, updateEmpresa, getCuentasEmpresa, updateCuentasEmpresa, listAlmacenes } from '@/shared/api/config'
import type { Empresa, CuentasEmpresa, AlmacenListItem } from '@/shared/api/types'
import { PageHeader } from '@/components/shared/PageHeader'
import { AccountSelect } from '@/components/shared/AccountSelect'
import { REGIMENES_FISCALES } from '@/lib/constants'
import { Building2, Save } from 'lucide-react'
import { Link } from 'react-router-dom'

export default function EmpresaConfig() {
  const queryClient = useQueryClient()
  const [activeTab, setActiveTab] = useState<'general' | 'cuentas'>('general')

  // ── General tab state ──────────────────────────────────────────────────────
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

  const [itemCodeWarning, setItemCodeWarning] = useState(false)

  function set<K extends keyof Empresa>(key: K, value: Empresa[K]) {
    setForm((prev) => {
      if (key === 'itemCodeMode' && (value === 'auto' || value === 'prefix_auto') && prev.itemCodeMode === 'manual') {
        setItemCodeWarning(true)
      }
      return { ...prev, [key]: value }
    })
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    saveMutation.mutate(form)
  }

  // ── Warehouses lookup ──────────────────────────────────────────────────────
  const { data: warehouses } = useQuery({
    queryKey: ['almacenes'],
    queryFn: () => listAlmacenes(),
  })
  const transitWarehouses = (warehouses ?? []).filter((w) => w.warehouseType === 'Transit')

  // ── Cuentas por Defecto tab state ──────────────────────────────────────────
  const { data: cuentasData, isLoading: cuentasLoading } = useQuery({
    queryKey: ['cuentas-empresa'],
    queryFn: getCuentasEmpresa,
  })

  const [defaultReceivableAccount, setDefaultReceivableAccount] = useState('')
  const [defaultPayableAccount, setDefaultPayableAccount] = useState('')
  const [defaultIncomeAccount, setDefaultIncomeAccount] = useState('')
  const [defaultExpenseAccount, setDefaultExpenseAccount] = useState('')
  const [defaultBankAccount, setDefaultBankAccount] = useState('')
  const [writeOffAccount, setWriteOffAccount] = useState('')
  const [roundOffAccount, setRoundOffAccount] = useState('')

  useEffect(() => {
    if (cuentasData) {
      setDefaultReceivableAccount(cuentasData.defaultReceivableAccount ?? '')
      setDefaultPayableAccount(cuentasData.defaultPayableAccount ?? '')
      setDefaultIncomeAccount(cuentasData.defaultIncomeAccount ?? '')
      setDefaultExpenseAccount(cuentasData.defaultExpenseAccount ?? '')
      setDefaultBankAccount(cuentasData.defaultBankAccount ?? '')
      setWriteOffAccount(cuentasData.writeOffAccount ?? '')
      setRoundOffAccount(cuentasData.roundOffAccount ?? '')
    }
  }, [cuentasData])

  const saveCuentasMutation = useMutation({
    mutationFn: (dto: CuentasEmpresa) => updateCuentasEmpresa(dto),
    onSuccess: () => {
      toast.success('Cuentas por defecto actualizadas')
      queryClient.invalidateQueries({ queryKey: ['cuentas-empresa'] })
    },
    onError: () => toast.error('Error al guardar las cuentas'),
  })

  function handleSaveCuentas() {
    saveCuentasMutation.mutate({
      defaultReceivableAccount: defaultReceivableAccount || undefined,
      defaultPayableAccount: defaultPayableAccount || undefined,
      defaultIncomeAccount: defaultIncomeAccount || undefined,
      defaultExpenseAccount: defaultExpenseAccount || undefined,
      defaultBankAccount: defaultBankAccount || undefined,
      writeOffAccount: writeOffAccount || undefined,
      roundOffAccount: roundOffAccount || undefined,
    })
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
    <div className="page-container">
      <PageHeader
        title="Configuración de Empresa"
        description="Datos fiscales y de contacto de la empresa"
        action={
          activeTab === 'general' ? (
            <button className="btn btn-primary" onClick={handleSubmit} disabled={saveMutation.isPending}>
              <Save size={16} />
              {saveMutation.isPending ? 'Guardando…' : 'Guardar'}
            </button>
          ) : (
            <button className="btn btn-primary" onClick={handleSaveCuentas} disabled={saveCuentasMutation.isPending}>
              <Save size={16} />
              {saveCuentasMutation.isPending ? 'Guardando…' : 'Guardar'}
            </button>
          )
        }
      />

      <div className="tabs-bar" style={{ marginBottom: 20 }}>
        <button
          type="button"
          className={`tab-btn${activeTab === 'general' ? ' on' : ''}`}
          onClick={() => setActiveTab('general')}
        >
          General
        </button>
        <button
          type="button"
          className={`tab-btn${activeTab === 'cuentas' ? ' on' : ''}`}
          onClick={() => setActiveTab('cuentas')}
        >
          Cuentas por Defecto
        </button>
      </div>

      {activeTab === 'general' && (
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 20, maxWidth: 720 }}>
          <div>
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

            {/* Predeterminados */}
            <div className="card">
              <div className="card-header">
                <span className="card-title">Valores Predeterminados</span>
              </div>
              <div className="card-body">
                <div className="form-row">
                  <div className="ff-wrap">
                    <label className="ff-label">Modo de código de artículo</label>
                    <select
                      className="ff-select"
                      value={form.itemCodeMode ?? 'manual'}
                      onChange={(e) => set('itemCodeMode', e.target.value as 'manual' | 'auto' | 'prefix_auto')}
                    >
                      <option value="manual">Manual</option>
                      <option value="auto">Automático</option>
                      <option value="prefix_auto">Por prefijo de categoría</option>
                    </select>
                    <p className="ff-hint">Define cómo se asigna el código a nuevos artículos</p>
                    {itemCodeWarning && (
                      <div className="inline-alert inline-alert-warn" style={{ marginTop: 8 }}>
                        ⚠️ Este cambio es irreversible. Los artículos existentes mantendrán su código actual, pero los nuevos se generarán automáticamente.
                        <button type="button" className="btn btn-ghost btn-size-xs" style={{ marginLeft: 8 }} onClick={() => setItemCodeWarning(false)}>Entendido</button>
                      </div>
                    )}
                  </div>
                  <div className="ff-wrap">
                    <label className="ff-label">Almacén por defecto</label>
                    <select
                      className="ff-select"
                      value={form.defaultWarehouse ?? ''}
                      onChange={(e) => set('defaultWarehouse', e.target.value || undefined)}
                    >
                      <option value="">Sin predeterminado</option>
                      {(warehouses ?? []).map((w: AlmacenListItem) => (
                        <option key={w.name} value={w.name}>{w.name}</option>
                      ))}
                    </select>
                    <p className="ff-hint">Se usará al crear documentos si el usuario no tiene almacén asignado</p>
                  </div>
                  <div className="ff-wrap">
                    <label className="ff-label">Almacén de Tránsito</label>
                    <select
                      className="ff-select"
                      value={form.transitWarehouse ?? ''}
                      onChange={(e) => set('transitWarehouse', e.target.value || undefined)}
                    >
                      <option value="">Sin configurar</option>
                      {transitWarehouses.map((w) => (
                        <option key={w.name} value={w.name}>{w.name}</option>
                      ))}
                    </select>
                    {transitWarehouses.length === 0 ? (
                      <p className="ff-hint" style={{ color: 'var(--color-warning)' }}>
                        No hay ningún almacén de tipo "Tránsito" todavía. Crea uno primero en{' '}
                        <Link to="/config/almacenes">Configuración → Almacenes</Link> con tipo "Transit".
                      </p>
                    ) : (
                      <p className="ff-hint">Requerido para poder crear transferencias entre almacenes/sucursales.</p>
                    )}
                  </div>
                  <div className="ff-wrap">
                    <label className="ff-label">Nivel de precio por defecto</label>
                    <select
                      className="ff-select"
                      value={form.defaultPriceTipo ?? ''}
                      onChange={(e) => set('defaultPriceTipo', e.target.value as 'A' | 'B' | 'C' | undefined || undefined)}
                    >
                      <option value="">Sin predeterminado</option>
                      <option value="A">A — Minorista</option>
                      <option value="B">B — Medio mayoreo</option>
                      <option value="C">C — Mayorista</option>
                    </select>
                    <p className="ff-hint">Nivel de precio sugerido para nuevos documentos</p>
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
      )}

      {activeTab === 'cuentas' && (
        <div style={{ maxWidth: 720, display: 'flex', flexDirection: 'column', gap: 20 }}>
          {cuentasLoading ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {Array.from({ length: 7 }).map((_, i) => (
                <span key={i} className="skeleton-box" style={{ height: 56, display: 'block' }} />
              ))}
            </div>
          ) : (
            <div className="card">
              <div className="card-header">
                <span className="card-title">Cuentas Contables por Defecto</span>
              </div>
              <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div className="ff-wrap">
                  <label className="ff-label" htmlFor="defaultReceivableAccount">Cuentas por Cobrar (AR)</label>
                  <AccountSelect
                    id="defaultReceivableAccount"
                    value={defaultReceivableAccount}
                    onChange={setDefaultReceivableAccount}
                    placeholder="Buscar cuenta…"
                    ledgerOnly={true}
                  />
                  <p className="ff-hint">Para facturas emitidas a clientes</p>
                </div>

                <div className="ff-wrap">
                  <label className="ff-label" htmlFor="defaultPayableAccount">Cuentas por Pagar (AP)</label>
                  <AccountSelect
                    id="defaultPayableAccount"
                    value={defaultPayableAccount}
                    onChange={setDefaultPayableAccount}
                    placeholder="Buscar cuenta…"
                    ledgerOnly={true}
                  />
                  <p className="ff-hint">Para facturas de proveedores</p>
                </div>

                <div className="ff-wrap">
                  <label className="ff-label" htmlFor="defaultIncomeAccount">Ingresos por Defecto</label>
                  <AccountSelect
                    id="defaultIncomeAccount"
                    value={defaultIncomeAccount}
                    onChange={setDefaultIncomeAccount}
                    placeholder="Buscar cuenta…"
                    rootType="Income"
                    ledgerOnly={true}
                  />
                  <p className="ff-hint">Si el artículo no tiene cuenta de ingreso</p>
                </div>

                <div className="ff-wrap">
                  <label className="ff-label" htmlFor="defaultExpenseAccount">Gastos por Defecto</label>
                  <AccountSelect
                    id="defaultExpenseAccount"
                    value={defaultExpenseAccount}
                    onChange={setDefaultExpenseAccount}
                    placeholder="Buscar cuenta…"
                    rootType="Expense"
                    ledgerOnly={true}
                  />
                  <p className="ff-hint">Si el artículo no tiene cuenta de gasto</p>
                </div>

                <div className="ff-wrap">
                  <label className="ff-label" htmlFor="defaultBankAccount">Banco Principal</label>
                  <AccountSelect
                    id="defaultBankAccount"
                    value={defaultBankAccount}
                    onChange={setDefaultBankAccount}
                    placeholder="Buscar cuenta…"
                    ledgerOnly={true}
                  />
                  <p className="ff-hint">Para cobros y pagos sin cuenta específica</p>
                </div>

                <div className="ff-wrap">
                  <label className="ff-label" htmlFor="writeOffAccount">Cuenta de Descuentos</label>
                  <AccountSelect
                    id="writeOffAccount"
                    value={writeOffAccount}
                    onChange={setWriteOffAccount}
                    placeholder="Buscar cuenta…"
                    ledgerOnly={true}
                  />
                  <p className="ff-hint">Ajustes de diferencias al cerrar facturas</p>
                </div>

                <div className="ff-wrap">
                  <label className="ff-label" htmlFor="roundOffAccount">Cuenta de Redondeos</label>
                  <AccountSelect
                    id="roundOffAccount"
                    value={roundOffAccount}
                    onChange={setRoundOffAccount}
                    placeholder="Buscar cuenta…"
                    ledgerOnly={true}
                  />
                  <p className="ff-hint">Diferencias de centavos</p>
                </div>
              </div>
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button className="btn btn-primary" onClick={handleSaveCuentas} disabled={saveCuentasMutation.isPending}>
              <Save size={16} />
              {saveCuentasMutation.isPending ? 'Guardando…' : 'Guardar Cambios'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
