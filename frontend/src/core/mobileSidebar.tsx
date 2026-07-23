import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";

interface MobileSidebarCtx {
  open: boolean;
  setOpen: (open: boolean) => void;
  content: ReactNode | null;
  /** Panels register their sidebar here while mounted. */
  setContent: (content: ReactNode | null) => void;
}

const Ctx = createContext<MobileSidebarCtx | null>(null);

export function MobileSidebarProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [content, setContent] = useState<ReactNode | null>(null);

  // setOpen / setContent from useState are stable — keep them off the memo deps
  // so SidebarLayout can subscribe to setContent without looping on content updates.
  const value = useMemo<MobileSidebarCtx>(
    () => ({ open, setOpen, content, setContent }),
    [open, content],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useMobileSidebar(): MobileSidebarCtx | null {
  return useContext(Ctx);
}

/** Stable setter helpers for consumers that only need open/close. */
export function useMobileSidebarControls() {
  const ctx = useContext(Ctx);
  const toggle = useCallback(() => ctx?.setOpen(!ctx.open), [ctx]);
  return ctx ? { open: ctx.open, setOpen: ctx.setOpen, toggle, hasContent: ctx.content != null } : null;
}
