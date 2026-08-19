import { createClient } from '@supabase/supabase-js'

/** Cliente Supabase público (sin cookies) para consultas no autenticadas. Permite SSG + ISR en portada/catálogo. */
export function createPublicClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  )
}