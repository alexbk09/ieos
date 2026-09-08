/**
 * Declaración de tipos para lib/form-validation.mjs.
 */

export function validateProductForm(data: {
  name?: unknown
  slug?: unknown
  price_usd?: unknown
  stock?: unknown
}): { valid: boolean; errors?: Record<string, string> }

export function validateCategoryForm(data: {
  name?: unknown
  slug?: unknown
}): { valid: boolean; errors?: Record<string, string> }

export function validateContactForm(data: {
  name?: unknown
  email?: unknown
  message?: unknown
  captcha?: unknown
}): { valid: boolean; errors?: Record<string, string> }

export function solveCaptchaExpression(expression: unknown): number | null