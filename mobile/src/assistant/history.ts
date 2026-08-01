import { getCached, setCached } from '@/src/offline/cache';

// "cache:"-prefixed keys (getCached/setCached) are already wiped on logout by AuthContext's
// clearAllCache() — reusing that module means one business user's chat history can never leak to
// the next login on a shared device, with no new logout wiring needed.
export type AssistantHistoryKey = 'assistantConversations:owner' | 'assistantConversations:customer';

export interface ChatConversation<T> {
  id: string;
  title: string;
  messages: T[];
  updatedAt: string;
}

// Keeps a single conversation from growing AsyncStorage unbounded, and from blowing up the backend
// request body — POST /api/assistant/chat resends the entire message array on every turn.
const MAX_MESSAGES = 50;

// Caps the number of saved conversations per role so the list itself can't grow unbounded.
const MAX_CONVERSATIONS = 20;

export function newConversationId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function deriveConversationTitle(firstUserMessageContent: string): string {
  const collapsed = firstUserMessageContent.trim().replace(/\s+/g, ' ');
  if (!collapsed) return 'New conversation';
  return collapsed.length > 48 ? `${collapsed.slice(0, 48)}…` : collapsed;
}

export async function listConversations<T>(key: AssistantHistoryKey): Promise<ChatConversation<T>[]> {
  const stored = await getCached<ChatConversation<T>[]>(key);
  return stored ?? [];
}

export async function getConversation<T>(key: AssistantHistoryKey, id: string): Promise<ChatConversation<T> | null> {
  const all = await listConversations<T>(key);
  return all.find((c) => c.id === id) ?? null;
}

// Upserts by id and moves it to the front (most-recently-active first).
export async function saveConversation<T>(key: AssistantHistoryKey, conversation: ChatConversation<T>): Promise<void> {
  const all = await listConversations<T>(key);
  const trimmedMessages =
    conversation.messages.length > MAX_MESSAGES ? conversation.messages.slice(conversation.messages.length - MAX_MESSAGES) : conversation.messages;
  const next = [{ ...conversation, messages: trimmedMessages }, ...all.filter((c) => c.id !== conversation.id)].slice(0, MAX_CONVERSATIONS);
  await setCached(key, next);
}

export async function deleteConversation(key: AssistantHistoryKey, id: string): Promise<void> {
  const all = await listConversations(key);
  await setCached(
    key,
    all.filter((c) => c.id !== id)
  );
}
