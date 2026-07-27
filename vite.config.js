/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    proxy: {
      "/api": {
        target: "https://dos-tour-ops.vercel.app",
        changeOrigin: true,
        secure: true,
      },
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./test/setup.js"],
    include: ["src/**/*.test.{js,jsx}"],
    // The smoke test renders every tab; that's heavy. CI runners are ~2x slower
    // than local, so the 5s default is too tight. Give it real headroom.
    testTimeout: 20000,
    // Supabase env is mocked in tests; provide harmless defaults so any stray
    // import.meta.env read does not blow up module init.
    env: {
      VITE_SUPABASE_URL: "http://localhost:54321",
      VITE_SUPABASE_ANON_KEY: "test-anon-key",
    },
  },
});
