import Constants from 'expo-constants';

// Points at the local AiBusinessPlatform.Api dev server (see server/src/AiBusinessPlatform.Api
// Properties/launchSettings.json for the port). NOTE: `localhost` only resolves from a web
// preview or iOS simulator — Android emulator needs http://10.0.2.2:5151, and a physical device
// needs your machine's LAN IP. Not solved in Phase 0; override apiBaseUrl in app.json per target.
const API_BASE_URL = (Constants.expoConfig?.extra?.apiBaseUrl as string) ?? 'http://localhost:5151';

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers: { 'Content-Type': 'application/json', ...init?.headers },
    ...init,
  });

  if (!response.ok) {
    throw new Error(`API request to ${path} failed: ${response.status} ${response.statusText}`);
  }

  return response.json() as Promise<T>;
}

export const apiClient = {
  getCatalog: () => request<CatalogItem[]>('/api/catalog'),
  getOrders: () => request<Order[]>('/api/orders'),
  getApprovals: () => request<PendingApproval[]>('/api/approvals'),
  getSalesSummary: () => request<SalesSummary>('/api/sales/summary'),
};

export interface CatalogItem {
  id: string;
  name: string;
  price: number;
  currency: string;
  stockQuantity: number | null;
  active: boolean;
}

export interface Order {
  id: string;
  status: string;
  totalAmount: number;
  currency: string;
}

export interface PendingApproval {
  id: string;
  actionType: string;
  status: string;
}

export interface SalesSummary {
  totalOrders: number;
  totalAmount: number;
}
