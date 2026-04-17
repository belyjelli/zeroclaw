import rawConfig from "virtual:dev-mock-config";
import { isViteBunDevHackEnv } from "./viteBunDevHack";

/**
 * True during `vite serve` client bundle. Prefer this over `import.meta.env.DEV` alone —
 * some runtimes mis-set `NODE_ENV` / `DEV` while `import.meta.hot` is still defined.
 */
function isViteUiDev(): boolean {
  return import.meta.env.DEV || Boolean(import.meta.hot);
}

function envWebDevMock(): "on" | "off" | "unset" {
  const raw = import.meta.env.VITE_WEB_DEV_MOCK?.trim().toLowerCase();
  if (!raw) return "unset";
  if (raw === "0" || raw === "false" || raw === "off" || raw === "no") return "off";
  if (raw === "1" || raw === "true" || raw === "on" || raw === "yes") return "on";
  return "unset";
}

/** User opted out of dev mock via `VITE_WEB_DEV_MOCK` / env. */
export function isWebDevMockExplicitlyDisabled(): boolean {
  return envWebDevMock() === "off";
}

/**
 * When running the Vite dev server, `/health` may be missing (no gateway) or return HTML.
 * If dev mock is not explicitly disabled, still show the dashboard instead of stranding on pairing.
 */
export function allowDashboardWithoutGatewayHealth(): boolean {
  if (isWebDevMockExplicitlyDisabled()) return false;
  return (
    isViteBunDevHackEnv() ||
    import.meta.env.DEV ||
    Boolean(import.meta.hot)
  );
}

export interface WebDevMockSection {
  enabled?: boolean;
  /** Stored in localStorage when `inject_fake_bearer_token` is true (default false). */
  fake_bearer_token?: string;
  /** When true, writes `fake_bearer_token` into localStorage on first load so Bearer headers match. */
  inject_fake_bearer_token?: boolean;
  /** Body returned by GET /api/config in dev mock mode. */
  config_preview?: string;
  /** When true (default), stub WebSocket echoes each chat message. */
  websocket_echo?: boolean;
}

export type DevMockTomlRoot = {
  web_dev_mock?: WebDevMockSection;
};

export function getDevMockToml(): DevMockTomlRoot | null {
  if (!isViteUiDev()) return null;
  if (rawConfig === null || typeof rawConfig !== "object") return null;
  return rawConfig as DevMockTomlRoot;
}

/**
 * Local `vite` / `bun run dev` uses offline API + auth stubs by default so the UI runs
 * without a gateway. Opt out with `VITE_WEB_DEV_MOCK=0` or `[web_dev_mock] enabled = false`.
 */
export function isWebDevMockActive(): boolean {
  if (!isViteUiDev()) return false;

  const env = envWebDevMock();
  if (env === "off") return false;
  if (env === "on") return true;

  const tom = getDevMockToml()?.web_dev_mock;
  if (tom && tom.enabled === false) return false;
  if (tom && tom.enabled === true) return true;

  // No env override and no explicit toml → mock on (typical `bun run dev` without gateway).
  return true;
}

export function getWebDevMockSection(): WebDevMockSection | undefined {
  if (!isWebDevMockActive()) return undefined;
  return getDevMockToml()?.web_dev_mock ?? {};
}
