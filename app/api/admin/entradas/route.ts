import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { hasPermission } from '@/services/roles'
import { ENTRY_MODULE_SLUG, ENTRY_STATUSES, ENTRY_TYPES } from '@/lib/constants'
import {
  createEntry,
  deleteEntry,
  getEntryById,
  listEntries,
  logEntryGeneration,
  updateEntry,
  updateEntryEstado,
  type EntryEstado,
  type EntryInput,
  type EntryRelationsInput,
} from '@/services/entries'
import { traducirEntrada } from '@/services/i18n-translate'

/**
 * API del módulo "Guías y Comparativas" (entradas SEO).
 * ------------------------------------------------------------------
 * GET    -> lista del panel (con filtros) o una entrada por `?id=`.
 * POST   -> crea una entrada (normalmente desde el asistente de IA).
 * PATCH  -> actualiza contenido/relaciones o cambia el estado editorial.
 * DELETE -> elimina una entrada.
 *
 * Seguridad (regla de oro):
 *   1) requireAdmin() fuerza sesión + rol administrador.
 *   2) hasPermission('guias_comparativas', 'read'|'write'|'delete') valida RBAC.
 *   3) La lógica de datos vive en /services (aquí NUNCA se llama a supabase).
 */

export const runtime = 'nodejs'

/** Respuesta estándar de permisos insuficientes. */
function forbidden(accion: string) {
  return NextResponse.json(
    { error: 'No tienes permiso para ' + accion + ' entradas del módulo de guías.' },
    { status: 403 },
  )
}

/** Normaliza un mapa i18n recibido (evita colar arrays/valores no-string). */
function parseMap(value: unknown): Record<string, string> | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined
  const resultado: Record<string, string> = {}
  for (const [locale, texto] of Object.entries(value as Record<string, unknown>)) {
    if (typeof texto === 'string' && texto.trim()) resultado[locale] = texto.trim()
  }
  return Object.keys(resultado).length > 0 ? resultado : undefined
}

/** Normaliza la FAQ recibida a la forma {pregunta, respuesta}. */
function parseFaq(value: unknown) {
  if (!Array.isArray(value)) return undefined
  const items = value
    .map((item: any) => ({
      pregunta: String(item?.pregunta ?? '').trim(),
      respuesta: String(item?.respuesta ?? '').trim(),
    }))
    .filter((item) => item.pregunta && item.respuesta)
  return items
}

/**
 * Sanitiza el payload del panel: SOLO se aceptan campos conocidos.
 * POR QUÉ: evita "mass assignment" (que un cliente curioso escriba columnas
 * internas como `publicado_en`, que gestiona el trigger de la base de datos).
 */
function parseEntryPayload(body: Record<string, unknown>): Partial<EntryInput> {
  const payload: Partial<EntryInput> = {}
  if (typeof body.titulo === 'string') payload.titulo = body.titulo.trim()
  if (typeof body.slug === 'string') payload.slug = body.slug.trim()
  if (typeof body.resumen === 'string') payload.resumen = body.resumen.trim() || null
  if (typeof body.cuerpo_html === 'string') payload.cuerpo_html = body.cuerpo_html
  if (typeof body.keyword_objetivo === 'string') payload.keyword_objetivo = body.keyword_objetivo.trim() || null
  if (typeof body.angulo === 'string') payload.angulo = body.angulo.trim() || null
  if (typeof body.hero_image_url === 'string') payload.hero_image_url = body.hero_image_url.trim() || null
  if (typeof body.autor === 'string') payload.autor = body.autor.trim() || null
  if (typeof body.indexado_google === 'boolean') payload.indexado_google = body.indexado_google
  if (typeof body.lectura_minutos === 'number') payload.lectura_minutos = body.lectura_minutos
  if (body.comparativa !== undefined) payload.comparativa = body.comparativa as EntryInput['comparativa']
  if (body.tipo !== undefined && ENTRY_TYPES.includes(body.tipo as any)) {
    payload.tipo = body.tipo as EntryInput['tipo']
  }
  const faq = parseFaq(body.faq)
  if (faq) payload.faq = faq
  if (Array.isArray(body.keywords)) {
    payload.keywords = body.keywords.map((k) => String(k ?? '').trim()).filter(Boolean)
  }
  const tituloI18n = parseMap(body.titulo_i18n)
  if (tituloI18n) payload.titulo_i18n = tituloI18n
  const slugI18n = parseMap(body.slug_i18n)
  if (slugI18n) payload.slug_i18n = slugI18n
  const resumenI18n = parseMap(body.resumen_i18n)
  if (resumenI18n) payload.resumen_i18n = resumenI18n
  const cuerpoI18n = parseMap(body.cuerpo_html_i18n)
  if (cuerpoI18n) payload.cuerpo_html_i18n = cuerpoI18n
  return payload
}

