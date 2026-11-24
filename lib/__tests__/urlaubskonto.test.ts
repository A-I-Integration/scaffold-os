import { describe, it, expect } from 'vitest'
import { feiertageNrw, arbeitstage, anspruchBisMonat, urlaubskonto, urlaubsVorschau } from '../urlaubskonto'

const A30 = [{ tage_pro_jahr: 30, gueltig_ab: '2020-01-01' }]
describe('Feiertage und Arbeitstage (NRW)', () => {
  it('kennt die beweglichen und festen Feiertage 2026', () => {
    const f = feiertageNrw(2026)
    for (const t of ['2026-01-01', '2026-04-03', '2026-04-06', '2026-05-01', '2026-05-14', '2026-05-25', '2026-06-04', '2026-10-03', '2026-11-01', '2026-12-25', '2026-12-26']) expect(f.has(t), t).toBe(true)
    expect(f.size).toBe(11)
    expect(feiertageNrw(2025).has('2025-04-18')).toBe(true) // Karfreitag 2025
    expect(feiertageNrw(2025).has('2025-06-19')).toBe(true) // Fronleichnam 2025
  })
  it('zählt nur Mo–Fr ohne Feiertage', () => {
    expect(arbeitstage('2026-12-21', '2026-12-31')).toHaveLength(8)
    expect(arbeitstage('2026-11-14', '2026-11-15')).toHaveLength(0)
    expect(arbeitstage('2026-11-13', '2026-11-12')).toHaveLength(0)
    expect(arbeitstage('2026-05-11', '2026-05-15')).toHaveLength(4) // Himmelfahrt
  })
})

describe('Anteiliger Anspruch', () => {
  it('ganzes Jahr: 30 Tage, bis Monat n anteilig', () => {
    const k = { anspruch: A30, eintritt: '2026-01-01' }
    expect(anspruchBisMonat(k, 2026, 12)).toBe(30)
    expect(anspruchBisMonat(k, 2026, 3)).toBe(7.5)
    expect(anspruchBisMonat(k, 2026, 11)).toBe(27.5)
  })
  it('Eintritt mitten im Monat: der Monat zählt noch nicht voll', () => {
    expect(anspruchBisMonat({ anspruch: A30, eintritt: '2026-03-15' }, 2026, 12)).toBe(22.5)
    expect(anspruchBisMonat({ anspruch: A30, eintritt: '2026-03-01' }, 2026, 12)).toBe(25)
    expect(anspruchBisMonat({ anspruch: A30, eintritt: '2026-03-15' }, 2026, 3)).toBe(0)
  })
  it('Austritt zum Monatsende zählt, danach nichts mehr; Eintritt in einem früheren Jahr ändert nichts', () => {
    expect(anspruchBisMonat({ anspruch: A30, eintritt: '2020-05-01', austritt: '2026-06-30' }, 2026, 12)).toBe(15)
    expect(anspruchBisMonat({ anspruch: A30, eintritt: '2020-05-01' }, 2026, 12)).toBe(30)
  })
  it('ohne Eintritt volles Jahr, ohne Anspruch null', () => {
    expect(anspruchBisMonat({ anspruch: A30 }, 2026, 12)).toBe(30)
    expect(anspruchBisMonat({ anspruch: [] }, 2026, 12)).toBe(0)
  })
  it('Änderung des Anspruchs im Jahr wirkt ab dem Monat', () => {
    const k = { anspruch: [{ tage_pro_jahr: 24, gueltig_ab: '2025-01-01' }, { tage_pro_jahr: '30', gueltig_ab: '2026-07-01' }], eintritt: '2025-01-01' }
    expect(anspruchBisMonat(k, 2026, 12)).toBe(27)
    expect(anspruchBisMonat(k, 2026, 7)).toBe(14.5)
  })
})

