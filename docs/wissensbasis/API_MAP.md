# API_MAP – SCAFFOLD OS

Erzeugt am 06.11.2026 per Skript aus den versionierten Dateien app/**/route.ts.
Erkannt werden exportierte Handler (GET, POST, ...). Geprüft werden hier weder Authentifizierung noch Fachlogik.

Anzahl Routen: 127

Methoden: DELETE 23, GET 78, PATCH 12, POST 95, PUT 8

| URL | Methoden | Datei | Zeilen |
|---|---|---|---|
| /api/abbau-plan | POST | app/api/abbau-plan/route.ts | 95 |
| /api/abholung | POST | app/api/abholung/route.ts | 32 |
| /api/abrechnung-m2 | GET, POST | app/api/abrechnung-m2/route.ts | 66 |
| /api/access-token | POST | app/api/access-token/route.ts | 62 |
| /api/admin/besucher | GET | app/api/admin/besucher/route.ts | 67 |
| /api/admin/data | DELETE, GET, PATCH | app/api/admin/data/route.ts | 172 |
| /api/admin/impersonate | POST | app/api/admin/impersonate/route.ts | 115 |
| /api/admin/users | GET, POST | app/api/admin/users/route.ts | 206 |
| /api/admin/wirkung | GET | app/api/admin/wirkung/route.ts | 153 |
| /api/anfrage | POST | app/api/anfrage/route.ts | 120 |
| /api/ansicht-link | DELETE, GET, POST | app/api/ansicht-link/route.ts | 101 |
| /api/attach-photos | POST | app/api/attach-photos/route.ts | 117 |
| /api/auftrag-link | DELETE, GET, POST | app/api/auftrag-link/route.ts | 70 |
| /api/auth/demo-gate | POST | app/api/auth/demo-gate/route.ts | 137 |
| /api/auto-tour/offene | POST | app/api/auto-tour/offene/route.ts | 28 |
| /api/auto-tour | POST | app/api/auto-tour/route.ts | 36 |
| /api/bauphasen-einsatz | POST | app/api/bauphasen-einsatz/route.ts | 66 |
| /api/baustellen-ergebnis | GET | app/api/baustellen-ergebnis/route.ts | 46 |
| /api/baustellenmappe | DELETE, GET, PATCH, POST | app/api/baustellenmappe/route.ts | 168 |
| /api/cad/analyze-plan | GET, POST | app/api/cad/analyze-plan/route.ts | 101 |
| /api/cad/ifc-import | GET, POST | app/api/cad/ifc-import/route.ts | 159 |
| /api/company | GET, POST | app/api/company/route.ts | 110 |
| /api/cron/datenhygiene | GET | app/api/cron/datenhygiene/route.ts | 125 |
| /api/cron/mahnwesen | GET | app/api/cron/mahnwesen/route.ts | 81 |
| /api/cron/mietende-erinnerung | GET | app/api/cron/mietende-erinnerung/route.ts | 103 |
| /api/cron/standzeit-abrechnung | GET | app/api/cron/standzeit-abrechnung/route.ts | 144 |
| /api/dashboard/stats | GET | app/api/dashboard/stats/route.ts | 251 |
| /api/delivery-notes | GET, POST | app/api/delivery-notes/route.ts | 105 |
| /api/din-check | POST | app/api/din-check/route.ts | 178 |
| /api/disposition | POST | app/api/disposition/route.ts | 115 |
| /api/dokumente | GET, PATCH, POST | app/api/dokumente/route.ts | 157 |
| /api/drivers | GET, POST, PUT | app/api/drivers/route.ts | 72 |
| /api/email-accounts | DELETE, GET, POST | app/api/email-accounts/route.ts | 104 |
| /api/email-log/resend | POST | app/api/email-log/resend/route.ts | 98 |
| /api/email-log | GET | app/api/email-log/route.ts | 72 |
| /api/email | POST | app/api/email/route.ts | 201 |
| /api/foto-analyse | GET, POST | app/api/foto-analyse/route.ts | 207 |
| /api/freigabe-status | GET | app/api/freigabe-status/route.ts | 35 |
| /api/gaeb/export | POST | app/api/gaeb/export/route.ts | 43 |
| /api/gps | GET, POST | app/api/gps/route.ts | 65 |
| /api/grundriss-analyse | POST | app/api/grundriss-analyse/route.ts | 234 |
| /api/import/baustellen | POST | app/api/import/baustellen/route.ts | 59 |
| /api/import/kunden | POST | app/api/import/kunden/route.ts | 149 |
| /api/import/material | POST | app/api/import/material/route.ts | 179 |
| /api/import/rechnungen | POST | app/api/import/rechnungen/route.ts | 69 |
| /api/inventory/count | POST | app/api/inventory/count/route.ts | 65 |
| /api/inventory/reorder | POST | app/api/inventory/reorder/route.ts | 59 |
| /api/inventory/reserve | POST | app/api/inventory/reserve/route.ts | 42 |
| /api/inventory/return-status | GET | app/api/inventory/return-status/route.ts | 45 |
| /api/inventory/return | POST | app/api/inventory/return/route.ts | 151 |
| /api/inventory | DELETE, GET, POST, PUT | app/api/inventory/route.ts | 129 |
| /api/invoice-payments | DELETE, GET, POST | app/api/invoice-payments/route.ts | 152 |
| /api/invoices/anhang | DELETE, GET, PATCH, POST | app/api/invoices/anhang/route.ts | 133 |
| /api/invoices/pruef-link | DELETE, GET, POST | app/api/invoices/pruef-link/route.ts | 87 |
| /api/invoices | DELETE, GET, PATCH, POST | app/api/invoices/route.ts | 417 |
| /api/invoices/zugferd | POST | app/api/invoices/zugferd/route.ts | 136 |
| /api/ki-jobs | GET, POST | app/api/ki-jobs/route.ts | 113 |
| /api/ki-material | POST | app/api/ki-material/route.ts | 86 |
| /api/kolonnen | DELETE, GET, POST, PUT | app/api/kolonnen/route.ts | 140 |
| /api/kunden-kontakte | DELETE, GET, POST | app/api/kunden-kontakte/route.ts | 98 |
| /api/kunden/[id]/emails | GET | app/api/kunden/[id]/emails/route.ts | 114 |
| /api/kunden/[id]/mail | POST | app/api/kunden/[id]/mail/route.ts | 150 |
| /api/kunden/import | POST | app/api/kunden/import/route.ts | 81 |
| /api/kunden/merge | POST | app/api/kunden/merge/route.ts | 118 |
| /api/kunden | DELETE, GET, PATCH, POST | app/api/kunden/route.ts | 215 |
| /api/lead/termin | GET, POST | app/api/lead/termin/route.ts | 237 |
| /api/leistungskatalog | DELETE, GET, PATCH, POST | app/api/leistungskatalog/route.ts | 97 |
| /api/lidar-upload | POST | app/api/lidar-upload/route.ts | 520 |
| /api/lohnabrechnungen | DELETE, GET, POST | app/api/lohnabrechnungen/route.ts | 150 |
| /api/lohnabrechnungen/send | POST | app/api/lohnabrechnungen/send/route.ts | 83 |
| /api/lohnabrechnungen/signed-url | GET | app/api/lohnabrechnungen/signed-url/route.ts | 52 |
| /api/mahnung | POST | app/api/mahnung/route.ts | 38 |
| /api/me | GET | app/api/me/route.ts | 42 |
| /api/miete/ende | GET | app/api/miete/ende/route.ts | 68 |
| /api/miete/lagerwarnung | GET | app/api/miete/lagerwarnung/route.ts | 58 |
| /api/miete/verlaengern | POST | app/api/miete/verlaengern/route.ts | 82 |
| /api/nachunternehmer-eintraege | DELETE, GET, PATCH, POST | app/api/nachunternehmer-eintraege/route.ts | 251 |
| /api/nachunternehmer | GET, PATCH, POST | app/api/nachunternehmer/route.ts | 192 |
| /api/nwd/[id] | DELETE, GET, POST | app/api/nwd/[id]/route.ts | 90 |
| /api/nwd | POST | app/api/nwd/route.ts | 47 |
| /api/nwd/webhook | POST | app/api/nwd/webhook/route.ts | 37 |
| /api/onboarding/demo | POST | app/api/onboarding/demo/route.ts | 212 |
| /api/prognose | GET, POST | app/api/prognose/route.ts | 199 |
| /api/project-assignments | DELETE, GET, POST | app/api/project-assignments/route.ts | 111 |
| /api/project-events | GET, PATCH, POST | app/api/project-events/route.ts | 153 |
| /api/project-media | GET, POST | app/api/project-media/route.ts | 106 |
| /api/project-versions | GET, POST | app/api/project-versions/route.ts | 100 |
| /api/projects/[id]/stunden | GET | app/api/projects/[id]/stunden/route.ts | 23 |
| /api/projects | DELETE, GET, PATCH, POST | app/api/projects/route.ts | 328 |
| /api/projects/unassigned | GET | app/api/projects/unassigned/route.ts | 56 |
| /api/projekt-lv | DELETE, GET, PATCH, POST | app/api/projekt-lv/route.ts | 87 |
| /api/provision | DELETE, GET, POST | app/api/provision/route.ts | 204 |
| /api/public/angebot | GET, POST | app/api/public/angebot/route.ts | 142 |
| /api/public/ansicht | GET | app/api/public/ansicht/route.ts | 53 |
| /api/public/auftrag/anhang | GET | app/api/public/auftrag/anhang/route.ts | 34 |
| /api/public/auftrag/rechnung | GET | app/api/public/auftrag/rechnung/route.ts | 31 |
| /api/public/auftrag | GET | app/api/public/auftrag/route.ts | 64 |
| /api/public/baustelle/datei | GET | app/api/public/baustelle/datei/route.ts | 30 |
| /api/public/baustelle | GET | app/api/public/baustelle/route.ts | 39 |
| /api/public/rechnung-pruefung/anhang | GET | app/api/public/rechnung-pruefung/anhang/route.ts | 32 |
| /api/public/rechnung-pruefung | GET, POST | app/api/public/rechnung-pruefung/route.ts | 86 |
| /api/qr | GET | app/api/qr/route.ts | 38 |
| /api/routen-ki | POST | app/api/routen-ki/route.ts | 234 |
| /api/sprachnotiz | POST | app/api/sprachnotiz/route.ts | 84 |
| /api/statiker-zuordnung | DELETE, GET, POST | app/api/statiker-zuordnung/route.ts | 120 |
| /api/statiker/lager | GET | app/api/statiker/lager/route.ts | 27 |
| /api/statiker/projekte/[id] | GET | app/api/statiker/projekte/[id]/route.ts | 55 |
| /api/statiker/projekte | GET | app/api/statiker/projekte/route.ts | 37 |
| /api/stripe/checkout | POST | app/api/stripe/checkout/route.ts | 108 |
| /api/stripe/portal | POST | app/api/stripe/portal/route.ts | 55 |
| /api/stripe/webhook | POST | app/api/stripe/webhook/route.ts | 329 |
| /api/stueckliste | POST | app/api/stueckliste/route.ts | 38 |
| /api/team-vorschlag | POST | app/api/team-vorschlag/route.ts | 26 |
| /api/time-entries | GET, POST, PUT | app/api/time-entries/route.ts | 167 |
| /api/tour-stops/nicht-fertig | POST | app/api/tour-stops/nicht-fertig/route.ts | 118 |
| /api/tour-stops | GET, PUT | app/api/tour-stops/route.ts | 94 |
| /api/tours/hof | POST | app/api/tours/hof/route.ts | 113 |
| /api/tours | GET, POST, PUT | app/api/tours/route.ts | 230 |
| /api/track/besuch | POST | app/api/track/besuch/route.ts | 71 |
| /api/track/status | GET | app/api/track/status/route.ts | 69 |
| /api/transport-orders | GET, POST | app/api/transport-orders/route.ts | 78 |
| /api/umdisposition | POST | app/api/umdisposition/route.ts | 39 |
| /api/umfrage | POST | app/api/umfrage/route.ts | 110 |
| /api/vehicles | GET, POST, PUT | app/api/vehicles/route.ts | 53 |
| /api/wochenplanung/ki-vorschlag | POST | app/api/wochenplanung/ki-vorschlag/route.ts | 119 |
| /api/wochenplanung | DELETE, GET, POST | app/api/wochenplanung/route.ts | 277 |
| /api/zeiterfassung | GET, POST, PUT | app/api/zeiterfassung/route.ts | 258 |
