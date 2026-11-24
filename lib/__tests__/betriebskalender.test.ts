import { describe, it, expect } from 'vitest'
import { pruefeKalenderEintrag } from '../betriebskalender'

describe('Betriebskalender-Prüfung', () => {
  it('nimmt gültige Einträge an, ein einzelner Tag braucht nur „Von“', () => {
    expect(pruefeKalenderEintrag({ art: 'betriebsferien', bezeichnung: ' Sommer ', von: '2026-08-03', bis: '2026-08-14' })).toEqual({ ok: true, art: 'betriebsferien', bezeichnung: 'Sommer', von: '2026-08-03', bis: '2026-08-14' })
    expect(pruefeKalenderEintrag({ art: 'feiertag', bezeichnung: 'Heiligabend', von: '2026-12-24' })).toMatchObject({ ok: true, bis: '2026-12-24' })
  })
  it.each([
    [{ art: 'x', bezeichnung: 'a', von: '2026-08-03', bis: '2026-08-04' }, 'Art'],
    [{ art: 'feiertag', bezeichnung: ' ', von: '2026-08-03', bis: '2026-08-04' }, 'Bezeichnung'],
    [{ art: 'feiertag', bezeichnung: 'a', von: '2026-02-30', bis: '2026-03-01' }, 'Datum'],
    [{ art: 'feiertag', bezeichnung: 'a', von: '2026-08-05', bis: '2026-08-04' }, 'nicht vor'],
    [{ art: 'betriebsferien', bezeichnung: 'a', von: '2026-01-01', bis: '2026-12-31' }, '120 Tage'],
  ])('lehnt %j ab', (e, wort) => {
    const r = pruefeKalenderEintrag(e)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.fehler).toContain(wort)
  })
})
