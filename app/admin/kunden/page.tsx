'use client';

import { useEffect, useState } from 'react';
import { HardHat, Plus, RefreshCw, Trash2, ExternalLink, Loader2, AlertTriangle, CheckCircle2 } from 'lucide-react';

// ============================================================
// SCAFFOLD OS – Kunden-Setup-Paket: Admin-Seite
// URL: https://scaffoldos.de/admin/kunden (nur Rolle admin)
//
// Neuen Kunden anlegen → die Provisionierung läuft automatisch:
// Supabase-Projekt (Frankfurt) → Schema → Admin-Login →
// Vercel-Deployment → Subdomain → Willkommens-Mail.
//
// Bei Fehler/Timeout: „Fortsetzen" macht an der Stelle weiter.
// „Entfernen" löscht Supabase- UND Vercel-Projekt des Kunden.
// ============================================================

interface Tenant {
  id: string;
  slug: string;
  company_name: string;
  admin_email: string;
  status: 'provisioning' | 'active' | 'error' | 'cancelled' | 'past_due' | 'gesperrt';
  provision_step: string | null;
  error_message: string | null;
  subdomain: string | null;
  created_at: string;
}

const STATUS_LABEL: Record<string, { text: string; cls: string }> = {
  provisioning: { text: 'Wird eingerichtet…', cls: 'bg-blue-500/20 text-blue-300' },
  active:       { text: 'Aktiv',              cls: 'bg-emerald-500/20 text-emerald-300' },
  error:        { text: 'Fehler',             cls: 'bg-red-500/20 text-red-300' },
  cancelled:    { text: 'Gekündigt',          cls: 'bg-slate-500/20 text-slate-400' },
  past_due:     { text: 'Zahlungsverzug',     cls: 'bg-amber-500/20 text-amber-300' },
  gesperrt:     { text: 'Gesperrt (pausiert)', cls: 'bg-red-500/20 text-red-300' },
};

