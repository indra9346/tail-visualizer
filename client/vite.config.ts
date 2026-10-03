import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

// Local dev note: run `vercel dev` from the repo root to serve both the
// built frontend and the /api/* Vercel functions together. If you prefer
// running `vite dev` standalone against a separately-running API (e.g.
// `vercel dev` on port 3000), this proxy forwards /api requests there.
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    proxy: {
      "/api": {
        target: "http://localhost:3000",
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: "dist",
    // Vendor libraries change rarely, so splitting them lets browsers cache them across deploys.
    rollupOptions: {
      output: {
        manualChunks: {
          react: ["react", "react-dom", "react-router-dom"],
          motion: ["framer-motion"],
          supabase: ["@supabase/supabase-js"],
        },
      },
    },
  },
});
