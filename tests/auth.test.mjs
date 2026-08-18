import { test } from 'node:test'
import assert from 'node:assert/strict'
import { normalizeRole } from '../lib/role-normalizer.mjs'

test('normaliza "admin" a admin', () => {
  assert.equal(normalizeRole('admin'), 'admin')
})

test('normaliza "ADMIN" (mayúsculas) a admin', () => {
  assert.equal(normalizeRole('ADMIN'), 'admin')
})

test('normaliza 1 (legacy) a admin', () => {
  assert.equal(normalizeRole(1), 'admin')
  assert.equal(normalizeRole('1'), 'admin')
})

test('normaliza "client" a client', () => {
  assert.equal(normalizeRole('client'), 'client')
  assert.equal(normalizeRole('CLIENT'), 'client')
})

test('normaliza "user" (legacy) a client', () => {
  assert.equal(normalizeRole('user'), 'client')
})

test('normaliza valores desconocidos a client', () => {
  assert.equal(normalizeRole(null), 'client')
  assert.equal(normalizeRole(undefined), 'client')
  assert.equal(normalizeRole('moderator'), 'client')
  assert.equal(normalizeRole(''), 'client')
})