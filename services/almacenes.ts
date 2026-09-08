import { createClient as createServerClient } from '@/lib/supabase/server'

/**
 * Servicio de multi-almacén.
 * Capa única de acceso a Supabase para las tablas almacenes y
 * producto_stock_almacen. Los componentes NUNCA llaman a supabase.from().
 * Las transferencias entre almacenes usan la RPC transaccional.
 */

// ---------- Tipos ----------

export type Almacen = {
  id: string
  nombre: string
  codigo: string
  tipo: 'sucursal' | 'deposito' | 'bodega'
  direccion: string | null
  ciudad: string | null
  telefono: string | null
  responsable: string | null
  activo: boolean
  created_at: string
  updated_at: string
}

export type ProductoStockAlmacen = {
  id: string
  almacen_id: string
  product_id: string
  stock: number
  stock_grams: number
  stock_minimo: number
  stock_maximo: number
  updated_at: string
  product_name?: string
  pricing_type?: 'unit' | 'weight'
}

export type AlmacenInput = {
  nombre: string
  codigo: string
  tipo: 'sucursal' | 'deposito' | 'bodega'
  direccion?: string | null
  ciudad?: string | null
  telefono?: string | null
  responsable?: string | null
  activo?: boolean
}

// ---------- Consultas ----------

/**
 * Obtiene todos los almacenes (activos e inactivos) ordenados por nombre.
 * @returns Lista de almacenes.
 */
export async function getAlmacenes(): Promise<{ data: Almacen[] | null; error: { message: string } | null }> {
  const supabase = await createServerClient()
  const { data, error } = await supabase.from('almacenes').select('*').order('nombre')
  if (error) return { data: null, error: { message: error.message } }
  return { data: data as Almacen[], error: null }
}

/**
 * Obtiene el stock de un almacén enriquecido con el nombre del producto
 * y su tipo de precio (para saber si usa unidades o gramos).
 * @param almacenId ID del almacén.
 */
export async function getStockAlmacen(almacenId: string): Promise<{ data: ProductoStockAlmacen[] | null; error: { message: string } | null }> {
  if (!almacenId) return { data: [], error: null }
  const supabase = await createServerClient()

  const { data, error } = await supabase
    .from('producto_stock_almacen')
    .select('*, products(name, pricing_type)')
    .eq('almacen_id', almacenId)
    .order('stock', { ascending: false })

  if (error) return { data: null, error: { message: error.message } }

  const normalized = ((data ?? []) as any[]).map((row) => ({
    id: row.id,
    almacen_id: row.almacen_id,
    product_id: row.product_id,
    stock: Number(row.stock ?? 0),
    stock_grams: Number(row.stock_grams ?? 0),
    stock_minimo: Number(row.stock_minimo ?? 0),
    stock_maximo: Number(row.stock_maximo ?? 0),
    updated_at: row.updated_at,
    product_name: (row.products as any)?.name ?? 'Producto',
    pricing_type: (row.products as any)?.pricing_type ?? 'unit',
  }))

  return { data: normalized, error: null }
}

/**
 * Obtiene todos los productos simples (id, nombre, pricing_type, stock)
 * para el modal de asignación de stock por almacén.
 */
export async function getProductosSimples(): Promise<{ data: Array<{ id: string; name: string; pricing_type: 'unit' | 'weight'; stock: number; stock_grams: number }> | null; error: { message: string } | null }> {
  const supabase = await createServerClient()
  const { data, error } = await supabase
    .from('products')
    .select('id, name, pricing_type, stock, stock_grams')
    .order('name')
  if (error) return { data: null, error: { message: error.message } }
  return { data: (data ?? []) as any[], error: null }
}

// ---------- Mutaciones ----------

/**
 * Crea un almacén nuevo.
 * @param input Datos del almacén.
 */
export async function createAlmacen(input: AlmacenInput): Promise<{ data: Almacen | null; error: { message: string } | null }> {
  const supabase = await createServerClient()

  const nombre = input.nombre.trim()
  const codigo = input.codigo.trim().toUpperCase()
  if (!nombre) return { data: null, error: { message: 'El nombre del almacén es obligatorio.' } }
  if (!codigo) return { data: null, error: { message: 'El código del almacén es obligatorio.' } }

  const { data, error } = await supabase
    .from('almacenes')
    .insert({
      nombre,
      codigo,
      tipo: input.tipo,
      direccion: input.direccion?.trim() || null,
      ciudad: input.ciudad?.trim() || null,
      telefono: input.telefono?.trim() || null,
      responsable: input.responsable?.trim() || null,
      activo: input.activo ?? true,
    })
    .select('*')
    .single()

  if (error) return { data: null, error: { message: error.message } }
  return { data: data as Almacen, error: null }
}

