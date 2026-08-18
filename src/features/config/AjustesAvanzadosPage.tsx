// Sección de uso poco frecuente: ajustes avanzados por módulo (Cuentas/Inventario/Ventas/Compras).
// Cada tab es un singleton GET+PUT independiente (no hay lista/CRUD aquí).
import { useEffect, useMemo, useState } from 'react'
import { useForm, Controller } from 'react-hook-form'
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
  listGruposProveedores,
  listPaises,
} from '@/shared/api/config'
import { listWarehouses } from '@/shared/api/inventory'
import { listCustomerGroups } from '@/shared/api/customers'
import { listUsuarios, listRoles } from '@/shared/api/usuarios'
import type { AccountsSettings, StockSettings, SellingSettings, BuyingSettings } from '@/shared/api/types'
import { PageHeader } from '@/components/shared/PageHeader'
import { SearchSelect } from '@/shared/ui/SearchSelect'
import type { SearchSelectOption } from '@/shared/ui/SearchSelect'
import { TagInput } from '@/shared/ui/TagInput'
import { Select, SelectItem } from '@/components/ui/select'
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

  const { register, control, handleSubmit, reset } = useForm<AccountsSettings>({
    defaultValues: {},
  })

  useEffect(() => {
    if (data) reset(data)
  }, [data, reset])

  const { data: usuariosData } = useQuery({
    queryKey: ['usuarios-all'],
    queryFn: () => listUsuarios({ limit: 100 }),
  })
  const { data: rolesData } = useQuery({
    queryKey: ['roles-all'],
    queryFn: listRoles,
  })

  const [creditControllerSearch, setCreditControllerSearch] = useState('')
  const creditControllerOptions: SearchSelectOption[] = (usuariosData?.items ?? [])
    .filter((u) => !creditControllerSearch || u.fullName.toLowerCase().includes(creditControllerSearch.toLowerCase()))
    .map((u) => ({ value: u.email, label: u.fullName, sublabel: u.email }))

  const [overBillRoleSearch, setOverBillRoleSearch] = useState('')
  const overBillRoleOptions: SearchSelectOption[] = (rolesData ?? [])
    .filter((r) => !overBillRoleSearch || r.label.toLowerCase().includes(overBillRoleSearch.toLowerCase()))
    .map((r) => ({ value: r.id, label: r.label }))

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
            <label className="ff-label" htmlFor="defaultAgeingRange">Rango de Antigüedad por Defecto</label>
            <Controller
              name="defaultAgeingRange"
              control={control}
              render={({ field }) => (
                <TagInput
                  id="defaultAgeingRange"
                  value={field.value ?? ''}
                  onChange={field.onChange}
                  placeholder="Escribe días y presiona Enter (ej. 60, 90, 120)"
                />
              )}
            />
            <p className="ff-hint">Solo números. Separa los rangos con Enter o coma (ej. 60, 90, 120).</p>
          </div>

          <div className="ff-wrap">
            <label className="ff-label">Controlador de Crédito</label>
            <Controller
              name="creditController"
              control={control}
              render={({ field }) => (
                <SearchSelect
                  value={field.value ?? ''}
                  onChange={(val) => field.onChange(val)}
                  options={creditControllerOptions}
                  onSearch={setCreditControllerSearch}
                  selectedLabel={usuariosData?.items.find((u) => u.email === field.value)?.fullName ?? ''}
                  placeholder="Usuario responsable"
                />
              )}
            />
          </div>

          <div className="ff-wrap">
            <label className="ff-label">Rol Autorizado a Sobrefacturar</label>
            <Controller
              name="roleAllowedToOverBill"
              control={control}
              render={({ field }) => (
                <SearchSelect
                  value={field.value ?? ''}
                  onChange={(val) => field.onChange(val)}
                  options={overBillRoleOptions}
                  onSearch={setOverBillRoleSearch}
                  selectedLabel={rolesData?.find((r) => r.id === field.value)?.label ?? field.value ?? ''}
                  placeholder="Rol del sistema"
                />
              )}
            />
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

  const { register, handleSubmit, reset, watch, control } = useForm<StockSettings>({
    defaultValues: {},
  })

  const enableSerialAndBatchNoForItem = watch('enableSerialAndBatchNoForItem')
  const watchedDefaultWarehouse = watch('defaultWarehouse')

  useEffect(() => {
    if (data) reset(data)
  }, [data, reset])

  const { data: warehousesData } = useQuery({
    queryKey: ['warehouses'],
    queryFn: () => listWarehouses(),
  })
  const warehouses = warehousesData ?? []
  const [warehouseSearch, setWarehouseSearch] = useState('')

  const warehouseOptions: SearchSelectOption[] = useMemo(() => {
    const q = warehouseSearch.toLowerCase()
    return warehouses
      .filter((w) => !q || w.name.toLowerCase().includes(q))
      .map((w) => ({ value: w.id, label: w.name }))
  }, [warehouses, warehouseSearch])

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
            <label className="ff-label" htmlFor="valuationMethod">Método de Valuación</label>
            <Controller
              name="valuationMethod"
              control={control}
              render={({ field }) => (
                <Select value={field.value ?? ''} onValueChange={field.onChange} placeholder="Sin definir">
                  <SelectItem value="">Sin definir</SelectItem>
                  <SelectItem value="FIFO">FIFO</SelectItem>
                  <SelectItem value="Moving Average">Promedio Móvil</SelectItem>
                  <SelectItem value="LIFO">LIFO</SelectItem>
                </Select>
              )}
            />
            <p className="ff-hint">
              Este campo puede ser rechazado por el servidor si ya existen movimientos de inventario (Stock Ledger Entry)
              registrados para artículos afectados. No es posible saberlo de antemano; si ocurre, verás un mensaje de error al guardar.
            </p>
          </div>

          <div className="ff-wrap">
            <label className="ff-label" htmlFor="defaultWarehouse">Almacén por Defecto</label>
            <Controller
              name="defaultWarehouse"
              control={control}
              render={({ field }) => (
                <SearchSelect
                  id="defaultWarehouse"
                  value={field.value ?? ''}
                  onChange={(val) => field.onChange(val)}
                  options={warehouseOptions}
                  onSearch={setWarehouseSearch}
                  selectedLabel={warehouses.find((w) => w.id === watchedDefaultWarehouse)?.name ?? ''}
                  placeholder="Seleccionar almacén"
                />
              )}
            />
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
              <input type="checkbox" className="ff-check" {...register('enableSerialAndBatchNoForItem')} />
              Activar Serie / Lote para Artículos
            </label>
            <p className="ff-hint">
              Interruptor maestro — actívalo para poder vender/comprar artículos con número de serie o lote. Es un
              requisito para usar el campo de abajo (Usar Campos de Serie/Lote). Si está apagado, cualquier compra o venta
              de un artículo con serie/lote será rechazada por el servidor.
            </p>
          </div>

          <div className="ff-wrap">
            <label
              className="ff-label"
              style={{ display: 'flex', alignItems: 'center', gap: 8, opacity: enableSerialAndBatchNoForItem ? 1 : 0.5 }}
            >
              <input
                type="checkbox"
                className="ff-check"
                disabled={!enableSerialAndBatchNoForItem}
                {...register('useSerialBatchFields')}
              />
              Usar campos de Serie/Lote en los documentos
            </label>
            <p className="ff-hint">
              Cuando está activo, los documentos (facturas, pedidos, compras, transferencias) muestran los campos de Número de
              Serie y Lote directamente en la fila del artículo, en lugar del diálogo emergente de captura. Requiere que
              "Activar Serie / Lote para Artículos" esté encendido — de lo contrario no tiene ningún efecto.
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

  const { register, handleSubmit, reset, control } = useForm<SellingSettings>({
    defaultValues: {},
  })

  useEffect(() => {
    if (data) reset(data)
  }, [data, reset])

  const { data: customerGroups } = useQuery({
    queryKey: ['customer-groups'],
    queryFn: listCustomerGroups,
    staleTime: 60_000,
  })
  const [customerGroupSearch, setCustomerGroupSearch] = useState('')
  const customerGroupOptions: SearchSelectOption[] = useMemo(() => {
    const q = customerGroupSearch.toLowerCase()
    return (customerGroups ?? [])
      .filter((g) => !q || g.name.toLowerCase().includes(q))
      .map((g) => ({ value: g.name, label: g.name }))
  }, [customerGroups, customerGroupSearch])

  const { data: paises } = useQuery({
    queryKey: ['paises-all'],
    queryFn: listPaises,
    staleTime: 60_000,
  })
  const [territorySearch, setTerritorySearch] = useState('')
  const territoryOptions: SearchSelectOption[] = useMemo(() => {
    const q = territorySearch.toLowerCase()
    return (paises ?? [])
      .filter((p) => !q || p.name.toLowerCase().includes(q))
      .map((p) => ({ value: p.name, label: p.name }))
  }, [paises, territorySearch])

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
            <label className="ff-label" htmlFor="customerGroup">Grupo de Clientes por Defecto</label>
            <Controller
              name="customerGroup"
              control={control}
              render={({ field }) => (
                <SearchSelect
                  id="customerGroup"
                  value={field.value ?? ''}
                  onChange={(val) => field.onChange(val)}
                  options={customerGroupOptions}
                  onSearch={setCustomerGroupSearch}
                  selectedLabel={field.value ?? ''}
                  placeholder="Sin predeterminado"
                />
              )}
            />
          </div>

          <div className="ff-wrap">
            <label className="ff-label">Territorio por Defecto</label>
            <Controller
              name="territory"
              control={control}
              render={({ field }) => (
                <SearchSelect
                  value={field.value ?? ''}
                  onChange={(val) => field.onChange(val)}
                  options={territoryOptions}
                  onSearch={setTerritorySearch}
                  selectedLabel={field.value ?? ''}
                  placeholder="Sin predeterminado"
                />
              )}
            />
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

  const { register, control, handleSubmit, reset } = useForm<BuyingSettings>({
    defaultValues: {},
  })

  useEffect(() => {
    if (data) reset(data)
  }, [data, reset])

  const { data: supplierGroups } = useQuery({
    queryKey: ['supplier-groups'],
    queryFn: listGruposProveedores,
    staleTime: 60_000,
  })
  const [supplierGroupSearch, setSupplierGroupSearch] = useState('')
  const supplierGroupOptions: SearchSelectOption[] = useMemo(() => {
    const q = supplierGroupSearch.toLowerCase()
    return (supplierGroups ?? [])
      .filter((g) => !q || g.name.toLowerCase().includes(q))
      .map((g) => ({ value: g.name, label: g.name }))
  }, [supplierGroups, supplierGroupSearch])

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
            <Controller
              name="supplierGroup"
              control={control}
              render={({ field }) => (
                <SearchSelect
                  value={field.value ?? ''}
                  onChange={(val) => field.onChange(val)}
                  options={supplierGroupOptions}
                  onSearch={setSupplierGroupSearch}
                  selectedLabel={field.value ?? ''}
                  placeholder="Sin predeterminado"
                />
              )}
            />
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
