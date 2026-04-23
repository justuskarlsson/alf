/**
 * MermaidBlock — renders a mermaid diagram definition as an inline SVG.
 *
 * Uses mermaid.render() which is async; the component shows a placeholder
 * while rendering, then swaps in the SVG via dangerouslySetInnerHTML.
 */

import { useEffect, useRef, useState } from "react";
import mermaid from "mermaid";

// Initialize mermaid once — dark theme to match the app.
mermaid.initialize({
  startOnLoad: false,
  theme: "dark",
  // Suppress mermaid's internal error rendering; we handle errors ourselves.
  suppressErrorRendering: true,
});

let idCounter = 0;

export function MermaidBlock({ code }: { code: string }) {
  const [svg, setSvg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    const id = `mermaid-${++idCounter}`;

    (async () => {
      try {
        const { svg: rendered } = await mermaid.render(id, code.trim());
        if (!cancelled) {
          setSvg(rendered);
          setError(null);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Mermaid render error");
          setSvg(null);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps — code is stable per mount

  if (error) {
    return (
      <div className="border border-red-500/30 rounded p-3 text-xs font-mono text-red-400 bg-red-950/20">
        <div className="text-red-500 mb-1">Mermaid error</div>
        <pre className="whitespace-pre-wrap">{error}</pre>
        <pre className="whitespace-pre-wrap mt-2 text-slate-500">{code}</pre>
      </div>
    );
  }

  if (!svg) {
    return (
      <div className="flex items-center justify-center py-4 text-slate-600 text-xs font-mono">
        Rendering diagram...
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="mermaid-diagram overflow-x-auto py-2 [&_svg]:max-w-full"
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}
