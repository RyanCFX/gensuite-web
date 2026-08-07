// Sección de uso poco frecuente: ajustes avanzados por módulo (Cuentas/Inventario/Ventas/Compras).
// Cada tab es un singleton GET+PUT independiente (no hay lista/CRUD aquí).
import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  getAccountsSettings,
  updateAccountsSettings,
  getStockSettings,
  updateStockSettings,
  getSellingSettings,
  updateSellingSettings,
  getBuyingSettings,
  updateBuyingSettings,
} from '@/shared/api/config'
import type { AccountsSettings, StockSettings, SellingSettings, BuyingSettings } from '@/shared/api/types'
import { PageHeader } from '@/components/shared/PageHeader'
import { Save, Settings2 } from 'lucide-react'

type TabKey = 'cuentas' | 'inventario' | 'ventas' | 'compras'

export default function AjustesAvanzadosPage() {
  const [activeTab, setActiveTab] = useState<TabKey>('cuentas')

  return (
    <div className="page-container">
      <PageHeader
        title="Ajustes Avanzados"
        description="Configuraciones globales poco frecuentes por módulo"
      />

      <div className="tabs-bar" style={{ marginBottom: 20 }}>
        <button
          type="button"
          className={`tab-btn${activeTab === 'cuentas' ? ' on' : ''}`}
          onClick={() => setActiveTab('cuentas')}
        >
          Cuentas
        </button>
        <button
          type="button"
          className={`tab-btn${activeTab === 'inventario' ? ' on' : ''}`}
          onClick={() => setActiveTab('inventario')}
        >
          Inventario
        </button>
        <button
          type="button"
          className={`tab-btn${activeTab === 'ventas' ? ' on' : ''}`}
          onClick={() => setActiveTab('ventas')}
        >
          Ventas
        </button>
        <button
          type="button"
          className={`tab-btn${activeTab === 'compras' ? ' on' : ''}`}
          onClick={() => setActiveTab('compras')}
        >
          Compras
        </button>
      </div>

      {activeTab === 'cuentas' && <CuentasTab />}
      {activeTab === 'inventario' && <InventarioTab />}
      {activeTab === 'ventas' && <VentasTab />}
      {activeTab === 'compras' && <ComprasTab />}
    </div>
  )
}

