import type { Metadata } from 'next'
import Link from 'next/link'
import { SiteFooter } from '@/components/site-footer'
import { getSiteSettings } from '@/services/site-settings'
import { buildPageMetadata } from '@/lib/seo'
import { absoluteUrl } from '@/lib/seo-url'
import { buildLocalizedPath, publishedLocales } from '@/lib/i18n-config'
import { OG_IMAGE_PATH } from '@/lib/constants'
import { createTranslator, MESSAGES } from '@/lib/i18n-messages'
import { LEGAL_DOCUMENT_ORDER, getLegalDocuments, renderLegalText } from '@/lib/legal-content'

/**
 * Hub legal público: /politicas (índice de los 3 documentos legales).
 * ------------------------------------------------------------------
 * POR QUÉ existe: una tienda de afiliados DEBE declarar que gana comisiones y
 * que la compra se cierra en el marketplace. Esta página actúa como ÍNDICE que
 * enlaza los documentos completos (/afiliados, /terminos y /privacidad), sin
 * duplicar su contenido (evita canibalización SEO) y manteniendo viva la URL
 * ya indexada.
 */

/** Revalidación: el layout del sitio ya fija 300s (el mínimo prevalece). */
export const revalidate = false

export function generateStaticParams() {
  return publishedLocales().map((locale) => ({ locale }))
}

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params
  const t = createTranslator(MESSAGES, locale)
  const { settings } = await getSiteSettings(locale)
  const name = settings.company_name || 'zonadehobbies'
  return buildPageMetadata({
    title: `${t('footer.policies')} | ${name}`,
    description: t('legal.hubIntro', { name }),
    path: buildLocalizedPath('/politicas', locale, { prefixDefaultLocale: false }),
    image: absoluteUrl(OG_IMAGE_PATH),
    siteName: name,
  })
}

export default async function PoliticasPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params
  const t = createTranslator(MESSAGES, locale)
  const { settings } = await getSiteSettings(locale)
  const name = settings.company_name || 'zonadehobbies'
  const email = settings.email || ''
  const address = settings.address || ''
  // Documentos LOCALIZADOS en el idioma activo (resumen traducido con fallback
  // al idioma raíz): el índice legal nunca muestra un idioma mezclado.
  const documents = getLegalDocuments(locale)

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <main className="mx-auto w-full max-w-3xl flex-1 px-5 py-16 lg:px-8">
        <p className="font-mono text-xs uppercase tracking-[.25em] text-brand-strong">{t('legal.eyebrow')}</p>
        <h1 className="mt-3 text-4xl font-semibold tracking-[-.05em]">{t('footer.policies')}</h1>
        <p className="mt-4 text-sm leading-7 text-muted-foreground">{t('legal.hubIntro', { name })}</p>

        {/* Índice de los 3 documentos legales. El id del ancla conserva los
            valores históricos (/politicas#afiliados, #terminos, #privacidad)
            para no romper enlaces profundos ya compartidos o indexados. */}
        <div className="mt-10 flex flex-col gap-4">
          {LEGAL_DOCUMENT_ORDER.map((key) => {
            const doc = documents[key]
            return (
              <article
                key={key}
                id={doc.path.replace(/^\//, '')}
                className="scroll-mt-24 rounded-2xl border border-border p-5"
              >
                <h2 className="text-xl font-semibold tracking-[-.03em]">{t(doc.titleKey)}</h2>
                <p className="mt-2 text-sm leading-7 text-muted-foreground">
                  {renderLegalText(doc.summary, { name })}
                </p>
                <Link
                  href={buildLocalizedPath(doc.path, locale, { prefixDefaultLocale: false })}
                  className="mt-3 inline-flex text-sm font-medium text-brand-strong underline underline-offset-2"
                >
                  {t('legal.readFull')}
                </Link>
              </article>
            )
          })}
        </div>

        {email && (
          <p className="mt-12 text-sm text-muted-foreground">
            {t('legal.contactBody')}{' '}
            <a href={`mailto:${email}`} className="text-brand-strong underline underline-offset-2">
              {email}
            </a>
          </p>
        )}
      </main>

      <SiteFooter
        footer={settings.footer_texts}
        brand={{ name, address }}
        social={settings.social_links}
        logoUrl={settings.logo_url}
        iconUrl={settings.icon_url}
        whatsapp={settings.whatsapp_number}
      />
    </div>
  )
}
