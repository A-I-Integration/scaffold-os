// ============================================================
// SCAFFOLD OS – Seitensperren nach Rolle (von proxy.ts verwendet, vom Test gegen das Menü abgeglichen)
// ============================================================

export // Welche Rolle darf welchen Bereich sehen? Die Prüfung nimmt den ERSTEN passenden Pfad (startsWith).
const ROLE_ACCESS: Record<string, string[]> = {
  '/dashboard':    ['admin', 'disponent'],
  '/aufmass':      ['admin', 'bauleiter', 'mitarbeiter'],  // Mitarbeiter messen auf: wie im Menü und in /api/projects (AUFMASS_ROLES)
  '/stueckliste':  ['admin', 'bauleiter'],
  '/lager':        ['admin', 'disponent', 'bauleiter', 'lager'],
  '/prognose':     ['admin', 'disponent', 'lager'],
  '/mj-katalog':   ['admin', 'disponent', 'bauleiter', 'lager'],
  '/planung':      ['admin', 'disponent', 'bauleiter'],
  '/zeiterfassung': ['admin', 'disponent', 'bauleiter'],  // NEU: Monatsübersicht (Nr. 6)
  '/touren':       ['admin', 'disponent'],
  '/routenoptimierung': ['admin', 'disponent'],  // NEU: KI-Tourenplan (Nr. 7)
  '/mitarbeiter':  ['admin', 'disponent'],
  '/datenpflege':  ['admin'],
  '/meine-touren': ['admin', 'disponent', 'bauleiter', 'mitarbeiter', 'lager'],
  '/fahrer':       ['admin', 'disponent', 'bauleiter', 'mitarbeiter', 'lager'],
  // Sicherheitscheck 13.10.: bisher NUR per Menü versteckt, per Adresse für jeden Eingeloggten offen.
  // Gleiche Rollen wie im Menü (components/SidebarLayout.tsx).
  // Feldtest (internes Messwerkzeug): nur Admin. MUSS vor '/cad' stehen: die Prüfung nimmt den ersten passenden Pfad.
  '/cad/feldtest':     ['admin'],
  // CAD (inkl. /cad/bruecke, /cad/traggeruest): Admin, Disposition, Bauleiter (Entscheidung 13.10.)
  '/cad':              ['admin', 'disponent', 'bauleiter'],
  '/kunden':           ['admin', 'disponent'],
  '/arbeitsschutz':    ['admin', 'disponent'],
  '/rechnungen':       ['admin', 'disponent'],
  '/zahlungsabgleich': ['admin', 'disponent'],
  '/mietabrechnung':   ['admin', 'disponent'],
  // Bisher nur im Menü versteckt, per Adresse für jeden Eingeloggten offen (Prüfung 4): gleiche Rollen wie im Menü
  // (components/shell/nav-config.ts); der Test __tests__/pruefung/seiten-rollen.test.ts hält beides in Einklang.
  '/wochenplanung':    ['admin', 'disponent', 'bauleiter'],
  '/kolonnen':         ['admin', 'disponent', 'bauleiter'],
  '/nachunternehmer':  ['admin', 'disponent'],
  '/dokumente':        ['admin', 'disponent'],
  '/datenimport':      ['admin', 'disponent'],
  '/gaeb':             ['admin', 'disponent', 'mitarbeiter'],
  '/gestell-simulator': ['admin', 'disponent', 'lager'],
  '/einstellungen':    ['admin'],
  '/admin':            ['admin'],
  // Statiker (extern): nur die eigene Startseite. Alles andere sperrt der Statiker-Block unten.
  '/statiker':         ['statiker'],
};

