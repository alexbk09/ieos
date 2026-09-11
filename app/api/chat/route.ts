import { streamText, convertToCoreMessages } from 'ai'
import { buildAgentSystemPrompt, createAgentTools } from '@/services/agent'
import { createDeepSeekProvider, DEEPSEEK_CHAT_MODEL } from '@/services/ai-provider'
import { AGENT_MAX_STEPS, AGENT_TEMPERATURE } from '@/lib/constants'
import { isPublishedLocale, DEFAULT_LOCALE } from '@/lib/i18n-config'

export const runtime = 'nodejs'
export const maxDuration = 30

/** Proveedor central (services/ai-provider): URL, API key y modelo fuera de la ruta. */
const provider = createDeepSeekProvider()

export async function POST(req: Request) {
  try {
    const { messages, locale: rawLocale } = await req.json()
    if (!Array.isArray(messages)) {
      return new Response(JSON.stringify({ error: 'messages requerido' }), { status: 400 })
    }
    // Idioma del visitante: define el idioma de RESPUESTA y el de los nombres de
    // producto/categoría que devuelven las tools. Solo se aceptan idiomas publicados.
    const locale = isPublishedLocale(rawLocale) ? String(rawLocale) : DEFAULT_LOCALE
    // El asistente SOLO atiende temas de la tienda: catalogo, categorias y
    // compras por afiliados (AliExpress/Amazon). El alcance lo impone el prompt.
    const result = streamText({
      model: provider(DEEPSEEK_CHAT_MODEL),
      system: buildAgentSystemPrompt(locale),
      messages: convertToCoreMessages(messages),
      tools: createAgentTools(locale),
      temperature: AGENT_TEMPERATURE,
      maxSteps: AGENT_MAX_STEPS,
    })
    return result.toDataStreamResponse()
  } catch (err) {
    console.error('[chat]', err)
    return new Response(JSON.stringify({ error: 'Error procesando la solicitud' }), { status: 500 })
  }
}