import { test } from 'node:test'
import assert from 'node:assert/strict'
import { validateProductForm, validateCategoryForm } from '../lib/form-validation.mjs'

test('valida un producto correcto', () => {
  const result = validateProductForm({ name: 'Panel LED', slug: 'panel-led', price_usd: 28, stock: 10 })
  assert.equal(result.valid, true)
})

test('rechaza producto sin nombre o slug', () => {
  const result = validateProductForm({ name: '', slug: '', price_usd: 28, stock: 10 })
  assert.equal(result.valid, false)
  assert.ok(result.errors.name)
  assert.ok(result.errors.slug)
})

test('rechaza precio negativo o no numérico', () => {
  const negative = validateProductForm({ name: 'X', slug: 'x', price_usd: -5, stock: 10 })
  const invalid = validateProductForm({ name: 'X', slug: 'x', price_usd: 'abc', stock: 10 })
  assert.equal(negative.valid, false)
  assert.ok(negative.errors.price_usd)
  assert.equal(invalid.valid, false)
  assert.ok(invalid.errors.price_usd)
})

test('rechaza stock no entero o negativo', () => {
  const negative = validateProductForm({ name: 'X', slug: 'x', price_usd: 10, stock: -1 })
  const fractional = validateProductForm({ name: 'X', slug: 'x', price_usd: 10, stock: 2.5 })
  assert.equal(negative.valid, false)
  assert.ok(negative.errors.stock)
  assert.equal(fractional.valid, false)
  assert.ok(fractional.errors.stock)
})

test('valida una categoría correcta', () => {
  const result = validateCategoryForm({ name: 'LED', slug: 'led' })
  assert.equal(result.valid, true)
})

test('rechaza categoría sin nombre o slug', () => {
  const result = validateCategoryForm({ name: '', slug: '' })
  assert.equal(result.valid, false)
  assert.ok(result.errors.name)
  assert.ok(result.errors.slug)
})