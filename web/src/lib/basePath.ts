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

/** Reverse-proxy mount only (e.g. "/zc"). Never "/_app" — that is only for static assets. */
function gatewayInjectedPrefix(): string {
  const injected = window.__ZEROCLAW_BASE__;
  if (typeof injected !== 'string' || !injected.trim()) return '';
  return injected.trim().replace(/\/+$/, '');
}

/** Vite `base` (dev + built asset URLs under the gateway). */
function viteAppAssetDir(): string {
  const fromVite = String(import.meta.env.BASE_URL ?? '/')
    .replace(/\/+$/, '')
    .replace(/^\/+$/, '');
  return fromVite || '/_app';
}

function joinUrlPath(prefix: string, path: string): string {
  const p = prefix.replace(/\/+$/, '');
  const suffix = path.startsWith('/') ? path : `/${path}`;
  if (!p) return suffix;
  return `${p}${suffix}`;
}

function isViteUiDev(): boolean {
  return import.meta.env.DEV || Boolean(import.meta.hot);
}

/**
 * Prefix for gateway HTTP/WebSocket APIs (`/health`, `/pair`, `/api`, `/ws`, `/admin`).
 * Same-origin dashboard: empty. Behind a path-mounted gateway: `window.__ZEROCLAW_BASE__`.
 */
export const gatewayPublicPrefix: string = isTauri() ? '' : gatewayInjectedPrefix();

/**
 * Where built static files are mounted (`/_app` or `{prefix}/_app` after gateway HTML rewrite).
 */
export const staticAssetBase: string = isTauri()
  ? ''
  : joinUrlPath(gatewayPublicPrefix, viteAppAssetDir());

/**
 * React Router basename.
 * - Vite dev: `/_app` (matches `base: '/_app/'`).
 * - Production (gateway): SPA routes live at `/`, `/agent`, … — not under `/_app` (only assets are).
 * - Path-mounted gateway: `/zc` so routes are `/zc`, `/zc/agent`, …
 */
export const basePath: string = isTauri() ? '' : isViteUiDev() ? viteAppAssetDir() : gatewayPublicPrefix;

/** Full origin for API requests. Empty when served by the gateway (same-origin). */
export const apiOrigin: string = isTauri() ? tauriGatewayUrl() : '';
