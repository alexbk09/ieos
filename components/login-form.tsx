'use client'

import { FormEvent, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { getBrowserUser, getBrowserUserRole, signInWithEmail, signUpWithEmail } from '@/services/auth-client'
import { ThemeToggle } from '@/components/theme-toggle'
import { getInitials } from '@/lib/utils'
import { AUTH_MIN_PASSWORD_LENGTH } from '@/lib/constants'
import { ArrowLeft, LoaderCircle, LockKeyhole } from 'lucide-react'

/**
 * Datos de marca que la página (servidor) inyecta en el formulario.
 * Provienen de `site_settings`, de modo que el nombre/logo y los colores
 * del login se adaptan a la configuración sin tocar la BD desde el cliente.
 */
export type LoginBrand = {
  name: string
  logoUrl: string | null
  iconUrl: string | null
}

/**
 * Clases compartidas de los campos del formulario.
 * Usan tokens del tema de marca (navy/foreground/muted) en lugar de colores
 * hardcodeados, así el login respeta la Apariencia configurada por el admin.
 */
const FIELD_CLASS_NAME =
  'rounded-2xl border border-navy-foreground/15 bg-navy-foreground/10 px-5 py-4 text-sm outline-none placeholder:text-navy-muted focus:border-brand'

/**
 * Formulario de login/registro (componente cliente).
 * ------------------------------------------------------------------
 * POR QUÉ existe: la página es un Server Component (para leer la marca desde
 * /services/site-settings), y toda la interacción (estado, submit, toasts)
 * vive aquí como isla cliente. No llama a Supabase directamente: usa
 * /services/auth-client como única capa de datos.
 */
export function LoginForm({ brand }: { brand: LoginBrand }) {
  const router = useRouter()
  const [register, setRegister] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)

  /** Redirige al usuario según su rol tras iniciar sesión. */
  async function redirectByRole() {
    const user = await getBrowserUser()
    if (!user) {
      router.push('/')
      return
    }

    // El rol se obtiene a través del servicio de auth (capa de datos).
    const role = await getBrowserUserRole(user)

    if (role === 'admin') {
      toast.success('Bienvenido administrador. Redirigiendo al panel.')
      router.push('/admin')
      return
    }

    toast.success('Sesión iniciada. Redirigiendo a tus solicitudes.')
    router.push('/dashboard')
  }

  /** Maneja el envío del formulario de login o registro. */
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setIsSubmitting(true)

    const form = new FormData(event.currentTarget)
    const email = String(form.get('email'))
    const password = String(form.get('password'))

    try {
      if (register) {
        const result = await signUpWithEmail(email, password, {
          name: form.get('name'),
          phone: form.get('phone'),
        })

        if (result.error) {
          toast.error('No pudimos completar el registro. Revisa tus datos e inténtalo de nuevo.')
          return
        }

        toast.success('Revisa tu correo para verificar tu cuenta. Mira también la bandeja de entrada y la carpeta de spam.')
        setRegister(false)
        event.currentTarget.reset()
        return
      }

      const result = await signInWithEmail(email, password)

      if (result.error) {
        toast.error('No pudimos iniciar sesión. Revisa tus credenciales e inténtalo de nuevo.')
        return
      }

      await redirectByRole()
    } finally {
      setIsSubmitting(false)
    }
  }


  return (
    <main className="grid min-h-screen place-items-center bg-navy p-5 text-navy-foreground">
      <div className="w-full max-w-md">
        <div className="mb-12 flex items-center justify-between">
          <a href="/" className="inline-flex items-center gap-2 text-sm text-navy-muted transition-colors hover:text-navy-foreground">
            <ArrowLeft size={16} /> Volver a {brand.name}
          </a>
          <ThemeToggle />
        </div>

        <div className="mb-8">
          {/* Logo/ícono configurado o iniciales de la marca como respaldo. */}
          {brand.logoUrl ? (
            <img src={brand.logoUrl} alt={`${brand.name} — logo`} className="h-10 w-auto object-contain" />
          ) : brand.iconUrl ? (
            <img src={brand.iconUrl} alt={`${brand.name} — ícono`} className="size-10 rounded-xl object-cover" />
          ) : (
            <span className="grid size-10 place-items-center rounded-xl bg-brand font-mono text-sm font-black text-brand-foreground">
              {getInitials(brand.name)}
            </span>
          )}
          <h1 className="mt-6 text-4xl font-semibold tracking-[-.06em]">{register ? 'Crea tu cuenta.' : 'Bienvenido de vuelta.'}</h1>
          <p className="mt-3 text-navy-muted">Gestiona tus solicitudes y proyectos desde un solo lugar.</p>
        </div>

        <form onSubmit={submit} className="grid gap-3">
          {register && (
            <>
              <input name="name" required placeholder="Nombre completo" className={FIELD_CLASS_NAME} />
              <input name="phone" required placeholder="Teléfono" className={FIELD_CLASS_NAME} />
            </>
          )}

          <input name="email" required type="email" placeholder="Correo electrónico" className={FIELD_CLASS_NAME} />
          <input name="password" required type="password" minLength={AUTH_MIN_PASSWORD_LENGTH} placeholder="Contraseña" className={FIELD_CLASS_NAME} />

          <button
            disabled={isSubmitting}
            className="mt-3 inline-flex items-center justify-center gap-2 rounded-2xl bg-brand px-5 py-4 text-sm font-semibold text-brand-foreground transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-70"
          >
            {isSubmitting ? 'Procesando...' : register ? 'Crear cuenta' : 'Iniciar sesión'}
            {isSubmitting ? <LoaderCircle size={15} className="animate-spin" /> : <LockKeyhole size={15} />}
          </button>
        </form>

        <button
          onClick={() => setRegister(!register)}
          disabled={isSubmitting}
          className="mt-7 text-left text-sm text-navy-muted underline underline-offset-4 transition-colors hover:text-navy-foreground disabled:opacity-60"
        >
          {register ? 'Ya tengo una cuenta' : 'Quiero crear una cuenta'}
        </button>
      </div>
    </main>
  )
}

