import { requireAdmin } from '@/lib/auth'
import { AdminPageHeader, AdminShell } from '@/components/admin-shell'
import { RequestManager } from '@/components/request-manager'

export default async function RequestsPage() { const { supabase } = await requireAdmin(); const { data: requests } = await supabase.from('solicitudes').select('*, solicitud_items(*)').order('created_at', { ascending: false }); return <AdminShell><AdminPageHeader eyebrow="Operaciones" title="Solicitudes" description="Revisa qué pidió cada cliente y actualiza el estado." /><div className="p-5 sm:p-8"><RequestManager initialRequests={requests ?? []} /></div></AdminShell> }
