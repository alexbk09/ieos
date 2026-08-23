/**
 * Lógica pura de validación de formularios.
 * Independiente de Supabase para permitir testing económico.
 */

/**
 * Valida los datos del formulario de producto.
 * @param {Object} data Datos del formulario.
 * @param {string} data.name Nombre del producto.
 * @param {string} data.slug Slug del producto.
 * @param {number|string} data.price_usd Precio en USD.
 * @param {number|string} data.stock Stock disponible.
 * @returns {{ valid: boolean; errors?: Record<string, string> }}
 */
export function validateProductForm(data) {
  const errors = {}

  if (!data.name || !String(data.name).trim()) errors.name = 'El nombre es obligatorio'
  if (!data.slug || !String(data.slug).trim()) errors.slug = 'El slug es obligatorio'

  const price = Number(data.price_usd)
  if (!Number.isFinite(price) || price < 0) errors.price_usd = 'El precio debe ser un número válido'

  const stock = Number(data.stock)
  if (!Number.isInteger(stock) || stock < 0) errors.stock = 'El stock debe ser un entero no negativo'

  return Object.keys(errors).length ? { valid: false, errors } : { valid: true }
}

/**
 * Valida los datos del formulario de categoría.
 * @param {Object} data Datos del formulario.
 * @param {string} data.name Nombre de la categoría.
 * @param {string} data.slug Slug de la categoría.
 * @returns {{ valid: boolean; errors?: Record<string, string> }}
 */
export function validateCategoryForm(data) {
  const errors = {}

  if (!data.name || !String(data.name).trim()) errors.name = 'El nombre es obligatorio'
  if (!data.slug || !String(data.slug).trim()) errors.slug = 'El slug es obligatorio'

  return Object.keys(errors).length ? { valid: false, errors } : { valid: true }
}

/**
 * Valida los datos del formulario de contacto del sitio.
 * Lógica pura independiente de Supabase para testing económico.
 * @param {Object} data Datos del formulario.
 * @param {string} data.name Nombre de la persona.
 * @param {string} data.email Correo electrónico.
 * @param {string} data.message Mensaje.
 * @param {string} [data.captcha] Respuesta del captcha.
 * @returns {{ valid: boolean; errors?: Record<string, string> }}
 */
export function validateContactForm(data) {
  const errors = {}

  // Nombre: obligatorio, mínimo 2 caracteres.
  const name = String(data?.name ?? '').trim()
  if (!name) errors.name = 'El nombre es obligatorio'
  else if (name.length < 2) errors.name = 'El nombre debe tener al menos 2 caracteres'

  // Correo: obligatorio y con formato válido.
  const email = String(data?.email ?? '').trim().toLowerCase()
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/
  if (!email) errors.email = 'El correo es obligatorio'
  else if (!emailRegex.test(email)) errors.email = 'Ingresa un correo electrónico válido'

  // Mensaje: obligatorio, mínimo 10 caracteres, máximo 3000.
  const message = String(data?.message ?? '').trim()
  if (!message) errors.message = 'El mensaje es obligatorio'
  else if (message.length < 10) errors.message = 'El mensaje debe tener al menos 10 caracteres'
  else if (message.length > 3000) errors.message = 'El mensaje no puede superar los 3000 caracteres'

  // Captcha: respuesta obligatoria (debe llegar ya resuelta desde el cliente).
  const captcha = String(data?.captcha ?? '').trim()
  if (!captcha) errors.captcha = 'Resuelve el captcha para continuar'

  return Object.keys(errors).length ? { valid: false, errors } : { valid: true }
}

/**
 * Resuelve la operación matemática de un captcha (formato "a+b" o "a-b").
 * Devuelve null si la expresión no es válida.
 * @param {string} expression Expresión tipo "7+3" o "9-4".
 * @returns {number|null}
 */
export function solveCaptchaExpression(expression) {
  if (typeof expression !== 'string') return null
  const match = expression.match(/^\s*(-?\d+)\s*([+\-])\s*(-?\d+)\s*$/)
  if (!match) return null
  const a = Number(match[1])
  const op = match[2]
  const b = Number(match[3])
  if (op === '+') return a + b
  if (op === '-') return a - b
  return null
}
