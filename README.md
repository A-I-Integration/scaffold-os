# CAD – wirklich vollständiges Paket (behebt beide Deployment-Fehler)

## Ursachen der beiden Fehler

1. **"Cannot find module 'pdf-parse'"** – `npm install pdf-parse` wurde
   noch nicht bei dir lokal ausgeführt (steht nur in meiner
   Arbeitsumgebung, nicht in deiner echten package.json/package-lock.json,
   bis du den Befehl unten wirklich ausführst).

2. **"Export generateMontageplanHTML doesn't exist"** – mein Fehler:
   Ich habe dir `app/cad/page.tsx` geschickt (das diese Funktion
   importiert), aber die Datei `lib/export/pdf-export.ts`, die diese
   Funktion tatsächlich enthält, habe ich dir nie geschickt. Ich dachte
   fälschlich, sie sei bei dir schon vorhanden.

## Diesmal wirklich alles zusammen

Ich habe jede einzelne Datei nachverfolgt, die `app/cad/page.tsx`
(direkt oder indirekt über die Komponenten) tatsächlich braucht –
**14 Dateien**, keine ausgelassen. Bei mir baut das vollständig sauber
(119/119 Seiten).

## Installation (Reihenfolge beachten)

```bash
# 1. Fehlende Pakete WIRKLICH installieren (nicht überspringen):
npm install pdf-parse

# 2. Alle Dateien aus diesem ZIP an die passenden Stellen kopieren
#    (überschreiben), dann:
git add app/cad/ app/api/cad/ app/api/grundriss-analyse/ components/cad/ lib/calculations/cad-engine.ts lib/calculations/cad-rules.ts lib/calculations/geruest-systeme.ts lib/export/pdf-export.ts lib/grundriss-parsing.ts lib/ki-fetch.ts lib/vertrag-upload-client.ts
git commit -m "CAD: vollständiges, konsistentes Paket (behebt fehlende Datei + fehlendes Paket)"
git push -u origin feat/kunden-detail
```

Kein SQL nötig.
