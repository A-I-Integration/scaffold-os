-- Faktura F5: Versandformat XRechnung im Versandprotokoll zulassen
-- Erweitert nur die erlaubten Werte der Spalte format (zugferd, pdf, xrechnung). Bestehende Zeilen bleiben unverändert.
ALTER TABLE invoice_dispatches DROP CONSTRAINT IF EXISTS invoice_dispatches_format_check;
ALTER TABLE invoice_dispatches ADD CONSTRAINT invoice_dispatches_format_check CHECK (format IN ('zugferd', 'pdf', 'xrechnung'));

-- Kontrolle: muss die drei Werte zeigen
SELECT pg_get_constraintdef(oid) AS regel FROM pg_constraint WHERE conname = 'invoice_dispatches_format_check';
