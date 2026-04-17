import { getStatus } from './api';
import { generateUUID } from './uuid';

/** Same key as legacy `web/src/lib/ws.ts` — single source for gateway chat tab session id. */
export const GATEWAY_CHAT_SESSION_STORAGE_KEY = 'zeroclaw_session_id';

let preserveSessionPolicyPromise: Promise<boolean> | null = null;

function fetchPreserveSessionOnNavigation(): Promise<boolean> {
  if (!preserveSessionPolicyPromise) {
    preserveSessionPolicyPromise = getStatus()
      .then((s) => s.web_chat_preserve_session_on_navigation === true)
      .catch(() => false);
  }
  return preserveSessionPolicyPromise;
}

let documentSessionPrepared = false;

/**
 * Clears the persisted gateway WebSocket session id for this tab.
 * Used by automatic fresh-navigation prep and by manual "new session" flows.
 */
export function clearGatewayChatSessionId(): void {
  sessionStorage.removeItem(GATEWAY_CHAT_SESSION_STORAGE_KEY);
}

/**
 * Runs once per full document load (new JS realm). When the server policy
 * does not preserve sessions on navigation, clears storage so the next
 * connection allocates a new `session_id`.
 *
 * @returns `useFreshQuery` — when true, the next WebSocket URL should include `fresh=true`.
 */
export async function ensureGatewayChatDocumentSession(): Promise<{ useFreshQuery: boolean }> {
  if (documentSessionPrepared) {
    return { useFreshQuery: false };
  }
  documentSessionPrepared = true;
  const preserve = await fetchPreserveSessionOnNavigation();
  if (preserve) {
    return { useFreshQuery: false };
  }
  clearGatewayChatSessionId();
  return { useFreshQuery: true };
}

/** Returns existing id or creates one and stores it (after optional clear). */
export function getOrCreateGatewayChatSessionId(): string {
  let id = sessionStorage.getItem(GATEWAY_CHAT_SESSION_STORAGE_KEY);
  if (!id) {
    id = generateUUID();
    sessionStorage.setItem(GATEWAY_CHAT_SESSION_STORAGE_KEY, id);
  }
  return id;
}

/**
 * Assign a new session id (after clear) for explicit "new session" without full page reload.
 */
export function allocateNewGatewayChatSessionId(): string {
  clearGatewayChatSessionId();
  const id = generateUUID();
  sessionStorage.setItem(GATEWAY_CHAT_SESSION_STORAGE_KEY, id);
  return id;
}
