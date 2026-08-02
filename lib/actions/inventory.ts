'use server';

// ============================================================
// SCAFFOLD OS – Lager-Modul Server Actions
// ============================================================

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import {
  InventoryItem,
  SiteStock,
  TransportOrder,
  InventoryWithStatus,
  SiteStockWithDetails,
  TransportRecommendation,
  InventoryStats,
} from '@/types/inventory';

// ═══════════════════════════════════════════════════════════
// HILFSFUNKTIONEN
// ═══════════════════════════════════════════════════════════

function calculateStockStatus(
  quantity: number,
  minStock: number,
  reorderPoint: number
): { status: 'ok' | 'warning' | 'critical' | 'empty'; color: string; label: string } {
  if (quantity <= 0) {
    return { status: 'empty', color: 'bg-red-600', label: 'Leer' };
  }
  if (quantity <= minStock) {
    return { status: 'critical', color: 'bg-red-500', label: 'Kritisch' };
  }
  if (quantity <= reorderPoint) {
    return { status: 'warning', color: 'bg-yellow-500', label: 'Nachbestellen' };
  }
  return { status: 'ok', color: 'bg-green-500', label: 'OK' };
}

async function checkAdminOrDisponent(supabase: any): Promise<{ allowed: boolean; userId?: string; error?: string }> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { allowed: false, error: 'Nicht authentifiziert' };

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  if (!profile || !['admin', 'disponent'].includes(profile.role)) {
    return { allowed: false, error: 'Keine Berechtigung' };
  }

  return { allowed: true, userId: user.id };
}

// ═══════════════════════════════════════════════════════════
// INVENTORY
// ═══════════════════════════════════════════════════════════

export async function getInventory(): Promise<InventoryWithStatus[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('inventory')
    .select('*')
    .eq('is_active', true)
    .order('name');

  if (error) throw new Error(`Fehler: ${error.message}`);

  return (data || []).map((item: InventoryItem) => {
    const status = calculateStockStatus(item.quantity, item.min_stock, item.reorder_point);
    return { ...item, status: status.status, statusColor: status.color, statusLabel: status.label };
  });
}

export async function getInventoryItem(id: string): Promise<InventoryItem | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.from('inventory').select('*').eq('id', id).single();
  if (error) return null;
  return data;
}

export async function createInventoryItem(formData: FormData): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient();
  const auth = await checkAdminOrDisponent(supabase);
  if (!auth.allowed) return { success: false, error: auth.error };

  const item = {
    sku: formData.get('sku') as string,
    name: formData.get('name') as string,
    category: formData.get('category') as string,
    description: (formData.get('description') as string) || null,
    quantity: parseInt(formData.get('quantity') as string) || 0,
    min_stock: parseInt(formData.get('min_stock') as string) || 10,
    reorder_point: parseInt(formData.get('reorder_point') as string) || 20,
    unit: (formData.get('unit') as string) || 'Stk',
    unit_price: parseFloat(formData.get('unit_price') as string) || 0,
    supplier: (formData.get('supplier') as string) || null,
    supplier_lead_time: parseInt(formData.get('supplier_lead_time') as string) || 7,
    location_in_warehouse: (formData.get('location_in_warehouse') as string) || null,
    barcode: (formData.get('barcode') as string) || null,
    created_by: auth.userId,
    updated_by: auth.userId,
  };

  const { error } = await supabase.from('inventory').insert(item);
  if (error) return { success: false, error: error.message };
  revalidatePath('/lager');
  return { success: true };
}

export async function updateInventoryItem(id: string, formData: FormData): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient();
  const auth = await checkAdminOrDisponent(supabase);
  if (!auth.allowed) return { success: false, error: auth.error };

  const item = {
    sku: formData.get('sku') as string,
    name: formData.get('name') as string,
    category: formData.get('category') as string,
    description: (formData.get('description') as string) || null,
    quantity: parseInt(formData.get('quantity') as string) || 0,
    min_stock: parseInt(formData.get('min_stock') as string) || 10,
    reorder_point: parseInt(formData.get('reorder_point') as string) || 20,
    unit: (formData.get('unit') as string) || 'Stk',
    unit_price: parseFloat(formData.get('unit_price') as string) || 0,
    supplier: (formData.get('supplier') as string) || null,
    supplier_lead_time: parseInt(formData.get('supplier_lead_time') as string) || 7,
    location_in_warehouse: (formData.get('location_in_warehouse') as string) || null,
    barcode: (formData.get('barcode') as string) || null,
    is_active: formData.get('is_active') === 'true',
    updated_by: auth.userId,
  };

  const { error } = await supabase.from('inventory').update(item).eq('id', id);
  if (error) return { success: false, error: error.message };
  revalidatePath('/lager');
  return { success: true };
}

export async function deleteInventoryItem(id: string): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: 'Nicht authentifiziert' };

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
  if (!profile || profile.role !== 'admin') return { success: false, error: 'Nur Admin' };

  const { error } = await supabase.from('inventory').update({ is_active: false, updated_by: user.id }).eq('id', id);
  if (error) return { success: false, error: error.message };
  revalidatePath('/lager');
  return { success: true };
}

// ═══════════════════════════════════════════════════════════
// SITE STOCK
// ═══════════════════════════════════════════════════════════

export async function getSiteStock(projectId?: string): Promise<SiteStockWithDetails[]> {
  const supabase = await createClient();
  let query = supabase.from('site_stock').select(`*, inventory:inventory_id(*), project:project_id(id, name)`);
  if (projectId) query = query.eq('project_id', projectId);

  const { data, error } = await query.order('created_at', { ascending: false });
  if (error) throw new Error(`Fehler: ${error.message}`);

  return (data || []).map((item: any) => {
    const availableQty = item.quantity - item.reserved_quantity;
    const status = calculateStockStatus(availableQty, item.min_stock, item.min_stock * 2);
    return { ...item, available_quantity: availableQty, status: status.status, statusColor: status.color, statusLabel: status.label };
  });
}

