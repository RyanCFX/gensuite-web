import { QRCodeSVG } from 'qrcode.react'
import Barcode from 'react-barcode'
import { Image as ImageIcon, Layers } from 'lucide-react'
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

/** Evaluador aritmético mínimo (sin `eval`/`Function`) para previsualizar fórmulas como
 * "cantidad * precio" sustituyendo cada binding por 1 — la evaluación real con datos de la
 * factura ocurrirá al generar el documento impreso. */
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

function evalFormula(formula: string): string {
  if (!formula.trim()) return '—'
  const sanitized = formula.replace(/[a-zA-Z_][\w.]*/g, '1')
  const result = evalArithmetic(sanitized)
  return result !== null && Number.isFinite(result) ? result.toFixed(2) : formula
}

const textAlignToFlex: Record<string, string> = { left: 'flex-start', center: 'center', right: 'flex-end' }

export function TemplateEditorElementView({ element, fields }: { element: TemplateElement; fields: TemplateFieldCategory[] }) {
  switch (element.type) {
    case 'text': {
      const content = element.binding ? resolveSample(fields, element.binding) : element.text
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
          {content || 'Texto'}
        </div>
      )
    }
    case 'formula':
      return (
        <div className="tpl-el-text" style={{ fontSize: element.fontSize, justifyContent: textAlignToFlex[element.align], textAlign: element.align }}>
          {element.formula ? evalFormula(element.formula) : <span className="tpl-el-placeholder">ƒ(x)</span>}
        </div>
      )
    case 'date':
      return (
        <div className="tpl-el-text" style={{ fontSize: element.fontSize }}>
          14/08/2026 09:41
        </div>
      )
    case 'qr':
      return (
        <div className="tpl-el-center">
          <QRCodeSVG value={resolveFixedOrBinding(fields, element.value, element.binding) || element.binding || 'demo'} width="100%" height="100%" level={element.errorCorrection} />
        </div>
      )
    case 'barcode':
      return (
        <div className="tpl-el-center tpl-el-barcode">
          <Barcode
            value={resolveFixedOrBinding(fields, element.value, element.binding) || '0000000000'}
            format={element.format}
            width={1.4}
            height={Math.max(20, element.height - 24)}
            displayValue
            margin={0}
            fontSize={10}
          />
        </div>
      )
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
          <img src={element.src} alt="Logo" style={{ width: '100%', height: '100%', objectFit: 'contain', filter: 'grayscale(1) contrast(3) brightness(1.1)' }} />
        </div>
      ) : (
        <div className="tpl-el-placeholder-box">
          <ImageIcon size={20} />
          <span>Logo (1-bit)</span>
        </div>
      )
    case 'table':
      return (
        <table className="tpl-el-table" style={{ fontSize: element.fontSize }}>
          <thead>
            <tr>
              {element.columns.filter((c) => c.visible).map((c) => (
                <th key={c.key} style={{ textAlign: c.key === 'descripcion' ? 'left' : 'right' }}>{c.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {[1, 2].map((row) => (
              <tr key={row}>
                {element.columns.filter((c) => c.visible).map((c) => (
                  <td key={c.key} style={{ textAlign: c.key === 'descripcion' ? 'left' : 'right' }}>
                    {c.key === 'descripcion' ? `Producto ${row}` : c.key === 'cantidad' ? row : (row * 250).toFixed(2)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      )
    case 'list':
      return (
        <div className="tpl-el-text" style={{ fontSize: element.fontSize, flexDirection: 'column', alignItems: 'flex-start', gap: 2 }}>
          <span>• {resolveSample(fields, element.binding) || 'Elemento de lista'}</span>
          <span>• Elemento de lista</span>
        </div>
      )
    case 'conditional':
      return (
        <div className="tpl-el-conditional">
          <span className="tpl-el-conditional-badge">SI</span>
          <span style={{ fontSize: element.fontSize }}>{element.text || 'Texto condicional'}</span>
        </div>
      )
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
