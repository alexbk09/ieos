import { NextResponse } from 'next/server'
import { exchangeCodeForSession } from '@/services/auth-server'

/**
 * API: Callback OAuth de Supabase.
 * Intercambia el código por una sesión a través de /services/auth.
 */
export async function GET(request: Request) {
  const url = new URL(request.url)
  const code = url.searchParams.get('code')
  if (code) await exchangeCodeForSession(code)
  return NextResponse.redirect(new URL('/', request.url))
}
