import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'auth_required' }, { status: 401 })
  const body = await request.json().catch(() => null)
  const items = Array.isArray(body?.items) ? body.items : []
  if (!items.length) return NextResponse.json({ error: 'empty_cart' }, { status: 400 })

  const ids = items.map((item: { product_id?: string }) => item.product_id).filter(Boolean)
  const { data: products, error: productsError } = await supabase.from('products').select('id,name,price_usd,stock').in('id', ids)
  if (productsError) return NextResponse.json({ error: 'products_unavailable' }, { status: 500 })
  const byId = new Map((products ?? []).map((product) => [product.id, product]))
  const normalized = items.map((item: { product_id: string; quantity: number }) => {
    const product = byId.get(item.product_id)
    const quantity = Number(item.quantity)
    if (!product || !Number.isInteger(quantity) || quantity < 1 || quantity > product.stock) return null
    return { product_id: product.id, product_name: product.name, quantity, unit_price_usd: product.price_usd }
  })
  if (normalized.some((item) => !item)) return NextResponse.json({ error: 'stock_or_quantity_invalid' }, { status: 400 })
  const validItems = normalized as Array<{ product_id: string; product_name: string; quantity: number; unit_price_usd: number }>
  const total = validItems.reduce((sum, item) => sum + Number(item.unit_price_usd) * item.quantity, 0)
  const { data: solicitud, error } = await supabase.from('solicitudes').insert({ user_id: user.id, total_usd: total, exchange_rate: 36.5 }).select('id').single()
  if (error || !solicitud) return NextResponse.json({ error: 'solicitud_failed' }, { status: 500 })
  const { error: itemsError } = await supabase.from('solicitud_items').insert(validItems.map((item) => ({ ...item, solicitud_id: solicitud.id })))
  if (itemsError) return NextResponse.json({ error: 'items_failed' }, { status: 500 })
  return NextResponse.json({ id: solicitud.id, total })
}
