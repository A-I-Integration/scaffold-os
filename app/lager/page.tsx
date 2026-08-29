'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import BarcodeScanner from '@/components/lager/BarcodeScanner';
import {
  getSiteStock,
  getTransportOrders,
  getOptimizedTransportRecommendation,
  createTransportOrder,
  updateTransportOrderStatus,
} from '@/lib/actions/inventory';
import {
  InventoryItem,
  SiteStockWithDetails,
  TransportOrder,
  TransportRecommendation,
} from '@/types/inventory';

type Tab = 'overview' | 'warehouse' | 'sites' | 'transports' | 'inventur';

interface CountedItem {
  inventory_id: string;
  name: string;
  sku: string;
  book_quantity: number;
  counted_quantity: number;
  difference: number;
  notes: string;
}

export default function LagerPage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<Tab>('overview');
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [siteStock, setSiteStock] = useState<SiteStockWithDetails[]>([]);
  const [transports, setTransports] = useState<TransportOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');

  // ─── ROLLEN-STATE ───
  const [userRole, setUserRole] = useState<string | null>(null);
  const canManage = userRole === 'admin' || userRole === 'disponent';
  const isBauleiter = userRole === 'bauleiter';

  // ─── NEU: BARCODE, RESERVIERUNG, NACHBESTELLUNG ───
  const [showScanner, setShowScanner] = useState(false);
  const [scannedItem, setScannedItem] = useState<InventoryItem | null>(null);
  const [showReserveModal, setShowReserveModal] = useState(false);
  const [reserveItem, setReserveItem] = useState<InventoryItem | null>(null);
  const [reserveProjectId, setReserveProjectId] = useState('');
  const [reserveQty, setReserveQty] = useState(1);
  const [showReorderModal, setShowReorderModal] = useState(false);
  const [reorderItem, setReorderItem] = useState<InventoryItem | null>(null);
  const [reorderQty, setReorderQty] = useState(1);

  // Modals
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showTransportModal, setShowTransportModal] = useState(false);
  const [showOptimizeModal, setShowOptimizeModal] = useState(false);
  const [showCountModal, setShowCountModal] = useState(false);

  // Form States
  const [editingItem, setEditingItem] = useState<InventoryItem | null>(null);
  const [selectedInventoryId, setSelectedInventoryId] = useState('');
  const [selectedToProjectId, setSelectedToProjectId] = useState('');
  const [transportQuantity, setTransportQuantity] = useState(1);
  const [recommendations, setRecommendations] = useState<TransportRecommendation[]>([]);
  const [projects, setProjects] = useState<{ id: string; name: string }[]>([]);
  const [formError, setFormError] = useState<string | null>(null);
  const [formSuccess, setFormSuccess] = useState<string | null>(null);

  // ─── INVENTUR-STATE ───
  const [countSearch, setCountSearch] = useState('');
  const [countedItems, setCountedItems] = useState<CountedItem[]>([]);
  const [countNotes, setCountNotes] = useState('');
  const [countResult, setCountResult] = useState<string | null>(null);

  // ─── USER ROLE LADEN ───
  useEffect(() => {
    async function loadRole() {
      const { createClient } = await import('@/lib/supabase/client');
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
        setUserRole(profile?.role || null);
      }
    }
    loadRole();
  }, []);

  // ─── INVENTORY ÜBER REST-API LADEN ───
  const loadInventory = useCallback(async () => {
    try {
      const res = await fetch('/api/inventory?t=' + Date.now(), { cache: 'no-store' });
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
      setInventory(json.items || []);
    } catch (err: any) { setError(err.message); }
  }, []);

  const loadData = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      await loadInventory();
      const [siteData, transData] = await Promise.all([getSiteStock(), getTransportOrders()]);
      setSiteStock(siteData); setTransports(transData);
    } catch (err: any) { setError(err.message); } finally { setLoading(false); }
  }, [loadInventory]);

  useEffect(() => {
    loadData();
    async function loadProjects() {
      const { createClient } = await import('@/lib/supabase/client');
      const supabase = createClient();
      const { data } = await supabase.from('projects').select('id, name').order('name');
      if (data) setProjects(data);
    }
    loadProjects();
  }, [loadData]);

  // ─── STATUS-BERECHNUNG ───
  function getStatus(item: InventoryItem) {
    if (item.quantity <= 0) return { status: 'empty' as const, color: 'bg-red-600', label: 'Leer' };
    if (item.quantity <= item.min_stock) return { status: 'critical' as const, color: 'bg-red-500', label: 'Kritisch' };
    if (item.quantity <= item.reorder_point) return { status: 'warning' as const, color: 'bg-yellow-500', label: 'Nachbestellen' };
    return { status: 'ok' as const, color: 'bg-green-500', label: 'OK' };
  }

  const filteredInventory = inventory.filter(item =>
    item.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    item.sku.toLowerCase().includes(searchTerm.toLowerCase()) ||
    item.category.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (item.barcode && item.barcode.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  const criticalItems = filteredInventory.filter(i => getStatus(i).status === 'critical' || getStatus(i).status === 'empty');
  const warningItems = filteredInventory.filter(i => getStatus(i).status === 'warning');

  // ─── STATS ───
  const stats = {
    totalItems: inventory.length,
    criticalCount: inventory.filter(i => getStatus(i).status === 'critical' || getStatus(i).status === 'empty').length,
    warningCount: inventory.filter(i => getStatus(i).status === 'warning').length,
    pendingTransports: transports.filter(t => t.status === 'pending').length,
  };

  // ─── CRUD ÜBER REST-API ───
  async function handleAddItem(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault(); setFormError(null);
    const formData = new FormData(e.currentTarget);
    const body = Object.fromEntries(formData.entries());
    try {
      const res = await fetch('/api/inventory', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const json = await res.json(); if (!json.success) throw new Error(json.error);
      setFormSuccess('Artikel erfolgreich erstellt!'); setShowAddModal(false); loadInventory();
      setTimeout(() => setFormSuccess(null), 3000);
    } catch (err: any) { setFormError(err.message); }
  }
  async function handleEditItem(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault(); if (!editingItem) return; setFormError(null);
    const formData = new FormData(e.currentTarget);
    const body = { id: editingItem.id, ...Object.fromEntries(formData.entries()) };
    try {
      const res = await fetch('/api/inventory', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const json = await res.json(); if (!json.success) throw new Error(json.error);
      setFormSuccess('Artikel erfolgreich aktualisiert!'); setShowEditModal(false); setEditingItem(null); loadInventory();
      setTimeout(() => setFormSuccess(null), 3000);
    } catch (err: any) { setFormError(err.message); }
  }
  async function handleDeleteItem(id: string) {
    if (!confirm('Artikel wirklich deaktivieren?')) return;
    try { const res = await fetch(`/api/inventory?id=${id}`, { method: 'DELETE' }); const json = await res.json(); if (!json.success) throw new Error(json.error); loadInventory(); } catch (err: any) { alert(err.message); }
  }

  // ─── NEU: BARCODE SCAN ───
  function handleBarcodeScan(barcode: string) {
    setShowScanner(false);
    const found = inventory.find(i => i.barcode === barcode || i.sku === barcode);
    if (found) {
      setScannedItem(found);
      setSearchTerm(barcode);
      setActiveTab('warehouse');
      setFormSuccess(`✅ Artikel gefunden: ${found.name} (${found.quantity} ${found.unit} auf Lager)`);
      setTimeout(() => setFormSuccess(null), 4000);
    } else {
      setFormError(`❌ Kein Artikel mit Barcode/SKU "${barcode}" gefunden`);
      setTimeout(() => setFormError(null), 4000);
    }
  }

  // ─── NEU: RESERVIERUNG ───
  async function handleReserve(e: React.FormEvent) {
    e.preventDefault(); setFormError(null);
    if (!reserveItem || !reserveProjectId || reserveQty < 1) { setFormError('Bitte Projekt und Menge angeben'); return; }
    try {
      const res = await fetch('/api/inventory/reserve', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ inventory_id: reserveItem.id, project_id: reserveProjectId, quantity: reserveQty }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
      setFormSuccess(json.message); setShowReserveModal(false); setReserveItem(null); setReserveProjectId(''); setReserveQty(1);
      loadInventory(); loadData();
      setTimeout(() => setFormSuccess(null), 3000);
    } catch (err: any) { setFormError(err.message); }
  }

  // ─── NEU: NACHBESTELLUNG ───
  async function handleReorder(e: React.FormEvent) {
    e.preventDefault(); setFormError(null);
    if (!reorderItem || reorderQty < 1) { setFormError('Bitte Menge angeben'); return; }
    try {
      const res = await fetch('/api/inventory/reorder', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ inventory_id: reorderItem.id, order_quantity: reorderQty }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error);
      setFormSuccess(`${json.message}. Erwartete Lieferung: ${json.expectedDelivery}`);
      setShowReorderModal(false); setReorderItem(null); setReorderQty(1);
      setTimeout(() => setFormSuccess(null), 5000);
    } catch (err: any) { setFormError(err.message); }
  }

  // ─── INVENTUR (bestehend) ───
  function openCountModal(item: InventoryItem) {
    setCountSearch(''); setCountNotes(''); setCountResult(null);
    setCountedItems(prev => {
      if (prev.find(c => c.inventory_id === item.id)) return prev;
      return [...prev, { inventory_id: item.id, name: item.name, sku: item.sku, book_quantity: item.quantity, counted_quantity: item.quantity, difference: 0, notes: '' }];
    });
    setShowCountModal(true);
  }
  function updateCount(id: string, qty: number) {
    setCountedItems(prev => prev.map(c => c.inventory_id !== id ? c : { ...c, counted_quantity: qty, difference: qty - c.book_quantity }));
  }
  async function handleSubmitCount() {
    setFormError(null); setCountResult(null);
    try {
      for (const item of countedItems) {
        if (item.counted_quantity === item.book_quantity) continue;
        const res = await fetch('/api/inventory/count', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ inventory_id: item.inventory_id, counted_quantity: item.counted_quantity, notes: countNotes || undefined }) });
        const json = await res.json(); if (!json.success) throw new Error(json.error);
      }
      setCountResult(`${countedItems.length} Artikel inventuriert. Bestand aktualisiert.`); setCountedItems([]); loadInventory();
      setTimeout(() => { setShowCountModal(false); setCountResult(null); }, 2000);
    } catch (err: any) { setFormError(err.message); }
  }

  // ─── TRANSPORTE (bestehend) ───
  async function handleCreateTransport(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault(); setFormError(null);
    const formData = new FormData(e.currentTarget);
    const result = await createTransportOrder(formData);
    if (result.success) { setFormSuccess('Transportauftrag erstellt!'); setShowTransportModal(false); loadData(); setTimeout(() => setFormSuccess(null), 3000); }
    else { setFormError(result.error || 'Fehler beim Erstellen'); }
  }
  async function handleOptimize() {
    if (!selectedInventoryId || !selectedToProjectId || transportQuantity < 1) { setFormError('Bitte Artikel, Ziel-Baustelle und Menge angeben'); return; }
    setFormError(null);
    try { const recs = await getOptimizedTransportRecommendation(selectedInventoryId, selectedToProjectId, transportQuantity); setRecommendations(recs); setShowOptimizeModal(true); } catch (err: any) { setFormError(err.message); }
  }
  async function handleUpdateTransportStatus(id: string, status: string) {
    const result = await updateTransportOrderStatus(id, status);
    if (result.success) loadData(); else alert(result.error);
  }

  const tabClass = (tab: Tab) => `px-4 py-2 text-sm font-medium border-b-2 transition-colors ${activeTab === tab ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}`;

  if (loading) return <div className="min-h-screen bg-gray-50 flex items-center justify-center"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div></div>;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Lager-Management</h1>
              <p className="text-sm text-gray-500 mt-1">{isBauleiter ? 'Bestandsübersicht & Transport-Pläne (Lesemodus)' : 'Bestandsübersicht, Transporte, Inventur & Nachbestellung'}</p>
            </div>
            {canManage && (
              <div className="flex gap-2">
                <button onClick={() => { setShowTransportModal(true); setFormError(null); }} className="px-4 py-2 bg-green-600 text-white text-sm font-medium rounded-xl hover:bg-green-700 transition-colors">+ Transport</button>
                <button onClick={() => { setShowAddModal(true); setFormError(null); }} className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-xl hover:bg-blue-700 transition-colors">+ Artikel</button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-4">
        <div className="border-b border-gray-200">
          <nav className="-mb-px flex gap-6">
            <button onClick={() => setActiveTab('overview')} className={tabClass('overview')}>Übersicht</button>
            <button onClick={() => setActiveTab('warehouse')} className={tabClass('warehouse')}>Zentrallager</button>
            <button onClick={() => setActiveTab('sites')} className={tabClass('sites')}>Baustellen</button>
            <button onClick={() => setActiveTab('transports')} className={tabClass('transports')}>Transporte</button>
            {canManage && <button onClick={() => setActiveTab('inventur')} className={tabClass('inventur')}>📋 Inventur</button>}
          </nav>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {error && <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">{error}</div>}
        {formSuccess && <div className="mb-4 p-4 bg-green-50 border border-green-200 rounded-xl text-green-700 text-sm">{formSuccess}</div>}

        {/* ═══════════════════════════════════════════════════════════ */}
        {/* ÜBERSICHT */}
        {activeTab === 'overview' && (
          <div className="space-y-6">
            {/* Stats */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm"><div className="text-sm font-medium text-gray-500">Artikel gesamt</div><div className="text-3xl font-bold text-gray-900 mt-2">{stats.totalItems}</div></div>
              <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm"><div className="text-sm font-medium text-gray-500">Kritisch</div><div className="text-3xl font-bold text-red-600 mt-2">{stats.criticalCount}</div></div>
              <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm"><div className="text-sm font-medium text-gray-500">Nachbestellen</div><div className="text-3xl font-bold text-yellow-600 mt-2">{stats.warningCount}</div></div>
              <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm"><div className="text-sm font-medium text-gray-500">Offene Transporte</div><div className="text-3xl font-bold text-blue-600 mt-2">{stats.pendingTransports}</div></div>
            </div>

            {/* Kritische Artikel + Nachbestell-Button */}
            {criticalItems.length > 0 && (
              <div className="bg-white rounded-xl border border-red-200 shadow-sm overflow-hidden">
                <div className="px-6 py-4 bg-red-50 border-b border-red-200 flex items-center justify-between">
                  <h3 className="text-lg font-semibold text-red-800">⚠️ Kritische Bestände – Nachbestellung erforderlich</h3>
                </div>
                <div className="divide-y divide-gray-100">
                  {criticalItems.map(item => {
                    const s = getStatus(item);
                    return (
                      <div key={item.id} className="px-6 py-4 flex items-center justify-between">
                        <div><div className="font-medium text-gray-900">{item.name}</div><div className="text-sm text-gray-500">{item.sku} | {item.category}</div></div>
                        <div className="flex items-center gap-4">
                          <div className="text-right"><div className="text-sm font-medium text-gray-900">{item.quantity} {item.unit}</div><div className="text-xs text-gray-500">Min: {item.min_stock}</div></div>
                          <span className={`px-2 py-1 rounded-full text-xs font-semibold text-[#1d1d1f] ${s.color}`}>{s.label}</span>
                          {canManage && (
                            <button onClick={() => { setReorderItem(item); setReorderQty(Math.max(item.reorder_point * 2 - item.quantity, item.min_stock)); setShowReorderModal(true); }} className="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white text-xs font-bold rounded-xl transition-colors">
                              🛒 Bestellen
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Warnungen */}
            {warningItems.length > 0 && (
              <div className="bg-white rounded-xl border border-yellow-200 shadow-sm overflow-hidden">
                <div className="px-6 py-4 bg-yellow-50 border-b border-yellow-200"><h3 className="text-lg font-semibold text-yellow-800">⚡ Nachbestellen empfohlen</h3></div>
                <div className="divide-y divide-gray-100">
                  {warningItems.map(item => {
                    const s = getStatus(item);
                    return (
                      <div key={item.id} className="px-6 py-4 flex items-center justify-between">
                        <div><div className="font-medium text-gray-900">{item.name}</div><div className="text-sm text-gray-500">{item.sku}</div></div>
                        <div className="flex items-center gap-4">
                          <div className="text-right"><div className="text-sm font-medium text-gray-900">{item.quantity} {item.unit}</div><div className="text-xs text-gray-500">Meldebestand: {item.reorder_point}</div></div>
                          <span className={`px-2 py-1 rounded-full text-xs font-semibold text-[#1d1d1f] ${s.color}`}>{s.label}</span>
                          {canManage && (
                            <button onClick={() => { setReorderItem(item); setReorderQty(Math.max(item.reorder_point * 2 - item.quantity, 1)); setShowReorderModal(true); }} className="px-3 py-1.5 bg-yellow-500 hover:bg-yellow-600 text-[#1d1d1f] text-xs font-bold rounded-xl transition-colors">
                              🛒 Bestellen
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════════ */}
        {/* ZENTRALLAGER – mit Barcode-Scan */}
        {activeTab === 'warehouse' && (
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="p-4 border-b border-gray-200 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <div className="flex items-center gap-3 flex-1">
                <input type="text" placeholder="Suche nach Name, SKU, Barcode..." value={searchTerm} onChange={e => { setSearchTerm(e.target.value); setScannedItem(null); }} className="w-full max-w-md px-4 py-2 border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
                {scannedItem && <span className="px-3 py-1 bg-amber-100 text-amber-700 text-xs font-bold rounded-full">📷 Gescannt: {scannedItem.name}</span>}
              </div>
              <div className="flex gap-2">
                {canManage && (
                  <>
                    <button onClick={() => setShowScanner(true)} className="px-4 py-2 bg-purple-100 text-purple-700 text-sm font-medium rounded-xl hover:bg-purple-200 transition-colors flex items-center gap-2">
                      📷 Scan
                    </button>
                    <button onClick={() => setActiveTab('inventur')} className="px-4 py-2 bg-gray-100 text-gray-700 text-sm font-medium rounded-xl hover:bg-gray-200 transition-colors">
                      📋 Inventur
                    </button>
                  </>
                )}
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="bg-gray-50 text-gray-700 font-medium">
                  <tr>
                    <th className="px-6 py-3">Status</th>
                    <th className="px-6 py-3">SKU / Barcode</th>
                    <th className="px-6 py-3">Name</th>
                    <th className="px-6 py-3">Kategorie</th>
                    <th className="px-6 py-3">Bestand</th>
                    <th className="px-6 py-3">Min / Melde</th>
                    <th className="px-6 py-3">Lagerplatz</th>
                    {canManage && <th className="px-6 py-3 text-right">Aktionen</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filteredInventory.map(item => {
                    const s = getStatus(item);
                    const isHighlighted = scannedItem?.id === item.id;
                    return (
                      <tr key={item.id} className={`hover:bg-gray-50 transition-colors ${isHighlighted ? 'bg-amber-50 ring-1 ring-amber-300' : ''}`}>
                        <td className="px-6 py-4"><span className={`inline-flex px-2 py-1 rounded-full text-xs font-semibold text-[#1d1d1f] ${s.color}`}>{s.label}</span></td>
                        <td className="px-6 py-4 font-mono text-xs text-gray-600">{item.sku}<br/>{item.barcode && <span className="text-amber-600">{item.barcode}</span>}</td>
                        <td className="px-6 py-4 font-medium text-gray-900">{item.name}</td>
                        <td className="px-6 py-4 text-gray-600">{item.category}</td>
                        <td className="px-6 py-4"><span className={`font-semibold ${s.status === 'critical' || s.status === 'empty' ? 'text-red-600' : 'text-gray-900'}`}>{item.quantity}</span> {' '}{item.unit}</td>
                        <td className="px-6 py-4 text-gray-600">{item.min_stock} / {item.reorder_point}</td>
                        <td className="px-6 py-4 text-gray-600">{item.location_in_warehouse || '-'}</td>
                        {canManage && (
                          <td className="px-6 py-4 text-right">
                            <div className="flex items-center justify-end gap-2">
                              <button onClick={() => { setReserveItem(item); setReserveQty(1); setShowReserveModal(true); }} className="px-2 py-1 bg-blue-100 text-blue-700 text-xs font-medium rounded hover:bg-blue-200">Reservieren</button>
                              <button onClick={() => { setEditingItem(item); setShowEditModal(true); setFormError(null); }} className="text-blue-600 hover:text-blue-800 text-xs font-medium">Bearbeiten</button>
                              <button onClick={() => handleDeleteItem(item.id)} className="text-red-600 hover:text-red-800 text-xs font-medium">Deaktivieren</button>
                            </div>
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {filteredInventory.length === 0 && <div className="p-8 text-center text-gray-500 text-sm">Keine Artikel gefunden</div>}
            </div>
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════════ */}
        {/* BAUSTELLEN */}
        {activeTab === 'sites' && (
          <div className="space-y-6">
            {siteStock.length === 0 ? <div className="bg-white rounded-xl border border-gray-200 p-8 text-center text-gray-500">Kein Baustellenbestand vorhanden</div> : siteStock.map(stock => (
              <div key={stock.id} className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
                  <div><h3 className="font-semibold text-gray-900">{stock.project?.name || 'Baustelle'}</h3><p className="text-sm text-gray-500">{stock.inventory?.name}</p></div>
                  <span className={`px-2 py-1 rounded-full text-xs font-semibold text-[#1d1d1f] ${stock.statusColor}`}>{stock.statusLabel}</span>
                </div>
                <div className="px-6 py-4 grid grid-cols-2 sm:grid-cols-4 gap-4">
                  <div><div className="text-xs text-gray-500">Gesamt</div><div className="text-lg font-semibold text-gray-900">{stock.quantity} {stock.inventory?.unit}</div></div>
                  <div><div className="text-xs text-gray-500">Reserviert</div><div className="text-lg font-semibold text-orange-600">{stock.reserved_quantity} {stock.inventory?.unit}</div></div>
                  <div><div className="text-xs text-gray-500">Verfügbar</div><div className="text-lg font-semibold text-green-600">{stock.available_quantity} {stock.inventory?.unit}</div></div>
                  <div><div className="text-xs text-gray-500">Mindestbestand</div><div className="text-lg font-semibold text-gray-700">{stock.min_stock} {stock.inventory?.unit}</div></div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════════ */}
        {/* TRANSPORTE */}
        {activeTab === 'transports' && (
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="bg-gray-50 text-gray-700 font-medium">
                  <tr><th className="px-6 py-3">Status</th><th className="px-6 py-3">Artikel</th><th className="px-6 py-3">Von</th><th className="px-6 py-3">Nach</th><th className="px-6 py-3">Menge</th><th className="px-6 py-3">Priorität</th><th className="px-6 py-3">Geplant</th>{canManage && <th className="px-6 py-3 text-right">Aktionen</th>}</tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {transports.map(t => (
                    <tr key={t.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4">
                        <span className={`inline-flex px-2 py-1 rounded-full text-xs font-semibold ${t.status === 'delivered' ? 'bg-green-100 text-green-800' : t.status === 'in_transit' ? 'bg-blue-100 text-blue-800' : t.status === 'cancelled' ? 'bg-gray-100 text-gray-800' : 'bg-yellow-100 text-yellow-800'}`}>
                          {t.status === 'pending' ? 'Ausstehend' : t.status === 'in_transit' ? 'Unterwegs' : t.status === 'delivered' ? 'Geliefert' : 'Storniert'}
                        </span>
                        {t.is_optimized && <span className="ml-2 inline-flex px-2 py-0.5 rounded text-xs bg-purple-100 text-purple-700">KI</span>}
                      </td>
                      <td className="px-6 py-4 font-medium text-gray-900">{t.inventory?.name}</td>
                      <td className="px-6 py-4 text-gray-600">{t.from_project?.name || 'Zentrallager'}</td>
                      <td className="px-6 py-4 text-gray-600">{t.to_project?.name}</td>
                      <td className="px-6 py-4 font-semibold">{t.quantity}</td>
                      <td className="px-6 py-4"><span className={`text-xs font-semibold ${t.priority === 'urgent' ? 'text-red-600' : t.priority === 'high' ? 'text-orange-600' : t.priority === 'low' ? 'text-gray-500' : 'text-blue-600'}`}>{t.priority?.toUpperCase()}</span></td>
                      <td className="px-6 py-4 text-gray-600">{t.planned_date ? new Date(t.planned_date).toLocaleDateString('de-DE') : '-'}</td>
                      {canManage && (
                        <td className="px-6 py-4 text-right">
                          {t.status === 'pending' && <><button onClick={() => handleUpdateTransportStatus(t.id, 'in_transit')} className="text-blue-600 hover:text-blue-800 text-xs font-medium mr-3">Starten</button><button onClick={() => handleUpdateTransportStatus(t.id, 'cancelled')} className="text-red-600 hover:text-red-800 text-xs font-medium">Stornieren</button></>}
                          {t.status === 'in_transit' && <button onClick={() => handleUpdateTransportStatus(t.id, 'delivered')} className="text-green-600 hover:text-green-800 text-xs font-medium">Abschließen</button>}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
              {transports.length === 0 && <div className="p-8 text-center text-gray-500 text-sm">Keine Transportaufträge</div>}
            </div>
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════════ */}
        {/* INVENTUR */}
        {activeTab === 'inventur' && canManage && (
          <div className="space-y-6">
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">📋 Inventur-Modus</h3>
              <p className="text-sm text-gray-500 mb-4">Wähle Artikel aus, zähle den tatsächlichen Bestand und buche die Differenz automatisch.</p>
              <input type="text" placeholder="Artikel suchen..." value={countSearch} onChange={e => setCountSearch(e.target.value)} className="w-full max-w-md px-4 py-2 border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none mb-4" />
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left">
                  <thead className="bg-gray-50 text-gray-700 font-medium"><tr><th className="px-4 py-3">SKU</th><th className="px-4 py-3">Name</th><th className="px-4 py-3">Buchbestand</th><th className="px-4 py-3">Aktion</th></tr></thead>
                  <tbody className="divide-y divide-gray-100">
                    {inventory.filter(item => item.name.toLowerCase().includes(countSearch.toLowerCase()) || item.sku.toLowerCase().includes(countSearch.toLowerCase())).map(item => {
                      const counted = countedItems.find(c => c.inventory_id === item.id);
                      return (
                        <tr key={item.id} className="hover:bg-gray-50">
                          <td className="px-4 py-3 font-mono text-xs text-gray-600">{item.sku}</td>
                          <td className="px-4 py-3 font-medium text-gray-900">{item.name}</td>
                          <td className="px-4 py-3">{item.quantity} {item.unit}</td>
                          <td className="px-4 py-3">{counted ? <span className="text-green-600 text-xs font-medium">✅ Gezählt ({counted.counted_quantity})</span> : <button onClick={() => openCountModal(item)} className="text-blue-600 hover:text-blue-800 text-xs font-medium">Zählen</button>}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {countedItems.length > 0 && (
                <div className="mt-6 border-t border-gray-200 pt-4">
                  <h4 className="font-medium text-gray-900 mb-2">Zähl-Übersicht ({countedItems.length} Artikel)</h4>
                  <div className="space-y-2">
                    {countedItems.map(c => (
                      <div key={c.inventory_id} className="flex items-center justify-between bg-gray-50 p-3 rounded-xl">
                        <div className="text-sm"><span className="font-medium">{c.name}</span><span className="text-gray-500 ml-2">Buch: {c.book_quantity} → Zähl: {c.counted_quantity}</span></div>
                        <span className={`text-sm font-semibold ${c.difference === 0 ? 'text-green-600' : c.difference > 0 ? 'text-blue-600' : 'text-red-600'}`}>{c.difference === 0 ? '✅ OK' : c.difference > 0 ? `+${c.difference}` : c.difference}</span>
                      </div>
                    ))}
                  </div>
                  <div className="mt-4"><label className="block text-sm font-medium text-gray-700 mb-1">Inventur-Notiz (optional)</label><input type="text" value={countNotes} onChange={e => setCountNotes(e.target.value)} placeholder="z.B. Jahresinventur 2026" className="w-full max-w-md px-3 py-2 border border-gray-300 rounded-xl text-sm" /></div>
                  <button onClick={handleSubmitCount} className="mt-4 px-6 py-2 bg-purple-600 text-white text-sm font-medium rounded-xl hover:bg-purple-700 transition-colors">📥 Inventur buchen & Bestand korrigieren</button>
                  {countResult && <p className="mt-2 text-sm text-green-600">{countResult}</p>}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ═══════════════════════════════════════════════════════════ */}
      {/* MODALS */}

      {/* Barcode Scanner */}
      {showScanner && <BarcodeScanner onScan={handleBarcodeScan} onClose={() => setShowScanner(false)} />}

      {/* Reservierungs-Modal */}
      {showReserveModal && reserveItem && canManage && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900">📦 Material reservieren</h3>
              <button onClick={() => setShowReserveModal(false)} className="text-gray-400 hover:text-gray-600">✕</button>
            </div>
            <div className="mb-4 p-3 bg-gray-50 rounded-xl">
              <p className="text-sm font-medium text-gray-900">{reserveItem.name}</p>
              <p className="text-xs text-gray-500">Verfügbar: {reserveItem.quantity} {reserveItem.unit}</p>
            </div>
            <form onSubmit={handleReserve} className="space-y-4">
              {formError && <div className="p-3 bg-red-50 text-red-700 text-sm rounded-xl">{formError}</div>}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Projekt (Baustelle) *</label>
                <select value={reserveProjectId} onChange={e => setReserveProjectId(e.target.value)} required className="w-full px-3 py-2 border border-gray-300 rounded-xl text-sm">
                  <option value="">Bitte wählen</option>
                  {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Menge *</label>
                <input type="number" min="1" max={reserveItem.quantity} value={reserveQty} onChange={e => setReserveQty(parseInt(e.target.value) || 1)} required className="w-full px-3 py-2 border border-gray-300 rounded-xl text-sm" />
                <p className="text-xs text-gray-500 mt-1">Maximal {reserveItem.quantity} {reserveItem.unit} verfügbar</p>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setShowReserveModal(false)} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-xl">Abbrechen</button>
                <button type="submit" className="px-4 py-2 text-sm bg-blue-600 text-white rounded-xl hover:bg-blue-700">Reservieren</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Nachbestell-Modal */}
      {showReorderModal && reorderItem && canManage && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900">🛒 Nachbestellung auslösen</h3>
              <button onClick={() => setShowReorderModal(false)} className="text-gray-400 hover:text-gray-600">✕</button>
            </div>
            <div className="mb-4 p-3 bg-red-50 rounded-xl border border-red-200">
              <p className="text-sm font-medium text-red-800">{reorderItem.name}</p>
              <p className="text-xs text-red-600">Aktuell: {reorderItem.quantity} {reorderItem.unit} | Min: {reorderItem.min_stock} | Melde: {reorderItem.reorder_point}</p>
              {reorderItem.supplier && <p className="text-xs text-gray-600 mt-1">Lieferant: {reorderItem.supplier} | Lieferzeit: {reorderItem.supplier_lead_time} Tage</p>}
            </div>
            <form onSubmit={handleReorder} className="space-y-4">
              {formError && <div className="p-3 bg-red-50 text-red-700 text-sm rounded-xl">{formError}</div>}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Bestellmenge *</label>
                <input type="number" min="1" value={reorderQty} onChange={e => setReorderQty(parseInt(e.target.value) || 1)} required className="w-full px-3 py-2 border border-gray-300 rounded-xl text-sm" />
                <p className="text-xs text-gray-500 mt-1">Empfohlen: Mindestens {Math.max(reorderItem.reorder_point * 2 - reorderItem.quantity, reorderItem.min_stock)} {reorderItem.unit}</p>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" onClick={() => setShowReorderModal(false)} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-xl">Abbrechen</button>
                <button type="submit" className="px-4 py-2 text-sm bg-red-600 text-white rounded-xl hover:bg-red-700">🛒 Jetzt bestellen</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ADD MODAL */}
      {showAddModal && canManage && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between"><h3 className="text-lg font-semibold text-gray-900">Neuer Artikel</h3><button onClick={() => setShowAddModal(false)} className="text-gray-400 hover:text-gray-600">✕</button></div>
            <form onSubmit={handleAddItem} className="p-6 space-y-4">
              {formError && <div className="p-3 bg-red-50 text-red-700 text-sm rounded-xl">{formError}</div>}
              <div className="grid grid-cols-2 gap-4">
                <div><label className="block text-sm font-medium text-gray-700 mb-1">SKU *</label><input name="sku" required className="w-full px-3 py-2 border rounded-xl text-sm" /></div>
                <div><label className="block text-sm font-medium text-gray-700 mb-1">Name *</label><input name="name" required className="w-full px-3 py-2 border rounded-xl text-sm" /></div>
                <div><label className="block text-sm font-medium text-gray-700 mb-1">Kategorie *</label><input name="category" required className="w-full px-3 py-2 border rounded-xl text-sm" /></div>
                <div><label className="block text-sm font-medium text-gray-700 mb-1">Einheit</label><input name="unit" defaultValue="Stk" className="w-full px-3 py-2 border rounded-xl text-sm" /></div>
                <div><label className="block text-sm font-medium text-gray-700 mb-1">Bestand</label><input name="quantity" type="number" defaultValue="0" className="w-full px-3 py-2 border rounded-xl text-sm" /></div>
                <div><label className="block text-sm font-medium text-gray-700 mb-1">Mindestbestand</label><input name="min_stock" type="number" defaultValue="10" className="w-full px-3 py-2 border rounded-xl text-sm" /></div>
                <div><label className="block text-sm font-medium text-gray-700 mb-1">Meldebestand</label><input name="reorder_point" type="number" defaultValue="20" className="w-full px-3 py-2 border rounded-xl text-sm" /></div>
                <div><label className="block text-sm font-medium text-gray-700 mb-1">Stückpreis (€)</label><input name="unit_price" type="number" step="0.01" defaultValue="0" className="w-full px-3 py-2 border rounded-xl text-sm" /></div>
                <div><label className="block text-sm font-medium text-gray-700 mb-1">Gewicht (kg pro Stück)</label><input name="weight_kg" type="number" step="0.01" defaultValue="0" className="w-full px-3 py-2 border rounded-xl text-sm" /></div>
                <div><label className="block text-sm font-medium text-gray-700 mb-1">Lieferant</label><input name="supplier" className="w-full px-3 py-2 border rounded-xl text-sm" /></div>
                <div><label className="block text-sm font-medium text-gray-700 mb-1">Lieferzeit (Tage)</label><input name="supplier_lead_time" type="number" defaultValue="7" className="w-full px-3 py-2 border rounded-xl text-sm" /></div>
                <div><label className="block text-sm font-medium text-gray-700 mb-1">Lagerplatz</label><input name="location_in_warehouse" className="w-full px-3 py-2 border rounded-xl text-sm" /></div>
                <div><label className="block text-sm font-medium text-gray-700 mb-1">Barcode</label><input name="barcode" className="w-full px-3 py-2 border rounded-xl text-sm" /></div>
              </div>
              <div><label className="block text-sm font-medium text-gray-700 mb-1">Beschreibung</label><textarea name="description" rows={2} className="w-full px-3 py-2 border rounded-xl text-sm" /></div>
              <div className="flex justify-end gap-2 pt-2"><button type="button" onClick={() => setShowAddModal(false)} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-xl">Abbrechen</button><button type="submit" className="px-4 py-2 text-sm bg-blue-600 text-white rounded-xl hover:bg-blue-700">Speichern</button></div>
            </form>
          </div>
        </div>
      )}

      {/* EDIT MODAL */}
      {showEditModal && editingItem && canManage && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between"><h3 className="text-lg font-semibold text-gray-900">Artikel bearbeiten</h3><button onClick={() => { setShowEditModal(false); setEditingItem(null); }} className="text-gray-400 hover:text-gray-600">✕</button></div>
            <form onSubmit={handleEditItem} className="p-6 space-y-4">
              {formError && <div className="p-3 bg-red-50 text-red-700 text-sm rounded-xl">{formError}</div>}
              <div className="grid grid-cols-2 gap-4">
                <div><label className="block text-sm font-medium text-gray-700 mb-1">SKU *</label><input name="sku" defaultValue={editingItem.sku} required className="w-full px-3 py-2 border rounded-xl text-sm" /></div>
                <div><label className="block text-sm font-medium text-gray-700 mb-1">Name *</label><input name="name" defaultValue={editingItem.name} required className="w-full px-3 py-2 border rounded-xl text-sm" /></div>
                <div><label className="block text-sm font-medium text-gray-700 mb-1">Kategorie *</label><input name="category" defaultValue={editingItem.category} required className="w-full px-3 py-2 border rounded-xl text-sm" /></div>
                <div><label className="block text-sm font-medium text-gray-700 mb-1">Einheit</label><input name="unit" defaultValue={editingItem.unit} className="w-full px-3 py-2 border rounded-xl text-sm" /></div>
                <div><label className="block text-sm font-medium text-gray-700 mb-1">Bestand</label><input name="quantity" type="number" defaultValue={editingItem.quantity} className="w-full px-3 py-2 border rounded-xl text-sm" /></div>
                <div><label className="block text-sm font-medium text-gray-700 mb-1">Mindestbestand</label><input name="min_stock" type="number" defaultValue={editingItem.min_stock} className="w-full px-3 py-2 border rounded-xl text-sm" /></div>
                <div><label className="block text-sm font-medium text-gray-700 mb-1">Meldebestand</label><input name="reorder_point" type="number" defaultValue={editingItem.reorder_point} className="w-full px-3 py-2 border rounded-xl text-sm" /></div>
                <div><label className="block text-sm font-medium text-gray-700 mb-1">Stückpreis (€)</label><input name="unit_price" type="number" step="0.01" defaultValue={editingItem.unit_price} className="w-full px-3 py-2 border rounded-xl text-sm" /></div>
                <div><label className="block text-sm font-medium text-gray-700 mb-1">Gewicht (kg pro Stück)</label><input name="weight_kg" type="number" step="0.01" defaultValue={editingItem.weight_kg ?? 0} className="w-full px-3 py-2 border rounded-xl text-sm" /></div>
                <div><label className="block text-sm font-medium text-gray-700 mb-1">Lieferant</label><input name="supplier" defaultValue={editingItem.supplier || ''} className="w-full px-3 py-2 border rounded-xl text-sm" /></div>
                <div><label className="block text-sm font-medium text-gray-700 mb-1">Lieferzeit (Tage)</label><input name="supplier_lead_time" type="number" defaultValue={editingItem.supplier_lead_time} className="w-full px-3 py-2 border rounded-xl text-sm" /></div>
                <div><label className="block text-sm font-medium text-gray-700 mb-1">Lagerplatz</label><input name="location_in_warehouse" defaultValue={editingItem.location_in_warehouse || ''} className="w-full px-3 py-2 border rounded-xl text-sm" /></div>
                <div><label className="block text-sm font-medium text-gray-700 mb-1">Barcode</label><input name="barcode" defaultValue={editingItem.barcode || ''} className="w-full px-3 py-2 border rounded-xl text-sm" /></div>
              </div>
              <div><label className="block text-sm font-medium text-gray-700 mb-1">Beschreibung</label><textarea name="description" defaultValue={editingItem.description || ''} rows={2} className="w-full px-3 py-2 border rounded-xl text-sm" /></div>
              <div className="flex items-center gap-2"><input type="checkbox" name="is_active" value="true" defaultChecked={editingItem.is_active} className="rounded" /><label className="text-sm text-gray-700">Aktiv</label></div>
              <div className="flex justify-end gap-2 pt-2"><button type="button" onClick={() => { setShowEditModal(false); setEditingItem(null); }} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-xl">Abbrechen</button><button type="submit" className="px-4 py-2 text-sm bg-blue-600 text-white rounded-xl hover:bg-blue-700">Speichern</button></div>
            </form>
          </div>
        </div>
      )}

      {/* COUNT MODAL */}
      {showCountModal && countedItems.length > 0 && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-lg w-full">
            <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between"><h3 className="text-lg font-semibold text-gray-900">Artikel zählen: {countedItems[countedItems.length - 1]?.name}</h3><button onClick={() => setShowCountModal(false)} className="text-gray-400 hover:text-gray-600">✕</button></div>
            <div className="p-6 space-y-4">
              {countedItems.filter(c => !c.difference && c.counted_quantity === c.book_quantity).length === 0 && <div className="p-3 bg-blue-50 text-blue-700 text-sm rounded-xl">Buchbestand: <strong>{countedItems[countedItems.length - 1]?.book_quantity}</strong> Stk</div>}
              <div><label className="block text-sm font-medium text-gray-700 mb-1">Gezählte Menge</label><input type="number" min="0" autoFocus defaultValue={countedItems[countedItems.length - 1]?.book_quantity} onChange={e => { const last = countedItems[countedItems.length - 1]; if (last) updateCount(last.inventory_id, parseInt(e.target.value) || 0); }} className="w-full px-3 py-2 border border-gray-300 rounded-xl text-lg font-semibold text-center" /></div>
              <div className="flex justify-end gap-2"><button onClick={() => setShowCountModal(false)} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-xl">Abbrechen</button><button onClick={() => setShowCountModal(false)} className="px-4 py-2 text-sm bg-blue-600 text-white rounded-xl hover:bg-blue-700">Speichern</button></div>
            </div>
          </div>
        </div>
      )}

      {/* TRANSPORT MODAL */}
      {showTransportModal && canManage && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-lg w-full">
            <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between"><h3 className="text-lg font-semibold text-gray-900">Transport anlegen</h3><button onClick={() => setShowTransportModal(false)} className="text-gray-400 hover:text-gray-600">✕</button></div>
            <form onSubmit={handleCreateTransport} className="p-6 space-y-4">
              {formError && <div className="p-3 bg-red-50 text-red-700 text-sm rounded-xl">{formError}</div>}
              <div><label className="block text-sm font-medium text-gray-700 mb-1">Artikel *</label><select name="inventory_id" required value={selectedInventoryId} onChange={e => setSelectedInventoryId(e.target.value)} className="w-full px-3 py-2 border rounded-xl text-sm"><option value="">Bitte wählen</option>{inventory.map(item => <option key={item.id} value={item.id}>{item.name} ({item.quantity} {item.unit} verfügbar)</option>)}</select></div>
              <div><label className="block text-sm font-medium text-gray-700 mb-1">Von (optional, leer = Zentrallager)</label><select name="from_project_id" className="w-full px-3 py-2 border rounded-xl text-sm"><option value="">Zentrallager</option>{projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></div>
              <div><label className="block text-sm font-medium text-gray-700 mb-1">Nach (Baustelle) *</label><select name="to_project_id" required value={selectedToProjectId} onChange={e => setSelectedToProjectId(e.target.value)} className="w-full px-3 py-2 border rounded-xl text-sm"><option value="">Bitte wählen</option>{projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></div>
              <div className="grid grid-cols-2 gap-4"><div><label className="block text-sm font-medium text-gray-700 mb-1">Menge *</label><input name="quantity" type="number" min="1" required value={transportQuantity} onChange={e => setTransportQuantity(parseInt(e.target.value) || 1)} className="w-full px-3 py-2 border rounded-xl text-sm" /></div><div><label className="block text-sm font-medium text-gray-700 mb-1">Priorität</label><select name="priority" defaultValue="normal" className="w-full px-3 py-2 border rounded-xl text-sm"><option value="low">Niedrig</option><option value="normal">Normal</option><option value="high">Hoch</option><option value="urgent">Dringend</option></select></div></div>
              <div className="grid grid-cols-2 gap-4"><div><label className="block text-sm font-medium text-gray-700 mb-1">Geplantes Datum</label><input name="planned_date" type="date" className="w-full px-3 py-2 border rounded-xl text-sm" /></div><div><label className="block text-sm font-medium text-gray-700 mb-1">Geplante Uhrzeit</label><input name="planned_time" type="time" className="w-full px-3 py-2 border rounded-xl text-sm" /></div></div>
              <div><label className="block text-sm font-medium text-gray-700 mb-1">Notizen</label><textarea name="notes" rows={2} className="w-full px-3 py-2 border rounded-xl text-sm" /></div>
              <div className="flex justify-between items-center pt-2"><button type="button" onClick={handleOptimize} className="px-4 py-2 text-sm bg-purple-100 text-purple-700 rounded-xl hover:bg-purple-200">🧠 KI-Optimierung</button><div className="flex gap-2"><button type="button" onClick={() => setShowTransportModal(false)} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-xl">Abbrechen</button><button type="submit" className="px-4 py-2 text-sm bg-green-600 text-white rounded-xl hover:bg-green-700">Anlegen</button></div></div>
            </form>
          </div>
        </div>
      )}

      {/* OPTIMIZE MODAL */}
      {showOptimizeModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-lg w-full">
            <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between"><h3 className="text-lg font-semibold text-gray-900">🧠 KI-Transport-Empfehlung</h3><button onClick={() => setShowOptimizeModal(false)} className="text-gray-400 hover:text-gray-600">✕</button></div>
            <div className="p-6 space-y-4">
              {recommendations.length === 0 ? <p className="text-gray-500 text-sm">Keine optimierten Routen gefunden. Direktlieferung aus Zentrallager empfohlen.</p> : recommendations.map((rec, idx) => (
                <div key={idx} className={`p-4 rounded-xl border ${rec.emptyRunSaved ? 'border-green-300 bg-green-50' : 'border-gray-200 bg-gray-50'}`}>
                  <div className="flex items-start justify-between">
                    <div><div className="font-semibold text-gray-900">{rec.type === 'site_transfer' ? 'Baustellen-Transfer' : 'Zentrallager-Lieferung'}</div><div className="text-sm text-gray-600 mt-1">Von: <span className="font-medium">{rec.fromLocation}</span></div><div className="text-sm text-gray-600">Menge: <span className="font-medium">{rec.quantity} Stk</span></div><div className="text-sm text-gray-500 mt-2">{rec.reason}</div></div>
                    {rec.emptyRunSaved && <span className="px-2 py-1 bg-green-100 text-green-700 text-xs font-bold rounded-full">⛽ Leerfahrt vermieden</span>}
                  </div>
                </div>
              ))}
              <div className="flex justify-end pt-2"><button onClick={() => setShowOptimizeModal(false)} className="px-4 py-2 text-sm bg-blue-600 text-white rounded-xl hover:bg-blue-700">Verstanden</button></div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}