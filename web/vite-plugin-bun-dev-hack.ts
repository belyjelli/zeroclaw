import type { Plugin } from "vite";

const JSON_HDR = { "Content-Type": "application/json" };

/**
 * `vite build` / `vite preview` never load this behavior — only `vite` dev server.
 * Stubs gateway public endpoints so `bun run dev` works without the Rust binary
 * even if the in-browser mock is turned off (`VITE_WEB_DEV_MOCK=0`).
 */
export function bunDevHackPlugin(): Plugin {
  return {
    name: "zeroclaw-bun-dev-hack",
    apply: "serve",
    configureServer(server) {
      // Only when started via `web/package.json` `"dev"` (sets `VITE_ZEROCLAW_BUN_DEV=1`).
      if (process.env.VITE_ZEROCLAW_BUN_DEV !== "1") return;

      server.middlewares.use((req, res, next) => {
        if (!req.url || req.method === "OPTIONS") {
          next();
          return;
        }
        const pathname = req.url.split("?")[0] ?? "";

        if (req.method === "GET" && (pathname === "/_app/health" || pathname === "/health")) {
          res.writeHead(200, JSON_HDR);
          res.end(JSON.stringify({ require_pairing: false, paired: true }));
          return;
        }

        if (req.method === "POST" && (pathname === "/_app/pair" || pathname === "/pair")) {
          res.writeHead(200, JSON_HDR);
          res.end(JSON.stringify({ token: "vite-bun-dev-hack-token" }));
          return;
        }

        if (req.method === "GET" && (pathname === "/_app/admin/paircode" || pathname === "/admin/paircode")) {
          res.writeHead(200, JSON_HDR);
          res.end(
            JSON.stringify({
              success: true,
              pairing_required: false,
              pairing_code: null,
              message: "vite-bun-dev-hack",
            }),
          );
          return;
        }

        next();
      });
    },
  };
}
