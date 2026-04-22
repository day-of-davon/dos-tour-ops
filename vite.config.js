import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    // Proxy /api/* to Vercel dev server during local development
    // Run `vercel dev` instead of `vite` for full local stack
    port: 3000,
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ["react", "react-dom", "@supabase/supabase-js"],
        },
      },
    },
    chunkSizeWarningLimit: 700,
  },
});