describe('Urlaubskonto und bezahlt/unbezahlt', () => {
  const neu = { anspruch: A30, eintritt: '2026-10-01' }
  it('Antrag über den Anspruch hinaus: Rest wird unbezahlt', () => {
    // bis Nov zustehend: 5 Tage; 10 Arbeitstage beantragt
    const v = urlaubsVorschau(neu, [], '2026-11-02', '2026-11-13', '2026-10-15')
    expect(v).toMatchObject({ tage: 10, bezahlt: 5, unbezahlt: 5 })
    expect(v.hinweis).toContain('5 Tage davon müssen als unbezahlter Urlaub genommen werden')
  })
  it('Antrag innerhalb des Anspruchs ist voll bezahlt; Wochenende zählt nicht', () => {
    const v = urlaubsVorschau({ anspruch: A30, eintritt: '2026-01-01' }, [], '2026-11-27', '2026-12-01', '2026-11-24')
    expect(v).toMatchObject({ tage: 3, bezahlt: 3, unbezahlt: 0 })
    expect(v.hinweis).toBe('3 Tage bezahlter Urlaub.')
    expect(urlaubsVorschau({ anspruch: A30 }, [], '2026-11-14', '2026-11-15', '2026-11-12').hinweis).toContain('kein Arbeitstag')
  })
  it('bereits genommener Urlaub vermindert den Rest; abgelehnter zählt nicht', () => {
    const k = { anspruch: A30, eintritt: '2026-01-01' }
    const vorhanden = [
      { id: 'a', start_date: '2026-03-02', end_date: '2026-03-06', status: 'approved' },
      { id: 'b', start_date: '2026-06-01', end_date: '2026-06-05', status: 'pending' }, // 4. Juni Fronleichnam: 4 Arbeitstage
      { id: 'c', start_date: '2026-08-03', end_date: '2026-08-14', status: 'rejected' },
    ]
    const konto = urlaubskonto(k, vorhanden, '2026-11-24')
    expect(konto).toMatchObject({ jahr: 2026, anspruchJahr: 30, anspruchBisHeute: 27.5, genommenBezahlt: 5, beantragtBezahlt: 4, unbezahlt: 0, restBisHeute: 18.5, restJahresende: 21 })
    expect(konto.zeilen.map(z => z.id)).toEqual(['a', 'b'])
  })
  it('spätere Anträge nutzen den Rest: die Reihenfolge entscheidet nach Datum', () => {
    const k = { anspruch: A30, eintritt: '2026-10-01' }
    const u = [{ id: 'x', start_date: '2026-11-02', end_date: '2026-11-06', status: 'approved' }, { id: 'y', start_date: '2026-11-09', end_date: '2026-11-13', status: 'pending' }]
    const konto = urlaubskonto(k, u, '2026-11-24')
    expect(konto.zeilen.find(z => z.id === 'x')).toMatchObject({ bezahlt: 5, unbezahlt: 0 })
    expect(konto.zeilen.find(z => z.id === 'y')).toMatchObject({ bezahlt: 0, unbezahlt: 5 })
    expect(konto.unbezahlt).toBe(5)
  })
  it('Urlaub über den Jahreswechsel: jedes Jahr mit eigenem Anspruch', () => {
    const k = { anspruch: A30, eintritt: '2026-01-01' }
    const v = urlaubsVorschau(k, [], '2026-12-28', '2027-01-05', '2026-12-01')
    expect(v).toMatchObject({ tage: 6, bezahlt: 6, unbezahlt: 0 }) // 1.1.2027 ist Feiertag
  })
  it('weist auf fehlende Angaben hin', () => {
    expect(urlaubskonto({ anspruch: [] }, [], '2026-11-24').hinweise).toEqual(['Es ist noch kein Urlaubsanspruch hinterlegt.', 'Der erste Arbeitstag fehlt: es wird das volle Jahr angenommen.'])
  })
})

