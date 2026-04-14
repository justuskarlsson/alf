import type { Config } from "tailwindcss";
import typography from "@tailwindcss/typography";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Channel-based: support opacity modifiers (bg-alf-bg/80, border-alf-white/20)
        "alf-bg":    "rgb(var(--alf-bg-ch)    / <alpha-value>)",
        "alf-white": "rgb(var(--alf-white-ch) / <alpha-value>)",
        // Semantic fixed tokens: no opacity modifier (opacity is baked into the var)
        "alf-surface": "var(--alf-surface)",
        "alf-border":  "var(--alf-border)",
        "alf-muted":   "var(--alf-muted)",
      },
    },
  },
  plugins: [typography],
} satisfies Config;
