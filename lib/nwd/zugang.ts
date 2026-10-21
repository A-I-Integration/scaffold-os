import { timingSafeEqual } from 'crypto'
import { createClient } from '@/lib/supabase/server'
import { rolleErlaubt } from '@/lib/rollen'

/** Gleiche Rollen wie der CAD-Bereich (proxy.ts: /cad → admin, disponent, bauleiter). */
export const NWD_ROLLEN = ['admin', 'disponent', 'bauleiter'] as const

export async function darfNwdKonvertieren(userId: string): Promise<boolean> {
  try {
    const supabase = await createClient()
    const { data } = await supabase.from('profiles').select('role').eq('id', userId).single()
    return rolleErlaubt((data as { role?: string } | null)?.role, NWD_ROLLEN)
  } catch { return false }
}

/** Zeitkonstanter Vergleich; leere Geheimnisse sind nie gleich. */
export function geheimnisGleich(erhalten: string | null | undefined, erwartet: string | null | undefined): boolean {
  if (!erhalten || !erwartet) return false
  const a = Buffer.from(erhalten), b = Buffer.from(erwartet)
  return a.length === b.length && timingSafeEqual(a, b)
}

export function ergebnisUrl(pfad: string): string {
  return `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/project-media/${pfad}`
}
