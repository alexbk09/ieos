import { createClient as createServerClient } from '@/lib/supabase/server'

/**
 * Servicio de zonas de envío.
 * Capa única de acceso a Supabase para las tablas zonas_envio y
 * envio_rangos_peso. El cálculo de tarifas (peso volumétrico, rangos)
 * vive en lib/shipping-calculator.mjs (lógica pura con tests).
 * Los componentes NUNCA llaman a supabase.from() directamente.
 */

// ---------- Tipos ----------

export type RangoPeso = {
  id: string
  zona_id: string
  peso_min_kg: number
  peso_max_kg: number
  tarifa_usd: number
}

export type ZonaEnvio = {
  id: string
  nombre: string
  descripcion: string | null
  estados: string[]
  ciudades: string[]
  tarifa_flat_usd: number
  tarifa_por_kg_usd: number
  tiempo_estimado: string | null
  activo: boolean
  created_at: string
  rangos?: RangoPeso[]
}

export type ZonaEnvioInput = {
  nombre: string
  descripcion?: string | null
  estados?: string[]
  ciudades?: string[]
  tarifa_flat_usd: number
  tarifa_por_kg_usd: number
  tiempo_estimado?: string | null
  activo?: boolean
  rangos?: Array<{ peso_min_kg: number; peso_max_kg: number; tarifa_usd: number }>
}

// ---------- Consultas ----------

/**
 * Obtiene todas las zonas de envío con sus rangos de peso.
 * Hace dos consultas y combina manualmente (patrón del sistema).
 */
export async function getZonasEnvio(): Promise<{ data: ZonaEnvio[] | null; error: { message: string } | null }> {
  const supabase = await createServerClient()

  const [{ data: zonas }, { data: rangos }] = await Promise.all([
    supabase.from('zonas_envio').select('*').order('nombre'),
    supabase.from('envio_rangos_peso').select('*').order('peso_min_kg'),
  ])

  if (!zonas) return { data: null, error: { message: 'No se pudieron cargar las zonas.' } }

  const byZona = new Map<string, RangoPeso[]>()
  for (const rango of (rangos ?? []) as RangoPeso[]) {
    const list = byZona.get(rango.zona_id) ?? []
    list.push(rango)
    byZona.set(rango.zona_id, list)
  }

  const data = (zonas as any[]).map((zona) => ({
    ...(zona as ZonaEnvio),
    estados: zona.estados ?? [],
    ciudades: zona.ciudades ?? [],
    rangos: byZona.get(zona.id) ?? [],
  }))

  return { data, error: null }
}

/**
 * Obtiene las zonas activas (para el checkout público).
 */
export async function getZonasActivas(): Promise<{ data: ZonaEnvio[] | null; error: { message: string } | null }> {
  const supabase = await createServerClient()
  const { data, error } = await supabase.from('zonas_envio').select('*').eq('activo', true).order('nombre')
  if (error) return { data: null, error: { message: error.message } }
  return { data: (data ?? []) as ZonaEnvio[], error: null }
}

// ---------- Mutaciones ----------

/**
 * Crea una zona de envío con sus rangos opcionales.
 * Primero inserta la zona y luego los rangos en lote.
 */
export async function createZona(input: ZonaEnvioInput): Promise<{ data: ZonaEnvio | null; error: { message: string } | null }> {
  const supabase = await createServerClient()

  const nombre = input.nombre.trim()
  if (!nombre) return { data: null, error: { message: 'El nombre de la zona es obligatorio.' } }

  const { data: zona, error: zonaError } = await supabase
    .from('zonas_envio')
    .insert({
      nombre,
      descripcion: input.descripcion?.trim() || null,
      estados: input.estados ?? [],
      ciudades: input.ciudades ?? [],
      tarifa_flat_usd: Number(input.tarifa_flat_usd) || 0,
      tarifa_por_kg_usd: Number(input.tarifa_por_kg_usd) || 0,
      tiempo_estimado: input.tiempo_estimado?.trim() || null,
      activo: input.activo ?? true,
    })
    .select('*')
    .single()
  if (zonaError || !zona) return { data: null, error: { message: zonaError?.message ?? 'No se pudo crear la zona.' } }

  // Insertar rangos si vienen.
  if (input.rangos && input.rangos.length > 0) {
    const rows = input.rangos.map((r) => ({
      zona_id: zona.id,
      peso_min_kg: Number(r.peso_min_kg) || 0,
      peso_max_kg: Number(r.peso_max_kg) || 0,
      tarifa_usd: Number(r.tarifa_usd) || 0,
    }))
    const { error: rangosError } = await supabase.from('envio_rangos_peso').insert(rows)
    if (rangosError) {
      await supabase.from('zonas_envio').delete().eq('id', zona.id)
      return { data: null, error: { message: rangosError.message } }
    }
  }

  return { data: zona as ZonaEnvio, error: null }
}

/**
 * Actualiza una zona de envío (campos + rangos reemplazados).
 */
export async function updateZona(id: string, input: Partial<ZonaEnvioInput>): Promise<{ data: ZonaEnvio | null; error: { message: string } | null }> {
  const supabase = await createServerClient()

  const update: Record<string, unknown> = {}
  if (input.nombre !== undefined) update.nombre = input.nombre.trim()
  if (input.descripcion !== undefined) update.descripcion = input.descripcion?.trim() || null
  if (input.estados !== undefined) update.estados = input.estados
  if (input.ciudades !== undefined) update.ciudades = input.ciudades
  if (input.tarifa_flat_usd !== undefined) update.tarifa_flat_usd = Number(input.tarifa_flat_usd) || 0
  if (input.tarifa_por_kg_usd !== undefined) update.tarifa_por_kg_usd = Number(input.tarifa_por_kg_usd) || 0
  if (input.tiempo_estimado !== undefined) update.tiempo_estimado = input.tiempo_estimado?.trim() || null
  if (input.activo !== undefined) update.activo = Boolean(input.activo)

  if (Object.keys(update).length > 0) {
    const { error } = await supabase.from('zonas_envio').update(update).eq('id', id)
    if (error) return { data: null, error: { message: error.message } }
  }

  // Reemplazar rangos si se envían.
  if (input.rangos !== undefined) {
    await supabase.from('envio_rangos_peso').delete().eq('zona_id', id)
    if (input.rangos.length > 0) {
      const rows = input.rangos.map((r) => ({
        zona_id: id,
        peso_min_kg: Number(r.peso_min_kg) || 0,
        peso_max_kg: Number(r.peso_max_kg) || 0,
        tarifa_usd: Number(r.tarifa_usd) || 0,
      }))
      const { error: rangosError } = await supabase.from('envio_rangos_peso').insert(rows)
      if (rangosError) return { data: null, error: { message: rangosError.message } }
    }
  }

  const { data: zona } = await supabase.from('zonas_envio').select('*').eq('id', id).maybeSingle()
  return { data: (zona as ZonaEnvio) ?? null, error: null }
}

/**
 * Elimina una zona de envío (los rangos se borran en cascada).
 */
export async function deleteZona(id: string): Promise<{ ok: boolean; error: { message: string } | null }> {
  const supabase = await createServerClient()
  const { error } = await supabase.from('zonas_envio').delete().eq('id', id)
  if (error) return { ok: false, error: { message: error.message } }
  return { ok: true, error: null }
}