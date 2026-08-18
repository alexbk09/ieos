import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

export async function getCurrentUser() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  return { supabase, user }
}

export async function requireUser() {
  const context = await getCurrentUser()
  if (!context.user) redirect('/login')
  return context as typeof context & { user: NonNullable<typeof context.user> }
}

export async function getUserRole(userId: string) {
  const supabase = await createClient()
  const { data } = await supabase.from('profiles').select('role').eq('id', userId).maybeSingle()
  return data?.role ?? 'user'
}

export async function requireAdmin() {
  const context = await requireUser()
  const role = await getUserRole(context.user.id)
  if (role !== 'admin') redirect('/dashboard')
  return { ...context, role: 'admin' as const }
}
