import { readFileSync, writeFileSync } from 'node:fs'
import { bereiteImportVor } from '../lib/katalog/import'
import { kontextVonListe, zeilenAusBestand, type BestandArtikel, type QuellenDatei } from '../lib/katalog/adapter-bestand'
const mj = JSON.parse(readFileSync('lib/data/mj-katalog.json', 'utf8')) as BestandArtikel[]
const ly = JSON.parse(readFileSync('lib/data/layher-katalog.json', 'utf8')) as BestandArtikel[]
const q = JSON.parse(readFileSync('lib/data/katalog-quellen.json', 'utf8')) as QuellenDatei
const alle = [...mj, ...ly]
const gesehen = new Set<string>()
const proHersteller: Record<string, any> = {}
const meld: Record<string, number> = {}
const gewArt: Record<string, number> = {}
const kat: Record<string, number> = {}
const katSich: Record<string, number> = {}
const nummernHersteller = new Map<string, Set<string>>()
const gewichteProNummer = new Map<string, Map<string, Set<number>>>()
let gesamt = 0
for (const liste of [...new Set(alle.map((a) => a.l))]) {
  const ctx = kontextVonListe(liste, q)
  const b = bereiteImportVor(zeilenAusBestand(alle, liste, q), ctx, gesehen)
  const h = (proHersteller[ctx.herstellerSchluessel] ??= { gesamt: 0, neu: 0, unsicher: 0, dubletten: 0, fehler: 0 })
  h.gesamt += b.gesamt; h.neu += b.neu; h.unsicher += b.unsicher; h.dubletten += b.dubletten; h.fehler += b.fehler
  gesamt += b.gesamt
  for (const z of b.zeilen) {
    if (z.ergebnis === 'neu' || z.ergebnis === 'unsicher') gesehen.add(z.schluessel!)
    for (const m of z.meldungen) { const k = m.replace(/"[^"]*"/g, '"…"').replace(/[\d.,]+/g, '#').slice(0, 90); meld[k] = (meld[k] ?? 0) + 1 }
    const a = z.artikel; if (!a) continue
    gewArt[a.gewichtsart + (a.gewicht_referenz_kg === null ? ':ohne' : '')] = (gewArt[a.gewichtsart + (a.gewicht_referenz_kg === null ? ':ohne' : '')] ?? 0) + 1
    kat[a.kategorieSchluessel] = (kat[a.kategorieSchluessel] ?? 0) + 1
    katSich[a.kategorie_sicherheit] = (katSich[a.kategorie_sicherheit] ?? 0) + 1
    const nk = `${a.herstellerSchluessel}`
    const set = nummernHersteller.get(a.artikelnummer_original) ?? new Set(); set.add(nk); nummernHersteller.set(a.artikelnummer_original, set)
    const m = gewichteProNummer.get(`${a.herstellerSchluessel}|${a.artikelnummer_original}`) ?? new Map()
    const s = m.get(liste) ?? new Set(); if (a.gewicht_referenz_kg !== null) s.add(a.gewicht_referenz_kg); m.set(liste, s)
    gewichteProNummer.set(`${a.herstellerSchluessel}|${a.artikelnummer_original}`, m)
  }
}
const ueberHersteller = [...nummernHersteller].filter(([, s]) => s.size > 1).map(([n]) => n)
let mehrDok = 0, abweichend = 0
for (const m of gewichteProNummer.values()) {
  if (m.size > 1) { mehrDok++; const alleW = new Set([...m.values()].flatMap((s) => [...s])); if (alleW.size > 1) abweichend++ }
}
const out = { gesamt, proHersteller, gewichtsarten: gewArt, kategorien: kat, kategorieSicherheit: katSich, meldungen: Object.entries(meld).sort((a, b) => b[1] - a[1]).slice(0, 12),
  eindeutigkeit: { nummernBeiMehrerenHerstellern: ueberHersteller.length, beispiele: ueberHersteller.slice(0, 5), nummernInMehrerenDokumenten: mehrDok, davonMitAbweichendemGewicht: abweichend } }
writeFileSync('docs/katalog/importlauf-ergebnis.json', JSON.stringify(out, null, 2))
console.log(JSON.stringify(out, null, 2))
