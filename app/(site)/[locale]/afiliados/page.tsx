import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { LegalPageView } from '@/components/legal-page-view'
import { getSiteSettings } from '@/services/site-settings'
import { buildPageMetadata } from '@/lib/seo'
import { absoluteUrl } from '@/lib/seo-url'
import { buildLocalizedPath, publishedLocales } from '@/lib/i18n-config'
import { OG_IMAGE_PATH } from '@/lib/constants'
import { createTranslator, MESSAGES } from '@/lib/i18n-messages'
import {
  buildLegalDocLinks,
  getLegalDocument,
  renderLegalText,
  type LegalDocKey,
} from '@/lib/legal-content'

/**
 * Página legal pública: /afiliados (Aviso de Afiliado).
 * ------------------------------------------------------------------
 * POR QUÉ existe: es uno de los 3 documentos legales enlazados desde el footer.
 * El contenido vive en la fuente única `lib/legal-content.ts`; aquí solo se
 * compone la metadata SEO y se delega el render a `LegalPageView`.
 */

/** Revalidación corta para mantener el aviso legal estable y evitar render de
 * cada request o crawl sin necesidad. */
export const revalidate = false

/** El documento existe en CADA idioma publicado (hreflang completo). */
export function generateStaticParams() {
  return publishedLocales().map((locale) => ({ locale }))
}

/** Clave del documento: los textos se resuelven por idioma con `getLegalDocument`. */
const DOCUMENT_KEY: LegalDocKey = 'affiliate'

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params
  const t = createTranslator(MESSAGES, locale)
  const { settings } = await getSiteSettings(locale)
  const name = settings.company_name || 'zonadehobbies'
  // Documento LOCALIZADO: traducido si existe; si no, idioma raiz (fallback).
  const document = getLegalDocument(DOCUMENT_KEY, locale)
  return buildPageMetadata({
    title: `${t(document.titleKey)} | ${name}`,
    description: renderLegalText(document.summary, { name }),
    path: buildLocalizedPath(document.path, locale, { prefixDefaultLocale: false }),
    image: absoluteUrl(OG_IMAGE_PATH),
    siteName: name,
    alternatesByLocale: Object.fromEntries(
      publishedLocales().map((l) => [l, buildLocalizedPath(document.path, l, { prefixDefaultLocale: false })]),
    ),
  })
}

export default async function AfiliadosPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  // Blindaje: solo idiomas PUBLICADOS (evita exponer versiones a medias).
  if (!publishedLocales().includes(locale)) notFound()

  const t = createTranslator(MESSAGES, locale)
  const { settings } = await getSiteSettings(locale)

  const document = getLegalDocument(DOCUMENT_KEY, locale)

  return (
    <LegalPageView
      document={document}
      title={t(document.titleKey)}
      otherDocs={buildLegalDocLinks(locale, t, document.key)}
      t={t}
      locale={locale}
      brandName={settings.company_name || 'zonadehobbies'}
      email={settings.email || ''}
      address={settings.address || ''}
      footer={settings.footer_texts}
      social={settings.social_links}
      logoUrl={settings.logo_url}
      iconUrl={settings.icon_url}
      whatsapp={settings.whatsapp_number}
    />
  )
}
