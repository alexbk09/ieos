import { NextResponse } from 'next/server'
import { createCaptcha } from '@/services/contact'

/**
 * API pública: genera un captcha nuevo.
 * Devuelve la expresión matemática al cliente y guarda la respuesta
 * firmada en una cookie HTTP-only (el navegador jamás ve la respuesta).
 * El envío del formulario verifica la cookie contra la respuesta en
 * /api/contact antes de mandar el correo.
 */
export async function GET() {
  const { expression, token } = createCaptcha()

  const response = NextResponse.json({ expression })
  response.cookies.set('zonadehobbies_captcha', token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 10 * 60, // 10 minutos (mismo TTL que el token)
  })

  return response
}