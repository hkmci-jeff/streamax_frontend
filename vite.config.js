import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// In dev, /api is proxied to the FastAPI backend (uvicorn on :8000).
// In production set VITE_API_BASE to the backend URL, e.g. https://api.example.com/api/v1
//
// GitHub Pages serves a project site at https://<user>.github.io/<repo>/, so every asset path
// needs that /<repo>/ prefix there. The deploy workflow sets BASE_PATH; locally it is "/".
export default defineConfig({
  base: process.env.BASE_PATH || "/",
  plugins: [react()],
  server: {
    port: 5173,
    proxy: { "/api": process.env.API_PROXY_TARGET || "http://127.0.0.1:8000" },
  },
});
