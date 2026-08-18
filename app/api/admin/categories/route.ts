import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'

export async function POST(request: Request) { const { supabase } = await requireAdmin(); const body = await request.json(); const { data, error } = await supabase.from('categories').insert({ name: String(body.name ?? '').trim(), slug: String(body.slug ?? '').trim(), description: body.description ?? null }).select('*').single(); if (error) return NextResponse.json({ error: error.message }, { status: 400 }); return NextResponse.json({ category: data }) }
export async function PATCH(request: Request) { const { supabase } = await requireAdmin(); const body = await request.json(); const { data, error } = await supabase.from('categories').update({ name: body.name, slug: body.slug, description: body.description ?? null }).eq('id', body.id).select('*').single(); if (error) return NextResponse.json({ error: error.message }, { status: 400 }); return NextResponse.json({ category: data }) }
export async function DELETE(request: Request) { const { supabase } = await requireAdmin(); const id = new URL(request.url).searchParams.get('id'); const { error } = await supabase.from('categories').delete().eq('id', id); if (error) return NextResponse.json({ error: error.message }, { status: 400 }); return NextResponse.json({ ok: true }) }
EOF
