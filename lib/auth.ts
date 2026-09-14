import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// ============================================================
// SCAFFOLD OS – Zentrale Mindest-Auth-Prüfung (Phase 58)
//
// Schließt eine im Sicherheits-Review gefundene, echte Lücke: mehrere
// API-Routen (inventory, gps, drivers, disposition, prognose,
// ki-material, qr, attach-photos) hatten BISHER GAR KEINE
// Authentifizierungs-Prüfung – frei aus dem Internet aufrufbar.
//
// Bewusst als "mindestens eingeloggt" gehalten (nicht rollen-
// spezifisch) – verhindert das Risiko, durch falsch geratene
// Rollen-Einschränkungen legitime Nutzer versehentlich auszusperren.
// Rollen-spezifische Einschränkungen bleiben Aufgabe der jeweiligen
// Route, falls dort nötig.
// ============================================================

/**
 * Prüft, ob ein gültiger, eingeloggter Nutzer die Anfrage stellt.
 * Gibt bei Erfolg die User-ID zurück, sonst null (dann in der Route
 * sofort mit 401 antworten).
 */
export async function requireAuth(): Promise<{ userId: string } | null> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;
    return { userId: user.id };
  } catch {
    return null;
  }
}

/** Fertige 401-Antwort für den Fall, dass requireAuth() null liefert. */
export function unauthorizedResponse() {
  return NextResponse.json({ success: false, error: 'Nicht angemeldet.' }, { status: 401 });
}