export default function KundenAdminPage() {
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const [companyName, setCompanyName] = useState('');
  const [slug, setSlug] = useState('');
  const [adminEmail, setAdminEmail] = useState('');
  const [adminName, setAdminName] = useState('');

  async function load() {
    try {
      const res = await fetch('/api/provision');
      const json = await res.json();
      if (json.success) setTenants(json.tenants);
    } finally {
      setLoading(false);
    }
  }

  // Polling, solange mindestens ein Kunde in Einrichtung ist
  useEffect(() => {
    load();
    const t = setInterval(() => {
      setTenants((cur) => {
        if (cur.some((x) => x.status === 'provisioning')) load();
        return cur;
      });
    }, 5000);
    return () => clearInterval(t);
  }, []);

  async function createTenant(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch('/api/provision', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          company_name: companyName,
          slug: slug.toLowerCase().trim(),
          admin_email: adminEmail,
          admin_name: adminName || undefined,
        }),
      });
      const json = await res.json();
      if (json.success) {
        setMsg({ ok: true, text: `${json.tenant.company_name} ist eingerichtet: https://${json.tenant.subdomain}` });
        setCompanyName(''); setSlug(''); setAdminEmail(''); setAdminName('');
      } else {
        setMsg({ ok: false, text: json.error || 'Fehler bei der Einrichtung.' });
      }
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function resume(id: string) {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch('/api/provision', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, resume: true }),
      });
      const json = await res.json();
      setMsg(json.success
        ? { ok: true, text: 'Einrichtung abgeschlossen.' }
        : { ok: false, text: json.error || 'Weiterhin ein Fehler – Details in der Registry (provision_log).' });
      await load();
    } finally {
      setBusy(false);
    }
  }

  // Als Kunde einloggen (Impersonation): öffnet einmaligen Magic-Link
  async function impersonate(t: Tenant) {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch('/api/admin/impersonate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tenant_id: t.id }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
      window.open(json.login_url, '_blank', 'noopener');
      setMsg({ ok: true, text: `Login-Link für ${t.company_name} geöffnet (neuer Tab). Der Zugriff wurde protokolliert.` });
    } catch (e: any) {
      setMsg({ ok: false, text: e.message });
    } finally {
      setBusy(false);
    }
  }

  async function remove(t: Tenant) {
    if (!confirm(`Wirklich deprovisionieren?\n\n${t.company_name} (${t.subdomain || t.slug})\n\nDas Supabase-Projekt UND das Vercel-Deployment des Kunden werden unwiderruflich gelöscht.`)) return;
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch('/api/provision', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: t.id }),
      });
      const json = await res.json();
      setMsg(json.success
        ? { ok: true, text: `${t.company_name} wurde deprovisioniert.` }
        : { ok: false, text: json.error || 'Fehler beim Deprovisionieren.' });
      await load();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 p-6">
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center gap-3 mb-8">
          <HardHat className="w-8 h-8 text-amber-400" />
          <div>
            <h1 className="text-2xl font-bold text-white">Kunden-Setup</h1>
            <p className="text-sm text-slate-400">Neue Kunden-Installationen automatisiert anlegen</p>
          </div>
        </div>

        {msg && (
          <div className={`mb-6 p-4 rounded-lg border flex items-start gap-3 ${msg.ok ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300' : 'bg-red-500/10 border-red-500/30 text-red-300'}`}>
            {msg.ok ? <CheckCircle2 className="w-5 h-5 shrink-0 mt-0.5" /> : <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />}
            <span className="text-sm">{msg.text}</span>
          </div>
        )}

        {/* ─── Neuer Kunde ─── */}
        <form onSubmit={createTenant} className="bg-[#1e293b] rounded-2xl border border-[#334155] p-6 mb-8">
          <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
            <Plus className="w-5 h-5 text-amber-400" /> Neuen Kunden anlegen
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-slate-400 mb-1">Firmenname *</label>
              <input value={companyName} onChange={(e) => setCompanyName(e.target.value)} required
                placeholder="Muster Gerüstbau GmbH"
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white placeholder-slate-500 focus:outline-none focus:border-amber-500" />
            </div>
            <div>
              <label className="block text-sm text-slate-400 mb-1">Subdomain * (kunde.scaffoldos.de)</label>
              <div className="flex items-center gap-2">
                <input value={slug} onChange={(e) => setSlug(e.target.value)} required
                  placeholder="muster-bau" pattern="[a-z0-9][a-z0-9-]{1,30}[a-z0-9]"
                  className="flex-1 bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white placeholder-slate-500 focus:outline-none focus:border-amber-500" />
                <span className="text-slate-500 text-sm whitespace-nowrap">.scaffoldos.de</span>
              </div>
            </div>
            <div>
              <label className="block text-sm text-slate-400 mb-1">Admin-E-Mail des Kunden *</label>
              <input type="email" value={adminEmail} onChange={(e) => setAdminEmail(e.target.value)} required
                placeholder="chef@muster-bau.de"
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white placeholder-slate-500 focus:outline-none focus:border-amber-500" />
            </div>
            <div>
              <label className="block text-sm text-slate-400 mb-1">Name des Admins (optional)</label>
              <input value={adminName} onChange={(e) => setAdminName(e.target.value)}
                placeholder="Max Muster"
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white placeholder-slate-500 focus:outline-none focus:border-amber-500" />
            </div>
          </div>
          <button type="submit" disabled={busy}
            className="mt-5 bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-slate-900 font-semibold px-6 py-2.5 rounded-lg transition-colors flex items-center gap-2">
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            Kunden einrichten (dauert ca. 2–4 Minuten)
          </button>
        </form>

        {/* ─── Kundenliste ─── */}
        <div className="bg-[#1e293b] rounded-2xl border border-[#334155] p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-white">Kunden</h2>
            <button onClick={load} className="text-slate-400 hover:text-white transition-colors" title="Aktualisieren">
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>

          {loading ? (
            <p className="text-slate-400 text-sm">Lade…</p>
          ) : tenants.length === 0 ? (
            <p className="text-slate-400 text-sm">Noch keine Kunden angelegt.</p>
          ) : (
            <div className="space-y-3">
              {tenants.map((t) => (
                <div key={t.id} className="flex flex-col md:flex-row md:items-center gap-3 bg-slate-900/60 border border-slate-700 rounded-xl p-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-white">{t.company_name}</span>
                      <span className={`text-xs px-2 py-0.5 rounded-full ${STATUS_LABEL[t.status]?.cls || ''}`}>
                        {STATUS_LABEL[t.status]?.text || t.status}
                      </span>
                    </div>
                    <div className="text-sm text-slate-400 mt-1 flex items-center gap-2 flex-wrap">
                      {t.subdomain && (
                        <a href={`https://${t.subdomain}`} target="_blank" rel="noreferrer"
                          className="text-amber-400 hover:text-amber-300 flex items-center gap-1">
                          {t.subdomain} <ExternalLink className="w-3 h-3" />
                        </a>
                      )}
                      <span>· {t.admin_email}</span>
                      <span>· {new Date(t.created_at).toLocaleDateString('de-DE')}</span>
                    </div>
                    {t.status === 'error' && t.error_message && (
                      <p className="text-xs text-red-400 mt-2">{t.error_message}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {(t.status === 'active' || t.status === 'past_due') && (
                      <button onClick={() => impersonate(t)} disabled={busy}
                        className="text-sm bg-purple-500/20 hover:bg-purple-500/30 text-purple-300 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50 flex items-center gap-1">
                        <ExternalLink className="w-3.5 h-3.5" /> Als Kunde einloggen
                      </button>
                    )}
                    {t.status === 'error' && (
                      <button onClick={() => resume(t.id)} disabled={busy}
                        className="text-sm bg-blue-500/20 hover:bg-blue-500/30 text-blue-300 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50">
                        Fortsetzen
                      </button>
                    )}
                    {t.status !== 'cancelled' && (
                      <button onClick={() => remove(t)} disabled={busy}
                        className="text-sm bg-red-500/20 hover:bg-red-500/30 text-red-300 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50 flex items-center gap-1">
                        <Trash2 className="w-3.5 h-3.5" /> Entfernen
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
