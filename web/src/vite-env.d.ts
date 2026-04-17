/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** `0` / `false` / `off` disables offline mocks when using `vite serve`. `1` / `true` forces them on. */
  readonly VITE_WEB_DEV_MOCK?: string;
  /** Set by `web/package.json` `dev` script — marks `bun run dev` for optional client hacks. */
  readonly VITE_ZEROCLAW_BUN_DEV?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare module "virtual:dev-mock-config" {
  const config: Record<string, unknown> | null;
  export default config;
}

declare module "*.toml?raw" {
  const src: string;
  export default src;
}
