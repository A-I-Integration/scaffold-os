-- ============================================================
-- SCAFFOLD OS – Phase 89: IFC-Import im Hetzner-Worker (Jobtyp 'cad-import')
--
-- Im Supabase SQL Editor ausführen (einmal). Kann gefahrlos wiederholt werden:
-- legt nur einen Index an, verändert keine Daten und keine Spalten.
--
-- Warum so wenig: Die Tabelle project_media hat die Spalte "metadata" (jsonb). Der neue Schlüssel
-- "source_format" (z. B. 'ifc') steht einfach darin – dafür ist keine neue Spalte nötig.
-- ki_jobs braucht keine Änderung: "type" ist freier Text, der Fortschritt steht im Feld "payload".
--
-- Der Worker schreibt pro Import zwei Zeilen in project_media:
--   file_type 'cad/gltf'            → Gesamtmodell als glTF mit Draco-Kompression
--   file_type 'cad/ifc-eigenschaften' → Properties-JSON (Rohmodell + Elementliste + Fehlerliste)
-- beide mit metadata: { kind: 'cad-import', source_format: 'ifc', job_id, quelle_datei, schema, fehler_elemente, bucket }
-- ============================================================

create index if not exists idx_project_media_source_format
  on public.project_media ((metadata ->> 'source_format'))
  where metadata ? 'source_format';

comment on index public.idx_project_media_source_format is
  'Phase 89: schneller Zugriff auf importierte Modelle nach Quellformat (metadata.source_format, z. B. ifc)';
