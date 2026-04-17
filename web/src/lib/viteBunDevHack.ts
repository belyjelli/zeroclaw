/**
 * Set only by `web/package.json` → `"dev": "VITE_ZEROCLAW_BUN_DEV=1 …"`.
 * Lets runtime code know this process was started via `bun run dev` / `npm run dev`
 * from the web package (not `vite preview`, not the gateway).
 */
export function isViteBunDevHackEnv(): boolean {
  return import.meta.env.VITE_ZEROCLAW_BUN_DEV === "1";
}
