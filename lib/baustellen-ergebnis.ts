// ============================================================
// SCAFFOLD OS – Ergebnis je Baustelle (reine Logik)
//
//   Erlös          = abgerechnet netto (Rechnungen ohne Storno, Gutschriften mindern)
//   Personalkosten = gebuchte Stunden × Stundensatz aus dem Mitarbeiterstamm (+ optionaler Zuschlag in %)
//   Spesen         = Spesen aus der Zeiterfassung
//   Ergebnis       = Erlös − Personalkosten − Spesen
//
// NICHT enthalten: Material, Fahrzeuge, Kran, Fremdleistungen, Gemeinkosten. Das Ergebnis ist ein Deckungsbeitrag
// nach Personal, kein Gewinn. Mitarbeiter ohne Stundensatz werden nicht bewertet und gesondert ausgewiesen.
// ============================================================

export interface PersonalZeile {
  id: string
  name: string
  stunden: number
  /** Stundensatz in €/h; null oder 0 = nicht hinterlegt */
  satz: number | null
  spesen?: number
}

export interface BaustellenErgebnis {
  stunden: number
  personalkosten: number
  spesen: number
  kostenGesamt: number
  erloes: number
  ergebnis: number
  /** Ergebnis in % vom Erlös; null, solange noch nichts abgerechnet ist */
  margeProzent: number | null
  /** Ergebnis, wenn der gesamte Auftragswert abgerechnet wäre; null ohne Auftragswert */
  ergebnisBeiVollerAbrechnung: number | null
  stundenOhneSatz: number
  ohneSatz: string[]
  je: { id: string; name: string; stunden: number; satz: number | null; kosten: number | null }[]
}

const runde = (n: number) => Math.round(n * 100) / 100
const zahl = (v: unknown) => { const n = Number(v); return Number.isFinite(n) ? n : 0 }

export function berechneBaustellenErgebnis(args: {
  erloesNetto: number
  auftragswertNetto?: number
  zeilen: PersonalZeile[]
  /** Aufschlag auf den Stundensatz für Lohnnebenkosten in %, 0 = keiner */
  zuschlagProzent?: number
}): BaustellenErgebnis {
  const faktor = 1 + Math.max(0, zahl(args.zuschlagProzent)) / 100
  let stunden = 0, personal = 0, spesen = 0, ohneStunden = 0
  const ohneSatz: string[] = []
  const je: BaustellenErgebnis['je'] = []
  for (const z of args.zeilen) {
    const h = Math.max(0, zahl(z.stunden))
    stunden += h
    spesen += Math.max(0, zahl(z.spesen))
    const satz = zahl(z.satz) > 0 ? zahl(z.satz) : null
    if (satz === null) { if (h > 0) { ohneStunden += h; ohneSatz.push(z.name) } je.push({ id: z.id, name: z.name, stunden: runde(h), satz: null, kosten: null }); continue }
    const k = h * satz * faktor
    personal += k
    je.push({ id: z.id, name: z.name, stunden: runde(h), satz, kosten: runde(k) })
  }
  const erloes = runde(zahl(args.erloesNetto))
  const kosten = runde(personal + spesen)
  const ergebnis = runde(erloes - kosten)
  const aw = zahl(args.auftragswertNetto)
  return {
    stunden: runde(stunden), personalkosten: runde(personal), spesen: runde(spesen), kostenGesamt: kosten, erloes, ergebnis,
    margeProzent: erloes > 0 ? Math.round((ergebnis / erloes) * 1000) / 10 : null,
    ergebnisBeiVollerAbrechnung: aw > 0 ? runde(aw - kosten) : null,
    stundenOhneSatz: runde(ohneStunden), ohneSatz, je: je.sort((a, b) => b.stunden - a.stunden),
  }
}
