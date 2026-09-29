import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { hasPermission } from '@/services/roles'
import { ALI_PIPELINE_MODULE_SLUG } from '@/lib/constants'
import { ejecutarPipelineAutomatizacion } from '@/services/aliPipeline'
import { estadoCredencialesAliExpress } from '@/services/aliApi'
import { getPrimaryCategories } from '@/services/catalog'

/**
 * API route del Pipeline de Automatización AliExpress (Fase 2.2).
 * ------------------------------------------------------------------
 * - POST -> ejecuta el pipeline maestro sobre una keyword semilla y
 *           transmite el progreso en tiempo real por Server-Sent Events
 *           (SSE) para que el panel admin muestre toasts por cada etapa.
 * - GET  -> devuelve el estado de configuración de credenciales
 *           (diagnóstico para la UI: qué llaves faltan en el .env).
 *
 * Seguridad integrada:
 *   1) requireAdmin() fuerza sesión activa + rol administrador.
 *   2) hasPermission('ali_pipeline', 'write') valida el permiso RBAC.
 *   3) Todo el pipeline corre en el servidor; las API keys de AliExpress,
 *      DeepSeek y los proxies NUNCA se exponen al navegador.
 *
 * Flujo SSE (eventos enviados al cliente):
 *   - event: "etapa"  -> { etapa, mensaje, productoId?, index?, total? }
 *   - event: "fin"    -> { success, data?, error? } (resultado final)
 */

export const runtime = 'nodejs'
export const maxDuration = 300

/** Valida la keyword semilla enviada en el body. */
function parsearKeyword(body: { keyword?: unknown }): { keyword: string | null; error: string | null } {
  const cruda = typeof body?.keyword === 'string' ? body.keyword.trim() : ''
  if (!cruda) return { keyword: null, error: 'El campo keyword es obligatorio.' }
  if (cruda.length < 2) return { keyword: null, error: 'La keyword debe tener al menos 2 caracteres.' }
  return { keyword: cruda, error: null }
}

/** Codifica un payload como evento SSE (formato "data: ...\n\n"). */
function eventoSSE(evento: string, payload: unknown): string {
  return `event: ${evento}\ndata: ${JSON.stringify(payload)}\n\n`
}

export async function POST(request: Request) {
  const { user } = await requireAdmin()
  const puedeEscribir = await hasPermission(ALI_PIPELINE_MODULE_SLUG, 'write')
  if (!puedeEscribir) {
    return NextResponse.json({ error: 'No tienes permiso para ejecutar el pipeline.' }, { status: 403 })
  }

  const body = (await request.json().catch(() => ({}))) as {
    keyword?: unknown
    categoriaPrincipalId?: unknown
  }
  const { keyword, error } = parsearKeyword(body)
  if (error || !keyword) return NextResponse.json({ error }, { status: 400 })
  const categoriaPrincipalId =
    typeof body.categoriaPrincipalId === 'string' ? body.categoriaPrincipalId.trim() : ''
  if (!categoriaPrincipalId) {
    return NextResponse.json({ error: 'Selecciona un hobby principal para este nicho.' }, { status: 400 })
  }

  // Verifica credenciales antes de abrir el stream para dar feedback temprano.
  const credenciales = estadoCredencialesAliExpress()
  if (!credenciales.appKeyConfigurada || !credenciales.appSecretConfigurado || !credenciales.trackingIdConfigurado) {
    return NextResponse.json(
      { error: 'Faltan credenciales de AliExpress Open Platform en el .env del servidor (ALI_APP_KEY, ALI_APP_SECRET, ALI_TRACKING_ID).' },
      { status: 500 },
    )
  }

  // Abre un stream SSE. El pipeline notifica cada etapa y se reenvía al cliente.
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
        const resultado = await ejecutarPipelineAutomatizacion(keyword, categoriaPrincipalId, (notificacion) => {
          enviar('etapa', notificacion)
        })
        enviar('fin', resultado)
      } catch (err: unknown) {
        const mensaje = err instanceof Error ? err.message : 'Error fatal del pipeline.'
        console.error('[api/ali-pipeline] POST:', mensaje)
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

/** Diagnóstico de credenciales para la UI (GET). */
export async function GET() {
  await requireAdmin()
  const puedeLeer = await hasPermission(ALI_PIPELINE_MODULE_SLUG, 'read')
  if (!puedeLeer) {
    return NextResponse.json({ error: 'No tienes permiso para ver el estado del pipeline.' }, { status: 403 })
  }
  const { data: categorias } = await getPrimaryCategories()
  return NextResponse.json({
    success: true,
    data: { ...estadoCredencialesAliExpress(), categoriasPrincipales: categorias ?? [] },
  })
}
