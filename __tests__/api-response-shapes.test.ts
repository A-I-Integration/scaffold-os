// ============================================================
// SCAFFOLD OS – Regressionstest: API-Antwortform-Fehler
//
// In dieser Sitzung wurde mehrfach derselbe Fehler gefunden (CAD,
// dann GAEB): eine Seite ruft POST /api/projects auf, das Erfolg mit
// { id } meldet – aber die aufrufende Seite prüfte fälschlich
// json.success (existiert dort gar nicht), wodurch JEDE erfolgreiche
// Anfrage als Fehler angezeigt wurde.
//
// Dieser Test prüft direkt den Quelltext der bekannten Aufrufer-
// Dateien: nach einem POST an /api/projects darf NICHT auf
// ".success" geprüft werden. Kein Ersatz für echte Integrationstests
// mit einer echten Datenbank, aber ein gezielter, güns­tiger Schutz
// gegen genau diesen wiederkehrenden Fehler.
// ============================================================

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

const AUFRUFER_DATEIEN = [
  'app/cad/page.tsx',
  'app/cad/bruecke/page.tsx',
  'app/gaeb/page.tsx',
]

describe('Regression: POST /api/projects Antwortform', () => {
  for (const datei of AUFRUFER_DATEIEN) {
    it(`${datei}: prüft nach POST /api/projects NICHT auf ".success" (Route liefert nur { id }/{ error })`, () => {
      const inhalt = readFileSync(join(process.cwd(), datei), 'utf-8')
      // Den Abschnitt zwischen dem POST-Aufruf an /api/projects und der
      // nächsten Leerzeile grob isolieren, um nur die relevante Prüfung
      // zu betrachten (nicht jede ".success"-Nutzung im ganzen File, die
      // z.B. für /api/kunden völlig korrekt ist).
      const postIndex = inhalt.indexOf("fetch('/api/projects'")
      expect(postIndex, `${datei} sollte einen POST an /api/projects enthalten`).toBeGreaterThan(-1)
      const ausschnitt = inhalt.slice(postIndex, postIndex + 1500)
      expect(ausschnitt).not.toMatch(/if\s*\(\s*!json\.success\s*\)/)
      // Die korrekte Prüfung nutzt json.id (oder !res.ok)
      expect(ausschnitt).toMatch(/json\.id/)
    })
  }
})
