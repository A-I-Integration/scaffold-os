-- ============================================================
-- Phase 36: Verzugszinsen + Mahnpauschale automatisch (Punkt 3
-- der Faktura-Recherche-Liste)
--
-- Zinssatz ändert sich zum 1.1. und 1.7. jeden Jahres (Basiszinssatz
-- nach § 247 BGB + 9 Prozentpunkte für B2B nach § 288 BGB) – deshalb
-- als Einstellung hinterlegt, nicht fest im Code, damit ihr sie
-- halbjährlich in ein paar Sekunden aktualisieren könnt.
--
-- Stand bei Einführung (Juli 2026): Basiszinssatz 1,52 % + 9 = 10,52 %.
-- Aktuellen Wert prüfen: bundesbank.de/de/bundesbank/basiszinssatz
--
-- Rein additiv, nullable mit sinnvollen Defaults.
-- Einmalig im Supabase Dashboard -> SQL Editor ausführen.
-- ============================================================

ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS mahnung_pauschale numeric(10,2) DEFAULT 5.00;
ALTER TABLE company_settings ADD COLUMN IF NOT EXISTS mahnung_verzugszinssatz numeric(5,2) DEFAULT 10.52;

COMMENT ON COLUMN company_settings.mahnung_pauschale IS
  'Pauschale je Mahnung in Euro (§ 288 Abs. 5 BGB, B2B – angemessene Höhe, Standard 5 €).';
COMMENT ON COLUMN company_settings.mahnung_verzugszinssatz IS
  'Verzugszinssatz % p.a. = Basiszinssatz (§ 247 BGB) + 9 Prozentpunkte (B2B, § 288 Abs. 2 BGB). Ändert sich zum 1.1./1.7. – bitte halbjährlich in den Firmeneinstellungen aktualisieren.';
