import Link from 'next/link'
import { SiteFooter } from '@/components/site-footer'
import { renderLegalText, type LegalDocument } from '@/lib/legal-content'
import type { Translator } from '@/lib/i18n-messages'

/**
 * LegalPageView (organismo presentacional).
 * ------------------------------------------------------------------
 * Renderiza un documento legal completo: encabezado, índice de secciones, el
 * cuerpo y los enlaces cruzados a los otros documentos legales.
 *
 * POR QUÉ es un componente aislado:
 *  - No accede a Supabase ni muta estado: recibe TODO por props (regla de oro
 *    de desacoplamiento). Así el mismo organismo sirve a las 3 páginas legales.
 *  - El contenido viene de la fuente única `lib/legal-content.ts`; aquí solo se
 *    resuelven los tokens de marca (nombre, correo, dirección) al renderizar.
 */

/** Enlace cruzado a otro documento legal (ya localizado). */
export type LegalDocLink = { key: string; title: string; href: string }

/** Datos mínimos del footer (se delegan tal cual a SiteFooter). */
type LegalFooterData = {
  footer?: { copyright?: string; slogan?: string }
  social?: { instagram?: string; linkedin?: string; email?: string }
  logoUrl?: string | null
  iconUrl?: string | null
  whatsapp?: string
}

export function LegalPageView({
  document,
  title,
  otherDocs,
  t,
  locale,
  brandName,
  email,
  address,
  footer,
  social,
  logoUrl,
  iconUrl,
  whatsapp,
}: {
  /** Documento legal a mostrar (fuente única de secciones y fecha). */
  document: LegalDocument
  /** Título ya traducido del documento (H1). */
  title: string
  /** Enlaces a los otros documentos legales (ya localizados). */
  otherDocs: LegalDocLink[]
  /** Traductor ligado al idioma activo. */
  t: Translator
  /** Idioma activo (para formatear la fecha de actualización). */
  locale: string
  /** Nombre de marca para resolver el token `{name}`. */
  brandName: string
  /** Correo de contacto para el token `{email}` y el bloque de contacto. */
  email: string
  /** Dirección para el token `{address}`. */
  address: string
} & LegalFooterData) {
  // Valores que sustituyen los tokens del contenido legal en tiempo de render.
  const tokenValues = { name: brandName, email, address }

  // Fecha de última revisión formateada en UTC: evita que la zona horaria del
  // servidor reste un día a la fecha ISO almacenada.
  const updatedLabel = new Intl.DateTimeFormat(locale, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${document.updatedAt}T00:00:00Z`))

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <main className="mx-auto w-full max-w-3xl flex-1 px-5 py-16 lg:px-8">
        <p className="font-mono text-xs uppercase tracking-[.25em] text-brand-strong">{t('legal.eyebrow')}</p>
        <h1 className="mt-3 text-4xl font-semibold tracking-[-.05em]">{title}</h1>
        <p className="mt-4 text-sm text-muted-foreground">{t('legal.updated', { date: updatedLabel })}</p>

        {/* Índice: mejora la lectura y da a Google anclas internas navegables. */}
        {document.sections.length > 0 && (
          <nav
            aria-label={t('legal.contents')}
            className="mt-8 rounded-2xl border border-border bg-muted/40 p-5"
          >
            <p className="text-xs font-semibold uppercase tracking-[.2em] text-foreground">{t('legal.contents')}</p>
            <ul className="mt-3 flex flex-col gap-2 text-sm">
              {document.sections.map((section) => (
                <li key={section.id}>
                  <a href={`#${section.id}`} className="text-muted-foreground transition-colors hover:text-brand-strong">
                    {section.title}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
        )}

        {/* Cuerpo: cada sección con su ancla estable (#id). */}
        {document.sections.map((section) => (
          <section key={section.id} id={section.id} className="mt-12 scroll-mt-24">
            <h2 className="text-2xl font-semibold tracking-[-.03em]">{section.title}</h2>
            <div className="mt-4 flex flex-col gap-4 text-sm leading-7 text-muted-foreground">
              {section.blocks.map((block, index) =>
                block.kind === 'p' ? (
                  // El texto es contenido propio (no viene del usuario): solo se
                  // resuelven los tokens de marca al renderizar.
                  <p key={index}>{renderLegalText(block.text, tokenValues)}</p>
                ) : (
                  <ul key={index} className="flex list-disc flex-col gap-2 pl-5">
                    {block.items.map((item, itemIndex) => (
                      <li key={itemIndex}>{renderLegalText(item, tokenValues)}</li>
                    ))}
                  </ul>
                ),
              )}
            </div>
          </section>
        ))}

        {/* Enlaces cruzados: mantiene unidos los 3 documentos legales. */}
        {otherDocs.length > 0 && (
          <nav aria-label={t('legal.otherDocs')} className="mt-14 border-t border-border pt-8">
            <p className="text-xs font-semibold uppercase tracking-[.2em] text-foreground">{t('legal.otherDocs')}</p>
            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              {otherDocs.map((other) => (
                <Link
                  key={other.key}
                  href={other.href}
                  className="rounded-xl border border-border px-4 py-3 text-sm font-medium text-foreground transition-colors hover:border-brand hover:text-brand-strong"
                >
                  {other.title}
                </Link>
              ))}
            </div>
          </nav>
        )}

        {/* Bloque de contacto: canal para dudas o para ejercer derechos. */}
        {email && (
          <section className="mt-12 rounded-2xl border border-border p-5">
            <p className="font-semibold">{t('legal.contactTitle')}</p>
            <p className="mt-1 text-sm text-muted-foreground">
              {t('legal.contactBody')}{' '}
              <a href={`mailto:${email}`} className="text-brand-strong underline underline-offset-2">
                {email}
              </a>
            </p>
          </section>
        )}
      </main>

      <SiteFooter
        footer={footer}
        brand={{ name: brandName, address }}
        social={social}
        logoUrl={logoUrl}
        iconUrl={iconUrl}
        whatsapp={whatsapp}
      />
    </div>
  )
}
