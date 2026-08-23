import { NextResponse } from 'next/server'
import { sendContactMessage } from '@/services/contact'
import { getSiteSettings } from '@/services/site-settings'

/**
 * API pública: envía un mensaje del formulario de contacto.
 * Verifica el captcha (cookie HTTP-only firmada) y envía el correo SMTP.
 * No requiere autenticación (es la portada pública), pero sí pasar el captcha.
 */
export async function POST(request: Request) {
  // Leer la cookie del captcha generada por /api/captcha.
  const cookieHeader = request.headers.get('cookie') ?? ''
  const captchaCookie = cookieHeader
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith('ilumax_captcha='))
  const token = captchaCookie ? decodeURIComponent(captchaCookie.split('=')[1]) : null

  const body = (await request.json().catch(() => ({}))) as {
    name?: string
    email?: string
    message?: string
    captcha?: string
  }

  // Nombre de la empresa para asunto/remitente del correo.
  const { settings } = await getSiteSettings()

  const result = await sendContactMessage(
    {
      name: String(body.name ?? '').trim(),
      email: String(body.email ?? '').trim(),
      message: String(body.message ?? '').trim(),
      token: token ?? '',
      captchaAnswer: String(body.captcha ?? '').trim(),
    },
    settings.company_name,
  )

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 })
  }

  return NextResponse.json({ ok: true })
}