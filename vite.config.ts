import { defineConfig, loadEnv, type ProxyOptions } from "vite";
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

  // Mismo problema de Mixed Content que la API, pero para GlitchTip: el SDK de Sentry manda los
  // eventos directo al DSN (http://IP:8001), y el navegador los bloquea porque el front se sirve
  // por HTTPS. La solución oficial de Sentry es el modo "tunnel": el SDK envía los envelopes a una
  // ruta relativa propia (ver `tunnel` en src/lib/sentry.ts) y acá se reenvían al ingest real de
  // GlitchTip — la petición insegura vuelve a salir del servidor, no del navegador.
  const glitchtipDsn = env.VITE_GLITCHTIP_DSN ? new URL(env.VITE_GLITCHTIP_DSN) : null;
  const glitchtipProxy: Record<string, ProxyOptions> = glitchtipDsn
    ? {
        "/glitchtip-tunnel": {
          target: `${glitchtipDsn.protocol}//${glitchtipDsn.host}`,
          changeOrigin: true,
          secure: false,
          rewrite: () =>
            `/api${glitchtipDsn.pathname}/envelope/?sentry_version=7&sentry_key=${glitchtipDsn.username}&sentry_client=sentry.javascript.react`,
        },
      }
    : {};

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
        // Archivos subidos (ej. logo de plantillas, ver POST /plantillas/logo) — el backend los
        // sirve con `Cross-Origin-Resource-Policy: same-origin`, así que un <img src> cargado
        // directo contra la IP del backend es bloqueado por el navegador (ERR_BLOCKED_BY_RESPONSE.
        // NotSameOrigin) aunque la imagen exista y responda 200. Proxeándolo bajo el propio origen
        // del front (igual que /api) el navegador lo ve como same-origin y el CORP header ya no
        // aplica — no requiere ningún cambio del lado del backend.
        "/files": {
          target: apiTarget,
          changeOrigin: true,
          secure: false,
        },
        ...glitchtipProxy,
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
        "/files": {
          target: apiTarget,
          changeOrigin: true,
          secure: false,
        },
        ...glitchtipProxy,
      },
    },
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },
  };
});
