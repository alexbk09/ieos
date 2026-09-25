import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { RootShell } from '@/components/root-shell'
import { I18nProvider } from '@/components/i18n-provider'
import { AgentChat } from '@/components/agent-chat'
import { ROOT_VIEWPORT, buildRootMetadata } from '@/lib/root-metadata'
import { publishedLocales } from '@/lib/i18n-config'

/**
 * Root layout del SITIO PÚBLICO (route group `(site)`).
 * ------------------------------------------------------------------
 * Declara <html lang={locale}> con el idioma REAL de la página: es la señal que
 * usa Google para entender el idioma del documento (complementa a hreflang).
 * Solo puede declararse el <html> desde un ROOT layout, por eso el sitio público
 * vive en su propio route group (sin app/layout.tsx global).
 *
 * Cache pública limitada para que las páginas del sitio no regeneren por cada
 * crawler o petición y se siga sirviendo desde CDN con revalidación controlada.
 */
export const revalidate = 300

export const viewport = ROOT_VIEWPORT

/** Fuerza un 404 para idiomas NO publicados (evita exponer versiones a medias). */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>
}): Promise<Metadata> {
  const { locale } = await params
  if (!publishedLocales().includes(locale)) return {}
  // Metadata raíz en el idioma activo (título/descripción traducidos).
  return buildRootMetadata(locale)
}

export default async function SiteLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ locale: string }>
}) {
  const { locale } = await params
  // Blindaje: solo los idiomas PUBLICADOS son accesibles (evita doorway pages).
  if (!publishedLocales().includes(locale)) notFound()

  return (
    <RootShell lang={locale}>
      {/* El idioma se fija UNA vez para todo el árbol cliente (useLocale/t). */}
      <I18nProvider locale={locale}>{children}</I18nProvider>
      {/*
        Asistente de Compra IA: se monta UNA sola vez para TODO el sitio público
        (portada, catálogo, categoría y detalle de producto). Al vivir en el
        layout persiste el estado del chat al navegar entre vistas y evita
        duplicar el widget en cada página (principio DRY / componente atómico).
      */}
      <AgentChat />
    </RootShell>
  )
}
