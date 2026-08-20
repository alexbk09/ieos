'use client'

import { useState } from 'react'
import { BadgePercent, Save } from 'lucide-react'
import { toast } from 'sonner'
import { FormInput, FormSubmitButton } from '@/components/ui/form-field'
import type { QuoteSettings } from '@/services/quotes'

/** Propiedades del gestor de configuración de cotizaciones. */
type Props = {
  /** Configuración inicial. */
  initialSettings: QuoteSettings
}

/**
 * Configuración administrativa de cotizaciones.
 * Permite editar:
 *  - % de descuento por pago en EFECTIVO en divisas.
 *  - Días de validez de la cotización.
 *  - Nota por defecto al pie.
 * Los cambios se aplican a todas las cotizaciones nuevas.
 */
export function QuoteSettingsManager({ initialSettings }: Props) {
  const [form, setForm] = useState<QuoteSettings>(initialSettings)
  const [saving, setSaving] = useState(false)

  /** Actualiza un campo numérico del formulario. */
  function setNumber<K extends keyof QuoteSettings>(key: K, value: string) {
    const parsed = value === '' ? '' : Number(value)
    setForm((f) => ({ ...f, [key]: (Number.isFinite(parsed) ? parsed : 0) as QuoteSettings[K] }))
  }

  /** Actualiza un campo de texto del formulario. */
  function setText<K extends keyof QuoteSettings>(key: K, value: string) {
    setForm((f) => ({ ...f, [key]: value as QuoteSettings[K] }))
  }

  /** Guarda la configuración en la API. */
  async function save() {
    setSaving(true)
    try {
      const response = await fetch('/api/admin/quote-settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cash_divisa_discount_percent: Number(form.cash_divisa_discount_percent),
          validity_days: Number(form.validity_days),
          default_notes: form.default_notes,
        }),
      })
      const result = await response.json()
      if (!response.ok) {
        toast.error('No se pudieron guardar los cambios', { description: result.error ?? 'Inténtalo de nuevo.' })
        return
      }
      if (result.settings) setForm(result.settings)
      toast.success('Configuración de cotizaciones guardada')
    } catch {
      toast.error('Error de red al guardar la configuración')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="grid gap-5">
      {/* Descuento por pago en efectivo en divisas */}
      <section className="rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-5">
        <div className="flex items-start gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-2xl bg-emerald-500/10 text-emerald-600">
            <BadgePercent size={18} />
          </span>
          <div>
            <h3 className="font-semibold">Descuento por pago en efectivo en divisas</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Si el cliente paga en <strong>efectivo en divisas</strong>, se aplica automáticamente este porcentaje de
              descuento al monto total de la cotización. El mensaje se muestra en la cotización y en el correo.
            </p>
          </div>
        </div>
        <div className="mt-4 max-w-xs">
          <FormInput
            label="% de descuento por efectivo en divisas"
            type="number"
            min={0}
            max={100}
            step={0.01}
            value={String(form.cash_divisa_discount_percent)}
            onChange={(e) => setNumber('cash_divisa_discount_percent', e.target.value)}
            hint="Ej: 20 = 20% de descuento"
          />
        </div>
      </section>

      {/* Validez */}
      <FormInput
        label="Días de validez de la cotización"
        type="number"
        min={1}
        max={90}
        step={1}
        value={String(form.validity_days)}
        onChange={(e) => setNumber('validity_days', e.target.value)}
        hint="La cotización es válida por este número de días desde su creación"
      />

      {/* Nota por defecto */}
      <label className="grid gap-2 text-sm">
        <span className="font-medium">Nota por defecto al pie de la cotización</span>
        <textarea
          value={form.default_notes}
          onChange={(e) => setText('default_notes', e.target.value)}
          className="min-h-24 rounded-xl border border-input bg-background px-3 py-2.5 text-sm outline-none transition-colors focus:border-ring focus:ring-2 focus:ring-ring/30"
        />
        <span className="text-xs text-muted-foreground">Este texto aparece al pie de todas las cotizaciones nuevas.</span>
      </label>

      {/* Guardar */}
      <div className="flex items-center justify-end gap-3 border-t border-border pt-4">
        <FormSubmitButton loading={saving} onClick={save} loadingText="Guardando…">
          <Save size={15} /> Guardar configuración
        </FormSubmitButton>
      </div>
    </div>
  )
}