'use client'

import { useRef, useState } from 'react'
import { Camera, KeyRound, LoaderCircle, Lock, Mail, Phone, Save, UserRound } from 'lucide-react'
import { toast } from 'sonner'
import { useRouter } from 'next/navigation'
import { UserAvatar } from '@/components/user-avatar'
import { updatePassword } from '@/services/auth-client'

type ProfileData = {
  id: string
  name: string | null
  full_name: string | null
  email: string | null
  phone: string | null
  role: 'admin' | 'client'
  avatar_url: string | null
}

/**
 * Formulario de "Mi Perfil".
 * Permite editar nombre, teléfono, correo, subir imagen de avatar
 * y cambiar la contraseña.
 * Todas las escrituras pasan por las APIs /api/profile y /services/auth-client.
 */
export function ProfileForm({ initialProfile }: { initialProfile: ProfileData }) {
  const router = useRouter()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [name, setName] = useState(initialProfile.full_name ?? '')
  const [email, setEmail] = useState(initialProfile.email ?? '')
  const [phone, setPhone] = useState(initialProfile.phone ?? '')
  const [avatarUrl, setAvatarUrl] = useState<string | null>(initialProfile.avatar_url)
  const [uploading, setUploading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [changingPassword, setChangingPassword] = useState(false)

  /** Sube una imagen de avatar al bucket y la asigna al perfil. */
  async function handleAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    setUploading(true)
    const form = new FormData()
    form.append('file', file)

    try {
      const response = await fetch('/api/profile/avatar', { method: 'POST', body: form })
      const result = await response.json()
      if (!response.ok) {
        toast.error('No se pudo cargar la imagen', { description: result.error ?? 'Intenta con otra imagen.' })
        return
      }
      setAvatarUrl(result.url)
      toast.success('Imagen cargada', { description: 'Guarda los cambios para aplicar el nuevo avatar.' })
    } catch {
      toast.error('Error de conexión', { description: 'No se pudo subir la imagen en este momento.' })
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  /** Guarda los cambios del perfil. */
  async function save() {
    if (!name.trim()) {
      toast.error('El nombre es obligatorio', { description: 'Escribe tu nombre para continuar.' })
      return
    }

    setSaving(true)
    try {
      const response = await fetch('/api/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          email: email.trim() || null,
          phone: phone.trim() || null,
          avatar_url: avatarUrl,
        }),
      })
      const result = await response.json()
      if (!response.ok) {
        toast.error('No se pudo guardar el perfil', { description: result.error ?? 'Revisa los datos e inténtalo de nuevo.' })
        return
      }
      toast.success('Perfil actualizado', { description: 'Tus datos se guardaron correctamente.' })
      router.refresh()
    } catch {
      toast.error('Error de conexión', { description: 'No se pudo guardar el perfil en este momento.' })
    } finally {
      setSaving(false)
    }
  }

  /** Cambia la contraseña del usuario autenticado. */
  async function changePassword() {
    // Validaciones
    if (newPassword.length < 6) {
      toast.error('Contraseña muy corta', { description: 'La nueva contraseña debe tener al menos 6 caracteres.' })
      return
    }
    if (newPassword !== confirmPassword) {
      toast.error('Las contraseñas no coinciden', { description: 'Verifica que ambas contraseñas sean iguales.' })
      return
    }

    setChangingPassword(true)
    try {
      const result = await updatePassword(newPassword)
      if (result.error) {
        toast.error('No se pudo cambiar la contraseña', { description: result.error.message })
        return
      }
      toast.success('Contraseña actualizada', { description: 'Tu nueva contraseña quedó guardada.' })
      setNewPassword('')
      setConfirmPassword('')
    } catch {
      toast.error('Error de conexión', { description: 'No se pudo cambiar la contraseña en este momento.' })
    } finally {
      setChangingPassword(false)
    }
  }

  return (
    <div className="grid gap-10">
      {/* Sección: Datos personales */}
      <div className="grid gap-8 lg:grid-cols-[260px_1fr]">
        {/* Columna del avatar */}
        <div className="flex flex-col items-center gap-4 lg:items-start">
          <div className="relative">
            <UserAvatar name={name || initialProfile.email} imageUrl={avatarUrl} size="xl" />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              aria-label="Cambiar foto de perfil"
              className="absolute -bottom-1 -right-1 grid size-9 cursor-pointer place-items-center rounded-full border border-slate-200 bg-white text-slate-600 shadow-sm transition-colors hover:border-cyan-500 hover:text-cyan-600 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
            >
              {uploading ? <LoaderCircle size={15} className="animate-spin" /> : <Camera size={15} />}
            </button>
          </div>
          <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarChange} />
          <p className="text-center text-xs text-slate-500 lg:text-left">
            JPG, PNG o WebP. Máximo 2 MB.
          </p>
        </div>

        {/* Campos del formulario */}
        <div className="grid gap-4">
          <label className="grid gap-2 text-sm">
            <span className="font-medium">Nombre completo</span>
            <div className="flex items-center gap-2 rounded-xl border border-slate-200 px-3 dark:border-slate-700">
              <UserRound size={16} className="shrink-0 text-slate-400" />
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Tu nombre" className="h-11 w-full bg-transparent text-sm outline-none placeholder:text-slate-400" />
            </div>
          </label>

          <label className="grid gap-2 text-sm">
            <span className="font-medium">Correo electrónico</span>
            <div className="flex items-center gap-2 rounded-xl border border-slate-200 px-3 dark:border-slate-700">
              <Mail size={16} className="shrink-0 text-slate-400" />
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="correo@ejemplo.com" className="h-11 w-full bg-transparent text-sm outline-none placeholder:text-slate-400" />
            </div>
          </label>

          <label className="grid gap-2 text-sm">
            <span className="font-medium">Teléfono</span>
            <div className="flex items-center gap-2 rounded-xl border border-slate-200 px-3 dark:border-slate-700">
              <Phone size={16} className="shrink-0 text-slate-400" />
              <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+58 412 123 4567" className="h-11 w-full bg-transparent text-sm outline-none placeholder:text-slate-400" />
            </div>
          </label>

          <div className="mt-2 flex items-center justify-between gap-4 border-t border-slate-100 pt-5 dark:border-slate-800">
            <p className="text-xs text-slate-500">Los cambios se aplican en toda la plataforma.</p>
            <button
              onClick={save}
              disabled={saving}
              className="inline-flex h-11 shrink-0 items-center gap-2 rounded-xl bg-blue-950 px-5 text-sm font-medium text-white transition-colors hover:bg-cyan-500 hover:text-blue-950 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {saving ? <LoaderCircle size={15} className="animate-spin" /> : <Save size={15} />}
              {saving ? 'Guardando…' : 'Guardar cambios'}
            </button>
          </div>
        </div>
      </div>

      {/* Sección: Cambiar contraseña */}
      <div className="border-t border-slate-200 pt-8 dark:border-slate-800">
        <div className="flex items-center gap-3">
          <span className="grid size-10 place-items-center rounded-2xl bg-cyan-500/10">
            <KeyRound size={18} className="text-cyan-600" />
          </span>
          <div>
            <h2 className="font-medium">Cambiar contraseña</h2>
            <p className="text-sm text-slate-500">Actualiza la contraseña de tu cuenta.</p>
          </div>
        </div>

        <div className="mt-5 grid gap-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="grid gap-2 text-sm">
              <span className="font-medium">Nueva contraseña</span>
              <div className="flex items-center gap-2 rounded-xl border border-slate-200 px-3 dark:border-slate-700">
                <Lock size={16} className="shrink-0 text-slate-400" />
                <input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="Mínimo 6 caracteres" className="h-11 w-full bg-transparent text-sm outline-none placeholder:text-slate-400" />
              </div>
            </label>

            <label className="grid gap-2 text-sm">
              <span className="font-medium">Confirmar nueva</span>
              <div className="flex items-center gap-2 rounded-xl border border-slate-200 px-3 dark:border-slate-700">
                <Lock size={16} className="shrink-0 text-slate-400" />
                <input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} placeholder="Repite la nueva" className="h-11 w-full bg-transparent text-sm outline-none placeholder:text-slate-400" />
              </div>
            </label>
          </div>

          <div className="mt-2 flex justify-end">
            <button
              onClick={changePassword}
              disabled={changingPassword}
              className="inline-flex h-11 items-center gap-2 rounded-xl border border-slate-200 px-5 text-sm font-medium transition-colors hover:border-cyan-500 hover:text-cyan-600 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700"
            >
              {changingPassword ? <LoaderCircle size={15} className="animate-spin" /> : <KeyRound size={15} />}
              {changingPassword ? 'Cambiando…' : 'Actualizar contraseña'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}