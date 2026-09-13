import type { Metadata } from 'next'
import { RootShell } from '@/components/root-shell'
import { I18nProvider } from '@/components/i18n-provider'
import { ROOT_VIEWPORT, buildRootMetadata } from '@/lib/root-metadata'
import { DEFAULT_LOCALE } from '@/lib/constants'

/**
 * Root layout de las páginas INTERNAS (route group `(internal)`):
 * /admin, /dashboard, /perfil, /login, /manual.
 *
 * POR QUÉ este grupo: son páginas privadas/utilitarias que NO se traducen, así
 * que mantienen sus URLs originales (los route groups no afectan a la URL) y
 * declaran el idioma del sitio por defecto en <html lang>.
 */
export const revalidate = 300

export const viewport = ROOT_VIEWPORT

export async function generateMetadata(): Promise<Metadata> {
  // Áreas privadas: no se traducen, así que la metadata raíz va en el idioma
  // por defecto (explícito, sin depender del valor por defecto del helper).
  return buildRootMetadata(DEFAULT_LOCALE)
}

export default function InternalLayout({ children }: { children: React.ReactNode }) {
  // Las áreas privadas no se traducen: se fija el idioma por defecto.
  return (
    <RootShell lang={DEFAULT_LOCALE}>
      <I18nProvider locale={DEFAULT_LOCALE}>{children}</I18nProvider>
    </RootShell>
  )
}
