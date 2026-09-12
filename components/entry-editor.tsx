'use client'

import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Loader2, Plus, Save, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Modal } from '@/components/ui/modal'
import { FormInput, FormTextarea } from '@/components/ui/form-field'
import type { Entry } from '@/services/entries'
import { ENTRY_TYPES } from '@/lib/constants'

/**
 * EntryEditor — editor de una entrada SEO (borrador o publicada).
 * ------------------------------------------------------------------
 * POR QUÉ es un modal aparte del manager: el manager gobierna la COLA de trabajo
 * (lista, filtros, acciones) y este organismo gobierna la EDICIÓN de un solo
 * documento. Separarlos mantiene ambos componentes pequeños y testeables.
 *
 * Reglas que respeta:
 *  - Toda escritura pasa por /api/admin/entradas (nunca Supabase aquí).
 *  - Estados de carga visibles y errores con toast (UX defensiva).
 *  - La tabla comparativa se muestra en modo LECTURA: sus valores provienen de
 *    las especificaciones REALES del catálogo, así que no se editan a mano.
 */

/** FAQ en edición (misma forma que persiste la entrada). */
type FaqItem = { pregunta: string; respuesta: string }

export function EntryEditor({
  entry,
  onClose,
  onSaved,
}: {
  entry: Entry | null
  onClose: () => void
  onSaved: () => Promise<void> | void
}) {
  const [titulo, setTitulo] = useState('')
  const [slug, setSlug] = useState('')
  const [resumen, setResumen] = useState('')
  const [angulo, setAngulo] = useState('')
  const [autor, setAutor] = useState('')
  const [keywords, setKeywords] = useState('')
  const [heroImagen, setHeroImagen] = useState('')
  const [cuerpo, setCuerpo] = useState('')
  const [faq, setFaq] = useState<FaqItem[]>([])
  const [notas, setNotas] = useState<Record<string, string>>({})
  const [tipo, setTipo] = useState<string>(ENTRY_TYPES[0])
  const [indexado, setIndexado] = useState(true)
  const [guardando, setGuardando] = useState(false)

  /**
   * Sincroniza el formulario cuando cambia la entrada seleccionada.
   * POR QUÉ: el modal se reutiliza para cualquier fila, así que el estado local
   * debe reiniciarse con cada apertura (si no, se arrastrarían datos anteriores).
   */
  useEffect(() => {
    if (!entry) return
    setTitulo(entry.titulo)
    setSlug(entry.slug)
    setResumen(entry.resumen ?? '')
    setAngulo(entry.angulo ?? '')
    setAutor(entry.autor ?? '')
    setKeywords((entry.keywords ?? []).join(', '))
    setHeroImagen(entry.hero_image_url ?? '')
    setCuerpo(entry.cuerpo_html ?? '')
    setFaq(entry.faq ?? [])
    setTipo(entry.tipo)
    setIndexado(entry.indexado_google)
    setNotas(Object.fromEntries(entry.products.map((producto) => [producto.id, producto.nota ?? ''])))
  }, [entry])

  if (!entry) return null

  /** Guarda los cambios de contenido y las relaciones (productos y notas). */
  async function guardar() {
    if (!entry) return
    setGuardando(true)
    try {
      const res = await fetch('/api/admin/entradas', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: entry.id,
          tipo,
          titulo,
          slug,
          resumen,
          angulo,
          autor,
          cuerpo_html: cuerpo,
          indexado_google: indexado,
          hero_image_url: heroImagen.trim() || null,
          keywords: keywords
            .split(',')
            .map((keyword) => keyword.trim())
            .filter(Boolean),
          faq: faq.filter((item) => item.pregunta.trim() && item.respuesta.trim()),
          // Se reenvían las relaciones para conservar el orden y las notas.
          productIds: entry.products.map((producto) => producto.id),
          categoryIds: entry.categories.map((categoria) => categoria.id),
          notas,
        }),
      })
      const body = await res.json()
      if (!res.ok) throw new Error(body?.error ?? 'No se pudo guardar la entrada.')
      toast.success('Entrada guardada.')
      await onSaved()
      onClose()
    } catch (err: any) {
      toast.error(err?.message ?? 'Error guardando la entrada.')
    } finally {
      setGuardando(false)
    }
  }

  /** Añade una pregunta vacía para completar a mano. */
  function agregarPregunta() {
    setFaq((actual) => [...actual, { pregunta: '', respuesta: '' }])
  }

  /** Quita una pregunta de la FAQ. */
  function quitarPregunta(indice: number) {
    setFaq((actual) => actual.filter((_, i) => i !== indice))
  }

  /** Actualiza un campo de una pregunta concreta. */
  function actualizarPregunta(indice: number, campo: keyof FaqItem, valor: string) {
    setFaq((actual) =>
      actual.map((item, i) => (i === indice ? { ...item, [campo]: valor } : item)),
    )
  }

  return (
    <Modal
      open={Boolean(entry)}
      onClose={onClose}
      title="Editar entrada"
      description={
        entry.estado === 'publicado'
          ? 'Está publicada: al guardar, la web y el sitemap se actualizan al instante.'
          : 'Es un borrador: nada será visible al público hasta que la publiques.'
      }
      size="xl"
      footer={
        <>
          <Button onClick={onClose} disabled={guardando}>
            Cerrar
          </Button>
          <Button onClick={guardar} disabled={guardando}>
            {guardando ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                Guardando…
              </>
            ) : (
              <>
                <Save className="h-4 w-4" aria-hidden />
                Guardar cambios
              </>
            )}
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <FormInput
            label="Título SEO"
            value={titulo}
            onChange={(event) => setTitulo(event.target.value)}
            hint={titulo.length + ' caracteres'}
          />
          <FormInput
            label="Slug (URL)"
            value={slug}
            onChange={(event) => setSlug(event.target.value)}
            hint={'/guias/' + slug}
          />
        </div>

        <FormTextarea
          label="Meta description (resumen)"
          value={resumen}
          onChange={(event) => setResumen(event.target.value)}
          hint={resumen.length + ' caracteres (ideal entre 110 y 160)'}
        />

        <div className="grid gap-4 sm:grid-cols-3">
          <label className="grid gap-2 text-sm">
            <span className="font-medium">Tipo</span>
            <select
              value={tipo}
              onChange={(event) => setTipo(event.target.value as typeof tipo)}
              className="h-10 rounded-xl border border-input bg-background px-3 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/30"
            >
              {ENTRY_TYPES.map((opcion) => (
                <option key={opcion} value={opcion}>
                  {opcion}
                </option>
              ))}
            </select>
          </label>
          <FormInput
            label="Ángulo editorial"
            value={angulo}
            onChange={(event) => setAngulo(event.target.value)}
            hint="El gancho: «para pisos pequeños»"
          />
          <FormInput
            label="Autor"
            value={autor}
            onChange={(event) => setAutor(event.target.value)}
            hint="Firma visible (E-E-A-T)"
          />
        </div>

        <FormInput
          label="Palabras clave"
          value={keywords}
          onChange={(event) => setKeywords(event.target.value)}
          hint="Separadas por coma (long-tail)"
        />

        <FormInput
          label="Imagen de cabecera (URL)"
          value={heroImagen}
          onChange={(event) => setHeroImagen(event.target.value)}
          hint="Opcional. Si lo dejas vacío, se usa la foto del primer producto comparado."
        />

        <FormTextarea
          label="Cuerpo del artículo (HTML)"
          value={cuerpo}
          onChange={(event) => setCuerpo(event.target.value)}
          // Monoespaciado y alto: aquí se edita el HTML semántico completo.
          className="[&>textarea]:min-h-[22rem] [&>textarea]:font-mono [&>textarea]:text-xs"
          hint="Conserva las secciones <h2> obligatorias. Prohibido <h1>."
        />

        <label className="flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            checked={indexado}
            onChange={(event) => setIndexado(event.target.checked)}
            className="mt-0.5 h-4 w-4 rounded border-input"
          />
          <span>
            Indexar en Google
            <span className="block text-xs text-muted-foreground">
              Si lo desactivas, la página se sirve con noindex y sale del sitemap.
            </span>
          </span>
        </label>

        {/* FAQ: es el mismo dato que alimenta el schema FAQPage de la página. */}
        <section>
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-sm font-semibold uppercase tracking-wider">Preguntas frecuentes</h3>
            <Button className="px-2.5" onClick={agregarPregunta} title="Añadir pregunta">
              <Plus className="h-4 w-4" aria-hidden />
            </Button>
          </div>

          <div className="mt-3 space-y-3">
            {faq.map((item, indice) => (
              <div key={indice} className="rounded-2xl border border-border p-4">
                <div className="flex items-start gap-3">
                  <div className="min-w-0 flex-1 space-y-3">
                    <FormInput
                      label={'Pregunta ' + (indice + 1)}
                      value={item.pregunta}
                      onChange={(event) => actualizarPregunta(indice, 'pregunta', event.target.value)}
                    />
                    <FormTextarea
                      label="Respuesta"
                      value={item.respuesta}
                      onChange={(event) => actualizarPregunta(indice, 'respuesta', event.target.value)}
                    />
                  </div>
                  <Button className="px-2.5" onClick={() => quitarPregunta(indice)} title="Quitar pregunta">
                    <Trash2 className="h-4 w-4 text-destructive" aria-hidden />
                  </Button>
                </div>
              </div>
            ))}

            {faq.length === 0 && (
              <p className="text-xs text-muted-foreground">
                Sin preguntas. Añade al menos 3 para que Google pueda mostrar el bloque FAQ.
              </p>
            )}
          </div>
        </section>

        {/* Comparativa: los valores son REALES del catálogo; aquí solo el veredicto. */}
        {entry.products.length > 0 && (
          <section>
            <h3 className="text-sm font-semibold uppercase tracking-wider">Productos comparados</h3>
            <p className="mt-1 text-xs text-muted-foreground">
              La tabla comparativa se rellena con las especificaciones reales del catálogo. Aquí
              editas el veredicto de cada producto.
            </p>
            <div className="mt-3 space-y-3">
              {entry.products.map((producto) => (
                <div key={producto.id} className="rounded-2xl border border-border p-4">
                  <p className="text-sm font-medium">{producto.name}</p>
                  <p className="font-mono text-[11px] text-muted-foreground">/productos/{producto.slug}</p>
                  <FormInput
                    className="mt-3"
                    label="Veredicto corto"
                    value={notas[producto.id] ?? ''}
                    onChange={(event) =>
                      setNotas((actual) => ({ ...actual, [producto.id]: event.target.value }))
                    }
                    hint="Ej: «La mejor relación calidad-precio»"
                  />
                </div>
              ))}
            </div>
            {entry.comparativa && entry.comparativa.criterios.length > 0 && (
              <p className="mt-2 text-xs text-muted-foreground">
                Criterios comparados:{' '}
                {entry.comparativa.criterios.map((fila) => fila.criterio).join(' · ')}
              </p>
            )}
          </section>
        )}
      </div>
    </Modal>
  )
}
