/**
 * Detecta errores de cuota en AliExpress y devuelve un backoff defensivo.
 * Evita que el pipeline reintente en bucle sin pausa cuando AliExpress responde
 * con "ApiCallLimit" o un 429/"rate limit".
 */

export function detectAliApiRateLimit(payload) {
  const valorCrudo = typeof payload === 'string' ? payload : JSON.stringify(payload ?? {})
  const texto = String(valorCrudo ?? '').toLowerCase()

  const isRateLimit = /(apicalllimit|rate limit|too many requests|frequency exceeds the limit|ban will last|quota exceeded|429)/i.test(texto)
  const codigo = typeof payload === 'object' && payload && 'code' in payload ? String(payload.code) : 'ApiCallLimit'

  return {
    isRateLimit,
    retryDelayMs: isRateLimit ? 5000 : 0,
    message: isRateLimit ? `AliExpress rate limit reached (${codigo}).` : '',
  }
}

export function getAliRateLimitDelayMs(payload) {
  return detectAliApiRateLimit(payload).isRateLimit ? 5000 : 1200
}
