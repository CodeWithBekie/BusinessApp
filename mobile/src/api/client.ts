import Constants from 'expo-constants';

// Points at the local AiBusinessPlatform.Api dev server (see server/src/AiBusinessPlatform.Api
// Properties/launchSettings.json for the port). NOTE: `localhost` only resolves from a web
// preview or iOS simulator — Android emulator needs http://10.0.2.2:5151, and a physical device
// needs your machine's LAN IP. Not solved in Phase 0; override apiBaseUrl in app.json per target.
const API_BASE_URL = (Constants.expoConfig?.extra?.apiBaseUrl as string) ?? 'http://localhost:5151';

// Set by AuthProvider (src/auth/AuthContext.tsx) — the simplest way to thread the current session
// into this plain-function client without rewriting every screen to pass a token through.
let authToken: string | null = null;
let onUnauthorized: (() => void) | null = null;

export function setAuthToken(token: string | null) {
  authToken = token;
}

export function setUnauthorizedHandler(handler: (() => void) | null) {
  onUnauthorized = handler;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
      ...init?.headers,
    },
    ...init,
  });

  if (response.status === 401) {
    onUnauthorized?.();
  }

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`API request to ${path} failed: ${response.status} ${response.statusText}${body ? ` — ${body}` : ''}`);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json() as Promise<T>;
}

export const apiClient = {
  login: (email: string, password: string) =>
    request<AuthResponse>('/api/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }),

  signup: (businessName: string, industryType: string, ownerName: string, email: string, password: string) =>
    request<AuthResponse>('/api/auth/signup', {
      method: 'POST',
      body: JSON.stringify({ businessName, industryType, ownerName, email, password }),
    }),

  getCatalog: () => request<CatalogItem[]>('/api/catalog'),
  getOrders: () => request<Order[]>('/api/orders'),
  getApprovals: () => request<PendingApproval[]>('/api/approvals'),
  getSalesSummary: () => request<SalesSummary>('/api/sales/summary'),

  decideApproval: (id: string, decision: 'approve' | 'reject') =>
    request<ApprovalDecisionResult>(`/api/approvals/${id}/decision`, {
      method: 'POST',
      body: JSON.stringify({ decision }),
    }),

  ingestDocument: (title: string, content: string, sourceType?: string) =>
    request<IngestDocumentResult>('/api/documents', {
      method: 'POST',
      body: JSON.stringify({ title, content, sourceType }),
    }),

  connectWhatsApp: (wabaId: string, phoneNumberId: string, systemUserToken: string) =>
    request<WhatsAppConnection>('/api/whatsapp/connect', {
      method: 'POST',
      body: JSON.stringify({ wabaId, phoneNumberId, systemUserToken }),
    }),
};

export interface AuthResponse {
  token: string;
  businessId: string;
  businessUserId: string;
  role: string;
}

export interface CatalogItem {
  id: string;
  name: string;
  itemType: 'Stock' | 'TimeBased' | 'Quote';
  price: number;
  currency: string;
  stockQuantity: number | null;
  active: boolean;
}

export interface Order {
  id: string;
  status: 'Quoted' | 'Invoiced' | 'Paid' | 'Fulfilled' | 'Cancelled';
  totalAmount: number;
  currency: string;
}

export interface PendingApproval {
  id: string;
  actionType: string;
  detailsJson: string;
  status: 'Pending' | 'Approved' | 'Rejected';
  requestedAt: string;
  decidedAt: string | null;
  decidedBy: string | null;
}

export interface ApprovalDecisionResult {
  pendingApprovalId: string;
  actionType: string;
  detailsJson: string;
  status: 'Pending' | 'Approved' | 'Rejected';
  wasAlreadyDecided: boolean;
}

export interface SalesSummary {
  totalOrders: number;
  totalAmount: number;
}

export interface IngestDocumentResult {
  documentId: string;
  chunkCount: number;
}

export interface WhatsAppConnection {
  id: string;
  businessId: string;
  wabaId: string;
  phoneNumberId: string;
  status: 'Pending' | 'Active' | 'Disabled';
  createdAt: string;
}
