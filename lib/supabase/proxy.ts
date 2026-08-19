import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

/**
 * Middleware de sesión optimizado.
 * Solo se ejecuta en rutas protegidas (/admin, /dashboard, /auth).
 * Si no hay cookie de sesión, devuelve la respuesta sin llamar a Supabase Auth (evita latencia innecesaria).
 * Si hay cookie, refresca la sesión con getUser().
 */
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request })

  // Si no hay cookie de sesión (el nombre incluye el ref del proyecto), respuesta inmediata sin llamar a Supabase Auth.
  const hasSessionCookie = request.cookies.getAll().some((c) => c.name.includes('auth-token'))
  if (!hasSessionCookie) return response

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (cookiesToSet) => {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          response = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options))
        },
      },
    },
  )

  // Solo refresca la sesión si existe cookie válida.
  await supabase.auth.getUser()
  return response
}