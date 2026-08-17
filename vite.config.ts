import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    allowedHosts:['8b1b-186-6-48-244.ngrok-free.app']
    },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
