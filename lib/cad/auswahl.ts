// ============================================================
// SCAFFOLD OS – CAD: Auswahl-Engine (Paket 1)
// Zuordnung Klick → Bauteil-ID, ohne Raten:
//  - Jede gezeichnete Instanz ist über einen Schnappschuss (Index → ID) EINDEUTIG mit ihrer Bauteil-ID verbunden.
//    Der Schnappschuss wird im selben Schritt wie die Matrizen gesetzt: Was gezeichnet ist, ist auch das, was angeklickt wird.
//  - Ungültige Indizes ergeben KEINE Auswahl (kein Fallback auf „irgendein“ Bauteil).
//  - Mehrere Treffer entlang des Strahls: der nächste Treffer gewinnt; Hüllen (Planen, Netze, Schutzdach) kommen zuletzt,
//    damit eine davorliegende Plane nicht das Gerüstteil dahinter verdeckt. Mit Alt+Klick oder erneutem Klick an
//    derselben Stelle wird zum nächsten darunterliegenden Bauteil durchgeschaltet.
// ============================================================

/** Flächige Hüllen: liegen vor dem Gerüst und würden sonst jeden Klick „schlucken“. */
export const HUELL_TYPEN: ReadonlySet<string> = new Set(['sheeting', 'net', 'safety_net', 'protection_roof'])

export interface Treffer { id: string; typ: string; abstand: number }

/** Index → ID, genau so wie die Matrizen gesetzt wurden. */
export function baueInstanzIds(items: readonly { id: string }[]): string[] {
  return items.map((i) => i.id)
}

/** Liefert die ID zum Instanz-Index – oder null, wenn der Index nicht (mehr) zu einer gezeichneten Instanz gehört. */
export function loeseInstanz(ids: readonly string[] | null | undefined, index: number | undefined | null): string | null {
  if (!ids || index === undefined || index === null) return null
  if (!Number.isInteger(index) || index < 0 || index >= ids.length) return null
  return ids[index] ?? null
}

/** IDs, die mehrfach vorkommen. Doppelte IDs machen eine eindeutige Auswahl unmöglich. */
export function findeDoppelteIds(items: readonly { id: string }[]): string[] {
  const gesehen = new Set<string>(), doppelt = new Set<string>()
  for (const i of items) { if (gesehen.has(i.id)) doppelt.add(i.id); else gesehen.add(i.id) }
  return [...doppelt]
}

/** Sortiert die Treffer: Gerüstteile nach Abstand, danach die Hüllen nach Abstand; jede ID nur einmal. */
export function ordneTreffer(treffer: readonly Treffer[], huellenZuletzt = true): Treffer[] {
  const beste = new Map<string, Treffer>()
  for (const t of treffer) { const alt = beste.get(t.id); if (!alt || t.abstand < alt.abstand) beste.set(t.id, t) }
  const liste = [...beste.values()]
  const rang = (t: Treffer) => (huellenZuletzt && HUELL_TYPEN.has(t.typ) ? 1 : 0)
  return liste.sort((a, b) => rang(a) - rang(b) || a.abstand - b.abstand || a.id.localeCompare(b.id))
}

/** Wählt aus den Treffern genau ein Bauteil. `weiter` = zum nächsten darunterliegenden Treffer wechseln. */
export function waehleTreffer(treffer: readonly Treffer[], opt: { aktuell?: string | null; weiter?: boolean; huellenZuletzt?: boolean } = {}): string | null {
  const o = ordneTreffer(treffer, opt.huellenZuletzt ?? true)
  if (o.length === 0) return null
  if (opt.weiter && opt.aktuell) {
    const i = o.findIndex((t) => t.id === opt.aktuell)
    if (i >= 0) return o[(i + 1) % o.length].id
  }
  return o[0].id
}

/** Gleicher Punkt, kurz nacheinander = Anwender will zum nächsten Teil darunter. */
export function istWiederholterKlick(vorher: { x: number; y: number; zeit: number } | null, jetzt: { x: number; y: number; zeit: number }, toleranzPx = 4, fensterMs = 2500): boolean {
  if (!vorher) return false
  return Math.hypot(jetzt.x - vorher.x, jetzt.y - vorher.y) <= toleranzPx && jetzt.zeit - vorher.zeit <= fensterMs
}