describe('Betriebsferien und freie Tage', () => {
  const bf = { id: 'k1', art: 'betriebsferien', von: '2026-08-03', bis: '2026-08-14' } // 10 Arbeitstage
  const k = { anspruch: A30, eintritt: '2026-01-01', kalender: [bf] }
  it('Betriebsferien werden fest abgezogen, erst ab dem Monat, in dem sie liegen', () => {
    const jul = urlaubskonto(k, [], '2026-07-15')
    expect(jul).toMatchObject({ anspruchBisHeute: 17.5, betriebsferien: 10, restBisHeute: 17.5, restJahresende: 20 })
    const nov = urlaubskonto(k, [], '2026-11-24')
    expect(nov).toMatchObject({ anspruchBisHeute: 27.5, betriebsferien: 10, restBisHeute: 17.5, restJahresende: 20, unbezahlt: 0 })
    const aug = urlaubskonto(k, [], '2026-08-20')
    expect(aug.restBisHeute).toBe(20 - 10) // 20 zustehend bis August, 10 Tage Betriebsferien
  })
  it('eigener Urlaub in den Betriebsferien zählt nicht doppelt', () => {
    const u = [{ id: 'a', start_date: '2026-08-10', end_date: '2026-08-14', status: 'approved' }]
    const konto = urlaubskonto(k, u, '2026-11-24')
    expect(konto.zeilen[0]).toMatchObject({ tage: 0 })
    expect(konto.restBisHeute).toBe(17.5)
    const v = urlaubsVorschau(k, [], '2026-08-10', '2026-08-14', '2026-07-01')
    expect(v).toMatchObject({ tage: 0, inBetriebsferien: 5 })
    expect(v.hinweis).toContain('Betriebsferien')
  })
  it('ein Antrag, der teilweise in die Betriebsferien reicht, zählt nur die übrigen Tage', () => {
    const v = urlaubsVorschau(k, [], '2026-08-13', '2026-08-18', '2026-07-01') // Do, Fr (Betriebsferien) + Mo, Di, (Mi 19. nicht)
    expect(v).toMatchObject({ tage: 2, inBetriebsferien: 2 })
    expect(v.hinweis).toContain('2 Tage liegen in den Betriebsferien')
  })
  it('freier Tag (z. B. Heiligabend) zählt nicht als Urlaubstag', () => {
    const kf = { anspruch: A30, eintritt: '2026-01-01', kalender: [{ art: 'feiertag', von: '2026-12-24', bis: '2026-12-24' }] }
    expect(urlaubsVorschau(kf, [], '2026-12-21', '2026-12-24', '2026-12-01')).toMatchObject({ tage: 3 })
    expect(urlaubsVorschau({ anspruch: A30, eintritt: '2026-01-01' }, [], '2026-12-21', '2026-12-24', '2026-12-01')).toMatchObject({ tage: 4 })
  })
  it('Betriebsferien vor dem Eintritt zählen nicht; ohne Anspruch bis dahin sind sie unbezahlt', () => {
    const spaet = urlaubskonto({ anspruch: A30, eintritt: '2026-08-05', kalender: [bf] }, [], '2026-11-24')
    expect(spaet).toMatchObject({ betriebsferien: 0, unbezahlt: 8 }) // 5.–14. August: 8 Arbeitstage, Anspruch beginnt im September
    const frueher = urlaubskonto({ anspruch: A30, eintritt: '2026-09-01', kalender: [bf] }, [], '2026-11-24')
    expect(frueher).toMatchObject({ betriebsferien: 0, unbezahlt: 0 }) // vor dem Eintritt
  })
  it('Betriebsferien über mehrere Wochen: Feiertage darin werden nicht doppelt abgezogen', () => {
    const w = urlaubskonto({ anspruch: A30, eintritt: '2026-01-01', kalender: [{ art: 'betriebsferien', von: '2026-12-21', bis: '2027-01-08' }] }, [], '2026-12-01')
    // 2026: 21–24, 28–31 (25. Feiertag) = 8 Tage
    expect(w.betriebsferien).toBe(8)
  })
})

