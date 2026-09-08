import { streamText, convertToCoreMessages } from 'ai'
import { createOpenAICompatible } from '@ai-sdk/openai-compatible'
import { AGENT_SYSTEM_PROMPT, AGENT_TOOLS } from '@/services/agent'

export const runtime = 'nodejs'
export const maxDuration = 30

const provider = createOpenAICompatible({
  name: 'deepseek',
  baseURL: process.env.DEEPSEEK_BASE_URL ?? 'https://api.deepseek.com/v1',
  apiKey: process.env.DEEPSEEK_API_KEY ?? '',
})

export async function POST(req: Request) {
  try {
    const { messages } = await req.json()
    if (!Array.isArray(messages)) {
      return new Response(JSON.stringify({ error: 'messages requerido' }), { status: 400 })
    }
    const result = streamText({
      model: provider('deepseek-chat'),
      system: AGENT_SYSTEM_PROMPT,
      messages: convertToCoreMessages(messages),
      tools: AGENT_TOOLS,
      temperature: 0.3,
      maxSteps: 4,
    })
    return result.toDataStreamResponse()
  } catch (err) {
    console.error('[chat]', err)
    return new Response(JSON.stringify({ error: 'Error procesando la solicitud' }), { status: 500 })
  }
}
