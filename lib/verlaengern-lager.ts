// Verlängert man eine Baustelle, bleibt ihr Material länger dort. Offene Transportaufträge, die dieses Material
// von der Baustelle zu einer anderen Baustelle bringen sollten, sind dann zu früh geplant.
// Geprüft wird nur, was wirklich gespeichert ist: offene Transportaufträge mit der Baustelle als Herkunft.
// Datum des Auftrags = geplantes Datum, sonst der Projektbeginn der Zielbaustelle. Ohne beides: "undatiert" (nicht raten).

export interface OffenerTransport {
  id: string
  to_project_id: string
  quantity: number
  planned_date: string | null
  /** Projektbeginn der Zielbaustelle (YYYY-MM-DD), falls vorhanden */
  ziel_beginn: string | null
  ziel_name: string | null
  artikel_name: string | null
}

export interface LagerKonflikt {
  transportId: string
  zielName: string
  artikel: string
  menge: number
  /** Datum, zu dem das Material an der Zielbaustelle gebraucht wird */
  datum: string
}

export interface LagerWarnung {
  konflikte: LagerKonflikt[]
  /** Aufträge ohne Datum: Auswirkung nicht beurteilbar */
  undatiert: number
}

const ISO = /^\d{4}-\d{2}-\d{2}$/
const tag = (v: string | null | undefined): string | null => (typeof v === 'string' && ISO.test(v.slice(0, 10)) ? v.slice(0, 10) : null)

/**
 * `alterEnde` = bisheriges wirksames Mietende, `neuesEnde` = Ende nach der Verlängerung.
 * Konflikt: Das Material wird am Datum D gebraucht, D liegt nicht vor dem alten Ende (der Plan war bisher stimmig)
 * und liegt vor dem neuen Ende (das Material steht dann noch an der verlängerten Baustelle).
 */
export function lagerKonflikteBeiVerlaengerung(alterEnde: string, neuesEnde: string, transporte: OffenerTransport[]): LagerWarnung {
  const konflikte: LagerKonflikt[] = []
  let undatiert = 0
  for (const t of transporte) {
    const d = tag(t.planned_date) ?? tag(t.ziel_beginn)
    if (!d) { undatiert++; continue }
    if (d >= alterEnde && d < neuesEnde) {
      konflikte.push({ transportId: t.id, zielName: t.ziel_name || 'andere Baustelle', artikel: t.artikel_name || 'Material', menge: t.quantity, datum: d })
    }
  }
  konflikte.sort((a, b) => a.datum.localeCompare(b.datum))
  return { konflikte, undatiert }
}
