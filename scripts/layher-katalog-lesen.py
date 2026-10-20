#!/usr/bin/env python3
"""Liest die Layher-Preislisten (Allround, Schutz, Zubehör 2026/2027) aus und schreibt lib/data/layher-katalog.json.

Aufruf:  python3 scripts/layher-katalog-lesen.py <Ordner mit den 3 PDFs> [Ziel-JSON]
Voraussetzung: pdftotext (poppler). Die PDFs selbst gehören nicht ins Repo.
Gelesen werden nur Zeilen mit Art.-Nr. (NNNN.NNN) UND Listenpreis. Bereich = Abschnitt laut
Inhaltsverzeichnis (nach Seitenzahl); Bezeichnung = Produktname (+ Variante), automatisch ausgelesen.
Nicht übernommen: Kennbuchstaben hinter der Art.-Nr. und Rabatt-/Zulassungskennzeichen.
"""
import os, sys, subprocess, tempfile, re, json
import re, json
ART = re.compile(r'(?<!Art\.-Nr\. )(?<!Nr\.\xa0)(\d{4}\.\d{3})(?:\s+([A-Za-z]))?\s+(\d{1,3}(?:\.\d{3})*,\d{2})')
def num(s): return float(s.replace('.','').replace(',','.'))
TOC = {
 'layher-allround': [(8,'Software für den Gerüstbau'),(10,'Gerüstspindeln'),(12,'Vertikale Tragelemente'),(14,'Modulares Fassadengerüstsystem AGS'),(18,'Horizontale Tragelemente'),(22,'Diagonalaussteifung'),(24,'U-Gerüstböden'),(28,'O-Gerüstböden'),(30,'Stahlbohlen, Deckbleche'),(32,'Bordbretter'),(34,'Kupplungen, Zubehör, Verankerung'),(36,'Konsolen'),(38,'Passantenschutz, Dachfangschutz, Gerüstbekleidung'),(40,'Podesttreppe, Komforttreppe'),(42,'Modultreppe, Außenaufstieg, Bautreppenturm 200'),(44,'Treppenturm 500 und 750'),(46,'Systemhandlauf, Stufenabdeckung'),(48,'Allround Modultreppe'),(49,'Gitterträger'),(50,'Allround Fachwerkträger'),(52,'Allround Brückenträger'),(54,'Aluminium-Träger FlexBeam'),(59,'Allround Wandkonsole'),(60,'Aluminium-Träger TwixBeam'),(64,'Traggerüst TG 60'),(66,'Schwerlaststütze / Schwerlastturm'),(67,'Schwerlastturm XL'),(68,'Allround Modultreppenturm, Rohbau-Treppenturm'),(69,'Hohlwandkonsole'),(70,'Absturzsicherung'),(72,'Anseilschutz'),(73,'Brüstungsklammer'),(74,'Fahrbare Gerüste, Paletten, Werkzeug'),(76,'Stichwortverzeichnis')],
 'layher-schutz': [(6,'Software für den Gerüstbau'),(10,'Kederdach XL – Systembauteile'),(14,'Kederdach XL – Dachplanen'),(16,'Kederdach XL – Beispielkonfigurationen'),(18,'Kederdach XL – Kederhallen'),(22,'Fahrbare Dächer – Systembauteile'),(26,'Kassettendach – Systembauteile'),(30,'Kassettendach – Dachkassetten'),(32,'Kassettendach – Logistik'),(33,'Kassettendach – Absturzsicherung'),(34,'Kassettendach – Anseilschutz'),(38,'Allround Fachwerkträger-Dach – Systembauteile'),(42,'Protect-System – Systembauteile'),(44,'Protect-System – Zugangsschutz bei vorgestellten Treppen'),(46,'Stichwortverzeichnis')],
 'layher-zubehoer': [(8,'Gerüstspindeln, Gitterträger'),(14,'Gerüstrohre, Kupplungen'),(17,'Hilfsmittel, Werkzeug'),(18,'Verankerung, Zugangssicherung'),(20,'Hängegerüste'),(21,'Dachfangschutz'),(22,'Teile für fahrbare Gerüste'),(24,'Gerüstbekleidungen'),(27,'Leiternaufstieg, Modultreppe'),(28,'Gerüstpaletten'),(30,'Überbrückungen'),(33,'Software für den Gerüstbau'),(34,'Absturzsicherung'),(36,'Höhentransport'),(38,'Abdeckungen, Rohrverschlüsse'),(40,'Stichwortverzeichnis')],
}
FILES = {'layher-allround':'DE_Preisliste_Allround','layher-schutz':'DE_Preisliste_Schutz','layher-zubehoer':'DE_Preisliste_Zubehoer'}
def gruppe(liste,seite):
    g=''
    for s,n in TOC[liste]:
        if seite>=s: g=n
    return g
