// ============================================================
// SCAFFOLD OS – Tests: Aufmaß-Sitzungs-Logik
//
// Deckt genau das Szenario ab, das mehrfach zu echten, gemeldeten
// Fehlern geführt hat: bestehendes Projekt öffnen, ändern, zwischen
// den Schritten wechseln, speichern – und danach ein ANDERES Projekt
// öffnen, ohne dass Daten des einen im anderen landen.
// ============================================================

import { describe, it, expect } from 'vitest'
import { sollFrischGeladenWerden } from '../aufmass-projekt-session'

describe('sollFrischGeladenWerden', () => {
  it('kein Projekt geöffnet (neues Aufmaß) → nie frisch laden', () => {
    expect(sollFrischGeladenWerden(null, null)).toBe(false)
    expect(sollFrischGeladenWerden(null, 'projekt-a')).toBe(false)
  })

  it('erstmaliges Öffnen eines Projekts (noch keine Markierung) → frisch laden', () => {
    expect(sollFrischGeladenWerden('projekt-a', null)).toBe(true)
  })

  it('dasselbe Projekt erneut betreten (z.B. Schritt 6 → zurück zu Schritt 1) → NICHT erneut laden', () => {
    // Das war der Kern des ursprünglichen Bugs: eigene, frische
    // Änderungen aus einem früheren Schritt dürfen hier nicht durch
    // den alten Datenbank-Stand überschrieben werden.
    expect(sollFrischGeladenWerden('projekt-a', 'projekt-a')).toBe(false)
  })

  it('ein ANDERES Projekt wird geöffnet (Wechsel) → frisch laden', () => {
    // Das war der zweite, ebenfalls gemeldete Bug: nach dem Bearbeiten
    // von Projekt A wurden bei Projekt B dessen alte Werte gezeigt.
    expect(sollFrischGeladenWerden('projekt-b', 'projekt-a')).toBe(true)
  })

  it('kompletter Ablauf: A bearbeiten, dann zu B wechseln, dann zurück zu A', () => {
    let markierung: string | null = null

    // 1) Projekt A zum ersten Mal öffnen
    expect(sollFrischGeladenWerden('projekt-a', markierung)).toBe(true)
    markierung = 'projekt-a' // (setzeMarkierung würde das tun)

    // 2) Innerhalb derselben Sitzung durch die Schritte von A wechseln
    expect(sollFrischGeladenWerden('projekt-a', markierung)).toBe(false)
    expect(sollFrischGeladenWerden('projekt-a', markierung)).toBe(false)

    // 3) Projekt B öffnen (anderes Projekt!) → muss frisch laden
    expect(sollFrischGeladenWerden('projekt-b', markierung)).toBe(true)
    markierung = 'projekt-b'

    // 4) Später wieder zurück zu Projekt A → muss WIEDER frisch laden
    //    (nicht mehr die zwischenzeitlich für B gültige Sitzung nutzen)
    expect(sollFrischGeladenWerden('projekt-a', markierung)).toBe(true)
  })
})
