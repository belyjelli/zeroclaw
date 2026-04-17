import type { Plugin } from "vite";

/**
 * With `base: '/_app/'`, Vite serves modules under `/_app/src/...`. Some tooling, bookmarks,
 * or cached HTML hit `/src/...` at the host root — those would 404. Rewrite those requests
 * to the prefixed path so `bun run dev` can load the app from either URL shape.
 */
export function devRootModuleRewritePlugin(): Plugin {
  return {
    name: "zeroclaw-dev-root-module-rewrite",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use((req, _res, next) => {
        const raw = req.url ?? "";
        if (req.method !== "GET" && req.method !== "HEAD") {
          next();
          return;
        }
        const pathOnly = raw.split("?")[0] ?? "";
        if (pathOnly.startsWith("/_app/")) {
          next();
          return;
        }
        const needsPrefix =
          pathOnly.startsWith("/src/")
          || pathOnly.startsWith("/@vite/")
          || pathOnly.startsWith("/@react-refresh")
          || pathOnly.startsWith("/@id/");
        if (needsPrefix && raw.startsWith("/")) {
          req.url = `/_app${raw}`;
        }
        next();
      });
    },
  };
}
