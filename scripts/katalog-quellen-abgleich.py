#!/usr/bin/env python3
"""Ordnet jedem Katalogartikel (lib/data/mj-katalog.json, layher-katalog.json) die PDF-Seite(n) der Original-Preisliste zu.

Aufruf:  python3 scripts/katalog-quellen-abgleich.py <Ordner mit den PDFs> [Ziel-JSON]
Voraussetzung: pdftotext, pdfinfo (poppler).

Methode (nichts wird geschätzt): Je Artikel wird in der zugeordneten PDF jede Seite gesucht, auf der die
Artikelnummer UND der Listenpreis in derselben Zeile stehen. Ergebnis je Artikel:
  seiten  = alle Fundseiten (1-basiert)      status = eindeutig | mehrere | nicht_gefunden
  suffix  = Kennbuchstabe direkt hinter der Layher-Artikelnummer, falls die Zeile einen hat (sonst leer)
Je Liste wird die Datei mit Prüfsumme (SHA-256) und Seitenzahl festgehalten.
Die PDFs selbst gehören nicht ins Repo.
"""
import os, sys, re, json, glob, hashlib, subprocess, tempfile

DATEIEN = {
 'optima': 'MJ-Geruest-Preisliste-OPTIMA-V2.4-1', 'optima-top': 'MJ-Geruest-Preisliste-OPTIMA-TOP-V2.3',
 'optima-metric': 'MJ-Geruest-Preisliste-OPTIMA-metric-V2.3', 'uni-connect': 'MJ-Geruest-Preisliste-UNI-CONNECT-V3.3-1',
 'combi': 'MJ-Geruest-Preisliste-COMBI-V3.4-DE-2', 'combi-metric-top': 'MJ-Geruest-Preisliste-COMBI-metric-top-V2.2-DE-1',
 'uni': 'MJ-Geruest-Preisliste-UNI-V3.2-DE', 'uni-top': 'MJ-Geruest-Preisliste-UNI-TOP-V3.3-DE',
 'wand-dach': 'MJ-Geruest-Preisliste-Wand-und-Dach_V1.2-DE', 'paletten': 'MJ-Geruest-Preisliste-Paletten-und-Lagertechnik-V1.2',
 'zubehoer': 'MJ-Geruest-Preisliste-ZUBEHOER_V3.3-DE-3', 'zipko': 'MJ-Geruest-Preisliste-ZUBEHOER_ZIPKO_V1.1-DE',
 'opti-rack': 'MJ-Geruest-Flyer-SF-OPTI-RACK-Pakete-DE-10_2025',
 'sx-framescaff': 'FRAMESCAFF_PL_komplett_2024_v44_2_scr_kl', 'sx-super': 'SUPER_PL_Komplett_2024_v59_2_scr_kl',
 'sx-ringscaff': 'RINGSCAFF_PL_komplett_2024_v060_1_scr_kl', 'sx-ringscaff-trt': 'RINGSCAFF-TRT_PL_komplett_2024_v11_2_scr_kl',
 'sx-super-rs': 'SUPER-RS_komplett_2024_v22_2_scr_kl', 'sx-wbs': 'WBS_PL_komplett_2024_v38_2_scr_kl',
 'sx-zubehoer': 'Zubeh_r_PL_Komplett_2024_v44_2_scr_kl', 'sx-plex': 'DE_PLEX_Price_List_20260717',
 'sx-miete': 'DE_Rental_Price_List_08-2026',
 'layher-allround': 'DE_Preisliste_Allround', 'layher-schutz': 'DE_Preisliste_Schutz', 'layher-zubehoer': 'DE_Preisliste_Zubehoer',
}

def finde(ordner, name):
    treffer = sorted(glob.glob(os.path.join(ordner, '*' + name + '.pdf')) + glob.glob(os.path.join(ordner, name + '.pdf')))
    if not treffer: return None
    hashes = {hashlib.sha256(open(t, 'rb').read()).hexdigest() for t in treffer}
    if len(hashes) > 1: raise SystemExit('Mehrere unterschiedliche Dateien für ' + name)
    return treffer[0]

def preis_texte(p):
    # 17.8 -> "17,80", 1234.5 -> "1.234,50" und "1234,50"
    s = f'{p:.2f}'; ganz, cent = s.split('.')
    mit = f'{int(ganz):,}'.replace(',', '.') + ',' + cent
    return {mit, ganz + ',' + cent}

def main():
    ordner = sys.argv[1]; ziel = sys.argv[2] if len(sys.argv) > 2 else 'lib/data/katalog-quellen.json'
    artikel = json.load(open('lib/data/mj-katalog.json')) + json.load(open('lib/data/layher-katalog.json'))
    seiten_text, dokumente = {}, {}
    for liste, name in DATEIEN.items():
        pfad = finde(ordner, name)
        if not pfad: print('FEHLT:', liste, name); continue
        txt = subprocess.run(['pdftotext', '-layout', pfad, '-'], capture_output=True, text=True, check=True).stdout
        seiten_text[liste] = txt.split('\f')
        dokumente[liste] = {'datei': name + '.pdf', 'sha256': hashlib.sha256(open(pfad, 'rb').read()).hexdigest(), 'seiten': len(seiten_text[liste]) - (1 if txt.endswith('\f') else 0)}
    erg, stat = {}, {'eindeutig': 0, 'mehrere': 0, 'nicht_gefunden': 0, 'ohne_pdf': 0}
    for a in artikel:
        liste, nr, p = a['l'], a['n'], a['p']
        if liste not in seiten_text: stat['ohne_pdf'] += 1; continue
        preise = preis_texte(p) if p else set()
        tok = re.compile(r'(?<![0-9A-Za-z.])' + re.escape(nr) + r'(?:\s+([A-Za-z]))?(?![0-9A-Za-z])')
        seiten, suffixe = [], set()
        for i, seite in enumerate(seiten_text[liste], 1):
            for zeile in seite.split('\n'):
                m = tok.search(zeile)
                if m and (not preise or any(pt in zeile for pt in preise)):
                    if i not in seiten: seiten.append(i)
                    if m.group(1) and liste.startswith('layher'): suffixe.add(m.group(1))
        status = 'nicht_gefunden' if not seiten else ('eindeutig' if len(seiten) == 1 else 'mehrere')
        stat[status] += 1
        erg[liste + '|' + nr] = {'s': seiten, 'z': status[0], **({'x': sorted(suffixe)[0]} if len(suffixe) == 1 else {})}
    json.dump({'dokumente': dokumente, 'artikel': erg}, open(ziel, 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
    print(json.dumps(stat), '->', ziel)

main()
