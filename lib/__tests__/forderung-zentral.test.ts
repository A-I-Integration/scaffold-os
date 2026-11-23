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
})
