import type { Config } from "tailwindcss";
import typography from "@tailwindcss/typography";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // GitHub dark palette — direct hex, no CSS var dependency
        "alf-bg":      "#0d1117",   // canvas base
        "alf-canvas":  "#161b22",   // elevated (sidebar headers, panel labels)
        "alf-surface": "#1c2128",   // hover / selected bg
        "alf-border":  "#30363d",   // border default
        "alf-muted":   "#21262d",   // subtle dividers
      },
    },
  },
  plugins: [typography],
} satisfies Config;
