1. Habilitar USD/EUR
PATCH /monedas/USD  { "habilitada": true }
PATCH /monedas/EUR  { "habilitada": true }   # si aplica

Esto crea automáticamente (idempotente) las subcuentas contables 112-01-USD/21-01-001-USD (CxC/CxP en esa moneda), hermanas de las cuentas base — no hace falta crearlas a mano.

2. Cargar al menos una tasa de cambio
POST /monedas/tasas  { "from": "USD", "to": "DOP", "rate": 60.5 }

Sin esto, cualquier documento en esa moneda sin conversionRate explícito falla al someterse (ERPNext no tiene de dónde resolver la tasa). Si prefieren sincronización automática diaria, activen tasasActualizacionAutomatica en el paso 3 — pero ojo: new-tenant.sh no habilita el scheduler del site, así que el job nunca corre a menos que alguien ejecute bench --site <dominio> enable-scheduler aparte.

3. Configurar la sección Multimoneda de Facturación (opcional pero recomendable)
PUT /config/facturacion
{
  "tasaFijaCxc": false,
  "tasaFijaCxp": false,
  "permitirPagoMonedaDistintaBanco": true   // si van a cobrar/pagar en un banco de otra moneda
}
4. Cuentas bancarias en la moneda deseada

Este es el paso donde más se dan errores (justo lo que arreglamos esta sesión):

En ERPNext, crear (si no existe) una cuenta contable (Account) con account_currency = USD/EUR bajo el grupo de bancos — el CoA base no trae bancos en divisa por defecto, hay que crearla a mano en el Chart of Accounts.
POST /cuentas-bancarias con account apuntando a esa cuenta y currency igual a esa misma moneda (si no coinciden, 400 BANK_ACCOUNT_CURRENCY_MISMATCH_GL).
Confirmar con GET /cuentas-bancarias/inconsistencias-moneda que no quedó ninguna cuenta divergente.
5. Clientes/Proveedores (opcional)
PUT /customers/:id  { "defaultCurrency": "USD" }

Autopuebla la cuenta CxC del cliente en esa moneda (ya existe desde el paso 1).

Verificación final
GET /config/facturacion

Debe mostrar monedasHabilitadas con la nueva moneda y multimonedaHabilitada: true.

Los 4 errores que van a aparecer si se saltan un paso:

Si te saltas...	Error
Paso 1	400 CURRENCY_NOT_ENABLED al facturar/cobrar en esa moneda
Paso 2	ERPNext rechaza el documento nativamente (sin tasa resoluble)
Paso 4.1/4.2	400 BANK_ACCOUNT_CURRENCY_MISMATCH_GL al crear la cuenta bancaria
Paso 3 (permitirPagoMonedaDistintaBanco)	400 BANK_ACCOUNT_CURRENCY_MISMATCH al cobrar/pagar contra un banco de otra moneda

No hace falta tocar nada de plantillas de impresión — si el tenant activa el módulo POS (POST /config/pos/habilitar), la plantilla "Factura General RD" con el desglose multimoneda se provisiona sola.
