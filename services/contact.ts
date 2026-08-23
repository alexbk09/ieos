import nodemailer from 'nodemailer'
import { createHmac, timingSafeEqual } from 'crypto'
import { validateContactForm, solveCaptchaExpression } from '@/lib/form-validation'

/**
 * Servicio de contacto del sitio.
 * Envía mensajes del formulario de contacto por correo SMTP (nodemailer).
 * Incluye un captcha matemático reforzado:
 *   - GET  /api/captcha  genera la expresión y guarda la respuesta en una
 *     cookie HTTP-only firmada con HMAC (el cliente jamás ve la respuesta).
 *   - POST /api/contact  verifica la cookie firmada contra la respuesta del
 *     usuario en el servidor antes de enviar el correo.
 * Toda la lógica pura de validación vive en /lib/form-validation.
 * No hay llamadas directas a Supabase aquí (regla de oro).
 */

// ---------- Captcha ----------

/** Segundos de validez de una respuesta de captcha. */
const CAPTCHA_TTL_SECONDS = 10 * 60

/** Secreto HMAC para firmar la cookie del captcha. */
function getCaptchaSecret(): string {
  return (
    process.env.CAPTCHA_SECRET ||
    process.env.SUPABASE_JWT_SECRET ||
    'ilumax-captcha-secret-dev'
  )
}

/** Codifica un payload a base64url. */
function toBase64Url(value: string): string {
  return Buffer.from(value, 'utf8').toString('base64url')
}

/** Decodifica un payload de base64url. */
function fromBase64Url(value: string): string {
  return Buffer.from(value, 'base64url').toString('utf8')
}

/** Firma un payload con HMAC-SHA256. */
function sign(payload: string): string {
  return createHmac('sha256', getCaptchaSecret()).update(payload).digest('base64url')
}

/**
 * Genera una expresión de captcha aleatoria ("a+b" o "a-b").
 * @returns Expresión tipo "7+3" o "12-5".
 */
function generateCaptchaExpression(): string {
  const useSum = Math.random() < 0.5
  const a = Math.floor(Math.random() * 18) + 1
  const b = Math.floor(Math.random() * 9) + 1
  return (useSum || b > a) ? `${a}+${b}` : `${a}-${b}`
}

/**
 * Crea el token firmado que viaja en la cookie HTTP-only.
 * @param answer Respuesta correcta del captcha.
 * @returns Token "payload.firma".
 */
export function createCaptchaToken(answer: number): string {
  const payload = JSON.stringify({
    answer,
    exp: Date.now() + CAPTCHA_TTL_SECONDS * 1000,
  })
  const encoded = toBase64Url(payload)
  return `${encoded}.${sign(encoded)}`
}

/**
 * Verifica el token firmado contra la respuesta enviada por el usuario.
 * @param token Token de la cookie (o null/undefined).
 * @param answer Respuesta del usuario (string).
 * @returns true si el token es válido, no ha expirado y la respuesta coincide.
 */
export function verifyCaptchaToken(token: string | null | undefined, answer: string | number): boolean {
  if (!token || typeof token !== 'string') return false
  const parts = token.split('.')
  if (parts.length !== 2) return false
  const [encoded, signature] = parts
  // Comparamos firmas en tiempo constante para evitar timing attacks.
  const expectedSignature = sign(encoded)
  const a = Buffer.from(signature, 'utf8')
  const b = Buffer.from(expectedSignature, 'utf8')
  if (a.length !== b.length || !timingSafeEqual(a, b)) return false

  // Decodificar payload y validar expiración/respuesta.
  let payload: { answer: number; exp: number }
  try {
    payload = JSON.parse(fromBase64Url(encoded))
  } catch {
    return false
  }
  if (typeof payload?.answer !== 'number' || typeof payload?.exp !== 'number') return false
  if (Date.now() > payload.exp) return false

  const userAnswer = Number(String(answer ?? '').trim())
  return Number.isFinite(userAnswer) && userAnswer === payload.answer
}

/**
 * Genera un captcha nuevo: devuelve la expresión al cliente y el token
 * firmado para la cookie HTTP-only.
 * @returns { expression: string; token: string }
 */
export function createCaptcha() {
  const expression = generateCaptchaExpression()
  const answer = solveCaptchaExpression(expression) ?? 0
  return { expression, token: createCaptchaToken(answer) }
}

// ---------- Envío del correo ----------

/** Datos normalizados del formulario de contacto. */
export type ContactInput = {
  name: string
  email: string
  message: string
  /** Token firmado de la cookie del captcha. */
  token: string
  /** Respuesta del captcha escrita por el usuario. */
  captchaAnswer: string
}