// ─── Cuentas ───────────────────────────────────────────────────────────────
function CuentasTab() {
  const queryClient = useQueryClient()
  const { data, isLoading } = useQuery({
    queryKey: ['accounts-settings'],
    queryFn: getAccountsSettings,
  })

  const { register, handleSubmit, reset } = useForm<AccountsSettings>({
    defaultValues: {},
  })

  useEffect(() => {
    if (data) reset(data)
  }, [data, reset])

  const saveMutation = useMutation({
    mutationFn: (dto: Partial<AccountsSettings>) => updateAccountsSettings(dto),
    onSuccess: () => {
      toast.success('Ajustes de Cuentas actualizados')
      queryClient.invalidateQueries({ queryKey: ['accounts-settings'] })
    },
    onError: (err: any) => toast.error(err?.message || 'Error al guardar los ajustes de Cuentas'),
  })

  function onSubmit(values: AccountsSettings) {
    // deleteLinkedLedgerEntries nunca se envía como true: el backend lo rechaza siempre.
    const { deleteLinkedLedgerEntries: _omit, ...rest } = values
    saveMutation.mutate(rest)
  }

  if (isLoading) {
    return <div className="skeleton-box" style={{ height: 200, maxWidth: 720 }} />
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} style={{ maxWidth: 720, display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div className="card">
        <div className="card-header">
          <span className="card-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Settings2 size={16} />
            Ajustes de Cuentas
          </span>
        </div>
        <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="ff-wrap">
            <label className="ff-label" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input type="checkbox" className="ff-check" {...register('enableAccountingDimensions')} />
              Habilitar Dimensiones Contables
            </label>
          </div>

          <div className="ff-wrap">
            <label className="ff-label" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input type="checkbox" className="ff-check" {...register('enableImmutableLedger')} />
              Habilitar Libro Mayor Inmutable
            </label>
            <p className="ff-hint">Impide modificar asientos contables ya registrados</p>
          </div>

          <div className="ff-wrap">
            <label className="ff-label">Rango de Antigüedad por Defecto</label>
            <input className="ff-input" {...register('defaultAgeingRange')} placeholder="30, 60, 90" />
          </div>

          <div className="ff-wrap">
            <label className="ff-label">Controlador de Crédito</label>
            <input className="ff-input" {...register('creditController')} placeholder="Usuario responsable" />
          </div>

          <div className="ff-wrap">
            <label className="ff-label">Rol Autorizado a Sobrefacturar</label>
            <input className="ff-input" {...register('roleAllowedToOverBill')} placeholder="Rol del sistema" />
          </div>

          <div className="ff-wrap">
            <label className="ff-label" style={{ display: 'flex', alignItems: 'center', gap: 8, opacity: 0.7 }}>
              <input type="checkbox" className="ff-check" checked={false} disabled readOnly />
              Eliminar Asientos de Libro Mayor Vinculados
            </label>
            <div className="inline-alert inline-alert-warn" style={{ marginTop: 4 }}>
              ⚠️ Este campo no puede activarse. El backend rechaza siempre este valor en verdadero; se mantiene deshabilitado.
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
    </form>
  )
}

// ─── Inventario ────────────────────────────────────────────────────────────
function InventarioTab() {
  const queryClient = useQueryClient()
  const { data, isLoading } = useQuery({
    queryKey: ['stock-settings'],
    queryFn: getStockSettings,
  })

  const { register, handleSubmit, reset } = useForm<StockSettings>({
    defaultValues: {},
  })

  useEffect(() => {
    if (data) reset(data)
  }, [data, reset])

  const saveMutation = useMutation({
    mutationFn: (dto: Partial<StockSettings>) => updateStockSettings(dto),
    onSuccess: () => {
      toast.success('Ajustes de Inventario actualizados')
      queryClient.invalidateQueries({ queryKey: ['stock-settings'] })
    },
    onError: (err: any) => {
      // valuationMethod puede rechazarse con 400 si ya existen movimientos de inventario (Stock Ledger Entry).
      // No hay forma de saberlo de antemano desde el frontend, por lo que se informa vía toast.
      toast.error(err?.message || 'Error al guardar los ajustes de Inventario. Es posible que el método de valuación no pueda cambiarse porque ya existen movimientos de inventario.')
    },
  })

  function onSubmit(values: StockSettings) {
    saveMutation.mutate(values)
  }

  if (isLoading) {
    return <div className="skeleton-box" style={{ height: 200, maxWidth: 720 }} />
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} style={{ maxWidth: 720, display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div className="card">
        <div className="card-header">
          <span className="card-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Settings2 size={16} />
            Ajustes de Inventario
          </span>
        </div>
        <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="ff-wrap">
            <label className="ff-label">Método de Valuación</label>
            <select className="ff-select" {...register('valuationMethod')}>
              <option value="">Sin definir</option>
              <option value="FIFO">FIFO</option>
              <option value="Moving Average">Promedio Móvil</option>
              <option value="LIFO">LIFO</option>
            </select>
            <p className="ff-hint">
              Este campo puede ser rechazado por el servidor si ya existen movimientos de inventario (Stock Ledger Entry)
              registrados para artículos afectados. No es posible saberlo de antemano; si ocurre, verás un mensaje de error al guardar.
            </p>
          </div>

          <div className="ff-wrap">
            <label className="ff-label">Almacén por Defecto</label>
            <input className="ff-input" {...register('defaultWarehouse')} placeholder="Nombre del almacén" />
          </div>

          <div className="ff-wrap">
            <label className="ff-label" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input type="checkbox" className="ff-check" {...register('allowNegativeStock')} />
              Permitir Stock Negativo
            </label>
          </div>

          <div className="ff-wrap">
            <label className="ff-label" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input type="checkbox" className="ff-check" {...register('enableStockReservation')} />
              Habilitar Reserva de Stock
            </label>
          </div>

          <div className="ff-wrap">
            <label className="ff-label" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input type="checkbox" className="ff-check" {...register('useSerialBatchFields')} />
              Usar campos de Serie/Lote en los documentos
            </label>
            <p className="ff-hint">
              Cuando está activo, los documentos (facturas, pedidos, compras, transferencias) muestran los campos de Número de
              Serie y Lote directamente en la fila del artículo, en lugar del diálogo emergente de captura.
            </p>
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <button type="submit" className="btn btn-primary" disabled={saveMutation.isPending}>
          <Save size={16} />
          {saveMutation.isPending ? 'Guardando…' : 'Guardar Cambios'}
        </button>
      </div>
    </form>
  )
}

// ─── Ventas ────────────────────────────────────────────────────────────────
function VentasTab() {
  const queryClient = useQueryClient()
  const { data, isLoading } = useQuery({
    queryKey: ['selling-settings'],
    queryFn: getSellingSettings,
  })

  const { register, handleSubmit, reset } = useForm<SellingSettings>({
    defaultValues: {},
  })

  useEffect(() => {
    if (data) reset(data)
  }, [data, reset])

  const saveMutation = useMutation({
    mutationFn: (dto: Partial<SellingSettings>) => updateSellingSettings(dto),
    onSuccess: () => {
      toast.success('Ajustes de Ventas actualizados')
      queryClient.invalidateQueries({ queryKey: ['selling-settings'] })
    },
    onError: (err: any) => toast.error(err?.message || 'Error al guardar los ajustes de Ventas'),
  })

  function onSubmit(values: SellingSettings) {
    saveMutation.mutate(values)
  }

  if (isLoading) {
    return <div className="skeleton-box" style={{ height: 200, maxWidth: 720 }} />
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} style={{ maxWidth: 720, display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div className="card">
        <div className="card-header">
          <span className="card-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Settings2 size={16} />
            Ajustes de Ventas
          </span>
        </div>
        <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="ff-wrap">
            <label className="ff-label">Grupo de Clientes por Defecto</label>
            <input className="ff-input" {...register('customerGroup')} placeholder="Grupo de clientes" />
          </div>

          <div className="ff-wrap">
            <label className="ff-label">Territorio por Defecto</label>
            <input className="ff-input" {...register('territory')} placeholder="Territorio" />
          </div>

          <div className="ff-wrap">
            <label className="ff-label" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input type="checkbox" className="ff-check" {...register('maintainSameSellingRate')} />
              Mantener la Misma Tarifa de Venta
            </label>
          </div>

          <div className="ff-wrap">
            <label className="ff-label" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input type="checkbox" className="ff-check" {...register('editableItemRate')} />
              Permitir Editar Tarifa del Artículo
            </label>
          </div>

          <div className="ff-wrap">
            <label className="ff-label" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input type="checkbox" className="ff-check" {...register('allowMultiplePricingRules')} />
              Permitir Múltiples Reglas de Precios
            </label>
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <button type="submit" className="btn btn-primary" disabled={saveMutation.isPending}>
          <Save size={16} />
          {saveMutation.isPending ? 'Guardando…' : 'Guardar Cambios'}
        </button>
      </div>
    </form>
  )
}

// ─── Compras ───────────────────────────────────────────────────────────────
function ComprasTab() {
  const queryClient = useQueryClient()
  const { data, isLoading } = useQuery({
    queryKey: ['buying-settings'],
    queryFn: getBuyingSettings,
  })

  const { register, handleSubmit, reset } = useForm<BuyingSettings>({
    defaultValues: {},
  })

  useEffect(() => {
    if (data) reset(data)
  }, [data, reset])

  const saveMutation = useMutation({
    mutationFn: (dto: Partial<BuyingSettings>) => updateBuyingSettings(dto),
    onSuccess: () => {
      toast.success('Ajustes de Compras actualizados')
      queryClient.invalidateQueries({ queryKey: ['buying-settings'] })
    },
    onError: (err: any) => toast.error(err?.message || 'Error al guardar los ajustes de Compras'),
  })

  function onSubmit(values: BuyingSettings) {
    saveMutation.mutate(values)
  }

  if (isLoading) {
    return <div className="skeleton-box" style={{ height: 200, maxWidth: 720 }} />
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} style={{ maxWidth: 720, display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div className="card">
        <div className="card-header">
          <span className="card-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Settings2 size={16} />
            Ajustes de Compras
          </span>
        </div>
        <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="ff-wrap">
            <label className="ff-label">Grupo de Proveedores por Defecto</label>
            <input className="ff-input" {...register('supplierGroup')} placeholder="Grupo de proveedores" />
          </div>

          <div className="ff-wrap">
            <label className="ff-label" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input type="checkbox" className="ff-check" {...register('maintainSameRateThroughPurchaseCycle')} />
              Mantener la Misma Tarifa durante el Ciclo de Compra
            </label>
          </div>

          <div className="ff-wrap">
            <label className="ff-label" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input type="checkbox" className="ff-check" {...register('disableLastPurchaseRate')} />
              Deshabilitar Última Tarifa de Compra
            </label>
            <p className="field-hint" style={{ color: 'var(--color-warning, #b45309)', marginTop: 4 }}>
              ⚠️ Al activar esta opción en verdadero, el recálculo de precio basado en el último costo de compra dejará de
              funcionar de forma silenciosa (sin ningún otro aviso del sistema). Actívalo solo si estás seguro de las
              implicaciones.
            </p>
          </div>

          <div className="ff-wrap">
            <label className="ff-label" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input type="checkbox" className="ff-check" {...register('allowMultiplePricingRules')} />
              Permitir Múltiples Reglas de Precios
            </label>
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <button type="submit" className="btn btn-primary" disabled={saveMutation.isPending}>
          <Save size={16} />
          {saveMutation.isPending ? 'Guardando…' : 'Guardar Cambios'}
        </button>
      </div>
    </form>
  )
}
