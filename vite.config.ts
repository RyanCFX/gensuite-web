import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");

  // El backend se sirve por HTTP en una IP. Si el front se expone por HTTPS
  // (ngrok, túnel, etc.) el navegador bloquea la petición por Mixed Content,
  // así que el front pide a una ruta relativa (/api/v1) y el dev server hace
  // de proxy hacia la IP — la petición insegura sale del servidor, no del navegador.
  const apiTarget = env.VITE_API_PROXY_TARGET || "http://207.180.235.134:4000";

  return {
    plugins: [react(), tailwindcss()],
    server: {
      host: true,
      // Permite cualquier host (ngrok cambia de subdominio en cada sesión).
      allowedHosts: true,
      proxy: {
        "/api": {
          target: apiTarget,
          changeOrigin: true,
          secure: false,
        },
      },
    },
    preview: {
      host: true,
      allowedHosts: true,
      proxy: {
        "/api": {
          target: apiTarget,
          changeOrigin: true,
          secure: false,
        },
      },
    },
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },
  };
});
