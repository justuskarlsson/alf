/**
 * Shared markdown renderer with mermaid diagram support.
 *
 * Wraps react-markdown + remark-gfm and intercepts ```mermaid code fences
 * to render them as inline SVG diagrams via MermaidBlock.
 */

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { MermaidBlock } from "./MermaidBlock";
import type { Components } from "react-markdown";

const components: Components = {
  code({ className, children, ...rest }) {
    // react-markdown passes fenced code language as className="language-xxx"
    const match = /language-(\w+)/.exec(className ?? "");
    const lang = match?.[1];

    if (lang === "mermaid") {
      const code = String(children).replace(/\n$/, "");
      return <MermaidBlock code={code} />;
    }

    // For all other code blocks, render normally
    return (
      <code className={className} {...rest}>
        {children}
      </code>
    );
  },
};

export function MarkdownRenderer({ children }: { children: string }) {
  return (
    <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
      {children}
    </ReactMarkdown>
  );
}
