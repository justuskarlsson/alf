import path from "path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      workbox: {
        clientsClaim: true,
        skipWaiting: true,
        // Minimal precache — just the HTML shell + icons. All JS/CSS
        // loads via runtime caching so the SW install is instant.
        globPatterns: ["**/*.html", "**/*.png"],
        navigateFallback: "/index.html",
        runtimeCaching: [
          {
            urlPattern: /\.(?:js|css)$/,
            handler: "StaleWhileRevalidate",
            options: {
              cacheName: "assets",
              expiration: { maxEntries: 500, maxAgeSeconds: 60 * 60 * 24 * 30 },
            },
          },
        ],
      },
      manifest: {
        name: "Alf",
        short_name: "Alf",
        description: "AI coding workspace",
        theme_color: "#0d1117",
        background_color: "#0d1117",
        display: "standalone",
        start_url: "/",
        icons: [
          { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
        ],
      },
    }),
  ],
  resolve: {
    alias: {
      "@alf/types": path.resolve(__dirname, "../shared/types/index.ts"),
    },
  },
  server: {
    port: parseInt(process.env.FRONTEND_PORT ?? "5173", 10),
  },
});
