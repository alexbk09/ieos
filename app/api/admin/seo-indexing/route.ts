import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { hasPermission } from '@/services/roles'
import { SEO_INDEXING_BATCH_SIZE, SEO_INDEXING_MODULE_SLUG } from '@/lib/constants'
import {
  diagnosticarIndexacion,
  enviarLotePendiente,
  inspeccionarLoteEnGoogle,
  limpiarRegistroDeIndexacion,
  listarColaDeIndexacion,
  obtenerPanoramaDeIndexacion,
  quitarUrlsDeLaCola,
  reenviarSitemapAGoogleConsole,
  sincronizarColaConSitemap,
  vaciarColaDeIndexacion,
} from '@/services/seo-indexing'

/**
 * API del módulo "Indexación en Buscadores".
 * ------------------------------------------------------------------
 * GET    -> panorama (resumen, cuota, canales) + primera página de la cola.
 * POST   -> acción por lotes: `sincronizar`, `enviar`, `inspeccionar`, `sitemap`.
 * DELETE -> `quitar-urls` (ids) o `limpiar-registro` (auditoría).
 *
 * Seguridad (regla de oro):
 *   1) requireAdmin() fuerza sesión + rol administrador.
 *   2) hasPermission('seo_indexing', 'read'|'write'|'delete') valida el RBAC.
 *   3) Toda la lógica vive en /services/seo-indexing (aquí NUNCA se llama a
 *      Supabase ni a Google directamente).
 */

export const runtime = 'nodejs'

/** Respuesta estándar de permisos insuficientes. */
function forbidden(accion: string) {
  return NextResponse.json(
    { error: 'No tienes permiso para ' + accion + ' en el módulo de indexación.' },
    { status: 403 },
  )
}

/** GET: panorama del módulo + cola filtrable por estado/tipo. */
export async function GET(request: Request) {
  await requireAdmin()
  if (!(await hasPermission(SEO_INDEXING_MODULE_SLUG, 'read'))) return forbidden('consultar')

  const url = new URL(request.url)
  const estado = (url.searchParams.get('estado') ?? 'todos') as any
  const tipo = (url.searchParams.get('tipo') ?? 'todos') as any
  const soloPendientes = url.searchParams.get('pendientes') === '1'
  const limit = Number(url.searchParams.get('limit')) || SEO_INDEXING_BATCH_SIZE
  const offset = Number(url.searchParams.get('offset')) || 0

  const [panorama, cola] = await Promise.all([
    obtenerPanoramaDeIndexacion(),
    listarColaDeIndexacion({ estado, tipo, soloPendientes, limit, offset }),
  ])

  if (cola.error) return NextResponse.json({ error: cola.error }, { status: 400 })
  return NextResponse.json({ panorama, cola: { items: cola.items, total: cola.total } })
}

/** POST: ejecuta una acción por lotes del panel. */
export async function POST(request: Request) {
  const { user } = await requireAdmin()
  if (!(await hasPermission(SEO_INDEXING_MODULE_SLUG, 'write'))) return forbidden('actuar')

  const body = await request.json().catch(() => ({}))
  const accion = String(body?.accion ?? '')
  const limit = Number(body?.limit) || SEO_INDEXING_BATCH_SIZE
  const usuarioEmail = user.email ?? null

  if (accion === 'sincronizar') {
    const resultado = await sincronizarColaConSitemap()
    if (resultado.error) return NextResponse.json({ error: resultado.error }, { status: 400 })
    return NextResponse.json({ resultado })
  }

  if (accion === 'enviar') {
    const resultado = await enviarLotePendiente({ limit, usuarioEmail })
    return NextResponse.json({ resultado })
  }

  if (accion === 'inspeccionar') {
    const resultado = await inspeccionarLoteEnGoogle({ limit, usuarioEmail })
    return NextResponse.json({ resultado })
  }

  if (accion === 'sitemap') {
    const resultado = await reenviarSitemapAGoogleConsole(usuarioEmail)
    return NextResponse.json({ resultado })
  }

  if (accion === 'diagnostico') {
    const resultado = await diagnosticarIndexacion()
    return NextResponse.json({ resultado })
  }

  return NextResponse.json(
    { error: 'Acción no reconocida. Usa: sincronizar, enviar, inspeccionar, sitemap o diagnostico.' },
    { status: 400 },
  )
}

/** DELETE: quita URLs de la cola o vacía el registro de auditoría. */
export async function DELETE(request: Request) {
  await requireAdmin()
  if (!(await hasPermission(SEO_INDEXING_MODULE_SLUG, 'delete'))) return forbidden('borrar')

  const body = await request.json().catch(() => ({}))
  const accion = String(body?.accion ?? 'quitar-urls')

  if (accion === 'limpiar-registro') {
    const resultado = await limpiarRegistroDeIndexacion()
    if (resultado.error) return NextResponse.json({ error: resultado.error }, { status: 400 })
    return NextResponse.json({ ok: true })
  }

  if (accion === 'vaciar-cola') {
    const resultado = await vaciarColaDeIndexacion()
    if (resultado.error) return NextResponse.json({ error: resultado.error }, { status: 400 })
    return NextResponse.json({ eliminadas: resultado.eliminadas })
  }

  const ids = Array.isArray(body?.ids) ? body.ids.map((id: unknown) => String(id)) : []
  const resultado = await quitarUrlsDeLaCola(ids)
  if (resultado.error) return NextResponse.json({ error: resultado.error }, { status: 400 })
  return NextResponse.json({ eliminadas: resultado.eliminadas })
}
