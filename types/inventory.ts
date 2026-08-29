// ============================================================
// SCAFFOLD OS – Lager-Modul TypeScript Types
// ============================================================

export type StockStatus = 'ok' | 'warning' | 'critical' | 'empty';
export type TransportStatus = 'pending' | 'in_transit' | 'delivered' | 'cancelled';
export type TransportPriority = 'low' | 'normal' | 'high' | 'urgent';
export type TransactionType = 'in' | 'out' | 'transfer' | 'adjustment' | 'count';

// ─── Zentrallager Artikel ───
export interface InventoryItem {
  id: string;
  created_at: string;
  updated_at: string;
  sku: string;
  name: string;
  category: string;
  description: string | null;
  quantity: number;
  min_stock: number;
  reorder_point: number;
  unit: string;
  unit_price: number;
  weight_kg?: number; // Gewicht pro Stück (Transport-Kalkulation; Spalte kommt per Migration)
  supplier: string | null;
  supplier_lead_time: number;
  location_in_warehouse: string | null;
  barcode: string | null;
  is_active: boolean;
  created_by: string | null;
  updated_by: string | null;
}

// ─── Baustellenbestand ───
export interface SiteStock {
  id: string;
  created_at: string;
  updated_at: string;
  inventory_id: string;
  project_id: string;
  quantity: number;
  reserved_quantity: number;
  min_stock: number;
  status: StockStatus;
  last_counted_at: string | null;
  created_by: string | null;
  updated_by: string | null;
  // Joined
  inventory?: InventoryItem;
  project?: { id: string; name: string };
}

// ─── Transportaufträge ───
export interface TransportOrder {
  id: string;
  created_at: string;
  updated_at: string;
  inventory_id: string;
  from_project_id: string | null;
  to_project_id: string;
  quantity: number;
  status: TransportStatus;
  priority: TransportPriority;
  is_optimized: boolean;
  optimization_reason: string | null;
  empty_run_saved: boolean;
  vehicle_id: string | null;
  driver_id: string | null;
  planned_date: string | null;
  planned_time: string | null;
  completed_at: string | null;
  notes: string | null;
  created_by: string | null;
  updated_by: string | null;
  // Joined
  inventory?: InventoryItem;
  from_project?: { id: string; name: string } | null;
  to_project?: { id: string; name: string };
}

// ─── Bewegungsbuch ───
export interface InventoryTransaction {
  id: string;
  created_at: string;
  inventory_id: string;
  project_id: string | null;
  type: TransactionType;
  quantity: number;
  reason: string | null;
  reference_type: string | null;
  reference_id: string | null;
  created_by: string | null;
}

// ─── Erweiterte Types mit Ampel-Status ───
export interface InventoryWithStatus extends InventoryItem {
  status: StockStatus;
  statusColor: string;
  statusLabel: string;
}

export interface SiteStockWithDetails extends SiteStock {
  available_quantity: number;
  status: StockStatus;
  statusColor: string;
  statusLabel: string;
}

// ─── KI-Transport-Empfehlung ───
export interface TransportRecommendation {
  type: 'warehouse' | 'site_transfer';
  fromLocation: string;
  fromProjectId?: string;
  toProjectId: string;
  inventoryId: string;
  quantity: number;
  reason: string;
  emptyRunSaved: boolean;
  distanceKm?: number;
}

// ─── Dashboard Stats ───
export interface InventoryStats {
  totalItems: number;
  criticalCount: number;
  warningCount: number;
  pendingTransports: number;
}