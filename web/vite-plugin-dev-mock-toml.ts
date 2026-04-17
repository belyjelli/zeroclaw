import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseToml } from "toml";
import type { Plugin } from "vite";

const VIRTUAL_ID = "\0virtual:dev-mock-config";
const RESOLVED_VIRTUAL = "virtual:dev-mock-config";

function resolveDevMockTomlPath(pluginDir: string): string | undefined {
  const candidates = [
    path.join(pluginDir, "dev-mock.toml"),
    path.join(process.cwd(), "dev-mock.toml"),
    path.join(process.cwd(), "web", "dev-mock.toml"),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  return undefined;
}

/**
 * Loads optional `dev-mock.toml` during `vite serve` only.
 * `vite build` always receives `null` (use Vite's command, not `NODE_ENV` — Bun may set
 * `NODE_ENV=production` while running the dev server).
 */
export function devMockTomlPlugin(): Plugin {
  const ctx = { isBuild: false };

  return {
    name: "dev-mock-toml",
    configResolved(config) {
      ctx.isBuild = config.command === "build";
    },
    resolveId(id) {
      if (id === RESOLVED_VIRTUAL) return VIRTUAL_ID;
      return undefined;
    },
    load(id) {
      if (id !== VIRTUAL_ID) return undefined;
      // `load` can run before `configResolved`; argv is reliable for `vite build`.
      const building =
        ctx.isBuild || (typeof process !== "undefined" && process.argv.includes("build"));
      if (building) {
        return "export default null";
      }
      const pluginDir = path.dirname(fileURLToPath(import.meta.url));
      const file = resolveDevMockTomlPath(pluginDir);
      if (!file) {
        return "export default null";
      }
      try {
        const raw = fs.readFileSync(file, "utf8");
        const parsed = parseToml(raw) as unknown;
        return `export default ${JSON.stringify(parsed)}`;
      } catch (e) {
        console.warn("[dev-mock] Failed to read or parse", file, e);
        return "export default null";
      }
    },
  };
}
