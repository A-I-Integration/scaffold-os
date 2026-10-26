// Freigabe-Status einer Baustelle – abgeleitet aus den Projekt-Ereignissen.
// Reine Anzeige/Warnung, sperrt nichts (der Aufbau muss vor der Freigabe möglich sein).

export type FreigabeStufe = 'keine_pruefung' | 'freigegeben' | 'nicht_freigegeben' | 'maengel_offen' | 'pruefung_faellig';

export interface FreigabeEreignis {
  type: string;
  created_at: string;
  pruefung_details?: {
    freigegeben?: boolean;
    maengel_festgestellt?: boolean;
    maengel_behoben?: boolean;
    naechste_pruefung?: string | null;
  } | null;
}

export interface FreigabeStatus {
  stufe: FreigabeStufe;
  label: string;
  grund: string;
  warnung: boolean;
}

export const FREIGABE_LABEL: Record<FreigabeStufe, string> = {
  keine_pruefung: 'Keine Prüfung',
  freigegeben: 'Freigegeben',
  nicht_freigegeben: 'Nicht freigegeben',
  maengel_offen: 'Mängel offen',
  pruefung_faellig: 'Prüfung fällig',
};

function tag(d: string): string {
  return d.slice(0, 10);
}

export function berechneFreigabeStatus(ereignisse: FreigabeEreignis[], heute: Date = new Date()): FreigabeStatus {
  const sortiert = [...ereignisse].sort((a, b) => b.created_at.localeCompare(a.created_at));
  const letztePruefung = sortiert.find(e => e.type === 'pruefung_freigabe');
  const mk = (stufe: FreigabeStufe, grund: string): FreigabeStatus => ({
    stufe, label: FREIGABE_LABEL[stufe], grund, warnung: stufe !== 'freigegeben',
  });

  if (!letztePruefung) return mk('keine_pruefung', 'Noch keine Prüfung dokumentiert.');
  const d = letztePruefung.pruefung_details || {};

  if (d.maengel_festgestellt && !d.maengel_behoben) return mk('maengel_offen', 'Bei der letzten Prüfung wurden Mängel festgestellt, noch nicht behoben.');
  if (d.freigegeben !== true) return mk('nicht_freigegeben', 'Letzte Prüfung ohne Freigabe.');

  const spaeterEreignis = sortiert.find(e => e.type === 'ereignis' && e.created_at > letztePruefung.created_at);
  if (spaeterEreignis) return mk('pruefung_faellig', `Außergewöhnliches Ereignis am ${tag(spaeterEreignis.created_at)} – erneute Prüfung nötig.`);

  const heuteTag = heute.toISOString().slice(0, 10);
  if (d.naechste_pruefung && d.naechste_pruefung < heuteTag) return mk('pruefung_faellig', `Nächste Prüfung war fällig am ${d.naechste_pruefung}.`);

  return { stufe: 'freigegeben', label: FREIGABE_LABEL.freigegeben, grund: `Freigabe vom ${tag(letztePruefung.created_at)}.`, warnung: false };
}
