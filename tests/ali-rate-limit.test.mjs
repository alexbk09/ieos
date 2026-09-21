import test from 'node:test'
import assert from 'node:assert/strict'

import { detectAliApiRateLimit, getAliRateLimitDelayMs } from '../lib/ali-rate-limit.mjs'

test('detectAliApiRateLimit reconoce ApiCallLimit de AliExpress', () => {
  const payload = {
    type: 'ISV',
    code: 'ApiCallLimit',
    msg: 'Api access frequency exceeds the limit...',
  }

  const resultado = detectAliApiRateLimit(payload)

  assert.equal(resultado.isRateLimit, true)
  assert.equal(resultado.retryDelayMs, 5000)
  assert.equal(resultado.message.includes('ApiCallLimit'), true)
})

test('getAliRateLimitDelayMs devuelve un backoff defensivo', () => {
  assert.equal(getAliRateLimitDelayMs('ApiCallLimit'), 5000)
  assert.equal(getAliRateLimitDelayMs('other-error'), 1200)
})
