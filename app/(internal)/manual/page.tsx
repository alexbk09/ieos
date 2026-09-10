import { redirect } from 'next/navigation'

export const dynamic = 'force-static'

export default function ManualPage() {
  redirect('/manual/index.html')
}
