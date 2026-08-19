import { updateSession } from '@/lib/supabase/proxy'
import type { NextRequest } from 'next/server'

export async function proxy(request: NextRequest) { return updateSession(request) }

/** Middleware solo en rutas que necesitan sesión o auth. Las públicas se sirven directo del CDN. */
export const config = { matcher: ['/admin/:path*', '/dashboard/:path*', '/auth/:path*'] }