export async function updateSiteStock(id: string, quantity: number, reservedQuantity: number): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: 'Nicht authentifiziert' };

  const { error } = await supabase.from('site_stock').update({ quantity, reserved_quantity: reservedQuantity, updated_by: user.id }).eq('id', id);
  if (error) return { success: false, error: error.message };
  revalidatePath('/lager');
  return { success: true };
}

// ═══════════════════════════════════════════════════════════
// TRANSPORT ORDERS
// ═══════════════════════════════════════════════════════════

export async function getTransportOrders(status?: string): Promise<TransportOrder[]> {
  const supabase = await createClient();
  let query = supabase.from('transport_orders').select(`*, inventory:inventory_id(*), from_project:from_project_id(id, name), to_project:to_project_id(id, name)`).order('created_at', { ascending: false });
  if (status) query = query.eq('status', status);

  const { data, error } = await query;
  if (error) throw new Error(`Fehler: ${error.message}`);
  return data || [];
}

export async function createTransportOrder(formData: FormData): Promise<{ success: boolean; error?: string; data?: any }> {
  const supabase = await createClient();
  const auth = await checkAdminOrDisponent(supabase);
  if (!auth.allowed) return { success: false, error: auth.error };

  const order = {
    inventory_id: formData.get('inventory_id') as string,
    from_project_id: (formData.get('from_project_id') as string) || null,
    to_project_id: formData.get('to_project_id') as string,
    quantity: parseInt(formData.get('quantity') as string) || 0,
    status: 'pending' as const,
    priority: (formData.get('priority') as string) || 'normal',
    planned_date: (formData.get('planned_date') as string) || null,
    planned_time: (formData.get('planned_time') as string) || null,
    notes: (formData.get('notes') as string) || null,
    created_by: auth.userId,
    updated_by: auth.userId,
  };

  const { data, error } = await supabase.from('transport_orders').insert(order).select().single();
  if (error) return { success: false, error: error.message };

  await supabase.from('inventory_transactions').insert({
    inventory_id: order.inventory_id,
    project_id: order.from_project_id,
    type: 'out',
    quantity: -order.quantity,
    reason: `Transportauftrag erstellt`,
    reference_type: 'transport_order',
    reference_id: data.id,
    created_by: auth.userId,
  });

  revalidatePath('/lager');
  return { success: true, data };
}

export async function updateTransportOrderStatus(id: string, status: string): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, error: 'Nicht authentifiziert' };

  const updates: any = { status, updated_by: user.id };
  if (status === 'delivered') updates.completed_at = new Date().toISOString();

  const { error } = await supabase.from('transport_orders').update(updates).eq('id', id);
  if (error) return { success: false, error: error.message };
  revalidatePath('/lager');
  return { success: true };
}

// ═══════════════════════════════════════════════════════════
// KI-OPTIMIERUNG
// ═══════════════════════════════════════════════════════════

export async function getOptimizedTransportRecommendation(inventoryId: string, toProjectId: string, neededQuantity: number): Promise<TransportRecommendation[]> {
  const supabase = await createClient();
  const { data: warehouseItem } = await supabase.from('inventory').select('*').eq('id', inventoryId).single();
  const recommendations: TransportRecommendation[] = [];

  if (warehouseItem && warehouseItem.quantity >= neededQuantity) {
    recommendations.push({
      type: 'warehouse',
      fromLocation: 'Zentrallager',
      toProjectId,
      inventoryId,
      quantity: neededQuantity,
      reason: 'Direktlieferung aus Zentrallager verfügbar',
      emptyRunSaved: false,
    });
  }

  const { data: siteStocks } = await supabase
    .from('site_stock')
    .select(`*, project:project_id(id, name), inventory:inventory_id(*)`)
    .eq('inventory_id', inventoryId)
    .neq('project_id', toProjectId)
    .gt('quantity', 0);

  if (siteStocks) {
    for (const stock of siteStocks) {
      const availableQty = stock.quantity - stock.reserved_quantity;
      const excessQty = availableQty - stock.min_stock * 2;
      if (excessQty >= neededQuantity) {
        recommendations.push({
          type: 'site_transfer',
          fromLocation: stock.project?.name || 'Baustelle',
          fromProjectId: stock.project_id,
          toProjectId,
          inventoryId,
          quantity: neededQuantity,
          reason: `Überbestand auf ${stock.project?.name}. Leerfahrt wird vermieden.`,
          emptyRunSaved: true,
        });
      }
    }
  }

  return recommendations.sort((a, b) => (b.emptyRunSaved ? 1 : 0) - (a.emptyRunSaved ? 1 : 0));
}

// ═══════════════════════════════════════════════════════════
// STATS
// ═══════════════════════════════════════════════════════════

export async function getInventoryStats(): Promise<InventoryStats> {
  const supabase = await createClient();
  const { data: inventory } = await supabase.from('inventory').select('quantity, min_stock, reorder_point').eq('is_active', true);
  const { data: transports } = await supabase.from('transport_orders').select('id').eq('status', 'pending');

  let criticalCount = 0;
  let warningCount = 0;
  (inventory || []).forEach((item: any) => {
    if (item.quantity <= item.min_stock) criticalCount++;
    else if (item.quantity <= item.reorder_point) warningCount++;
  });

  return {
    totalItems: inventory?.length || 0,
    criticalCount,
    warningCount,
    pendingTransports: transports?.length || 0,
  };
}