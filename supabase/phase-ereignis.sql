-- Neuer Ereignis-Typ "ereignis" (z. B. Sturm) für project_events.
-- Löscht die bestehende Typ-Prüfung (egal wie sie heißt) und legt sie mit dem neuen Typ neu an.
DO $$
DECLARE c text;
BEGIN
  FOR c IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'public.project_events'::regclass AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%pruefung_freigabe%'
  LOOP
    EXECUTE format('ALTER TABLE public.project_events DROP CONSTRAINT %I', c);
  END LOOP;
END $$;

ALTER TABLE public.project_events
  ADD CONSTRAINT project_events_type_check CHECK (type IN (
    'pruefung_freigabe', 'standzeit', 'geruest_aenderung', 'demontage', 'ruecktransport', 'ereignis', 'sonstiges'
  ));
