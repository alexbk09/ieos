import { NextResponse } from 'next/server'
import { getSiteSettings } from '@/services/site-settings'

/**
 * API dinámica del ícono del sitio (/api/site-icon).
 * Redirige a la URL del ícono configurado por el admin en site_settings.
 * Si no hay ícono configurado devuelve 404 (el navegador usa el fallback).
 */
export async function GET() {
  const { settings } = await getSiteSettings()
  if (settings.icon_url) {
    return NextResponse.redirect(settings.icon_url, 302)
  }
  return new NextResponse(null, { status: 404 })
}
