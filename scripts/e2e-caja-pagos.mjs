// Pruebas unitarias de la lógica de pagos con vuelto automático (punto 5).
// Uso: node scripts/e2e-caja-pagos.mjs  (compila src/lib/paymentLines.ts a /tmp/pltest antes)
import { strict as assert } from 'node:assert'
import { createRequire } from 'node:module'
const require = createRequire('/tmp/pltest/')
const pl = require('/tmp/pltest/paymentLines.js')

const CARD = { name: 'Tarjeta de crédito', type: 'Card' }
const CASH = { name: 'Efectivo RD', type: 'Cash' }
const METODOS = [CARD, CASH]
const DENOMS = [
  { denominacion: '2000', valor: 2000 }, { denominacion: '1000', valor: 1000 },
  { denominacion: '500', valor: 500 }, { denominacion: '200', valor: 200 },
  { denominacion: '100', valor: 100 }, { denominacion: '50', valor: 50 },
  { denominacion: '25', valor: 25 }, { denominacion: '10', valor: 10 },
  { denominacion: '5', valor: 5 }, { denominacion: '1', valor: 1 },
]
const line = (modeOfPayment, amount) => ({
  modeOfPayment, amount: String(amount), cardNumber: '', authorizationCode: '',
  bank: '', checkNumber: '', bankAccount: '', showDetails: false,
})
let n = 0
const ok = (cond, label) => { n++; assert.ok(cond, label); console.log(`  ✓ ${label}`) }

// 1. Ejemplo del usuario: total 3000, tarjeta 2500 + efectivo 2000 → vuelto 1500
{
  const payments = [line('Tarjeta de crédito', 2500), line('Efectivo RD', 2000)]
  ok(pl.overpayAmount(payments, 3000) === 1500, 'overpay 2500+2000 vs 3000 = 1500')
  ok(pl.hasCashPayment(payments, METODOS) === true, 'detecta línea Cash')
  ok(pl.missingAmount(payments, 3000) === 0, 'sin faltante')
  const v = { payments, vuelto: [{ denominacion: '1000', cantidad: '1' }, { denominacion: '500', cantidad: '1' }] }
  ok(pl.isPaymentLinesValid(v, 3000, METODOS, DENOMS) === true, 'sobrepago válido con desglose 1000+500')
  const payload = pl.buildSubmitPayload(v, 3000, METODOS)
  assert.deepEqual(payload.payments, [
    { modeOfPayment: 'Tarjeta de crédito', amount: 2500 },
    { modeOfPayment: 'Efectivo RD', amount: 500 },
  ])
  console.log('  ✓ payload normaliza líneas a 2500+500 (=3000)')
  ok(payload.tenderedCash === 2000, 'tenderedCash = efectivo total recibido (2000)')
  assert.deepEqual(payload.vuelto, [
    { denominacion: '1000', cantidad: 1 }, { denominacion: '500', cantidad: 1 },
  ])
  console.log('  ✓ vuelto 1500 desglosado igual que antes')
}

// 2. Pago exacto: sin vuelto ni tendered
{
  const payments = [line('Efectivo RD', 3000)]
  const v = { payments, vuelto: [] }
  ok(pl.overpayAmount(payments, 3000) === 0, 'pago exacto: over 0')
  ok(pl.isPaymentLinesValid(v, 3000, METODOS, DENOMS) === true, 'pago exacto válido')
  const payload = pl.buildSubmitPayload(v, 3000, METODOS)
  assert.deepEqual(payload, { payments: [{ modeOfPayment: 'Efectivo RD', amount: 3000 }] })
  console.log('  ✓ payload exacto sin claves de vuelto')
}

// 3. Pago parcial: permitido (backend responde fullyPaid=false)
{
  const payments = [line('Tarjeta de crédito', 1000)]
  const v = { payments, vuelto: [] }
  ok(pl.missingAmount(payments, 3000) === 2000, 'faltante 2000 (punto 4)')
  ok(pl.isPaymentLinesValid(v, 3000, METODOS, DENOMS) === true, 'parcial sigue permitido')
}

// 4. Sobrepago sin cash → inválido
{
  const payments = [line('Tarjeta de crédito', 4000)]
  const v = { payments, vuelto: [] }
  ok(pl.hasCashPayment(payments, METODOS) === false, 'sin cash detectado')
  ok(pl.isPaymentLinesValid(v, 3000, METODOS, DENOMS) === false, 'sobrepago sin cash inválido')
}

// 5. Sobrepago mayor al efectivo recibido → inválido
{
  const payments = [line('Tarjeta de crédito', 4000), line('Efectivo RD', 500)]
  const v = { payments, vuelto: [{ denominacion: '500', cantidad: '5' }] }
  ok(pl.overpayAmount(payments, 3000) === 1500, 'over 1500 vs cash 500')
  ok(pl.isPaymentLinesValid(v, 3000, METODOS, DENOMS) === false, 'vuelto > cash inválido')
}

// 6. Sobrepago absorbido desde la última línea cash (múltiples cash)
{
  const payments = [line('Efectivo RD', 500), line('Tarjeta de crédito', 2500), line('Efectivo RD', 1000)]
  const v = { payments, vuelto: [{ denominacion: '500', cantidad: '2' }] }
  const payload = pl.buildSubmitPayload(v, 3000, METODOS)
  assert.deepEqual(payload.payments.map((p) => p.amount), [500, 2500])
  console.log('  ✓ absorbe 1000 de la última línea cash (queda en 0 y se descarta)')
  ok(payload.tenderedCash === 1500, 'tenderedCash = 1500')
}

// 7. Desglose que no cuadra → inválido
{
  const payments = [line('Tarjeta de crédito', 2500), line('Efectivo RD', 2000)]
  const v = { payments, vuelto: [{ denominacion: '1000', cantidad: '1' }] }
  ok(pl.isPaymentLinesValid(v, 3000, METODOS, DENOMS) === false, 'desglose 1000 vs 1500 inválido')
}

// 8. Sobrepago sin desglose → inválido
{
  const payments = [line('Tarjeta de crédito', 2500), line('Efectivo RD', 2000)]
  ok(pl.isPaymentLinesValid({ payments, vuelto: [] }, 3000, METODOS, DENOMS) === false, 'sin desglose inválido')
}

// 9. Tolerancia: 3000.005 vs 3000 no es sobrepago
{
  ok(pl.overpayAmount([line('Efectivo RD', 3000.005)], 3000) === 0, 'tolerancia 0.01')
}

console.log(`\nE2E caja-pagos: ${n} asserts + deepEquals OK`)
