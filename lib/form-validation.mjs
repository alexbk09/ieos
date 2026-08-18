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