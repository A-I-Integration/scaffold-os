// Gerüst um einen geneigten Körper (z. B. Pylonschenkel einer Schrägseilbrücke).
//
// Warum anders als bei einer Fassade:
// - Ein Gerüst steht in Lagen, deren Rahmen senkrecht sind. Ein geneigter Körper wandert über die Lagenhöhe seitlich
//   weg. Eine Lage muss den Körper über ihre GANZE Höhe freihalten, nicht nur in ihrer Mitte.
// - Ein waagerechter Schnitt durch einen geneigten Körper ist länger als sein Querschnitt senkrecht zur Achse:
//   Tiefe waagerecht = Tiefe senkrecht / cos(Neigung).
// Daraus folgt für jede Lage ein Grundriss, der sich von Lage zu Lage um Lagenhöhe * tan(Neigung) versetzt.
// Die Funktion rechnet nur Geometrie. Preise, Feldlängen und Abstände gibt der Aufrufer vor (Standardwerte sind Annahmen).

export interface PylonEingabe {
  /** Länge des Körpers entlang der Höhe in m, gemessen als senkrechte Höhe (vom Fuß bis zum Kopf). */
  hoehe: number
  /** Neigung gegen die Senkrechte in Grad (0 = senkrecht, < 90). */
  neigungGrad: number
  /** Querschnitt senkrecht zur Körperachse: Breite quer zur Neigungsrichtung in m. */
  breite: number
  /** Querschnitt senkrecht zur Körperachse: Tiefe in Neigungsrichtung in m. */
  tiefe: number
  /** Abstand Körper bis Gerüst (Außenkante Körper bis Innenkante Gerüst) in m. */
  wandabstand?: number
  /** Breite des Gerüstbelags in m. */
  gerueste_breite?: number
  /** Lagenhöhe in m (Annahme-Standard 2,0). */
  lagenhoehe?: number
  /** Feldlänge in m für die Anzahl Felder je Seite (Annahme-Standard 2,5). */
  feldlaenge?: number
}

export interface PylonLage {
  nr: number
  zVon: number
  zBis: number
  hoehe: number
  /** Versatz der Lagenmitte gegenüber dem Fuß, in Neigungsrichtung, in m. */
  versatz: number
  /** Außenmaß der Lage quer zur Neigungsrichtung in m. */
  breiteAussen: number
  /** Außenmaß der Lage in Neigungsrichtung in m. */
  tiefeAussen: number
  umfang: number
  /** Gerüstfläche der Lage (Umfang * Lagenhöhe) in m². */
  flaeche: number
  felder: number
}

export interface PylonErgebnis {
  lagen: PylonLage[]
  gesamtFlaeche: number
  gesamtFelder: number
  /** Achslänge des Körpers (schräg gemessen) in m. */
  achslaenge: number
  /** Waagerechter Weg des Kopfes gegenüber dem Fuß in m. */
  kopfVersatz: number
  /** Waagerechte Schnitttiefe des Körpers in Neigungsrichtung in m. */
  schnittTiefe: number
  hinweise: string[]
}

export function rechnePylonGeruest(e: PylonEingabe): PylonErgebnis {
  if (!(e.hoehe > 0)) throw new Error('Höhe muss größer 0 sein')
  if (!(e.neigungGrad >= 0 && e.neigungGrad < 90)) throw new Error('Neigung muss zwischen 0 und unter 90 Grad liegen')
  if (!(e.breite > 0 && e.tiefe > 0)) throw new Error('Querschnitt muss größer 0 sein')
  const abstand = e.wandabstand ?? 0.3
  const belag = e.gerueste_breite ?? 0.9
  const lagenH = e.lagenhoehe ?? 2
  const feld = e.feldlaenge ?? 2.5
  if (!(lagenH > 0) || !(feld > 0)) throw new Error('Lagenhöhe und Feldlänge müssen größer 0 sein')

  const a = (e.neigungGrad * Math.PI) / 180
  const tan = Math.tan(a)
  const cos = Math.cos(a)
  const schnittTiefe = e.tiefe / cos
  const aussen = abstand + belag

  const lagen: PylonLage[] = []
  const anzahl = Math.ceil(e.hoehe / lagenH - 1e-9)
  for (let i = 0; i < anzahl; i++) {
    const zVon = i * lagenH
    const zBis = Math.min(e.hoehe, (i + 1) * lagenH)
    const h = zBis - zVon
    const breiteAussen = e.breite + 2 * aussen
    // Der Körper wandert über die Lage um h*tan weg; der senkrechte Rahmen muss ihn über diese ganze Strecke freihalten.
    const tiefeAussen = schnittTiefe + h * tan + 2 * aussen
    const umfang = 2 * (breiteAussen + tiefeAussen)
    const felder = 2 * (Math.ceil(breiteAussen / feld - 1e-9) + Math.ceil(tiefeAussen / feld - 1e-9))
    lagen.push({
      nr: i + 1,
      zVon, zBis, hoehe: h,
      versatz: ((zVon + zBis) / 2) * tan,
      breiteAussen, tiefeAussen, umfang,
      flaeche: umfang * h,
      felder,
    })
  }

  const hinweise: string[] = []
  if (e.neigungGrad > 0) {
    hinweise.push('Geneigter Körper: Verankerung und Standsicherheit sind je Bauzustand nachzuweisen (Einzelstatik).')
  }
  if (e.neigungGrad >= 10) {
    hinweise.push('Die Lagen versetzen sich deutlich; Belag und Treppenzugang je Lage prüfen.')
  }

  return {
    lagen,
    gesamtFlaeche: lagen.reduce((s, l) => s + l.flaeche, 0),
    gesamtFelder: lagen.reduce((s, l) => s + l.felder, 0),
    achslaenge: e.hoehe / cos,
    kopfVersatz: e.hoehe * tan,
    schnittTiefe,
    hinweise,
  }
}
