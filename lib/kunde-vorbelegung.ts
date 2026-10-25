// ============================================================
// SCAFFOLD OS – Aufmaß Schritt 1: Ansprechpartner aus dem Kundenstamm vorbelegen
//
// Gewählter Kunde → Ansprechpartner (Name, Telefon, E-Mail) aus der Kundenakte.
// Nur LEERE Felder werden gefüllt, bereits Eingetragenes wird nie überschrieben.
// Die Adresse gehört NICHT dazu: die Stammadresse ist nicht die Baustelle.
// ============================================================
export interface KundeKontakt {
  contact_person?: string | null
  phone?: string | null
  email?: string | null
}

export interface AnsprechpartnerFelder {
  ansprechpartnerName: string
  ansprechpartnerTelefon: string
  ansprechpartnerEmail: string
}

const t = (s: unknown): string => (typeof s === 'string' ? s.trim() : '')

export function ansprechpartnerAusKunde<T extends AnsprechpartnerFelder>(form: T, kunde: KundeKontakt): T {
  return {
    ...form,
    ansprechpartnerName: form.ansprechpartnerName.trim() ? form.ansprechpartnerName : t(kunde.contact_person),
    ansprechpartnerTelefon: form.ansprechpartnerTelefon.trim() ? form.ansprechpartnerTelefon : t(kunde.phone),
    ansprechpartnerEmail: form.ansprechpartnerEmail.trim() ? form.ansprechpartnerEmail : t(kunde.email),
  }
}
