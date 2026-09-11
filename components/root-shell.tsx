import { Analytics } from '@vercel/analytics/next'
import '@/app/globals.css'
import { ToastProvider } from '@/components/toast-provider'
import { AppProviders } from '@/components/app-providers'
import { NavigationProgress } from '@/components/navigation-progress'
import { ScrollReset } from '@/components/scroll-reset'
import { getSiteSettings } from '@/services/site-settings'
import { themeStyleTagContent } from '@/lib/theme'

/**
 * Shell raíz COMPARTIDO por los root layouts del proyecto.
 * ------------------------------------------------------------------
 * POR QUÉ existe: Next.js permite varios "root layouts" (uno por route group)
 * cuando NO hay app/layout.tsx. Eso es lo que nos deja declarar un <html lang>
 * correcto por idioma (imposible desde un layout anidado) sin hacer dinámicas
 * las páginas (seguimos con SSG+ISR).
 *
 * Este componente centraliza el chrome común (proveedores, tema, scripts,
 * toasts, analítica) para no duplicarlo en cada root layout.
 */

/** Script inline que aplica el tema guardado ANTES de la hidratación (evita parpadeo). */
const darkModeInit = `
  (function () {
    try {
      var stored = localStorage.getItem('zonadehobbies-dark-mode');
      if (stored === 'true') {
        document.documentElement.classList.add('dark');
      }
    } catch (e) {}
  })();
`

export async function RootShell({
  lang,
  dir = 'ltr',
  children,
}: {
  /** Código de idioma para el atributo <html lang> (señal SEO de idioma). */
  lang: string
  /** Dirección de lectura (preparado para idiomas RTL futuros). */
  dir?: 'ltr' | 'rtl'
  children: React.ReactNode
}) {
  // Lee la configuración pública del sitio (cacheada con ISR).
  const { settings } = await getSiteSettings()
  const themeCss = themeStyleTagContent(settings.theme)

  return (
    <html lang={lang} dir={dir} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: darkModeInit }} />
        <style dangerouslySetInnerHTML={{ __html: themeCss }} />
      </head>
      <body className="antialiased">
        <AppProviders>{children}</AppProviders>
        <NavigationProgress />
        <ScrollReset />
        <ToastProvider />
        {process.env.NODE_ENV === 'production' && <Analytics />}
      </body>
    </html>
  )
}
