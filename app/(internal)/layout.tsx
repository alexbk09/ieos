import type { Metadata } from 'next'
import { RootShell } from '@/components/root-shell'
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
  return buildRootMetadata()
}

export default function InternalLayout({ children }: { children: React.ReactNode }) {
  return <RootShell lang={DEFAULT_LOCALE}>{children}</RootShell>
}
