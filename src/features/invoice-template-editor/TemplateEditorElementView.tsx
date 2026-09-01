import { format as formatDateFns, parseISO } from 'date-fns'
import { QRCodeSVG } from 'qrcode.react'
import Barcode from 'react-barcode'
import { Image as ImageIcon, Layers } from 'lucide-react'
import { resolveFileUrl } from '@/shared/api/client'
import type { TemplateElement, TemplateFieldCategory } from './types'

function resolveSample(fields: TemplateFieldCategory[], binding?: string): string {
  if (!binding) return ''
  for (const cat of fields) {
    const field = cat.fields.find((f) => f.key === binding)
    if (field) return field.sample
  }
  return binding
}

/** El texto fijo (`value`) tiene prioridad sobre el campo enlazado (`binding`) — usado por
 * QR y código de barras, donde el usuario puede optar por un valor constante en vez de un
 * dato dinámico de la factura. */
function resolveFixedOrBinding(fields: TemplateFieldCategory[], value?: string, binding?: string): string {
  if (value?.trim()) return value.trim()
  return resolveSample(fields, binding)
}

/** Una key ausente en `values` significa lo mismo que presente con `null` (§3.1 del doc de
 * la tarea) — ambos se normalizan a `undefined` para que el resto del render trate ambos
 * casos igual, sin lanzar por acceso a una propiedad inexistente. */
function resolveBoundValue(values: Record<string, unknown> | undefined, binding?: string): unknown {
  if (!values || !binding) return undefined
  const raw = values[binding]
  return raw === null ? undefined : raw
}

/** Evaluador aritmético mínimo (sin `eval`/`Function`) — usado tanto en modo diseño (todo
 * sustituido por 1) como con datos reales (cada binding sustituido por su valor numérico). */
function evalArithmetic(expr: string): number | null {
  let i = 0
  function skipSpace() { while (expr[i] === ' ') i++ }
  function parseNumber(): number | null {
    skipSpace()
    const start = i
    while (i < expr.length && /[\d.]/.test(expr[i])) i++
    if (i === start) return null
    return Number(expr.slice(start, i))
  }
  function parseFactor(): number | null {
    skipSpace()
    if (expr[i] === '(') {
      i++
      const val = parseExpr()
      skipSpace()
      if (expr[i] !== ')') return null
      i++
      return val
    }
    if (expr[i] === '-') { i++; const val = parseFactor(); return val === null ? null : -val }
    return parseNumber()
  }
  function parseTerm(): number | null {
    let val = parseFactor()
    if (val === null) return null
    for (;;) {
      skipSpace()
      const op = expr[i]
      if (op !== '*' && op !== '/') break
      i++
      const rhs = parseFactor()
      if (rhs === null) return null
      val = op === '*' ? val * rhs : val / rhs
    }
    return val
  }
  function parseExpr(): number | null {
    let val = parseTerm()
    if (val === null) return null
    for (;;) {
      skipSpace()
      const op = expr[i]
      if (op !== '+' && op !== '-') break
      i++
      const rhs = parseTerm()
      if (rhs === null) return null
      val = op === '+' ? val + rhs : val - rhs
    }
    return val
  }
  const result = parseExpr()
  skipSpace()
  return i === expr.length ? result : null
}

/** Modo diseño (sin datos reales): sustituye cada identificador por 1, solo para dar una idea
 * de forma del resultado — nunca recalcula montos fiscales reales (eso lo prohíbe el doc). */
function evalFormulaDesignMode(formula: string): string {
  if (!formula.trim()) return '—'
  const sanitized = formula.replace(/[a-zA-Z_][\w.]*/g, '1')
  const result = evalArithmetic(sanitized)
  return result !== null && Number.isFinite(result) ? result.toFixed(2) : formula
}

/** Con datos reales: sustituye cada binding declarado en `fields` por su valor numérico real
 * (0 si falta o no es numérico) antes de evaluar — nunca recalcula impuestos, solo formatea. */
function evalFormulaWithValues(formula: string, fields: string[], values: Record<string, unknown>): string {
  if (!formula.trim()) return '—'
  let expr = formula
  for (const key of fields) {
    const raw = resolveBoundValue(values, key)
    const num = typeof raw === 'number' ? raw : Number(raw) || 0
    expr = expr.split(key).join(String(num))
  }
  const result = evalArithmetic(expr)
  return result !== null && Number.isFinite(result) ? result.toFixed(2) : formula
}

function formatBoundDate(raw: unknown, pattern: string): string {
  if (typeof raw !== 'string') return ''
  try {
    return formatDateFns(parseISO(raw), pattern || 'dd/MM/yyyy')
  } catch {
    return raw
  }
}

/** Cada fila de `items.tabla` (§2.1 del doc) — es la única tabla que sabe dibujar el editor
 * hoy (TableColumn.key está fijo a columnas de línea de artículo). */
