import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
    allowedHosts: true,
    proxy: {
      "/prospeccao": { target: "http://127.0.0.1:8000", changeOrigin: true, secure: false },
      "/empresas":   { target: "http://127.0.0.1:8000", changeOrigin: true, secure: false },
      "/credits":    { target: "http://127.0.0.1:8000", changeOrigin: true, secure: false },
      "/crm":        { target: "http://127.0.0.1:8000", changeOrigin: true, secure: false },
      "/mapa-calor": { target: "http://127.0.0.1:8000", changeOrigin: true, secure: false },
      "/webhooks":   { target: "http://127.0.0.1:8000", changeOrigin: true, secure: false },
      "/integrations": { target: "http://127.0.0.1:8000", changeOrigin: true, secure: false },
      "/sdr":        { target: "http://127.0.0.1:8000", changeOrigin: true, secure: false },
      "/pipeline":   { target: "http://127.0.0.1:8000", changeOrigin: true, secure: false },
      "/plans":      { target: "http://127.0.0.1:8000", changeOrigin: true, secure: false },
      "/subscribe":  { target: "http://127.0.0.1:8000", changeOrigin: true, secure: false },
      "/health":     { target: "http://127.0.0.1:8000", changeOrigin: true, secure: false },
      "/admin":      { target: "http://127.0.0.1:8000", changeOrigin: true, secure: false },
      "/docs":       { target: "http://127.0.0.1:8000", changeOrigin: true, secure: false },
      "/openapi.json": { target: "http://127.0.0.1:8000", changeOrigin: true, secure: false },
    },
  },
  plugins: [react(), mode === "development" && componentTagger()].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    chunkSizeWarningLimit: 700,
  },
}));