TXT = re.compile(r'[A-Za-zÄÖÜäöüß]{3}')
def parse(liste):
    pages=open(os.path.join(TXTDIR,FILES[liste]+'.txt')).read().split('\f'); out=[]
    for pi,pg in enumerate(pages):
        seite=pi+1
        lines=pg.split('\n')
        if not any(ART.search(l) for l in lines): continue
        g=gruppe(liste,seite)
        if g.startswith('Stichwort'): continue
        prod=''; variant=''
        for l in lines:
            m=ART.search(l)
            left=(l[:m.start()] if m else l)
            cols=[c.strip() for c in re.split(r'\s{2,}',left.strip()) if c.strip()]
            pos=None
            if cols and re.fullmatch(r'\d{1,3}',cols[0]) and (len(cols)>1 and TXT.search(cols[1])): pos=cols.pop(0)
            txt=cols[0] if cols and TXT.search(cols[0]) and not re.fullmatch(r'[\d,\.\s×xV]+',cols[0]) else ''
            if pos and txt: prod=txt; variant=''
            elif txt and m: variant=txt
            if not m: continue
            rest=cols[1:] if txt else cols
            ve=gew=None; mass=''
            if rest and re.fullmatch(r'\d+( V)?',rest[-1]): ve=rest.pop()
            if rest and re.fullmatch(r'\d+(?:[.,]\d+)?',rest[-1]): gew=rest.pop()
            if rest: mass=rest[-1] if ('×' in rest[-1] or re.fullmatch(r'\d+,\d+',rest[-1])) else ''
            u=prod if (pos or not prod) else prod
            var=variant if (variant[:1].isupper() and len(variant)<=45 and not variant.endswith(',')) else ''
            out.append(dict(n=m.group(1),l=liste,g=g,u=(prod+(' – '+var if var else '')) if prod else var,
                mass=mass,gew=gew,ve=ve,flag=m.group(2) or '',p=num(m.group(3)),seite=seite))
    return out

def zahl(s):
    return float(s.replace('.','').replace(',','.'))
def umwandeln(x):
    a={}
    m=x['mass']
    if m:
        t=[zahl(v) for v in re.findall(r'\d+,\d+|\d+',m)]
        if t: a['Länge (m)']=t[0]
        if len(t)>1: a['Breite (m)']=t[1]
    if x['gew']: a['Gewicht (kg)']=zahl(x['gew'])
    if x['ve']:
        v=re.match(r'\d+',x['ve'])
        if v: a['VPE (Stk.)']=int(v.group(0))
    u=x['u'].strip()
    return {'n':x['n'],'l':x['l'],'g':x['g'],'u':u[:90],'a':a,'p':x['p']}
if __name__=='__main__':
    ordner=sys.argv[1]; ziel=sys.argv[2] if len(sys.argv)>2 else 'lib/data/layher-katalog.json'
    TXTDIR=tempfile.mkdtemp()
    for k,f in FILES.items():
        subprocess.run(['pdftotext','-layout',os.path.join(ordner,f+'.pdf'),os.path.join(TXTDIR,f+'.txt')],check=True)
    out=[]; gesehen=set()
    for k in FILES:
        for x in parse(k):
            if (x['l'],x['n']) in gesehen: continue
            gesehen.add((x['l'],x['n'])); out.append(umwandeln(x))
    with open(ziel,'w',encoding='utf-8') as fh: json.dump(out,fh,ensure_ascii=False,separators=(',',':'))
    print(len(out),'Artikel ->',ziel)
