// Turmhaube (Zwiebelhaube mit Laterne und Spitze) – reine Darstellung, kein Einfluss auf Gerüst, Mengen oder LV.
// Das Profil ist eine Standardform, aus der Ansicht eines Turms mit Zwiebelhaube im Maßstab 1:100 abgemessen
// (Schaft ca. 9 m breit). Maße am echten Turm vor Ort prüfen; die Haube ersetzt keine Aufmaßzeichnung.

export type HaubenForm = 'zwiebel-laterne'
export const HAUBEN_FORMEN: HaubenForm[] = ['zwiebel-laterne']
export const istHaubenForm = (v: unknown): v is HaubenForm => typeof v === 'string' && (HAUBEN_FORMEN as string[]).includes(v)

/** Profil als [Höhe über Schaftoberkante in m, Radius in m]; wird um die Mittelachse des Turms gedreht. */
export const HAUBEN_PROFIL: Record<HaubenForm, [number, number][]> = {
  'zwiebel-laterne': [
    [2.5, 0], [2.5, 2.4],                                                   // Ansatz auf dem Walm-Sockel (Boden geschlossen)
    [2.8, 2.6], [3.4, 2.9], [4.05, 3.15], [4.66, 3.3], [5.27, 3.34],        // untere Zwiebel
    [5.88, 3.29], [6.5, 3.14], [7.1, 2.8], [7.7, 2.2], [8.3, 1.6], [8.8, 1.33],
    [8.8, 1.5], [9.1, 1.5], [9.1, 1.33], [12.4, 1.33], [12.4, 1.5], [12.8, 1.5], // Laterne mit Decken
    [13.1, 1.5], [14.0, 1.04], [15.1, 0.75], [15.8, 0.37], [16.4, 0.15], [17.05, 0.05], // obere Zwiebel
    [18.8, 0.04],                                                           // Spitze
  ],
}

/** Höhe des Walm-Sockels, damit die Dachfläche genau dort auf Zwiebelradius trifft (Ansatz 2,5 m über Schaft, Radius 2,4 m).
 *  Ist der Turm so schmal, dass der Sockel dort schon spitz ist, bleibt der Sockel flach (2,5 m). */
export function walmSockelHoehe(halbeBreiteM: number): number {
  const ansatzH = HAUBEN_PROFIL['zwiebel-laterne'][1][0], r0 = HAUBEN_PROFIL['zwiebel-laterne'][1][1]
  return halbeBreiteM > r0 ? Math.round((ansatzH / (1 - r0 / halbeBreiteM)) * 10) / 10 : ansatzH
}

/** Höhe der Haube über der Schaftoberkante in m. */
export const haubenHoehe = (form: HaubenForm): number => HAUBEN_PROFIL[form][HAUBEN_PROFIL[form].length - 1][0]