/**
 * Actualiza un almacén existente.
 * @param id ID del almacén.
 * @param input Datos a actualizar.
 */
export async function updateAlmacen(id: string, input: Partial<AlmacenInput>): Promise<{ data: Almacen | null; error: { message: string } | null }> {
  const supabase = await createServerClient()

  const update: Record<string, unknown> = {}
  if (input.nombre !== undefined) update.nombre = input.nombre.trim()
  if (input.codigo !== undefined) update.codigo = input.codigo.trim().toUpperCase()
  if (input.tipo !== undefined) update.tipo = input.tipo
  if (input.direccion !== undefined) update.direccion = input.direccion?.trim() || null
  if (input.ciudad !== undefined) update.ciudad = input.ciudad?.trim() || null
  if (input.telefono !== undefined) update.telefono = input.telefono?.trim() || null
  if (input.responsable !== undefined) update.responsable = input.responsable?.trim() || null
  if (input.activo !== undefined) update.activo = input.activo

  if (Object.keys(update).length === 0) return { data: null, error: { message: 'No hay campos para actualizar.' } }

  const { data, error } = await supabase
    .from('almacenes')
    .update(update)
    .eq('id', id)
    .select('*')
    .single()

  if (error) return { data: null, error: { message: error.message } }
  return { data: data as Almacen, error: null }
}

/**
 * Elimina un almacén (el stock asociado se borra en cascada).
 * @param id ID del almacén.
 */
export async function deleteAlmacen(id: string): Promise<{ ok: boolean; error: { message: string } | null }> {
  const supabase = await createServerClient()
  const { error } = await supabase.from('almacenes').delete().eq('id', id)
  if (error) return { ok: false, error: { message: error.message } }
  return { ok: true, error: null }
}

/**
 * Asigna o actualiza el stock de un producto en un almacén.
 * Si no existe la fila, la crea; si existe, reemplaza con el valor
 * absoluto indicado (el admin define el stock exacto del almacén).
 * @param almacenId ID del almacén.
 * @param productId ID del producto.
 * @param cantidad Cantidad en unidades (para productos por unidad).
 * @param cantidadGramos Cantidad en gramos (para productos por peso).
 */
export async function asignarStockProducto(
  almacenId: string,
  productId: string,
  cantidad: number,
  cantidadGramos: number = 0,
): Promise<{ data: ProductoStockAlmacen | null; error: { message: string } | null }> {
  const supabase = await createServerClient()

  const cantidadNum = Number(cantidad) || 0
  const gramosNum = Number(cantidadGramos) || 0
  if (cantidadNum < 0 || gramosNum < 0) return { data: null, error: { message: 'Las cantidades no pueden ser negativas.' } }

  // Upsert: crea la fila o reemplaza el stock absoluto si ya existe.
  const { data, error } = await supabase
    .from('producto_stock_almacen')
    .upsert({
      almacen_id: almacenId,
      product_id: productId,
      stock: cantidadNum,
      stock_grams: gramosNum,
      stock_minimo: 0,
      stock_maximo: 0,
    }, { onConflict: 'almacen_id,product_id' })
    .select('*')
    .single()

  if (error) return { data: null, error: { message: error.message } }
  return { data: data as ProductoStockAlmacen, error: null }
}

/**
 * Transfiere stock entre almacenes (RPC transaccional).
 * @param productId ID del producto.
 * @param origen ID del almacén origen.
 * @param destino ID del almacén destino.
 * @param cantidad Cantidad en unidades (0 si es por peso).
 * @param cantidadGramos Cantidad en gramos (0 si es por unidad).
 */
export async function transferirStock(
  productId: string,
  origen: string,
  destino: string,
  cantidad: number,
  cantidadGramos: number = 0,
): Promise<{ ok: boolean; error: { message: string } | null }> {
  const supabase = await createServerClient()
  const { data, error } = await supabase.rpc('transferir_stock_almacen', {
    p_producto_id: productId,
    p_origen: origen,
    p_destino: destino,
    p_cantidad: Math.floor(Number(cantidad) || 0),
    p_cantidad_gramos: Number(cantidadGramos) || 0,
  })
  if (error) return { ok: false, error: { message: error.message } }
  return { ok: Boolean(data), error: null }
}