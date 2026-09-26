import { useEffect, useMemo, useRef, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { getEmpresa, updateEmpresa, uploadLogoEmpresa, getCuentasEmpresa, updateCuentasEmpresa, listAlmacenes } from '@/shared/api/config'
import type { Empresa, CuentasEmpresa, ItemProps } from '@/shared/api/types'
import { PageHeader } from '@/components/shared/PageHeader'
import { AccountSelect } from '@/components/shared/AccountSelect'
import { CostCenterSelect } from '@/components/shared/CostCenterSelect'
import { SearchSelect } from '@/shared/ui/SearchSelect'
import type { SearchSelectOption } from '@/shared/ui/SearchSelect'
import { FieldTooltip } from '@/shared/ui/FieldTooltip'
import { Select, SelectItem } from '@/components/ui/select'
import { REGIMENES_FISCALES } from '@/lib/constants'
import {
  Building2, Image, Loader2, Save, Landmark, Phone, Settings2, CheckCircle2,
  Circle, MapPin, FileText, ShieldCheck, LayoutTemplate, Wallet, ChevronRight,
  ReceiptText, TrendingUp, Vault, Boxes, CalendarClock, Tractor, BadgePercent,
  PieChart, TriangleAlert, Upload,
} from 'lucide-react'
import { Link } from 'react-router-dom'
import './EmpresaConfig.css'

const LOGO_ACCEPTED_TYPES = ['image/png', 'image/jpeg', 'image/svg+xml', 'image/webp']
const LOGO_MAX_SIZE_BYTES = 2 * 1024 * 1024

type TabKey = 'general' | 'cuentas'

/* Pequeño helper para no repetir label + AccountSelect en la pestaña contable */
function CuentaField({
  id, label, hint, value, onChange, rootType,
}: {
  id: string
  label: string
  hint?: string
  value: string
  onChange: (v: string) => void
  rootType?: 'Asset' | 'Liability' | 'Equity' | 'Income' | 'Expense'
}) {
  return (
    <div className="ff-wrap">
      <label className="ff-label" htmlFor={id}>
        {label}
        {hint && <FieldTooltip>{hint}</FieldTooltip>}
      </label>
      <AccountSelect
        id={id}
        value={value}
        onChange={onChange}
        placeholder="Buscar cuenta…"
        ledgerOnly={true}
        {...(rootType ? { rootType } : {})}
      />
    </div>
  )
}

function scrollTo(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

export default function EmpresaConfig() {
  const queryClient = useQueryClient()
  const [activeTab, setActiveTab] = useState<TabKey>('general')

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

  // ── Logo de la empresa ──────────────────────────────────────────────────────
  const logoFileInputRef = useRef<HTMLInputElement>(null)
  const uploadLogoMutation = useMutation({
    mutationFn: (file: File) => uploadLogoEmpresa(file),
    onSuccess: (result) => {
      setForm((prev) => ({ ...prev, logoUrl: result.logoUrl }))
      toast.success('Logo actualizado')
    },
    onError: (err: { response?: { data?: { message?: string } }; message?: string }) => {
      toast.error(err?.response?.data?.message ?? err?.message ?? 'Error al subir el logo')
    },
  })

  function handleLogoFileSelected(file: File | undefined) {
    if (!file) return
    if (!LOGO_ACCEPTED_TYPES.includes(file.type)) {
      toast.error('Formato no soportado — usa PNG, JPG, SVG o WEBP')
      return
    }
    if (file.size > LOGO_MAX_SIZE_BYTES) {
      toast.error('El logo no puede superar 2MB')
      return
    }
    uploadLogoMutation.mutate(file)
  }

  function set<K extends keyof Empresa>(key: K, value: Empresa[K]) {
    setForm((prev) => {
      if (key === 'itemCodeMode' && (value === 'auto' || value === 'prefix_auto') && prev.itemCodeMode === 'manual') {
        setItemCodeWarning(true)
      }
      return { ...prev, [key]: value }
    })
  }

  function handleSubmit(e?: React.FormEvent) {
    e?.preventDefault()
    const payload: Partial<Empresa> = {}
    for (const key of ['rnc', 'regimenFiscal', 'actividadEconomica', 'representanteLegal', 'cedulaRepresentante', 'telefono', 'email', 'website', 'direccion', 'itemCodeMode', 'defaultWarehouse', 'defaultPriceTipo', 'transitWarehouse'] as const) {
      const value = form[key]
      if (value !== undefined) (payload as Record<string, unknown>)[key] = value
    }
    saveMutation.mutate(payload)
  }

  // ── Warehouses lookup ──────────────────────────────────────────────────────
  const { data: warehouses } = useQuery({
    queryKey: ['almacenes'],
    queryFn: () => listAlmacenes(),
  })
  const transitWarehouses = (warehouses ?? []).filter((w) => w.warehouseType === 'Transit')
  const [warehouseSearch, setWarehouseSearch] = useState('')
  const [transitWarehouseSearch, setTransitWarehouseSearch] = useState('')

  const warehouseOptions: SearchSelectOption[] = (warehouses ?? [])
    .filter((w) => !warehouseSearch || w.name.toLowerCase().includes(warehouseSearch.toLowerCase()))
    .map((w) => ({ value: w.id, label: w.name }))

  const transitWarehouseOptions: SearchSelectOption[] = transitWarehouses
    .filter((w) => !transitWarehouseSearch || w.name.toLowerCase().includes(transitWarehouseSearch.toLowerCase()))
    .map((w) => ({ value: w.id, label: w.name }))

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

  // 🆕 Inventario
  const [defaultCashAccount, setDefaultCashAccount] = useState('')
  const [defaultInventoryAccount, setDefaultInventoryAccount] = useState('')
  const [stockReceivedButNotBilled, setStockReceivedButNotBilled] = useState('')
  const [stockAdjustmentAccount, setStockAdjustmentAccount] = useState('')
  // 🆕 Diferidos/Cambiario
  const [defaultDeferredRevenueAccount, setDefaultDeferredRevenueAccount] = useState('')
  const [defaultDeferredExpenseAccount, setDefaultDeferredExpenseAccount] = useState('')
  const [exchangeGainLossAccount, setExchangeGainLossAccount] = useState('')
  const [unrealizedExchangeGainLossAccount, setUnrealizedExchangeGainLossAccount] = useState('')
  // 🆕 Depreciación
  const [accumulatedDepreciationAccount, setAccumulatedDepreciationAccount] = useState('')
  const [depreciationExpenseAccount, setDepreciationExpenseAccount] = useState('')
  const [disposalAccount, setDisposalAccount] = useState('')
  // 🆕 Descuentos
  const [defaultDiscountAccount, setDefaultDiscountAccount] = useState('')
  // 🆕 Centros de Costo
  const [costCenter, setCostCenter] = useState<ItemProps | null>(null)
  const [roundOffCostCenter, setRoundOffCostCenter] = useState<ItemProps | null>(null)
  const [depreciationCostCenter, setDepreciationCostCenter] = useState<ItemProps | null>(null)
  // 🆕 Inventario perpetuo
  const [enablePerpetualInventory, setEnablePerpetualInventory] = useState(false)

  useEffect(() => {
    if (cuentasData) {
      setDefaultReceivableAccount(cuentasData.defaultReceivableAccount ?? '')
      setDefaultPayableAccount(cuentasData.defaultPayableAccount ?? '')
      setDefaultIncomeAccount(cuentasData.defaultIncomeAccount ?? '')
      setDefaultExpenseAccount(cuentasData.defaultExpenseAccount ?? '')
      setDefaultBankAccount(cuentasData.defaultBankAccount ?? '')
      setWriteOffAccount(cuentasData.writeOffAccount ?? '')
      setRoundOffAccount(cuentasData.roundOffAccount ?? '')
      setDefaultCashAccount(cuentasData.defaultCashAccount ?? '')
      setDefaultInventoryAccount(cuentasData.defaultInventoryAccount ?? '')
      setStockReceivedButNotBilled(cuentasData.stockReceivedButNotBilled ?? '')
      setStockAdjustmentAccount(cuentasData.stockAdjustmentAccount ?? '')
      setDefaultDeferredRevenueAccount(cuentasData.defaultDeferredRevenueAccount ?? '')
      setDefaultDeferredExpenseAccount(cuentasData.defaultDeferredExpenseAccount ?? '')
      setExchangeGainLossAccount(cuentasData.exchangeGainLossAccount ?? '')
      setUnrealizedExchangeGainLossAccount(cuentasData.unrealizedExchangeGainLossAccount ?? '')
      setAccumulatedDepreciationAccount(cuentasData.accumulatedDepreciationAccount ?? '')
      setDepreciationExpenseAccount(cuentasData.depreciationExpenseAccount ?? '')
      setDisposalAccount(cuentasData.disposalAccount ?? '')
      setDefaultDiscountAccount(cuentasData.defaultDiscountAccount ?? '')
      setCostCenter(cuentasData.costCenter ?? null)
      setRoundOffCostCenter(cuentasData.roundOffCostCenter ?? null)
      setDepreciationCostCenter(cuentasData.depreciationCostCenter ?? null)
      setEnablePerpetualInventory(cuentasData.enablePerpetualInventory ?? false)
    }
  }, [cuentasData])

  const saveCuentasMutation = useMutation({
    mutationFn: (dto: CuentasEmpresa) => updateCuentasEmpresa(dto),
    onSuccess: () => {
      toast.success('Cuentas por defecto actualizadas')
      queryClient.invalidateQueries({ queryKey: ['cuentas-empresa'] })
    },
    onError: (err: { response?: { status?: number; data?: { message?: string } }; message?: string }) => {
      if (err?.response?.status === 400 && err.response.data?.message) {
        toast.error(err.response.data.message)
      } else {
        toast.error(err?.message ?? 'Error al guardar las cuentas')
      }
    },
  })

  function handleTogglePerpetualInventory(checked: boolean) {
    if (!checked && enablePerpetualInventory) {
      const confirmed = window.confirm(
        'Una vez que existan movimientos de inventario, no será posible desactivar el Inventario Perpetuo. ¿Deseas continuar?'
      )
      if (!confirmed) return
    }
    setEnablePerpetualInventory(checked)
  }

  function handleSaveCuentas() {
    // `|| null` (no `|| undefined`) en todos los campos: un campo vacío debe LIMPIARSE de verdad
    // en el servidor, no omitirse del body — `undefined` desaparece al serializar el JSON, así
    // que el backend nunca se entera de que el usuario lo vació y conserva el valor anterior.
    saveCuentasMutation.mutate({
      defaultReceivableAccount: defaultReceivableAccount || null,
      defaultPayableAccount: defaultPayableAccount || null,
      defaultIncomeAccount: defaultIncomeAccount || null,
      defaultExpenseAccount: defaultExpenseAccount || null,
      defaultBankAccount: defaultBankAccount || null,
      writeOffAccount: writeOffAccount || null,
      roundOffAccount: roundOffAccount || null,
      defaultCashAccount: defaultCashAccount || null,
      defaultInventoryAccount: defaultInventoryAccount || null,
      stockReceivedButNotBilled: stockReceivedButNotBilled || null,
      stockAdjustmentAccount: stockAdjustmentAccount || null,
      defaultDeferredRevenueAccount: defaultDeferredRevenueAccount || null,
      defaultDeferredExpenseAccount: defaultDeferredExpenseAccount || null,
      exchangeGainLossAccount: exchangeGainLossAccount || null,
      unrealizedExchangeGainLossAccount: unrealizedExchangeGainLossAccount || null,
      accumulatedDepreciationAccount: accumulatedDepreciationAccount || null,
      depreciationExpenseAccount: depreciationExpenseAccount || null,
      disposalAccount: disposalAccount || null,
      defaultDiscountAccount: defaultDiscountAccount || null,
      costCenter: costCenter || null,
      roundOffCostCenter: roundOffCostCenter || null,
      depreciationCostCenter: depreciationCostCenter || null,
      enablePerpetualInventory,
    })
  }

  // ── Completitud del perfil (KPI strip estilo dashboard) ────────────────────
  const fiscalFields = useMemo(
    () => [form.companyName, form.rnc, form.regimenFiscal, form.actividadEconomica, form.representanteLegal, form.cedulaRepresentante],
    [form]
  )
  const contactoFields = useMemo(
    () => [form.telefono, form.email, form.website, form.direccion],
    [form]
  )
  const operativaFields = useMemo(
    () => [form.itemCodeMode ?? 'manual', form.defaultWarehouse, form.transitWarehouse, form.defaultPriceTipo],
    [form]
  )
  const contableValues = useMemo(
    () => [
      defaultReceivableAccount, defaultPayableAccount, defaultIncomeAccount, defaultExpenseAccount,
      defaultBankAccount, writeOffAccount, roundOffAccount, defaultCashAccount, defaultInventoryAccount,
      stockReceivedButNotBilled, stockAdjustmentAccount, defaultDeferredRevenueAccount,
      defaultDeferredExpenseAccount, exchangeGainLossAccount, unrealizedExchangeGainLossAccount,
      accumulatedDepreciationAccount, depreciationExpenseAccount, disposalAccount, defaultDiscountAccount,
      costCenter?.name, roundOffCostCenter?.name, depreciationCostCenter?.name,
    ],
    [defaultReceivableAccount, defaultPayableAccount, defaultIncomeAccount, defaultExpenseAccount,
      defaultBankAccount, writeOffAccount, roundOffAccount, defaultCashAccount, defaultInventoryAccount,
      stockReceivedButNotBilled, stockAdjustmentAccount, defaultDeferredRevenueAccount,
      defaultDeferredExpenseAccount, exchangeGainLossAccount, unrealizedExchangeGainLossAccount,
      accumulatedDepreciationAccount, depreciationExpenseAccount, disposalAccount, defaultDiscountAccount,
      costCenter, roundOffCostCenter, depreciationCostCenter]
  )

  function pctOf(values: (unknown | undefined | null | string)[]) {
    const filled = values.filter((v) => v !== undefined && v !== null && v !== '').length
    return { filled, total: values.length, pct: Math.round((filled / values.length) * 100) }
  }

  const fiscal = pctOf(fiscalFields)
  const contacto = pctOf(contactoFields)
  const operativa = pctOf(operativaFields)
  const contable = pctOf(contableValues)
  const global = useMemo(() => {
    const filled = fiscal.filled + contacto.filled + operativa.filled + contable.filled
    const total = fiscal.total + contacto.total + operativa.total + contable.total
    return { filled, total, pct: Math.round((filled / total) * 100) }
  }, [fiscal, contacto, operativa, contable])

  const missingFiscal = useMemo(() => {
    const out: string[] = []
    if (!form.rnc) out.push('RNC')
    if (!form.regimenFiscal) out.push('Régimen fiscal')
    if (!form.actividadEconomica) out.push('Actividad económica')
    if (!form.representanteLegal) out.push('Representante legal')
    return out
  }, [form])
  const missingContacto = useMemo(() => {
    const out: string[] = []
    if (!form.telefono) out.push('Teléfono')
    if (!form.email) out.push('Email')
    if (!form.direccion) out.push('Dirección')
    return out
  }, [form])

  const isSaving = activeTab === 'general' ? saveMutation.isPending : saveCuentasMutation.isPending
  const regimenLabel = REGIMENES_FISCALES.find((r) => r.value === form.regimenFiscal)?.label ?? form.regimenFiscal

  function goKpi(target: TabKey, anchor: string) {
    setActiveTab(target)
    requestAnimationFrame(() => setTimeout(() => scrollTo(anchor), 60))
  }

  if (isLoading) {
    return (
      <div className="page-container empresa-page">
        <span className="skeleton-box" style={{ height: 32, width: 240, display: 'block' }} />
        <div className="empresa-kpis">
          {Array.from({ length: 4 }).map((_, i) => (
            <span key={i} className="skeleton-box" style={{ height: 96, display: 'block' }} />
          ))}
        </div>
        <div className="empresa-layout">
          <span className="skeleton-box" style={{ height: 420, display: 'block' }} />
          <span className="skeleton-box" style={{ height: 420, display: 'block' }} />
        </div>
      </div>
    )
  }

  return (
    <div className="page-container empresa-page">
      <input
        ref={logoFileInputRef}
        type="file"
        accept="image/png,image/jpeg,image/svg+xml,image/webp"
        style={{ display: 'none' }}
        onChange={(e) => { handleLogoFileSelected(e.target.files?.[0]); e.target.value = '' }}
      />

      <PageHeader
        title={
          <span className="empresa-title-row">
            <span><span className="page-title-dot" />Empresa</span>
            <span className="empresa-badges">
              {form.rnc && <span className="badge badge-neutral">RNC {form.rnc}</span>}
              {regimenLabel && <span className="badge badge-info">{regimenLabel}</span>}
              {global.pct === 100
                ? <span className="badge badge-success">Perfil completo</span>
                : <span className="badge badge-warning">Perfil {global.pct}%</span>}
            </span>
          </span>
        }
        description="Identidad fiscal, contacto, valores operativos y cuentas contables por defecto"
        overline="Configuración · General"
        action={
          <>
            <span className="empresa-save-hint">
              {activeTab === 'general' ? 'Se guardan datos y valores operativos' : 'Se guardan cuentas y centros de costo'}
            </span>
            <button
              className="btn btn-navy"
              onClick={() => (activeTab === 'general' ? handleSubmit() : handleSaveCuentas())}
              disabled={isSaving}
            >
              <Save size={16} />
              {isSaving ? 'Guardando…' : 'Guardar cambios'}
            </button>
          </>
        }
      />

      {/* ── KPI strip: misma línea visual que el dashboard ── */}
      <div className="empresa-kpis">
        <button type="button" className="empresa-kpi" style={{ '--i': 0 } as React.CSSProperties} onClick={() => goKpi('general', 'sec-fiscal')}>
          <div className="empresa-kpi-top">
            <span className="empresa-kpi-icon"><Landmark size={14} /></span>
            <span className="empresa-kpi-label">Identidad fiscal</span>
          </div>
          <div className="empresa-kpi-value">{fiscal.pct}<small>% · {fiscal.filled}/{fiscal.total}</small></div>
          <div className="empresa-progress"><span style={{ width: `${fiscal.pct}%` }} /></div>
          <div className="empresa-kpi-foot">{missingFiscal.length ? <>Falta: <strong>{missingFiscal.slice(0, 2).join(' · ')}</strong></> : 'Datos fiscales al día'}</div>
        </button>
        <button type="button" className="empresa-kpi" style={{ '--i': 1 } as React.CSSProperties} onClick={() => goKpi('general', 'sec-contacto')}>
          <div className="empresa-kpi-top">
            <span className="empresa-kpi-icon"><Phone size={14} /></span>
            <span className="empresa-kpi-label">Contacto</span>
          </div>
          <div className="empresa-kpi-value">{contacto.pct}<small>% · {contacto.filled}/{contacto.total}</small></div>
          <div className="empresa-progress"><span style={{ width: `${contacto.pct}%` }} /></div>
          <div className="empresa-kpi-foot">{missingContacto.length ? <>Falta: <strong>{missingContacto.slice(0, 2).join(' · ')}</strong></> : 'Contacto completo'}</div>
        </button>
        <button type="button" className="empresa-kpi" style={{ '--i': 2 } as React.CSSProperties} onClick={() => goKpi('general', 'sec-operativa')}>
          <div className="empresa-kpi-top">
            <span className="empresa-kpi-icon"><Settings2 size={14} /></span>
            <span className="empresa-kpi-label">Operativa</span>
          </div>
          <div className="empresa-kpi-value">{operativa.pct}<small>% · {operativa.filled}/{operativa.total}</small></div>
          <div className="empresa-progress"><span style={{ width: `${operativa.pct}%` }} /></div>
          <div className="empresa-kpi-foot">
            {(warehouses ?? []).length} {(warehouses ?? []).length === 1 ? 'almacén' : 'almacenes'} · Nivel {form.defaultPriceTipo ?? '—'}
          </div>
        </button>
        <button type="button" className="empresa-kpi" style={{ '--i': 3 } as React.CSSProperties} onClick={() => goKpi('cuentas', 'sec-contable')}>
          <div className="empresa-kpi-top">
            <span className="empresa-kpi-icon"><Vault size={14} /></span>
            <span className="empresa-kpi-label">Contabilidad</span>
          </div>
          <div className="empresa-kpi-value">{contable.pct}<small>% · {contable.filled}/{contable.total}</small></div>
          <div className="empresa-progress"><span style={{ width: `${contable.pct}%` }} /></div>
          <div className="empresa-kpi-foot">{enablePerpetualInventory ? 'Inventario perpetuo activo' : 'Sin inventario perpetuo'}</div>
        </button>
      </div>

      {/* ── Tabs en píldora (period-pills del dashboard) ── */}
      <div className="empresa-tabs" role="tablist" aria-label="Secciones de empresa">
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'general'}
          className="empresa-tab"
          data-active={activeTab === 'general' ? '' : undefined}
          onClick={() => setActiveTab('general')}
        >
          <Building2 size={14} />
          Perfil de empresa
          <span className="empresa-tab-count">{fiscal.filled + contacto.filled + operativa.filled}/{fiscal.total + contacto.total + operativa.total}</span>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'cuentas'}
          className="empresa-tab"
          data-active={activeTab === 'cuentas' ? '' : undefined}
          onClick={() => setActiveTab('cuentas')}
        >
          <Landmark size={14} />
          Cuentas por defecto
          <span className="empresa-tab-count">{contable.filled}/{contable.total}</span>
        </button>
      </div>

      {activeTab === 'general' ? (
        <div className="empresa-layout">
          {/* ── Columna identidad (sticky) ── */}
          <aside className="empresa-side">
            <div className="card empresa-identity">
              <div className="empresa-identity-hero">
                <p className="empresa-identity-eyebrow">Perfil de la compañía</p>
                <p className="empresa-identity-name">{form.companyName || data?.companyName || 'Mi Empresa'}</p>
                <p className="empresa-identity-rnc">{form.rnc ? `RNC ${form.rnc}` : 'Sin RNC registrado'}</p>
              </div>
              <div className="empresa-logo-wrap">
                <div
                  className="empresa-logo-box"
                  onClick={() => logoFileInputRef.current?.click()}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') logoFileInputRef.current?.click() }}
                  title="Subir o cambiar logo"
                >
                  {uploadLogoMutation.isPending ? (
                    <Loader2 size={22} className="spin" />
                  ) : form.logoUrl ? (
                    <img src={form.logoUrl} alt="Logo de la empresa" />
                  ) : (
                    <span className="empresa-logo-empty">
                      <Image size={24} style={{ color: 'var(--teal-accent)' }} />
                      Sin logo — clic para subir
                    </span>
                  )}
                </div>
              </div>
              <div className="empresa-identity-body">
                <div className="empresa-identity-meta">
                  <div className="empresa-meta-row"><MapPin size={13} /><span>{form.direccion || 'Sin dirección registrada'}</span></div>
                  <div className="empresa-meta-row"><Phone size={13} /><span>{form.telefono || 'Sin teléfono'} · {form.email || 'Sin email'}</span></div>
                  <div className="empresa-meta-row"><ReceiptText size={13} /><span>{regimenLabel || 'Sin régimen'} · {form.actividadEconomica || 'Sin actividad'}</span></div>
                </div>
                <div className="empresa-identity-actions">
                  <button type="button" className="btn btn-secondary btn-size-sm" onClick={() => logoFileInputRef.current?.click()} disabled={uploadLogoMutation.isPending}>
                    <Upload size={14} />
                    {uploadLogoMutation.isPending ? 'Subiendo…' : form.logoUrl ? 'Cambiar logo' : 'Subir logo'}
                  </button>
                  <button type="button" className="btn btn-ghost btn-size-sm" onClick={() => scrollTo('sec-fiscal')}>Editar datos</button>
                </div>
                <p className="ff-hint">El logo se imprime en facturas, cotizaciones, pedidos, compras y notas de crédito/débito. PNG, JPG, SVG o WEBP — máx. 2MB.</p>
              </div>
            </div>

            <div className="card">
              <div className="card-header"><span className="card-title">Completitud del perfil</span><span className="badge badge-neutral">{global.pct}%</span></div>
              <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div className="empresa-complete-big">
                  <span className="empresa-complete-pct">{global.filled}/{global.total}</span>
                  <span className="empresa-complete-label">campos configurados</span>
                </div>
                <div className="empresa-progress"><span style={{ width: `${global.pct}%` }} /></div>
                <div className="empresa-checklist">
                  <span className="empresa-check" data-done={fiscal.pct === 100 ? '' : undefined}>
                    {fiscal.pct === 100 ? <CheckCircle2 size={14} /> : <Circle size={14} />}
                    Identidad fiscal {fiscal.filled}/{fiscal.total}
                  </span>
                  <span className="empresa-check" data-done={contacto.pct === 100 ? '' : undefined}>
                    {contacto.pct === 100 ? <CheckCircle2 size={14} /> : <Circle size={14} />}
                    Contacto {contacto.filled}/{contacto.total}
                  </span>
                  <span className="empresa-check" data-done={operativa.pct === 100 ? '' : undefined}>
                    {operativa.pct === 100 ? <CheckCircle2 size={14} /> : <Circle size={14} />}
                    Operativa {operativa.filled}/{operativa.total}
                  </span>
                  <span className="empresa-check" data-done={contable.pct === 100 ? '' : undefined}>
                    {contable.pct === 100 ? <CheckCircle2 size={14} /> : <Circle size={14} />}
                    Contabilidad {contable.filled}/{contable.total}
                  </span>
                </div>
              </div>
            </div>

            <div className="card">
              <div className="card-header"><span className="card-title">Configuración relacionada</span></div>
              <div className="card-body" style={{ paddingTop: 8, paddingBottom: 8 }}>
                <div className="empresa-links">
                  <Link to="/config/sucursales" className="empresa-link">
                    <span className="empresa-link-icon"><MapPin size={14} /></span>
                    <span className="empresa-link-main"><span className="empresa-link-label">Sucursales</span><br /><span className="empresa-link-sub">Sedes y almacenes asignados</span></span>
                    <ChevronRight size={14} />
                  </Link>
                  <Link to="/config/ncf" className="empresa-link">
                    <span className="empresa-link-icon"><FileText size={14} /></span>
                    <span className="empresa-link-main"><span className="empresa-link-label">Secuencias NCF</span><br /><span className="empresa-link-sub">Numeración fiscal vigente</span></span>
                    <ChevronRight size={14} />
                  </Link>
                  <Link to="/config/ecf" className="empresa-link">
                    <span className="empresa-link-icon"><ShieldCheck size={14} /></span>
                    <span className="empresa-link-main"><span className="empresa-link-label">Facturación electrónica</span><br /><span className="empresa-link-sub">Certificación y contingencia</span></span>
                    <ChevronRight size={14} />
                  </Link>
                  <Link to="/config/plantillas-facturas" className="empresa-link">
                    <span className="empresa-link-icon"><LayoutTemplate size={14} /></span>
                    <span className="empresa-link-main"><span className="empresa-link-label">Plantillas PDF</span><br /><span className="empresa-link-sub">Donde se ve este logo</span></span>
                    <ChevronRight size={14} />
                  </Link>
                  <Link to="/config/cajas" className="empresa-link">
                    <span className="empresa-link-icon"><Wallet size={14} /></span>
                    <span className="empresa-link-main"><span className="empresa-link-label">Cajas</span><br /><span className="empresa-link-sub">Puntos de cobro por sucursal</span></span>
                    <ChevronRight size={14} />
                  </Link>
                </div>
              </div>
            </div>
          </aside>

          {/* ── Columna de formularios ── */}
          <form className="empresa-main" onSubmit={handleSubmit} id="sec-fiscal">
            <div className="card">
              <div className="card-header navy-card-header">
                <span className="card-title"><Building2 size={14} style={{ marginRight: 8, verticalAlign: -2 }} />Datos fiscales</span>
                <span className="navy-header-hint">{fiscal.filled}/{fiscal.total} completos</span>
              </div>
              <div className="card-body">
                <div className="ff-section-divider" style={{ marginBottom: 14 }}>Información fiscal</div>
                <div className="empresa-section-grid">
                  <div className="ff-wrap">
                    <label className="ff-label">
                      Nombre de la Empresa
                      <FieldTooltip>El nombre se toma del registro de tu empresa y no se edita desde esta pantalla.</FieldTooltip>
                    </label>
                    <input className="ff-input" value={form.companyName ?? ''} disabled placeholder="Mi Empresa SRL" />
                  </div>
                  <div className="ff-wrap">
                    <label className="ff-label">RNC</label>
                    <input className="ff-input" value={form.rnc ?? ''} onChange={(e) => set('rnc', e.target.value)} placeholder="000000000" />
                  </div>
                  <div className="ff-wrap">
                    <label className="ff-label">Régimen Fiscal</label>
                    <Select
                      value={form.regimenFiscal ?? ''}
                      onValueChange={(val) => set('regimenFiscal', val as Empresa['regimenFiscal'])}
                      placeholder="Seleccionar régimen"
                    >
                      <SelectItem value="">Seleccionar régimen</SelectItem>
                      {REGIMENES_FISCALES.map((r) => (
                        <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                      ))}
                    </Select>
                  </div>
                  <div className="ff-wrap">
                    <label className="ff-label">Actividad Económica</label>
                    <input className="ff-input" value={form.actividadEconomica ?? ''} onChange={(e) => set('actividadEconomica', e.target.value)} placeholder="Comercio al por mayor" />
                  </div>
                  <div className="ff-wrap">
                    <label className="ff-label">Representante Legal</label>
                    <input className="ff-input" value={form.representanteLegal ?? ''} onChange={(e) => set('representanteLegal', e.target.value)} placeholder="Nombre y apellido" />
                  </div>
                  <div className="ff-wrap">
                    <label className="ff-label">Cédula del Representante</label>
                    <input className="ff-input" value={form.cedulaRepresentante ?? ''} onChange={(e) => set('cedulaRepresentante', e.target.value)} placeholder="000-0000000-0" />
                  </div>
                </div>
              </div>
            </div>

            <div className="card" id="sec-contacto">
              <div className="card-header navy-card-header">
                <span className="card-title"><Phone size={14} style={{ marginRight: 8, verticalAlign: -2 }} />Contacto</span>
                <span className="navy-header-hint">{contacto.filled}/{contacto.total} completos</span>
              </div>
              <div className="card-body">
                <div className="empresa-section-grid">
                  <div className="ff-wrap">
                    <label className="ff-label">Teléfono</label>
                    <input className="ff-input" value={form.telefono ?? ''} onChange={(e) => set('telefono', e.target.value)} placeholder="(809) 000-0000" />
                  </div>
                  <div className="ff-wrap">
                    <label className="ff-label">Email</label>
                    <input type="email" className="ff-input" value={form.email ?? ''} onChange={(e) => set('email', e.target.value)} placeholder="info@empresa.com" />
                  </div>
                  <div className="ff-wrap">
                    <label className="ff-label">Sitio Web</label>
                    <input className="ff-input" value={form.website ?? ''} onChange={(e) => set('website', e.target.value)} placeholder="https://empresa.com" />
                  </div>
                  <div className="ff-wrap">
                    <label className="ff-label">Dirección</label>
                    <input className="ff-input" value={form.direccion ?? ''} onChange={(e) => set('direccion', e.target.value)} placeholder="Calle Principal #1, Santo Domingo" />
                  </div>
                </div>
              </div>
            </div>

            <div className="card" id="sec-operativa">
              <div className="card-header navy-card-header">
                <span className="card-title"><Settings2 size={14} style={{ marginRight: 8, verticalAlign: -2 }} />Valores operativos</span>
                <span className="navy-header-hint">Defaults de documentos e inventario</span>
              </div>
              <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div className="empresa-section-grid">
                  <div className="ff-wrap">
                    <label className="ff-label">
                      Modo de código de artículo
                      <FieldTooltip>Define cómo se asigna el código a nuevos artículos</FieldTooltip>
                    </label>
                    <Select
                      value={form.itemCodeMode ?? 'manual'}
                      onValueChange={(val) => set('itemCodeMode', val as 'manual' | 'auto' | 'prefix_auto')}
                    >
                      <SelectItem value="manual">Manual</SelectItem>
                      <SelectItem value="auto">Automático</SelectItem>
                      <SelectItem value="prefix_auto">Por prefijo de categoría</SelectItem>
                    </Select>
                    {itemCodeWarning && (
                      <div className="inline-alert inline-alert-warn" style={{ marginTop: 8 }}>
                        <TriangleAlert size={14} />
                        <span>Este cambio es irreversible. Los artículos existentes mantienen su código; los nuevos se generarán automáticamente.</span>
                        <button type="button" className="btn btn-ghost btn-size-xs" style={{ marginLeft: 'auto' }} onClick={() => setItemCodeWarning(false)}>Entendido</button>
                      </div>
                    )}
                  </div>
                  <div className="ff-wrap">
                    <label className="ff-label">
                      Nivel de precio por defecto
                      <FieldTooltip>Nivel de precio sugerido para nuevos documentos</FieldTooltip>
                    </label>
                    <Select
                      value={form.defaultPriceTipo ?? ''}
                      onValueChange={(val) => set('defaultPriceTipo', (val || undefined) as 'A' | 'B' | 'C' | undefined)}
                      placeholder="Sin predeterminado"
                    >
                      <SelectItem value="">Sin predeterminado</SelectItem>
                      <SelectItem value="A">A — Minorista</SelectItem>
                      <SelectItem value="B">B — Medio mayoreo</SelectItem>
                      <SelectItem value="C">C — Mayorista</SelectItem>
                    </Select>
                  </div>
                  <div className="ff-wrap">
                    <label className="ff-label">
                      Almacén por defecto
                      <FieldTooltip>Se usará al crear documentos si el usuario no tiene almacén asignado</FieldTooltip>
                    </label>
                    <SearchSelect
                      value={form.defaultWarehouse ?? ''}
                      onChange={(val) => set('defaultWarehouse', val || undefined)}
                      options={warehouseOptions}
                      onSearch={setWarehouseSearch}
                      selectedLabel={(warehouses ?? []).find((w) => w.id === form.defaultWarehouse)?.name ?? ''}
                      placeholder="Sin predeterminado"
                    />
                  </div>
                  <div className="ff-wrap">
                    <label className="ff-label">Almacén de Tránsito</label>
                    <SearchSelect
                      value={form.transitWarehouse ?? ''}
                      onChange={(val) => set('transitWarehouse', val || undefined)}
                      options={transitWarehouseOptions}
                      onSearch={setTransitWarehouseSearch}
                      selectedLabel={transitWarehouses.find((w) => w.id === form.transitWarehouse)?.name ?? ''}
                      placeholder="Sin configurar"
                    />
                    {transitWarehouses.length === 0 ? (
                      <p className="ff-hint" style={{ color: 'var(--color-warning)' }}>
                        No hay ningún almacén de tipo "Tránsito" todavía. Crea uno primero en{' '}
                        <Link to="/config/almacenes">Configuración → Almacenes</Link> con tipo "Transit".
                      </p>
                    ) : (
                      <p className="ff-hint">Requerido para poder crear transferencias entre almacenes/sucursales.</p>
                    )}
                  </div>
                </div>
              </div>
            </div>

            <div className="empresa-footbar">
              <span className="empresa-footbar-hint">Los cambios aplican a los próximos documentos — no reescriben nada ya emitido.</span>
              <button type="submit" className="btn btn-navy" disabled={saveMutation.isPending}>
                <Save size={16} />
                {saveMutation.isPending ? 'Guardando…' : 'Guardar cambios'}
              </button>
            </div>
          </form>
        </div>
      ) : (
        <div className="empresa-layout" id="sec-contable">
          {/* ── Resumen lateral contable ── */}
          <aside className="empresa-side">
            <div className="card">
              <div className="card-header"><span className="card-title">Mapa contable</span><span className="badge badge-neutral">{contable.filled}/{contable.total}</span></div>
              <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div className="empresa-progress"><span style={{ width: `${contable.pct}%` }} /></div>
                <p className="ff-hint">Estas cuentas son los defaults que usa el sistema cuando el documento o el artículo no trae una propia (facturas, cobros, pagos, inventario y depreciación).</p>
                <div className="empresa-links">
                  <button type="button" className="empresa-link" onClick={() => scrollTo('cta-cobro')} style={{ background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', width: '100%', padding: '10px 0' }}>
                    <span className="empresa-link-icon"><ReceiptText size={14} /></span>
                    <span className="empresa-link-main"><span className="empresa-link-label">Cobro y pago</span><br /><span className="empresa-link-sub">AR · AP · banco · caja</span></span>
                    <ChevronRight size={14} />
                  </button>
                  <button type="button" className="empresa-link" onClick={() => scrollTo('cta-resultados')} style={{ background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', width: '100%', padding: '10px 0' }}>
                    <span className="empresa-link-icon"><TrendingUp size={14} /></span>
                    <span className="empresa-link-main"><span className="empresa-link-label">Resultados</span><br /><span className="empresa-link-sub">Ingresos · gastos · descuentos</span></span>
                    <ChevronRight size={14} />
                  </button>
                  <button type="button" className="empresa-link" onClick={() => scrollTo('cta-inventario')} style={{ background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', width: '100%', padding: '10px 0' }}>
                    <span className="empresa-link-icon"><Boxes size={14} /></span>
                    <span className="empresa-link-main"><span className="empresa-link-label">Inventario</span><br /><span className="empresa-link-sub">Existencias y ajustes</span></span>
                    <ChevronRight size={14} />
                  </button>
                  <button type="button" className="empresa-link" onClick={() => scrollTo('cta-diferidos')} style={{ background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', width: '100%', padding: '10px 0' }}>
                    <span className="empresa-link-icon"><CalendarClock size={14} /></span>
                    <span className="empresa-link-main"><span className="empresa-link-label">Diferidos y cambiario</span><br /><span className="empresa-link-sub">4 cuentas</span></span>
                    <ChevronRight size={14} />
                  </button>
                  <button type="button" className="empresa-link" onClick={() => scrollTo('cta-activos')} style={{ background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', width: '100%', padding: '10px 0' }}>
                    <span className="empresa-link-icon"><Tractor size={14} /></span>
                    <span className="empresa-link-main"><span className="empresa-link-label">Activos fijos</span><br /><span className="empresa-link-sub">Depreciación y bajas</span></span>
                    <ChevronRight size={14} />
                  </button>
                  <button type="button" className="empresa-link" onClick={() => scrollTo('cta-costos')} style={{ background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', width: '100%', padding: '10px 0' }}>
                    <span className="empresa-link-icon"><PieChart size={14} /></span>
                    <span className="empresa-link-main"><span className="empresa-link-label">Centros de costo</span><br /><span className="empresa-link-sub">3 centros por defecto</span></span>
                    <ChevronRight size={14} />
                  </button>
                </div>
              </div>
            </div>

            <div className="card">
              <div className="card-header"><span className="card-title">Inventario perpetuo</span>{enablePerpetualInventory ? <span className="badge badge-success">Activo</span> : <span className="badge badge-neutral">Apagado</span>}</div>
              <div className="card-body">
                <label className="empresa-toggle-row">
                  <span className="ff-toggle">
                    <input type="checkbox" checked={enablePerpetualInventory} onChange={(e) => handleTogglePerpetualInventory(e.target.checked)} />
                    <span className="ff-toggle-track"><span className="ff-toggle-thumb" /></span>
                  </span>
                  Habilitar inventario perpetuo
                </label>
                <p className="ff-hint" style={{ marginTop: 8 }}>Una vez que existan movimientos, no podrá desactivarse.</p>
              </div>
            </div>
          </aside>

          {/* ── Grupos contables ── */}
          <div className="empresa-main">
            {cuentasLoading ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {Array.from({ length: 6 }).map((_, i) => (
                  <span key={i} className="skeleton-box" style={{ height: 160, display: 'block' }} />
                ))}
              </div>
            ) : (
              <>
                <div className="card" id="cta-cobro">
                  <div className="card-header navy-card-header">
                    <span className="card-title"><ReceiptText size={14} style={{ marginRight: 8, verticalAlign: -2 }} />Cobro y pago</span>
                    <span className="navy-header-hint">AR · AP · tesorería</span>
                  </div>
                  <div className="card-body">
                    <p className="empresa-group-desc">Defaults para facturas de clientes y proveedores, y para cobros/pagos sin cuenta específica.</p>
                    <div className="empresa-accounts-grid">
                      <CuentaField id="defaultReceivableAccount" label="Cuentas por Cobrar (AR)" hint="Para facturas emitidas a clientes" value={defaultReceivableAccount} onChange={setDefaultReceivableAccount} />
                      <CuentaField id="defaultPayableAccount" label="Cuentas por Pagar (AP)" hint="Para facturas de proveedores" value={defaultPayableAccount} onChange={setDefaultPayableAccount} />
                      <CuentaField id="defaultBankAccount" label="Banco Principal" hint="Para cobros y pagos sin cuenta específica" value={defaultBankAccount} onChange={setDefaultBankAccount} />
                      <CuentaField id="defaultCashAccount" label="Caja por Defecto" value={defaultCashAccount} onChange={setDefaultCashAccount} />
                    </div>
                  </div>
                </div>

                <div className="card" id="cta-resultados">
                  <div className="card-header navy-card-header">
                    <span className="card-title"><TrendingUp size={14} style={{ marginRight: 8, verticalAlign: -2 }} />Resultados</span>
                    <span className="navy-header-hint">PyG por defecto</span>
                  </div>
                  <div className="card-body">
                    <p className="empresa-group-desc">Se usan cuando el artículo no trae su propia cuenta de ingreso, gasto o descuento.</p>
                    <div className="empresa-accounts-grid">
                      <CuentaField id="defaultIncomeAccount" label="Ingresos por Defecto" hint="Si el artículo no tiene cuenta de ingreso" value={defaultIncomeAccount} onChange={setDefaultIncomeAccount} rootType="Income" />
                      <CuentaField id="defaultExpenseAccount" label="Gastos por Defecto" hint="Si el artículo no tiene cuenta de gasto" value={defaultExpenseAccount} onChange={setDefaultExpenseAccount} rootType="Expense" />
                      <CuentaField id="defaultDiscountAccount" label="Cuenta de Descuento" value={defaultDiscountAccount} onChange={setDefaultDiscountAccount} />
                      <CuentaField id="writeOffAccount" label="Cuenta de Diferencias (write-off)" hint="Ajustes de diferencias al cerrar facturas" value={writeOffAccount} onChange={setWriteOffAccount} />
                      <CuentaField id="roundOffAccount" label="Cuenta de Redondeos" hint="Diferencias de centavos" value={roundOffAccount} onChange={setRoundOffAccount} />
                    </div>
                  </div>
                </div>

                <div className="card" id="cta-inventario">
                  <div className="card-header navy-card-header">
                    <span className="card-title"><Boxes size={14} style={{ marginRight: 8, verticalAlign: -2 }} />Inventario</span>
                    <span className="navy-header-hint">Existencias y ajustes</span>
                  </div>
                  <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                    <div className="empresa-accounts-grid">
                      <CuentaField id="defaultInventoryAccount" label="Inventario por Defecto" value={defaultInventoryAccount} onChange={setDefaultInventoryAccount} />
                      <CuentaField id="stockReceivedButNotBilled" label="Recibido No Facturado" hint="Mercancía recibida pendiente de factura del proveedor" value={stockReceivedButNotBilled} onChange={setStockReceivedButNotBilled} />
                      <CuentaField id="stockAdjustmentAccount" label="Ajuste de Inventario" value={stockAdjustmentAccount} onChange={setStockAdjustmentAccount} />
                    </div>
                    <div className="empresa-highlight">
                      <Boxes size={16} />
                      <div style={{ flex: 1 }}>
                        <label className="empresa-toggle-row">
                          <span className="ff-toggle">
                            <input type="checkbox" checked={enablePerpetualInventory} onChange={(e) => handleTogglePerpetualInventory(e.target.checked)} />
                            <span className="ff-toggle-track"><span className="ff-toggle-thumb" /></span>
                          </span>
                          Habilitar Inventario Perpetuo
                          <FieldTooltip>Advertencia: una vez que existan movimientos de inventario, no será posible desactivar esta opción.</FieldTooltip>
                        </label>
                        <p className="empresa-highlight-sub">Cada movimiento de stock genera su asiento contable en tiempo real. Recomendado si valuás inventario con el sistema.</p>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="card" id="cta-diferidos">
                  <div className="card-header navy-card-header">
                    <span className="card-title"><CalendarClock size={14} style={{ marginRight: 8, verticalAlign: -2 }} />Diferidos y cambiario</span>
                    <span className="navy-header-hint">Devengo y moneda</span>
                  </div>
                  <div className="card-body">
                    <div className="empresa-accounts-grid">
                      <CuentaField id="defaultDeferredRevenueAccount" label="Ingresos Diferidos" value={defaultDeferredRevenueAccount} onChange={setDefaultDeferredRevenueAccount} />
                      <CuentaField id="defaultDeferredExpenseAccount" label="Gastos Diferidos" value={defaultDeferredExpenseAccount} onChange={setDefaultDeferredExpenseAccount} />
                      <CuentaField id="exchangeGainLossAccount" label="Ganancia/Pérdida Cambiaria" value={exchangeGainLossAccount} onChange={setExchangeGainLossAccount} />
                      <CuentaField id="unrealizedExchangeGainLossAccount" label="Cambiaria No Realizada" value={unrealizedExchangeGainLossAccount} onChange={setUnrealizedExchangeGainLossAccount} />
                    </div>
                  </div>
                </div>

                <div className="card" id="cta-activos">
                  <div className="card-header navy-card-header">
                    <span className="card-title"><Tractor size={14} style={{ marginRight: 8, verticalAlign: -2 }} />Activos fijos</span>
                    <span className="navy-header-hint">Depreciación</span>
                  </div>
                  <div className="card-body">
                    <div className="empresa-accounts-grid">
                      <CuentaField id="accumulatedDepreciationAccount" label="Depreciación Acumulada" value={accumulatedDepreciationAccount} onChange={setAccumulatedDepreciationAccount} />
                      <CuentaField id="depreciationExpenseAccount" label="Gasto de Depreciación" value={depreciationExpenseAccount} onChange={setDepreciationExpenseAccount} />
                      <CuentaField id="disposalAccount" label="Baja de Activos" value={disposalAccount} onChange={setDisposalAccount} />
                    </div>
                  </div>
                </div>

                <div className="card" id="cta-costos">
                  <div className="card-header navy-card-header">
                    <span className="card-title"><PieChart size={14} style={{ marginRight: 8, verticalAlign: -2 }} />Centros de costo</span>
                    <span className="navy-header-hint">Dimensiones por defecto</span>
                  </div>
                  <div className="card-body">
                    <div className="empresa-section-grid-3 empresa-section-grid">
                      <div className="ff-wrap">
                        <label className="ff-label" htmlFor="costCenter">Centro de Costo por Defecto</label>
                        <CostCenterSelect id="costCenter" value={costCenter} onChange={setCostCenter} placeholder="Buscar centro de costo…" />
                      </div>
                      <div className="ff-wrap">
                        <label className="ff-label" htmlFor="roundOffCostCenter">Centro de Costo de Redondeos</label>
                        <CostCenterSelect id="roundOffCostCenter" value={roundOffCostCenter} onChange={setRoundOffCostCenter} placeholder="Buscar centro de costo…" />
                      </div>
                      <div className="ff-wrap">
                        <label className="ff-label" htmlFor="depreciationCostCenter">Centro de Costo de Depreciación</label>
                        <CostCenterSelect id="depreciationCostCenter" value={depreciationCostCenter} onChange={setDepreciationCostCenter} placeholder="Buscar centro de costo…" />
                      </div>
                    </div>
                  </div>
                </div>

                <div className="inline-alert inline-alert-info">
                  <BadgePercent size={15} />
                  <span>Vaciar un campo y guardar <strong>limpia</strong> ese default en el servidor — no lo deja con el valor anterior.</span>
                </div>
              </>
            )}

            <div className="empresa-footbar">
              <span className="empresa-footbar-hint">{contable.filled}/{contable.total} cuentas configuradas · los vacíos usan el fallback del documento.</span>
              <button className="btn btn-navy" onClick={handleSaveCuentas} disabled={saveCuentasMutation.isPending}>
                <Save size={16} />
                {saveCuentasMutation.isPending ? 'Guardando…' : 'Guardar cuentas'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
