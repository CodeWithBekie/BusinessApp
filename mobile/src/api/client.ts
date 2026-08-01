import Constants from 'expo-constants';
import { Platform } from 'react-native';

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

// Exposed for src/documents/downloadAndShare.ts, which needs to fetch a raw PDF response (not
// JSON) with the same base URL/bearer token this client already tracks, rather than duplicating
// that state.
export function getApiBaseUrl(): string {
  return API_BASE_URL;
}

export function getAuthToken(): string | null {
  return authToken;
}

// Server errors come back either as a plain JSON string (Results.BadRequest(ex.Message)) or as
// {"message": "..."} (Results.Json(new { message }, statusCode: ...)) — pull out a clean,
// human-readable string from either shape so screens can show it directly instead of raw JSON.
// Falls back to the raw body text for anything else (HTML error pages, empty bodies, etc.).
function extractErrorDetail(bodyText: string): string {
  if (!bodyText) return '';
  try {
    const parsed = JSON.parse(bodyText);
    if (typeof parsed === 'string') return parsed;
    if (parsed && typeof parsed.message === 'string') return parsed.message;
  } catch {
    // Not JSON — fall through to the raw text.
  }
  return bodyText;
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
    const bodyText = await response.text().catch(() => '');
    const detail = extractErrorDetail(bodyText);
    // Prefer the server's own clean message (e.g. "Invalid email or password.") when there is
    // one — only fall back to the technical "status/statusText" form when the server gave us
    // nothing usable to show a person.
    throw new Error(detail || `API request to ${path} failed: ${response.status} ${response.statusText}`);
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

export interface AssistantResourceSummary {
  uri: string;
  name: string | null;
  title: string | null;
}

// A resolved MCP prompt backing a suggestion chip — title is the chip's display label, message is
// the actual text sent when tapped (they can differ; see AssistantEndpoints.cs's remarks).
export interface AssistantPrompt {
  name: string;
  title: string;
  message: string;
}

export interface ElicitationSchemaProperty {
  type: 'string' | 'number' | 'integer' | 'boolean';
  title?: string;
  description?: string;
  enum?: string[];
}

export interface ElicitationSchema {
  properties: Record<string, ElicitationSchemaProperty>;
  required?: string[];
}

export interface AssistantCompletionResponse {
  values: string[];
}

interface AssistantStreamHandlers {
  onToken: (text: string) => void;
  onDone: (citations: string[], toolsUsed: string[]) => void;
  onError: (message: string) => void;
  onElicitationRequest: (elicitationId: string, message: string, schema: ElicitationSchema) => void;
}

// Not a JSON request/response — Server-Sent Events over a streamed body — so this bypasses the
// generic `request` helper and parses the wire format itself. NOTE: relies on
// `response.body.getReader()`, which the web preview's fetch supports fully; React Native's own
// fetch has historically had inconsistent streaming-body support on Android in particular — not
// solved in Phase 0, same category of gap as the Android API base URL note above.
export async function streamAssistantChat(
  messages: AssistantMessage[],
  handlers: AssistantStreamHandlers,
  attachedResourceUris?: string[],
): Promise<void> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}/api/assistant/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
      },
      body: JSON.stringify({ messages, attachedResourceUris }),
    });
  } catch (err) {
    handlers.onError((err as Error).message);
    return;
  }

  if (response.status === 401) {
    onUnauthorized?.();
  }

  if (!response.ok || !response.body) {
    const bodyText = await response.text().catch(() => '');
    const detail = extractErrorDetail(bodyText);
    handlers.onError(detail || `Assistant request failed: ${response.status} ${response.statusText}`);
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
        else if (payload.type === 'done') handlers.onDone(payload.citations ?? [], payload.toolsUsed ?? []);
        else if (payload.type === 'error') handlers.onError(payload.message);
        else if (payload.type === 'elicitation_request') handlers.onElicitationRequest(payload.elicitationId, payload.message, payload.schema);
      } catch {
        // Ignore a malformed event rather than aborting the whole stream over it.
      }
    }
  }
}

interface CustomerAssistantStreamHandlers {
  onToken: (text: string) => void;
  onDone: (toolsUsed: string[]) => void;
  onError: (message: string) => void;
}

