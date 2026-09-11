import { getSiteSettings } from '@/services/site-settings'
import { LoginForm } from '@/components/login-form'

/**
 * Página de login/registro (Server Component).
 * ------------------------------------------------------------------
 * POR QUÉ es servidor: lee la marca (nombre/logo) desde site_settings a
 * través de la capa /services y la inyecta en el formulario cliente. Así el
 * login respeta el nombre, el logo y los colores de la configuración sin que
 * el navegador llame a Supabase directamente.
 */
export default async function LoginPage() {
  const { settings } = await getSiteSettings()

  return (
    <LoginForm
      brand={{
        name: settings.company_name,
        logoUrl: settings.logo_url,
        iconUrl: settings.icon_url,
      }}
    />
  )
}
