import { describe, it, expect } from 'vitest'
import { ROLE_ACCESS } from '@/lib/seiten-rollen'
import { NAV_GRUPPEN } from '@/components/shell/nav-config'

// Das Menü zeigt nur, was die Rolle darf. Die Seitensperre (proxy.ts) muss dasselbe sagen:
// sonst ist eine Seite per Adresse für jeden Eingeloggten offen (Menü nur "versteckt")
// oder ein sichtbarer Menüpunkt leitet um.

const ALLE = ['admin', 'disponent', 'bauleiter', 'mitarbeiter', 'lager']
const sperre = (pfad: string) => {
  const treffer = Object.keys(ROLE_ACCESS).find((p) => pfad.startsWith(p))
  return treffer ? ROLE_ACCESS[treffer] : null
}

describe('Seitensperren passen zum Menü', () => {
  const eintraege = NAV_GRUPPEN.flatMap((g) => g.eintraege).filter((e) => !e.href.includes('?'))
  for (const e of eintraege) {
    const menue = e.roles ?? ALLE
    it(`${e.href}: Menü und Sperre stimmen überein`, () => {
      const s = sperre(e.href)
      if (menue.length === ALLE.length) return // für alle sichtbar: keine Sperre nötig
      expect(s, `${e.href} ist im Menü auf ${menue.join('/')} beschränkt, aber nicht in lib/seiten-rollen.ts gesperrt`).not.toBeNull()
      // Sperre darf nicht weiter sein als das Menü
      const zuWeit = (s as string[]).filter((r) => !menue.includes(r as never))
      expect(zuWeit, `${e.href}: Sperre erlaubt zusätzlich ${zuWeit.join(', ')}`).toEqual([])
      // …und nicht enger (sonst leitet ein sichtbarer Menüpunkt um)
      const zuEng = menue.filter((r) => !(s as string[]).includes(r))
      expect(zuEng, `${e.href}: Menü zeigt es für ${zuEng.join(', ')}, die Sperre lässt sie nicht durch`).toEqual([])
    })
  }
  it('interne Verwaltungsseiten ohne Menüpunkt sind nur für Admin', () => {
    expect(sperre('/admin/besucher')).toEqual(['admin'])
  })
})
