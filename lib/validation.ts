import { NextResponse } from 'next/server';
import { z } from 'zod';

// ============================================================
// SCAFFOLD OS – Zentrale Input-Validierung mit Zod (Phase 60)
//
// Schließt eine im Sicherheits-Review gefundene Lücke: Anfrage-Daten
// wurden bisher überall direkt aus req.json() destrukturiert und
// ungeprüft weiterverwendet – falsche Datentypen konnten fehlerhafte
// Datensätze erzeugen oder unerwartete Fehler auslösen.
//
// Bewusst zuerst für die Routen mit dem größten Risiko (Geld,
// Mitarbeiter-Zuordnung, Datenbank-Struktur) – nicht alle ~90 Routen
// auf einmal, um das Risiko neuer Fehler durch zu viele gleichzeitige
// Änderungen klein zu halten.
// ============================================================

export const uuid = z.string().uuid({ message: 'Ungültige ID.' });
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, { message: 'Datum muss im Format JJJJ-MM-TT sein.' });

/** Prüft `body` gegen `schema`. Gibt bei Erfolg die geprüften, sauber
 * typisierten Daten zurück – bei einem Fehler eine fertige 400-Antwort
 * mit einer für den Nutzer verständlichen Fehlermeldung. */
export function validiere<T extends z.ZodTypeAny>(
  schema: T,
  body: unknown
): { ok: true; data: z.infer<T> } | { ok: false; response: NextResponse } {
  const result = schema.safeParse(body);
  if (result.success) return { ok: true, data: result.data };
  const erste = result.error.issues[0];
  const feld = erste.path.length > 0 ? `${erste.path.join('.')}: ` : '';
  return {
    ok: false,
    response: NextResponse.json({ success: false, error: `${feld}${erste.message}` }, { status: 400 }),
  };
}

// ─── Kolonnen ───
export const kolonneAnlegenSchema = z.object({
  name: z.string().trim().min(1, 'Name erforderlich').max(200),
  bauleiter_id: uuid.nullable().optional(),
});

export const kolonneMitgliedSchema = z.object({
  employee_id: uuid,
  kolonne_id: uuid.nullable().optional(),
});

// ─── Wochenplanung ───
export const wochenplanungEinsatzSchema = z.object({
  employee_id: uuid,
  einsatz_datum: isoDate,
  project_id: uuid.nullable().optional(),
  notiz: z.string().max(2000).nullable().optional(),
});

// ─── Rechnungen ───
export const rechnungErstellenSchema = z.object({
  customer_id: uuid,
  project_id: uuid.nullable().optional(),
  gross_amount: z.number().positive('Betrag muss größer als 0 sein.'),
  positions: z.array(z.object({
    beschreibung: z.string().min(1),
    menge: z.number().positive(),
    einzelpreis: z.number(),
  })).optional(),
}).passthrough(); // erlaubt zusätzliche, bestehende Felder ohne sie einzeln aufzuzählen

// ─── Kunden ───
export const kundeAnlegenSchema = z.object({
  name: z.string().trim().min(1, 'Name erforderlich').max(300),
  email: z.string().email('Ungültige E-Mail-Adresse.').nullable().optional().or(z.literal('')),
  phone: z.string().max(50).nullable().optional(),
  street: z.string().max(200).nullable().optional(),
  zip: z.string().max(20).nullable().optional(),
  city: z.string().max(200).nullable().optional(),
  notes: z.string().max(5000).nullable().optional(),
});

// ─── Inventar-Reservierung/Transport ───
export const materialZuordnungSchema = z.object({
  inventory_id: uuid,
  project_id: uuid.optional(),
  to_project_id: uuid.optional(),
  from_project_id: uuid.nullable().optional(),
  quantity: z.number().positive('Menge muss größer als 0 sein.'),
  notes: z.string().max(2000).nullable().optional(),
});

// ─── Nachunternehmer (Phase 61, Sicherheits-Review) ───
// IDs, die in PostgREST-Filter-URLs interpoliert werden, MÜSSEN als
// UUID validiert sein: Sonst kann ein Wert wie "abc&or=(...)" die
// Query-Struktur verändern. Bisher verhinderte nur der uuid-Spalten-
// typ der DB Schäden – darauf verlassen wir uns nicht länger.
export const nachunternehmerEintragPostSchema = z.object({
  subcontractor_id: uuid,
  project_id: uuid.nullable().optional(),
  project_name: z.string().trim().max(500).nullable().optional(),
  datum: isoDate,
  art: z.enum(['montage_m2', 'demontage_m2', 'regie_stunden', 'anfahrt']),
  // Bewusst unkritisch: Deutsche Dezimalkomma-Strings werden weiterhin
  // serverseitig mit zuZahl() geparst (Client-Vertrag ändert sich nicht).
  menge: z.unknown(),
  einheitspreis: z.unknown(),
  stundenzettel: z.boolean().optional(),
  bemerkung: z.string().max(2000).nullable().optional(),
});

export const nachunternehmerStatusPatchSchema = z.union([
  z.object({ ids: z.array(uuid).min(1).max(500), status: z.enum(['offen', 'abgerechnet']) }),
  z.object({ subcontractor_id: uuid, monat: z.string().regex(/^\d{4}-\d{2}$/), status: z.enum(['offen', 'abgerechnet']) }),
]);

export const nachunternehmerEintragDeleteSchema = z.object({ id: uuid });
