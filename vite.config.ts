import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { viteSingleFile } from "vite-plugin-singlefile";

// `vite build --mode single` inlines everything into one HTML file,
// which is what gets published as a shareable page.
export default defineConfig(({ mode }) => ({
  plugins: mode === "single" ? [react(), viteSingleFile()] : [react()],
  build: mode === "single" ? { outDir: "dist-single" } : undefined,
  test: {
    globals: true,
    environment: "node",
    // Browser tests in e2e/ run under Playwright, not Vitest.
    exclude: ["e2e/**", "node_modules/**"],
  },
}));
