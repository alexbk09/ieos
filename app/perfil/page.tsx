import { requireUser } from '@/lib/auth'
import { getProfile } from '@/services/profiles'
import { getUserRole } from '@/services/auth-server'
import { ProfileForm } from '@/components/profile-form'
import { ThemeToggle } from '@/components/theme-toggle'
import { NotificationsBell } from '@/components/notifications-bell'
import { ArrowLeft, ShieldCheck } from 'lucide-react'
import Link from 'next/link'

/**
 * Página "Mi Perfil".
 * Muestra y permite editar los datos personales del usuario autenticado:
 * nombre, teléfono, correo, avatar y contraseña.
 * Funciona tanto para administradores como para clientes.
 */
export default async function ProfilePage() {
  const { user } = await requireUser()
  const role = await getUserRole(user)
  const profile = await getProfile(user)

  const isAdmin = role === 'admin'

  return (
    <main className="min-h-screen bg-slate-50 p-5 text-slate-950 dark:bg-slate-950 dark:text-white">
      <div className="mx-auto max-w-3xl">
        {/* Encabezado con navegación */}
        <header className="flex items-center justify-between gap-3 py-5">
          <div className="flex items-center gap-3">
            <Link href="/" className="inline-flex items-center gap-2 text-sm text-slate-500">
              <ArrowLeft size={16} /> Volver a ilumaX
            </Link>
            {isAdmin && (
              <Link href="/admin" className="inline-flex items-center gap-2 text-sm text-slate-500">
                <ShieldCheck size={16} /> Panel admin
              </Link>
            )}
          </div>
          <div className="flex items-center gap-2">
            <NotificationsBell />
            <ThemeToggle />
          </div>
        </header>

        {/* Título */}
        <div className="mt-10">
          <p className="font-mono text-xs uppercase tracking-widest text-cyan-600">Mi cuenta</p>
          <h1 className="mt-3 text-4xl font-semibold tracking-[-.06em]">Mi Perfil</h1>
          <p className="mt-2 text-sm text-slate-500">Edita tus datos personales, foto de perfil y contraseña.</p>
        </div>

        {/* Tarjeta del formulario */}
        <section className="mt-8 rounded-3xl border border-slate-200 bg-white p-6 sm:p-8 dark:border-slate-800 dark:bg-slate-900">
          <ProfileForm
            initialProfile={{
              id: profile.id,
              name: profile.full_name ?? user.user_metadata?.name,
              full_name: profile.full_name ?? user.user_metadata?.name,
              email: profile.email ?? user.email ?? '',
              phone: profile.phone ?? user.user_metadata?.phone,
              role: isAdmin ? 'admin' : 'client',
              avatar_url: profile.avatar_url ?? user.user_metadata?.avatar_url,
            }}
          />
        </section>
      </div>
    </main>
  )
}