interface ItemRow {
  descripcion?: string
  cantidad?: number
  precio?: number
  monto?: number
}

function formatMoney(value: unknown): string {
  const num = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(num) ? num.toFixed(2) : ''
}

/** Evalúa una `ConditionalRule` contra el valor real del campo — comparación numérica cuando
 * ambos lados parsean a número, comparación de texto en caso contrario (excepto 'contains',
 * que siempre compara como texto). */
function evalCondition(fieldValue: unknown, operator: string, ruleValue: string): boolean {
  if (operator === 'contains') {
    return String(fieldValue ?? '').toLowerCase().includes(ruleValue.toLowerCase())
  }
  const numField = Number(fieldValue)
  const numRule = Number(ruleValue)
  const bothNumeric = fieldValue !== undefined && fieldValue !== '' && !Number.isNaN(numField) && !Number.isNaN(numRule)
  const strField = String(fieldValue ?? '')
  switch (operator) {
    case '==': return bothNumeric ? numField === numRule : strField === ruleValue
    case '!=': return bothNumeric ? numField !== numRule : strField !== ruleValue
    case '>': return bothNumeric && numField > numRule
    case '<': return bothNumeric && numField < numRule
    case '>=': return bothNumeric && numField >= numRule
    case '<=': return bothNumeric && numField <= numRule
    default: return false
  }
}

function renderListLine(item: unknown): string {
  if (item === null || item === undefined) return ''
  if (typeof item === 'object') {
    return Object.values(item as Record<string, unknown>)
      .filter((v) => v !== null && v !== undefined && v !== '')
      .join(' — ')
  }
  return String(item)
}

const textAlignToFlex: Record<string, string> = { left: 'flex-start', center: 'center', right: 'flex-end' }

interface Props {
  element: TemplateElement
  fields: TemplateFieldCategory[]
  /** Datos reales de `render-data` (§3 del doc) — `values` de Pos Invoice o `values` de una
   * entrada de `labels[]`. Cuando no se pasa, el elemento se pinta en modo diseño (samples del
   * catálogo, igual que hoy en el canvas del editor). */
  values?: Record<string, unknown>
}

