import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

// Wächter: Es darf keine parallele Formel für den offenen Betrag geben. Alle Oberflächen müssen lib/forderung.ts benutzen.
const wurzel = join(__dirname, '..', '..')
const alle = (dir: string): string[] => readdirSync(dir).flatMap((n) => {
  if (n === 'node_modules' || n === '__tests__' || n.startsWith('.')) return []
  const p = join(dir, n); return statSync(p).isDirectory() ? alle(p) : /\.(ts|tsx)$/.test(n) ? [p] : []
})
const formel = /gross_amount\)?\s*-\s*(Number\()?[\w.]*paid_amount/

describe('zentrale Forderungsberechnung', () => {
  const dateien = ['app', 'components'].flatMap((d) => alle(join(wurzel, d)))
  it('Anzeigen mit eigener „Brutto − bezahlt“-Rechnung nutzen lib/forderung.ts (die Formel steht dort nur als Rückfall)', () => {
    for (const f of dateien) {
      const t = readFileSync(f, 'utf8')
      if (formel.test(t) && !/api\/invoice-payments\/route/.test(f)) {
        expect(t, `${f} rechnet offene Beträge selbst, aber importiert lib/forderung nicht`).toMatch(/from '@\/lib\/(forderung|faktura-kennzahlen)'/)
      }
    }
  })
  it('Kundenakte, Kundenliste, Zahlungsabgleich, Rechnungsakte, Rechnungsliste, Auftragsstand und Faktura-Übersicht verwenden die zentrale Berechnung', () => {
    const erwartet: [string, RegExp][] = [
      ['app/kunden/[id]/page.tsx', /berechneForderung/], ['app/kunden/page.tsx', /berechneForderung/], ['app/zahlungsabgleich/page.tsx', /berechneForderung/],
      ['app/rechnungen/[id]/page.tsx', /berechneForderung/], ['components/rechnungen/RechnungenInhalt.tsx', /berechneForderung/],
      ['lib/auftragsstand.ts', /berechneForderung/], ['lib/abrechnung-pruefung.ts', /berechneForderung/], ['lib/faktura-kennzahlen.ts', /berechneForderung/],
    ]
    for (const [datei, muster] of erwartet) expect(readFileSync(join(wurzel, datei), 'utf8'), datei).toMatch(muster)
  })
  it('keine Berechnung summiert gross_amount über offen/überfällig-Status', () => {
    for (const f of dateien) {
      const t = readFileSync(f, 'utf8')
      expect(t, f).not.toMatch(/status === 'offen' \|\| i\.status === 'ueberfaellig'\)\s*\n?\s*\.reduce/)
    }
  })
  describe('Wächter für lib/, app/api/ und Cronjobs (keine parallele Formel)', () => {
    const serverDateien = ['lib', 'app/api'].flatMap((d) => alle(join(wurzel, d))).map((f) => f.slice(wurzel.length + 1).replace(/\\/g, '/'))
    // Dokumentierte, fachlich eigenständige Ausnahmen (kein offener Betrag einer Forderung):
    //  • lib/forderung.ts: die zentrale Quelle selbst
    //  • app/api/import/rechnungen/route.ts: Vorschau-Summe beim CSV-Import (Importzeilen, Gutschriftbezug zur Importzeit nicht auflösbar)
    //  • lib/schlussrechnung.ts: bereits bezahlte Abschläge bei der Anrechnung (Bezahlt-Anteil je Abschlag)
    //  • lib/abrechnung-pruefung.ts: Plausibilitätsprüfung „mehr bezahlt als berechnet“
    const ausnahmen = new Set(['lib/forderung.ts', 'app/api/import/rechnungen/route.ts', 'lib/schlussrechnung.ts', 'lib/abrechnung-pruefung.ts'])
    it('keine Funktion „offenerBetrag“ und keine „brutto − bezahlt“-Formel außerhalb der zentralen Quelle', () => {
      const parallel = /function\s+offenerBetrag\b|gross_amount\)?\s*-\s*\(?(Number\()?[\w.]*paid_amount|(brutto|gross)\w*\)?\s*-\s*\(?[\w.]*(bezahlt|paid)/i
      for (const f of serverDateien) {
        if (ausnahmen.has(f)) continue
        expect(readFileSync(join(wurzel, f), 'utf8'), `${f} rechnet offene Beträge selbst`).not.toMatch(parallel)
      }
    })
    it('Mahnwesen, Cron und Zahlungsroute beziehen den offenen Betrag aus der zentralen Berechnung', () => {
      expect(readFileSync(join(wurzel, 'lib/mahnung-versand.ts'), 'utf8')).toMatch(/ladeBelegForderung/)
      expect(readFileSync(join(wurzel, 'app/api/invoice-payments/route.ts'), 'utf8')).toMatch(/rpc\/faktura_zahlung_buchen/) // atomar in der Datenbank (Spiegel von lib/forderung.ts, Paritätstest)
      expect(readFileSync(join(wurzel, 'app/api/cron/mahnwesen/route.ts'), 'utf8')).toMatch(/sendeMahnschritt/)
    })
    it('Mahn-PDFs haben keinen Rückfall auf eine Eigenberechnung', () => {
      const t = readFileSync(join(wurzel, 'lib/invoice-pdf.ts'), 'utf8')
      expect(t).toMatch(/offen_zentral fehlt|Offener Betrag \(zentral\) fehlt/)
      expect(t).not.toMatch(/gross_amount\)\s*-\s*\(?Number\(inv\.paid_amount/)
    })
  })
})
