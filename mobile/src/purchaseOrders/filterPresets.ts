import AsyncStorage from '@react-native-async-storage/async-storage';

import { PurchaseOrderStatus } from '@/src/api/client';

// Deliberately its own key prefix, not src/offline/cache.ts's "cache:" prefix — presets are a
// device UI preference, not tenant session data, so they should survive clearAllCache() on logout.
const PRESETS_KEY = 'presets:purchaseOrders';

export interface PurchaseOrderFilterPreset {
  name: string;
  status: PurchaseOrderStatus | 'All';
  search: string;
}

export async function getPresets(): Promise<PurchaseOrderFilterPreset[]> {
  const raw = await AsyncStorage.getItem(PRESETS_KEY);
  if (!raw) return [];
  try {
    return JSON.parse(raw) as PurchaseOrderFilterPreset[];
  } catch {
    return [];
  }
}

export async function savePreset(preset: PurchaseOrderFilterPreset): Promise<PurchaseOrderFilterPreset[]> {
  const existing = await getPresets();
  const next = [...existing.filter((p) => p.name !== preset.name), preset];
  await AsyncStorage.setItem(PRESETS_KEY, JSON.stringify(next));
  return next;
}

export async function deletePreset(name: string): Promise<PurchaseOrderFilterPreset[]> {
  const existing = await getPresets();
  const next = existing.filter((p) => p.name !== name);
  await AsyncStorage.setItem(PRESETS_KEY, JSON.stringify(next));
  return next;
}
