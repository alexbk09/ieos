import { Analytics } from '@vercel/analytics/next'
import type { Metadata, Viewport } from 'next'
import './globals.css'
import { ToastProvider } from '@/components/toast-provider'
import { WhatsAppButton } from '@/components/whatsapp-button'
import { getSiteSettings } from '@/services/site-settings'

/** ISR: el layout raíz se revalida cada 5 min (metadata dinámica). */
export const revalidate = 300

// ---------- Metadata dinámica ----------
export async function generateMetadata(): Promise<Metadata> {
  const { settings } = await getSiteSettings()
  const name = settings.company_name || 'ilumaX'
  const tagline = settings.tagline || 'Arquitectura de luz'

  return {
    title: `${name} — ${tagline}`,
    description: settings.hero_texts?.description ?? 'Soluciones LED y revestimientos que convierten espacios en experiencias memorables.',
    generator: name,
    icons: settings.icon_url
      ? { icon: settings.icon_url, apple: settings.icon_url }
      : undefined,
  }
}

export const viewport: Viewport = { colorScheme: 'light dark', themeColor: '#071d49' }

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="es" className="bg-slate-50"><body className="antialiased">{children}<ToastProvider />{process.env.NODE_ENV === 'production' && <Analytics />}<WhatsAppButton /></body></html>
}
