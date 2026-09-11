import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { hasPermission } from '@/services/roles'
import { ALI_PIPELINE_MODULE_SLUG } from '@/lib/constants'
import { ejecutarEnriquecimientoLote } from '@/services/aliEnrich'
import { estadoCredencialesScraper } from '@/services/aliScraper'

/**
 * API route del RE-ENRIQUECIMIENTO de productos AliExpress (Fase 2.6).
 * ------------------------------------------------------------------
 * - POST -> re-extrae el detalle real de los productos afiliados ya publicados
 *           (precio, disponibilidad, specs, marca, valoración y reseñas) y
 *           actualiza SOLO esos campos, sin tocar el SEO indexado. Transmite el
 *           progreso por Server-Sent Events (SSE) para el log en vivo del panel.
 * - GET  -> diagnóstico de credenciales del scraper (feedback temprano).
 *
 * Seguridad integrada:
 *   1) requireAdmin() fuerza sesión activa + rol administrador.
 *   2) hasPermission('ali_pipeline', 'write') valida el permiso RBAC.
 *   3) Todo corre en el servidor: las API keys del proxy NUNCA se exponen.
 */

export const runtime = 'nodejs'
export const maxDuration = 300

/** Codifica un payload como evento SSE (formato "data: ...\n\n"). */
function eventoSSE(evento: string, payload: unknown): string {
  return `event: ${evento}\ndata: ${JSON.stringify(payload)}\n\n`
}

/**
 * Normaliza el límite recibido en el body.
 * `0`, vacío o ausente = TODOS los productos (modo completo).
 */
function parsearLimite(body: { limit?: unknown }): number | undefined {
  const crudo = Number(body?.limit)
  if (!Number.isFinite(crudo) || crudo <= 0) return undefined
  return Math.floor(crudo)
}

export async function POST(request: Request) {
  await requireAdmin()
  const puedeEscribir = await hasPermission(ALI_PIPELINE_MODULE_SLUG, 'write')
  if (!puedeEscribir) {
    return NextResponse.json({ error: 'No tienes permiso para re-enriquecer productos.' }, { status: 403 })
  }

  // Verifica el proxy de scraping antes de abrir el stream (feedback temprano).
  const credenciales = estadoCredencialesScraper()
  if (!credenciales.zenrowsConfigurado && !credenciales.scraperApiConfigurada) {
    return NextResponse.json(
      { error: 'Faltan credenciales del scraper (ZENROWS_API_KEY o SCRAPERAPI_API_KEY) en el .env del servidor.' },
      { status: 500 },
    )
  }

  const body = (await request.json().catch(() => ({}))) as { limit?: unknown }
  const limit = parsearLimite(body)

  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    async start(controlador) {
      const enviar = (evento: string, payload: unknown) => {
        try {
          controlador.enqueue(encoder.encode(eventoSSE(evento, payload)))
        } catch {
          // El cliente cerró el stream; no hacemos nada más.
        }
      }

      try {
        const resultado = await ejecutarEnriquecimientoLote({ limit }, (notificacion) => {
          enviar('etapa', notificacion)
        })
        enviar('fin', resultado)
      } catch (err: unknown) {
        const mensaje = err instanceof Error ? err.message : 'Error fatal del re-enriquecimiento.'
        console.error('[api/ali-pipeline/enrich] POST:', mensaje)
        enviar('fin', { success: false, error: mensaje })
      } finally {
        try {
          controlador.close()
        } catch {
          // Stream ya cerrado.
        }
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  })
}

/** Diagnóstico de credenciales del scraper para la UI (GET). */
export async function GET() {
  await requireAdmin()
  const puedeLeer = await hasPermission(ALI_PIPELINE_MODULE_SLUG, 'read')
  if (!puedeLeer) {
    return NextResponse.json({ error: 'No tienes permiso para ver el estado del re-enriquecimiento.' }, { status: 403 })
  }
  return NextResponse.json({ success: true, data: estadoCredencialesScraper() })
}
