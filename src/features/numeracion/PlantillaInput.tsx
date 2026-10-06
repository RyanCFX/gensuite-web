import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { PLANTILLA_OPCIONES } from './numeracionReferencia'
import './Numeracion.css'

// ─── Input de plantilla con autocompletado ───────────────────────────────────
// Al escribir `..` se abre ahí mismo un menú con las opciones disponibles
// (fecha y consecutivo); Enter/clic inserta la elegida, Esc lo cierra y siempre se puede
// seguir escribiendo manual. Es un input controlado normal: `value` + `onChange`.

interface PlantillaInputProps {
  value: string
  onChange: (next: string) => void
  placeholder?: string
  ariaLabel?: string
  className?: string
  id?: string
  /** Ref al `<input>` real (para el registro de foco de los chips de tokens). */
  inputRef?: (el: HTMLInputElement | null) => void
  onFocus?: (e: React.FocusEvent<HTMLInputElement>) => void
  onSelect?: (e: React.SyntheticEvent<HTMLInputElement>) => void
}

// Mide el ancho en px del texto con la fuente del input (para anclar el menú al cursor).
let medidaCtx: CanvasRenderingContext2D | null | undefined
function anchoTexto(input: HTMLInputElement, texto: string): number {
  if (medidaCtx === undefined) {
    medidaCtx = document.createElement('canvas').getContext('2d') ?? null
  }
  if (!medidaCtx) return texto.length * 8
  const cs = getComputedStyle(input)
  medidaCtx.font = `${cs.fontStyle} ${cs.fontVariant} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`
  return medidaCtx.measureText(texto).width
}

