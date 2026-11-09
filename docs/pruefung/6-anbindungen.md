# Prüfung 6 – Anbindungen

| Punkt | Stand |
|---|---|
| Stripe-Checkout ohne Login | Bereits umgesetzt (öffentlich, mit Rate-Limit; Kundenportal an die eigene Login-E-Mail gebunden). |
| Stripe-Webhook, Schreibfehler | Bereits umgesetzt (Fehler → 500, Stripe wiederholt). |
| Stripe-Webhook, Lesefehler | **Behoben:** Lesefehler bei Abo, Tenant und Subdomain-Suche wurden still als "leer" gewertet (Kündigung ohne Wirkung, trotzdem "erfolgreich"). Jetzt 500, Stripe wiederholt. |
| IMAP-Historie | **Behoben:** Es wurden nur die letzten 50 Nachrichten je Ordner betrachtet, ältere nie. Jetzt werden bereits gespeicherte übersprungen und je Durchlauf bis zu 100 neue (neueste zuerst) geladen; weitere Synchronisierungen holen den Rest nach. Speicherfehler werden gemeldet. |
| Sentry | **Ergänzt:** `instrumentation.ts`, `instrumentation-client.ts`, `app/global-error.tsx`. Ohne `SENTRY_DSN` / `NEXT_PUBLIC_SENTRY_DSN` passiert nichts. Kein Tracing, keine personenbezogenen Standarddaten. |
| Google Ads | **Ergänzt:** Conversion-Ereignis nach erfolgreicher Demo-Anfrage (`/anfrage`). Braucht `NEXT_PUBLIC_GOOGLE_ADS_CONVERSION_LABEL`; Einwilligung steuert der bestehende Consent Mode. |
| Autodesk NWD → OBJ | **Nicht verifiziert.** Braucht einen echten, kontrollierten APS-Test mit Zugangsdaten und einer echten NWD-Datei. Bis dahin keine Produktzusage. |

## Noch von Hand nötig
1. In Vercel `SENTRY_DSN` und `NEXT_PUBLIC_SENTRY_DSN` setzen, danach in Sentry einen Testfehler auslösen und prüfen, dass er ankommt.
2. In Google Ads die Conversion-Aktion anlegen und das Label als `NEXT_PUBLIC_GOOGLE_ADS_CONVERSION_LABEL` eintragen; danach mit Tag Assistant prüfen.
