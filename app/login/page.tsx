'use client'
import { FormEvent, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { getBrowserUser, getBrowserUserRole, signInWithEmail, signUpWithEmail } from '@/services/auth-client'
import { ThemeToggle } from '@/components/theme-toggle'
import { ArrowLeft, LoaderCircle, LockKeyhole } from 'lucide-react'

/**
 * Página de login/registro.
 * No realiza llamadas directas a Supabase: toda la lógica pasa por /services/auth.
 */
export default function LoginPage() {
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
    <main className="grid min-h-screen place-items-center bg-blue-950 p-5 text-white">
      <div className="w-full max-w-md">
        <div className="mb-12 flex items-center justify-between">
          <a href="/" className="inline-flex items-center gap-2 text-sm text-slate-300">
            <ArrowLeft size={16} /> Volver a ilumaX
          </a>
          <ThemeToggle />
        </div>

        <div className="mb-8">
          <span className="grid size-10 place-items-center rounded-xl bg-cyan-400 font-mono text-sm font-black text-blue-950">iX</span>
          <h1 className="mt-6 text-4xl font-semibold tracking-[-.06em]">{register ? 'Crea tu cuenta.' : 'Bienvenido de vuelta.'}</h1>
          <p className="mt-3 text-slate-300">Gestiona tus solicitudes y proyectos desde un solo lugar.</p>
        </div>

        <form onSubmit={submit} className="grid gap-3">
          {register && (
            <>
              <input name="name" required placeholder="Nombre completo" className="rounded-2xl border border-white/15 bg-white/10 px-5 py-4 text-sm outline-none placeholder:text-slate-400" />
              <input name="phone" required placeholder="Teléfono" className="rounded-2xl border border-white/15 bg-white/10 px-5 py-4 text-sm outline-none placeholder:text-slate-400" />
            </>
          )}

          <input name="email" required type="email" placeholder="Correo electrónico" className="rounded-2xl border border-white/15 bg-white/10 px-5 py-4 text-sm outline-none placeholder:text-slate-400" />
          <input name="password" required type="password" minLength={6} placeholder="Contraseña" className="rounded-2xl border border-white/15 bg-white/10 px-5 py-4 text-sm outline-none placeholder:text-slate-400" />

          <button
            disabled={isSubmitting}
            className="mt-3 inline-flex items-center justify-center gap-2 rounded-2xl bg-cyan-400 px-5 py-4 text-sm font-semibold text-blue-950 disabled:cursor-not-allowed disabled:bg-cyan-300"
          >
            {isSubmitting ? 'Procesando...' : register ? 'Crear cuenta' : 'Iniciar sesión'}
            {isSubmitting ? <LoaderCircle size={15} className="animate-spin" /> : <LockKeyhole size={15} />}
          </button>
        </form>

        <button onClick={() => setRegister(!register)} disabled={isSubmitting} className="mt-7 text-left text-sm text-slate-300 underline underline-offset-4 disabled:opacity-60">
          {register ? 'Ya tengo una cuenta' : 'Quiero crear una cuenta'}
        </button>
      </div>
    </main>
  )
}