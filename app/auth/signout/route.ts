import { NextResponse } from 'next/server'
import { signOutServer } from '@/services/auth-server'

/**
 * API: Cerrar sesión del usuario.
 * La lógica de auth vive en /services/auth.
 */
export async function POST(request: Request) {
  await signOutServer()
  return NextResponse.redirect(new URL('/', request.url), 303)
}