export function PlantillaInput({
  value,
  onChange,
  placeholder,
  ariaLabel,
  className,
  id,
  inputRef,
  onFocus,
  onSelect,
}: PlantillaInputProps) {
  const internoRef = useRef<HTMLInputElement | null>(null)
  const [caret, setCaret] = useState<number | null>(null)
  const [abierto, setAbierto] = useState(false)
  const [query, setQuery] = useState('')
  const [resaltado, setResaltado] = useState(0)
  const [pos, setPos] = useState<{ top: number; left: number; flip: boolean } | null>(null)

  // Refs vivas para recalcular la posición ante scroll/resize sin clausuras viejas.
  const valueRef = useRef(value)
  valueRef.current = value
  const caretRef = useRef(caret)
  caretRef.current = caret

  // Posición fija en viewport (el menú vive en un portal a document.body para que ningún
  // contenedor con overflow lo recorte). Se ancla al cursor dentro del input.
  const calcularPos = useCallback(() => {
    const el = internoRef.current
    const c = caretRef.current
    if (!el || c === null) return null
    const antes = valueRef.current.slice(0, c)
    const rect = el.getBoundingClientRect()
    const cs = getComputedStyle(el)
    const x =
      rect.left +
      parseFloat(cs.paddingLeft || '0') +
      parseFloat(cs.borderLeftWidth || '0') +
      anchoTexto(el, antes) -
      el.scrollLeft
    const flip = rect.bottom + 280 > window.innerHeight && rect.top > 280
    return {
      top: (flip ? rect.top : rect.bottom) + 4,
      left: Math.max(8, Math.min(x, window.innerWidth - 248)),
      flip,
    }
  }, [])

  useEffect(() => {
    if (!abierto) return
    const actualizar = () => {
      const p = calcularPos()
      if (p) setPos(p)
      else setAbierto(false)
    }
    actualizar()
    window.addEventListener('scroll', actualizar, true)
    window.addEventListener('resize', actualizar)
    return () => {
      window.removeEventListener('scroll', actualizar, true)
      window.removeEventListener('resize', actualizar)
    }
  }, [abierto, value, caret, calcularPos])

  function setRef(el: HTMLInputElement | null) {
    internoRef.current = el
    inputRef?.(el)
  }

  function leerCaret(): number | null {
    const el = internoRef.current
    if (!el || document.activeElement !== el) return null
    return el.selectionStart ?? value.length
  }

  // Detecta el disparador `..`: dos puntos justo antes del cursor + filtro opcional
  // (letras o `#`). Cualquier otro caracter cierra el menú (se sigue escribiendo manual).
  useEffect(() => {
    if (caret === null) {
      setAbierto(false)
      return
    }
    const antes = value.slice(0, caret)
    const m = /(\.\.)([A-Za-z#]*)$/.exec(antes)
    if (!m) {
      setAbierto(false)
      return
    }
    setQuery(m[2])
    setResaltado(0)
    setAbierto(true)
  }, [value, caret])

  const opciones = PLANTILLA_OPCIONES.filter((o) =>
    o.token.toLowerCase().includes(query.toLowerCase()),
  )

  function insertar(token: string) {
    const el = internoRef.current
    const pos = leerCaret() ?? value.length
    const antes = value.slice(0, pos)
    const m = /(\.\.)([A-Za-z#]*)$/.exec(antes)
    const inicio = m ? pos - m[0].length : pos
    const next = value.slice(0, inicio) + token + value.slice(pos)
    setAbierto(false)
    onChange(next)
    requestAnimationFrame(() => {
      el?.focus()
      const p = inicio + token.length
      el?.setSelectionRange(p, p)
      setCaret(p)
    })
  }

  function manejarChange(e: React.ChangeEvent<HTMLInputElement>) {
    onChange(e.target.value)
    setCaret(e.target.selectionStart ?? e.target.value.length)
  }

  function manejarSelect(e: React.SyntheticEvent<HTMLInputElement>) {
    onSelect?.(e)
    const el = e.target as HTMLInputElement
    // Si el cursor salió del rango del disparador, el menú se cierra solo (efecto de arriba).
    setCaret(el.selectionStart ?? value.length)
  }

  function manejarKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!abierto) return
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      if (opciones.length === 0) return
      setResaltado((prev) =>
        e.key === 'ArrowDown'
          ? (prev + 1) % opciones.length
          : (prev - 1 + opciones.length) % opciones.length,
      )
    } else if (e.key === 'Enter' || e.key === 'Tab') {
      if (opciones.length > 0) {
        e.preventDefault()
        insertar(opciones[Math.min(resaltado, opciones.length - 1)].token)
      } else {
        setAbierto(false)
      }
    } else if (e.key === 'Escape') {
      e.preventDefault()
      setAbierto(false)
    }
  }

  return (
    <span className="num-plantilla-wrap">
      <input
        ref={setRef}
        id={id}
        className={className ?? 'ff-input num-mono'}
        value={value}
        placeholder={placeholder}
        spellCheck={false}
        aria-label={ariaLabel}
        aria-expanded={abierto}
        aria-autocomplete="list"
        role="combobox"
        onChange={manejarChange}
        onFocus={(e) => {
          onFocus?.(e)
          setCaret(e.target.selectionStart ?? value.length)
        }}
        onSelect={manejarSelect}
        onClick={(e) => setCaret((e.target as HTMLInputElement).selectionStart ?? value.length)}
        onKeyUp={(e) => {
          const el = e.target as HTMLInputElement
          if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) {
            setCaret(el.selectionStart ?? value.length)
          }
        }}
        onKeyDown={manejarKeyDown}
        onBlur={() => setAbierto(false)}
      />
      {abierto &&
        pos &&
        createPortal(
          <span
            className="num-plantilla-menu num-plantilla-menu-flotante"
            role="listbox"
            style={{
              top: pos.top,
              left: pos.left,
              transform: pos.flip ? 'translateY(calc(-100% - 8px))' : undefined,
            }}
          >
            {opciones.length === 0 ? (
              <span className="num-plantilla-vacio">Sin coincidencias — podés escribirlo manual</span>
            ) : (
              opciones.map((o, i) => (
                <span
                  key={o.token}
                  role="option"
                  aria-selected={i === resaltado}
                  className={`num-plantilla-item${i === resaltado ? ' on' : ''}`}
                  onMouseDown={(e) => {
                    // Antes del blur: inserta sin perder el foco ni cerrar de golpe.
                    e.preventDefault()
                    insertar(o.token)
                  }}
                  onMouseEnter={() => setResaltado(i)}
                >
                  <code>{o.token}</code>
                  <span className="num-plantilla-item-sub">
                    {o.etiqueta} · {o.muestra}
                  </span>
                </span>
              ))
            )}
          </span>,
          document.body,
        )}
    </span>
  )
}
