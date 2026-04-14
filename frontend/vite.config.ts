import path from "path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@alf/types": path.resolve(__dirname, "../shared/types/index.ts"),
    },
  },
  server: {
    port: parseInt(process.env.FRONTEND_PORT ?? "5173", 10),
  },
});
