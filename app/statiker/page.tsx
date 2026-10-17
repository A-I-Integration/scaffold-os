'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

// ============================================================
// SCAFFOLD OS – Statiker-Bereich: meine freigegebenen Projekte
//
// Externe Ingenieurbüros sehen hier nur die Projekte, die ihnen das Büro
// freigegeben hat – mit 3D-Ansicht, Maßen und Stückliste ohne Preise.
// ============================================================

type Projekt = { id: string; name: string; adresse: string | null }

export default function StatikerStartseite() {
  const router = useRouter()
  const [projekte, setProjekte] = useState<Projekt[] | null>(null)
  const [fehler, setFehler] = useState<string | null>(null)

  useEffect(() => {
    let abgebrochen = false
    fetch('/api/statiker/projekte')
      .then((r) => r.json())
      .then((j) => {
        if (abgebrochen) return
        if (j.success) setProjekte(j.projekte)
        else setFehler(j.error || 'Projekte konnten nicht geladen werden.')
      })
      .catch(() => { if (!abgebrochen) setFehler('Projekte konnten nicht geladen werden. Bitte später erneut versuchen.') })
    return () => { abgebrochen = true }
  }, [])

  async function abmelden() {
    await createClient().auth.signOut()
    router.push('/login')
    router.refresh()
  }

  return (
    <div className='min-h-screen bg-[#fbfbfd] text-[#1d1d1f]'>
      <header className='bg-white border-b border-black/5 px-4 py-3'>
        <div className='max-w-3xl mx-auto flex items-center justify-between gap-3'>
          <div>
            <h1 className='text-lg font-semibold'>Meine Projekte</h1>
            <p className='text-xs text-[#86868b]'>Statiker-Bereich</p>
          </div>
          <div className='flex items-center gap-2'><Link href='/cad' className='text-xs px-3 py-1.5 rounded-lg bg-[#e8590c] text-white hover:bg-[#d24f08]'>CAD öffnen</Link><button onClick={abmelden} className='text-xs px-3 py-1.5 rounded-lg bg-black/5 text-[#424245] hover:bg-black/10'>Abmelden</button></div>
        </div>
      </header>

      <main className='max-w-3xl mx-auto p-4'>
        {fehler && <p className='text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl p-3'>{fehler}</p>}
        {!fehler && projekte === null && <p className='text-sm text-[#86868b]'>Wird geladen…</p>}
        {projekte && projekte.length === 0 && (
          <div className='rounded-2xl border border-black/5 bg-white p-6 text-sm text-[#86868b]'>
            Aktuell ist Ihnen noch kein Projekt freigegeben. Sobald das Büro ein Projekt freigibt, erscheint es hier.
          </div>
        )}
        {projekte && projekte.length > 0 && (
          <ul className='space-y-2'>
            {projekte.map((p) => (
              <li key={p.id}>
                <Link href={`/statiker/${p.id}`} className='block rounded-2xl border border-black/5 bg-white p-4 hover:border-[#e8590c]/50'>
                  <p className='font-medium'>{p.name}</p>
                  {p.adresse && <p className='text-xs text-[#86868b] mt-0.5'>{p.adresse}</p>}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  )
}
