import { streamText, convertToCoreMessages } from 'ai'
import { AGENT_SYSTEM_PROMPT, AGENT_TOOLS } from '@/services/agent'
import { createDeepSeekProvider, DEEPSEEK_CHAT_MODEL } from '@/services/ai-provider'
import { AGENT_MAX_STEPS, AGENT_TEMPERATURE } from '@/lib/constants'

export const runtime = 'nodejs'
export const maxDuration = 30

/** Proveedor central (services/ai-provider): URL, API key y modelo fuera de la ruta. */
const provider = createDeepSeekProvider()

export async function POST(req: Request) {
  try {
    const { messages } = await req.json()
    if (!Array.isArray(messages)) {
      return new Response(JSON.stringify({ error: 'messages requerido' }), { status: 400 })
    }
    // El asistente SOLO atiende temas de la tienda: catalogo, categorias y
    // compras por afiliados (AliExpress/Amazon). El alcance lo impone AGENT_SYSTEM_PROMPT.
    const result = streamText({
      model: provider(DEEPSEEK_CHAT_MODEL),
      system: AGENT_SYSTEM_PROMPT,
      messages: convertToCoreMessages(messages),
      tools: AGENT_TOOLS,
      temperature: AGENT_TEMPERATURE,
      maxSteps: AGENT_MAX_STEPS,
    })
    return result.toDataStreamResponse()
  } catch (err) {
    console.error('[chat]', err)
    return new Response(JSON.stringify({ error: 'Error procesando la solicitud' }), { status: 500 })
  }
}