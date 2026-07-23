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

export interface AssistantMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface AssistantStreamHandlers {
  onToken: (text: string) => void;
  onDone: (citations: string[]) => void;
  onError: (message: string) => void;
}

// Not a JSON request/response — Server-Sent Events over a streamed body — so this bypasses the
// generic `request` helper and parses the wire format itself. NOTE: relies on
// `response.body.getReader()`, which the web preview's fetch supports fully; React Native's own
// fetch has historically had inconsistent streaming-body support on Android in particular — not
// solved in Phase 0, same category of gap as the Android API base URL note above.
export async function streamAssistantChat(messages: AssistantMessage[], handlers: AssistantStreamHandlers): Promise<void> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}/api/assistant/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
      },
      body: JSON.stringify({ messages }),
    });
  } catch (err) {
    handlers.onError((err as Error).message);
    return;
  }

  if (response.status === 401) {
    onUnauthorized?.();
  }

  if (!response.ok || !response.body) {
    const body = await response.text().catch(() => '');
    handlers.onError(`Assistant request failed: ${response.status} ${response.statusText}${body ? ` — ${body}` : ''}`);
    return;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    let separatorIndex: number;
    while ((separatorIndex = buffer.indexOf('\n\n')) !== -1) {
      const rawEvent = buffer.slice(0, separatorIndex);
      buffer = buffer.slice(separatorIndex + 2);
      const dataLine = rawEvent.split('\n').find((line) => line.startsWith('data: '));
      if (!dataLine) continue;

      try {
        const payload = JSON.parse(dataLine.slice('data: '.length));
        if (payload.type === 'token') handlers.onToken(payload.text);
        else if (payload.type === 'done') handlers.onDone(payload.citations ?? []);
        else if (payload.type === 'error') handlers.onError(payload.message);
      } catch {
        // Ignore a malformed event rather than aborting the whole stream over it.
      }
    }
  }
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
  createCatalogItem: (input: CreateCatalogItemInput) =>
    request<CatalogItem>('/api/catalog', { method: 'POST', body: JSON.stringify(input) }),
  updateCatalogItem: (id: string, input: UpdateCatalogItemInput) =>
    request<CatalogItem>(`/api/catalog/${id}`, { method: 'PATCH', body: JSON.stringify(input) }),
  getOrders: (status?: OrderStatus) => request<OrderListItem[]>(`/api/orders${status ? `?status=${status}` : ''}`),
  getOrder: (id: string) => request<OrderDetail>(`/api/orders/${id}`),
  markOrderFulfilled: (id: string) => request<OrderFulfillmentResult>(`/api/orders/${id}/fulfill`, { method: 'POST' }),
  getApprovals: () => request<PendingApproval[]>('/api/approvals'),
  getSalesSummary: (range?: SalesRange) => request<SalesSummary>(`/api/sales/summary${range ? `?range=${range}` : ''}`),

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

  connectPaynow: (integrationId: string, integrationKey: string, notificationEmail: string) =>
    request<PaynowConnection>('/api/payments/connect', {
      method: 'POST',
      body: JSON.stringify({ integrationId, integrationKey, notificationEmail }),
    }),
};

export interface AuthResponse {
  token: string;
  businessId: string;
  businessUserId: string;
  role: string;
}

export type CatalogItemType = 'Stock' | 'TimeBased' | 'Quote';

export interface CatalogItem {
  id: string;
  name: string;
  itemType: CatalogItemType;
  price: number;
  currency: string;
  stockQuantity: number | null;
  unit: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateCatalogItemInput {
  name: string;
  itemType: CatalogItemType;
  price: number;
  currency?: string;
  stockQuantity?: number | null;
  unit?: string;
}

export interface UpdateCatalogItemInput {
  name?: string;
  price?: number;
  currency?: string;
  stockQuantity?: number | null;
  unit?: string;
  active?: boolean;
}

export type OrderStatus = 'Quoted' | 'Invoiced' | 'Paid' | 'Fulfilled' | 'Cancelled';

export interface OrderListItem {
  id: string;
  customerId: string;
  customerWhatsAppNumber: string;
  customerName: string | null;
  status: OrderStatus;
  totalAmount: number;
  currency: string;
  itemCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface OrderLineItem {
  catalogItemId: string;
  name: string;
  quantity: number;
  unitPrice: number;
  subtotal: number;
}

export interface OrderPayment {
  provider: 'EcoCash' | 'OneMoney' | 'Other';
  providerReference: string;
  status: 'Pending' | 'Confirmed' | 'Failed';
  amount: number;
  confirmedAt: string | null;
}

export interface OrderDetail {
  id: string;
  customerId: string;
  customerWhatsAppNumber: string;
  customerName: string | null;
  status: OrderStatus;
  totalAmount: number;
  currency: string;
  items: OrderLineItem[];
  payment: OrderPayment | null;
  createdAt: string;
  updatedAt: string;
}

export interface OrderFulfillmentResult {
  orderId: string;
  status: OrderStatus;
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

export type SalesRange = 'today' | '7d' | '30d' | 'all';

export interface SalesCurrencyTotal {
  currency: string;
  orderCount: number;
  totalAmount: number;
}

export interface SalesTrendPoint {
  date: string;
  orderCount: number;
  totalAmount: number;
}

export interface SalesTopItem {
  catalogItemId: string;
  name: string;
  quantitySold: number;
  revenue: number;
}

export interface SalesSummary {
  range: SalesRange;
  rangeStart: string | null;
  totalOrders: number;
  totals: SalesCurrencyTotal[];
  trend: SalesTrendPoint[];
  topItems: SalesTopItem[];
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

export interface PaynowConnection {
  id: string;
  businessId: string;
  integrationId: string;
  notificationEmail: string;
  createdAt: string;
}
