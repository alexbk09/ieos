import { Analytics } from '@vercel/analytics/next'
import type { Metadata, Viewport } from 'next'
import './globals.css'
import { ToastProvider } from '@/components/toast-provider'
import { AppProviders } from '@/components/app-providers'
import { NavigationProgress } from '@/components/navigation-progress'
import { WhatsAppButton } from '@/components/whatsapp-button'
import { ScrollReset } from '@/components/scroll-reset'
import { getSiteSettings } from '@/services/site-settings'
import { themeStyleTagContent } from '@/lib/theme'

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

export const viewport: Viewport = { colorScheme: 'light dark', themeColor: '#020617' }

/** Script inline que aplica el tema guardado ANTES de la hidratación (evita parpadeo). */
const darkModeInit = `
  (function () {
    try {
      var stored = localStorage.getItem('ilumax-dark-mode');
      if (stored === 'true') {
        document.documentElement.classList.add('dark');
      }
    } catch (e) {}
  })();
`

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  // Lee la configuración pública del sitio (cacheada con ISR).
  // El tema se serializa como <style> en el head: cero parpadeo al cargar
  // y personalización multiempresa sin recompilar.
  const { settings } = await getSiteSettings()
  const themeCss = themeStyleTagContent(settings.theme)

  return (
    <html lang="es" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: darkModeInit }} />
        <style dangerouslySetInnerHTML={{ __html: themeCss }} />
      </head>
      <body className="antialiased">
        <AppProviders>
          {children}
        </AppProviders>
        <NavigationProgress />
        <ScrollReset />
        <ToastProvider />
        {process.env.NODE_ENV === 'production' && <Analytics />}
        <WhatsAppButton whatsappNumber={settings.whatsapp_number} />
      </body>
    </html>
  )
}