// Customer counterpart to streamAssistantChat, pointed at the marketplace chat endpoint — no
// attachedResourceUris (that's a business-only concept) and no elicitation_request frame (the
// marketplace tool surface has no mid-call structured forms, see CustomerAssistantEndpoints.cs).
export async function streamCustomerAssistantChat(
  messages: AssistantMessage[],
  handlers: CustomerAssistantStreamHandlers,
): Promise<void> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}/api/customer-assistant/chat`, {
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
    const bodyText = await response.text().catch(() => '');
    const detail = extractErrorDetail(bodyText);
    handlers.onError(detail || `Assistant request failed: ${response.status} ${response.statusText}`);
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
        else if (payload.type === 'done') handlers.onDone(payload.toolsUsed ?? []);
        else if (payload.type === 'error') handlers.onError(payload.message);
      } catch {
        // Ignore a malformed event rather than aborting the whole stream over it.
      }
    }
  }
}

export const apiClient = {
  getAssistantResources: () => request<AssistantResourceSummary[]>('/api/assistant/resources'),
  getAssistantCompletions: (uri: string, argument: string, value: string) =>
    request<AssistantCompletionResponse>(
      `/api/assistant/complete?uri=${encodeURIComponent(uri)}&argument=${encodeURIComponent(argument)}&value=${encodeURIComponent(value)}`
    ),
  getAssistantPrompts: () => request<AssistantPrompt[]>('/api/assistant/prompts'),
  getCustomerAssistantPrompts: () => request<AssistantPrompt[]>('/api/customer-assistant/prompts'),

  submitElicitation: (elicitationId: string, action: 'accept' | 'decline' | 'cancel', content?: Record<string, unknown>) =>
    request<void>(`/api/assistant/elicit/${elicitationId}`, { method: 'POST', body: JSON.stringify({ action, content }) }),

  login: (email: string, password: string) =>
    request<AuthResponse>('/api/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }),

  signup: (businessName: string, industryType: string, ownerName: string, email: string, password: string) =>
    request<AuthResponse>('/api/auth/signup', {
      method: 'POST',
      body: JSON.stringify({ businessName, industryType, ownerName, email, password }),
    }),

  acceptStaffInvite: (token: string, password: string) =>
    request<AuthResponse>('/api/auth/accept-invite', { method: 'POST', body: JSON.stringify({ token, password }) }),

  getBusiness: () => request<BusinessDetails>('/api/business'),
  updateBusiness: (input: UpdateBusinessDetailsInput) =>
    request<BusinessDetails>('/api/business', { method: 'PATCH', body: JSON.stringify(input) }),

  getCatalog: (lowStockOnly?: boolean) => request<CatalogItem[]>(`/api/catalog${lowStockOnly ? '?lowStockOnly=true' : ''}`),
  createCatalogItem: (input: CreateCatalogItemInput) =>
    request<CatalogItem>('/api/catalog', { method: 'POST', body: JSON.stringify(input) }),
  updateCatalogItem: (id: string, input: UpdateCatalogItemInput) =>
    request<CatalogItem>(`/api/catalog/${id}`, { method: 'PATCH', body: JSON.stringify(input) }),
  // Anonymous, cache-busted by updatedAt — see DashboardEndpoints.cs's GET /api/catalog/{id}/image
  // comment for why this endpoint has no auth (an <Image> tag can't attach a bearer token).
  getCatalogItemImageUrl: (id: string, updatedAt: string) => `${API_BASE_URL}/api/catalog/${id}/image?v=${encodeURIComponent(updatedAt)}`,
  uploadCatalogItemImage: async (id: string, uri: string, mimeType: string): Promise<CatalogItem> => {
    const formData = new FormData();
    if (Platform.OS === 'web') {
      const blob = await (await fetch(uri)).blob();
      formData.append('file', blob, `photo.${mimeType.split('/')[1] ?? 'jpg'}`);
    } else {
      // React Native's fetch/FormData accepts this {uri, name, type} shape for a file part,
      // not a real Blob/File (there isn't one on native for a local content:// / file:// uri).
      formData.append('file', { uri, name: `photo.${mimeType.split('/')[1] ?? 'jpg'}`, type: mimeType } as unknown as Blob);
    }
    const response = await fetch(`${API_BASE_URL}/api/catalog/${id}/image`, {
      method: 'PUT',
      headers: authToken ? { Authorization: `Bearer ${authToken}` } : undefined,
      body: formData,
    });
    if (!response.ok) {
      const bodyText = await response.text().catch(() => '');
      const detail = extractErrorDetail(bodyText);
      throw new Error(detail || `Failed to upload image: ${response.status} ${response.statusText}`);
    }
    return response.json();
  },
  removeCatalogItemImage: (id: string) => request<CatalogItem>(`/api/catalog/${id}/image`, { method: 'DELETE' }),
  getOrders: (status?: OrderStatus) => request<OrderListItem[]>(`/api/orders${status ? `?status=${status}` : ''}`),
  getOrder: (id: string) => request<OrderDetail>(`/api/orders/${id}`),
  markOrderFulfilled: (id: string) => request<OrderFulfillmentResult>(`/api/orders/${id}/fulfill`, { method: 'POST' }),
  recordOrderPayment: (id: string, provider: OrderPayment['provider'], reference: string, amount: number) =>
    request<OrderDetail>(`/api/orders/${id}/payment`, { method: 'POST', body: JSON.stringify({ provider, reference, amount }) }),
  updateOrderPayment: (id: string, provider: OrderPayment['provider'], amount: number) =>
    request<OrderDetail>(`/api/orders/${id}/payment`, { method: 'PATCH', body: JSON.stringify({ provider, amount }) }),
  payOrderWithEcoCash: (id: string, phoneNumber: string) =>
    request<OrderDetail>(`/api/orders/${id}/pay/ecocash`, { method: 'POST', body: JSON.stringify({ phoneNumber }) }),
  assignDeliveryDriver: (id: string, driverName?: string) =>
    request<DeliveryAssignmentResult>(`/api/orders/${id}/delivery/driver`, { method: 'POST', body: JSON.stringify({ driverName: driverName ?? null }) }),
  updateDeliveryStatus: (id: string, status: DeliveryInfo['status']) =>
    request<DeliveryStatusResult>(`/api/orders/${id}/delivery/status`, { method: 'PATCH', body: JSON.stringify({ status }) }),
  getApprovals: () => request<PendingApproval[]>('/api/approvals'),
  getSalesSummary: (range?: SalesRange, from?: string, to?: string) => {
    const params = new URLSearchParams();
    if (from && to) {
      params.set('from', from);
      params.set('to', to);
    } else if (range) {
      params.set('range', range);
    }
    const qs = params.toString();
    return request<SalesSummary>(`/api/sales/summary${qs ? `?${qs}` : ''}`);
  },
  getCustomers: (search?: string) => request<Customer[]>(`/api/customers${search ? `?search=${encodeURIComponent(search)}` : ''}`),
  recordPosSale: (items: PosSaleLineItem[], paymentMethod: PosPaymentMethod, customer?: PosSaleCustomer, amountTendered?: number) =>
    request<PosSaleResult>('/api/orders/pos-sale', {
      method: 'POST',
      body: JSON.stringify({
        items,
        paymentMethod,
        customerId: customer?.id ?? null,
        customerWhatsAppNumber: customer?.whatsAppNumber || null,
        customerName: customer?.name || null,
        amountTendered: amountTendered ?? null,
      }),
    }),
  createInvoice: (customerId: string) => request<InvoiceResult>(`/api/orders/${customerId}/invoice`, { method: 'POST' }),
  createQuotation: (items: PosSaleLineItem[], customer?: PosSaleCustomer) =>
    request<QuotationResult>('/api/orders/quotation', {
      method: 'POST',
      body: JSON.stringify({
        items,
        customerId: customer?.id ?? null,
        customerWhatsAppNumber: customer?.whatsAppNumber || null,
        customerName: customer?.name || null,
      }),
    }),

  decideApproval: (id: string, decision: 'approve' | 'reject') =>
    request<ApprovalDecisionResult>(`/api/approvals/${id}/decision`, {
      method: 'POST',
      body: JSON.stringify({ decision }),
    }),
  getPaymentProofImage: (paymentId: string) => request<{ dataUri: string }>(`/api/payments/${paymentId}/proof-image`),

  getSuppliers: (search?: string) => request<Supplier[]>(`/api/suppliers${search ? `?search=${encodeURIComponent(search)}` : ''}`),
  createSupplier: (input: CreateSupplierInput) =>
    request<Supplier>('/api/suppliers', { method: 'POST', body: JSON.stringify(input) }),
  updateSupplier: (id: string, input: UpdateSupplierInput) =>
    request<Supplier>(`/api/suppliers/${id}`, { method: 'PATCH', body: JSON.stringify(input) }),

  getPurchaseOrders: (status?: PurchaseOrderStatus) =>
    request<PurchaseOrderSummary[]>(`/api/purchase-orders${status ? `?status=${status}` : ''}`),
  getPurchaseOrder: (id: string) => request<PurchaseOrderDetail>(`/api/purchase-orders/${id}`),
  createPurchaseOrder: (supplierId: string, items: PurchaseOrderLineItem[], currency?: string, expectedDeliveryDate?: string) =>
    request<PurchaseOrderDetail>('/api/purchase-orders', { method: 'POST', body: JSON.stringify({ supplierId, items, currency, expectedDeliveryDate }) }),
  receivePurchaseOrder: (id: string, linePrices?: ReceivedLinePrice[]) =>
    request<PurchaseOrderDetail>(`/api/purchase-orders/${id}/receive`, {
      method: 'POST',
      body: linePrices ? JSON.stringify({ linePrices }) : undefined,
    }),
  recordSupplierPayment: (id: string, amount: number, provider: PosPaymentMethod) =>
    request<PurchaseOrderDetail>(`/api/purchase-orders/${id}/payment`, {
      method: 'POST',
      body: JSON.stringify({ amount, provider }),
    }),

  getExpenses: (from?: string, to?: string) => {
    const params = new URLSearchParams();
    if (from) params.set('from', from);
    if (to) params.set('to', to);
    const qs = params.toString();
    return request<ExpenseSummary[]>(`/api/expenses${qs ? `?${qs}` : ''}`);
  },
  createExpense: (input: CreateExpenseInput) =>
    request<ExpenseSummary>('/api/expenses', { method: 'POST', body: JSON.stringify(input) }),
  deleteExpense: (id: string) => request<void>(`/api/expenses/${id}`, { method: 'DELETE' }),

  getCashUp: (date?: string) => request<CashUpResult>(`/api/accounting/cash-up${date ? `?date=${date}` : ''}`),
  getProfitAndLoss: (range?: SalesRange, from?: string, to?: string) => {
    const params = new URLSearchParams();
    if (from && to) {
      params.set('from', from);
      params.set('to', to);
    } else if (range) {
      params.set('range', range);
    }
    const qs = params.toString();
    return request<ProfitAndLossResult>(`/api/accounting/profit-and-loss${qs ? `?${qs}` : ''}`);
  },
  getCashFlow: (range?: SalesRange, from?: string, to?: string) => {
    const params = new URLSearchParams();
    if (from && to) {
      params.set('from', from);
      params.set('to', to);
    } else if (range) {
      params.set('range', range);
    }
    const qs = params.toString();
    return request<CashFlowResult>(`/api/accounting/cash-flow${qs ? `?${qs}` : ''}`);
  },
  getTrialBalance: (asOf?: string) => request<TrialBalanceResult>(`/api/accounting/trial-balance${asOf ? `?asOf=${asOf}` : ''}`),
  getGeneralLedger: (accountCode?: string, from?: string, to?: string) => {
    const params = new URLSearchParams();
    if (accountCode) params.set('accountCode', accountCode);
    if (from) params.set('from', from);
    if (to) params.set('to', to);
    const qs = params.toString();
    return request<GeneralLedgerResult>(`/api/accounting/general-ledger${qs ? `?${qs}` : ''}`);
  },

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

  connectEcoCash: (input: {
    username: string;
    password: string;
    merchantCode: string;
    merchantPin: string;
    merchantNumber: string;
    merchantName: string;
    superMerchantName: string;
    countryCode?: string;
    terminalId?: string;
    location?: string;
  }) =>
    request<EcoCashConnection>('/api/payments/connect-ecocash', {
      method: 'POST',
      body: JSON.stringify(input),
    }),

  setBusinessVisibility: (isPubliclyListed: boolean) =>
    request<{ isPubliclyListed: boolean }>('/api/business/visibility', { method: 'PATCH', body: JSON.stringify({ isPubliclyListed }) }),

  customerLogin: (email: string, password: string) =>
    request<CustomerAuthResponse>('/api/customer/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }),
  customerSignup: (email: string, password: string, name?: string, phoneNumber?: string) =>
    request<CustomerAuthResponse>('/api/customer/auth/signup', {
      method: 'POST',
      body: JSON.stringify({ email, password, name, phoneNumber }),
    }),

  getMarketplaceBusinesses: () => request<PublicBusinessSummary[]>('/api/marketplace/businesses'),
  getMarketplaceBusiness: (businessId: string) => request<PublicBusinessSummary>(`/api/marketplace/businesses/${businessId}`),
  getMarketplaceCatalog: (businessId: string) => request<CatalogItem[]>(`/api/marketplace/businesses/${businessId}/catalog`),
  placeMarketplaceOrder: (businessId: string, items: PosSaleLineItem[]) =>
    request<MarketplaceOrderResult>(`/api/marketplace/businesses/${businessId}/orders`, {
      method: 'POST',
      body: JSON.stringify({ items }),
    }),
  getMyMarketplaceOrders: () => request<MarketplaceOrderSummary[]>('/api/marketplace/my-orders'),
  getMyMarketplaceOrder: (orderId: string) => request<MarketplaceOrderDetail>(`/api/marketplace/orders/${orderId}`),
  cancelMyOrder: (orderId: string) => request<{ orderId: string; status: OrderStatus }>(`/api/marketplace/orders/${orderId}/cancel`, { method: 'POST' }),
  requestMyOrderCancellation: (orderId: string, reason?: string) =>
    request(`/api/marketplace/orders/${orderId}/request-cancellation`, { method: 'POST', body: JSON.stringify({ reason }) }),
  payWithEcoCash: (orderId: string, phoneNumber: string) =>
    request<EcoCashPaymentResult>(`/api/marketplace/orders/${orderId}/pay/ecocash`, { method: 'POST', body: JSON.stringify({ phoneNumber }) }),
  submitPaymentProof: async (orderId: string, uri: string, mimeType: string): Promise<void> => {
    const formData = new FormData();
    if (Platform.OS === 'web') {
      const blob = await (await fetch(uri)).blob();
      formData.append('file', blob, `proof.${mimeType.split('/')[1] ?? 'jpg'}`);
    } else {
      formData.append('file', { uri, name: `proof.${mimeType.split('/')[1] ?? 'jpg'}`, type: mimeType } as unknown as Blob);
    }
    const response = await fetch(`${API_BASE_URL}/api/marketplace/orders/${orderId}/payment-proof`, {
      method: 'PUT',
      headers: authToken ? { Authorization: `Bearer ${authToken}` } : undefined,
      body: formData,
    });
    if (!response.ok) {
      const bodyText = await response.text().catch(() => '');
      const detail = extractErrorDetail(bodyText);
      throw new Error(detail || `API request to /api/marketplace/orders/${orderId}/payment-proof failed: ${response.status} ${response.statusText}`);
    }
  },

  getStaff: () => request<StaffSummary[]>('/api/staff'),
  inviteStaff: (input: InviteStaffInput) =>
    request<StaffInviteResult>('/api/staff', { method: 'POST', body: JSON.stringify(input) }),
  resendStaffInvite: (id: string) => request<StaffInviteResult>(`/api/staff/${id}/resend-invite`, { method: 'POST' }),
  updateStaff: (id: string, input: UpdateStaffInput) =>
    request<StaffSummary>(`/api/staff/${id}`, { method: 'PATCH', body: JSON.stringify(input) }),
};

export interface AuthResponse {
  token: string;
  businessId: string;
  businessUserId: string;
  role: string;
}

export interface CustomerAuthResponse {
  token: string;
  customerAccountId: string;
  email: string;
  name: string | null;
}

export interface PublicBusinessSummary {
  id: string;
  name: string;
  industryType: string;
  currency: string;
  vatRate: number;
}

export interface MarketplaceOrderResult {
  orderId: string;
  businessId: string;
  businessName: string;
  totalAmount: number;
  vatAmount: number;
  currency: string;
  paymentReference: string;
  paymentInstructions: string | null;
  lineItems: OrderLineItem[];
}

export interface MarketplaceOrderSummary {
  orderId: string;
  businessId: string;
  businessName: string;
  status: OrderStatus;
  totalAmount: number;
  vatAmount: number;
  currency: string;
  itemCount: number;
  createdAt: string;
  updatedAt: string;
}

// CanCancelDirectly/CanRequestCancellation/IsPaynowConnected are computed server-side so this
// screen doesn't have to re-derive the same status logic as the server.
export interface MarketplaceOrderDetail {
  orderId: string;
  businessId: string;
  businessName: string;
  status: OrderStatus;
  totalAmount: number;
  vatAmount: number;
  invoiceNumber: number | null;
  currency: string;
  items: OrderLineItem[];
  payment: OrderPayment | null;
  delivery: DeliveryInfo | null;
  canCancelDirectly: boolean;
  canRequestCancellation: boolean;
  isPaynowConnected: boolean;
  createdAt: string;
  updatedAt: string;
}

// Null when no Delivery row exists yet for this order (the common case — most orders never get one).
export interface DeliveryInfo {
  status: 'Pending' | 'Assigned' | 'InTransit' | 'Delivered';
  driverName: string | null;
}

export interface DeliveryAssignmentResult {
  deliveryId: string;
  driverName: string | null;
  status: DeliveryInfo['status'];
}

export interface DeliveryStatusResult {
  orderId: string;
  status: DeliveryInfo['status'];
  driverName: string | null;
}

export interface EcoCashPaymentResult {
  paymentReference: string;
  instructions: string | null;
  pollUrl: string | null;
}

export type BusinessUserRole = 'Owner' | 'Manager' | 'Cashier' | 'InventoryClerk' | 'Accountant';

export interface StaffSummary {
  id: string;
  name: string;
  email: string;
  role: BusinessUserRole;
  isActive: boolean;
  status: 'Active' | 'Deactivated' | 'Pending' | 'Expired';
  createdAt: string;
}

export interface InviteStaffInput {
  name: string;
  email: string;
  role: BusinessUserRole;
}

// No password here — the invitee sets their own via apiClient.acceptStaffInvite. inviteToken/
// inviteLink are only ever returned from invite/resend-invite, never from getStaff.
export interface StaffInviteResult {
  staff: StaffSummary;
  inviteToken: string;
  inviteLink: string;
  expiresAt: string;
}

export interface UpdateStaffInput {
  role?: BusinessUserRole;
  isActive?: boolean;
}

export interface BusinessDetails {
  name: string;
  tin: string | null;
  vatNumber: string | null;
  address: string | null;
  email: string | null;
  phone: string | null;
  vatRate: number;
  deviceSerialNumber: string | null;
  fiscalDeviceId: string | null;
}

export interface UpdateBusinessDetailsInput {
  tin?: string | null;
  vatNumber?: string | null;
  address?: string | null;
  email?: string | null;
  phone?: string | null;
  vatRate: number;
  deviceSerialNumber?: string | null;
  fiscalDeviceId?: string | null;
}

export type CatalogItemType = 'Stock' | 'TimeBased' | 'Quote';

export interface CatalogItem {
  id: string;
  name: string;
  code: string | null;
  itemType: CatalogItemType;
  price: number;
  currency: string;
  stockQuantity: number | null;
  unit: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
  hasImage: boolean;
  lowStockThreshold: number;
  isLowStock: boolean;
}

export interface CreateCatalogItemInput {
  name: string;
  itemType: CatalogItemType;
  price: number;
  currency?: string;
  stockQuantity?: number | null;
  unit?: string;
  code?: string | null;
  lowStockThreshold?: number;
}

export interface UpdateCatalogItemInput {
  name?: string;
  price?: number;
  currency?: string;
  stockQuantity?: number | null;
  unit?: string;
  active?: boolean;
  code?: string | null;
  lowStockThreshold?: number;
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
  code: string;
  quantity: number;
  unitPrice: number;
  subtotal: number;
  vatAmount: number;
}

export interface OrderPayment {
  provider: 'EcoCash' | 'Bank' | 'Other' | 'Cash';
  providerReference: string;
  status: 'Pending' | 'Confirmed' | 'Failed';
  amount: number;
  confirmedAt: string | null;
  amountTendered: number | null;
  changeDue: number | null;
}

export interface InvoiceResult {
  orderId: string;
  totalAmount: number;
  vatAmount: number;
  currency: string;
  paymentReference: string;
  paymentInstructions: string | null;
  lineItems: OrderLineItem[];
}

export interface OrderDetail {
  id: string;
  customerId: string;
  customerWhatsAppNumber: string;
  customerName: string | null;
  status: OrderStatus;
  totalAmount: number;
  vatAmount: number;
  invoiceNumber: number | null;
  currency: string;
  items: OrderLineItem[];
  payment: OrderPayment | null;
  delivery: DeliveryInfo | null;
  createdAt: string;
  updatedAt: string;
}

export interface OrderFulfillmentResult {
  orderId: string;
  status: OrderStatus;
}

export type PosPaymentMethod = 'Cash' | 'EcoCash' | 'Bank' | 'Other';

export interface PosSaleLineItem {
  catalogItemId: string;
  quantity: number;
}

// Pass `id` to attach an existing customer (from getCustomers), or whatsAppNumber (with an
// optional name) to record a new/repeat customer by phone. Omit both for an anonymous walk-in sale.
export interface PosSaleCustomer {
  id?: string;
  whatsAppNumber?: string;
  name?: string;
}

export interface PosSaleResult {
  orderId: string;
  totalAmount: number;
  vatAmount: number;
  currency: string;
  paymentReference: string;
  lineItems: OrderLineItem[];
  customerId: string;
  customerWhatsAppNumber: string;
  customerName: string | null;
  amountTendered: number | null;
  changeDue: number | null;
}

export interface QuotationResult {
  orderId: string;
  totalAmount: number;
  vatAmount: number;
  currency: string;
  lineItems: OrderLineItem[];
  customerId: string;
  customerWhatsAppNumber: string;
  customerName: string | null;
}

export interface Customer {
  id: string;
  whatsAppNumber: string;
  name: string | null;
  orderCount: number;
  createdAt: string;
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
  range: SalesRange | 'custom';
  rangeStart: string | null;
  rangeEnd: string | null;
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

export interface EcoCashConnection {
  id: string;
  businessId: string;
  username: string;
  merchantCode: string;
  merchantNumber: string;
  merchantName: string;
  superMerchantName: string;
  countryCode: string;
  terminalId: string;
  location: string;
  createdAt: string;
}

export type SupplierCategory = 'Materials' | 'Equipment' | 'Services' | 'Logistics' | 'Utilities' | 'Other';

export interface Supplier {
  id: string;
  name: string;
  contactPhone: string | null;
  email: string | null;
  notes: string | null;
  category: SupplierCategory | null;
  rating: number | null;
  active: boolean;
  createdAt: string;
}

export interface CreateSupplierInput {
  name: string;
  contactPhone?: string;
  email?: string;
  notes?: string;
  category?: SupplierCategory;
  rating?: number;
}

export interface UpdateSupplierInput {
  name?: string;
  contactPhone?: string;
  email?: string;
  notes?: string;
  category?: SupplierCategory;
  rating?: number;
  active?: boolean;
}

export type PurchaseOrderStatus = 'Draft' | 'Ordered' | 'Received' | 'Cancelled';

export interface PurchaseOrderLineItem {
  catalogItemId?: string | null;
  newItemName?: string | null;
  newItemType?: CatalogItemType | null;
  newItemUnit?: string | null;
  quantity: number;
  unitCost: number;
}

export interface PurchaseOrderItemSummary {
  id: string;
  catalogItemId: string | null;
  name: string;
  isNewItem: boolean;
  currentPrice: number | null;
  quantity: number;
  unitCost: number;
  subtotal: number;
}

export interface ReceivedLinePrice {
  purchaseOrderItemId: string;
  salePrice?: number | null;
}

export interface PurchaseOrderSummary {
  id: string;
  supplierId: string;
  supplierName: string;
  status: PurchaseOrderStatus;
  totalAmount: number;
  amountPaid: number;
  amountOwed: number;
  currency: string;
  itemCount: number;
  createdAt: string;
  updatedAt: string;
  receivedAt: string | null;
  expectedDeliveryDate: string | null;
}

export interface PurchaseOrderDetail {
  id: string;
  supplierId: string;
  supplierName: string;
  status: PurchaseOrderStatus;
  totalAmount: number;
  amountPaid: number;
  amountOwed: number;
  currency: string;
  items: PurchaseOrderItemSummary[];
  createdAt: string;
  updatedAt: string;
  receivedAt: string | null;
  expectedDeliveryDate: string | null;
}

export type ExpenseCategory = 'Rent' | 'Utilities' | 'Wages' | 'Supplies' | 'Transport' | 'Marketing' | 'Other';

export interface ExpenseSummary {
  id: string;
  category: ExpenseCategory;
  description: string;
  amount: number;
  currency: string;
  paymentMethod: PosPaymentMethod;
  incurredAt: string;
  createdAt: string;
}

export interface CreateExpenseInput {
  category: ExpenseCategory;
  description: string;
  amount: number;
  currency?: string | null;
  paymentMethod: PosPaymentMethod;
  incurredAt?: string | null;
}

export interface CashUpProviderTotal {
  provider: PosPaymentMethod;
  count: number;
  totalAmount: number;
}

export interface CashUpCurrencyGroup {
  currency: string;
  salesByProvider: CashUpProviderTotal[];
  expensesByProvider: CashUpProviderTotal[];
  netCashMovement: number;
}

export interface CashUpResult {
  date: string;
  currencies: CashUpCurrencyGroup[];
}

export interface ProfitAndLossCurrencyBreakdown {
  currency: string;
  revenue: number;
  costOfGoodsSold: number;
  grossProfit: number;
  expenses: number;
  netProfit: number;
}

export interface ProfitAndLossResult {
  range: string;
  rangeStart: string | null;
  rangeEnd: string | null;
  currencies: ProfitAndLossCurrencyBreakdown[];
}

export interface CashFlowBucket {
  periodStart: string;
  cashIn: number;
  cashOut: number;
  netChange: number;
}

export interface CashFlowBreakdownItem {
  sourceType: string;
  amount: number;
}

export interface CashFlowCurrencyGroup {
  currency: string;
  buckets: CashFlowBucket[];
  inflowBreakdown: CashFlowBreakdownItem[];
  outflowBreakdown: CashFlowBreakdownItem[];
  netCashFlow: number;
}

export interface CashFlowResult {
  range: string;
  rangeStart: string | null;
  rangeEnd: string | null;
  currencies: CashFlowCurrencyGroup[];
}

export type AccountType = 'Asset' | 'Liability' | 'Equity' | 'Revenue' | 'Expense';

export interface TrialBalanceRow {
  accountCode: string;
  accountName: string;
  accountType: AccountType;
  totalDebit: number;
  totalCredit: number;
  balance: number;
}

export interface TrialBalanceResult {
  asOf: string;
  rows: TrialBalanceRow[];
  totalDebits: number;
  totalCredits: number;
}

export interface GeneralLedgerLine {
  journalEntryId: string;
  postedAt: string;
  description: string;
  sourceType: string;
  sourceId: string;
  accountCode: string;
  accountName: string;
  debit: number;
  credit: number;
}

export interface GeneralLedgerResult {
  accountCode: string | null;
  from: string | null;
  to: string | null;
  lines: GeneralLedgerLine[];
}
