import type { Metadata } from 'next'
import { SiteFooter } from '@/components/site-footer'
import { getSiteSettings } from '@/services/site-settings'
import { buildPageMetadata } from '@/lib/seo'
import { absoluteUrl } from '@/lib/seo-url'
import { buildLocalizedPath, publishedLocales } from '@/lib/i18n-config'
import { OG_IMAGE_PATH } from '@/lib/constants'
import { createTranslator, MESSAGES } from '@/lib/i18n-messages'

/**
 * Página legal pública: /politicas (términos, privacidad y aviso de afiliado).
 * ------------------------------------------------------------------
 * POR QUÉ existe: una tienda de afiliados DEBE declarar que gana comisiones y
 * que la compra se cierra en el marketplace. Además, el footer enlaza aquí y
 * estos enlaces no deben devolver 404 (mala señal de confianza y de SEO).
 *
 * Los TÍTULOS van traducidos (claves footer.* ya existentes en los 6 idiomas);
 * el cuerpo legal se redacta en español por ahora y es ampliable por idioma.
 */

/** Revalidación: el layout del sitio ya fija 300s (el mínimo prevalece). */
export const revalidate = 3600

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
    description: `Términos, política de privacidad y aviso de afiliado de ${name}.`,
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

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <main className="mx-auto w-full max-w-3xl flex-1 px-5 py-16 lg:px-8">
        <p className="font-mono text-xs uppercase tracking-[.25em] text-brand-strong">Legal</p>
        <h1 className="mt-3 text-4xl font-semibold tracking-[-.05em]">{t('footer.policies')}</h1>
        <p className="mt-4 text-sm text-muted-foreground">
          Última actualización: 2026. Estos términos rigen el uso de {name} y explican cómo ganamos dinero.
        </p>

        {/* Aviso de afiliado: lo primero porque es el más relevante para el usuario. */}
        <LegalSection id="afiliados" title={t('footer.affiliate')}>
          <p>
            {name} participa en el Programa de Afiliados de AliExpress y en programas de terceros. Esto significa que
            podemos recibir una comisión cuando compras a través de los enlaces publicados en este sitio.
          </p>
          <p>
            Esa comisión <strong>no tiene ningún coste adicional para ti</strong>: pagas exactamente el mismo precio que
            si entraras directamente al marketplace. Las comisiones nos permiten mantener la curaduría y el sitio.
          </p>
          <p>
            Los precios, la disponibilidad y las condiciones de envío pertenecen al vendedor del marketplace y pueden
            cambiar sin previo aviso. {name} no vende directamente los productos ni procesa los pagos: la compra se
            completa en AliExpress.
          </p>
        </LegalSection>

        <LegalSection id="terminos" title={t('footer.terms')}>
          <p>
            El uso de {name} implica aceptar estas condiciones. La información de productos (precio, imágenes,
            especificaciones) se muestra como referencia y puede variar en el marketplace.
          </p>
          <p>
            Nos esforzamos por mantener la información actualizada, pero no garantizamos la ausencia de errores ni la
            disponibilidad permanente de las ofertas. Las decisiones de compra deben verificarse en el marketplace antes
            de finalizar el pago.
          </p>
        </LegalSection>

        <LegalSection id="privacidad" title={t('footer.privacy')}>
          <p>
            Recopilamos únicamente los datos necesarios para operar el sitio (por ejemplo, el correo que envías en el
            formulario de contacto) y datos de uso agregados para mejorar el catálogo.
          </p>
          <p>
            No vendemos ni cedemos tus datos personales a terceros. Al hacer clic en un enlace de afiliado, el
            marketplace aplica su propia política de privacidad.
          </p>
          {email && (
            <p>
              Para ejercer tus derechos de acceso, rectificación o eliminación escríbenos a{' '}
              <a href={`mailto:${email}`} className="text-brand-strong underline underline-offset-2">{email}</a>.
            </p>
          )}
        </LegalSection>
      </main>

      <SiteFooter
        footer={settings.footer_texts}
        brand={{ name, address: settings.address }}
        social={settings.social_links}
        logoUrl={settings.logo_url}
        iconUrl={settings.icon_url}
        whatsapp={settings.whatsapp_number}
      />
    </div>
  )
}

/** Sección legal con ancla (para enlazar desde el footer: #terminos, #privacidad…). */
function LegalSection({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} className="mt-12 scroll-mt-24">
      <h2 className="text-2xl font-semibold tracking-[-.03em]">{title}</h2>
      <div className="mt-4 flex flex-col gap-4 text-sm leading-7 text-muted-foreground">{children}</div>
    </section>
  )
}
