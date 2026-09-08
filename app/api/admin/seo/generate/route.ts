import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import { generateSeoContent } from '@/services/seo-content'

export const runtime = 'nodejs'
export const maxDuration = 30

export async function POST(req: Request) {
  await requireAdmin()
  const body = await req.json()
  const result = await generateSeoContent({
    nombre: typeof body?.nombre === 'string' ? body.nombre : undefined,
    crudo: typeof body?.crudo === 'string' ? body.crudo : undefined,
  })
  if (!result.success) return NextResponse.json({ error: result.error }, { status: 500 })
  return NextResponse.json({ success: true, data: result.data })
}

