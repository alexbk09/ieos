import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) { const { supabase } = await requireAdmin(); const { id } = await params; const { status } = await request.json(); const allowed = ['pending', 'confirmed', 'shipped', 'completed', 'cancelled']; if (!allowed.includes(status)) return NextResponse.json({ error: 'Estado inválido' }, { status: 400 }); const { data, error } = await supabase.from('solicitudes').update({ status }).eq('id', id).select('*').single(); if (error) return NextResponse.json({ error: error.message }, { status: 400 }); return NextResponse.json({ request: data }) }
EOF
