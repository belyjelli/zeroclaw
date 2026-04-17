// Runtime base path injected by the Rust gateway into index.html.
// Allows the SPA to work under a reverse-proxy path prefix.
// When running inside Tauri, the frontend is served from disk so basePath is
// empty and API calls target the gateway URL directly.

import { isTauri, tauriGatewayUrl } from './tauri';

declare global {
  interface Window {
    __ZEROCLAW_BASE__?: string;
  }
}

function spaPathPrefixNonTauri(): string {
  const injected = window.__ZEROCLAW_BASE__;
  const trimmed =
    typeof injected === 'string' && injected.trim().length > 0
      ? injected.trim().replace(/\/+$/, '')
      : '';

  // `??` skips `""` from the gateway; empty string must not hide `import.meta.env.BASE_URL`.
  const fromVite = String(import.meta.env.BASE_URL ?? '/')
    .replace(/\/+$/, '')
    .replace(/^\/+$/, '');

  let p = trimmed || fromVite || '';

  // Last resort: URL is our SPA path but prefix was lost (e.g. `__ZEROCLAW_BASE__=""`).
  // Use `/_app` or `/_app/...` only — not `/_application` etc.
  if (!p && typeof window !== 'undefined') {
    const path = window.location.pathname;
    if (path === '/_app' || path.startsWith('/_app/')) {
      p = '/_app';
    }
  }

  return p.replace(/\/+$/, '').replace(/^\/+$/, '');
}

/**
 * SPA path prefix (e.g. "/_app" under the Rust gateway, or Vite `base` during `bun run dev`).
 * Gateway may set `window.__ZEROCLAW_BASE__`; otherwise use Vite's `BASE_URL` so `/health`
 * and `/api/...` resolve under the same prefix as the UI.
 */
export const basePath: string = isTauri() ? '' : spaPathPrefixNonTauri();

/** Full origin for API requests. Empty when served by the gateway (same-origin). */
export const apiOrigin: string = isTauri() ? tauriGatewayUrl() : '';