/** Relaciones recibidas (productos comparados y nichos). */
function parseRelations(body: Record<string, unknown>): EntryRelationsInput | undefined {
  const relations: EntryRelationsInput = {}
  if (Array.isArray(body.productIds)) relations.productIds = body.productIds.map((id) => String(id))
  if (Array.isArray(body.categoryIds)) relations.categoryIds = body.categoryIds.map((id) => String(id))
  if (body.notas && typeof body.notas === 'object' && !Array.isArray(body.notas)) {
    relations.notas = Object.fromEntries(
      Object.entries(body.notas as Record<string, unknown>).map(([id, nota]) => [id, String(nota ?? '')]),
    )
  }
  return Object.keys(relations).length > 0 ? relations : undefined
}

// ---------- Handlers ----------

/** GET: lista del panel (filtrable) o una entrada concreta por `?id=`. */
export async function GET(request: Request) {
  await requireAdmin()
  if (!(await hasPermission(ENTRY_MODULE_SLUG, 'read'))) return forbidden('ver')

  const params = new URL(request.url).searchParams
  const id = params.get('id')
  if (id) {
    const { entry, error } = await getEntryById(id)
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    if (!entry) return NextResponse.json({ error: 'La entrada no existe.' }, { status: 404 })
    return NextResponse.json({ entry })
  }

  const estado = params.get('estado')
  const { entries, error } = await listEntries({
    estado: ENTRY_STATUSES.includes(estado as any) ? (estado as EntryEstado) : undefined,
    search: params.get('search') ?? undefined,
    limit: params.get('limit') ? Number(params.get('limit')) : undefined,
  })
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ entries })
}

/** POST: crea una entrada (normalmente desde el asistente de IA del panel). */
export async function POST(request: Request) {
  await requireAdmin()
  if (!(await hasPermission(ENTRY_MODULE_SLUG, 'write'))) return forbidden('crear')

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
  const payload = parseEntryPayload(body)
  if (!payload.titulo || !payload.slug) {
    return NextResponse.json({ error: 'El título y el slug son obligatorios.' }, { status: 400 })
  }

  const result = await createEntry(payload as EntryInput, parseRelations(body))
  if (result.error) return NextResponse.json({ error: result.error.message }, { status: 400 })

  // Se devuelve la entrada COMPLETA (con relaciones) para que el panel la pinte
  // sin una segunda vuelta al servidor.
  const { entry } = await getEntryById(result.entry.id)
  return NextResponse.json({ entry })
}

/** PATCH: actualiza contenido/relaciones o cambia el estado editorial. */
export async function PATCH(request: Request) {
  await requireAdmin()
  if (!(await hasPermission(ENTRY_MODULE_SLUG, 'write'))) return forbidden('editar')

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>
  const id = String(body.id ?? '').trim()
  if (!id) return NextResponse.json({ error: 'ID requerido.' }, { status: 400 })

  // Publicar / despublicar / archivar: camino propio (revalida sitemap).
  if (body.estado !== undefined) {
    if (!ENTRY_STATUSES.includes(body.estado as any)) {
      return NextResponse.json({ error: 'Estado no válido.' }, { status: 400 })
    }
    const estadoResult = await updateEntryEstado(id, body.estado as EntryEstado)
    if (estadoResult.error) {
      return NextResponse.json({ error: estadoResult.error.message }, { status: 400 })
    }

    // Al PUBLICAR se traduce lo que falte: así el contenido nuevo queda en los
    // 6 idiomas sin pasos manuales. Es BEST-EFFORT y no bloquea la publicación:
    // si el motor de traducción falla, la entrada ya está publicada y el panel
    // puede reintentar con la acción "Traducir" (la detección es la misma).
    let traduccion: { traducidos: string[]; pendientes: number } | null = null
    if (body.estado === 'publicado') {
      const resultado = await traducirEntrada(id)
      await logEntryGeneration({
        entryId: id,
        etapa: 'traduccion',
        exito: resultado.success,
        errores: resultado.success ? null : resultado.error,
      })
      if (resultado.success) traduccion = resultado.data
      else console.error('[entradas] traducción al publicar:', resultado.error)
    }

    const { entry } = await getEntryById(id)
    return NextResponse.json({ entry, traduccion })
  }

  const result = await updateEntry(id, parseEntryPayload(body), parseRelations(body))
  if (result.error) return NextResponse.json({ error: result.error.message }, { status: 400 })
  const { entry } = await getEntryById(id)
  return NextResponse.json({ entry })
}

/** DELETE: elimina una entrada (sus relaciones caen en cascada). */
export async function DELETE(request: Request) {
  await requireAdmin()
  if (!(await hasPermission(ENTRY_MODULE_SLUG, 'delete'))) return forbidden('eliminar')

  const id = new URL(request.url).searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'ID requerido.' }, { status: 400 })

  const result = await deleteEntry(id)
  if (result.error) return NextResponse.json({ error: result.error.message }, { status: 400 })
  return NextResponse.json({ ok: true })
}
