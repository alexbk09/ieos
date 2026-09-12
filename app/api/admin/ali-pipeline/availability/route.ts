import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { hasPermission } from '@/services/roles'
import { ALI_PIPELINE_MODULE_SLUG } from '@/lib/constants'
import { ejecutarVerificacionDisponibilidad, obtenerResumenDisponibilidad } from '@/services/aliAvailability'

/**
 * API route de VERIFICACIÓN DE DISPONIBILIDAD de afiliados AliExpress (Fase 2.8).
 * ------------------------------------------------------------------
 * - POST -> comprueba el detalle real de la API oficial de los productos
 *           afiliados publicados y degrada/recupera su ficha de forma SEO-safe
 *           (OutOfStock + alternativas; NUNCA oculta el producto). Transmite el
 *           progreso por Server-Sent Events (SSE) para el log en vivo del panel.
 * - GET  -> resumen de salud del catálogo (caídos, en observación, última
 *           verificación) SIN llamar a AliExpress: solo lee lo ya verificado.
 *
 * POR QUÉ no exige credenciales del scraper (a diferencia de /enrich):
 *   esta verificación usa SOLO la API oficial de afiliados. No gasta créditos
 *   de ZenRows/ScraperAPI ni tokens de IA (DeepSeek).
 *
 * Seguridad integrada:
 *   1) requireAdmin() fuerza sesión activa + rol administrador.
 *   2) hasPermission('ali_pipeline', 'write'/'read') valida el permiso RBAC.
 *   3) Todo corre en el servidor: las API keys NUNCA se exponen al navegador.
 */

export const runtime = 'nodejs'
export const maxDuration = 300

/** Codifica un payload como evento SSE (formato "data: ...\n\n"). */
function eventoSSE(evento: string, payload: unknown): string {
  return `event: ${evento}\ndata: ${JSON.stringify(payload)}\n\n`
}

/**
 * Normaliza el límite recibido en el body.
 * `0`, vacío o ausente = tope defensivo del catálogo (rotación reanudable).
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
    return NextResponse.json({ error: 'No tienes permiso para verificar disponibilidad.' }, { status: 403 })
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
        const resultado = await ejecutarVerificacionDisponibilidad({ limite: limit }, (notificacion) => {
          enviar('etapa', notificacion)
        })
        enviar('fin', resultado)
      } catch (err: unknown) {
        const mensaje = err instanceof Error ? err.message : 'Error fatal de la verificación.'
        console.error('[api/ali-pipeline/availability] POST:', mensaje)
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

/** Resumen de salud del catálogo afiliado para la cabecera del panel (GET). */
export async function GET() {
  await requireAdmin()
  const puedeLeer = await hasPermission(ALI_PIPELINE_MODULE_SLUG, 'read')
  if (!puedeLeer) {
    return NextResponse.json({ error: 'No tienes permiso para ver el estado de disponibilidad.' }, { status: 403 })
  }
  const resultado = await obtenerResumenDisponibilidad()
  if (!resultado.success) return NextResponse.json({ error: resultado.error }, { status: 500 })
  return NextResponse.json({ success: true, data: resultado.data })
}
