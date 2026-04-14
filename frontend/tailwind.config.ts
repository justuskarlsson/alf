import type { Config } from "tailwindcss";
import typography from "@tailwindcss/typography";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      // CSS-variable-backed palette — use as bg-alf-bg, border-alf-border, etc.
      colors: {
        "alf-bg":      "var(--alf-bg)",
        "alf-surface": "var(--alf-surface)",
        "alf-border":  "var(--alf-border)",
        "alf-muted":   "var(--alf-muted)",
      },
    },
  },
  plugins: [typography],
} satisfies Config;
