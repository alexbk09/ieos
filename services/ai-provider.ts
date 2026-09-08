import { createOpenAICompatible } from '@ai-sdk/openai-compatible'

/**
 * Proveedor central de DeepSeek (API compatible OpenAI).
 * Centraliza URL base, API key y modelo para que el chat del Agente
 * de Compra y el pipeline SEO compartan una única configuración.
 */

export const DEEPSEEK_BASE_URL = process.env.DEEPSEEK_BASE_URL ?? 'https://api.deepseek.com/v1'

export const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY ?? ''

export const DEEPSEEK_CHAT_MODEL = process.env.DEEPSEEK_MODEL ?? 'deepseek-chat'

/** Crea una instancia configurada del proveedor compatible OpenAI. */
export function createDeepSeekProvider() {
  return createOpenAICompatible({
    name: 'deepseek',
    baseURL: DEEPSEEK_BASE_URL,
    apiKey: DEEPSEEK_API_KEY,
  })
}