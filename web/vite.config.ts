import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";
import { bunDevHackPlugin } from "./vite-plugin-bun-dev-hack";
import { devRootModuleRewritePlugin } from "./vite-plugin-dev-root-module-rewrite";
import { devMockTomlPlugin } from "./vite-plugin-dev-mock-toml";

// Build-only config. The web dashboard is served by the Rust gateway
// via rust-embed. Run `npm run build` then `cargo build` to update.
export default defineConfig({
  base: "/_app/",
  // `@iarna/toml` references Node's `global` (e.g. create-date.js); browsers only have globalThis.
  define: {
    global: "globalThis",
  },
  plugins: [
    devRootModuleRewritePlugin(),
    bunDevHackPlugin(),
    devMockTomlPlugin(),
    react(),
    tailwindcss(),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    outDir: "dist",
  },
});
