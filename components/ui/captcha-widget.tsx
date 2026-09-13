'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { LoaderCircle, RefreshCw, ShieldCheck, ShieldX } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * Captcha matemático moderno estilo "slider".
 * La expresión la genera /api/captcha y la respuesta correcta vive en una
 * cookie HTTP-only firmada — el navegador jamás ve la respuesta.
 * El usuario resuelve la operación y arrastra el control cian hasta el final;
 * el token/cookie se envía junto al formulario a /api/contact, donde el
 * servidor re-verifica la respuesta antes de enviar el correo.
 */
export function CaptchaWidget({
  onChange,
  className,
}: {
  /** Se llama con el estado de verificación y la respuesta escrita (para enviar al servidor). */
  onChange: (verified: boolean, answer: string) => void
  className?: string
}) {
  const [expression, setExpression] = useState('')
  const [percent, setPercent] = useState(0)
  const [state, setState] = useState<'loading' | 'idle' | 'verifying' | 'verified' | 'error'>('loading')
  const [answer, setAnswer] = useState('')
  const draggingRef = useRef(false)
  const startXRef = useRef(0)
  const startPctRef = useRef(0)

  /** Carga una expresión nueva desde /api/captcha. */
  const loadCaptcha = useCallback(async () => {
    setState('loading')
    setPercent(0)
    setAnswer('')
    try {
      const res = await fetch('/api/captcha', { cache: 'no-store' })
      const data = await res.json()
      setExpression(data.expression ?? '')
      setState('idle')
    } catch {
      setState('error')
    }
  }, [])

  // Carga inicial.
  useEffect(() => {
    loadCaptcha()
  }, [loadCaptcha])

  /** Verifica la respuesta contra la operación visible. */
  function verify() {
    if (state === 'verified' || state === 'verifying') return
    setState('verifying')
    // Cálculo de la respuesta correcta desde la expresión visible (suma o resta).
    const match = expression.match(/^\s*(-?\d+)\s*([+\-])\s*(-?\d+)\s*$/)
    const correct = match
      ? match[2] === '+'
        ? Number(match[1]) + Number(match[3])
        : Number(match[1]) - Number(match[3])
      : null
    const ok = correct !== null && Number(String(answer).trim()) === correct
    setTimeout(() => {
      if (ok) {
        setState('verified')
        onChange(true, String(answer).trim())
      } else {
        setState('error')
        onChange(false, '')
        setTimeout(loadCaptcha, 1200)
      }
    }, 500)
  }

  /** Pointer down en el slider: inicia el arrastre (requiere respuesta escrita). */
  function onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (state === 'verified' || state === 'verifying' || !expression) return
    if (!String(answer).trim()) {
      // Sin respuesta: solo mostramos la instrucción (estado idle) sin arrastrar.
      return
    }
    draggingRef.current = true
    startXRef.current = e.clientX
    startPctRef.current = percent
    ;(e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId)
  }

  /** Pointer move: actualiza el porcentaje arrastrado. */
  function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!draggingRef.current) return
    const track = e.currentTarget as HTMLDivElement
    const rect = track.getBoundingClientRect()
    const delta = e.clientX - startXRef.current
    const nextPct = Math.min(100, Math.max(0, startPctRef.current + (delta / rect.width) * 100))
    setPercent(nextPct)
    if (nextPct >= 99.5) {
      draggingRef.current = false
      setPercent(100)
      verify()
    }
  }

  /** Pointer up o cancel: si no llegó al final, vuelve a 0. */
  function onPointerEnd() {
    if (!draggingRef.current) return
    draggingRef.current = false
    if (state !== 'verifying' && state !== 'verified') {
      setPercent(0)
    }
  }

  /** Accesibilidad: Enter verifica con la respuesta escrita. */
  function handleKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (e.key === 'Enter') verify()
  }

  return (
    <div role="group" aria-label="Verificación anti-robots" className={cn('grid gap-2', className)}>
      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        <ShieldCheck size={13} className="text-cyan-600" /> Verificación anti-robots
      </div>

      <div
        className={cn(
          'overflow-hidden rounded-2xl border transition-colors',
          state === 'error'
            ? 'border-red-400'
            : state === 'verified'
              ? 'border-emerald-400'
              : 'border-slate-200 dark:border-slate-700',
        )}
      >
        {/* Fila: expresión + campo de respuesta + regenerar */}
        <div className="flex items-center gap-3 bg-slate-50 px-4 py-3 dark:bg-slate-800/60">
          {state === 'loading' ? (
            <div className="flex h-9 flex-1 items-center justify-center gap-2 text-sm text-muted-foreground">
              <LoaderCircle size={16} className="animate-spin" /> Cargando…
            </div>
          ) : (
            <>
              <span className="font-mono text-lg font-semibold tabular-nums text-blue-950 dark:text-cyan-300">
                {expression || '—'}
              </span>
              <span className="text-muted-foreground">=</span>
              <input
                value={answer}
                onChange={(e) => {
                  const value = e.target.value
                  setAnswer(value)
                  // Si ya estaba verificado y el usuario cambia la respuesta, se reinicia
                  if (state === 'verified') {
                    setPercent(0)
                    setState('idle')
                    onChange(false, '')
                  }
                }}
                inputMode="numeric"
                autoComplete="off"
                aria-label="Resultado de la operación"
                placeholder="?"
                className="h-9 w-20 rounded-xl border border-slate-200 bg-white px-3 text-center font-mono text-sm font-semibold outline-none transition-colors focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20 dark:border-slate-600 dark:bg-slate-900"
              />
              <button
                type="button"
                onClick={loadCaptcha}
                aria-label="Nueva operación"
                className="grid size-9 shrink-0 place-items-center rounded-xl border border-border text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              >
                <RefreshCw size={15} />
              </button>
            </>
          )}
        </div>

        {/* Estado: verificado / error / verificando */}
        {state === 'verified' && (
          <div className="flex items-center gap-2 bg-emerald-50 px-4 py-2.5 text-sm font-medium text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400">
            <ShieldCheck size={15} /> Verificado — no eres un robot
          </div>
        )}
        {state === 'error' && (
          <div className="flex items-center gap-2 bg-red-50 px-4 py-2.5 text-sm font-medium text-red-600 dark:bg-red-500/10 dark:text-red-400">
            <ShieldX size={15} /> Respuesta incorrecta. Intenta de nuevo.
          </div>
        )}
        {state === 'verifying' && (
          <div className="flex items-center gap-2 bg-blue-50 px-4 py-2.5 text-sm font-medium text-blue-700 dark:bg-blue-500/10 dark:text-blue-400">
            <LoaderCircle size={15} className="animate-spin" /> Verificando…
          </div>
        )}

        {/* Slider */}
        {(state === 'idle' || state === 'error') && (
          <div
            className="relative flex h-11 touch-none select-none items-center bg-slate-100 px-1.5 dark:bg-slate-800"
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerEnd}
            onPointerCancel={onPointerEnd}
            onKeyDown={handleKeyDown}
            role="slider"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(percent)}
            aria-label="Mantén presionado y arrastra el control hasta el final para verificar"
            tabIndex={0}
          >
            {/* Label centrado */}
            <span className="pointer-events-none absolute inset-x-0 text-center text-xs font-medium text-muted-foreground">
              {percent === 0 ? 'Escribe el resultado y arrastra →' : 'Suelta para verificar'}
            </span>
            {/* Barra de progreso */}
            <div
              className="pointer-events-none absolute inset-y-0 left-0 rounded-l-[inherit] bg-cyan-400/40 transition-[width] duration-75"
              style={{ width: `${percent}%` }}
            />
            {/* Control deslizable */}
            <div
              className="pointer-events-none absolute bottom-1.5 left-1.5 z-10 flex h-8 items-center justify-center rounded-xl bg-cyan-700 px-4 text-xs font-bold text-white shadow-md"
              style={{
                left: `min(calc(${percent}% - ${percent === 0 ? 0 : 40}px), calc(100% - 56px))`,
              }}
            >
              <span className="text-lg leading-none">{percent >= 99.5 ? '✓' : '→'}</span>
            </div>
          </div>
        )}
      </div>

      {/* Antes text-slate-400 (2.5:1 sobre blanco): usamos el token del tema,
          que garantiza contraste AA y respeta el modo oscuro. */}
      <p className="text-[11px] leading-relaxed text-muted-foreground">
        Protegemos el formulario contra robots. Resuelve la operación y arrastra el control color cian hasta el final.
      </p>
    </div>
  )
}