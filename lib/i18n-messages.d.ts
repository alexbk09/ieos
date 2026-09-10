/**
 * Declaración de tipos para lib/i18n-messages.mjs.
 * Núcleo de mensajes de interfaz (diccionarios + traductor con fallback).
 */

/** Diccionarios de interfaz por idioma. */
export type Messages = Record<string, Record<string, string>>

/** Variables de interpolación de una plantilla. */
export type MessageVars = Record<string, string | number | null | undefined>

/** Función traductora ligada a un idioma. */
export type Translator = (key: string, vars?: MessageVars) => string

/** Diccionarios de interfaz por idioma: { es: { clave: texto }, ... }. */
export const MESSAGES: Messages

/** Idiomas que tienen diccionario propio. */
export const MESSAGE_LOCALES: readonly string[]

/** Traduce una clave con cadena de fallback e interpolación de variables. */
export function translate(
  messages: Messages,
  locale: string,
  key: string,
  vars?: MessageVars,
): string

/** Crea una función traductora ligada a unos diccionarios y un idioma. */
export function createTranslator(messages: Messages, locale: string): Translator
