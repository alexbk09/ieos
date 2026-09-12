import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { LegalPageView } from '@/components/legal-page-view'
import { getSiteSettings } from '@/services/site-settings'
import { buildPageMetadata } from '@/lib/seo'
import { absoluteUrl } from '@/lib/seo-url'
import { buildLocalizedPath, publishedLocales } from '@/lib/i18n-config'
import { OG_IMAGE_PATH } from '@/lib/constants'
import { createTranslator, MESSAGES } from '@/lib/i18n-messages'
import { LEGAL_DOCUMENTS, buildLegalDocLinks, renderLegalText } from '@/lib/legal-content'

/**
 * Página legal pública: /terminos (Términos y Condiciones).
 * ------------------------------------------------------------------
 * POR QUÉ existe: es uno de los 3 documentos legales enlazados desde el footer.
 * El contenido vive en la fuente única `lib/legal-content.ts`; aquí solo se
 * compone la metadata SEO y se delega el render a `LegalPageView`.
 */

/** Revalidación: el layout del sitio ya fija 300s (el mínimo prevalece). */
export const revalidate = 3600

/** El documento existe en CADA idioma publicado (hreflang completo). */
export function generateStaticParams() {
  return publishedLocales().map((locale) => ({ locale }))
}

/** Documento servido por esta ruta (fuente única). */
const DOCUMENT = LEGAL_DOCUMENTS.terms

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params
  const t = createTranslator(MESSAGES, locale)
  const { settings } = await getSiteSettings(locale)
  const name = settings.company_name || 'zonadehobbies'
  return buildPageMetadata({
    title: `${t(DOCUMENT.titleKey)} | ${name}`,
    description: renderLegalText(DOCUMENT.summary, { name }),
    path: buildLocalizedPath(DOCUMENT.path, locale, { prefixDefaultLocale: false }),
    image: absoluteUrl(OG_IMAGE_PATH),
    siteName: name,
    alternatesByLocale: Object.fromEntries(
      publishedLocales().map((l) => [l, buildLocalizedPath(DOCUMENT.path, l, { prefixDefaultLocale: false })]),
    ),
  })
}

export default async function TerminosPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  // Blindaje: solo idiomas PUBLICADOS (evita exponer versiones a medias).
  if (!publishedLocales().includes(locale)) notFound()

  const t = createTranslator(MESSAGES, locale)
  const { settings } = await getSiteSettings(locale)

  return (
    <LegalPageView
      document={DOCUMENT}
      title={t(DOCUMENT.titleKey)}
      otherDocs={buildLegalDocLinks(locale, t, DOCUMENT.key)}
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