export function TemplateEditorElementView({ element, fields, values }: Props) {
  switch (element.type) {
    case 'text': {
      const content = !element.binding
        ? element.text
        : values
          ? String(resolveBoundValue(values, element.binding) ?? '')
          : resolveSample(fields, element.binding)
      return (
        <div
          className="tpl-el-text"
          style={{
            fontSize: element.fontSize,
            fontWeight: element.fontWeight,
            fontStyle: element.fontStyle,
            textDecoration: element.textDecoration,
            justifyContent: textAlignToFlex[element.align],
            textAlign: element.align,
          }}
        >
          {content || (values ? '' : 'Texto')}
        </div>
      )
    }
    case 'formula':
      return (
        <div className="tpl-el-text" style={{ fontSize: element.fontSize, justifyContent: textAlignToFlex[element.align], textAlign: element.align }}>
          {element.formula
            ? values
              ? evalFormulaWithValues(element.formula, element.fields, values)
              : evalFormulaDesignMode(element.formula)
            : <span className="tpl-el-placeholder">ƒ(x)</span>}
        </div>
      )
    case 'date':
      return (
        <div className="tpl-el-text" style={{ fontSize: element.fontSize }}>
          {values ? formatBoundDate(resolveBoundValue(values, element.binding), element.format) : '14/08/2026 09:41'}
        </div>
      )
    case 'qr': {
      // ecf.qrBase64 ya viene como imagen PNG rasterizada server-side (§2.1 del doc) — nunca
      // se debe re-codificar ese base64 dentro de un nuevo QR generado en el cliente.
      if (values && element.binding === 'ecf.qrBase64') {
        const raw = resolveBoundValue(values, element.binding)
        return typeof raw === 'string' && raw ? (
          <div className="tpl-el-center">
            <img src={`data:image/png;base64,${raw}`} alt="QR" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
          </div>
        ) : (
          <div className="tpl-el-placeholder-box">
            <span>QR</span>
          </div>
        )
      }
      const qrValue = values
        ? String(resolveBoundValue(values, element.binding) ?? element.value ?? '')
        : resolveFixedOrBinding(fields, element.value, element.binding)
      return (
        <div className="tpl-el-center">
          <QRCodeSVG value={qrValue || element.binding || 'demo'} width="100%" height="100%" level={element.errorCorrection} />
        </div>
      )
    }
    case 'barcode': {
      // El "sample" de un campo real es su label humano (ej. "Código de barras", con tilde y
      // espacio) — válido como texto de referencia, pero CODE128 no acepta esos caracteres y
      // react-barcode lanza una excepción al intentar codificarlo. En modo diseño (sin
      // binding fijo) se usa siempre un placeholder numérico seguro, nunca el sample del campo.
      const barcodeValue = values
        ? String(resolveBoundValue(values, element.binding) ?? element.value ?? '')
        : element.value?.trim() || ''
      return (
        <div className="tpl-el-center tpl-el-barcode">
          <Barcode
            value={barcodeValue || '0000000000'}
            format={element.format}
            width={1.4}
            height={Math.max(20, element.height - 24)}
            displayValue
            margin={0}
            fontSize={10}
          />
        </div>
      )
    }
    case 'line':
      return (
        <div
          style={{
            width: '100%',
            height: Math.max(1, element.thickness),
            borderTop: `${element.thickness}px ${element.style === 'dashed' ? 'dashed' : 'solid'} var(--text-primary, #111827)`,
            marginTop: Math.max(0, element.height / 2 - element.thickness / 2),
          }}
        />
      )
    case 'rectangle':
      return (
        <div
          style={{
            width: '100%',
            height: '100%',
            background: element.fill,
            border: `${element.strokeWidth}px solid ${element.stroke}`,
            borderRadius: element.borderRadius,
            boxSizing: 'border-box',
          }}
        />
      )
    case 'logo':
      return element.src ? (
        <div className="tpl-el-center tpl-logo-bw">
          <img
            src={resolveFileUrl(element.src)}
            alt="Logo"
            style={{ width: '100%', height: '100%', objectFit: 'contain', filter: 'grayscale(1) contrast(3) brightness(1.1)' }}
          />
        </div>
      ) : (
        <div className="tpl-el-placeholder-box">
          <ImageIcon size={20} />
          <span>Logo (1-bit)</span>
        </div>
      )
    case 'table': {
      const visibleColumns = element.columns.filter((c) => c.visible)
      // La tabla del editor solo representa items.tabla (TableColumn.key es fijo a columnas
      // de línea de artículo) — no hay binding configurable a otra tabla.
      const rows: ItemRow[] = values
        ? ((resolveBoundValue(values, 'items.tabla') as ItemRow[] | undefined) ?? [])
        : [1, 2].map((n) => ({ descripcion: `Producto ${n}`, cantidad: n, precio: 250, monto: n * 250 }))
      return (
        <table className="tpl-el-table" style={{ fontSize: element.fontSize }}>
          <thead>
            <tr>
              {visibleColumns.map((c) => (
                <th key={c.key} style={{ textAlign: c.key === 'descripcion' ? 'left' : 'right' }}>{c.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={i}>
                {visibleColumns.map((c) => (
                  <td key={c.key} style={{ textAlign: c.key === 'descripcion' ? 'left' : 'right' }}>
                    {c.key === 'descripcion'
                      ? row.descripcion ?? ''
                      : c.key === 'cantidad'
                        ? row.cantidad ?? ''
                        : c.key === 'precio'
                          ? formatMoney(row.precio)
                          : c.key === 'total'
                            ? formatMoney(row.monto)
                            : /* itbis: no existe en items.tabla real (§2.3 del doc) */ ''}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      )
    }
    case 'list': {
      if (values) {
        const raw = resolveBoundValue(values, element.binding)
        const lines = Array.isArray(raw) ? raw.map(renderListLine) : raw !== undefined ? [renderListLine(raw)] : []
        return (
          <div className="tpl-el-text" style={{ fontSize: element.fontSize, flexDirection: 'column', alignItems: 'flex-start', gap: 2 }}>
            {lines.length ? lines.map((line, i) => <span key={i}>• {line}</span>) : null}
          </div>
        )
      }
      return (
        <div className="tpl-el-text" style={{ fontSize: element.fontSize, flexDirection: 'column', alignItems: 'flex-start', gap: 2 }}>
          <span>• {resolveSample(fields, element.binding) || 'Elemento de lista'}</span>
          <span>• Elemento de lista</span>
        </div>
      )
    }
    case 'conditional': {
      if (!values) {
        // Modo diseño: sin datos reales no hay nada que evaluar — se muestra siempre "SI"
        // más el texto configurado, solo como referencia visual en el canvas.
        return (
          <div className="tpl-el-conditional">
            <span className="tpl-el-conditional-badge">SI</span>
            <span style={{ fontSize: element.fontSize }}>{element.text || 'Texto condicional'}</span>
          </div>
        )
      }
      const matches = !element.rule || evalCondition(resolveBoundValue(values, element.rule.field), element.rule.operator, element.rule.value)
      if (!matches) return null
      const content = element.binding ? String(resolveBoundValue(values, element.binding) ?? '') : element.text
      return (
        <div className="tpl-el-text" style={{ fontSize: element.fontSize }}>
          {content}
        </div>
      )
    }
    case 'group':
      return (
        <div className="tpl-el-group">
          <Layers size={12} />
          <span>Sección</span>
        </div>
      )
    default:
      return null
  }
}