/** Escapa HTML para el cuerpo del correo (entidades numéricas para no ser alteradas por formatters). */
function escapeHtml(text: string | null | undefined): string {
  if (!text) return ''
  return String(text)
    .replace(/&/g, '\u0026amp;')
    .replace(/</g, '\u0026lt;')
    .replace(/>/g, '\u0026gt;')
    .replace(/"/g, '\u0026quot;')
    .replace(/'/g, '\u0026#039;')
}

/**
 * Renderiza un HTML moderno del mensaje de contacto para el correo.
 * @param input Datos del formulario.
 * @param companyName Nombre de la empresa.
 */
function renderContactEmailHtml(input: Omit<ContactInput, 'token' | 'captchaAnswer'>, companyName: string): string {
  const date = new Date().toLocaleDateString('es-VE', { day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })
  return `
    <!DOCTYPE html>
    <html>
    <head><meta charset="utf-8" /></head>
    <body style="margin:0;padding:0;background-color:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f3f4f6;padding:24px 0">
        <tr><td align="center">
          <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 12px rgba(0,0,0,.08)">
            <tr>
              <td style="background:linear-gradient(135deg,#0e7490,#06b6d4);padding:28px 32px;color:#ffffff">
                <table role="presentation" width="100%">
                  <tr>
                    <td style="font-size:22px;font-weight:700">${escapeHtml(companyName)}</td>
                    <td align="right" style="font-size:12px;opacity:.85">Nuevo mensaje de contacto<br/>${escapeHtml(date)}</td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr><td style="padding:28px 32px">
              <h2 style="margin:0 0 20px;font-size:20px;color:#111827">📬 Recibiste un mensaje del sitio</h2>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;border-radius:8px">
                <tr>
                  <td style="padding:12px 16px;font-size:12px;color:#6b7280;text-transform:uppercase;background-color:#f9fafb;width:140px">Nombre</td>
                  <td style="padding:12px 16px;font-size:14px;color:#1f2937">${escapeHtml(input.name)}</td>
                </tr>
                <tr style="border-top:1px solid #e5e7eb">
                  <td style="padding:12px 16px;font-size:12px;color:#6b7280;text-transform:uppercase;background-color:#f9fafb">Correo</td>
                  <td style="padding:12px 16px;font-size:14px;color:#1f2937">
                    <a href="mailto:${escapeHtml(input.email)}" style="color:#0e7490">${escapeHtml(input.email)}</a>
                  </td>
                </tr>
                <tr style="border-top:1px solid #e5e7eb">
                  <td style="padding:12px 16px;font-size:12px;color:#6b7280;text-transform:uppercase;background-color:#f9fafb">Mensaje</td>
                  <td style="padding:12px 16px;font-size:14px;color:#374151;line-height:1.6;white-space:pre-wrap">${escapeHtml(input.message)}</td>
                </tr>
              </table>
              <p style="margin:20px 0 0;font-size:12px;color:#9ca3af">Responder a: <a href="mailto:${escapeHtml(input.email)}" style="color:#0e7490">${escapeHtml(input.email)}</a></p>
            </td></tr>
            <tr><td style="background-color:#f9fafb;padding:16px 32px;text-align:center;font-size:12px;color:#9ca3af">
              ${escapeHtml(companyName)} · Mensaje enviado desde el formulario de contacto.
            </td></tr>
          </table>
        </td></tr>
      </table>
    </body>
    </html>
  `
}

/**
 * Envía un mensaje de contacto por correo SMTP.
 *
 * Flujo:
 *   1. Valida el formulario con lógica pura (/lib/form-validation).
 *   2. Verifica el captcha firmado (cookie token + respuesta).
 *   3. Envía el correo con nodemailer usando SMTP_HOST/PORT/USER/PASS/FROM.
 *
 * @param input Datos del formulario ya normalizados desde la API.
 * @param companyName Nombre de la empresa (asunto + remitente).
 */
export async function sendContactMessage(input: ContactInput, companyName: string) {
  // 1) Validación pura del formulario.
  const validation = validateContactForm({
    name: input.name,
    email: input.email,
    message: input.message,
    captcha: input.captchaAnswer,
  })
  if (!validation.valid) {
    const firstError = Object.values(validation.errors ?? {})[0]
    return { ok: false as const, error: firstError ?? 'Revisa los campos del formulario' }
  }

  // 2) Verificar captcha en servidor (cookie firmada + respuesta).
  if (!verifyCaptchaToken(input.token, input.captchaAnswer)) {
    return { ok: false as const, error: 'El captcha es incorrecto o expiró. Inténtalo de nuevo.' }
  }

  // 3) Configuración SMTP.
  const host = process.env.SMTP_HOST
  const port = Number(process.env.SMTP_PORT || 587)
  const user = process.env.SMTP_USER
  const pass = process.env.SMTP_PASS
  const from = process.env.SMTP_FROM || user
  let to = process.env.CONTACT_TO_EMAIL || from

  if (!host || !user || !pass || !from) {
    return { ok: false as const, error: 'SMTP no configurado. Agrega SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS y SMTP_FROM al .env' }
  }

  const transporter = nodemailer.createTransport({
    host,
    port,
    secure: Number(process.env.SMTP_SECURE ?? 0) === 1,
    auth: { user, pass },
  })

  const html = renderContactEmailHtml(
    { name: input.name, email: input.email, message: input.message },
    companyName,
  )

  const subject = `Nuevo mensaje de contacto · ${input.name} · ${companyName}`

  try {
    await transporter.sendMail({
      from: `"${companyName}" <${from}>`,
      to,
      replyTo: input.email,
      subject,
      html,
    })
    return { ok: true as const }
  } catch (err: any) {
    return { ok: false as const, error: err?.message ?? 'No se pudo enviar el correo' }
  }
}