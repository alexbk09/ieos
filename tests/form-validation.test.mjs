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

// ---------- Formulario de contacto ----------

import { validateContactForm, solveCaptchaExpression } from '../lib/form-validation.mjs'

test('valida un mensaje de contacto correcto', () => {
  const result = validateContactForm({
    name: 'Ana Pérez',
    email: 'ana@example.com',
    message: 'Quiero una cotización para un local comercial',
    captcha: '10',
  })
  assert.equal(result.valid, true)
})

test('rechaza contacto sin nombre, correo o mensaje', () => {
  const result = validateContactForm({ name: '', email: '', message: '', captcha: '' })
  assert.equal(result.valid, false)
  assert.ok(result.errors.name)
  assert.ok(result.errors.email)
  assert.ok(result.errors.message)
  assert.ok(result.errors.captcha)
})

test('rechaza correo inválido en contacto', () => {
  const result = validateContactForm({
    name: 'Ana',
    email: 'correo-malo',
    message: 'Mensaje válido de prueba',
    captcha: '10',
  })
  assert.equal(result.valid, false)
  assert.ok(result.errors.email)
})

test('rechaza mensaje demasiado corto o vacío', () => {
  const corto = validateContactForm({ name: 'Ana', email: 'ana@example.com', message: 'Hola', captcha: '10' })
  const vacio = validateContactForm({ name: 'Ana', email: 'ana@example.com', message: '   ', captcha: '10' })
  assert.equal(corto.valid, false)
  assert.ok(corto.errors.message)
  assert.equal(vacio.valid, false)
  assert.ok(vacio.errors.message)
})

test('resuelve expresiones de captcha suma y resta', () => {
  assert.equal(solveCaptchaExpression('7+3'), 10)
  assert.equal(solveCaptchaExpression('12-5'), 7)
  assert.equal(solveCaptchaExpression(' 3 + 4 '), 7)
  assert.equal(solveCaptchaExpression('5*5'), null)
  assert.equal(solveCaptchaExpression('abc'), null)
  assert.equal(solveCaptchaExpression(null), null)
})
